# Somente diagnóstico: não executa INSERT/UPDATE/DELETE/DDL nem mostra credenciais.
$ErrorActionPreference = 'Stop'
$sqlProbeConfigPath = [Environment]::GetEnvironmentVariable('AUTO_CUSTO_CONFIG')
if ([string]::IsNullOrWhiteSpace($sqlProbeConfigPath)) {
    $sqlProbeConfigPath = Join-Path $env:LOCALAPPDATA 'AutoCusto\config.ini'
}
$sqlProbeBase = @{}
$sqlProbeSection = ''
try {
    foreach ($sqlProbeLine in [IO.File]::ReadAllLines($sqlProbeConfigPath)) {
        if ($sqlProbeLine -match '^\s*\[([^\]]+)\]') { $sqlProbeSection = $matches[1]; continue }
        if ($sqlProbeSection -eq 'Base' -and $sqlProbeLine -match '^\s*([^;=]+)=(.*)$') {
            $sqlProbeValue = $matches[2].Trim()
            if ($sqlProbeValue.Length -ge 2 -and (($sqlProbeValue.StartsWith('"') -and $sqlProbeValue.EndsWith('"')) -or ($sqlProbeValue.StartsWith("'") -and $sqlProbeValue.EndsWith("'")))) {
                $sqlProbeValue = $sqlProbeValue.Substring(1, $sqlProbeValue.Length - 2)
            }
            $sqlProbeBase[$matches[1].Trim()] = $sqlProbeValue
        }
    }
} catch {
    Write-Output ('Não foi possível ler a configuração externa (' + $_.Exception.GetType().Name + ').')
    exit 2
}
foreach ($sqlProbeRequired in @('Servidor','Banco','Usuario','Senha')) {
    if ([string]::IsNullOrWhiteSpace($sqlProbeBase[$sqlProbeRequired])) {
        Write-Output ('Configuração incompleta: campo ' + $sqlProbeRequired + ' ausente.')
        exit 2
    }
}
Write-Output 'Configuração externa lida; valores de usuário/senha/chave não serão exibidos.'
try {
    Get-Service -Name 'MSSQL*','SQLBrowser' -ErrorAction SilentlyContinue |
        Select-Object Name,Status | Format-Table -AutoSize | Out-String | Write-Output
} catch { Write-Output 'Consulta de serviços indisponível; diagnóstico SQL continua.' }
try {
    if (Get-Command Get-OdbcDriver -ErrorAction SilentlyContinue) {
        Get-OdbcDriver | Where-Object { $_.Name -match 'SQL Server|SQL Native' } |
            Select-Object Name,Platform | Format-Table -AutoSize | Out-String | Write-Output
    }
} catch { Write-Output 'Consulta de drivers indisponível; diagnóstico SQL continua.' }
if (-not $sqlProbeBase.ContainsKey('Porta')) {
    $sqlProbeBase['Porta'] = '1433'
}
$sqlProbeBuilder = New-Object Data.SqlClient.SqlConnectionStringBuilder
$sqlProbeBuilder['Data Source'] = $sqlProbeBase['Servidor']
if ($sqlProbeBase['Porta']) { $sqlProbeBuilder['Data Source'] += ',' + $sqlProbeBase['Porta'] }
$sqlProbeBuilder['Initial Catalog'] = $sqlProbeBase['Banco']
$sqlProbeBuilder['User ID'] = $sqlProbeBase['Usuario']
$sqlProbeBuilder['Password'] = $sqlProbeBase['Senha']
$sqlProbeBuilder['Connect Timeout'] = 6
$sqlProbeBuilder['Pooling'] = $false
$sqlProbeBuilder['Application Name'] = 'AutoCusto read-only preflight'
$sqlProbeConnection = New-Object Data.SqlClient.SqlConnection($sqlProbeBuilder.ConnectionString)
try {
    $sqlProbeConnection.Open()
    Write-Output 'Conexão SQL Server aberta.'
    $sqlProbeCommand = $sqlProbeConnection.CreateCommand()
    $sqlProbeCommand.CommandTimeout = 8
    $sqlProbeCommand.CommandText = @'
SELECT DB_NAME() AS Banco, CAST(SERVERPROPERTY('ProductVersion') AS varchar(50)) AS Versao,
       DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS Gravacao,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS PodeLerDefinicoes,
       HAS_PERMS_BY_NAME(NULL, 'SERVER', 'CREATE ANY DATABASE') AS PodeCriarBanco;
SELECT s.name AS Esquema, t.name AS Tabela, c.name AS Coluna, ty.name AS Tipo,
       c.max_length AS Tamanho, c.is_nullable AS AceitaNull, c.is_identity AS Identidade,
       CASE WHEN c.default_object_id=0 THEN 0 ELSE 1 END AS PossuiPadrao
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id=s.schema_id
JOIN sys.columns c ON t.object_id=c.object_id
JOIN sys.types ty ON c.user_type_id=ty.user_type_id
WHERE t.name IN ('Usuarios','Medicamentos','Solicitacoes','Cargo','Cargos','Documentos','Interessados','Arquivo')
ORDER BY s.name,t.name,c.column_id;
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS Esquema, OBJECT_NAME(parent_object_id) AS Tabela,
       name AS Restricao, OBJECT_NAME(referenced_object_id) AS Referencia, delete_referential_action_desc AS Exclusao
FROM sys.foreign_keys
WHERE OBJECT_NAME(parent_object_id) IN ('Usuarios','Medicamentos','Solicitacoes');
SELECT name AS ProcedureNome, CASE WHEN OBJECT_DEFINITION(object_id) IS NULL THEN 0 ELSE 1 END AS DefinicaoDisponivel
FROM sys.procedures WHERE name IN ('sp_ObterDashboardPaciente','sp_ObterDashboardAdmin');
SELECT OBJECT_NAME(parent_id) AS Tabela, name AS TriggerNome, is_disabled AS Desabilitado
FROM sys.triggers WHERE OBJECT_NAME(parent_id) IN ('Usuarios','Medicamentos','Solicitacoes');
'@
    $sqlProbeReader = $sqlProbeCommand.ExecuteReader()
    do {
        while ($sqlProbeReader.Read()) {
            $sqlProbeRow = [ordered]@{}
            for ($sqlProbeIndex=0; $sqlProbeIndex -lt $sqlProbeReader.FieldCount; $sqlProbeIndex++) {
                $sqlProbeRow[$sqlProbeReader.GetName($sqlProbeIndex)] = if ($sqlProbeReader.IsDBNull($sqlProbeIndex)) { $null } else { $sqlProbeReader.GetValue($sqlProbeIndex) }
            }
            Write-Output ($sqlProbeRow | ConvertTo-Json -Compress)
        }
    } while ($sqlProbeReader.NextResult())
    $sqlProbeReader.Close()
    Write-Output 'Diagnóstico concluído: somente metadados; nenhum registro de negócio lido ou alterado.'
} catch {
    $sqlProbeError = $_.Exception
    while ($sqlProbeError.InnerException) { $sqlProbeError = $sqlProbeError.InnerException }
    if ($sqlProbeError -is [Data.SqlClient.SqlException]) {
        foreach ($sqlProbeDetail in $sqlProbeError.Errors) {
            Write-Output ('Conexão/consulta recusada: SQL número=' + $sqlProbeDetail.Number + '; estado=' + $sqlProbeDetail.State + '; classe=' + $sqlProbeDetail.Class + '.')
        }
    } else {
        Write-Output ('Diagnóstico indisponível (' + $sqlProbeError.GetType().Name + ').')
    }
    Write-Output 'Nenhuma alteração foi realizada.'
    exit 1
} finally { $sqlProbeConnection.Dispose() }
