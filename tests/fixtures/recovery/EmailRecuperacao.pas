unit EmailRecuperacao;
interface
function EmailRecuperacaoDisponivel:Boolean;
function EnfileirarEmailRecuperacao(const AEmail,AToken:string):Boolean;
procedure IniciarEmailRecuperacao;
procedure EncerrarEmailRecuperacao;
implementation
uses System.SysUtils,System.IOUtils,System.JSON;
function EmailRecuperacaoDisponivel:Boolean;
begin Result:=not FileExists(ExtractFilePath(ParamStr(0))+'mail-disabled');end;
function EnfileirarEmailRecuperacao(const AEmail,AToken:string):Boolean;
var J:TJSONObject;
begin
 if FileExists(ExtractFilePath(ParamStr(0))+'mail-full') then Exit(False);
 J:=TJSONObject.Create.AddPair('email',AEmail).AddPair('token',AToken);
 try TFile.AppendAllText(ExtractFilePath(ParamStr(0))+'recovery-mail.jsonl',J.ToJSON+sLineBreak,TEncoding.UTF8);finally J.Free;end;
 Result:=True;
end;
procedure IniciarEmailRecuperacao;begin end;
procedure EncerrarEmailRecuperacao;begin end;
end.
