unit Controlador_Interessado;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Interessado, Autenticacao, Excecoes, Mensagens;

type
  TControladorInteressado = class
  public
    class procedure RegistrarRotas;
  end;

implementation

uses JsonApi;

procedure DoListarInteressados(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  ValidarToken(Req);
  Res.Status(200).Send<TJSONArray>(TServicoInteressado.Listar);
end;

procedure DoCadastrarInteressado(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LDoc, LNome: string;
begin
  ValidarToken(Req);

  LBody := LerObjetoJSON(Req);
  if (not Assigned(LBody)) or (LBody.Count = 0) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Corpo da requisição vazio.');

  LDoc  := LBody.GetValue<string>('documentoInteressado', '');
  LNome := LBody.GetValue<string>('nomeInteressado', '');

  if LDoc.Trim.IsEmpty or LNome.Trim.IsEmpty then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Documento e Nome são obrigatórios.');

  TServicoInteressado.Cadastrar(LDoc, LNome);

  Res.Status(201).Send(
    TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True))
                      .AddPair('mensagem', 'Interessado cadastrado com sucesso!')
  );
end;

class procedure TControladorInteressado.RegistrarRotas;
begin
  THorse.Get('/interessados', DoListarInteressados);
  THorse.Post('/interessados', DoCadastrarInteressado);
end;

end.
