program LinuxDatabaseProbe;
{$APPTYPE CONSOLE}
uses System.SysUtils, FireDAC.Comp.Client, FireDAC.Stan.Error, FireDAC.DApt,
  System.RegularExpressions, System.Hash, System.JSON,
  Servico_Dashboard in 'services\Servico_Dashboard.pas',
  Conexao, Secrets, Excecoes, Mensagens;
var C: TFDConnection; Q: TFDQuery; I: Integer;
  LDefinition, LExpectedHash: string; LJson: TJSONObject;
begin
  try
    CarregarSegredos;
    C := TProvedorConexao.ObterConexao;
    try
      Writeln('ODBC_SECURITY=', C.Params.Values['ODBCAdvanced']);
      Flush(Output);
      C.Connected := True;
      Q := TFDQuery.Create(nil);
      try
        Q.Connection := C;
        Q.SQL.Text := 'SELECT DB_NAME() AS Banco';
        Q.Open;
        if Q.FieldByName('Banco').AsString <> GetEnvironmentVariable('AUTO_CUSTO_EXPECTED_DATABASE') then
          Halt(4);
        Writeln('DATABASE_IDENTITY_OK');
        Q.Close;
        Q.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM sys.tables WHERE schema_id = SCHEMA_ID(''dbo'') ' +
          'AND name IN (''Cargos'',''Usuarios'',''Medicamentos'',''Solicitacoes'',''Interessados'',''Documentos'',''Arquivo'')';
        Q.Open;
        if Q.FieldByName('Qtd').AsInteger <> 7 then Halt(5);
        Writeln('SEVEN_TABLES_OK');
        Q.Close;
        Q.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM sys.procedures WHERE name = ''sp_ObterDashboardPaciente''';
        Q.Open;
        if Q.FieldByName('Qtd').AsInteger <> 1 then Halt(6);
        Writeln('PATIENT_PROCEDURE_OK');
        Q.Close;
        Q.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM (VALUES ' +
          '(''Cargos'',''SELECT''), ' +
          '(''Usuarios'',''SELECT''),(''Usuarios'',''INSERT''),(''Usuarios'',''UPDATE''),(''Usuarios'',''DELETE''), ' +
          '(''Medicamentos'',''SELECT''),(''Medicamentos'',''INSERT''),(''Medicamentos'',''UPDATE''),(''Medicamentos'',''DELETE''), ' +
          '(''Solicitacoes'',''SELECT''),(''Solicitacoes'',''INSERT''),(''Solicitacoes'',''UPDATE''), ' +
          '(''Interessados'',''SELECT''),(''Interessados'',''INSERT''), ' +
          '(''Documentos'',''SELECT''),(''Documentos'',''INSERT''), ' +
          '(''Arquivo'',''SELECT''),(''Arquivo'',''INSERT''), ' +
          '(''sp_ObterDashboardPaciente'',''EXECUTE'')) P(Nome,Permissao) ' +
          'WHERE COALESCE(HAS_PERMS_BY_NAME(''dbo.''+P.Nome,''OBJECT'',P.Permissao),0) <> 1';
        Q.Open;
        if Q.FieldByName('Qtd').AsInteger <> 0 then Halt(7);
        Writeln('API_PERMISSIONS_OK');
        // Optional publication compatibility check: metadata and read-only services only.
        LExpectedHash := GetEnvironmentVariable('AUTO_CUSTO_EXPECTED_PATIENT_PROCEDURE_HASH');
        if LExpectedHash <> '' then
        begin
          Q.Close;
          Q.SQL.Text := 'SELECT TOP (0) IdCargo, NomeCargo FROM dbo.Cargos; ' +
            'SELECT TOP (0) idUsuarioCPF, nomeUsuario, senha, email, dataNascimento, telefone, endereco, dadosSaude, IdCargo, status FROM dbo.Usuarios; ' +
            'SELECT TOP (0) idMedicamento, nome, descricao, categoria, dosagem, fabricante, quantidadeEstoque, estoqueMinimo FROM dbo.Medicamentos; ' +
            'SELECT TOP (0) idSolicitacao, idUsuarioCPF, dataSolicitacao, status, observacao, quantidade, IdMedicamento FROM dbo.Solicitacoes; ' +
            'SELECT TOP (0) idInteressado, documentoInteressado, nomeInteressado FROM dbo.Interessados; ' +
            'SELECT TOP (0) idDoc, tipo, dataDoc, nivelEnsino, serieAnoCicloModulo, via, observacao, anoRef, n_folhas, dataHora, idInteressado, idUsuarioCPF FROM dbo.Documentos; ' +
            'SELECT TOP (0) prontuario, caixa, prateleiraCorredor, dataHora, idDoc, idUsuarioCPF FROM dbo.Arquivo';
          Q.FetchOptions.AutoClose := False;
          Q.Open;
          for I := 1 to 6 do Q.NextRecordSet;
          Writeln('API_COLUMNS_OK');
          Q.Close;
          Q.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM dbo.Cargos WHERE IdCargo IN (1,2,3)';
          Q.Open;
          if Q.FieldByName('Qtd').AsInteger <> 3 then Halt(8);
          Writeln('THREE_ROLES_OK');
          Q.Close;
          Q.SQL.Text := 'SELECT max_length FROM sys.columns WHERE object_id=OBJECT_ID(''dbo.Usuarios'') AND name=''senha''';
          Q.Open;
          if Q.Eof or ((Q.FieldByName('max_length').AsInteger <> -1) and (Q.FieldByName('max_length').AsInteger < 60)) then Halt(9);
          Writeln('PASSWORD_COLUMN_LENGTH_OK');
          Q.Close;
          Q.SQL.Text := 'SELECT OBJECT_DEFINITION(OBJECT_ID(''dbo.sp_ObterDashboardPaciente'')) AS Definicao';
          Q.Open;
          LDefinition := Q.FieldByName('Definicao').AsString;
          LDefinition := TRegEx.Replace(LDefinition, '/\*[\s\S]*?\*/|--[^\r\n]*', '');
          LDefinition := LowerCase(StringReplace(StringReplace(LDefinition, '[', '', [rfReplaceAll]), ']', '', [rfReplaceAll]));
          LDefinition := StringReplace(LDefinition, 'dbo.', '', [rfReplaceAll]);
          LDefinition := TRegEx.Replace(LDefinition, '\s+', '');
          if not SameText(THashSHA2.GetHashString(LDefinition), LExpectedHash) then Halt(10);
          Writeln('PATIENT_PROCEDURE_READ_ONLY_DEFINITION_OK');
          // Exact normalized definition matched the previously verified SELECT-only procedure.
          LJson := TServicoDashboard.ObterDadosAdmin;
          LJson.Free;
          Writeln('ADMIN_DASHBOARD_READ_OK');
          LJson := TServicoDashboard.ObterDadosPaciente('00000000000', 1, 1);
          LJson.Free;
          Writeln('PATIENT_DASHBOARD_READ_OK');
        end;
        Writeln('MSSQL_LINUX_READ_ONLY_OK');
        Flush(Output);
      finally Q.Free; end;
    finally C.Free; end;
  except
    on E: EFDDBEngineException do
    begin
      Writeln('DRIVER_ERROR_KIND=', Ord(E.Kind));
      Writeln('DRIVER_ERROR_COUNT=', E.ErrorCount);
      Writeln('FIREDAC_CODE=', E.FDCode);
      for I := 0 to E.ErrorCount - 1 do Writeln('DRIVER_CODE=', E.Errors[I].ErrorCode);
      if Pos('libodbc', E.Message) > 0 then Writeln('ODBC_LIBRARY_REFERENCE');
      if Pos('data source name', LowerCase(E.Message)) > 0 then Writeln('ODBC_DATA_SOURCE_NAME_ERROR');
      if Pos('certificate', LowerCase(E.Message)) > 0 then Writeln('CERTIFICATE_ERROR');
      if Pos('self-signed', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=SELF_SIGNED');
      if Pos('hostname', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=HOSTNAME');
      if Pos('subject name', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=SUBJECT_NAME');
      if Pos('key too weak', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=WEAK_KEY');
      if Pos('digest algorithm too weak', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=WEAK_SIGNATURE');
      if Pos('purpose', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=PURPOSE');
      if Pos('unable to get', LowerCase(E.Message)) > 0 then Writeln('TLS_REASON=ISSUER');
      Flush(Output);
      Halt(1);
    end;
    on E: Exception do
    begin
      Writeln('PROBE_ERROR_TYPE=', E.ClassName);
      Flush(Output);
      Halt(1);
    end;
  end;
end.
