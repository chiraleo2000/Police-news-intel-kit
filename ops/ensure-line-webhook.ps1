# Keep the LINE webhook reachable on ngrok Free (ephemeral URL).
#
# Long-term Free-plan policy (keep URL stable; recycle only when dead):
#   KEEP  - local tunnel exists AND public /health returns ok
#   START - no ngrok process for this port (cold boot / killed process)
#   RECYCLE - public edge dead (typical after hibernate/shutdown) OR reserved
#             domain mismatch; never recycle a healthy tunnel
#   SYNC  - if URL changed, LINE endpoint drifts, or Wake/logon: PUT + verify
#
# Cooldown: min 20 minutes between RECYCLE of an existing URL (START when there
# is no tunnel is always allowed). Protects LINE delivery during flaky probes.
#
# Usage:
#   ensure-line-webhook.ps1           # periodic repair (Task Scheduler 1-2 min)
#   ensure-line-webhook.ps1 -Wake     # logon / resume: prefer keep, force LINE sync
#
# Env (server\.env):
#   PORT, NGROK_DOMAIN (optional static free host),
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
$CooldownFile = Join-Path $LogDir 'webhook-recycle-cooldown.txt'
$RecycleCooldownMinutes = 20

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

function Test-PublicHealth([string]$PublicBase) {
    if ([string]::IsNullOrWhiteSpace($PublicBase)) { return $false }
    return (Test-Health ($PublicBase.TrimEnd('/') + '/health'))
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
    if ((Get-ListenerPid $Port) -gt 0) {
        Write-Log "news-hub already listening on $Port"
        return
    }
    $node = (Get-Command node -ErrorAction Stop).Source
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    }
    # Do not RedirectStandardOutput to a shared file - exclusive locks cause
    # later Start-Process attempts to fail while hub appears "not healthy".
    # App already writes fatals to logs\server.err.log.
    Start-Process -FilePath $node -ArgumentList 'dist/index.js' `
        -WorkingDirectory $ServerRoot -WindowStyle Hidden | Out-Null
    Write-Log "started news-hub on port $Port"
}

function Start-Ngrok([int]$Port, [string]$ReservedDomain) {
    $ngrok = (Get-Command ngrok -ErrorAction Stop).Source
    $ngrokLog = Join-Path $LogDir 'ngrok-line.log'
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
    # Only true resume-from-sleep (Power-Troubleshooter EventID 1).
    try {
        $since = (Get-Date).AddMinutes(-1 * $WithinMinutes)
        $events = Get-WinEvent -FilterHashtable @{
            LogName = 'System'
            StartTime = $since
            Id = 1
            ProviderName = 'Microsoft-Windows-Power-Troubleshooter'
        } -ErrorAction SilentlyContinue
        return [bool]$events
    } catch {
        return $false
    }
}

function Test-RecycleCooldownElapsed {
    if (-not (Test-Path $CooldownFile)) { return $true }
    try {
        $raw = (Get-Content -Path $CooldownFile -TotalCount 1 -ErrorAction Stop).Trim()
        $last = [datetime]::Parse($raw)
        return ((Get-Date) - $last).TotalMinutes -ge $RecycleCooldownMinutes
    } catch {
        return $true
    }
}

function Set-RecycleCooldown {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    }
    Set-Content -Path $CooldownFile -Value ((Get-Date).ToString('o')) -Encoding ascii
}

function Get-LineWebhookInfo([hashtable]$EnvMap) {
    $token = [string]$EnvMap['LINE_CHANNEL_ACCESS_TOKEN']
    if ([string]::IsNullOrWhiteSpace($token)) { return $null }
    $headers = @{ Authorization = "Bearer $token" }
    return Invoke-RestMethod -Method Get -Uri 'https://api.line.me/v2/bot/channel/webhook/endpoint' `
        -Headers $headers -TimeoutSec 20
}

