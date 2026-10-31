unit Conexao;
interface
uses System.SysUtils, System.Classes, System.RegularExpressions,
  FireDAC.Comp.Client, FireDAC.Stan.Param, FireDAC.Stan.Option, FireDAC.Phys.SQLite,
  FireDAC.Phys.SQLiteWrapper,
  FireDAC.Phys.SQLiteWrapper.Stat, FireDAC.DApt, FireDAC.Stan.Def,
  FireDAC.Stan.Async, FireDAC.ConsoleUI.Wait;
type
  // Compatibilidade T-SQL no banco fictício; locks MSSQL são testados na suíte real.
  TFDQuery = class(FireDAC.Comp.Client.TFDQuery)
  protected
    procedure DoBeforeOpen; override;
  end;
  TProvedorConexao = class
    class function ObterConexao: TFDConnection;
  end;
procedure PrepararBaseTeste;
implementation
procedure TFDQuery.DoBeforeOpen;
var
  LSQL: string;
  LParams: TFDParams;
begin
  LSQL := TRegEx.Replace(SQL.Text, 'WITH\s*\(XLOCK,\s*HOLDLOCK\)', '', [roIgnoreCase]);
  LSQL := TRegEx.Replace(LSQL,
    'OFFSET\s+:Offset\s+ROWS\s+FETCH\s+NEXT\s+:Limit\s+ROWS\s+ONLY',
    'LIMIT :Limit OFFSET :Offset', [roIgnoreCase]);
  if LSQL <> SQL.Text then
  begin
    LParams := TFDParams.Create;
    try
      LParams.Assign(Params);
      SQL.Text := LSQL;
      Params.Assign(LParams);
    finally
      LParams.Free;
    end;
  end;
  inherited;
end;

type
  TFuncaoDataTeste = class(TFDSQLiteFunction)
    procedure Calcular(AFunc: TSQLiteFunctionInstance; AInputs: TSQLiteInputs;
      AOutput: TSQLiteOutput; var AUserData: TObject);
  end;
var
  FFuncaoData: TFuncaoDataTeste;

procedure TFuncaoDataTeste.Calcular(AFunc: TSQLiteFunctionInstance;
  AInputs: TSQLiteInputs; AOutput: TSQLiteOutput; var AUserData: TObject);
begin
  AOutput.AsDateTime := Now;
end;

class function TProvedorConexao.ObterConexao: TFDConnection;
begin
  Result := TFDConnection.Create(nil);
  Result.LoginPrompt := False;
  Result.Params.Values['DriverID'] := 'SQLite';
  Result.Params.Values['Database'] := ExtractFilePath(ParamStr(0)) + 'autenticacao-test.sqlite';
  Result.Params.Values['BusyTimeout'] := '10000';
  Result.Params.Values['LockingMode'] := 'Normal';
  Result.Params.Values['JournalMode'] := 'WAL';
  Result.Params.Values['SharedCache'] := 'False';
  Result.UpdateOptions.LockWait := True;
  // O SQLite não tem XLOCK por linha. BEGIN IMMEDIATE reserva a escrita
  // antes das leituras e evita SQLITE_BUSY na promoção de um snapshot WAL.
  // A ordem e a granularidade dos locks MSSQL são verificadas na suíte real.
  Result.TxOptions.Isolation := xiSnapshot;
  Result.Connected := True;
end;
procedure PrepararBaseTeste;
var C: TFDConnection;
begin
  FFuncaoData := TFuncaoDataTeste.Create(nil);
  FFuncaoData.FunctionName := 'GETDATE';
  FFuncaoData.ArgumentsCount := 0;
  FFuncaoData.Deterministic := False;
  FFuncaoData.OnCalculate := FFuncaoData.Calcular;
  FFuncaoData.Active := True;
  C := TProvedorConexao.ObterConexao;
  try
    C.ExecSQL('DROP TABLE IF EXISTS Usuarios');
    C.ExecSQL('DROP TABLE IF EXISTS RecuperacoesSenha');
    C.ExecSQL('CREATE TABLE RecuperacoesSenha (tokenHash TEXT PRIMARY KEY,idUsuarioCPF BIGINT,emailVinculo TEXT,senhaVinculo TEXT,criadoEm BIGINT,expiraEm BIGINT,usado INTEGER)');
    C.ExecSQL('DROP TABLE IF EXISTS Solicitacoes');
    C.ExecSQL('DROP TABLE IF EXISTS Medicamentos');
    C.ExecSQL('CREATE TABLE Usuarios (idUsuarioCPF BIGINT PRIMARY KEY, nomeUsuario TEXT, IdCargo INTEGER, status TEXT DEFAULT ''Ativo'', email TEXT, telefone TEXT, endereco TEXT, dataNascimento TEXT, dadosSaude TEXT, senha TEXT)');
    C.ExecSQL('INSERT INTO Usuarios (idUsuarioCPF, nomeUsuario, IdCargo, status) VALUES (11111111111,''Paciente'',3,''Ativo''),(22222222222,''Outro paciente'',3,''Ativo''),' +
      '(33333333333,''Funcionário'',2,''Ativo''),(44444444444,''Administrador'',1,''Ativo''),(55555555555,''Inativo'',1,''Inativo''),' +
      '(66666666666,''Cargo desconhecido'',99,''Ativo''),(1234567890,''CPF com zero'',3,''Ativo'')');
    C.ExecSQL('CREATE TABLE Solicitacoes (idSolicitacao INTEGER PRIMARY KEY, idUsuarioCPF BIGINT, status TEXT, IdMedicamento INTEGER, quantidade INTEGER, observacao TEXT, dataSolicitacao DATETIME)');
    C.ExecSQL('INSERT INTO Solicitacoes (idSolicitacao,idUsuarioCPF,status,IdMedicamento,quantidade,observacao) ' +
      'VALUES (1,11111111111,''Aprovado'',1,1,''''),(2,22222222222,''Aprovado'',1,1,''''),(3,11111111111,''Pendente'',1,1,'''')');
    C.ExecSQL('CREATE TABLE Medicamentos (idMedicamento INTEGER PRIMARY KEY, quantidadeEstoque INTEGER, ' +
      'nome TEXT, categoria TEXT, dosagem TEXT, fabricante TEXT, estoqueMinimo INTEGER, descricao TEXT)');
    C.ExecSQL('INSERT INTO Medicamentos (idMedicamento,quantidadeEstoque) VALUES (1,10)');
  finally C.Free; end;
end;
initialization
finalization
  FFuncaoData.Free;
end.
