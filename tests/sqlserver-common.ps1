function Read-SqlTestConfig([string]$ConfigPath) {
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath=[Environment]::GetEnvironmentVariable('AUTO_CUSTO_CONFIG') }
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath=Join-Path $env:LOCALAPPDATA 'AutoCusto\config.ini' }
    $base=@{}; $section=''
    foreach ($line in [IO.File]::ReadAllLines($ConfigPath)) {
        if ($line -match '^\s*\[([^\]]+)\]') { $section=$matches[1].Trim(); continue }
        if ($section -eq 'Base' -and $line -match '^\s*([^;=]+)=(.*)$') {
            $key=$matches[1].Trim(); $value=$matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value=$value.Substring(1,$value.Length-2) }
            $base[$key]=$value
        }
    }
    foreach($key in @('Servidor','Banco','Usuario','Senha')) { if ([string]::IsNullOrWhiteSpace($base[$key])) { throw ('Campo de conexão ausente: '+$key) } }
    if (-not $base.ContainsKey('Porta')) { $base['Porta']='1433' }
    $base['ConfigPath']=[IO.Path]::GetFullPath($ConfigPath)
    return $base
}
function New-SqlTestConnection($Config,[string]$Database) {
    $builder=New-Object Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source']=$Config['Servidor']
    if ($Config['Porta']) { $builder['Data Source']+=','+$Config['Porta'] }
    $builder['Initial Catalog']=$Database
    $builder['User ID']=$Config['Usuario']; $builder['Password']=$Config['Senha']
    $builder['Connect Timeout']=8; $builder['Pooling']=$false
    $builder['Application Name']='AutoCusto integration tests'
    $connection=New-Object Data.SqlClient.SqlConnection($builder.ConnectionString)
    $connection.Open()
    return $connection
}
function Invoke-SqlTestQuery($Connection,[string]$Sql,$Parameters=@{}) {
    $command=$Connection.CreateCommand(); $command.CommandText=$Sql; $command.CommandTimeout=30
    try {
        foreach($key in $Parameters.Keys) { [void]$command.Parameters.AddWithValue('@'+$key,$(if($null -eq $Parameters[$key]){[DBNull]::Value}else{$Parameters[$key]})) }
        $reader=$command.ExecuteReader()
        try {
            do {
                while($reader.Read()) {
                    $row=[ordered]@{}
                    for($index=0;$index -lt $reader.FieldCount;$index++) { $row[$reader.GetName($index)]=$(if($reader.IsDBNull($index)){$null}else{$reader.GetValue($index)}) }
                    [pscustomobject]$row
                }
            } while($reader.NextResult())
        } finally { $reader.Dispose() }
    } finally { $command.Dispose() }
}
