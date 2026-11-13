# Starts MCP, the single-port gateway, LM Studio on the configured port, and one ngrok tunnel
# for THIS public kit's optional RAG only (gateway :8790 by default).
#
# Isolation (hard rule) — never collide with police-news-intel-private LINE / tor:
#   - Never stop "all ngrok". Recycle only agents that clearly own THIS kit's RAG
#     tunnel (ngrok-rag.log / ngrok-rag.yml / gatewayPort with inspect 4045).
#   - Never bind, probe-kill, recycle, or route to port 18080 (LINE hub).
#   - Never touch ngrok-line.log, police-news-intel-private paths, or the tor
#     reserved host fresh-currently-elk.ngrok-free.app.
#   - Only manage the RAG tunnel for gatewayPort from tunnel.config.json;
#     write github-pages/data/tunnel.json (and optionally git-push that file).
#   - Never listens on or routes to 7988.
#
# Scheduler:
#   PoliceNewsWakeTunnel  — logon / startup / resume / daily (full wake, force model reload)
#   PoliceNewsLmsWatch    — every 5 min (-Watch): LMS + gateway/MCP + RAG ngrok + tunnel.json
#                           so hibernate misses still restore Pages chat, not only Gemma
param(
    [switch]$Wake,
    [switch]$LmsOnly,
    [switch]$Watch
)

$ErrorActionPreference = "Stop"

$OpsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$RepoRoot = Split-Path -Parent $OpsDir
$ConfigPath = Join-Path $OpsDir "tunnel.config.json"
$script:LogPath = Join-Path $RepoRoot "logs\wake-tunnel.log"
$script:Retries = @(5, 15, 30)
$script:ForbiddenPorts = @(18080, 8080, 7988)
$script:ReservedHosts = @("fresh-currently-elk.ngrok-free.app")
$script:NgrokWebAddr = "127.0.0.1:4045"
$script:NgrokLogRel = "logs/ngrok-rag.log"
$script:LmStudioExe = "C:\Program Files\LM Studio\LM Studio.exe"
$script:ForceModelReload = [bool]$Wake
$script:ForceTunnelPublish = $false

function Write-Log {
    param([Parameter(Mandatory = $true)][string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
    Write-Host $line
    $dir = Split-Path -Parent $script:LogPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::AppendAllText($script:LogPath, $line + [Environment]::NewLine, $utf8)
}

function Format-JsonString {
    param([string]$Value)
    if ($null -eq $Value) { $Value = "" }
    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Test-TcpOpen {
    param([Parameter(Mandatory = $true)][int]$Port)
    if ($script:ForbiddenPorts -contains $Port) { return $false }
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        if (-not $task.Wait(500)) { return $false }
        return (-not $task.IsFaulted) -and $client.Connected
    } catch {
        return $false
    } finally {
        try { $client.Dispose() } catch {}
    }
}

function Wait-Port {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (Test-TcpOpen -Port $Port) {
        Write-Log "$Label is ready"
        return $true
    }
    foreach ($delay in @($script:Retries)) {
        Write-Log "$Label not ready; retrying in ${delay}s"
        Start-Sleep -Seconds ([int]$delay)
        if (Test-TcpOpen -Port $Port) {
            Write-Log "$Label is ready"
            return $true
        }
    }
    Write-Log "$Label still not ready"
    return $false
}

function Assert-AllowedPort {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ($script:ForbiddenPorts -contains $Port) {
        Write-Log "refusing $Name port $Port (owned by LINE/tor/other kits; RAG uses gateway/mcp/llm only)"
        exit 1
    }
    if ($Port -lt 1 -or $Port -gt 65535) {
        Write-Log "invalid $Name port $Port"
        exit 1
    }
}

function Start-Background {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [hashtable]$ExtraEnv
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FileName
    $psi.Arguments = $Arguments
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    if ($ExtraEnv) {
        foreach ($key in @($ExtraEnv.Keys)) {
            $psi.EnvironmentVariables[$key] = [string]$ExtraEnv[$key]
        }
    }
    return [System.Diagnostics.Process]::Start($psi)
}

function Resolve-ToolPath {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (Test-Path -LiteralPath $Name) { return (Resolve-Path -LiteralPath $Name).Path }
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    return $null
}

function Start-RepoNode {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [Parameter(Mandatory = $true)][int]$Port,
        [hashtable]$ExtraEnv
    )
    Assert-AllowedPort $Port $ScriptName
    if (Test-TcpOpen $Port) {
        Write-Log "$ScriptName already listening on 127.0.0.1:${Port}"
        return
    }
    $node = Resolve-ToolPath "node"
    if (-not $node) {
        Write-Log "node not found; cannot start $ScriptName"
        return
    }
    $envVars = @{}
    if ($ExtraEnv) {
        foreach ($key in @($ExtraEnv.Keys)) { $envVars[$key] = [string]$ExtraEnv[$key] }
    }
    $envVars["PORT"] = "$Port"
    Write-Log "starting node $ScriptName on 127.0.0.1:${Port}"
    try {
        $proc = Start-Background -FileName $node -Arguments $ScriptName -ExtraEnv $envVars
        Write-Log "started $ScriptName pid $($proc.Id)"
    } catch {
        Write-Log "failed to start ${ScriptName}: $($_.Exception.Message)"
    }
}

function Test-LmsModelReady {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Model
    )
    Assert-AllowedPort $Port "lms-check"
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/v1/models" -TimeoutSec 8
    } catch {
        return $false
    }
    foreach ($item in @($response.data)) {
        $id = [string]$item.id
        if ($id -eq $Model -or $id.StartsWith("$Model/")) { return $true }
    }
    return $false
}

