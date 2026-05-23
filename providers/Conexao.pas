unit Conexao;

interface

uses
  System.SysUtils, System.Classes, Data.DB, System.IniFiles,
  FireDAC.Stan.Intf, FireDAC.Stan.Option, FireDAC.Stan.Error, FireDAC.UI.Intf,
  FireDAC.Phys.Intf, FireDAC.Stan.Def, FireDAC.Stan.Pool, FireDAC.Stan.Async, Excecoes, Mensagens,
  FireDAC.Phys, FireDAC.Phys.MSSQL, FireDAC.Phys.MSSQLDef, FireDAC.ConsoleUI.Wait,
  FireDAC.Comp.Client;

type
  TProvedorConexao = class
  public
    class function ObterConexao: TFDConnection;
  end;

implementation

{ TProvedorConexao }

class function TProvedorConexao.ObterConexao: TFDConnection;
var
  LConexao: TFDConnection;
   LArquivoIni: TIniFile;
   LCaminhoIni: string;
  LServidor, LPorta, LBanco, LUsuario, LSenha: string;
begin

  LCaminhoIni := ExtractFilePath(ParamStr(0)) + 'config.ini';

  if not FileExists(LCaminhoIni) then
    raise EErroApi.Create(500, TCodigoErro.NaoEncontrado, 'Arquivo de configuração (config.ini) não encontrado na pasta da API.');

  LArquivoIni := TIniFile.Create(LCaminhoIni);
  try
    LServidor := LArquivoIni.ReadString('Base', 'Servidor', '');
    LPorta    := LArquivoIni.ReadString('Base', 'Porta', '1433');
    LBanco    := LArquivoIni.ReadString('Base', 'Banco', '');
    LUsuario  := LArquivoIni.ReadString('Base', 'Usuario', '');
    LSenha    := LArquivoIni.ReadString('Base', 'Senha', '');
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

    Result := LConexao;
  except
    LConexao.Free;
    raise;
  end;
end;

end.
