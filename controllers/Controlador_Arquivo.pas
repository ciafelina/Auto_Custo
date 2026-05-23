unit Controlador_Arquivo;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Arquivo, Autenticacao, Excecoes, Mensagens;

type
  TControladorArquivo = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoListarArquivos(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  ValidarToken(Req);
  Res.Status(200).Send<TJSONArray>(TServicoArquivo.Listar);
end;

procedure DoCadastrarArquivo(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LTokenDados: TDadosToken;
  LProntuario, LCaixa, LPrateleira: string;
  LIdDoc: Integer;
begin
  LTokenDados := ValidarToken(Req);

  LBody := Req.Body<TJSONObject>;
  if (not Assigned(LBody)) or (LBody.Count = 0) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Corpo da requisição vazio.');

  LProntuario := LBody.GetValue<string>('prontuario', '');
  LCaixa      := LBody.GetValue<string>('caixa', '');
  LPrateleira := LBody.GetValue<string>('prateleiraCorredor', '');
  LIdDoc      := LBody.GetValue<Integer>('idDoc', 0);

  if LPrateleira.Trim.IsEmpty then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O campo "prateleiraCorredor" é obrigatório.');

  if LIdDoc <= 0 then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O "idDoc" é obrigatório para vincular o arquivo físico.');

  TServicoArquivo.Cadastrar(LProntuario, LCaixa, LPrateleira, LTokenDados.UsuarioCPF, LIdDoc);

  Res.Status(201).Send(
    TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True))
                      .AddPair('mensagem', 'Localização física do arquivo registrada com sucesso!')
  );
end;

class procedure TControladorArquivo.RegistrarRotas;
begin
  THorse.Get('/arquivos', DoListarArquivos);
  THorse.Post('/arquivos', DoCadastrarArquivo);
end;

end.
