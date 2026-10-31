unit Controlador_Dashboard;

interface

uses
  Horse, System.JSON, System.SysUtils, Excecoes, Mensagens, Servico_Dashboard, Autenticacao;

type
  TControladorDashbord = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoObterDashboard(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LCPF: string;
  LPage, LLimit: Integer;
begin
  LCPF := Req.Params['cpf'];
  ExigirTitular(Req, LCPF);
  LCPF := ValidarToken(Req).UsuarioCPF;

  LPage := StrToIntDef(Req.Query['page'], 1);
  LLimit := StrToIntDef(Req.Query['limit'], 5);

  if LPage < 1 then LPage := 1;
  if LLimit < 1 then LLimit := 5;

  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('dados', TServicoDashboard.ObterDadosPaciente(LCPF, LPage, LLimit))
  );
end;

procedure DoObterDashboardAdmin(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      // Chama o serviço do Admin que acabamos de criar
      .AddPair('dados', TServicoDashboard.ObterDadosAdmin)
  );
end;

class procedure TControladorDashbord.RegistrarRotas;
begin
  THorse.Get('/dashboard/paciente/:cpf', DoObterDashboard);
  THorse.Get('/admin/dashboard', DoObterDashboardAdmin);
end;

end.
