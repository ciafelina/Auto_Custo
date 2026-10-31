$ErrorActionPreference = 'Stop'
$recoveryRoot = Split-Path $PSScriptRoot -Parent
Push-Location $recoveryRoot
$savedRecoveryFlag = $env:AUTO_CUSTO_TEST_RECOVERY
$savedRecoveryJwt = $env:AUTO_CUSTO_JWT_SECRET
$savedRecoveryConfig = $env:AUTO_CUSTO_CONFIG
try {
    $env:AUTO_CUSTO_TEST_RECOVERY = '1'
    & "$PSScriptRoot/build-harness.ps1" *> "$PSScriptRoot/password-recovery-build.log"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar; veja password-recovery-build.log.' }
    $env:AUTO_CUSTO_JWT_SECRET = 'chave-exclusiva-de-testes-nao-usar-em-producao-2026'
    $env:AUTO_CUSTO_CONFIG = Join-Path $PSScriptRoot '.build/nao-usar-config-real.ini'
    $recoveryOutput = Join-Path $PSScriptRoot '.build/password-recovery'
    $mailCapture = Join-Path $recoveryOutput 'recovery-mail.jsonl'
    if (Test-Path -LiteralPath $mailCapture) { Remove-Item -LiteralPath $mailCapture }
    $recoveryProcess = Start-Process -FilePath (Join-Path $recoveryOutput 'AuthHarness.exe') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $recoveryOutput 'server.log') -RedirectStandardError (Join-Path $recoveryOutput 'server-error.log')
    try {
        & node --disable-warning=ExperimentalWarning "$PSScriptRoot/password-recovery.mjs"
        $recoveryCode = $LASTEXITCODE
    } finally { Stop-Process -Id $recoveryProcess.Id -ErrorAction SilentlyContinue }
} finally {
    $env:AUTO_CUSTO_TEST_RECOVERY = $savedRecoveryFlag
    $env:AUTO_CUSTO_JWT_SECRET = $savedRecoveryJwt
    $env:AUTO_CUSTO_CONFIG = $savedRecoveryConfig
    Pop-Location
}
exit $recoveryCode
