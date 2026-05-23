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
  LBody: TJSONObject;
  LStatus, LObservacao: string;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  LBody := Req.Body<TJSONObject>;

  LStatus := LBody.GetValue<string>('status', '');
  LObservacao := LBody.GetValue<string>('observacao', '');

  if LStatus = '' then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O status não foi informado.');

  TServicoAdminSolicitacoes.AlterarStatus(LId, LStatus, LObservacao);

  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

class procedure TControladorAdminSolicitacoes.RegistrarRotas;
begin
  THorse.Get('/admin/solicitacoes', DoListarSolicitacoes);
  THorse.Patch('/admin/solicitacoes/:id/status', DoAlterarStatus);
end;

end.
