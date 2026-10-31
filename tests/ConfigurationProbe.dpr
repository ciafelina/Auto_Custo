program ConfigurationProbe;
{$APPTYPE CONSOLE}
uses
  System.SysUtils, FireDAC.Comp.Client,
  Secrets in '..\utils\Secrets.pas',
  Conexao in '..\providers\Conexao.pas',
  Excecoes in '..\utils\Excecoes.pas',
  Mensagens in '..\utils\Mensagens.pas';
var
  LConn: TFDConnection;
begin
  try
    LConn := TProvedorConexao.ObterConexao;
    try
      if LConn.Connected then ExitCode := 2
      else if LConn.Params.Values['Server'] <> 'servidor-ficticio,1500' then ExitCode := 3
      else if LConn.Params.Values['Database'] <> 'BancoTeste' then ExitCode := 4
      else if LConn.Params.Values['User_Name'] <> 'usuario-ficticio' then ExitCode := 5
      else if LConn.Params.Values['Password'] <> 'senha-ficticia' then ExitCode := 6;
    finally
      LConn.Free;
    end;
  except
    on E: Exception do
    begin
      Writeln(E.ClassName);
      ExitCode := 99;
    end;
  end;
end.
