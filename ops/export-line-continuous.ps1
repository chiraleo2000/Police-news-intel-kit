# Rewrite the continuous LINE intake Excel from SQLite.
# Contains URLs and uploaded files only. Plain chat text is never stored.

$ErrorActionPreference = 'Stop'
$KitRoot = Split-Path -Parent $PSScriptRoot
$ServerRoot = Join-Path $KitRoot 'server'
$LogDir = Join-Path $KitRoot 'logs'
$LogFile = Join-Path $LogDir 'export-continuous.log'

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    }
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\NewsIntelLineExportContinuous')
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    Set-Location $ServerRoot
    $node = (Get-Command node -ErrorAction Stop).Source
    $job = Join-Path $ServerRoot 'dist\jobs\export-continuous.js'
    if (-not (Test-Path $job)) {
        Write-Log "missing $job - run npm run build in server"
        exit 1
    }
    $out = & $node $job 2>&1 | Out-String
    Write-Log ($out.Trim())
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    exit 0
} catch {
    Write-Log ('error: ' + $_.Exception.Message)
    exit 1
} finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
