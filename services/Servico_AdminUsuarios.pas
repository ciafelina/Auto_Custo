unit Servico_AdminUsuarios;

interface

uses
  System.SysUtils, Data.DB, FireDAC.Comp.Client, Conexao, System.JSON,
  Excecoes, Mensagens, System.MaskUtils, BCrypt;

type
  TServicoAdminUsuarios = class
  public
    class function Listar(APage, ALimit: Integer; const ABusca, AStatus: string; ACargo: Integer): TJSONObject;
    class procedure Inserir(AJson: TJSONObject);
    class procedure Atualizar(const ACPF: string; AJson: TJSONObject);
    class procedure AtualizarCargo(const ACPF: string; ACargo: Integer);
    class procedure AtualizarStatus(const ACPF, AStatus: string);
  end;

implementation

class function TServicoAdminUsuarios.Listar(APage, ALimit: Integer; const ABusca, AStatus: string; ACargo: Integer): TJSONObject;
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

    if ABusca <> '' then LFiltroBusca := '%' + ABusca + '%'
    else LFiltroBusca := '%';

    // 1. ESTATÍSTICAS GLOBAIS E FILTRADAS
    LQry.SQL.Add('SELECT ');
    LQry.SQL.Add('  (SELECT COUNT(*) FROM Usuarios) AS Total, ');
    LQry.SQL.Add('  (SELECT COUNT(*) FROM Usuarios WHERE IdCargo = 1) AS TotalAdmins, ');
    LQry.SQL.Add('  (SELECT COUNT(*) FROM Usuarios WHERE IdCargo = 2) AS TotalFuncs, ');
    LQry.SQL.Add('  (SELECT COUNT(*) FROM Usuarios WHERE IdCargo = 3) AS TotalPacs, ');
    LQry.SQL.Add('  (SELECT COUNT(*) FROM Usuarios WHERE (nomeUsuario LIKE :Busca OR CAST(idUsuarioCPF AS VARCHAR) LIKE :Busca) ');

    if ACargo > 0 then LQry.SQL.Add(' AND IdCargo = :Cargo ');
    if AStatus <> '' then LQry.SQL.Add(' AND status = :Status ');

    LQry.SQL.Add('  ) AS TotalLista');

    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    if ACargo > 0 then LQry.ParamByName('Cargo').AsInteger := ACargo;
    if AStatus <> '' then LQry.ParamByName('Status').AsString := AStatus;

    LQry.Open;
    Result.AddPair('total', TJSONNumber.Create(LQry.FieldByName('Total').AsInteger));
    Result.AddPair('totalAdmins', TJSONNumber.Create(LQry.FieldByName('TotalAdmins').AsInteger));
    Result.AddPair('totalFuncionarios', TJSONNumber.Create(LQry.FieldByName('TotalFuncs').AsInteger));
    Result.AddPair('totalPacientes', TJSONNumber.Create(LQry.FieldByName('TotalPacs').AsInteger));
    Result.AddPair('totalLista', TJSONNumber.Create(LQry.FieldByName('TotalLista').AsInteger));
    LQry.Close;

    // 2. LISTA PAGINADA DE USUÁRIOS
    LQry.SQL.Clear;
    LQry.SQL.Add('SELECT idUsuarioCPF, nomeUsuario, email, IdCargo, status ');
    LQry.SQL.Add('FROM Usuarios WHERE (nomeUsuario LIKE :Busca OR CAST(idUsuarioCPF AS VARCHAR) LIKE :Busca) ');

    if ACargo > 0 then LQry.SQL.Add(' AND IdCargo = :Cargo ');
    if AStatus <> '' then LQry.SQL.Add(' AND status = :Status ');

    LQry.SQL.Add('ORDER BY nomeUsuario ASC OFFSET :Offset ROWS FETCH NEXT :Limit ROWS ONLY');

    LQry.ParamByName('Busca').AsString := LFiltroBusca;
    if ACargo > 0 then LQry.ParamByName('Cargo').AsInteger := ACargo;
    if AStatus <> '' then LQry.ParamByName('Status').AsString := AStatus;
    LQry.ParamByName('Offset').AsInteger := LOffset;
    LQry.ParamByName('Limit').AsInteger := ALimit;

    LQry.Open;

    LArray := TJSONArray.Create;
    while not LQry.Eof do
    begin
      var LCPF := LQry.FieldByName('idUsuarioCPF').AsString;
      // Preenche com zeros à esquerda caso o CPF tenha sumido (ex: CPFs que começam com 0)
      LCPF := StringOfChar('0', 11 - Length(LCPF)) + LCPF;
      var LCPFFormatado := FormatMaskText('000\.000\.000\-00;0;_', LCPF);

      LArray.AddElement(
        TJSONObject.Create
          .AddPair('cpf', LCPF) // CPF Limpo para o JS usar nos botões
          .AddPair('cpfFormatado', LCPFFormatado) // CPF bonito para exibição
          .AddPair('nome', LQry.FieldByName('nomeUsuario').AsString)
          .AddPair('email', LQry.FieldByName('email').AsString)
          .AddPair('idCargo', TJSONNumber.Create(LQry.FieldByName('IdCargo').AsInteger))
          .AddPair('status', LQry.FieldByName('status').AsString)
      );
      LQry.Next;
    end;

    Result.AddPair('lista', LArray);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminUsuarios.Inserir(AJson: TJSONObject);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LCPFLimpo, LSenhaLimpa, LHashSenha: string;
begin
  LCPFLimpo := StringReplace(AJson.GetValue<string>('cpf', ''), '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);

  LSenhaLimpa := AJson.GetValue<string>('senha', '');
  LHashSenha := TBCrypt.GenerateHash(LSenhaLimpa); // Criptografa a senha!

  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    // O cargo padrão é 3 (Paciente) ao criar, o admin pode alterar depois pelo painel
    LQry.SQL.Add('INSERT INTO Usuarios (idUsuarioCPF, nomeUsuario, email, senha, IdCargo, status) ');
    LQry.SQL.Add('VALUES (:cpf, :nome, :email, :senha, 3, ''Ativo'')');

    LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
    LQry.ParamByName('nome').AsString := AJson.GetValue<string>('nome', '');
    LQry.ParamByName('email').AsString := AJson.GetValue<string>('email', '');
    LQry.ParamByName('senha').AsString := LHashSenha;

    try
      LQry.ExecSQL;
    except
      on E: Exception do
        raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Este CPF já está cadastrado no sistema.');
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminUsuarios.Atualizar(const ACPF: string; AJson: TJSONObject);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Usuarios SET nomeUsuario = :nome, email = :email WHERE idUsuarioCPF = :cpf';
    LQry.ParamByName('nome').AsString := AJson.GetValue<string>('nome', '');
    LQry.ParamByName('email').AsString := AJson.GetValue<string>('email', '');
    LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(ACPF, 0);
    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminUsuarios.AtualizarCargo(const ACPF: string; ACargo: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Usuarios SET IdCargo = :cargo WHERE idUsuarioCPF = :cpf';
    LQry.ParamByName('cargo').AsInteger := ACargo;
    LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(ACPF, 0);
    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoAdminUsuarios.AtualizarStatus(const ACPF, AStatus: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Text := 'UPDATE Usuarios SET status = :status WHERE idUsuarioCPF = :cpf';
    LQry.ParamByName('status').AsString := AStatus;
    LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(ACPF, 0);
    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
