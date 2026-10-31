unit Controlador_RecuperacaoSenha;
interface
type TControladorRecuperacaoSenha=class
 public class procedure RegistrarRotas;
end;
implementation
uses Horse,System.JSON,System.SysUtils,JsonApi,Servico_RecuperacaoSenha;
function IPCliente(Req:THorseRequest):string;
begin
 Result:=Req.RawWebRequest.RemoteAddr;
 // nginx sobrescreve X-Real-IP; backend Linux escuta somente loopback.
 if (Result='127.0.0.1') or (Result='::1') then
  if Trim(Req.Headers['X-Real-IP'])<>'' then Result:=Copy(Trim(Req.Headers['X-Real-IP']),1,64);
end;
class procedure TControladorRecuperacaoSenha.RegistrarRotas;
begin
 THorse.Post('/senha/recuperar',procedure(Req:THorseRequest;Res:THorseResponse;Next:TProc)
 var B:TJSONObject;
 begin
  B:=LerObjetoJSON(Req);TServicoRecuperacaoSenha.Solicitar(LerTextoJSON(B,'cpf'),LerTextoJSON(B,'email'),IPCliente(Req));
  Res.RawWebResponse.SetCustomHeader('Cache-Control','no-store');
  Res.Status(202).Send(TJSONObject.Create.AddPair('sucesso',TJSONBool.Create(True)).AddPair('mensagem','Se os dados corresponderem a uma conta ativa, enviaremos um link para o e-mail cadastrado.'));
 end);
 THorse.Post('/senha/redefinir',procedure(Req:THorseRequest;Res:THorseResponse;Next:TProc)
 var B:TJSONObject;
 begin
  B:=LerObjetoJSON(Req);TServicoRecuperacaoSenha.Redefinir(LerTextoJSON(B,'token'),LerTextoJSON(B,'senha'),IPCliente(Req));
  Res.RawWebResponse.SetCustomHeader('Cache-Control','no-store');
  Res.Send(TJSONObject.Create.AddPair('sucesso',TJSONBool.Create(True)).AddPair('mensagem','Senha alterada. Entre com a nova senha.'));
 end);
end;
end.
