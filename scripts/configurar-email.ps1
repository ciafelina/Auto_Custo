param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'AutoCusto/email.ini'), [string]$Email, [switch]$AtualizarSenha)
$ErrorActionPreference = 'Stop'
if ($ConfigPath -notmatch '^[A-Za-z]:[\\/]') { throw 'Informe um caminho absoluto.' }
$emailExists = Test-Path -LiteralPath $ConfigPath
if ($emailExists -and -not $AtualizarSenha) { throw 'O arquivo já existe. Use -AtualizarSenha para trocar a senha de aplicativo.' }
if ($AtualizarSenha -and -not $emailExists) { throw 'A configuração ainda não existe. Execute sem -AtualizarSenha.' }
$emailExistingContent = $null
if ($AtualizarSenha) {
    $emailExistingContent = [IO.File]::ReadAllText($ConfigPath)
    if ([regex]::Matches($emailExistingContent, '(?m)^Senha=[^\r\n]*').Count -ne 1) { throw 'Configuração inesperada; nenhuma alteração realizada.' }
    if (-not $Email) { $Email = [regex]::Match($emailExistingContent, '(?m)^Usuario=([^\r\n]+)').Groups[1].Value }
}
$emailDirectory = Split-Path $ConfigPath -Parent
New-Item -ItemType Directory -Force -Path $emailDirectory | Out-Null
$emailIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$emailAcl = New-Object Security.AccessControl.FileSecurity
$emailAcl.SetAccessRuleProtection($true, $false)
foreach ($emailSid in @($emailIdentity, (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
    $emailAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($emailSid, 'FullControl', 'Allow')))
}
if (-not $Email) { $Email = Read-Host 'Endereço Gmail que enviará as mensagens' }
if ($Email -notmatch '^[a-zA-Z0-9._%+-]+@gmail\.com$') { throw 'Informe um endereço Gmail válido.' }
$emailSecret = Read-Host 'Senha de aplicativo do Gmail (16 caracteres, entrada oculta)' -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($emailSecret)
try {
    $emailPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer).Replace(' ', '')
    if ($emailPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Use a senha de aplicativo de 16 caracteres do Google.' }
    if (-not $emailExists) {
        $emailStream = [IO.File]::Open($ConfigPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $emailStream.Close()
    }
    Set-Acl -LiteralPath $ConfigPath -AclObject $emailAcl
    $emailContent = @"
[SMTP]
Servidor=smtp.gmail.com
Porta=465
Usuario=$Email
Senha=$emailPassword
Remetente=$Email
Nome=Alto Custo - Grupo 5 Univesp
ModoTLS=SSL

[Recuperacao]
URLPublica=https://altocusto.duckdns.org
"@
    if ($AtualizarSenha) {
        $emailContent = [regex]::Replace($emailExistingContent, '(?m)^Senha=[^\r\n]*', "Senha=$emailPassword")
        $emailContent = [regex]::Replace($emailContent, '(?m)^Usuario=[^\r\n]*', "Usuario=$Email")
        $emailContent = [regex]::Replace($emailContent, '(?m)^Remetente=[^\r\n]*', "Remetente=$Email")
    }
    [IO.File]::WriteAllText($ConfigPath, $emailContent, (New-Object Text.UTF8Encoding($true)))
    Write-Host "Configuração privada salva em $ConfigPath. A senha não será exibida."
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
    $emailPassword = $null
    $emailContent = $null
    $emailExistingContent = $null
    $emailSecret.Dispose()
}
