unit Servico_Dashboard;

interface

uses
  System.JSON, FireDAC.Comp.Client, Conexao, System.SysUtils, Data.DB, Estoque;

type
  TServicoDashboard = class
  public
    class function ObterDadosPaciente(const ACPF: string; APage, ALimit: Integer): TJSONObject;
    class function ObterDadosAdmin: TJSONObject;
  end;

implementation

class function TServicoDashboard.ObterDadosAdmin: TJSONObject;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LArrayZerados: TJSONArray;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  Result := TJSONObject.Create;
  try
    LQry.Connection := LConn;
    // A contagem usa os mesmos limites dos filtros da consulta de estoque.
    LQry.SQL.Text :=
      'SELECT (SELECT COUNT(*) FROM Usuarios) AS TotalUsuarios, ' +
      '(SELECT COUNT(*) FROM Medicamentos) AS TotalMedicamentos, ' +
      '(SELECT COUNT(*) FROM Medicamentos WHERE ' + FiltroEstoque('low') + ') AS EstoqueCritico, ' +
      '(SELECT COUNT(*) FROM Solicitacoes WHERE status = ''Pendente'') AS SolicitacoesPendentes';
    LQry.Open;

    // 1. Preenche os Cards
    Result.AddPair('totalUsuarios', TJSONNumber.Create(LQry.FieldByName('TotalUsuarios').AsInteger));
    Result.AddPair('totalMedicamentos', TJSONNumber.Create(LQry.FieldByName('TotalMedicamentos').AsInteger));
    Result.AddPair('estoqueCritico', TJSONNumber.Create(LQry.FieldByName('EstoqueCritico').AsInteger));
    Result.AddPair('solicitacoesPendentes', TJSONNumber.Create(LQry.FieldByName('SolicitacoesPendentes').AsInteger));

    // 2. Preenche a lista de remédios zerados
    LQry.Close;
    LQry.SQL.Text := 'SELECT nome AS MedicamentoZerado FROM Medicamentos WHERE ' +
      FiltroEstoque('out') + ' ORDER BY nome';
    LQry.Open;
    LArrayZerados := TJSONArray.Create;

    while not LQry.Eof do
    begin
      // Adiciona o nome do remédio como uma string direto no Array
      LArrayZerados.AddElement(TJSONString.Create(LQry.FieldByName('MedicamentoZerado').AsString));
      LQry.Next;
    end;

    Result.AddPair('medicamentosZerados', LArrayZerados);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class function TServicoDashboard.ObterDadosPaciente(const ACPF: string; APage, ALimit: Integer): TJSONObject;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LArraySolicitacoes: TJSONArray;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  Result := TJSONObject.Create;
  try
    LQry.Connection := LConn;
    LQry.FetchOptions.AutoClose := False;

    // Ler todos os contadores juntos, incluindo o nome legado Reprovado.
    LQry.SQL.Text := 'SELECT COUNT(*) AS Total, ' +
      'COALESCE(SUM(CASE WHEN status = ''Pendente'' THEN 1 ELSE 0 END), 0) AS Pendentes, ' +
      'COALESCE(SUM(CASE WHEN status = ''Aprovado'' THEN 1 ELSE 0 END), 0) AS Aprovados, ' +
      'COALESCE(SUM(CASE WHEN status IN (''Cancelado'', ''Reprovado'') THEN 1 ELSE 0 END), 0) AS Reprovados ' +
      'FROM Solicitacoes WHERE idUsuarioCPF = :CPF';
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ACPF);
    LQry.Open;

    // Resumo
    Result.AddPair('total', TJSONNumber.Create(LQry.FieldByName('Total').AsInteger));
    Result.AddPair('pendentes', TJSONNumber.Create(LQry.FieldByName('Pendentes').AsInteger));
    Result.AddPair('aprovados', TJSONNumber.Create(LQry.FieldByName('Aprovados').AsInteger));
    Result.AddPair('reprovados', TJSONNumber.Create(LQry.FieldByName('Reprovados').AsInteger));

    // Preservar a procedure para a lista paginada, sem alterar o banco instalado.
    LQry.Close;
    LQry.SQL.Text := 'EXEC sp_ObterDashboardPaciente @CPF = :CPF, @Page = :Page, @Limit = :Limit';
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ACPF);
    LQry.ParamByName('Page').AsInteger := APage;
    LQry.ParamByName('Limit').AsInteger := ALimit;
    LQry.Open;
    LQry.NextRecordSet;
    LArraySolicitacoes := TJSONArray.Create;
    while not LQry.Eof do
    begin
      LArraySolicitacoes.AddElement(
        TJSONObject.Create
          .AddPair('id', TJSONNumber.Create(LQry.FieldByName('idSolicitacao').AsInteger))
          .AddPair('data', FormatDateTime('dd/mm/yyyy', LQry.FieldByName('dataSolicitacao').AsDateTime))
          .AddPair('medicamento', LQry.FieldByName('medicamento').AsString)
          .AddPair('quantidade', TJSONNumber.Create(LQry.FieldByName('quantidade').AsInteger))
          .AddPair('status', LQry.FieldByName('status').AsString)
      );
      LQry.Next;
    end;
    Result.AddPair('solicitacoes', LArraySolicitacoes);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