function Test-LmsModelAlive {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Model
    )
    # After hibernate /v1/models can still list the id while JIT is dead.
    if (-not (Test-LmsModelReady -Port $Port -Model $Model)) { return $false }
    $body = @{
        model = $Model
        messages = @(@{ role = "user"; content = "ping" })
        max_tokens = 1
        temperature = 0
    } | ConvertTo-Json -Depth 5
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/v1/chat/completions" `
            -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 45
        return $true
    } catch {
        Write-Log "lms chat ping failed for ${Model}: $($_.Exception.Message)"
        return $false
    }
}

function Ensure-LmStudioApp {
    $procs = @(Get-Process -Name "LM Studio" -ErrorAction SilentlyContinue)
    if ($procs.Count -gt 0) {
        Write-Log "LM Studio app already running ($($procs.Count) process(es))"
        return $true
    }
    if (-not (Test-Path -LiteralPath $script:LmStudioExe)) {
        Write-Log "LM Studio.exe not found at $($script:LmStudioExe)"
        return $false
    }
    Write-Log "starting LM Studio app (needed after reboot/hibernate)"
    try {
        Start-Process -FilePath $script:LmStudioExe | Out-Null
        Start-Sleep -Seconds 8
        return $true
    } catch {
        Write-Log "failed to start LM Studio app: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-LmsLoad {
    param(
        [Parameter(Mandatory = $true)][string]$LmsPath,
        [Parameter(Mandatory = $true)][string]$Model
    )
    # -y is required for Task Scheduler / hibernate wake: without it, lms load can
    # wait on an interactive prompt forever and the model never becomes ready.
    # Do not pass --identifier: reusing the same id after resume exits 1 with
    # "already exists" even when the model is the one we want.
    $arguments = @("load", $Model, "-y")
    Write-Log "trying lms $($arguments -join ' ')"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $LmsPath @arguments 2>&1
        $code = $LASTEXITCODE
    } catch {
        Write-Log "lms load threw: $($_.Exception.Message)"
        return $false
    } finally {
        $ErrorActionPreference = $prevEap
    }
    $joined = (@($output) | ForEach-Object { "$_" }) -join "`n"
    foreach ($line in @($output)) {
        $text = "$line".Trim()
        if ($text) { Write-Log "lms: $text" }
    }
    if ($joined -match '(?i)already (loaded|exists)') {
        Write-Log "lms reports model already present; treating as success"
        return $true
    }
    if ($null -ne $code -and $code -ne 0) {
        Write-Log "lms load failed with exit code $code"
        return $false
    }
    Write-Log "lms load command finished"
    return $true
}

