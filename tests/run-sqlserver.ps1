param([switch]$RaceOnly)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sqlserver-common.ps1')
$sqlRunSourceConfig=Read-SqlTestConfig
$sqlRunSchemaPath=Join-Path $PSScriptRoot '.build\sqlserver\schema.json'
if(-not (Test-Path -LiteralPath $sqlRunSchemaPath)){throw 'Exporte o schema antes de iniciar.'}
$sqlRunSchema=[IO.File]::ReadAllText($sqlRunSchemaPath)|ConvertFrom-Json
if($sqlRunSchema.sourceDatabase -cne $sqlRunSourceConfig['Banco']){throw 'Schema não corresponde ao banco configurado.'}
if($sqlRunSchema.collation -notmatch '^[A-Za-z0-9_]+$' -or [int]$sqlRunSchema.compatibility -notin @(100,110,120,130,140,150,160,170)){throw 'Opções de banco inválidas.'}
foreach($sqlRunBatch in $sqlRunSchema.batches){if($sqlRunBatch -match '(?im)^\s*USE\s|\bOPENROWSET\b|\bOPENQUERY\b' -or $sqlRunBatch.Contains('['+$sqlRunSourceConfig['Banco']+'].')){throw 'Schema contém referência externa.'}}
$sqlRunNonce=[Guid]::NewGuid().ToString('N')
$sqlRunName='AutoCusto_IT_'+(Get-Date -Format yyyyMMdd)+'_'+$sqlRunNonce.Substring(0,12)
$sqlRunQuoted='['+$sqlRunName+']'
$sqlRunCreated=$false;$sqlRunDatabaseId=$null;$sqlRunServerProcess=$null;$sqlRunTestConfig=$null;$sqlRunExit=1;$sqlRunCleaned=$false
$sqlRunMaster=New-SqlTestConnection $sqlRunSourceConfig 'master'
$sqlRunTestConnection=$null
$sqlRunTestRoot=Join-Path (Join-Path $env:LOCALAPPDATA 'AutoCusto\integration') $sqlRunNonce
try {
    $sqlRunPortProbe=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,19002)
    try{$sqlRunPortProbe.Start()}finally{$sqlRunPortProbe.Stop()}
    $sqlRunExists=@(Invoke-SqlTestQuery $sqlRunMaster 'SELECT database_id FROM sys.databases WHERE name=@name' @{name=$sqlRunName})
    if($sqlRunExists.Count){throw 'Nome de banco já existe; execução cancelada.'}
    Write-Output 'Criando banco temporário somente com a estrutura exportada; banco de origem não recebe gravações.'
    [void](Invoke-SqlTestQuery $sqlRunMaster ('CREATE DATABASE '+$sqlRunQuoted+' COLLATE '+$sqlRunSchema.collation))
    $sqlRunCreated=$true
    $sqlRunDatabaseId=@(Invoke-SqlTestQuery $sqlRunMaster 'SELECT database_id FROM sys.databases WHERE name=@name' @{name=$sqlRunName})[0].database_id
    $sqlRunTestConnection=New-SqlTestConnection $sqlRunSourceConfig $sqlRunName
    [void](Invoke-SqlTestQuery $sqlRunTestConnection "EXEC sys.sp_addextendedproperty @name=N'AutoCustoIntegrationRun', @value=@run" @{run=$sqlRunNonce})
    [void](Invoke-SqlTestQuery $sqlRunMaster ('ALTER DATABASE '+$sqlRunQuoted+' SET COMPATIBILITY_LEVEL = '+[int]$sqlRunSchema.compatibility))
    foreach($sqlRunBatch in $sqlRunSchema.batches){[void](Invoke-SqlTestQuery $sqlRunTestConnection $sqlRunBatch)}
    $sqlRunEmpty=@(Invoke-SqlTestQuery $sqlRunTestConnection 'SELECT (SELECT COUNT(*) FROM Usuarios)+(SELECT COUNT(*) FROM Medicamentos)+(SELECT COUNT(*) FROM Solicitacoes) AS Total')
    if($sqlRunEmpty[0].Total -ne 0){throw 'O banco de teste deve estar vazio.'}
    $sqlRunOriginal=New-SqlTestConnection $sqlRunSourceConfig $sqlRunSourceConfig['Banco']
    try{$sqlRunRoles=@(Invoke-SqlTestQuery $sqlRunOriginal 'SELECT IdCargo,NomeCargo FROM dbo.Cargos ORDER BY IdCargo')}finally{$sqlRunOriginal.Dispose()}
    if(($sqlRunRoles.IdCargo -join ',') -ne '1,2,3'){throw 'Cargos esperados não encontrados.'}
    [void](Invoke-SqlTestQuery $sqlRunTestConnection 'SET IDENTITY_INSERT dbo.Cargos ON')
    foreach($sqlRunRole in $sqlRunRoles){[void](Invoke-SqlTestQuery $sqlRunTestConnection 'INSERT INTO dbo.Cargos(IdCargo,NomeCargo) VALUES(@id,@nome)' @{id=$sqlRunRole.IdCargo;nome=$sqlRunRole.NomeCargo})}
    [void](Invoke-SqlTestQuery $sqlRunTestConnection 'SET IDENTITY_INSERT dbo.Cargos OFF')
    New-Item -ItemType Directory -Path $sqlRunTestRoot -Force|Out-Null
    $sqlRunTestConfig=Join-Path $sqlRunTestRoot 'config.ini'
    $sqlRunEmptyFile=[IO.File]::Open($sqlRunTestConfig,[IO.FileMode]::CreateNew);$sqlRunEmptyFile.Dispose()
    [IO.File]::SetAccessControl($sqlRunTestConfig,[IO.File]::GetAccessControl($sqlRunSourceConfig['ConfigPath']))
    $sqlRunIni=@('[Base]');$sqlRunSection=''
    foreach($sqlRunLine in [IO.File]::ReadAllLines($sqlRunSourceConfig['ConfigPath'])){
        if($sqlRunLine -match '^\s*\[([^\]]+)\]'){$sqlRunSection=$matches[1].Trim();continue}
        if($sqlRunSection -eq 'Base'){
            if($sqlRunLine -match '^\s*Banco\s*='){$sqlRunIni+=('Banco='+$sqlRunName)}else{$sqlRunIni+=$sqlRunLine}
        }
    }
    $sqlRunIni+=@('[Seguranca]','JwtSecret=chave-exclusiva-de-integracao-sqlserver-nao-usar-em-producao-2026')
    [IO.File]::WriteAllLines($sqlRunTestConfig,$sqlRunIni,(New-Object Text.UTF8Encoding($true)))
    $sqlRunCheckConfig=Read-SqlTestConfig $sqlRunTestConfig
    if($sqlRunCheckConfig['Banco'] -cne $sqlRunName){throw 'Configuração isolada inválida.'}
    $sqlRunManifestPath=Join-Path $PSScriptRoot '.build\sqlserver\run.json'
    [IO.File]::WriteAllText($sqlRunManifestPath,(@{database=$sqlRunName;runId=$sqlRunNonce;configPath=$sqlRunTestConfig;baseUrl='http://127.0.0.1:19002'}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    & (Join-Path $PSScriptRoot 'build-sqlserver-harness.ps1') *> (Join-Path $PSScriptRoot 'sqlserver-build.log')
    $sqlRunSavedConfig=[Environment]::GetEnvironmentVariable('AUTO_CUSTO_CONFIG','Process')
    $sqlRunSavedKey=[Environment]::GetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET','Process')
    $sqlRunSavedDatabase=[Environment]::GetEnvironmentVariable('AUTO_CUSTO_TEST_DATABASE','Process')
    $sqlRunSavedNonce=[Environment]::GetEnvironmentVariable('AUTO_CUSTO_TEST_RUN','Process')
    try{
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_CONFIG',$sqlRunTestConfig,'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET','chave-exclusiva-de-integracao-sqlserver-nao-usar-em-producao-2026','Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_TEST_DATABASE',$sqlRunName,'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_TEST_RUN',$sqlRunNonce,'Process')
        $sqlRunServerProcess=Start-Process -FilePath (Join-Path $PSScriptRoot '.build\sqlserver\SqlServerHarness.exe') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot '.build\sqlserver\server.log') -RedirectStandardError (Join-Path $PSScriptRoot '.build\sqlserver\server-error.log')
    }finally{
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_CONFIG',$sqlRunSavedConfig,'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET',$sqlRunSavedKey,'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_TEST_DATABASE',$sqlRunSavedDatabase,'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_TEST_RUN',$sqlRunSavedNonce,'Process')
    }
    if($RaceOnly){& node (Join-Path $PSScriptRoot 'sqlserver-integration.mjs') '--race-only'}else{& node (Join-Path $PSScriptRoot 'sqlserver-integration.mjs')}
    $sqlRunExit=$LASTEXITCODE
} finally {
    $sqlRunCleanupErrors=@();$sqlRunConfigRemoved=$false
    try {
        if($sqlRunServerProcess -and -not $sqlRunServerProcess.HasExited){Stop-Process -Id $sqlRunServerProcess.Id -ErrorAction Stop}
    } catch {$sqlRunCleanupErrors+=('Processo de teste: '+$_.Exception.GetType().Name)}
    try {if($sqlRunTestConnection){$sqlRunTestConnection.Dispose()}} catch {$sqlRunCleanupErrors+=('Conexão de teste: '+$_.Exception.GetType().Name)}
    # Remover o segredo temporário independentemente de qualquer falha no DROP.
    try {
        if($sqlRunTestConfig -and (Test-Path -LiteralPath $sqlRunTestConfig)){
            $sqlRunResolvedFile=[IO.Path]::GetFullPath($sqlRunTestConfig)
            $sqlRunResolvedRoot=[IO.Path]::GetFullPath($sqlRunTestRoot)+[IO.Path]::DirectorySeparatorChar
            if(-not $sqlRunResolvedFile.StartsWith($sqlRunResolvedRoot,[StringComparison]::OrdinalIgnoreCase) -or $sqlRunResolvedFile -eq $sqlRunSourceConfig['ConfigPath']){throw 'Limpeza de arquivo recusada.'}
            Remove-Item -LiteralPath $sqlRunResolvedFile
            Remove-Item -LiteralPath $sqlRunTestRoot
        }
        $sqlRunConfigRemoved=$true
    } catch {$sqlRunCleanupErrors+=('Configuração temporária: '+$_.Exception.GetType().Name)}
    try {if($sqlRunCreated){
        $sqlRunCurrent=@(Invoke-SqlTestQuery $sqlRunMaster 'SELECT database_id FROM sys.databases WHERE name=@name' @{name=$sqlRunName})
        if($sqlRunName -notmatch '^AutoCusto_IT_\d{8}_[a-f0-9]{12}$' -or $sqlRunName -eq $sqlRunSourceConfig['Banco'] -or $sqlRunCurrent.Count -ne 1 -or $sqlRunCurrent[0].database_id -ne $sqlRunDatabaseId){throw 'Limpeza recusada: identidade do banco não confere.'}
        $sqlRunCleanupCheck=New-SqlTestConnection $sqlRunSourceConfig $sqlRunName
        try{$sqlRunMarker=@(Invoke-SqlTestQuery $sqlRunCleanupCheck "SELECT CAST(value AS nvarchar(100)) AS RunId FROM sys.extended_properties WHERE class=0 AND name='AutoCustoIntegrationRun'")}finally{$sqlRunCleanupCheck.Dispose()}
        if($sqlRunMarker.Count -ne 1 -or $sqlRunMarker[0].RunId -cne $sqlRunNonce){throw 'Limpeza recusada: marcador da rodada não confere.'}
        [void](Invoke-SqlTestQuery $sqlRunMaster ('ALTER DATABASE '+$sqlRunQuoted+' SET SINGLE_USER WITH ROLLBACK IMMEDIATE'))
        [void](Invoke-SqlTestQuery $sqlRunMaster ('DROP DATABASE '+$sqlRunQuoted))
        $sqlRunCleaned=$true
        Write-Output 'Banco temporário desta rodada removido; banco de origem preservado.'
    }} catch {$sqlRunCleanupErrors+=('Banco temporário '+$sqlRunName+': '+$_.Exception.GetType().Name)}
    try {$sqlRunMaster.Dispose()} catch {$sqlRunCleanupErrors+=('Conexão principal: '+$_.Exception.GetType().Name)}
    if($sqlRunCleanupErrors.Count){$sqlRunExit=1;$sqlRunCleanupErrors|ForEach-Object {Write-Output ('Limpeza pendente: '+$_)}}
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.build\sqlserver\cleanup.json'),(@{database=$sqlRunName;removed=$sqlRunCleaned;temporaryConfigRemoved=$sqlRunConfigRemoved;sourceWritesPerformed=$false;cleanupErrors=$sqlRunCleanupErrors;exitCode=$sqlRunExit}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
}
exit $sqlRunExit
