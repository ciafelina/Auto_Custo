unit Servico_Dashboard;

interface

uses
  System.JSON, FireDAC.Comp.Client, Conexao, System.SysUtils, Data.DB;

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
    // Segredo para ler os cards e a lista de zerados sem fechar a query!
    LQry.FetchOptions.AutoClose := False;

    LQry.SQL.Text := 'EXEC sp_ObterDashboardAdmin';
    LQry.Open;

    // 1. Preenche os Cards
    Result.AddPair('totalUsuarios', TJSONNumber.Create(LQry.FieldByName('TotalUsuarios').AsInteger));
    Result.AddPair('totalMedicamentos', TJSONNumber.Create(LQry.FieldByName('TotalMedicamentos').AsInteger));
    Result.AddPair('estoqueCritico', TJSONNumber.Create(LQry.FieldByName('EstoqueCritico').AsInteger));
    Result.AddPair('solicitacoesPendentes', TJSONNumber.Create(LQry.FieldByName('SolicitacoesPendentes').AsInteger));

    // 2. Preenche a lista de remédios zerados
    LQry.NextRecordSet;
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

    LQry.SQL.Text := 'EXEC sp_ObterDashboardPaciente @CPF = :CPF, @Page = :Page, @Limit = :Limit';
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ACPF);
    LQry.ParamByName('Page').AsInteger := APage;
    LQry.ParamByName('Limit').AsInteger := ALimit;
    LQry.Open;

    // Resumo
    Result.AddPair('total', TJSONNumber.Create(LQry.FieldByName('Total').AsInteger));
    Result.AddPair('pendentes', TJSONNumber.Create(LQry.FieldByName('Pendentes').AsInteger));
    Result.AddPair('aprovados', TJSONNumber.Create(LQry.FieldByName('Aprovados').AsInteger));
    Result.AddPair('reprovados', TJSONNumber.Create(LQry.FieldByName('Reprovados').AsInteger));

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
