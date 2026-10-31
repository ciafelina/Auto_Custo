unit Servico_AdminSolicitacoes;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, FireDAC.Stan.Param, Conexao, System.JSON, Excecoes, Mensagens, System.MaskUtils;

type
  TServicoAdminSolicitacoes = class
  public
    class function Listar(APage, ALimit: Integer; const ABusca, AStatus: string): TJSONObject;
    class procedure AlterarStatus(AId: Integer; const ANovoStatus, AObservacao: string;
      AAtualizarObservacao: Boolean = True);
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

class procedure TServicoAdminSolicitacoes.AlterarStatus(AId: Integer; const ANovoStatus, AObservacao: string;
  AAtualizarObservacao: Boolean);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LNovoStatus, LOrigemPermitida: string;
  LIdMed, LIdMedBloqueado: Integer;
  LQtd: Int64;
  LExiste: Boolean;
begin
  if AId <= 0 then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Identificador da solicitação inválido.');
  LNovoStatus := Trim(ANovoStatus);
  if LNovoStatus = 'Aprovado' then
    LOrigemPermitida := 'status = ''Pendente'''
  else if LNovoStatus = 'Retirado' then
    LOrigemPermitida := 'status = ''Aprovado'''
  else if LNovoStatus = 'Cancelado' then
    LOrigemPermitida := 'status IN (''Pendente'', ''Aprovado'')'
  else if LNovoStatus = 'Pendente' then
    LOrigemPermitida := '1 = 0'
  else
    raise EErroApi.Create(400, TCodigoErro.StatusInvalido, 'Status de solicitação inválido.');

  LConn := TProvedorConexao.ObterConexao;
  try
    LQry := TFDQuery.Create(nil);
    try
      LQry.Connection := LConn;
      LIdMedBloqueado := 0;
      if LNovoStatus = 'Cancelado' then
      begin
        // Descobrir o cadastro sem manter lock de solicitação ao bloqueá-lo.
        LQry.SQL.Text := 'SELECT IdMedicamento FROM Solicitacoes WHERE idSolicitacao = :id';
        LQry.ParamByName('id').AsInteger := AId;
        LQry.Open;
        if not LQry.IsEmpty then
          LIdMedBloqueado := LQry.FieldByName('IdMedicamento').AsInteger;
        LQry.Close;
      end;
      LConn.StartTransaction;
      try
        if (LNovoStatus = 'Cancelado') and (LIdMedBloqueado > 0) then
        begin
          // Mesma ordem de pedido/exclusão: medicamento antes da solicitação.
          LQry.SQL.Text := 'SELECT idMedicamento FROM Medicamentos WITH (XLOCK, HOLDLOCK) WHERE idMedicamento = :id';
          LQry.ParamByName('id').AsInteger := LIdMedBloqueado;
          LQry.Open;
          LQry.Close;
        end;
        // Ganhar a transição antes de qualquer estorno. O UPDATE mantém o
        // bloqueio até o commit e compete também com a retirada do paciente.
        LQry.SQL.Text := 'UPDATE Solicitacoes SET status = :novo';
        if AAtualizarObservacao then
          LQry.SQL.Add(', observacao = :obs');
        LQry.SQL.Add('WHERE idSolicitacao = :id AND ' + LOrigemPermitida);
        LQry.ParamByName('novo').AsString := LNovoStatus;
        if AAtualizarObservacao then
          LQry.ParamByName('obs').AsString := AObservacao;
        LQry.ParamByName('id').AsInteger := AId;
        LQry.ExecSQL;
        if LQry.RowsAffected <> 1 then
        begin
          LQry.SQL.Text := 'SELECT idSolicitacao FROM Solicitacoes WHERE idSolicitacao = :id';
          LQry.ParamByName('id').AsInteger := AId;
          LQry.Open;
          LExiste := not LQry.IsEmpty;
          LQry.Close;
          if not LExiste then
            raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Solicitação não encontrada.');
          raise EErroApi.Create(409, TCodigoErro.TransicaoStatusInvalida, 'Esta mudança de status não é permitida. Atualize a lista de solicitações.');
        end;

        if LNovoStatus = 'Cancelado' then
        begin
          LQry.SQL.Text := 'SELECT IdMedicamento, quantidade FROM Solicitacoes WHERE idSolicitacao = :id';
          LQry.ParamByName('id').AsInteger := AId;
          LQry.Open;
          LIdMed := LQry.FieldByName('IdMedicamento').AsInteger;
          LQtd := LQry.FieldByName('quantidade').AsLargeInt;
          LQry.Close;
          if (LIdMed <= 0) or (LIdMed <> LIdMedBloqueado) or
             (LQtd <= 0) or (LQtd > High(Integer)) then
            raise EErroApi.Create(409, TCodigoErro.EstornoEstoqueInvalido, 'A solicitação não possui medicamento e quantidade válidos para devolver ao estoque.');

          LQry.SQL.Text := 'UPDATE Medicamentos SET quantidadeEstoque = quantidadeEstoque + :qtd ' +
            'WHERE idMedicamento = :idMed AND quantidadeEstoque >= 0 AND quantidadeEstoque <= :limite';
          LQry.ParamByName('qtd').AsInteger := Integer(LQtd);
          LQry.ParamByName('idMed').AsInteger := LIdMed;
          LQry.ParamByName('limite').AsInteger := High(Integer) - Integer(LQtd);
          LQry.ExecSQL;
          if LQry.RowsAffected <> 1 then
            raise EErroApi.Create(409, TCodigoErro.EstornoEstoqueInvalido, 'Não foi possível devolver o estoque. Revise o medicamento e o saldo antes de cancelar.');
        end;
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
          raise EErroApi.Create(500, TCodigoErro.ErroGravacaoBanco, 'Não foi possível alterar o status da solicitação. Tente novamente.');
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
