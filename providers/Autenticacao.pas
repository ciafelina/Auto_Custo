unit Autenticacao;

interface

uses
  System.SysUtils, Horse, Horse.Session, JOSE.Core.JWT, JOSE.Core.Builder,
  System.JSON, Secrets, Excecoes, Mensagens;

type
  TDadosToken = record
    UsuarioCPF: string;
    NomeUsuario: string;
    IdCargo: Integer;
    Credencial: string;
  end;

function ValidarToken(Req: THorseRequest): TDadosToken;
procedure MiddlewareAutenticacao(Req: THorseRequest; Res: THorseResponse; Next: TProc);
procedure ExigirTitular(Req: THorseRequest; const ACPF: string);

implementation

uses
  Data.DB, FireDAC.Comp.Client, FireDAC.Stan.Param, FireDAC.DApt, Conexao, RecuperacaoSeguranca;

type
  TSessaoAutenticada = class(TSession)
    Dados: TDadosToken;
  end;

function NormalizarCPF(const ACPF: string): string;
var
  LCPF: string;
  LChar: Char;
  LNumero: Int64;
begin
  Result := '';
  LCPF := ACPF.Trim.Replace('.', '').Replace('-', '');
  if (Length(LCPF) = 0) or (Length(LCPF) > 11) then Exit;
  for LChar in LCPF do
    if not CharInSet(LChar, ['0'..'9']) then Exit;
  if not TryStrToInt64(LCPF, LNumero) or (LNumero <= 0) then Exit;
  // O banco usa CPF numérico: preserva a equivalência dos zeros iniciais.
  Result := IntToStr(LNumero);
end;

procedure CarregarUsuarioAtual(var ADados: TDadosToken);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  try
    LQry := TFDQuery.Create(nil);
    try
      LQry.Connection := LConn;
      LQry.SQL.Text := 'SELECT nomeUsuario, IdCargo, status, senha FROM Usuarios WHERE idUsuarioCPF = :CPF';
      LQry.ParamByName('CPF').AsLargeInt := StrToInt64(ADados.UsuarioCPF);
      LQry.Open;
      if LQry.IsEmpty then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'A conta desta sessão não está disponível.');
      if (ADados.Credencial = '') or not IguaisSeguros(ADados.Credencial,MarcaCredencial(LQry.FieldByName('senha').AsString)) then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Sua senha foi alterada ou a sessão precisa ser renovada. Faça login novamente.');
      if not SameText(Trim(LQry.FieldByName('status').AsString), 'Ativo') then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Esta conta está inativa. Faça login com uma conta ativa.');
      ADados.IdCargo := LQry.FieldByName('IdCargo').AsInteger;
      if not (ADados.IdCargo in [1, 2, 3]) then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'A conta não possui um cargo válido.');
      ADados.NomeUsuario := LQry.FieldByName('nomeUsuario').AsString;
    finally
      LQry.Free;
    end;
  finally
    LConn.Free;
  end;
end;

function ValidarToken(Req: THorseRequest): TDadosToken;
var
  LTokenStr: string;
  LJWT: TJWT;
  LSessao: TSessaoAutenticada;
begin
  if Req.Sessions.TryGetSession<TSessaoAutenticada>(LSessao) then
    Exit(LSessao.Dados);

  LTokenStr := Trim(Req.Headers['Authorization']);
  if not SameText(Copy(LTokenStr, 1, 7), 'Bearer ') then
    raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Informe o token de autenticação no formato Bearer.');
  LTokenStr := Trim(Copy(LTokenStr, 8, MaxInt));
  if LTokenStr = '' then
    raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Token de autenticação não fornecido.');

  try
    LJWT := TJOSE.Verify(ObterChaveJWT, LTokenStr);
    try
      if not Assigned(LJWT) then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Token de autenticação inválido.');
      if not LJWT.Verified or (LJWT.Header.JSON.GetValue<string>('alg', '') <> 'HS256') then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Assinatura do token inválida.');
      if LJWT.Claims.Expiration <= Now then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'Sua sessão expirou. Faça login novamente.');
      Result.UsuarioCPF := NormalizarCPF(LJWT.Claims.JSON.GetValue<string>('cpf', ''));
      Result.Credencial := LJWT.Claims.JSON.GetValue<string>('credencial','');
      if Result.UsuarioCPF = '' then
        raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'O token não identifica um usuário válido.');
    finally
      LJWT.Free;
    end;
  except
    on E: EErroApi do raise;
    on E: Exception do
      raise EErroApi.Create(401, TCodigoErro.CredenciaisInvalidas, 'O token de autenticação é inválido ou está mal formatado.');
  end;

  // Cargo do token/localStorage não autoriza acesso: consultar a conta atual.
  CarregarUsuarioAtual(Result);
  LSessao := TSessaoAutenticada.Create;
  LSessao.Dados := Result;
  Req.Sessions.SetSession(TSessaoAutenticada, LSessao);
end;

procedure ExigirTitular(Req: THorseRequest; const ACPF: string);
var
  LDados: TDadosToken;
  LCPF: string;
begin
  LDados := ValidarToken(Req);
  LCPF := NormalizarCPF(ACPF);
  if (LCPF = '') or (LCPF <> LDados.UsuarioCPF) then
    raise EErroApi.Create(403, 'ACESSO_NEGADO', 'Você não tem permissão para acessar os dados de outra pessoa.');
end;

procedure MiddlewareAutenticacao(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LDados: TDadosToken;
  LPartes: TArray<string>;
  LPublica, LEquipe, LSomenteAdmin: Boolean;
begin
  // Mesma origem de caminho usada pelo roteador Horse; ignora barras vazias.
  LPartes := LowerCase(Req.RawWebRequest.RawPathInfo).Split(['/'], TStringSplitOptions.ExcludeEmpty);
  LPublica := False;
  if (Length(LPartes) = 1) and SameText(Req.RawWebRequest.Method, 'POST') then
    LPublica := (LPartes[0] = 'login') or (LPartes[0] = 'usuarios');
  if (Length(LPartes) = 2) and SameText(Req.RawWebRequest.Method, 'POST') then
    LPublica := (LPartes[0]='senha') and ((LPartes[1]='recuperar') or (LPartes[1]='redefinir'));
  if LPublica then
  begin
    if (Length(LPartes)=2) and (Req.RawWebRequest.ContentLength>8192) then
      raise EErroApi.Create(413,'REQUISICAO_MUITO_GRANDE','A requisição de recuperação excede o tamanho permitido.');
    Next();
    Exit;
  end;

  LDados := ValidarToken(Req);
  LEquipe := False;
  LSomenteAdmin := False;
  if Length(LPartes) > 0 then
    LEquipe := (LPartes[0] = 'admin') or (LPartes[0] = 'documentos') or
      (LPartes[0] = 'arquivos') or (LPartes[0] = 'interessados');
  if Length(LPartes) = 4 then
    LSomenteAdmin := (LPartes[0] = 'admin') and (LPartes[1] = 'usuarios') and (LPartes[3] = 'cargo');
  if (LEquipe and not (LDados.IdCargo in [1, 2])) or
     (LSomenteAdmin and (LDados.IdCargo <> 1)) then
    raise EErroApi.Create(403, 'ACESSO_NEGADO', 'Seu cargo não tem permissão para realizar esta operação.');
  Next();
end;

end.
