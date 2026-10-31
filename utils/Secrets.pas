unit Secrets;

interface

uses System.SysUtils;

type
  EConfiguracaoSegura = class(Exception);

function ObterCaminhoConfiguracao: string;
procedure CarregarSegredos;
function ObterChaveJWT: string;

implementation

uses System.IniFiles, System.IOUtils;

var
  FChaveJWT: string;

function CaminhoTotalmenteQualificado(const ACaminho: string): Boolean;
{$IFNDEF LINUX}
var
  LPartes: TArray<string>;
{$ENDIF}
begin
{$IFDEF LINUX}
  Result := ACaminho.StartsWith('/');
{$ELSE}
  Result := False;
  if (Length(ACaminho) >= 3) and CharInSet(ACaminho[1], ['A'..'Z', 'a'..'z']) and
     (ACaminho[2] = ':') and CharInSet(ACaminho[3], ['\', '/']) then
    Exit(True);
  if ACaminho.StartsWith('\\') then
  begin
    LPartes := ACaminho.Substring(2).Split(['\'], TStringSplitOptions.ExcludeEmpty);
    Result := Length(LPartes) >= 2;
  end;
{$ENDIF}
end;

function ObterCaminhoConfiguracao: string;
{$IFNDEF LINUX}
var
  LBase: string;
{$ENDIF}
begin
  Result := Trim(GetEnvironmentVariable('AUTO_CUSTO_CONFIG'));
  if Result <> '' then
  begin
    if not CaminhoTotalmenteQualificado(Result) then
      raise EConfiguracaoSegura.Create('AUTO_CUSTO_CONFIG deve informar um caminho absoluto.');
    Result := TPath.GetFullPath(Result);
    Exit;
  end;
{$IFDEF LINUX}
  Result := '/etc/autocusto/config.ini';
{$ELSE}
  LBase := GetEnvironmentVariable('LOCALAPPDATA');
  if LBase = '' then
    raise EConfiguracaoSegura.Create('Configure AUTO_CUSTO_CONFIG com o caminho do arquivo externo.');
  Result := TPath.Combine(TPath.Combine(LBase, 'AutoCusto'), 'config.ini');
{$ENDIF}
end;

procedure CarregarSegredos;
var
  LChave, LCaminho: string;
  LIni: TMemIniFile;
begin
  FChaveJWT := '';
  LChave := GetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET');
  if LChave = '' then
  begin
    LCaminho := ObterCaminhoConfiguracao;
    if not FileExists(LCaminho) then
      raise EConfiguracaoSegura.Create('Configuração externa não encontrada. Execute scripts\configurar-ambiente.ps1 ou configure AUTO_CUSTO_JWT_SECRET.');
    try
      LIni := TMemIniFile.Create(LCaminho, TEncoding.UTF8);
      try
        LChave := LIni.ReadString('Seguranca', 'JwtSecret', '');
      finally
        LIni.Free;
      end;
    except
      on E: Exception do
        raise EConfiguracaoSegura.Create('Não foi possível ler a configuração externa de segurança.');
    end;
  end;
  if Trim(LChave) = '' then
    raise EConfiguracaoSegura.Create('Chave JWT ausente. Configure AUTO_CUSTO_JWT_SECRET ou [Seguranca] JwtSecret.');
  if TEncoding.UTF8.GetByteCount(LChave) < 32 then
    raise EConfiguracaoSegura.Create('A chave JWT deve conter pelo menos 32 bytes UTF-8. Gere uma chave aleatória forte.');
  FChaveJWT := LChave;
end;

function ObterChaveJWT: string;
begin
  if FChaveJWT = '' then
    raise EConfiguracaoSegura.Create('Configuração de segurança não inicializada.');
  Result := FChaveJWT;
end;

end.
