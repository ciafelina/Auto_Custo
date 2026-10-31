$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sqlserver-common.ps1')
$platformConfig=Read-SqlTestConfig
$platformConnection=New-SqlTestConnection $platformConfig $platformConfig['Banco']
try {
    Invoke-SqlTestQuery $platformConnection @'
SELECT CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS Edicao,
       CAST(SERVERPROPERTY('EngineEdition') AS int) AS EngineEdition,
       IS_SRVROLEMEMBER('sysadmin') AS Sysadmin,
       CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS nvarchar(128)) AS CollationBanco;
SELECT name AS NomeObjeto,type_desc AS Tipo FROM sys.objects WHERE is_ms_shipped=0 AND type IN ('U','P','V','FN','IF','TF','SN','TR') ORDER BY type,name;
SELECT IdCargo,NomeCargo FROM dbo.Cargos ORDER BY IdCargo;
SELECT name AS ProcedureNome,OBJECT_DEFINITION(object_id) AS Definicao
FROM sys.procedures WHERE name IN ('sp_ObterDashboardPaciente','sp_ObterDashboardAdmin');
'@ | ForEach-Object { $_ | ConvertTo-Json -Compress }
} finally { $platformConnection.Dispose() }
