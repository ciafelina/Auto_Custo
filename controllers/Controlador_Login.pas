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


{ TControladorAutenticacao }

procedure DoLogin(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LResult: TRespostaLogin;
  LJWT: TJWT;
  LTokenJWTString: string;
  LIdentificador, LSenha: string;
begin
  try // <-- Captura qualquer erro de validação ou status inativo
    try
      LBody := Req.Body<TJSONObject>;
    except
      on E: Exception do
        raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Formato JSON inválido.');
    end;
    if (not Assigned(LBody)) or (LBody.Count = 0) then
      raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O corpo da requisição não pode estar vazio.');
    LIdentificador := LBody.GetValue<string>('cpf', '');
    LSenha         := LBody.GetValue<string>('senha', '');
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
      LTokenJWTString := TJOSE.SHA256CompactToken(c_jwt_secret, LJWT);
    finally
      LJWT.Free;
    end;
    // Retorno em caso de sucesso completo
    Res.Status(200).Send(
      '{' +
      '  "sucesso": true,' +
      '  "dados": {' +
      '    "token_jwt": "' + LTokenJWTString + '",' +
      '    "tipo": "Bearer",' +
      '    "expira_em": 28800,' +
      '    "nome": "' + LResult.NomeUsuario + '",' +
      '    "cpf": "' + LResult.UsuarioCPF + '",' +
      '    "cargo": ' + IntToStr(LResult.IdCargo) +
      '  }' +
      '}'
    );
  except
    on E: Exception do
    begin
      Res.Status(401).Send('{"sucesso": false, "mensagem": "' + E.Message + '"}');
    end;
  end;
end;

class procedure TControladorAutenticacao.RegistrarRotas;
begin
  THorse.Post('/login', DoLogin);
end;

end.

