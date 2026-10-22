# Keep the LINE webhook reachable over ngrok-free.
#
# ngrok-free ephemeral URLs change after hibernate / process restart
# (e.g. https://05f8-....ngrok-free.app -> a new host). This script:
#   1) keeps news-hub listening on 127.0.0.1:PORT
#   2) recreates the ngrok tunnel when it is dead or stale after wake
#   3) writes the new PUBLIC_BASE_URL into server\.env
#   4) PUTs the new https://<host>/line/webhook to the LINE Messaging API
#
# Usage:
#   ensure-line-webhook.ps1           # normal 1-minute check
#   ensure-line-webhook.ps1 -Wake     # after hibernate/logon: force fresh tunnel
#
# Env (server\.env):
#   PORT, NGROK_DOMAIN (optional reserved free host),
#   PUBLIC_BASE_URL (auto-updated), LINE_CHANNEL_ACCESS_TOKEN

param(
    [switch]$Wake
)

$ErrorActionPreference = 'Stop'
$KitRoot = Split-Path -Parent $PSScriptRoot
$ServerRoot = Join-Path $KitRoot 'server'
$EnvFile = Join-Path $ServerRoot '.env'
$LogDir = Join-Path $KitRoot 'logs'
$LogFile = Join-Path $LogDir 'webhook-watch.log'
$StateFile = Join-Path $LogDir 'webhook-tunnel-state.json'

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    }
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Read-DotEnv([string]$Path) {
    $map = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $parts = $line.Split('=', 2)
        $map[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
    return $map
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][System.IO.File]::ReadAllLines($Path))
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ('^\s*' + [regex]::Escape($Key) + '=')) {
            $lines[$i] = "$Key=$Value"
            $found = $true
        }
    }
    if (-not $found) { $lines.Add("$Key=$Value") }
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($Path, $lines.ToArray(), $utf8)
}

