unit Servico_AdminSolicitacoes;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, Conexao, System.JSON, Excecoes, Mensagens, System.MaskUtils;

type
  TServicoAdminSolicitacoes = class
  public
    class function Listar(APage, ALimit: Integer; const ABusca, AStatus: string): TJSONObject;
    class procedure AlterarStatus(AId: Integer; const ANovoStatus, AObservacao: string);
  end;

implementation

class function TServicoAdminSolicitacoes.Listar(APage, ALimit: Integer; const ABusca, AStatus: string): TJSONObject;
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

    // 1. CONTAGEM TOTAL (Para a paginação)
    LQry.SQL.Add('SELECT COUNT(*) as Total FROM Solicitacoes s ');
    LQry.SQL.Add('LEFT JOIN Medicamentos m ON s.IdMedicamento = m.idMedicamento ');
    LQry.SQL.Add('WHERE (CAST(s.idUsuarioCPF AS VARCHAR) LIKE :Busca OR m.nome LIKE :Busca) ');
    if AStatus <> '' then
      LQry.SQL.Add('AND s.status = :Status');

    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    if AStatus <> '' then
      LQry.ParamByName('Status').AsString := AStatus;

    LQry.Open;
    Result.AddPair('total', TJSONNumber.Create(LQry.FieldByName('Total').AsInteger));
    LQry.Close;

    // 2. BUSCA DA LISTA COM JOIN
    LQry.SQL.Clear;
    LQry.SQL.Add('SELECT s.idSolicitacao, ISNULL((m.nome + '' '' + m.dosagem), ''Medicamento Removido'') AS medicamento, ');
    LQry.SQL.Add('u.nomeUsuario, s.idUsuarioCPF, s.quantidade, CONVERT(VARCHAR(10), s.dataSolicitacao, 103) AS dataFormatada, ');
    LQry.SQL.Add('s.status, s.observacao ');
    LQry.SQL.Add('FROM Solicitacoes s ');
    LQry.SQL.Add('LEFT JOIN Medicamentos m ON s.IdMedicamento = m.idMedicamento ');
    LQry.SQL.Add('LEFT JOIN Usuarios u ON s.idUsuarioCPF = u.idUsuarioCPF ');
    LQry.SQL.Add('WHERE (CAST(s.idUsuarioCPF AS VARCHAR) LIKE :Busca OR m.nome LIKE :Busca) ');

    if AStatus <> '' then
      LQry.SQL.Add('AND s.status = :Status ');

    LQry.SQL.Add('ORDER BY s.dataSolicitacao DESC OFFSET :Offset ROWS FETCH NEXT :Limit ROWS ONLY');

    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    if AStatus <> '' then
      LQry.ParamByName('Status').AsString := AStatus;
    LQry.ParamByName('Offset').AsInteger := LOffset;
    LQry.ParamByName('Limit').AsInteger := ALimit;

    LQry.Open;

    LArray := TJSONArray.Create;
    while not LQry.Eof do
    begin
      // Aplica a máscara no CPF dinamicamente
      var LCPFFormatado := FormatMaskText('000\.000\.000\-00;0;_', LQry.FieldByName('idUsuarioCPF').AsString);

      LArray.AddElement(
        TJSONObject.Create
          .AddPair('id', TJSONNumber.Create(LQry.FieldByName('idSolicitacao').AsInteger))
          .AddPair('medicamento', LQry.FieldByName('medicamento').AsString)
          .AddPair('nomePaciente', LQry.FieldByName('nomeUsuario').AsString)
          .AddPair('cpfPaciente', LCPFFormatado)
          .AddPair('quantidade', TJSONNumber.Create(LQry.FieldByName('quantidade').AsInteger))
          .AddPair('dataSolicitacao', LQry.FieldByName('dataFormatada').AsString)
          .AddPair('status', LQry.FieldByName('status').AsString)
          .AddPair('observacao', LQry.FieldByName('observacao').AsString)
      );
      LQry.Next;
    end;

    Result.AddPair('lista', LArray);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminSolicitacoes.AlterarStatus(AId: Integer; const ANovoStatus, AObservacao: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LStatusAtual: string;
  LIdMed, LQtd: Integer;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    // Transação para evitar bagunça no estoque se a internet cair na metade
    LConn.StartTransaction;
    try
      // 1. Descobre como o pedido está hoje e quanto de remédio foi pedido
      LQry.SQL.Text := 'SELECT status, IdMedicamento, quantidade FROM Solicitacoes WHERE idSolicitacao = :id';
      LQry.ParamByName('id').AsInteger := AId;
      LQry.Open;

      if LQry.IsEmpty then
        raise Exception.Create('Solicitação não encontrada no banco de dados.');

      LStatusAtual := LQry.FieldByName('status').AsString;
      LIdMed := LQry.FieldByName('IdMedicamento').AsInteger;
      LQtd := LQry.FieldByName('quantidade').AsInteger;
      LQry.Close;

      // 2. ESTORNO DE ESTOQUE: Se o admin cancelou algo que estava pendente, devolve o remédio pra prateleira!
      if (ANovoStatus = 'Cancelado') and ((LStatusAtual = 'Pendente') or (LStatusAtual = 'Aprovado')) then
      begin
        // Proteção extra: só estorna se o remédio ainda existir no catálogo
        if LIdMed > 0 then
        begin
          LQry.SQL.Text := 'UPDATE Medicamentos SET quantidadeEstoque = quantidadeEstoque + :qtd WHERE idMedicamento = :idMed';
          LQry.ParamByName('qtd').AsInteger := LQtd;
          LQry.ParamByName('idMed').AsInteger := LIdMed;
          LQry.ExecSQL;
        end;
      end;

      // 3. Efetiva a alteração do pedido
      LQry.SQL.Text := 'UPDATE Solicitacoes SET status = :status, observacao = :obs WHERE idSolicitacao = :id';
      LQry.ParamByName('status').AsString := ANovoStatus;
      LQry.ParamByName('obs').AsString := AObservacao;
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
