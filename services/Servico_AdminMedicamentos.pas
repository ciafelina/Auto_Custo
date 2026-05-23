unit Servico_AdminMedicamentos;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, Conexao, System.JSON, Excecoes, Mensagens;

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
    LQry.SQL.Add('fabricante = :fabricante, quantidadeEstoque = :estoque, estoqueMinimo = :minimo, descricao = :descricao ');
    LQry.SQL.Add('WHERE idMedicamento = :id');

    LQry.ParamByName('id').AsInteger := AId;
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
  LQtdProcesso: Integer;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    // 1. Verifica a regra de negócio: Tem alguma solicitação em andamento?
    LQry.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM Solicitacoes WHERE IdMedicamento = :id AND status IN (''Pendente'', ''Aprovado'')';
    LQry.ParamByName('id').AsInteger := AId;
    LQry.Open;
    LQtdProcesso := LQry.FieldByName('Qtd').AsInteger;
    LQry.Close;

    // Se tiver alguma em andamento, explode o erro e bloqueia na hora!
    if LQtdProcesso > 0 then
      raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Não pode ser excluído. Este medicamento possui solicitações Pendentes ou Aprovadas.');

    // 2. Se passou, podemos excluir! Vamos usar transação para garantir que não quebre nada.
    LConn.StartTransaction;
    try
      // Desvincula o histórico antigo (Retirados/Cancelados) para o banco não dar erro de Chave Estrangeira
      LQry.SQL.Text := 'UPDATE Solicitacoes SET IdMedicamento = NULL WHERE IdMedicamento = :id';
      LQry.ParamByName('id').AsInteger := AId;
      LQry.ExecSQL;

      // Agora sim, exclui o medicamento fisicamente
      LQry.SQL.Text := 'DELETE FROM Medicamentos WHERE idMedicamento = :id';
      LQry.ParamByName('id').AsInteger := AId;
      LQry.ExecSQL;

      LConn.Commit;
    except
      LConn.Rollback;
      raise;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
