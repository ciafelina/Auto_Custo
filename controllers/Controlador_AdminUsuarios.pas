unit Controlador_AdminUsuarios;

interface

uses
  Horse, System.JSON, System.SysUtils, Excecoes, Mensagens, Servico_AdminUsuarios;

type
  TControladorAdminUsuarios = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoListarUsuarios(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LPage, LLimit, LCargo: Integer;
  LBusca, LStatus: string;
begin
  LPage := StrToIntDef(Req.Query['page'], 1);
  LLimit := StrToIntDef(Req.Query['limit'], 5);
  LBusca := Req.Query['search'];
  LStatus := Req.Query['status'];
  LCargo := StrToIntDef(Req.Query['cargo'], 0);

  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('dados', TServicoAdminUsuarios.Listar(LPage, LLimit, LBusca, LStatus, LCargo))
  );
end;

procedure DoInserirUsuario(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  TServicoAdminUsuarios.Inserir(Req.Body<TJSONObject>);
  Res.Status(201).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoAtualizarUsuario(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  TServicoAdminUsuarios.Atualizar(Req.Params['cpf'], Req.Body<TJSONObject>);
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoAtualizarCargo(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LCargo: Integer;
begin
  LCargo := Req.Body<TJSONObject>.GetValue<Integer>('idCargo', 0);
  if LCargo = 0 then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Cargo não informado.');

  TServicoAdminUsuarios.AtualizarCargo(Req.Params['cpf'], LCargo);
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

procedure DoAtualizarStatus(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LStatus: string;
begin
  LStatus := Req.Body<TJSONObject>.GetValue<string>('status', '');
  if LStatus = '' then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Status não informado.');

  TServicoAdminUsuarios.AtualizarStatus(Req.Params['cpf'], LStatus);
  Res.Status(200).Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)));
end;

class procedure TControladorAdminUsuarios.RegistrarRotas;
begin
  THorse.Get('/admin/usuarios', DoListarUsuarios);
  THorse.Post('/admin/usuarios', DoInserirUsuario);
  THorse.Put('/admin/usuarios/:cpf', DoAtualizarUsuario);
  THorse.Patch('/admin/usuarios/:cpf/cargo', DoAtualizarCargo);
  THorse.Patch('/admin/usuarios/:cpf/status', DoAtualizarStatus);
end;

end.
