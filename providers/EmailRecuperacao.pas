unit EmailRecuperacao;
interface
function EmailRecuperacaoDisponivel:Boolean;
function EnfileirarEmailRecuperacao(const AEmail,AToken:string):Boolean;
procedure IniciarEmailRecuperacao;
procedure EncerrarEmailRecuperacao;
// Usado também pelo probe de transporte; não expõe credenciais/retorno SMTP.
procedure EnviarEmailRecuperacao(const AEmail,AToken:string);
implementation
uses System.SysUtils,System.Classes,System.IniFiles,System.IOUtils,
 System.SyncObjs,System.Generics.Collections,System.RegularExpressions,
 Secrets,RecuperacaoSeguranca,ACBrMail,synachar,blcksock,ssl_openssl_lib;
type
 TEmailPendente=record Destinatario,Token:string;ExpiraEm:Int64;end;
 TTrabalhadorEmail=class(TThread)
 protected procedure Execute;override;
 end;
var FDisponivel:Boolean; FServidor,FUsuario,FSenha,FRemetente,FNome,FURL,FCA,FPorta:string;
 FFila:TThreadedQueue<TEmailPendente>;FTrabalhador:TTrabalhadorEmail;

function EmailValido(const E:string):Boolean;
begin Result:=(Length(E)<=254) and TRegEx.IsMatch(E,'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$');end;
function CaminhoAbsoluto(const P:string):Boolean;
begin
{$IFDEF LINUX}
 Result:=P.StartsWith('/');
{$ELSE}
 Result:=TRegEx.IsMatch(P,'^[A-Za-z]:[\\/]');
{$ENDIF}
end;
procedure EnviarEmailRecuperacao(const AEmail,AToken:string);
var M:TACBrMail;
begin
 if not FDisponivel or not EmailValido(AEmail) or not TRegEx.IsMatch(AToken,'^[a-f0-9]{64}$') then raise Exception.Create('Envio indisponível.');
 M:=TACBrMail.Create(nil);
 try
  M.Host:=FServidor;M.Port:=FPorta;M.Username:=FUsuario;M.Password:=FSenha;
  M.From:=FRemetente;M.FromName:=FNome;M.Subject:='Alto Custo - Recuperação de senha';
  M.SetSSL:=True;M.SetTLS:=False;M.SSLType:=LT_TLSv1_2;
  M.SMTP.Sock.SSL.VerifyCert:=True;M.SMTP.Sock.SSL.CertCAFile:=FCA;M.SMTP.Sock.SSL.SNIHost:=FServidor;
  M.Attempts:=1;M.TimeOut:=10000;M.IsHTML:=False;
  M.DefaultCharset:=UTF_8;M.IDECharset:=UTF_8;
  M.AddAddress(AEmail);
  M.AltBody.DefaultEncoding:=TEncoding.UTF8;M.AltBody.WriteBOM:=False;
  M.AltBody.Text:='Alto Custo - Grupo 5 Univesp'+sLineBreak+sLineBreak+
   'Recebemos uma solicitação de recuperação de senha para sua conta.'+sLineBreak+
   'Para escolher uma nova senha, abra o link abaixo. Ele vale por 15 minutos e pode ser usado uma única vez.'+sLineBreak+sLineBreak+
   FURL+'/redefinir-senha.html#token='+AToken+sLineBreak+sLineBreak+
   'Se você não fez esta solicitação, ignore esta mensagem. Sua senha atual permanece a mesma.'+sLineBreak+
   'Nunca envie sua senha ou este link a outras pessoas.';
  M.Send(False);
 finally M.Free;end;
end;
procedure TTrabalhadorEmail.Execute;
var P:TEmailPendente;
begin
 while not Terminated do
  if FFila.PopItem(P)=wrSignaled then
   if not Terminated and (P.ExpiraEm>AgoraUTC) then
    try EnviarEmailRecuperacao(P.Destinatario,P.Token);
    except Writeln('Falha no envio de recuperação de senha. Confira o serviço SMTP.');end;
