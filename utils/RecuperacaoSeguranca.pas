unit RecuperacaoSeguranca;
interface
uses System.SysUtils;
function GerarTokenRecuperacao: string;
function HashToken(const AToken: string): string;
function MarcaCredencial(const AHashSenha: string): string;
function MarcaEmail(const AEmail: string): string;
function IguaisSeguros(const A, B: string): Boolean;
function AgoraUTC: Int64;
procedure ValidarNovaSenha(const ASenha: string);
implementation
uses System.Hash, System.Classes, System.DateUtils, Secrets, Excecoes;
{$IFDEF MSWINDOWS}
function BCryptGenRandom(hAlgorithm, Buffer: Pointer; BufferLength, Flags: Cardinal): Integer; stdcall; external 'bcrypt.dll';
{$ENDIF}
function GerarTokenRecuperacao: string;
var B: TBytes; I: Integer;
{$IFDEF LINUX} F: TFileStream; {$ENDIF}
begin
 SetLength(B,32);
{$IFDEF LINUX}
 F:=TFileStream.Create('/dev/urandom',fmOpenRead or fmShareDenyNone);
 try F.ReadBuffer(B[0],Length(B)); finally F.Free; end;
{$ELSE}
 if BCryptGenRandom(nil,@B[0],Length(B),2)<>0 then raise Exception.Create('Gerador seguro indisponível.');
{$ENDIF}
 Result:='';for I:=0 to High(B) do Result:=Result+IntToHex(B[I],2).ToLower;
end;
function HashToken(const AToken: string): string;
begin Result:=THashSHA2.GetHashString(AToken).ToLower; end;
function MarcaCredencial(const AHashSenha: string): string;
begin Result:=THashSHA2.GetHMAC('alto-custo/sessao/v1/'+AHashSenha,ObterChaveJWT).ToLower; end;
function MarcaEmail(const AEmail: string): string;
begin Result:=THashSHA2.GetHMAC('alto-custo/email/v1/'+LowerCase(Trim(AEmail)),ObterChaveJWT).ToLower; end;
function IguaisSeguros(const A, B: string): Boolean;
var I,D: Integer;
begin
 if Length(A)<>Length(B) then Exit(False);
 D:=0; for I:=1 to Length(A) do D:=D or (Ord(A[I]) xor Ord(B[I]));
 Result:=D=0;
end;
function AgoraUTC: Int64;
begin Result:=DateTimeToUnix(Now,False); end;
procedure ValidarNovaSenha(const ASenha: string);
begin
 if (Length(ASenha)<8) or (Length(ASenha)>64) or (TEncoding.UTF8.GetByteCount(ASenha)>72) or
    (Trim(ASenha)='') or (Pos(#0,ASenha)>0) then
  raise EErroApi.Create(400,'SENHA_INVALIDA','Use de 8 a 64 caracteres e até 72 bytes na nova senha.');
end;
end.