function Start-Lms {
    param(
        [Parameter(Mandatory = $true)][string]$LmsPath,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Model
    )
    Assert-AllowedPort $Port "lms"
    if (-not (Test-Path -LiteralPath $LmsPath)) {
        Write-Log "lms not found at $LmsPath; skipping LM Studio"
        return $false
    }

    [void](Ensure-LmStudioApp)

    $needServer = -not (Test-TcpOpen $Port)
    if (-not $needServer) {
        $status = ""
        try { $status = (& $LmsPath server status 2>&1 | Out-String) } catch { $status = "" }
        if ($status -and ($status -notmatch '(?i)running')) { $needServer = $true }
    }

    if ($needServer) {
        $arguments = "server start -p $Port --cors"
        Write-Log "starting lms: $arguments"
        try {
            # Prefer Start-Process so Task Scheduler resumes do not orphan a hidden child oddly.
            Start-Process -FilePath $LmsPath -ArgumentList @("server", "start", "-p", "$Port", "--cors") -WindowStyle Hidden | Out-Null
            Write-Log "issued lms server start"
        } catch {
            Write-Log "failed to start lms: $($_.Exception.Message)"
        }
    } else {
        Write-Log "LM Studio already listening on 127.0.0.1:${Port}"
    }

    if (-not (Wait-Port -Port $Port -Label "lms $Port")) {
        Write-Log "lms server port $Port never became ready; cannot load $Model"
        return $false
    }

    if (-not $script:ForceModelReload) {
        if (Test-LmsModelAlive -Port $Port -Model $Model) {
            Write-Log "model $Model is alive on 127.0.0.1:${Port}"
            return $true
        }
    } else {
        Write-Log "Wake/Force reload requested for $Model"
    }

    # After hibernate the OpenAI port can accept TCP before the JIT/runtime is ready.
    $delays = @(0, 15, 30, 45, 60)
    foreach ($delay in $delays) {
        if ($delay -gt 0) {
            Write-Log "waiting ${delay}s before retrying lms load $Model"
            Start-Sleep -Seconds $delay
            if (-not (Test-TcpOpen $Port)) {
                Write-Log "lms port $Port closed during retries; restarting server"
                try {
                    Start-Process -FilePath $LmsPath -ArgumentList @("server", "start", "-p", "$Port", "--cors") -WindowStyle Hidden | Out-Null
                } catch {
                    Write-Log "failed to restart lms: $($_.Exception.Message)"
                }
                [void](Wait-Port -Port $Port -Label "lms $Port")
            }
        }
        [void](Invoke-LmsLoad -LmsPath $LmsPath -Model $Model)
        Start-Sleep -Seconds 5
        if (Test-LmsModelAlive -Port $Port -Model $Model) {
            Write-Log "verified model $Model responds on 127.0.0.1:${Port}"
            return $true
        }
        Write-Log "model $Model not ready yet (list or chat ping)"
    }
    Write-Log "gave up loading $Model after retries"
    return $false
}

function Test-ReservedPublicUrl {
    param([string]$PublicUrl)
    if ([string]::IsNullOrWhiteSpace($PublicUrl)) { return $false }
    try {
        $uri = [Uri]$PublicUrl
        $hostName = $uri.Host.ToLowerInvariant()
    } catch {
        return $false
    }
    foreach ($reserved in @($script:ReservedHosts)) {
        if ($hostName -eq $reserved.ToLowerInvariant()) { return $true }
    }
    return $false
}

function Test-NgrokTargetsPort {
    param(
        [Parameter(Mandatory = $true)]$Tunnel,
        [Parameter(Mandatory = $true)][int]$Port
    )
    $addr = [string]$Tunnel.config.addr
    if ([string]::IsNullOrWhiteSpace($addr)) { return $false }
    $candidate = $addr.Trim()
    if ($candidate -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $candidate = "http://$candidate" }
    try {
        $uri = [Uri]$candidate
    } catch {
        return $false
    }
    if ($uri.Port -ne $Port) { return $false }
    if ($script:ForbiddenPorts -contains $uri.Port) { return $false }
    $hostName = $uri.Host
    return $hostName -eq "127.0.0.1" -or $hostName -eq "localhost" -or $hostName -eq "::1"
}

function Get-NgrokApiPorts {
    $ports = New-Object System.Collections.Generic.List[int]
    if ($script:NgrokWebAddr -match ':(\d+)\s*$') {
        [void]$ports.Add([int]$Matches[1])
    }
    foreach ($p in @(4045, 4040, 4041, 4042)) {
        if (-not $ports.Contains($p)) { [void]$ports.Add($p) }
    }
    return @($ports)
}

function Get-NgrokHttpsUrl {
    param([Parameter(Mandatory = $true)][int]$GatewayPort)
    Assert-AllowedPort $GatewayPort "ngrok-lookup"
    foreach ($apiPort in @(Get-NgrokApiPorts)) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:${apiPort}/api/tunnels" -TimeoutSec 3
        } catch {
            Write-Log "ngrok API on 127.0.0.1:${apiPort} is not available"
            continue
        }
        foreach ($tunnel in @($response.tunnels)) {
            $public = [string]$tunnel.public_url
            if ($public -notlike "https://*") { continue }
            if (Test-ReservedPublicUrl -PublicUrl $public) {
                Write-Log "ignoring reserved tor host tunnel $public"
                continue
            }
            if (-not (Test-NgrokTargetsPort -Tunnel $tunnel -Port $GatewayPort)) {
                Write-Log "ignoring https tunnel $public because it does not forward to 127.0.0.1:${GatewayPort}"
                continue
            }
            Write-Log "ngrok https public_url from ${apiPort}: $public"
            return $public
        }
    }
    return $null
}

function Wait-ForNetwork {
    # After hibernate, Wi-Fi/Ethernet often lags behind the resume event.
    $delays = @(0, 5, 10, 15, 20, 30, 45)
    foreach ($delay in $delays) {
        if ($delay -gt 0) {
            Write-Log "waiting ${delay}s for network after resume/hibernate"
            Start-Sleep -Seconds ([int]$delay)
        }
        try {
            $dns = Resolve-DnsName "ngrok.com" -ErrorAction Stop -DnsOnly
            if ($dns) {
                Write-Log "network DNS ready"
                return $true
            }
        } catch { }
        try {
            $req = Invoke-WebRequest -Uri "https://www.msftconnecttest.com/connecttest.txt" -UseBasicParsing -TimeoutSec 5
            if ($req.StatusCode -ge 200) {
                Write-Log "network HTTP ready"
                return $true
            }
        } catch { }
    }
    Write-Log "network still not ready; continuing anyway"
    return $false
}

