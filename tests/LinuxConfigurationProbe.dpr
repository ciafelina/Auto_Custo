program LinuxConfigurationProbe;
{$APPTYPE CONSOLE}
uses System.SysUtils, System.DateUtils, Secrets, BCrypt, JOSE.Core.JWT, JOSE.Core.Builder;
var LPath, LHash, LToken: string; LJWT, LVerified: TJWT;
begin
  try
    LPath := ObterCaminhoConfiguracao;
    CarregarSegredos;
    if TEncoding.UTF8.GetByteCount(ObterChaveJWT) < 32 then Halt(3);
    LHash := TBCrypt.GenerateHash('Senha-ficticia-linux-á-2026', 6);
    if not TBCrypt.CompareHash('Senha-ficticia-linux-á-2026', LHash) then Halt(4);
    if TBCrypt.CompareHash('senha-errada', LHash) then Halt(5);
    LJWT := TJWT.Create;
    try
      LJWT.Claims.Expiration := IncHour(Now, 1);
      LJWT.Claims.SetClaimOfType<string>('cpf', '11111111111');
      LToken := TJOSE.SHA256CompactToken(ObterChaveJWT, LJWT);
    finally LJWT.Free; end;
    LVerified := TJOSE.Verify(ObterChaveJWT, LToken);
    try
      if not LVerified.Verified then Halt(6);
    finally LVerified.Free; end;
    LVerified := TJOSE.Verify('chave-incorreta-ficticia-de-outro-emissor-2026', LToken);
    try
      if LVerified.Verified then Halt(7);
    finally LVerified.Free; end;
    Writeln('CONFIG_PATH=', LPath);
    Writeln('JWT_OK');
    Writeln('BCRYPT_AND_JWT_LINUX_OK');
  except
    on E: EConfiguracaoSegura do
    begin
      Writeln('CONFIG_ERROR=', E.Message);
      Halt(1);
    end;
  end;
end.
