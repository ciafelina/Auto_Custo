$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sqlserver-common.ps1')
$schemaConfig=Read-SqlTestConfig
$schemaSmoDirectory='C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE'
$schemaResolver=[ResolveEventHandler]{
    param($sender,$eventArgs)
    $assemblyName=(New-Object Reflection.AssemblyName($eventArgs.Name)).Name
    $assemblyPath=Join-Path $schemaSmoDirectory ($assemblyName+'.dll')
    if(-not (Test-Path -LiteralPath $assemblyPath)) { $assemblyPath=Join-Path (Join-Path $schemaSmoDirectory 'VSFinalizerDependencies') ($assemblyName+'.dll') }
    if(Test-Path -LiteralPath $assemblyPath){return [Reflection.Assembly]::LoadFrom($assemblyPath)}
    return $null
}
[AppDomain]::CurrentDomain.add_AssemblyResolve($schemaResolver)
$schemaSmoConnection=$null
try {
    foreach($assemblyName in @('Microsoft.SqlServer.ConnectionInfo','Microsoft.SqlServer.Management.Sdk.Sfc','Microsoft.SqlServer.SqlEnum','Microsoft.SqlServer.Smo')) {
        [void][Reflection.Assembly]::LoadFrom((Join-Path $schemaSmoDirectory ($assemblyName+'.dll')))
    }
    $schemaBuilder=New-Object Data.SqlClient.SqlConnectionStringBuilder
    $schemaBuilder['Data Source']=$schemaConfig['Servidor']
    if($schemaConfig['Porta']){$schemaBuilder['Data Source']+=','+$schemaConfig['Porta']}
    $schemaBuilder['Initial Catalog']=$schemaConfig['Banco']
    $schemaBuilder['User ID']=$schemaConfig['Usuario'];$schemaBuilder['Password']=$schemaConfig['Senha']
    $schemaBuilder['Connect Timeout']=8;$schemaBuilder['Encrypt']=$false
    $schemaBuilder['Application Name']='AutoCusto schema-only export'
    $schemaSmoConnection=New-Object Microsoft.SqlServer.Management.Common.ServerConnection
    $schemaSmoConnection.ConnectionString=$schemaBuilder.ConnectionString
    $schemaServer=New-Object Microsoft.SqlServer.Management.Smo.Server($schemaSmoConnection)
    $schemaDatabase=$schemaServer.Databases[$schemaConfig['Banco']]
    if($null -eq $schemaDatabase){throw 'Banco de origem não encontrado.'}
    $schemaScripter=New-Object Microsoft.SqlServer.Management.Smo.Scripter($schemaServer)
    $schemaScripter.Options.ScriptData=$false
    $schemaScripter.Options.ScriptSchema=$true
    $schemaScripter.Options.WithDependencies=$false
    $schemaScripter.Options.DriAll=$true
    $schemaScripter.Options.Indexes=$true
    $schemaScripter.Options.Triggers=$true
    $schemaScripter.Options.IncludeDatabaseContext=$false
    $schemaScripter.Options.SchemaQualify=$true
    $schemaScripter.Options.SchemaQualifyForeignKeysReferences=$true
    $schemaScripter.Options.NoFileGroup=$true
    $schemaScripter.Options.ScriptOwner=$false
    $schemaScripter.Options.Permissions=$false
    $schemaObjects=New-Object 'System.Collections.Generic.List[Microsoft.SqlServer.Management.Sdk.Sfc.Urn]'
    foreach($tableName in @('Cargos','Usuarios','Medicamentos','Solicitacoes','Interessados','Documentos','Arquivo')) {
        $table=$schemaDatabase.Tables[$tableName,'dbo']
        if($null -eq $table){throw ('Tabela ausente: '+$tableName)}
        $schemaObjects.Add($table.Urn)
    }
    foreach($procedureName in @('sp_ObterDashboardPaciente','sp_ObterDashboardAdmin')) {
        $procedure=$schemaDatabase.StoredProcedures[$procedureName,'dbo']
        if($null -eq $procedure){throw ('Procedure ausente: '+$procedureName)}
        $schemaObjects.Add($procedure.Urn)
    }
    $schemaBatches=@($schemaScripter.Script($schemaObjects.ToArray()))
    foreach($batch in $schemaBatches) {
        if($batch -match '(?im)^\s*USE\s|\bOPENROWSET\b|\bOPENQUERY\b' -or $batch.Contains('['+$schemaConfig['Banco']+'].')) {
            throw 'Schema contém referência externa/contexto de banco que precisa de revisão.'
        }
    }
    $schemaOutput=Join-Path $PSScriptRoot '.build\sqlserver\schema.json'
    $schemaDocument=[ordered]@{sourceDatabase=$schemaConfig['Banco'];collation=$schemaDatabase.Collation;compatibility=[int]$schemaDatabase.CompatibilityLevel;batches=$schemaBatches}
    [IO.File]::WriteAllText($schemaOutput,($schemaDocument|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    Write-Output ('Schema exportado sem dados: 7 tabelas, 2 procedures, '+$schemaBatches.Count+' lotes. Origem não alterada.')
} finally {
    if($null -ne $schemaSmoConnection){$schemaSmoConnection.Disconnect()}
    [AppDomain]::CurrentDomain.remove_AssemblyResolve($schemaResolver)
}
