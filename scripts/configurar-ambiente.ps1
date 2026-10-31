param(
    [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'AutoCusto\config.ini'),
    [string]$LegacyConfigPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Win32\Debug\config.ini')
)
$ErrorActionPreference = 'Stop'
$configFullPath = [IO.Path]::GetFullPath($ConfigPath)
$projectFullPath = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\') + '\'
if ($configFullPath.StartsWith($projectFullPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Escolha um destino fora da pasta do projeto para guardar os segredos.'
}
if (Test-Path -LiteralPath $configFullPath) {
    throw 'O arquivo externo já existe. Ele foi preservado; revise sua configuração sem sobrescrevê-lo.'
}
$baseContent = "[Base]`r`nServidor=`r`nPorta=1433`r`nBanco=`r`nUsuario=`r`nSenha=`r`n"
if (Test-Path -LiteralPath $LegacyConfigPath) {
    $legacyBytes = [IO.File]::ReadAllBytes([IO.Path]::GetFullPath($LegacyConfigPath))
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try { $baseContent = $strictUtf8.GetString($legacyBytes).TrimStart([char]0xFEFF) }
    catch { $baseContent = [Text.Encoding]::GetEncoding(1252).GetString($legacyBytes) }
    if ($baseContent -match '(?im)^\s*\[Seguranca\]') {
        throw 'A configuração antiga já possui seção Seguranca. Migração automática cancelada para preservar os dados.'
    }
}
$keyBytes = New-Object byte[] 32
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $randomGenerator.GetBytes($keyBytes) } finally { $randomGenerator.Dispose() }
$newKey = [Convert]::ToBase64String($keyBytes)
$content = $baseContent.TrimEnd() + "`r`n`r`n[Seguranca]`r`nJwtSecret=$newKey`r`n"
$configParent = Split-Path $configFullPath -Parent
New-Item -ItemType Directory -Force -Path $configParent | Out-Null
# Restringir o arquivo antes de gravar qualquer segredo.
New-Item -ItemType File -Path $configFullPath -ErrorAction Stop | Out-Null
try {
    $fileAcl = New-Object Security.AccessControl.FileSecurity
    $fileAcl.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $fileAcl.SetOwner($currentSid)
    $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($currentSid, 'FullControl', 'Allow')))
    $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $configFullPath -AclObject $fileAcl
    [IO.File]::WriteAllText($configFullPath, $content, (New-Object Text.UTF8Encoding($true)))
} catch {
    Remove-Item -LiteralPath $configFullPath -ErrorAction SilentlyContinue
    throw 'Não foi possível criar a configuração externa com acesso restrito. Nenhum segredo foi exibido.'
} finally {
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    $newKey = $null
    $content = $null
}
Write-Output "Configuração externa criada com acesso restrito: $configFullPath"
Write-Output 'Credenciais existentes preservadas e nova chave JWT gerada. As sessões anteriores precisam de novo login.'
