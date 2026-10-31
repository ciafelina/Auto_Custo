unit Servico_RecuperacaoSenha;
interface
uses System.SysUtils;
type TServicoRecuperacaoSenha=class
 public
  class procedure Solicitar(const ACPF,AEmail,AIP: string);
  class procedure Redefinir(const AToken,ASenha,AIP: string);
end;
implementation
uses System.RegularExpressions, System.SyncObjs, System.Generics.Collections,
 FireDAC.Comp.Client, FireDAC.Stan.Param, FireDAC.Stan.Option, FireDAC.DApt,
 Conexao, BCrypt, Excecoes, RecuperacaoSeguranca, EmailRecuperacao;
type TLimite=record Inicio:Int64; Quantidade:Integer; end;
var FLock:TCriticalSection; FLimites:TDictionary<string,TLimite>;

procedure Limitar(const AChave:string; AMaximo:Integer);
var L:TLimite; K:string; Expiradas:TList<string>;
begin
 FLock.Acquire;
 try
  Expiradas:=TList<string>.Create;
  try
   for K in FLimites.Keys do if AgoraUTC-FLimites[K].Inicio>=900 then Expiradas.Add(K);
   for K in Expiradas do FLimites.Remove(K);
  finally Expiradas.Free; end;
  if not FLimites.TryGetValue(AChave,L) then begin L.Inicio:=AgoraUTC;L.Quantidade:=0;end;
  if (L.Quantidade>=AMaximo) or (FLimites.Count>=5000) then
   raise EErroApi.Create(429,'LIMITE_RECUPERACAO','Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  Inc(L.Quantidade);FLimites.AddOrSetValue(AChave,L);
 finally FLock.Release; end;
end;
procedure LinkInvalido;
begin raise EErroApi.Create(400,'LINK_RECUPERACAO_INVALIDO','Link inválido ou expirado. Solicite uma nova recuperação de senha.');end;

class procedure TServicoRecuperacaoSenha.Solicitar(const ACPF,AEmail,AIP:string);
var C:TFDConnection;Q:TFDQuery;CPF,Email,Destinatario,Token,VinculoSenha:string; N,Ultima,Quantidade:Int64;
begin
 CPF:=Trim(ACPF).Replace('.','').Replace('-','');Email:=LowerCase(Trim(AEmail));
 if not TRegEx.IsMatch(CPF,'^[0-9]{11}$') or not TRegEx.IsMatch(Email,'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$') or
  (Length(Email)>254) then raise EErroApi.Create(400,'DADOS_RECUPERACAO_INVALIDOS','Informe um CPF e um e-mail válidos.');
 if not EmailRecuperacaoDisponivel then raise EErroApi.Create(503,'RECUPERACAO_INDISPONIVEL','Recuperação temporariamente indisponível. Tente mais tarde.');
 Limitar('envio/ip/'+AIP,30);Limitar('envio/global',200);
 C:=TProvedorConexao.ObterConexao;
 try
  Q:=TFDQuery.Create(nil);
  try
   Q.Connection:=C; C.TxOptions.Isolation:=xiSerializible;C.StartTransaction;
   try
    Q.SQL.Text:='SELECT email,senha,status FROM Usuarios WITH (XLOCK, HOLDLOCK) WHERE idUsuarioCPF=:cpf';
    Q.ParamByName('cpf').AsLargeInt:=StrToInt64(CPF);Q.Open;
    if Q.IsEmpty or not SameText(Trim(Q.FieldByName('status').AsString),'Ativo') or
       not SameText(Trim(Q.FieldByName('email').AsString),Email) then begin C.Rollback;Exit;end;
    Destinatario:=Trim(Q.FieldByName('email').AsString);VinculoSenha:=MarcaCredencial(Q.FieldByName('senha').AsString);Q.Close;
    N:=AgoraUTC;
    Q.SQL.Text:='SELECT MAX(criadoEm) AS ultima, COUNT(*) AS quantidade FROM RecuperacoesSenha WHERE idUsuarioCPF=:cpf AND criadoEm>=:inicio';
    Q.ParamByName('cpf').AsLargeInt:=StrToInt64(CPF);Q.ParamByName('inicio').AsLargeInt:=N-3600;Q.Open;
    Ultima:=0;
    if not Q.FieldByName('ultima').IsNull then Ultima:=Q.FieldByName('ultima').AsLargeInt;
    Quantidade:=Q.FieldByName('quantidade').AsLargeInt;Q.Close;
    if (Ultima>N-60) or (Quantidade>=5) then begin C.Rollback;Exit;end;
    Token:=GerarTokenRecuperacao;
    Q.SQL.Text:='INSERT INTO RecuperacoesSenha (tokenHash,idUsuarioCPF,emailVinculo,senhaVinculo,criadoEm,expiraEm,usado) VALUES (:hash,:cpf,:email,:senha,:criado,:expira,0)';
    Q.ParamByName('hash').AsString:=HashToken(Token);Q.ParamByName('cpf').AsLargeInt:=StrToInt64(CPF);
    Q.ParamByName('email').AsString:=MarcaEmail(Email);Q.ParamByName('senha').AsString:=VinculoSenha;
    Q.ParamByName('criado').AsLargeInt:=N;Q.ParamByName('expira').AsLargeInt:=N+900;Q.ExecSQL;
    C.Commit;
    // O trabalhador só recebe o link depois da confirmação da transação.
    if not EnfileirarEmailRecuperacao(Destinatario,Token) then
    begin
     Q.SQL.Text:='DELETE FROM RecuperacoesSenha WHERE tokenHash=:hash';
     Q.ParamByName('hash').AsString:=HashToken(Token);Q.ExecSQL;
    end;
   except if C.InTransaction then C.Rollback;raise;end;
  finally Q.Free; end;
 finally C.Free;end;
end;

class procedure TServicoRecuperacaoSenha.Redefinir(const AToken,ASenha,AIP:string);
var C:TFDConnection;Q:TFDQuery;CPF:Int64;SenhaAnterior,Email,Hash,VinculoSenha,VinculoEmail:string;
begin
 Limitar('troca/ip/'+AIP,50);Limitar('troca/global',300);
 if not TRegEx.IsMatch(AToken,'^[a-f0-9]{64}$') then LinkInvalido;
 ValidarNovaSenha(ASenha);
 C:=TProvedorConexao.ObterConexao;
 try
  Q:=TFDQuery.Create(nil);
  try
   Q.Connection:=C;
   Q.SQL.Text:='SELECT idUsuarioCPF FROM RecuperacoesSenha WHERE tokenHash=:hash AND usado=0 AND expiraEm>:agora';
   Q.ParamByName('hash').AsString:=HashToken(AToken);Q.ParamByName('agora').AsLargeInt:=AgoraUTC;Q.Open;
   if Q.IsEmpty then LinkInvalido;
   CPF:=Q.FieldByName('idUsuarioCPF').AsLargeInt;Q.Close;
   C.TxOptions.Isolation:=xiSerializible;C.StartTransaction;
   try
    Q.SQL.Text:='SELECT senha,email,status FROM Usuarios WITH (XLOCK, HOLDLOCK) WHERE idUsuarioCPF=:cpf';
    Q.ParamByName('cpf').AsLargeInt:=CPF;Q.Open;
    if Q.IsEmpty or not SameText(Trim(Q.FieldByName('status').AsString),'Ativo') then LinkInvalido;
    SenhaAnterior:=Q.FieldByName('senha').AsString;Email:=Q.FieldByName('email').AsString;Q.Close;
    Q.SQL.Text:='SELECT senhaVinculo,emailVinculo FROM RecuperacoesSenha WHERE tokenHash=:hash AND usado=0 AND expiraEm>:agora';
    Q.ParamByName('hash').AsString:=HashToken(AToken);Q.ParamByName('agora').AsLargeInt:=AgoraUTC;Q.Open;
    if Q.IsEmpty then LinkInvalido;
    VinculoSenha:=Q.FieldByName('senhaVinculo').AsString;VinculoEmail:=Q.FieldByName('emailVinculo').AsString;Q.Close;
    if not IguaisSeguros(VinculoSenha,MarcaCredencial(SenhaAnterior)) or not IguaisSeguros(VinculoEmail,MarcaEmail(Email)) then LinkInvalido;
    Hash:=TBCrypt.GenerateHash(ASenha);
    Q.SQL.Text:='UPDATE Usuarios SET senha=:nova WHERE idUsuarioCPF=:cpf AND senha=:anterior';
    Q.ParamByName('nova').AsString:=Hash;Q.ParamByName('cpf').AsLargeInt:=CPF;Q.ParamByName('anterior').AsString:=SenhaAnterior;Q.ExecSQL;
    if Q.RowsAffected<>1 then LinkInvalido;
    Q.SQL.Text:='UPDATE RecuperacoesSenha SET usado=1 WHERE idUsuarioCPF=:cpf';Q.ParamByName('cpf').AsLargeInt:=CPF;Q.ExecSQL;
    C.Commit;
   except if C.InTransaction then C.Rollback;raise;end;
  finally Q.Free;end;
 finally C.Free;end;
end;
initialization
 FLock:=TCriticalSection.Create;FLimites:=TDictionary<string,TLimite>.Create;
finalization
 FLimites.Free;FLock.Free;
end.
