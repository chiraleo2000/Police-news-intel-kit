# Starts MCP, the single-port gateway, LM Studio on the configured port, and one ngrok tunnel
# for THIS public kit's optional RAG only (gateway :8790 by default).
#
# Isolation (hard rule) — never collide with police-news-intel-private LINE / tor:
#   - Never Stop-Process ngrok (not by name, not "all", not other agents).
#   - Never bind, probe-kill, recycle, or route to port 18080 (LINE hub).
#   - Never touch ngrok-line.log, police-news-intel-private paths, or the tor
#     reserved host fresh-currently-elk.ngrok-free.app.
#   - Only manage the RAG tunnel for gatewayPort from tunnel.config.json;
#     write github-pages/data/tunnel.json (and optionally git-push that file).
#   - Never listens on or routes to 7988.
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
        return
    }

    if (Test-TcpOpen $Port) {
        Write-Log "LM Studio already listening on 127.0.0.1:${Port}"
    } else {
        $arguments = "server start -p $Port --cors"
        Write-Log "starting lms: $arguments"
        try {
            $proc = Start-Background -FileName $LmsPath -Arguments $arguments
            Write-Log "started lms pid $($proc.Id)"
        } catch {
            Write-Log "failed to start lms: $($_.Exception.Message)"
        }
    }

    if (-not (Wait-Port -Port $Port -Label "lms $Port")) {
        Write-Log "lms server port $Port never became ready; cannot load $Model"
        return
    }

    if (Test-LmsModelReady -Port $Port -Model $Model) {
        Write-Log "model $Model already listed on 127.0.0.1:${Port}/v1/models"
        return
    }

    # After hibernate the OpenAI port can accept TCP before the JIT/runtime is ready.
    $delays = @(0, 20, 40, 60)
    foreach ($delay in $delays) {
        if ($delay -gt 0) {
            Write-Log "waiting ${delay}s before retrying lms load $Model"
            Start-Sleep -Seconds $delay
            if (-not (Test-TcpOpen $Port)) {
                Write-Log "lms port $Port closed during retries; restarting server"
                try {
                    $proc = Start-Background -FileName $LmsPath -Arguments "server start -p $Port --cors"
                    Write-Log "restarted lms pid $($proc.Id)"
                } catch {
                    Write-Log "failed to restart lms: $($_.Exception.Message)"
                }
                [void](Wait-Port -Port $Port -Label "lms $Port")
            }
        }
        [void](Invoke-LmsLoad -LmsPath $LmsPath -Model $Model)
        Start-Sleep -Seconds 3
        if (Test-LmsModelReady -Port $Port -Model $Model) {
            Write-Log "verified model $Model on 127.0.0.1:${Port}/v1/models"
            return
        }
        Write-Log "model $Model not ready yet on /v1/models"
    }
    Write-Log "gave up loading $Model after retries"
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

function Ensure-Ngrok {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][int]$GatewayPort
    )
    # Intentionally never Stop-Process ngrok — leave LINE :18080 / tor tunnels alone.
    Assert-AllowedPort $GatewayPort "ngrok"
    $existing = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
    if ($existing) {
        Write-Log "RAG ngrok https tunnel already present; not starting another"
        return $existing
    }
    $ngrokPath = Resolve-ToolPath $CommandName
    if (-not $ngrokPath) {
        Write-Log "ngrok command not found: $CommandName"
        return $null
    }

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
    $arguments = "http --log `"$ngrokLogPath`" --web-addr $($script:NgrokWebAddr) $GatewayPort"
    Write-Log "starting RAG ngrok: $arguments"
    try {
        $proc = Start-Background -FileName $ngrokPath -Arguments $arguments
        Write-Log "started RAG ngrok pid $($proc.Id) (no Stop-Process of other ngrok)"
    } catch {
        Write-Log "failed to start ngrok: $($_.Exception.Message)"
    }
    foreach ($delay in @($script:Retries)) {
        Write-Log "waiting ${delay}s for RAG ngrok https tunnel"
        Start-Sleep -Seconds ([int]$delay)
        $found = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
        if ($found) { return $found }
    }
    Write-Log "RAG ngrok https tunnel still not available"
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
    if ($Base -eq $oldBase) {
        Write-Log "tunnel base unchanged; not committing"
        return
    }

    $env:GIT_TERMINAL_PROMPT = "0"
    Push-Location $RepoRoot
    try {
        & git add -- "github-pages/data/tunnel.json"
        if ($LASTEXITCODE -ne 0) { throw "git add exited $LASTEXITCODE" }
        & git commit -m "Update the public tunnel URL." -- "github-pages/data/tunnel.json"
        if ($LASTEXITCODE -ne 0) { throw "git commit exited $LASTEXITCODE" }
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

    Write-Log "wake started repo=$RepoRoot gateway=$gatewayPort mcp=$mcpPort llm=$llmPort (RAG only; never touch :18080 / tor)"
    Start-RepoNode -ScriptName "mcp/server.mjs" -Port $mcpPort -ExtraEnv @{ PAGES_BASE = $pagesBase }
    Start-RepoNode -ScriptName "gateway/server.mjs" -Port $gatewayPort
    [void](Wait-Port -Port $mcpPort -Label "mcp $mcpPort")
    [void](Wait-Port -Port $gatewayPort -Label "gateway $gatewayPort")
    Start-Lms -LmsPath $lmsPath -Port $llmPort -Model $model

    $publicUrl = Ensure-Ngrok -CommandName $ngrokCommand -GatewayPort $gatewayPort
    if (-not $publicUrl) {
        Write-Log "no https tunnel URL; tunnel.json was not updated"
        exit 1
    }
    $origin = Get-HttpsOrigin $publicUrl
    if (-not $origin) {
        Write-Log "public URL is not an https origin: $publicUrl"
        exit 1
    }
    $pagesFile = if ($pagesBase) { "$pagesBase/data/tunnel.json" } else { "github-pages/data/tunnel.json" }
    Write-Log "GitHub Pages chat reads $pagesFile"
    Save-TunnelFile -Base $origin -Config $config -McpPort $mcpPort -LlmPort $llmPort -Push $push
    Write-Log "wake finished"
    exit 0
} catch {
    Write-Log "wake failed: $($_.Exception.Message)"
    exit 1
}
