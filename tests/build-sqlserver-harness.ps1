# Compila uma API de integração isolada com o provider MSSQL real.
# Não inicia o servidor nem conecta/altera o banco.
$ErrorActionPreference = 'Stop'
$sqlBuildRoot = Split-Path $PSScriptRoot -Parent
$sqlBuildOutput = Join-Path $PSScriptRoot '.build\sqlserver'
New-Item -ItemType Directory -Force -Path $sqlBuildOutput | Out-Null
$sqlBuildProviderDirectory=Join-Path $sqlBuildOutput 'provider'
New-Item -ItemType Directory -Force -Path $sqlBuildProviderDirectory|Out-Null
$sqlBuildProvider=[IO.File]::ReadAllText((Join-Path $sqlBuildRoot 'providers\Conexao.pas'))
$sqlBuildProvider=$sqlBuildProvider.Replace('    class function ObterConexao: TFDConnection;',"    class function ObterConexao: TFDConnection;`r`n    class procedure ObservarErro(ASender, AInitiator: TObject; var AException: Exception);")
$sqlBuildObserver=@'
class procedure TProvedorConexao.ObservarErro(ASender, AInitiator: TObject; var AException: Exception);
var E: EFDDBEngineException; I: Integer;
begin
  if AException is EFDDBEngineException then
  begin
    E := EFDDBEngineException(AException);
    for I := 0 to E.ErrorCount - 1 do
      Writeln(Format('SQL_IT_ERROR kind=%d code=%d', [Ord(E.Kind), E.Errors[I].ErrorCode]));
    Flush(Output);
  end;
end;

'@
$sqlBuildProvider=$sqlBuildProvider.Replace('implementation',"implementation`r`n`r`n"+$sqlBuildObserver)
$sqlBuildProvider=$sqlBuildProvider.Replace('    Result := LConexao;',"    LConexao.OnError := TProvedorConexao.ObservarErro;`r`n    Result := LConexao;")
$sqlBuildProviderPath=Join-Path $sqlBuildProviderDirectory 'Conexao.pas'
[IO.File]::WriteAllText($sqlBuildProviderPath,$sqlBuildProvider,(New-Object Text.UTF8Encoding($true)))
$sqlBuildSource = [IO.File]::ReadAllText((Join-Path $sqlBuildRoot 'ProjetoFaculdade.dpr'))
$sqlBuildSource = $sqlBuildSource.Replace('program ProjetoFaculdade;', 'program SqlServerHarness;').Replace('{$R *.res}', '')
$sqlBuildSource = $sqlBuildSource.Replace('  Horse,', "  Horse,`r`n  FireDAC.Comp.Client, FireDAC.Stan.Error,")
$sqlBuildSource = [regex]::Replace($sqlBuildSource, "in '([^']+)'", {
    param($sqlBuildMatch)
    if($sqlBuildMatch.Groups[1].Value -eq 'providers\Conexao.pas'){"in '"+$sqlBuildProviderPath+"'"}else{"in '" + (Join-Path $sqlBuildRoot $sqlBuildMatch.Groups[1].Value) + "'"}
})
$sqlBuildSource = $sqlBuildSource.Replace('THorse.Use(CORS);', @'
THorse.Use(procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
      begin
        Res.RawWebResponse.SetCustomHeader('X-AutoCusto-Integration', 'sqlserver');
        Next();
      end);
    THorse.Use(CORS);
'@)
$sqlBuildSource = $sqlBuildSource.Replace('THorse.Listen(9000,', "THorse.Listen(19002, '127.0.0.1',")
$sqlBuildSource = $sqlBuildSource.Replace('Porta de Escuta   : 9000','Porta de Escuta   : 19002')
$sqlBuildGuard=@'
procedure VerificarBancoDeIntegracao;
var C: TFDConnection; Q: TFDQuery;
begin
  C := TProvedorConexao.ObterConexao;
  try
    Q := TFDQuery.Create(nil);
    try
      Q.Connection := C;
      Q.SQL.Text := 'SELECT DB_NAME() AS Banco, (SELECT CAST(value AS nvarchar(100)) FROM sys.extended_properties WHERE class=0 AND name=''AutoCustoIntegrationRun'') AS RunId';
      try
        Q.Open;
      except
        on E: EFDDBEngineException do
        begin
          Writeln('Falha MSSQL de integracao: ', E.ClassName, '; kind=', Ord(E.Kind));
          if E.ErrorCount > 0 then Writeln('Codigo do driver: ', E.Errors[0].ErrorCode);
          raise;
        end;
      end;
      if (GetEnvironmentVariable('AUTO_CUSTO_TEST_DATABASE') = '') or
         (Copy(Q.FieldByName('Banco').AsString, 1, 13) <> 'AutoCusto_IT_') or
         (Q.FieldByName('Banco').AsString <> GetEnvironmentVariable('AUTO_CUSTO_TEST_DATABASE')) or
         (GetEnvironmentVariable('AUTO_CUSTO_TEST_RUN') = '') or
         (Q.FieldByName('RunId').AsString <> GetEnvironmentVariable('AUTO_CUSTO_TEST_RUN')) then
        raise Exception.Create('Banco de integracao nao corresponde a esta rodada.');
      Writeln('MSSQL real conectado ao banco exclusivo desta rodada.');
    finally Q.Free; end;
  finally C.Free; end;
end;

'@
$sqlBuildBegin=New-Object Text.RegularExpressions.Regex('(?m)^begin\r?$')
$sqlBuildSource=$sqlBuildBegin.Replace($sqlBuildSource,$sqlBuildGuard+'begin',1)
$sqlBuildSource=$sqlBuildSource.Replace('    CarregarSegredos;',"    CarregarSegredos;`r`n    VerificarBancoDeIntegracao;")
[IO.File]::WriteAllText((Join-Path $sqlBuildOutput 'SqlServerHarness.dpr'),$sqlBuildSource,(New-Object System.Text.UTF8Encoding($true)))
[xml]$sqlBuildProject = [IO.File]::ReadAllText((Join-Path $sqlBuildRoot 'ProjetoFaculdade.dproj'))
$sqlBuildSearchPaths = @($sqlBuildRoot)
$sqlBuildSearchPaths += ($sqlBuildProject.Project.PropertyGroup.DCC_UnitSearchPath | Where-Object { $_ } | Select-Object -First 1).Split(';') |
    Where-Object { $_ -and $_ -notmatch '\$' } |
    ForEach-Object { Join-Path $sqlBuildRoot $_ } |
    Where-Object { Test-Path -LiteralPath $_ }
$sqlBuildBin = Split-Path (Get-Command dcc32).Source -Parent
$sqlBuildSearchPaths += Join-Path (Split-Path $sqlBuildBin -Parent) 'lib\win32\release'
Push-Location $sqlBuildOutput
try {
    & (Join-Path $sqlBuildBin 'dcc32.exe') '-B' '-Q' '-TX.exe' '-NSSystem;Xml;Data;Datasnap;Web;Soap;Winapi;System.Win;Data.Win;Web.Win' ('-U' + ($sqlBuildSearchPaths -join ';')) ('-I' + ($sqlBuildSearchPaths -join ';')) ('-E' + $sqlBuildOutput) ('-N0' + $sqlBuildOutput) 'SqlServerHarness.dpr'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar API de integração SQL Server.' }
} finally { Pop-Location }
Write-Output 'API de integração compilada com Conexao/MSSQL reais; nenhum banco foi acessado.'
