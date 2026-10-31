unit Controlador_Login;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Login, System.DateUtils, Excecoes,
  JOSE.Core.JWT, JOSE.Core.Builder, Mensagens, Secrets;

type
  TControladorAutenticacao = class
  public
    class procedure RegistrarRotas;
  end;

implementation

uses JsonApi;


{ TControladorAutenticacao }

procedure DoLogin(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LResult: TRespostaLogin;
  LJWT: TJWT;
  LTokenJWTString: string;
  LIdentificador, LSenha: string;
begin
    LBody := LerObjetoJSON(Req);
    if LBody.Count = 0 then
      raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O corpo da requisição não pode estar vazio.');
    LIdentificador := LerTextoJSON(LBody, 'cpf');
    LSenha         := LerTextoJSON(LBody, 'senha');
    if LIdentificador = '' then raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'CPF não informado.');
    if LSenha = '' then raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Senha não informada.');
    LResult := TServicoAutenticacao.RealizarLogin(LIdentificador, LSenha);
    LJWT := TJWT.Create;
    try
      LJWT.Claims.Subject := 'SCHOOLER_API';
      LJWT.Claims.Expiration := IncHour(Now, 8); // Expira em 8 horas
      LJWT.Claims.SetClaimOfType<string>('cpf', LResult.UsuarioCPF);
      LJWT.Claims.SetClaimOfType<string>('nome', LResult.NomeUsuario);
      LJWT.Claims.SetClaimOfType<Integer>('cargo', LResult.IdCargo);
      LTokenJWTString := TJOSE.SHA256CompactToken(ObterChaveJWT, LJWT);
    finally
      LJWT.Free;
    end;
    Res.Status(200).Send(
      TJSONObject.Create
        .AddPair('sucesso', TJSONBool.Create(True))
        .AddPair('dados', TJSONObject.Create
          .AddPair('token_jwt', LTokenJWTString)
          .AddPair('tipo', 'Bearer')
          .AddPair('expira_em', TJSONNumber.Create(28800))
          .AddPair('nome', LResult.NomeUsuario)
          .AddPair('cpf', LResult.UsuarioCPF)
          .AddPair('cargo', TJSONNumber.Create(LResult.IdCargo)))
    );
end;

class procedure TControladorAutenticacao.RegistrarRotas;
begin
  THorse.Post('/login', DoLogin);
end;

end.