function Test-Health([string]$Url) {
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12 -Headers @{
            'ngrok-skip-browser-warning' = '1'
        }
        return ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Get-ListenerPid([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
    return 0
}

function Get-NgrokPublicUrl([int]$Port) {
    foreach ($apiPort in 4040..4055) {
        try {
            $payload = Invoke-RestMethod -Uri "http://127.0.0.1:$apiPort/api/tunnels" -TimeoutSec 2
        } catch {
            continue
        }
        $https = @($payload.tunnels) | Where-Object {
            $_.public_url -like 'https://*' -and (
                ([string]$_.config.addr) -match (":$Port`$") -or
                ([string]$_.config.addr) -match "127\.0\.0\.1:$Port" -or
                ([string]$_.config.addr) -match "localhost:$Port"
            )
        } | Select-Object -First 1
        if ($https) { return [string]$https.public_url }
    }
    return $null
}

function Stop-NgrokForPort([int]$Port) {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'"
    foreach ($proc in @($procs)) {
        $cmd = [string]$proc.CommandLine
        if ($cmd -match "\b$Port\b") {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Log "stopped ngrok pid=$($proc.ProcessId) for port $Port"
        }
    }
    Start-Sleep -Seconds 1
}

function Start-NewsHub([int]$Port) {
    $node = (Get-Command node -ErrorAction Stop).Source
    $outLog = Join-Path $LogDir 'server.log'
    $errLog = Join-Path $LogDir 'server.err.log'
    Start-Process -FilePath $node -ArgumentList 'dist/index.js' -WorkingDirectory $ServerRoot `
        -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
    Write-Log "started news-hub on port $Port"
}

function Start-Ngrok([int]$Port, [string]$ReservedDomain) {
    $ngrok = (Get-Command ngrok -ErrorAction Stop).Source
    $ngrokLog = Join-Path $LogDir 'ngrok-line.log'
    # Force IPv4 - Windows localhost often resolves to ::1 while Node is on 127.0.0.1.
    $origin = "http://127.0.0.1:$Port"
    if (-not [string]::IsNullOrWhiteSpace($ReservedDomain)) {
        $hostOnly = $ReservedDomain -replace '^https?://', '' -replace '/.*$', ''
        $args = @('http', '--url', $hostOnly, $origin, '--log', $ngrokLog, '--log-format', 'logfmt')
        Write-Log "starting ngrok reserved domain $hostOnly -> $origin"
    } else {
        $args = @('http', $origin, '--log', $ngrokLog, '--log-format', 'logfmt')
        Write-Log "starting ngrok-free ephemeral -> $origin"
    }
    Start-Process -FilePath $ngrok -ArgumentList $args -WindowStyle Hidden | Out-Null
}

function Wait-NgrokUrl([int]$Port, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        $url = Get-NgrokPublicUrl -Port $Port
        if ($url) { return $url }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Test-RecentResume([int]$WithinMinutes) {
    try {
        $since = (Get-Date).AddMinutes(-1 * $WithinMinutes)
        $events = Get-WinEvent -FilterHashtable @{
            LogName = 'System'
            StartTime = $since
            Id = 1, 107
        } -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProviderName -eq 'Microsoft-Windows-Power-Troubleshooter' -or
                $_.ProviderName -eq 'Microsoft-Windows-Kernel-Power'
            }
        return [bool]$events
    } catch {
        return $false
    }
}

function Get-LineWebhookInfo([hashtable]$EnvMap) {
    $token = [string]$EnvMap['LINE_CHANNEL_ACCESS_TOKEN']
    if ([string]::IsNullOrWhiteSpace($token)) { return $null }
    $headers = @{ Authorization = "Bearer $token" }
    return Invoke-RestMethod -Method Get -Uri 'https://api.line.me/v2/bot/channel/webhook/endpoint' `
        -Headers $headers -TimeoutSec 20
}

function Update-LineWebhook([hashtable]$EnvMap, [string]$PublicBase) {
    $token = [string]$EnvMap['LINE_CHANNEL_ACCESS_TOKEN']
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Log 'LINE_CHANNEL_ACCESS_TOKEN empty; webhook URL not updated'
        return $false
    }
    $endpoint = $PublicBase.TrimEnd('/') + '/line/webhook'
    $headers = @{ Authorization = "Bearer $token" }
    $body = '{"endpoint":"' + $endpoint + '"}'
    $attempts = 5
    for ($i = 1; $i -le $attempts; $i++) {
        try {
            Invoke-RestMethod -Method Put -Uri 'https://api.line.me/v2/bot/channel/webhook/endpoint' `
                -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
            $test = Invoke-RestMethod -Method Post -Uri 'https://api.line.me/v2/bot/channel/webhook/test' `
                -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
            $info = Get-LineWebhookInfo $EnvMap
            Write-Log ("line webhook updated endpoint={0} success={1} active={2} try={3}" -f `
                $endpoint, $test.success, $info.active, $i)
            if (-not $info.active) {
                Write-Log 'Use webhook is OFF in LINE Developers. Turn it on or events will not arrive.'
            }
            return [bool]$test.success
        } catch {
            Write-Log ("line webhook update try {0}/{1} failed: {2}" -f $i, $attempts, $_.Exception.Message)
            Start-Sleep -Seconds (2 * $i)
        }
    }
    return $false
}

function Save-TunnelState([string]$PublicBase) {
    $obj = @{
        public_base_url = $PublicBase
        webhook_url = ($PublicBase.TrimEnd('/') + '/line/webhook')
        updated_at = (Get-Date).ToString('o')
    } | ConvertTo-Json
    Set-Content -Path $StateFile -Value $obj -Encoding utf8
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\NewsIntelLineWebhook')
if (-not $mutex.WaitOne(0)) {
    exit 0
}

try {
    if (-not (Test-Path $EnvFile)) {
        Write-Log "missing $EnvFile"
        exit 1
    }
    $envMap = Read-DotEnv $EnvFile
    $port = 18080
    if ($envMap['PORT'] -match '^\d+$') { $port = [int]$envMap['PORT'] }
    $reserved = [string]$envMap['NGROK_DOMAIN']

    if (-not $Wake -and (Test-RecentResume -WithinMinutes 5)) {
        $Wake = $true
        Write-Log 'detected recent resume from sleep/hibernate -> Wake mode'
    }
    if ($Wake) {
        Write-Log 'Wake mode: will force a fresh ngrok-free tunnel and re-push LINE webhook URL'
    }

    $localUrl = "http://127.0.0.1:$port/health"
    $healthyLocal = $false
    foreach ($i in 1..5) {
        if (Test-Health $localUrl) { $healthyLocal = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $healthyLocal) {
        $owner = Get-ListenerPid $port
        if ($owner -gt 0) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owner"
            $cmd = [string]$proc.CommandLine
            if ($proc.Name -eq 'node.exe' -and $cmd -match 'dist[/\\]index\.js') {
                Stop-Process -Id $owner -Force
                Start-Sleep -Seconds 1
                Write-Log "restarted unresponsive news-hub pid=$owner"
            } else {
                Write-Log "port $port is held by $($proc.Name) pid=$owner; left it alone"
                exit 1
            }
        }
        Start-NewsHub $port
        $ready = $false
        foreach ($i in 1..25) {
            Start-Sleep -Seconds 1
            if (Test-Health $localUrl) { $ready = $true; break }
        }
        if (-not $ready) {
            Write-Log 'news-hub did not become healthy'
            exit 1
        }
    }

    $configured = ([string]$envMap['PUBLIC_BASE_URL']).TrimEnd('/')
    $public = Get-NgrokPublicUrl -Port $port
    $needNewTunnel = $false

    if ($Wake) {
        $needNewTunnel = $true
        Write-Log 'Wake: recycling ngrok so ephemeral free URL is reissued'
    } elseif (-not $public) {
        $needNewTunnel = $true
        Write-Log 'no local ngrok tunnel for this port'
    } elseif ($reserved) {
        $wantHost = ($reserved -replace '^https?://', '' -replace '/.*$', '').ToLowerInvariant()
        $haveHost = ([uri]$public).Host.ToLowerInvariant()
        if ($wantHost -and $haveHost -ne $wantHost) {
            $needNewTunnel = $true
            Write-Log "ngrok host $haveHost != reserved $wantHost"
        }
    }

    # Stale tunnel after hibernate: local ngrok API may still report the old URL
    # while the public edge is dead.
    if (-not $needNewTunnel -and $public) {
        if (-not (Test-Health ($public.TrimEnd('/') + '/health'))) {
            $needNewTunnel = $true
            Write-Log "public health failed for current tunnel $public (likely post-hibernate stale URL)"
        }
    }
    if (-not $needNewTunnel -and $configured -and $configured -like 'https://*') {
        if (-not (Test-Health ($configured + '/health'))) {
            $needNewTunnel = $true
            Write-Log "PUBLIC_BASE_URL unreachable $configured - refreshing tunnel"
        }
    }

    if ($needNewTunnel) {
        Stop-NgrokForPort $port
        Start-Ngrok -Port $port -ReservedDomain $reserved
        $public = Wait-NgrokUrl -Port $port -Seconds 45
        if (-not $public) {
            Write-Log 'ngrok did not publish a URL after refresh'
            exit 1
        }
        Write-Log "new ngrok-free URL $public"
    }

    $healthy = $false
    foreach ($i in 1..5) {
        if (Test-Health ($public.TrimEnd('/') + '/health')) { $healthy = $true; break }
        Start-Sleep -Seconds 3
    }
    if (-not $healthy) {
        Write-Log "public health still failing for $public; one more recycle"
        Stop-NgrokForPort $port
        Start-Ngrok -Port $port -ReservedDomain $reserved
        $public = Wait-NgrokUrl -Port $port -Seconds 45
        if (-not $public) {
            Write-Log 'ngrok did not return after second recycle'
            exit 1
        }
        $healthy = Test-Health ($public.TrimEnd('/') + '/health')
    }

    $current = $public.TrimEnd('/')
    $wantEndpoint = $current + '/line/webhook'
    $needPush = $false

    if ($configured -ne $current) {
        Set-DotEnvValue -Path $EnvFile -Key 'PUBLIC_BASE_URL' -Value $current
        Write-Log "PUBLIC_BASE_URL changed: $configured -> $current"
        $envMap['PUBLIC_BASE_URL'] = $current
        $needPush = $true
    }

    # Always compare what LINE actually has registered (source of truth for delivery).
    try {
        $info = Get-LineWebhookInfo $envMap
        $lineEndpoint = if ($info) { ([string]$info.endpoint).TrimEnd('/') } else { '' }
        if (-not $info -or -not $info.active -or $lineEndpoint -ne $wantEndpoint) {
            Write-Log ("LINE endpoint out of sync (have={0} active={1} want={2})" -f `
                $lineEndpoint, $(if ($info) { $info.active } else { 'n/a' }), $wantEndpoint)
            $needPush = $true
        }
    } catch {
        Write-Log ("could not read LINE webhook; will push: " + $_.Exception.Message)
        $needPush = $true
    }

    if ($Wake) {
        # After hibernate always push, even if hosts look equal - LINE may still
        # be pointing at a dead edge until Verify runs again.
        $needPush = $true
    }

    if ($needPush) {
        if (-not (Update-LineWebhook -EnvMap $envMap -PublicBase $current)) {
            exit 1
        }
    }

    if (-not $healthy) {
        Write-Log "tunnel up at $current but /health is not reachable"
        exit 1
    }

    Save-TunnelState $current
    Write-Log "ok $current webhook=$wantEndpoint"
    exit 0
} catch {
    Write-Log ("error: " + $_.Exception.Message)
    exit 1
} finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
