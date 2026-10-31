$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $portProbe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 19001)
    try { $portProbe.Start() } finally { $portProbe.Stop() }
    & (Join-Path $PSScriptRoot 'build-harness.ps1') *> (Join-Path $PSScriptRoot 'build-harness.log')
    & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'configuration.mjs')
    $configurationExitCode = $LASTEXITCODE
    $savedTestJwt = [Environment]::GetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET', 'Process')
    $savedTestConfig = [Environment]::GetEnvironmentVariable('AUTO_CUSTO_CONFIG', 'Process')
    [Environment]::SetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET', 'chave-exclusiva-de-testes-nao-usar-em-producao-2026', 'Process')
    [Environment]::SetEnvironmentVariable('AUTO_CUSTO_CONFIG', (Join-Path $PSScriptRoot '.build/nao-usar-config-real.ini'), 'Process')
    try {
        $testServer = Start-Process -FilePath (Join-Path $PSScriptRoot '.build/AuthHarness.exe') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot '.build/server.log') -RedirectStandardError (Join-Path $PSScriptRoot '.build/server-error.log')
    } finally {
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_JWT_SECRET', $savedTestJwt, 'Process')
        [Environment]::SetEnvironmentVariable('AUTO_CUSTO_CONFIG', $savedTestConfig, 'Process')
    }
    try {
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'tokens.mjs')
        $tokenExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'authorization.mjs')
        $testExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'orders.mjs')
        $ordersExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'medications.mjs')
        $medicationsExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'medication-form.mjs')
        $medicationFormExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'request-status.mjs')
        $requestStatusExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'browser-safety.mjs')
        $browserSafetyExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'history.mjs')
        $historyExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'observations.mjs')
        $observationsExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'observation-browser.mjs')
        $observationBrowserExitCode = $LASTEXITCODE
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'errors-json.mjs')
        $errorsJsonExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'errors-browser.mjs')
        $errorsBrowserExitCode = $LASTEXITCODE
        if ($errorsJsonExitCode -ne 0) { $testExitCode = $errorsJsonExitCode }
        if ($errorsBrowserExitCode -ne 0) { $testExitCode = $errorsBrowserExitCode }
        & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'stock-classification.mjs')
        $stockClassificationExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'stock-classification-browser.mjs')
        $stockClassificationBrowserExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'api-config.mjs')
        $apiConfigExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'api-config-browser.mjs')
        $apiConfigBrowserExitCode = $LASTEXITCODE
        & node (Join-Path $PSScriptRoot 'frontend-integration.mjs')
        $frontendIntegrationExitCode = $LASTEXITCODE
        if ($frontendIntegrationExitCode -ne 0) { $testExitCode = $frontendIntegrationExitCode }
        if ($apiConfigExitCode -ne 0) { $testExitCode = $apiConfigExitCode }
        if ($apiConfigBrowserExitCode -ne 0) { $testExitCode = $apiConfigBrowserExitCode }
        if ($stockClassificationExitCode -ne 0) { $testExitCode = $stockClassificationExitCode }
        if ($stockClassificationBrowserExitCode -ne 0) { $testExitCode = $stockClassificationBrowserExitCode }
        if ($observationsExitCode -ne 0) { $testExitCode = $observationsExitCode }
        if ($observationBrowserExitCode -ne 0) { $testExitCode = $observationBrowserExitCode }
        if ($historyExitCode -ne 0) { $testExitCode = $historyExitCode }
        if ($browserSafetyExitCode -ne 0) { $testExitCode = $browserSafetyExitCode }
        if ($requestStatusExitCode -ne 0) { $testExitCode = $requestStatusExitCode }
        if ($medicationsExitCode -ne 0) { $testExitCode = $medicationsExitCode }
        if ($medicationFormExitCode -ne 0) { $testExitCode = $medicationFormExitCode }
        if ($ordersExitCode -ne 0) { $testExitCode = $ordersExitCode }
        if ($tokenExitCode -ne 0) { $testExitCode = $tokenExitCode }
        if ($configurationExitCode -ne 0) { $testExitCode = $configurationExitCode }
    } finally {
        Stop-Process -Id $testServer.Id -ErrorAction SilentlyContinue
    }
} finally { Pop-Location }
exit $testExitCode
