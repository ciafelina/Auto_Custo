unit Servico_Produtos;

interface

uses
  System.JSON, FireDAC.Comp.Client, Conexao, System.SysUtils, Data.DB;

type
  TServicoProdutos = class
  public
    // Adicionamos os 3 parâmetros de filtro
    class function ListarPaginado(const APage, ALimit: Integer; const ASearch, ACategoria, ADisponibilidade: string): TJSONObject;
  end;

implementation

class function TServicoProdutos.ListarPaginado(const APage, ALimit: Integer; const ASearch, ACategoria, ADisponibilidade: string): TJSONObject;
var
  LConn: TFDConnection;
  LQryTotal, LQryPagina: TFDQuery;
  LArrayDados: TJSONArray;
  LOffset: Integer;
  LWhere: string;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQryTotal := TFDQuery.Create(nil);
  LQryPagina := TFDQuery.Create(nil);
  Result := TJSONObject.Create;
  try
    LQryTotal.Connection := LConn;
    LQryPagina.Connection := LConn;

    // 1. Monta os filtros dinamicamente
    LWhere := ' WHERE 1=1 '; // Truque simples para concatenar os ANDs depois

    if ASearch <> '' then
      LWhere := LWhere + ' AND (nome LIKE :Search OR descricao LIKE :Search) ';

    // Ignora "Todas as Categorias" se vier vazio
    if ACategoria <> '' then
      LWhere := LWhere + ' AND categoria = :Categoria ';

    if ADisponibilidade = 'available' then
      LWhere := LWhere + ' AND quantidadeEstoque > 5 '
    else if ADisponibilidade = 'low' then
      LWhere := LWhere + ' AND quantidadeEstoque > 0 AND quantidadeEstoque <= 5 '
    else if ADisponibilidade = 'out' then
      LWhere := LWhere + ' AND quantidadeEstoque = 0 ';

    // 2. Consulta de TOTAL
    LQryTotal.SQL.Text := 'SELECT COUNT(*) as Total FROM Medicamentos' + LWhere;

    // Passa os parâmetros se eles existirem na SQL
    if ASearch <> '' then LQryTotal.ParamByName('Search').AsString := '%' + ASearch + '%';
    if ACategoria <> '' then LQryTotal.ParamByName('Categoria').AsString := ACategoria;

    LQryTotal.Open;
    Result.AddPair('total_registros', TJSONNumber.Create(LQryTotal.FieldByName('Total').AsInteger));

    // 3. Consulta da PÁGINA
    LOffset := (APage - 1) * ALimit;

    LQryPagina.SQL.Text := 'SELECT idMedicamento, nome, descricao, categoria, dosagem, fabricante, quantidadeEstoque ' +
                           'FROM Medicamentos ' + LWhere +
                           ' ORDER BY nome ASC ' +
                           'OFFSET :Offset ROWS FETCH NEXT :Limit ROWS ONLY';

    if ASearch <> '' then LQryPagina.ParamByName('Search').AsString := '%' + ASearch + '%';
    if ACategoria <> '' then LQryPagina.ParamByName('Categoria').AsString := ACategoria;

    LQryPagina.ParamByName('Offset').AsInteger := LOffset;
    LQryPagina.ParamByName('Limit').AsInteger := ALimit;
    LQryPagina.Open;

    // 4. Monta o JSON
    LArrayDados := TJSONArray.Create;
    while not LQryPagina.Eof do
    begin
      LArrayDados.AddElement(
        TJSONObject.Create
          .AddPair('id', TJSONNumber.Create(LQryPagina.FieldByName('idMedicamento').AsInteger))
          .AddPair('nome', LQryPagina.FieldByName('nome').AsString)
          .AddPair('descricao', LQryPagina.FieldByName('descricao').AsString)
          .AddPair('categoria', LQryPagina.FieldByName('categoria').AsString)
          .AddPair('dosagem', LQryPagina.FieldByName('dosagem').AsString)
          .AddPair('fabricante', LQryPagina.FieldByName('fabricante').AsString)
          .AddPair('estoque', TJSONNumber.Create(LQryPagina.FieldByName('quantidadeEstoque').AsInteger))
      );
      LQryPagina.Next;
    end;

    Result.AddPair('dados', LArrayDados);
  finally
    LQryTotal.Free;
    LQryPagina.Free;
    LConn.Free;
  end;
end;

end.
