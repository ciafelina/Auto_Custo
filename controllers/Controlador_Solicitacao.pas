unit Controlador_Solicitacao;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Solicitacao, Autenticacao, Excecoes, Mensagens;

type
  TControladorSolicitacao = class
  public
    class procedure RegistrarRotas;
  end;

implementation

function LerInteiroPositivo(ACorpo: TJSONObject; const ACampo: string): Integer;
var
  LValor: TJSONValue;
  LCodigo: string;
begin
  LValor := ACorpo.GetValue(ACampo);
  if not Assigned(LValor) then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O campo ' + ACampo + ' é obrigatório.');
  if ACampo = 'quantidade' then
    LCodigo := TCodigoErro.QuantidadeInvalida
  else
    LCodigo := TCodigoErro.RequisicaoInvalida;
  if not (LValor is TJSONNumber) then
    raise EErroApi.Create(400, LCodigo, 'O campo ' + ACampo + ' deve ser um número inteiro maior que zero.');
  if not TryStrToInt(LValor.Value, Result) or (Result <= 0) then
    raise EErroApi.Create(400, LCodigo, 'O campo ' + ACampo + ' deve ser um número inteiro maior que zero dentro do limite permitido.');
end;

procedure DoConfirmarRetirada(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId: Integer;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  TServicoSolicitacao.ConfirmarRetirada(LId, ValidarToken(Req).UsuarioCPF);
  Res.Status(204).Send('');
end;

procedure DoNovaSolicitacao(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LJSON: TJSONValue;
  LBody: TJSONObject;
  LCPF: string;
  LQuantidade, LIdMedicamento: Integer;
begin
  LJSON := Req.Body<TJSONValue>;
  if not (LJSON is TJSONObject) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O corpo da requisição deve ser um objeto JSON.');
  LBody := TJSONObject(LJSON);
  LCPF := LBody.GetValue<string>('cpf', '');
  ExigirTitular(Req, LCPF);
  LCPF := ValidarToken(Req).UsuarioCPF;
  LQuantidade := LerInteiroPositivo(LBody, 'quantidade');
  LIdMedicamento := LerInteiroPositivo(LBody, 'idMedicamento');
  TServicoSolicitacao.NovaSolicitacao(LCPF, LQuantidade, LIdMedicamento);

  Res.Status(201).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('mensagem', 'Solicitação enviada com sucesso!')
  );
end;

class procedure TControladorSolicitacao.RegistrarRotas;
begin
  THorse.Post('/solicitacoes', DoNovaSolicitacao);
  THorse.Patch('/solicitacoes/:id/retirada', DoConfirmarRetirada);
end;

end.