function Test-LineWebhook([hashtable]$EnvMap) {
    $token = [string]$EnvMap['LINE_CHANNEL_ACCESS_TOKEN']
    if ([string]::IsNullOrWhiteSpace($token)) { return $false }
    $headers = @{ Authorization = "Bearer $token" }
    try {
        $test = Invoke-RestMethod -Method Post -Uri 'https://api.line.me/v2/bot/channel/webhook/test' `
            -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
        return [bool]$test.success
    } catch {
        return $false
    }
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

function Save-TunnelState([string]$PublicBase, [string]$Action) {
    $obj = @{
        public_base_url = $PublicBase
        webhook_url = ($PublicBase.TrimEnd('/') + '/line/webhook')
        last_action = $Action
        updated_at = (Get-Date).ToString('o')
    } | ConvertTo-Json
    Set-Content -Path $StateFile -Value $obj -Encoding utf8
}

function Ensure-NewsHub([int]$Port, [bool]$AllowKill) {
    $localUrl = "http://127.0.0.1:$Port/health"
    if (Test-Health $localUrl) { return $true }

    $owner = Get-ListenerPid $Port
    if ($owner -gt 0) {
        if ($AllowKill) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owner"
            $cmd = [string]$proc.CommandLine
            if ($proc.Name -eq 'node.exe' -and $cmd -match 'dist[/\\]index\.js') {
                Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
                Write-Log "Wake: recycled unresponsive news-hub pid=$owner"
            } else {
                Write-Log "port $Port held by $($proc.Name) pid=$owner; left alone"
                return $false
            }
        } else {
            Write-Log "news-hub pid=$owner listening but /health failed - leave running"
            # Port is held; cannot start another instance. Continue for tunnel/LINE checks.
            return $false
        }
    }

    if ((Get-ListenerPid $Port) -le 0) {
        Start-NewsHub $Port
        foreach ($i in 1..30) {
            Start-Sleep -Seconds 1
            if (Test-Health $localUrl) { return $true }
        }
        Write-Log 'news-hub did not become healthy'
        return $false
    }
    return (Test-Health $localUrl)
}

function New-Tunnel([int]$Port, [string]$ReservedDomain, [string]$Reason) {
    Write-Log "tunnel action ($Reason): starting ngrok"
    Stop-NgrokForPort $Port
    Start-Ngrok -Port $Port -ReservedDomain $ReservedDomain
    $url = Wait-NgrokUrl -Port $Port -Seconds 45
    if (-not $url) {
        Write-Log 'ngrok did not publish a URL'
        return $null
    }
    Set-RecycleCooldown
    Write-Log "tunnel ready $url"
    return $url
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
    $configured = ([string]$envMap['PUBLIC_BASE_URL']).TrimEnd('/')
    $action = 'keep'

    if (-not $Wake -and (Test-RecentResume -WithinMinutes 3)) {
        $Wake = $true
        Write-Log 'detected recent resume from sleep/hibernate -> Wake mode'
    }
    if ($Wake) {
        Write-Log 'Wake mode: keep healthy tunnel; sync LINE; recycle only if public edge is dead'
    }

    $hubOk = Ensure-NewsHub -Port $port -AllowKill:([bool]$Wake)
    if (-not $hubOk -and (Get-ListenerPid $port) -le 0) {
        exit 1
    }

    $public = Get-NgrokPublicUrl -Port $port
    $publicAlive = $false
    if ($public) {
        $publicAlive = Test-PublicHealth $public
    }

    # --- Decide: keep / start / recycle ---
    $needTunnel = $false
    $isColdStart = $false

    if (-not $public) {
        $needTunnel = $true
        $isColdStart = $true
        $action = 'start'
        Write-Log 'no local ngrok tunnel for this port'
    } elseif (-not $publicAlive) {
        # Stale after hibernate: local API still lists old URL, public edge is dead.
        $needTunnel = $true
        $action = 'recycle'
        Write-Log "public health failed for $public (stale edge) - will recycle"
    } elseif ($reserved) {
        $wantHost = ($reserved -replace '^https?://', '' -replace '/.*$', '').ToLowerInvariant()
        $haveHost = ([uri]$public).Host.ToLowerInvariant()
        if ($wantHost -and $haveHost -ne $wantHost) {
            $needTunnel = $true
            $action = 'recycle'
            Write-Log "ngrok host $haveHost != reserved $wantHost"
        }
    }

    # Stale PUBLIC_BASE_URL must NOT force recycle when current tunnel is healthy.
    # Just re-sync .env + LINE to the live URL below.
    if ($configured -and $configured -like 'https://*' -and $publicAlive) {
        if ($configured -ne $public.TrimEnd('/') -and -not (Test-PublicHealth $configured)) {
            Write-Log "PUBLIC_BASE_URL stale ($configured); keeping live tunnel $($public.TrimEnd('/'))"
        }
    }

    if ($needTunnel -and -not $isColdStart) {
        # Cold start always allowed. Recycle of a listed URL:
        #   - dead public edge -> always recycle (LINE is broken otherwise)
        #   - reserved-host mismatch while still healthy -> respect cooldown
        if (-not $publicAlive) {
            Write-Log 'recycle allowed (public edge dead; cooldown bypassed)'
        } elseif (-not (Test-RecycleCooldownElapsed)) {
            Write-Log "recycle skipped - cooldown <${RecycleCooldownMinutes}m and tunnel still healthy"
            $needTunnel = $false
            $action = 'keep'
        }
    }

    if ($needTunnel) {
        $reason = if ($isColdStart) { 'cold-start' } else { 'dead-edge' }
        $public = New-Tunnel -Port $port -ReservedDomain $reserved -Reason $reason
        if (-not $public) { exit 1 }
        $publicAlive = Test-PublicHealth $public
        if (-not $publicAlive) {
            # One retry only after a fresh start failure (network settle).
            Write-Log 'new tunnel health failed; one retry'
            $public = New-Tunnel -Port $port -ReservedDomain $reserved -Reason 'retry'
            if (-not $public) { exit 1 }
            $publicAlive = Test-PublicHealth $public
        }
    }

    if (-not $public) {
        Write-Log 'no public tunnel URL available'
        exit 1
    }

    $current = $public.TrimEnd('/')
    $wantEndpoint = $current + '/line/webhook'
    $needPush = $false

    if ($configured -ne $current) {
        Set-DotEnvValue -Path $EnvFile -Key 'PUBLIC_BASE_URL' -Value $current
        Write-Log "PUBLIC_BASE_URL changed: $configured -> $current"
        $envMap['PUBLIC_BASE_URL'] = $current
        $needPush = $true
        if ($action -eq 'keep') { $action = 'sync' }
    }

    try {
        $info = Get-LineWebhookInfo $envMap
        $lineEndpoint = if ($info) { ([string]$info.endpoint).TrimEnd('/') } else { '' }
        if (-not $info -or -not $info.active -or $lineEndpoint -ne $wantEndpoint) {
            Write-Log ("LINE endpoint out of sync (have={0} active={1} want={2})" -f `
                $lineEndpoint, $(if ($info) { $info.active } else { 'n/a' }), $wantEndpoint)
            $needPush = $true
            if ($action -eq 'keep') { $action = 'sync' }
        }
    } catch {
        Write-Log ("could not read LINE webhook; will push: " + $_.Exception.Message)
        $needPush = $true
        if ($action -eq 'keep') { $action = 'sync' }
    }

    # Wake/logon: verify delivery even when hosts look equal (LINE may cache a dead edge).
    if ($Wake -and -not $needPush) {
        if (-not (Test-LineWebhook $envMap)) {
            Write-Log 'Wake: LINE webhook test failed - re-pushing endpoint'
            $needPush = $true
            if ($action -eq 'keep') { $action = 'sync' }
        } else {
            Write-Log 'Wake: LINE webhook test ok - no push needed'
        }
    }

    if ($needPush) {
        if (-not (Update-LineWebhook -EnvMap $envMap -PublicBase $current)) {
            exit 1
        }
    }

    if (-not $publicAlive) {
        $publicAlive = Test-PublicHealth $current
    }
    if (-not $publicAlive) {
        Write-Log "tunnel up at $current but /health is not reachable"
        exit 1
    }

    Save-TunnelState $current $action
    Write-Log "ok action=$action $current webhook=$wantEndpoint"
    exit 0
} catch {
    Write-Log ("error: " + $_.Exception.Message)
    exit 1
} finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
