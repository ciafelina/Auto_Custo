param([Parameter(Mandatory=$true)][string]$ConfigPath,[Parameter(Mandatory=$true)][string]$ExpectedDatabase,[Parameter(Mandatory=$true)][string]$RunId)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'sqlserver-common.ps1')
$bridgeConfig=Read-SqlTestConfig $ConfigPath
if($ExpectedDatabase -notmatch '^AutoCusto_IT_\d{8}_[a-f0-9]{12}$' -or $bridgeConfig['Banco'] -cne $ExpectedDatabase){throw 'Bridge restrita ao banco isolado desta rodada.'}
$bridgeConnection=New-SqlTestConnection $bridgeConfig $ExpectedDatabase
try {
    $bridgeMarker=@(Invoke-SqlTestQuery $bridgeConnection "SELECT CAST(value AS nvarchar(100)) AS RunId FROM sys.extended_properties WHERE class=0 AND name='AutoCustoIntegrationRun'")
    if($bridgeMarker.Count -ne 1 -or $bridgeMarker[0].RunId -cne $RunId){throw 'Marcador do banco de integração inválido.'}
    [Console]::WriteLine((@{ready=$true;database=$ExpectedDatabase}|ConvertTo-Json -Compress))
    # Somente SQL local fixo. O processo cliente não pode fornecer SQL arbitrário.
    $bridgeOperations=@{
        schema='SELECT (SELECT COUNT(*) FROM sys.tables WHERE name IN (''Usuarios'',''Medicamentos'',''Solicitacoes'',''Cargos'',''Interessados'',''Documentos'',''Arquivo'')) AS Tabelas,(SELECT COUNT(*) FROM sys.foreign_keys) AS Chaves,(SELECT compatibility_level FROM sys.databases WHERE database_id=DB_ID()) AS Compatibilidade'
        counts='SELECT (SELECT COUNT(*) FROM dbo.Usuarios) AS Usuarios,(SELECT COUNT(*) FROM dbo.Medicamentos) AS Medicamentos,(SELECT COUNT(*) FROM dbo.Solicitacoes) AS Solicitacoes'
        user='SELECT idUsuarioCPF,nomeUsuario,email,IdCargo,status,telefone,endereco FROM dbo.Usuarios WHERE idUsuarioCPF=@cpf'
        role='UPDATE dbo.Usuarios SET IdCargo=@cargo WHERE idUsuarioCPF=@cpf'
        userStatus='UPDATE dbo.Usuarios SET status=@status WHERE idUsuarioCPF=@cpf'
        med='SELECT * FROM dbo.Medicamentos WHERE idMedicamento=@id'
        medByName='SELECT * FROM dbo.Medicamentos WHERE nome=@nome'
        stock='UPDATE dbo.Medicamentos SET quantidadeEstoque=@estoque WHERE idMedicamento=@id'
        request='SELECT * FROM dbo.Solicitacoes WHERE idSolicitacao=@id'
        requestsForMed='SELECT * FROM dbo.Solicitacoes WHERE IdMedicamento=@id ORDER BY idSolicitacao'
        requestsForUser='SELECT * FROM dbo.Solicitacoes WHERE idUsuarioCPF=@cpf ORDER BY idSolicitacao'
        countsForUser='SELECT COUNT(*) AS Total,COALESCE(SUM(CASE WHEN status=''Pendente'' THEN 1 ELSE 0 END),0) AS Pendentes,COALESCE(SUM(CASE WHEN status=''Aprovado'' THEN 1 ELSE 0 END),0) AS Aprovados,COALESCE(SUM(CASE WHEN status IN (''Cancelado'',''Reprovado'') THEN 1 ELSE 0 END),0) AS Reprovados FROM dbo.Solicitacoes WHERE idUsuarioCPF=@cpf'
        seedRequest='INSERT INTO dbo.Solicitacoes(idUsuarioCPF,IdMedicamento,quantidade,status,observacao) OUTPUT inserted.idSolicitacao VALUES(@cpf,@med,@qtd,@status,@obs)'
        note='UPDATE dbo.Solicitacoes SET observacao=@obs WHERE idSolicitacao=@id'
        failInsert='CREATE TRIGGER dbo.AutoCusto_IT_FailInsert ON dbo.Solicitacoes INSTEAD OF INSERT AS BEGIN THROW 51001,''Falha ficticia para conferir rollback'',1; END'
        allowInsert='DROP TRIGGER dbo.AutoCusto_IT_FailInsert'
        failStock='CREATE TRIGGER dbo.AutoCusto_IT_FailStock ON dbo.Medicamentos AFTER UPDATE AS BEGIN THROW 51002,''Falha ficticia para conferir rollback'',1; END'
        allowStock='DROP TRIGGER dbo.AutoCusto_IT_FailStock'
        documents='SELECT idDoc,tipo,idInteressado,idUsuarioCPF FROM dbo.Documentos ORDER BY idDoc'
        interested='SELECT idInteressado,documentoInteressado,nomeInteressado FROM dbo.Interessados ORDER BY idInteressado'
        archive='SELECT prontuario,caixa,prateleiraCorredor,idDoc,idUsuarioCPF FROM dbo.Arquivo ORDER BY idDoc'
    }
    while($null -ne ($bridgeLine=[Console]::ReadLine())) {
        $bridgeInput=$null
        try {
            $bridgeInput=$bridgeLine|ConvertFrom-Json
            if($bridgeInput.sql -or -not $bridgeOperations.ContainsKey([string]$bridgeInput.operation)){throw 'Operação fora da lista permitida.'}
            $bridgeParameters=@{}
            if($bridgeInput.parameters){foreach($property in $bridgeInput.parameters.PSObject.Properties){$bridgeParameters[$property.Name]=$property.Value}}
            $bridgeRows=@(Invoke-SqlTestQuery $bridgeConnection $bridgeOperations[$bridgeInput.operation] $bridgeParameters)
            [Console]::WriteLine((@{id=$bridgeInput.id;ok=$true;rows=$bridgeRows}|ConvertTo-Json -Depth 16 -Compress))
        } catch {
            $bridgeError=$_.Exception
            while($bridgeError.InnerException){$bridgeError=$bridgeError.InnerException}
            [Console]::WriteLine((@{id=$bridgeInput.id;ok=$false;error=$bridgeError.GetType().Name;number=$(if($bridgeError -is [Data.SqlClient.SqlException]){$bridgeError.Number}else{0})}|ConvertTo-Json -Compress))
        }
    }
} finally {$bridgeConnection.Dispose()}
