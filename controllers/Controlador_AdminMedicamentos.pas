unit Controlador_AdminMedicamentos;

interface

uses
  Horse, System.JSON, System.SysUtils, Excecoes, Mensagens, Servico_AdminMedicamentos;

type
  TControladorAdminMedicamentos = class
  public
    class procedure RegistrarRotas;
  end;

implementation

uses JsonApi;

procedure DoListar(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LPage, LLimit: Integer;
  LBusca: string;
begin
  LPage := StrToIntDef(Req.Query['page'], 1);
  LLimit := StrToIntDef(Req.Query['limit'], 5);
  LBusca := Req.Query['search'];

  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('dados', TServicoAdminMedicamentos.Listar(LPage, LLimit, LBusca))
  );
end;

procedure DoInserir(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  TServicoAdminMedicamentos.Inserir(LerObjetoJSON(Req));
  Res.Status(201).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoAtualizar(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId: Integer;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  TServicoAdminMedicamentos.Atualizar(LId, LerObjetoJSON(Req));
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoAtualizarEstoque(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId, LQuantidade: Integer;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  LQuantidade := LerObjetoJSON(Req).GetValue<Integer>('estoque', 0);

  TServicoAdminMedicamentos.AtualizarEstoque(LId, LQuantidade);
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoExcluir(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId: Integer;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  TServicoAdminMedicamentos.Excluir(LId);
  Res.Status(204).Send(''); // 204 significa "Deletado com sucesso, sem corpo de resposta"
end;

class procedure TControladorAdminMedicamentos.RegistrarRotas;
begin
  THorse.Get('/admin/medicamentos', DoListar);
  THorse.Post('/admin/medicamentos', DoInserir);
  THorse.Put('/admin/medicamentos/:id', DoAtualizar);
  THorse.Patch('/admin/medicamentos/:id/estoque', DoAtualizarEstoque);
  THorse.Delete('/admin/medicamentos/:id', DoExcluir);
end;

end.
