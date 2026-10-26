# Rewrite the continuous LINE intake Excel/JSON from SQLite.
# Prefer the live news-hub HTTP export (same process as webhook) to avoid
# better-sqlite3 multi-process crashes on Windows.

$ErrorActionPreference = 'Continue'
$KitRoot = Split-Path -Parent $PSScriptRoot
$ServerRoot = Join-Path $KitRoot 'server'
$LogDir = Join-Path $KitRoot 'logs'
$LogFile = Join-Path $LogDir 'export-continuous.log'
$EnvFile = Join-Path $ServerRoot '.env'

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    }
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Host $line
}

function Get-Port {
    $port = 18080
    if (Test-Path $EnvFile) {
        foreach ($line in [System.IO.File]::ReadAllLines($EnvFile)) {
            if ($line -match '^\s*PORT=(\d+)') { $port = [int]$Matches[1] }
        }
    }
    return $port
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\NewsIntelLineExportContinuous')
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    $port = Get-Port
    $url = "http://127.0.0.1:$port/v1/export/continuous/local"
    # Prefer in-process export via news-hub. Never open sqlite from a second
    # Node process while hub holds the DB (better-sqlite3 crashes on Windows).
    $resp = $null
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body '{}' -TimeoutSec 60
    } catch {
        Write-Log ("http export failed: " + $_.Exception.Message)
        $ensure = Join-Path $PSScriptRoot 'ensure-line-webhook.ps1'
        if (Test-Path $ensure) {
            Write-Log 'attempting ensure-line-webhook then retry export'
            & powershell -NoProfile -ExecutionPolicy Bypass -File $ensure | Out-Null
            Start-Sleep -Seconds 2
            try {
                $resp = Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body '{}' -TimeoutSec 60
            } catch {
                Write-Log ("retry failed: " + $_.Exception.Message + " - refusing second-process sqlite export")
                exit 1
            }
        } else {
            exit 1
        }
    }
    Write-Log (($resp | ConvertTo-Json -Compress))
    if ($resp.ok -eq $true -or $resp.url_count -ge 0) {
        exit 0
    }
    exit 1
} catch {
    Write-Log ('error: ' + $_.Exception.Message)
    exit 1
} finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
