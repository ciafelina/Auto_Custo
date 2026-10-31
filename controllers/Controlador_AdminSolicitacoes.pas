unit Controlador_AdminSolicitacoes;

interface

uses
  Horse, System.JSON, System.SysUtils, Excecoes, Mensagens, Servico_AdminSolicitacoes;

type
  TControladorAdminSolicitacoes = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoListarSolicitacoes(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LPage, LLimit: Integer;
  LBusca, LStatus: string;
begin
  LPage := StrToIntDef(Req.Query['page'], 1);
  LLimit := StrToIntDef(Req.Query['limit'], 5);
  LBusca := Req.Query['search'];
  LStatus := Req.Query['status'];

  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('dados', TServicoAdminSolicitacoes.Listar(LPage, LLimit, LBusca, LStatus))
  );
end;

procedure DoAlterarStatus(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId: Integer;
  LJSON, LValorStatus, LValorObservacao: TJSONValue;
  LBody: TJSONObject;
  LStatus, LObservacao: string;
  LAtualizarObservacao: Boolean;
begin
  if not TryStrToInt(Req.Params['id'], LId) or (LId <= 0) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Identificador da solicitação inválido.');
  LJSON := Req.Body<TJSONValue>;
  if not (LJSON is TJSONObject) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O corpo da requisição deve ser um objeto JSON.');
  LBody := TJSONObject(LJSON);
  LValorStatus := LBody.GetValue('status');
  if not Assigned(LValorStatus) or (LValorStatus is TJSONNull) then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O status não foi informado.');
  if not (LValorStatus is TJSONString) then
    raise EErroApi.Create(400, TCodigoErro.StatusInvalido, 'O status deve ser informado como texto.');
  LStatus := Trim(LValorStatus.Value);
  if LStatus = '' then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O status não foi informado.');
  LObservacao := '';
  LValorObservacao := LBody.GetValue('observacao');
  LAtualizarObservacao := Assigned(LValorObservacao) and not (LValorObservacao is TJSONNull);
  if LAtualizarObservacao then
  begin
    if LValorObservacao.ClassType <> TJSONString then
      raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'A observação deve ser informada como texto.');
    LObservacao := LValorObservacao.Value;
  end;
  TServicoAdminSolicitacoes.AlterarStatus(LId, LStatus, LObservacao, LAtualizarObservacao);
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

class procedure TControladorAdminSolicitacoes.RegistrarRotas;
begin
  THorse.Get('/admin/solicitacoes', DoListarSolicitacoes);
  THorse.Patch('/admin/solicitacoes/:id/status', DoAlterarStatus);
end;

end.
