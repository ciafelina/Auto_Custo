unit Servico_AdminMedicamentos;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, FireDAC.Stan.Param, FireDAC.Stan.Option, Conexao, System.JSON, Excecoes, Mensagens;

type
  TServicoAdminMedicamentos = class
  public
    class function Listar(APage, ALimit: Integer; const ABusca: string): TJSONObject;
    class procedure Inserir(AJson: TJSONObject);
    class procedure Atualizar(AId: Integer; AJson: TJSONObject);
    class procedure AtualizarEstoque(AId, AQuantidade: Integer);
    class procedure Excluir(AId: Integer);
  end;

implementation

class function TServicoAdminMedicamentos.Listar(APage, ALimit: Integer; const ABusca: string): TJSONObject;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LOffset: Integer;
  LArray: TJSONArray;
  LFiltroBusca: string;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  Result := TJSONObject.Create;
  try
    LQry.Connection := LConn;
    LOffset := (APage - 1) * ALimit;

    if ABusca <> '' then
      LFiltroBusca := '%' + ABusca + '%'
    else
      LFiltroBusca := '%';

    // 1. Pega o Total (Para a paginação do site)
    LQry.SQL.Text := 'SELECT COUNT(*) as Total FROM Medicamentos WHERE nome LIKE :Busca OR categoria LIKE :Busca';
    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    LQry.Open;
    Result.AddPair('total', TJSONNumber.Create(LQry.FieldByName('Total').AsInteger));
    LQry.Close;

    // 2. Pega a Lista Paginada
    LQry.SQL.Clear;
    LQry.SQL.Add('SELECT idMedicamento, nome, categoria, dosagem, fabricante, quantidadeEstoque, estoqueMinimo, descricao ');
    LQry.SQL.Add('FROM Medicamentos WHERE nome LIKE :Busca OR categoria LIKE :Busca ');
    LQry.SQL.Add('ORDER BY nome ASC OFFSET :Offset ROWS FETCH NEXT :Limit ROWS ONLY');

    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    LQry.ParamByName('Offset').AsInteger := LOffset;
    LQry.ParamByName('Limit').AsInteger := ALimit;
    LQry.Open;

    LArray := TJSONArray.Create;
    while not LQry.Eof do
    begin
      LArray.AddElement(
        TJSONObject.Create
          .AddPair('id', TJSONNumber.Create(LQry.FieldByName('idMedicamento').AsInteger))
          .AddPair('nome', LQry.FieldByName('nome').AsString)
          .AddPair('categoria', LQry.FieldByName('categoria').AsString)
          .AddPair('dosagem', LQry.FieldByName('dosagem').AsString)
          .AddPair('fabricante', LQry.FieldByName('fabricante').AsString)
          .AddPair('estoque', TJSONNumber.Create(LQry.FieldByName('quantidadeEstoque').AsInteger))
          .AddPair('estoqueMinimo', TJSONNumber.Create(LQry.FieldByName('estoqueMinimo').AsInteger))
          .AddPair('descricao', LQry.FieldByName('descricao').AsString)
      );
      LQry.Next;
    end;

    Result.AddPair('lista', LArray);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminMedicamentos.Inserir(AJson: TJSONObject);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('INSERT INTO Medicamentos (nome, categoria, dosagem, fabricante, quantidadeEstoque, estoqueMinimo, descricao) ');
    LQry.SQL.Add('VALUES (:nome, :categoria, :dosagem, :fabricante, :estoque, :minimo, :descricao)');

    LQry.ParamByName('nome').AsString := AJson.GetValue<string>('nome', '');
    LQry.ParamByName('categoria').AsString := AJson.GetValue<string>('categoria', '');
    LQry.ParamByName('dosagem').AsString := AJson.GetValue<string>('dosagem', '');
    LQry.ParamByName('fabricante').AsString := AJson.GetValue<string>('fabricante', '');
    LQry.ParamByName('estoque').AsInteger := AJson.GetValue<Integer>('estoque', 0);
    LQry.ParamByName('minimo').AsInteger := AJson.GetValue<Integer>('estoqueMinimo', 0);
    LQry.ParamByName('descricao').AsString := AJson.GetValue<string>('descricao', '');

    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminMedicamentos.Atualizar(AId: Integer; AJson: TJSONObject);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('UPDATE Medicamentos SET nome = :nome, categoria = :categoria, dosagem = :dosagem, ');
    LQry.SQL.Add('fabricante = :fabricante, estoqueMinimo = :minimo, descricao = :descricao ');
    LQry.SQL.Add('WHERE idMedicamento = :id');

    LQry.ParamByName('id').AsInteger := AId;
    LQry.ParamByName('nome').AsString := AJson.GetValue<string>('nome', '');
    LQry.ParamByName('categoria').AsString := AJson.GetValue<string>('categoria', '');
    LQry.ParamByName('dosagem').AsString := AJson.GetValue<string>('dosagem', '');
    LQry.ParamByName('fabricante').AsString := AJson.GetValue<string>('fabricante', '');
    LQry.ParamByName('minimo').AsInteger := AJson.GetValue<Integer>('estoqueMinimo', 0);
    LQry.ParamByName('descricao').AsString := AJson.GetValue<string>('descricao', '');

    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminMedicamentos.AtualizarEstoque(AId, AQuantidade: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Medicamentos SET quantidadeEstoque = :estoque WHERE idMedicamento = :id';
    LQry.ParamByName('id').AsInteger := AId;
    LQry.ParamByName('estoque').AsInteger := AQuantidade;
    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminMedicamentos.Excluir(AId: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  if AId <= 0 then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Identificador do medicamento inválido.');
  LConn := TProvedorConexao.ObterConexao;
  try
    LQry := TFDQuery.Create(nil);
    try
      LQry.Connection := LConn;
      LConn.TxOptions.Isolation := xiSerializible;
      LConn.StartTransaction;
      try
        // Obter o bloqueio exclusivo antes de consultar o histórico evita
        // promover um bloqueio compartilhado enquanto um pedido reserva saldo.
        LQry.SQL.Text := 'SELECT idMedicamento FROM Medicamentos WITH (XLOCK, HOLDLOCK) WHERE idMedicamento = :id';
        LQry.ParamByName('id').AsInteger := AId;
        LQry.Open;
        if LQry.IsEmpty then
          raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Medicamento não encontrado.');
        LQry.Close;
        LQry.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM Solicitacoes WHERE IdMedicamento = :id';
        LQry.ParamByName('id').AsInteger := AId;
        LQry.Open;
        if LQry.FieldByName('Qtd').AsInteger > 0 then
          raise EErroApi.Create(409, TCodigoErro.HistoricoVinculado, 'O medicamento possui solicitações vinculadas e não pode ser excluído. O cadastro e o histórico foram preservados.');
        LQry.Close;
        // Manter o vínculo de todos os pedidos, inclusive os finalizados.
        LQry.SQL.Text := 'DELETE FROM Medicamentos WHERE idMedicamento = :id ' +
          'AND NOT EXISTS (SELECT 1 FROM Solicitacoes WHERE IdMedicamento = :id)';
        LQry.ParamByName('id').AsInteger := AId;
        LQry.ExecSQL;
        if LQry.RowsAffected <> 1 then
          raise EErroApi.Create(409, TCodigoErro.HistoricoVinculado, 'O medicamento não pode ser excluído enquanto houver solicitações vinculadas.');
        LConn.Commit;
      except
        on E: EErroApi do
        begin
          if LConn.InTransaction then LConn.Rollback;
          raise;
        end;
        on E: Exception do
        begin
          if LConn.InTransaction then LConn.Rollback;
          raise EErroApi.Create(500, TCodigoErro.ErroGravacaoBanco, 'Não foi possível excluir o medicamento. Nenhum histórico foi removido.');
        end;
      end;
    finally
      LQry.Free;
    end;
  finally
    LConn.Free;
  end;
end;

end.