function Get-NgrokInspectPort {
    if ($script:NgrokWebAddr -match ':(\d+)\s*$') { return [int]$Matches[1] }
    return 4045
}

function Get-RagNgrokPids {
    param([Parameter(Mandatory = $true)][int]$GatewayPort)
    $inspect = Get-NgrokInspectPort
    $inspectToken = ":$inspect"
    $inspectHost = "127.0.0.1:$inspect"
    $portToken = [string]$GatewayPort
    $pids = New-Object System.Collections.ArrayList
    foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue)) {
        $cmd = [string]$proc.CommandLine
        if ([string]::IsNullOrWhiteSpace($cmd)) { continue }
        if ($cmd -match '(?i)ngrok-line\.log|police-news-intel-private|fresh-currently-elk|ngrok-3000\.log|ngrok-8080\.log|ngrok-7988\.log') { continue }
        if ($cmd -match '(?i)18080|:18080\b') { continue }
        $isRag = $false
        if ($cmd -match '(?i)ngrok-rag\.log|ngrok-rag\.yml') { $isRag = $true }
        if ($cmd.Contains($inspectToken) -or $cmd.Contains($inspectHost)) { $isRag = $true }
        if ($cmd.Contains($portToken) -and ($cmd -notmatch '(?i)18080|8080|7988|\b3000\b')) { $isRag = $true }
        if (-not $isRag) { continue }
        $pidVal = 0
        try { $pidVal = [int]$proc.ProcessId } catch { $pidVal = 0 }
        if ($pidVal -le 0) { continue }
        [void]$pids.Add($pidVal)
    }
    return @($pids.ToArray())
}

function Stop-RagNgrokOnly {
    param([Parameter(Mandatory = $true)][int]$GatewayPort)
    $pids = @(Get-RagNgrokPids -GatewayPort $GatewayPort)
    if ($pids.Count -eq 0) {
        Write-Log "no RAG-only ngrok process to recycle"
        return
    }
    foreach ($pidVal in $pids) {
        Write-Log "recycling RAG ngrok pid=$pidVal (LINE/tor agents left alone)"
        try {
            Stop-Process -Id $pidVal -Force -ErrorAction Stop
        } catch {
            Write-Log "could not stop RAG ngrok pid=${pidVal}: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Seconds 2
}

function Test-PublicLlmEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][int]$LlmPort,
        [int]$Attempts = 1
    )
    $url = "$Base/$LlmPort/v1/models"
    if ($Attempts -lt 1) { $Attempts = 1 }
    for ($i = 1; $i -le $Attempts; $i++) {
        if ($i -gt 1) {
            Write-Log "retrying public LLM probe ($i/$Attempts) after brief settle"
            Start-Sleep -Seconds (3 * ($i - 1))
        }
        try {
            $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -Headers @{
                'ngrok-skip-browser-warning' = 'true'
                'Accept' = 'application/json'
            }
            if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) { return $true }
            Write-Log "public LLM probe status=$($res.StatusCode) for $url"
        } catch {
            Write-Log "public LLM probe failed for $url : $($_.Exception.Message)"
        }
    }
    return $false
}

function Test-TunnelNeedsGitPublish {
    param([Parameter(Mandatory = $true)][string]$TunnelPath)
    Push-Location $RepoRoot
    try {
        $porcelain = & git status --porcelain -- "github-pages/data/tunnel.json" 2>$null
        if ($LASTEXITCODE -ne 0) { return $true }
        return -not [string]::IsNullOrWhiteSpace([string]$porcelain)
    } catch {
        return $true
    } finally {
        Pop-Location
    }
}

function Test-RecentResume {
    param([int]$WithinMinutes = 5)
    # Same signal LINE wake uses (Power-Troubleshooter EventID 1).
    try {
        $since = (Get-Date).AddMinutes(-1 * $WithinMinutes)
        $events = Get-WinEvent -FilterHashtable @{
            LogName      = 'System'
            StartTime    = $since
            Id           = 1
            ProviderName = 'Microsoft-Windows-Power-Troubleshooter'
        } -ErrorAction SilentlyContinue
        return [bool]$events
    } catch {
        return $false
    }
}

