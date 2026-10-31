unit Servico_Login;

interface

uses
  System.SysUtils, System.Classes, Data.DB, FireDAC.Comp.Client, BCrypt,
  FireDAC.DApt, FireDAC.Stan.Param, Horse, Excecoes,
  Conexao, Mensagens;

type
  TRespostaLogin = record
    UsuarioCPF: string;
    NomeUsuario: string;
    Credencial: string;
    IdCargo : integer;
  end;

  TServicoAutenticacao = class
  public
    // Mudei o nome do parâmetro para AIdentificador para fazer mais sentido
    class function RealizarLogin(const ACPF, ASenhaDigitada: string): TRespostaLogin;
  end;

implementation
uses RecuperacaoSeguranca;

{ TServicoAutenticacao }

class function TServicoAutenticacao.RealizarLogin(const ACPF, ASenhaDigitada: string): TRespostaLogin;
var
  LConn: TFDConnection;
  LQryUser: TFDQuery;
  LCPFLimpo: string;
begin
  Result.UsuarioCPF := '';
  Result.NomeUsuario := '';
  // Limpa a máscara do CPF
  LCPFLimpo := ACPF.Replace('.', '').Replace('-', '');
  LConn := TProvedorConexao.ObterConexao;
  LQryUser := TFDQuery.Create(nil);
  try
    LQryUser.Connection := LConn;
    // Adicionado o campo 'status' na busca do SELECT
    LQryUser.SQL.Add('SELECT idUsuarioCPF, nomeUsuario, IdCargo, senha, status FROM Usuarios ');
    LQryUser.SQL.Add('WHERE idUsuarioCPF = :CPF');
    LQryUser.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
    LQryUser.Open;
    // Se não achar o usuário, já mata aqui
    if LQryUser.IsEmpty then
      raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'CPF ou senha inválidos.');
    // ── TRAVA DE SEGURANÇA: Bloqueia usuários com status 'Inativo' ──
    if SameText(LQryUser.FieldByName('status').AsString, 'Inativo') then
      raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Esta conta está inativa. Entre em contato com o administrador.');
    // Validação da senha com o BCrypt
    if not TBCrypt.CompareHash(ASenhaDigitada, LQryUser.FieldByName('senha').AsString) then
      raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'CPF ou senha inválidos.');
    // Se passou por todas as validações, monta o retorno do sucesso
    Result.UsuarioCPF  := LQryUser.FieldByName('idUsuarioCPF').AsString;
    Result.NomeUsuario := LQryUser.FieldByName('nomeUsuario').AsString;
    Result.IdCargo     := LQryUser.FieldByName('IdCargo').AsInteger;
    Result.Credencial := MarcaCredencial(LQryUser.FieldByName('senha').AsString);
  finally
    LQryUser.Free;
    LConn.Free;
  end;
end;

end.
