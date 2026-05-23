unit Autenticacao;

interface

uses
  System.SysUtils, Horse, JOSE.Core.JWT, JOSE.Core.Builder, System.JSON,
  Secrets, Excecoes, Mensagens;

type
  TDadosToken = record
    UsuarioCPF: string;
    NomeUsuario: string;
  end;

function ValidarToken(Req: THorseRequest): TDadosToken;

implementation

function ValidarToken(Req: THorseRequest): TDadosToken;
var
  LTokenStr: string;
  LJWT: TJWT;
  LJsonObj: TJSONObject;
begin
  LTokenStr := Req.Headers['Authorization'];
  if LTokenStr.Trim.IsEmpty then
    raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Token de autenticação não fornecido no cabeçalho (Authorization).');

  LTokenStr := LTokenStr.Replace('Bearer ', '', [rfIgnoreCase]).Trim;

  try
    LJWT := TJOSE.Verify(c_jwt_secret, LTokenStr);
    try
      if not Assigned(LJWT) then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Token de autenticação inválido ou corrompido.');

      if LJWT.Claims.Expiration < Now then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'O seu Token de sessão expirou. Faça login novamente.');

      LJsonObj := LJWT.Claims.JSON;

      // Resgata os dados simples que colocamos no payload
      Result.UsuarioCPF  := LJsonObj.GetValue<string>('cpf', '');
      Result.NomeUsuario := LJsonObj.GetValue<string>('nome', '');

    finally
      if Assigned(LJWT) then LJWT.Free;
    end;
  except
    on E: EErroApi do
      raise;
    on E: Exception do
      raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'O token de autenticação fornecido é inválido ou está mal formatado.');
  end;
end;

end.
