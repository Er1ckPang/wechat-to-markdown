param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskAppRoot = $PSScriptRoot
$taskAppUrl = 'http://127.0.0.1:17880'
$taskPackageInfo = Get-Content -LiteralPath (Join-Path $taskAppRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskExpectedVersion = if ($taskPackageInfo.releaseVersion) { $taskPackageInfo.releaseVersion } else { $taskPackageInfo.version }
$taskExistingHealth = $null
try {
    $taskExistingHealth = Invoke-RestMethod -Uri "$taskAppUrl/health" -TimeoutSec 2
} catch { }
if ($taskExistingHealth) {
    if ($taskExistingHealth.app -eq 'wx2md-local') {
        if ($taskExistingHealth.version -ne $taskExpectedVersion -or $taskExistingHealth.root.TrimEnd('\','/') -ne $taskAppRoot.TrimEnd('\','/')) {
            throw 'Another version is running. Open http://127.0.0.1:17880, choose Stop, then launch this version again.'
        }
        if (-not $NoBrowser) { Start-Process $taskAppUrl }
        exit 0
    }
    throw 'Port 17880 is used by another app.'
}
$taskNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $taskNodePath)) { throw 'Please install Node.js 24 LTS, then run this file again. See the user guide.' }
$taskNodeVersion = & $taskNodePath -p "process.versions.node"
if ([version]$taskNodeVersion -lt [version]'22.13.0') { throw 'Node.js 22.13 or newer is required. Node.js 24 LTS is recommended.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskAppRoot 'node_modules/playwright/package.json'))) {
    Push-Location $taskAppRoot
    try {
        $taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
        $taskBundledPnpm = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd'
        $taskNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($taskPnpm) { & $taskPnpm.Source install --frozen-lockfile --ignore-scripts }
        elseif (Test-Path -LiteralPath $taskBundledPnpm) { & $taskBundledPnpm install --frozen-lockfile --ignore-scripts }
        elseif ($taskNpm) { & $taskNpm.Source install --ignore-scripts }
        else { throw 'A package installer is needed. Install Node.js 24 LTS with npm.' }
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network connection and retry.' }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $taskAppRoot 'vendor/singlefile.js'))) {
    Push-Location $taskAppRoot
    try { & $taskNodePath scripts/build.mjs; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } } finally { Pop-Location }
}
$taskLogRoot = Join-Path $taskAppRoot 'logs'
New-Item -ItemType Directory -Force -Path $taskLogRoot | Out-Null
$taskServerPath = Join-Path $taskAppRoot 'src/server.mjs'
$taskProcess = Start-Process -FilePath $taskNodePath -ArgumentList @('--no-warnings', ('"' + $taskServerPath + '"')) -WorkingDirectory $taskAppRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogRoot 'runtime.log') -RedirectStandardError (Join-Path $taskLogRoot 'errors.log')
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    Start-Sleep -Milliseconds 300
    try { $taskHealth = Invoke-RestMethod -Uri "$taskAppUrl/health" -TimeoutSec 1; if ($taskHealth.app -eq 'wx2md-local') { $taskReady = $true; break } } catch { }
    if ($taskProcess.HasExited) { break }
}
if (-not $taskReady) { throw 'Could not start. Check logs/errors.log or see the user guide.' }
if (-not $NoBrowser) { Start-Process $taskAppUrl }
Write-Host "Ready: $taskAppUrl"
