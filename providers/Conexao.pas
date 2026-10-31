unit Conexao;

interface

uses
  System.SysUtils, System.Classes, Data.DB, System.IniFiles,
  FireDAC.Stan.Intf, FireDAC.Stan.Option, FireDAC.Stan.Error, FireDAC.UI.Intf,
  FireDAC.Phys.Intf, FireDAC.Stan.Def, FireDAC.Stan.Pool, FireDAC.Stan.Async, Excecoes, Mensagens,
  FireDAC.Phys, FireDAC.Phys.MSSQL, FireDAC.Phys.MSSQLDef, FireDAC.ConsoleUI.Wait,
  FireDAC.Comp.Client, Secrets;

type
  TProvedorConexao = class
  public
    class function ObterConexao: TFDConnection;
  end;

implementation

{$IFDEF LINUX}
var
  FDriverLinux: TFDPhysMSSQLDriverLink;
{$ENDIF}

function LerParametroBase(AIni: TMemIniFile; const ANome, AValorPadrao: string): string;
begin
  Result := AIni.ReadString('Base', ANome, AValorPadrao);
  // Preservar a semântica do TIniFile usado nas configurações antigas.
  if Length(Result) >= 2 then
    if ((Result[1] = '"') and (Result[Length(Result)] = '"')) or
       ((Result[1] = '''') and (Result[Length(Result)] = '''')) then
      Result := Copy(Result, 2, Length(Result) - 2);
end;

{ TProvedorConexao }

class function TProvedorConexao.ObterConexao: TFDConnection;
var
  LConexao: TFDConnection;
   LArquivoIni: TMemIniFile;
   LCaminhoIni: string;
  LServidor, LPorta, LBanco, LUsuario, LSenha: string;
{$IFDEF LINUX}
  LNomeCertificado: string;
  LConfiarCertificado: Boolean;
{$ENDIF}
begin

  LCaminhoIni := ObterCaminhoConfiguracao;

  if not FileExists(LCaminhoIni) then
    raise EErroApi.Create(500, TCodigoErro.NaoEncontrado, 'Arquivo externo de configuração do banco não encontrado. Configure AUTO_CUSTO_CONFIG.');

  LArquivoIni := TMemIniFile.Create(LCaminhoIni, TEncoding.UTF8);
  try
    LServidor := LerParametroBase(LArquivoIni, 'Servidor', '');
    LPorta    := LerParametroBase(LArquivoIni, 'Porta', '1433');
    LBanco    := LerParametroBase(LArquivoIni, 'Banco', '');
    LUsuario  := LerParametroBase(LArquivoIni, 'Usuario', '');
    LSenha    := LerParametroBase(LArquivoIni, 'Senha', '');
{$IFDEF LINUX}
    LNomeCertificado := LerParametroBase(LArquivoIni, 'NomeCertificadoServidor', '');
    LConfiarCertificado := LArquivoIni.ReadBool('Base', 'ConfiarCertificadoServidor', False);
    if (Pos(';', LNomeCertificado) > 0) or (Pos('{', LNomeCertificado) > 0) or
       (Pos('}', LNomeCertificado) > 0) or (Pos(#13, LNomeCertificado) > 0) or
       (Pos(#10, LNomeCertificado) > 0) then
      raise EErroApi.Create(500, TCodigoErro.RequisicaoInvalida, 'Nome do certificado do banco inválido.');
{$ENDIF}
  finally
    LArquivoIni.Free;
  end;



  LConexao := TFDConnection.Create(nil);
  try
    LConexao.LoginPrompt := False;
    LConexao.Params.Clear;
    LConexao.Params.Add('DriverID=MSSQL');

    if LPorta <> '' then
      LConexao.Params.Add('Server=' + LServidor + ',' + LPorta)
    else
      LConexao.Params.Add('Server=' + LServidor);

    LConexao.Params.Add('Database=' + LBanco);
    LConexao.Params.Add('User_Name=' + LUsuario);
    LConexao.Params.Add('Password=' + LSenha);
{$IFDEF LINUX}
    if LConfiarCertificado then
      LConexao.Params.Values['ODBCAdvanced'] := 'Encrypt=yes;TrustServerCertificate=yes'
    else
      LConexao.Params.Values['ODBCAdvanced'] := 'Encrypt=yes;TrustServerCertificate=no';
    if (not LConfiarCertificado) and (LNomeCertificado <> '') then
      LConexao.Params.Values['ODBCAdvanced'] := LConexao.Params.Values['ODBCAdvanced'] +
        ';HostNameInCertificate=' + LNomeCertificado;
{$ENDIF}

    Result := LConexao;
  except
    LConexao.Free;
    raise;
  end;
end;

{$IFDEF LINUX}
initialization
  // O Delphi 11 não inclui ODBC 18 na detecção automática em Linux.
  FDriverLinux := TFDPhysMSSQLDriverLink.Create(nil);
  FDriverLinux.ODBCDriver := 'ODBC Driver 18 for SQL Server';
finalization
  FDriverLinux.Free;
{$ENDIF}

end.
