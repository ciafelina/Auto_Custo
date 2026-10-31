program EmailRecoveryProbe;
{$APPTYPE CONSOLE}
uses System.SysUtils,EmailRecuperacao in '..\providers\EmailRecuperacao.pas',
 Secrets in '..\utils\Secrets.pas',RecuperacaoSeguranca in '..\utils\RecuperacaoSeguranca.pas',
 Excecoes in '..\utils\Excecoes.pas',Mensagens in '..\utils\Mensagens.pas';
begin
 try
  IniciarEmailRecuperacao;
  if not EmailRecuperacaoDisponivel then raise Exception.Create('SMTP não configurado.');
  if ParamCount<>1 then raise Exception.Create('Destinatário necessário.');
  EnviarEmailRecuperacao(ParamStr(1),StringOfChar('0',64));
  Writeln('{"smtpAccepted":true}');
 except
  Writeln('{"smtpAccepted":false}');ExitCode:=1;
 end;
 EncerrarEmailRecuperacao;
end.
