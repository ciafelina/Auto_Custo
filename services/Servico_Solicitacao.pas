unit Servico_Solicitacao;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, Conexao, System.JSON, Excecoes, Mensagens;

type
  TServicoSolicitacao = class
  public
    // A assinatura mudou: tiramos a string AMedicamento
    class procedure NovaSolicitacao(const ACPF: string; AQuantidade, AIdMedicamento: Integer);
    class procedure ConfirmarRetirada(AIdSolicitacao: Integer);
  end;

implementation

class procedure TServicoSolicitacao.ConfirmarRetirada(AIdSolicitacao: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Solicitacoes SET status = ''Retirado'' WHERE idSolicitacao = :ID AND status = ''Aprovado''';
    LQry.ParamByName('ID').AsInteger := AIdSolicitacao;
    LQry.ExecSQL;
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
begin
  // Remove formatação do CPF caso venha com pontos
  LCPFLimpo := StringReplace(ACPF, '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);

  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    LConn.StartTransaction;
    try
      LQry.SQL.Clear;
      // CORREÇÃO AQUI: Trocamos 'medicamento' por 'IdMedicamento' no INSERT
      LQry.SQL.Add('INSERT INTO Solicitacoes (idUsuarioCPF, IdMedicamento, quantidade, dataSolicitacao, status, observacao) ');
      LQry.SQL.Add('VALUES (:CPF, :IdMed, :Quantidade, GETDATE(), ''Pendente'', ''Aguardando análise.'')');

      LQry.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
      LQry.ParamByName('IdMed').AsInteger := AIdMedicamento;
      LQry.ParamByName('Quantidade').AsInteger := AQuantidade;
      LQry.ExecSQL;

      // Dá baixa no Estoque
      LQry.SQL.Clear;
      LQry.SQL.Add('UPDATE Medicamentos SET quantidadeEstoque = quantidadeEstoque - :Qtd WHERE idMedicamento = :IdMed');
      LQry.ParamByName('Qtd').AsInteger := AQuantidade;
      LQry.ParamByName('IdMed').AsInteger := AIdMedicamento;
      LQry.ExecSQL;

      LConn.Commit;
    except
      on E: Exception do
      begin
        LConn.Rollback;
        raise Exception.Create('Falha no banco de dados: ' + E.Message);
      end;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