function Get-PublishedTunnelBase {
    $tunnelPath = Join-Path $RepoRoot "github-pages\data\tunnel.json"
    if (-not (Test-Path -LiteralPath $tunnelPath)) { return "" }
    try {
        $raw = [System.IO.File]::ReadAllText($tunnelPath)
        if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 0xFEFF) { $raw = $raw.Substring(1) }
        $obj = $raw | ConvertFrom-Json
        return [string]$obj.base
    } catch {
        return ""
    }
}

function Get-RemotePagesTunnelBase {
    param([Parameter(Mandatory = $true)][string]$PagesBase)
    $root = ([string]$PagesBase).Trim().TrimEnd('/')
    if (-not $root) { return "" }
    $url = "{0}/data/tunnel.json?t={1}" -f $root, [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    try {
        $obj = Invoke-RestMethod -Uri $url -TimeoutSec 20
        return [string]$obj.base
    } catch {
        Write-Log "could not read Pages tunnel.json at $url : $($_.Exception.Message)"
        return ""
    }
}

function Get-NgrokDefaultConfigPath {
    $packaged = Join-Path $env:LOCALAPPDATA "Packages\ngrok.ngrok_1g87z0zv29zzc\LocalCache\Local\ngrok\ngrok.yml"
    if (Test-Path -LiteralPath $packaged) { return $packaged }
    $legacy = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
    if (Test-Path -LiteralPath $legacy) { return $legacy }
    return $null
}

function Ensure-NgrokRagConfig {
    # ngrok 3.39+ dropped --web-addr; set inspect via a side config that merges with the default authtoken file.
    $path = Join-Path $OpsDir "ngrok-rag.yml"
    $web = [string]$script:NgrokWebAddr
    if ([string]::IsNullOrWhiteSpace($web)) { $web = "127.0.0.1:4045" }
    $yaml = @"
version: "3"
agent:
  web_addr: $web
"@
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, ($yaml.Replace("`r`n", "`n").Trim() + "`n"), $utf8)
    return $path
}

