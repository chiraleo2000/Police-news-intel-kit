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

function Test-Hub([string]$Url) {
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Wait-Hub([string]$Url, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-Hub $Url) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Invoke-HubExport([string]$Url) {
    # A new connection each time. A reused socket after the hub restarts
    # shows up as "connection was closed" even when the new process is fine.
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = 'POST'
    $req.ContentType = 'application/json'
    $req.KeepAlive = $false
    $req.Timeout = 90000
    $req.ReadWriteTimeout = 90000
    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{}')
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
    $resp = $req.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    } finally {
        $resp.Close()
    }
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\NewsIntelLineExportContinuous')
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    $port = Get-Port
    $healthUrl = "http://127.0.0.1:$port/health"
    $url = "http://127.0.0.1:$port/v1/export/continuous/local"
    # Prefer in-process export via news-hub. Never open sqlite from a second
    # Node process while hub holds the DB (better-sqlite3 crashes on Windows).
    $resp = $null
    if (-not (Wait-Hub $healthUrl 10)) {
        Write-Log 'hub health not ready before export'
    }
    foreach ($try in 1..3) {
        try {
            $resp = Invoke-HubExport $url
            break
        } catch {
            Write-Log ("http export try ${try}/3 failed: " + $_.Exception.Message)
            Start-Sleep -Seconds (2 * $try)
        }
    }
    if (-not $resp) {
        $ensure = Join-Path $PSScriptRoot 'ensure-line-webhook.ps1'
        if (-not (Test-Path $ensure)) { exit 1 }
        Write-Log 'attempting ensure-line-webhook then retry export'
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ensure | Out-Null
        if (-not (Wait-Hub $healthUrl 40)) {
            Write-Log 'hub still not healthy after ensure'
            exit 1
        }
        try {
            $resp = Invoke-HubExport $url
        } catch {
            Write-Log ("retry failed: " + $_.Exception.Message + " - refusing second-process sqlite export")
            exit 1
        }
    }
    Write-Log (($resp | ConvertTo-Json -Compress))
    if ($resp.ok -eq $true -or $null -ne $resp.url_count) {
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
