unit Controlador_Produtos;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Produtos;

type
  TControladorProdutos = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoListarProdutos(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LPage, LLimit: Integer;
  LSearch, LCategoria, LDisponibilidade: string;
begin
  LPage := StrToIntDef(Req.Query['page'], 1);
  LLimit := StrToIntDef(Req.Query['limit'], 5);

  // Pegando os filtros da URL
  LSearch := Req.Query['search'];
  LCategoria := Req.Query['categoria'];
  LDisponibilidade := Req.Query['disponibilidade'];

  if LPage < 1 then LPage := 1;
  if LLimit < 1 then LLimit := 5;

  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('resultado', TServicoProdutos.ListarPaginado(LPage, LLimit, LSearch, LCategoria, LDisponibilidade))
  );
end;

class procedure TControladorProdutos.RegistrarRotas;
begin
  THorse.Get('/produtos', DoListarProdutos);
end;

end.
