unit Servico_Usuario;

interface

uses
  System.SysUtils, FireDAC.Comp.Client, FireDAC.DApt, BCrypt, System.JSON,
  Conexao, Excecoes, Mensagens;

type
  TServicoUsuario = class
  public
    class procedure Cadastrar(const ACPF, ANome, AEmail, ADataNascimento, ATelefone, AEndereco, ADadosSaude, ASenha: string);
    class function ObterPorCPF(const ACPF: string): TJSONObject;
    class procedure AtualizarPerfil(const ACPF, ATelefone, AEndereco, ADataNascimento, ADadosSaude, ASenha: string);
    class procedure ExcluirConta(const ACPF: string);
  end;

implementation

{ TServicoUsuario }


class procedure TServicoUsuario.AtualizarPerfil(const ACPF, ATelefone, AEndereco, ADataNascimento, ADadosSaude, ASenha: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LHash, LCPFLimpo: string;
begin
  // Remove qualquer ponto ou traço
  LCPFLimpo := StringReplace(ACPF, '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('UPDATE Usuarios SET ');
    LQry.SQL.Add('  telefone = :Telefone, ');
    LQry.SQL.Add('  endereco = :Endereco, ');
    LQry.SQL.Add('  dataNascimento = :Data, ');
    LQry.SQL.Add('  dadosSaude = :Saude ');
    if ASenha <> '' then
      LQry.SQL.Add('  , senha = :Senha ');
    LQry.SQL.Add('WHERE idUsuarioCPF = :CPF');
    LQry.ParamByName('Telefone').AsString := ATelefone;
    LQry.ParamByName('Endereco').AsString := AEndereco;
    LQry.ParamByName('Data').AsString := ADataNascimento;
    LQry.ParamByName('Saude').AsString := ADadosSaude;
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0); // Protegido!
    if ASenha <> '' then
    begin
      LHash := TBCrypt.GenerateHash(ASenha);
      LQry.ParamByName('Senha').AsString := LHash;
    end;
    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoUsuario.Cadastrar(const ACPF, ANome, AEmail, ADataNascimento, ATelefone, AEndereco, ADadosSaude, ASenha: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LHash: string;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    // 1. Gera o Hash da senha usando a biblioteca BCrypt corretamente
    LHash := TBCrypt.GenerateHash(ASenha);

    // Adicionamos os novos campos no INSERT
    LQry.SQL.Add('INSERT INTO Usuarios (idUsuarioCPF, nomeUsuario, email, dataNascimento, telefone, endereco, dadosSaude, senha, IdCargo)');
    LQry.SQL.Add('VALUES (:CPF, :Nome, :Email, :DataNascimento, :Telefone, :Endereco, :DadosSaude, :Senha, :IdCargo)');
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ACPF);
    LQry.ParamByName('Nome').AsString        := ANome;
    LQry.ParamByName('Email').AsString       := AEmail;
    if ADataNascimento <> '' then
      LQry.ParamByName('DataNascimento').AsString := ADataNascimento
    else
      LQry.ParamByName('DataNascimento').Clear;
    LQry.ParamByName('Telefone').AsString    := ATelefone;
    LQry.ParamByName('Endereco').AsString    := AEndereco;
    LQry.ParamByName('DadosSaude').AsString  := ADadosSaude;
    LQry.ParamByName('Senha').AsString       := LHash; // Salva o hash
    LQry.ParamByName('IdCargo').AsInteger    := 3;
    try
      LQry.ExecSQL;
    except
      on E: Exception do
      begin
        if Pos('PRIMARY KEY', E.Message) > 0 then
          raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Este CPF já está cadastrado.')
        else
          raise EErroApi.Create(500, TCodigoErro.ErroInterno, 'Erro ao salvar usuário: ' + E.Message);
      end;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class procedure TServicoUsuario.ExcluirConta(const ACPF: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LCPFLimpo: string;
  LQtdAtivas: Integer;
begin
  // Remove pontos e traços do CPF
  LCPFLimpo := StringReplace(ACPF, '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);

  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    // 1. REGRA DE NEGÓCIO: O paciente tem solicitações em andamento?
    LQry.SQL.Text := 'SELECT COUNT(*) AS Qtd FROM Solicitacoes WHERE idUsuarioCPF = :cpf AND status IN (''Pendente'', ''Aprovado'')';
    LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
    LQry.Open;
    LQtdAtivas := LQry.FieldByName('Qtd').AsInteger;
    LQry.Close;

    if LQtdAtivas > 0 then
      raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Não é possível excluir a conta. Você possui solicitações em andamento. Cancele-as ou aguarde a finalização.');

    // 2. EXCLUSÃO COM TRANSAÇÃO (Protege o banco)
    LConn.StartTransaction;
    try
      // Passo A: Apaga o histórico de solicitações antigas (Retiradas/Canceladas) para evitar erro de Chave Estrangeira
      LQry.SQL.Text := 'DELETE FROM Solicitacoes WHERE idUsuarioCPF = :cpf';
      LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
      LQry.ExecSQL;

      // Passo B: Exclui a conta do usuário
      LQry.SQL.Text := 'DELETE FROM Usuarios WHERE idUsuarioCPF = :cpf';
      LQry.ParamByName('cpf').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
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

class function TServicoUsuario.ObterPorCPF(const ACPF: string): TJSONObject;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
  LCPFLimpo: string;
begin
  // Limpa o CPF para garantir que só chegue números na query
  LCPFLimpo := StringReplace(ACPF, '.', '', [rfReplaceAll]);
  LCPFLimpo := StringReplace(LCPFLimpo, '-', '', [rfReplaceAll]);

  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    // A MÁGICA ESTÁ AQUI: Usamos CONVERT no SQL Server. O "23" garante o formato YYYY-MM-DD.
    LQry.SQL.Add('SELECT idUsuarioCPF, nomeUsuario, email, telefone, endereco, dadosSaude, ');
    LQry.SQL.Add('CONVERT(VARCHAR(10), dataNascimento, 23) AS dataFormatada ');
    LQry.SQL.Add('FROM Usuarios WHERE idUsuarioCPF = :CPF');

    // Passa o CPF como número seguro
    LQry.ParamByName('CPF').AsLargeInt := StrToInt64Def(LCPFLimpo, 0);
    LQry.Open;

    if LQry.IsEmpty then
      raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Usuário não encontrado.');

    Result := TJSONObject.Create;
    Result.AddPair('cpf', LQry.FieldByName('idUsuarioCPF').AsString);
    Result.AddPair('nomeCompleto', LQry.FieldByName('nomeUsuario').AsString);
    Result.AddPair('email', LQry.FieldByName('email').AsString);

    // Pegamos a data já formatada como String pura! Fim dos crashes de conversão de data!
    Result.AddPair('dataNascimento', LQry.FieldByName('dataFormatada').AsString);

    Result.AddPair('telefone', LQry.FieldByName('telefone').AsString);
    Result.AddPair('endereco', LQry.FieldByName('endereco').AsString);
    Result.AddPair('dadosSaude', LQry.FieldByName('dadosSaude').AsString);
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
