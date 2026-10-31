unit Servico_Solicitacao;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, FireDAC.Stan.Param, FireDAC.Stan.Option, Conexao, System.JSON, Excecoes, Mensagens;

type
  TServicoSolicitacao = class
  public
    class procedure NovaSolicitacao(const ACPF: string; AQuantidade, AIdMedicamento: Integer);
    class procedure ConfirmarRetirada(AIdSolicitacao: Integer; const ACPF: string);
  end;

implementation

class procedure TServicoSolicitacao.ConfirmarRetirada(AIdSolicitacao: Integer; const ACPF: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Solicitacoes SET status = ''Retirado'' WHERE idSolicitacao = :ID AND idUsuarioCPF = :CPF AND status = ''Aprovado''';
    LQry.ParamByName('ID').AsInteger := AIdSolicitacao;
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ACPF);
    LQry.ExecSQL;
    if LQry.RowsAffected = 0 then
      raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Solicitação aprovada não encontrada para este usuário.');
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoSolicitacao.NovaSolicitacao(const ACPF: string; AQuantidade, AIdMedicamento: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LCPFLimpo: string;
  LMedicamentoExiste: Boolean;
begin
  if AQuantidade <= 0 then
    raise EErroApi.Create(400, TCodigoErro.QuantidadeInvalida, 'A quantidade deve ser um número inteiro maior que zero.');
  if AIdMedicamento <= 0 then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O identificador do medicamento deve ser maior que zero.');
  LCPFLimpo := StringReplace(ACPF, '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);

  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    LConn.TxOptions.Isolation := xiSerializible;
    LConn.StartTransaction;
    try
      // Proteger o usuário até gravar o pedido, inclusive contra exclusão
      // entre a autenticação da requisição e o início desta transação.
      LQry.SQL.Text := 'SELECT status FROM Usuarios WHERE idUsuarioCPF = :CPF';
      LQry.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
      LQry.Open;
      if LQry.IsEmpty then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'A conta não está disponível para criar solicitações. Faça login novamente.');
      if not SameText(Trim(LQry.FieldByName('status').AsString), 'Ativo') then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'A conta não está ativa para criar solicitações.');
      LQry.Close;
      // A condição é avaliada no mesmo UPDATE que reserva o estoque.
      // Evita que duas transações reservem as mesmas unidades.
      LQry.SQL.Text := 'UPDATE Medicamentos SET quantidadeEstoque = quantidadeEstoque - :Qtd ' +
        'WHERE idMedicamento = :IdMed AND quantidadeEstoque >= :Qtd';
      LQry.ParamByName('Qtd').AsInteger := AQuantidade;
      LQry.ParamByName('IdMed').AsInteger := AIdMedicamento;
      LQry.ExecSQL;
      if LQry.RowsAffected <> 1 then
      begin
        LQry.SQL.Text := 'SELECT idMedicamento FROM Medicamentos WHERE idMedicamento = :IdMed';
        LQry.ParamByName('IdMed').AsInteger := AIdMedicamento;
        LQry.Open;
        LMedicamentoExiste := not LQry.IsEmpty;
        LQry.Close;
        if not LMedicamentoExiste then
          raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Medicamento não encontrado.');
        raise EErroApi.Create(409, TCodigoErro.EstoqueInsuficiente, 'Estoque insuficiente para a quantidade solicitada. Atualize a consulta de estoque e tente novamente.');
      end;

      LQry.SQL.Text := 'INSERT INTO Solicitacoes (idUsuarioCPF, IdMedicamento, quantidade, dataSolicitacao, status, observacao) ' +
        'VALUES (:CPF, :IdMed, :Quantidade, GETDATE(), ''Pendente'', ''Aguardando análise.'')';
      LQry.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
      LQry.ParamByName('IdMed').AsInteger := AIdMedicamento;
      LQry.ParamByName('Quantidade').AsInteger := AQuantidade;
      LQry.ExecSQL;

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
        raise EErroApi.Create(500, TCodigoErro.ErroGravacaoBanco, 'Não foi possível registrar a solicitação. Tente novamente.');
      end;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