function Start-RagNgrokProcess {
    param(
        [Parameter(Mandatory = $true)][string]$NgrokPath,
        [Parameter(Mandatory = $true)][int]$GatewayPort
    )
    $logRel = $script:NgrokLogRel -replace "/", "\"
    if ([System.IO.Path]::IsPathRooted($logRel)) {
        $ngrokLogPath = $logRel
    } else {
        $ngrokLogPath = Join-Path $RepoRoot $logRel
    }
    $logDir = Split-Path -Parent $ngrokLogPath
    if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    # Own inspect + log only — never ngrok-line.log / private kit paths.
    # Do not pass --web-addr (removed in ngrok 3.39); merge default authtoken + ops/ngrok-rag.yml.
    $ragCfg = Ensure-NgrokRagConfig
    $defaultCfg = Get-NgrokDefaultConfigPath
    $argParts = @("http")
    if ($defaultCfg) {
        $argParts += @("--config", "`"$defaultCfg`"")
    } else {
        Write-Log "WARNING: default ngrok.yml not found; RAG tunnel may fail auth (ERR_NGROK_4018)"
    }
    $argParts += @(
        "--config", "`"$ragCfg`"",
        "--log", "`"$ngrokLogPath`"",
        "--log-format", "logfmt",
        "$GatewayPort"
    )
    $arguments = [string]::Join(" ", $argParts)
    Write-Log "starting RAG ngrok: $arguments"
    try {
        $proc = Start-Background -FileName $NgrokPath -Arguments $arguments
        Write-Log "started RAG ngrok pid $($proc.Id) (LINE/tor agents left alone)"
        return $true
    } catch {
        Write-Log "failed to start ngrok: $($_.Exception.Message)"
        return $false
    }
}

function Wait-ForRagNgrokUrl {
    param([Parameter(Mandatory = $true)][int]$GatewayPort)
    $waits = @($script:Retries)
    if ($waits.Count -lt 4) { $waits = @(5, 10, 20, 30, 45) }
    $inspect = Get-NgrokInspectPort
    foreach ($delay in $waits) {
        Write-Log "waiting ${delay}s for RAG ngrok https tunnel"
        Start-Sleep -Seconds ([int]$delay)
        if (-not (Test-TcpOpen $inspect)) {
            Write-Log "ngrok inspect $inspect not open yet (other ngrok on 4040/4041 left alone)"
        }
        $found = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
        if ($found) { return $found }
    }
    return $null
}

function Ensure-Ngrok {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][int]$GatewayPort,
        [Parameter(Mandatory = $true)][int]$LlmPort,
        [switch]$ForceRestart
    )
    # Recycle only THIS kit's RAG ngrok — leave LINE :18080 / tor tunnels alone.
    Assert-AllowedPort $GatewayPort "ngrok"
    [void](Wait-ForNetwork)

    if (-not $ForceRestart) {
        $existing = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
        if ($existing) {
            $origin = Get-HttpsOrigin $existing
            # Retry probes: ngrok edge often returns 502 for a few seconds after resume.
            if ($origin -and (Test-PublicLlmEndpoint -Base $origin -LlmPort $LlmPort -Attempts 4)) {
                Write-Log "RAG ngrok https tunnel healthy: $origin"
                return $existing
            }
            Write-Log "RAG tunnel present but public LLM probe failed; recycling RAG agent only"
            Stop-RagNgrokOnly -GatewayPort $GatewayPort
        } else {
            Write-Log "no live RAG tunnel URL; checking for zombie RAG ngrok processes"
            $zombies = @(Get-RagNgrokPids -GatewayPort $GatewayPort)
            Write-Log ("zombie RAG ngrok count={0}" -f $zombies.Count)
            if ($zombies.Count -gt 0) {
                Write-Log "RAG ngrok process(es) exist without a live API tunnel; recycling"
                Stop-RagNgrokOnly -GatewayPort $GatewayPort
            }
        }
    } else {
        Write-Log "ForceRestart: recycling RAG ngrok before start"
        Stop-RagNgrokOnly -GatewayPort $GatewayPort
    }

    Write-Log "resolving ngrok executable for RAG tunnel"
    $ngrokPath = Resolve-ToolPath $CommandName
    if (-not $ngrokPath) {
        Write-Log "ngrok command not found: $CommandName"
        return $null
    }
    Write-Log "ngrok executable=$ngrokPath"

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-Log "RAG ngrok start attempt $attempt/3"
        if ($attempt -gt 1) {
            Stop-RagNgrokOnly -GatewayPort $GatewayPort
            Start-Sleep -Seconds (5 * $attempt)
            [void](Wait-ForNetwork)
        }
        [void](Start-RagNgrokProcess -NgrokPath $ngrokPath -GatewayPort $GatewayPort)
        $found = Wait-ForRagNgrokUrl -GatewayPort $GatewayPort
        if (-not $found) {
            Write-Log "RAG ngrok https tunnel not available on attempt $attempt"
            continue
        }
        $origin = Get-HttpsOrigin $found
        if ($origin -and (Test-PublicLlmEndpoint -Base $origin -LlmPort $LlmPort -Attempts 5)) {
            Write-Log "RAG ngrok public LLM probe ok: $origin"
            return $found
        }
        Write-Log "RAG tunnel URL up but public LLM still failing on attempt $attempt"
    }
    Write-Log "RAG ngrok https tunnel still not available after retries"
    return $null
}

function Get-HttpsOrigin {
    param([Parameter(Mandatory = $true)][string]$PublicUrl)
    try {
        $uri = [Uri]$PublicUrl
    } catch {
        return $null
    }
    if ($uri.Scheme -ne "https" -or [string]::IsNullOrWhiteSpace($uri.Authority)) { return $null }
    if (Test-ReservedPublicUrl -PublicUrl $PublicUrl) {
        Write-Log "refusing reserved tor host as tunnel base: $PublicUrl"
        return $null
    }
    return ("{0}://{1}" -f $uri.Scheme, $uri.Authority).TrimEnd("/")
}

function Save-TunnelFile {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][int]$McpPort,
        [Parameter(Mandatory = $true)][int]$LlmPort,
        [Parameter(Mandatory = $true)][bool]$Push
    )
    $tunnelPath = Join-Path $RepoRoot "github-pages\data\tunnel.json"
    $oldBase = ""
    if (Test-Path -LiteralPath $tunnelPath) {
        try {
            $raw = [System.IO.File]::ReadAllText($tunnelPath)
            if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 0xFEFF) { $raw = $raw.Substring(1) }
            $existing = $raw | ConvertFrom-Json
            $oldBase = [string]$existing.base
        } catch {
            Write-Log "could not read existing tunnel.json: $($_.Exception.Message)"
        }
    }

    $updated = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $mcpUrl = "$Base/$McpPort/mcp"
    $llmUrl = "$Base/$LlmPort/v1/chat/completions"
    $model = [string]$Config.model
    $json = @"
{
  "base": $(Format-JsonString $Base),
  "mcp": $(Format-JsonString $mcpUrl),
  "llm": $(Format-JsonString $llmUrl),
  "model": $(Format-JsonString $model),
  "updated_at": $(Format-JsonString $updated)
}
"@
    $json = $json.Replace("`r`n", "`n").Trim() + "`n"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tunnelPath, $json, $utf8)
    Write-Log "wrote $tunnelPath base=$Base"

    if (-not $Push) {
        Write-Log "push is false; not committing"
        return
    }
    # Base may already match local file after a previous write that never reached
    # origin (Pages still serves the stale URL). Always publish when git is dirty
    # or when the caller set ForceTunnelPublish (remote Pages drift).
    $dirty = Test-TunnelNeedsGitPublish -TunnelPath $tunnelPath
    $forcePublish = [bool]$script:ForceTunnelPublish
    if (($Base -eq $oldBase) -and (-not $dirty) -and (-not $forcePublish)) {
        Write-Log "tunnel base unchanged and git clean; not committing"
        return
    }
    if (($Base -eq $oldBase) -and ($dirty -or $forcePublish)) {
        Write-Log "tunnel base unchanged locally but publish required (dirty=$dirty force=$forcePublish) — pushing so Pages catches up"
    }

    $env:GIT_TERMINAL_PROMPT = "0"
    Push-Location $RepoRoot
    try {
        & git add -- "github-pages/data/tunnel.json"
        if ($LASTEXITCODE -ne 0) { throw "git add exited $LASTEXITCODE" }
        $still = & git status --porcelain -- "github-pages/data/tunnel.json" 2>$null
        if ([string]::IsNullOrWhiteSpace([string]$still)) {
            Write-Log "tunnel.json already staged/committed; ensuring push"
        } else {
            & git commit -m "Update the public tunnel URL." -- "github-pages/data/tunnel.json"
            if ($LASTEXITCODE -ne 0) { throw "git commit exited $LASTEXITCODE" }
        }
        & git push
        if ($LASTEXITCODE -ne 0) { throw "git push exited $LASTEXITCODE" }
        Write-Log "pushed github-pages/data/tunnel.json"
    } catch {
        Write-Log "git publish failed: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

try {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        Write-Log "missing config $ConfigPath"
        exit 1
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $logSetting = [string]$config.log
    if (-not [string]::IsNullOrWhiteSpace($logSetting)) {
        if ([System.IO.Path]::IsPathRooted($logSetting)) {
            $script:LogPath = $logSetting
        } else {
            $script:LogPath = Join-Path $RepoRoot ($logSetting -replace "/", "\")
        }
    }
    if ($script:LogPath -match 'ngrok-line\.log$' -or $script:LogPath -match 'police-news-intel-private') {
        Write-Log "refusing log path that belongs to LINE/private kit: $script:LogPath"
        exit 1
    }
    $script:Retries = @($config.retries | ForEach-Object { [int]$_ })
    if ($script:Retries.Count -eq 0) { throw "retries must list at least one delay" }

    if ($null -ne $config.forbiddenPorts) {
        $script:ForbiddenPorts = @($config.forbiddenPorts | ForEach-Object { [int]$_ })
    }
    if ($null -ne $config.reservedHosts) {
        $script:ReservedHosts = @($config.reservedHosts | ForEach-Object { [string]$_ })
    }
    $webAddr = [string]$config.ngrokWebAddr
    if (-not [string]::IsNullOrWhiteSpace($webAddr)) { $script:NgrokWebAddr = $webAddr.Trim() }
    $ngrokLogCfg = [string]$config.ngrokLog
    if (-not [string]::IsNullOrWhiteSpace($ngrokLogCfg)) {
        if ($ngrokLogCfg -match 'ngrok-line\.log' -or $ngrokLogCfg -match 'police-news-intel-private') {
            Write-Log "refusing ngrokLog that belongs to LINE/private kit: $ngrokLogCfg"
            exit 1
        }
        $script:NgrokLogRel = $ngrokLogCfg.Trim()
    }

    $gatewayPort = [int]$config.gatewayPort
    $mcpPort = [int]$config.mcpPort
    $llmPort = [int]$config.llmPort
    Assert-AllowedPort $gatewayPort "gateway"
    Assert-AllowedPort $mcpPort "mcp"
    Assert-AllowedPort $llmPort "llm"

    $pagesBase = ([string]$config.pagesBase).Trim().TrimEnd("/")
    $model = [string]$config.model
    $lmsPath = [string]$config.lms
    $ngrokCommand = [string]$config.ngrok
    if ([string]::IsNullOrWhiteSpace($ngrokCommand)) { $ngrokCommand = "ngrok" }
    $push = $false
    if ($config.push -eq $true) { $push = $true }

    if ($Wake) { $script:ForceModelReload = $true }
    if ($Watch -and $LmsOnly) {
        Write-Log "both -Watch and -LmsOnly set; preferring -Watch"
        $LmsOnly = $false
    }
    # Periodic watch after hibernate often races the dedicated -Wake task. Promote to
    # a fuller repair path so Pages chat is restored even if the event trigger missed.
    if ($Watch -and -not $Wake -and (Test-RecentResume -WithinMinutes 8)) {
        Write-Log "detected recent resume from sleep/hibernate during -Watch -> force model reload + network settle"
        $script:ForceModelReload = $true
        [void](Wait-ForNetwork)
    }
    $mode = if ($LmsOnly) { "lms-only" } elseif ($Watch) { "watch" } elseif ($Wake) { "wake" } else { "full" }
    Write-Log "wake started mode=$mode repo=$RepoRoot gateway=$gatewayPort mcp=$mcpPort llm=$llmPort model=$model (RAG only; never touch :18080 / tor)"

    if ($Wake) {
        [void](Wait-ForNetwork)
    }

    $lmsOk = Start-Lms -LmsPath $lmsPath -Port $llmPort -Model $model
    if (-not $lmsOk) {
        Write-Log "CRITICAL: google/gemma model not ready ($model)"
        if ($LmsOnly) { exit 1 }
    } else {
        Write-Log "LM Studio model ready: $model"
    }

    if ($LmsOnly) {
        Write-Log "lms-only watch finished ok=$lmsOk"
        if ($lmsOk) { exit 0 } else { exit 1 }
    }

    # Watch + Wake + full: restore the whole Pages chat stack, not only Gemma.
    Start-RepoNode -ScriptName "mcp/server.mjs" -Port $mcpPort -ExtraEnv @{ PAGES_BASE = $pagesBase }
    Start-RepoNode -ScriptName "gateway/server.mjs" -Port $gatewayPort
    [void](Wait-Port -Port $mcpPort -Label "mcp $mcpPort")
    [void](Wait-Port -Port $gatewayPort -Label "gateway $gatewayPort")

    if (-not (Test-TcpOpen $gatewayPort) -or -not (Test-TcpOpen $mcpPort)) {
        Write-Log "gateway/mcp not ready; cannot expose RAG tunnel"
        if ($lmsOk -and ($Watch -or $Wake)) {
            Write-Log "finished with LMS only (gateway/mcp pending)"
            exit 0
        }
        exit 1
    }

    # Recycle only when the live probe fails (inside Ensure-Ngrok). Do not tear down a
    # healthy RAG tunnel on every wake — that churns the public URL and breaks Pages.
    $publicUrl = Ensure-Ngrok -CommandName $ngrokCommand -GatewayPort $gatewayPort -LlmPort $llmPort
    if (-not $publicUrl) {
        # LMS/Gemma is the wake priority after hibernate. Do not fail the whole
        # scheduled task solely because RAG ngrok lagged — -Watch retries every 5 min.
        Write-Log "no https tunnel URL; tunnel.json was not updated (lmsOk=$lmsOk)"
        if ($lmsOk) {
            Write-Log "finished with LMS only (ngrok pending; watch will retry)"
            exit 0
        }
        exit 1
    }
    $origin = Get-HttpsOrigin $publicUrl
    if (-not $origin) {
        Write-Log "public URL is not an https origin: $publicUrl"
        if ($lmsOk) { exit 0 }
        exit 1
    }

    $published = Get-PublishedTunnelBase
    $tunnelPath = Join-Path $RepoRoot "github-pages\data\tunnel.json"
    $needsPublish = Test-TunnelNeedsGitPublish -TunnelPath $tunnelPath
    $remotePages = ""
    if ($pagesBase) {
        $remotePages = Get-RemotePagesTunnelBase -PagesBase $pagesBase
        if ($remotePages -and ($remotePages.TrimEnd('/') -ne $origin.TrimEnd('/'))) {
            Write-Log "GitHub Pages still serves stale tunnel base=$remotePages (live=$origin) — force publish"
            $needsPublish = $true
        } elseif (-not $remotePages) {
            Write-Log "could not verify remote Pages tunnel.json; will publish if local/git needs it"
        } else {
            Write-Log "GitHub Pages tunnel.json already matches live base=$origin"
        }
    }
    if ($mode -eq "watch" -and $published -eq $origin -and (-not $needsPublish) -and (Test-PublicLlmEndpoint -Base $origin -LlmPort $llmPort)) {
        Write-Log "watch ok: local+Pages tunnel.json match healthy $origin and git is clean"
        exit 0
    }
    if ($needsPublish) {
        Write-Log "tunnel.json needs publish so GitHub Pages stops using a stale URL"
    }

    $pagesFile = if ($pagesBase) { "$pagesBase/data/tunnel.json" } else { "github-pages/data/tunnel.json" }
    Write-Log "GitHub Pages chat reads $pagesFile"
    # Force commit/push when Pages drifted even if local base string was already updated.
    if ($needsPublish -and ($published -eq $origin)) {
        # Bump updated_at by rewriting; Save-TunnelFile also checks git dirty / remote need.
        $script:ForceTunnelPublish = $true
    }
    Save-TunnelFile -Base $origin -Config $config -McpPort $mcpPort -LlmPort $llmPort -Push $push
    Write-Log "wake finished mode=$mode base=$origin"
    exit 0
} catch {
    Write-Log "wake failed: $($_.Exception.Message)"
    if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
        Write-Log ("wake failed at: {0}" -f (($_.InvocationInfo.PositionMessage -replace '\s+', ' ').Trim()))
    }
    if ($_.ScriptStackTrace) {
        Write-Log ("wake stack: {0}" -f ($_.ScriptStackTrace -replace '\s+', ' '))
    }
    exit 1
}