end;
function EmailRecuperacaoDisponivel:Boolean;
begin Result:=FDisponivel;end;
function EnfileirarEmailRecuperacao(const AEmail,AToken:string):Boolean;
var P:TEmailPendente;
begin
 Result:=False;if not FDisponivel then Exit;
 P.Destinatario:=AEmail;P.Token:=AToken;P.ExpiraEm:=AgoraUTC+900;
 Result:=FFila.PushItem(P)=wrSignaled;
end;
procedure IniciarEmailRecuperacao;
var Caminho,Modo:string;I:TMemIniFile;Porta:Integer;
begin
 if Assigned(FTrabalhador) then Exit;
 FDisponivel:=False;
 try
  Caminho:=GetEnvironmentVariable('AUTO_CUSTO_EMAIL_CONFIG');
  if Caminho='' then
{$IFDEF LINUX}
   Caminho:='/etc/autocusto/email.ini';
{$ELSE}
   Caminho:=TPath.Combine(ExtractFilePath(ObterCaminhoConfiguracao),'email.ini');
{$ENDIF}
  if not CaminhoAbsoluto(Caminho) or not FileExists(Caminho) then Exit;
  I:=TMemIniFile.Create(Caminho,TEncoding.UTF8);
  try
   FServidor:=I.ReadString('SMTP','Servidor','').Trim;FPorta:=I.ReadString('SMTP','Porta','465').Trim;
   FUsuario:=I.ReadString('SMTP','Usuario','').Trim;FSenha:=I.ReadString('SMTP','Senha','');
   FRemetente:=I.ReadString('SMTP','Remetente','').Trim;FNome:=I.ReadString('SMTP','Nome','Alto Custo - Grupo 5 Univesp');
   FURL:=I.ReadString('Recuperacao','URLPublica','').Trim;Modo:=I.ReadString('SMTP','ModoTLS','SSL');
{$IFDEF LINUX}
   FCA:=I.ReadString('SMTP','CertificadosCA','/etc/ssl/certs/ca-certificates.crt');
{$ELSE}
   FCA:=I.ReadString('SMTP','CertificadosCA',TPath.Combine(ExtractFilePath(Caminho),'email-ca.pem'));
{$ENDIF}
  finally I.Free;end;
  if not TRegEx.IsMatch(FServidor,'^[A-Za-z0-9.-]+$') or not TryStrToInt(FPorta,Porta) or (Porta<1) or (Porta>65535) or
   not EmailValido(FUsuario) or not EmailValido(FRemetente) or (FSenha='') or (Length(FSenha)>256) or
   (Pos(#13,FSenha)>0) or (Pos(#10,FSenha)>0) or (Pos(#13,FNome)>0) or (Pos(#10,FNome)>0) or
   not SameText(Modo,'SSL') or not TRegEx.IsMatch(FURL,'^https://[A-Za-z0-9.-]+(:[0-9]+)?$') or
   not CaminhoAbsoluto(FCA) or not FileExists(FCA) or not InitSSLInterface then
    raise Exception.Create('Configuração SMTP inválida.');
  FFila:=TThreadedQueue<TEmailPendente>.Create(32,0,250);
  FDisponivel:=True;FTrabalhador:=TTrabalhadorEmail.Create(True);FTrabalhador.FreeOnTerminate:=False;FTrabalhador.Start;
 except
  FDisponivel:=False;FreeAndNil(FFila);Writeln('Recuperação de senha indisponível. Confira a configuração SMTP externa.');
 end;
end;
procedure EncerrarEmailRecuperacao;
begin
 FDisponivel:=False;
 if Assigned(FTrabalhador) then begin FTrabalhador.Terminate;FTrabalhador.WaitFor;FreeAndNil(FTrabalhador);end;
 FreeAndNil(FFila);FSenha:='';
end;
initialization
 FDisponivel:=False;
finalization
 EncerrarEmailRecuperacao;
end.
