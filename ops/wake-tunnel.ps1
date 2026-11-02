# Starts MCP, the single-port gateway, LM Studio on the configured port, and one ngrok tunnel.
# Reads ops/tunnel.config.json. Repo root is the parent of ops/. Never listens on or routes to 7988.
$ErrorActionPreference = "Stop"

$OpsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$RepoRoot = Split-Path -Parent $OpsDir
$ConfigPath = Join-Path $OpsDir "tunnel.config.json"
$script:LogPath = Join-Path $RepoRoot "logs\wake-tunnel.log"
$script:Retries = @(5, 15, 30)

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
    if ($Port -eq 7988) { return $false }
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
    if ($Port -eq 7988) {
        Write-Log "refusing $Name port 7988"
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
        [void](Wait-Port -Port $Port -Label "lms $Port")
    }
    try {
        Write-Log "trying lms load $Model"
        & $LmsPath load $Model
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            Write-Log "lms load failed with exit code $LASTEXITCODE"
        } else {
            Write-Log "lms load completed"
        }
    } catch {
        Write-Log "lms load failed: $($_.Exception.Message)"
    }
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
    $hostName = $uri.Host
    return $hostName -eq "127.0.0.1" -or $hostName -eq "localhost" -or $hostName -eq "::1"
}

function Get-NgrokHttpsUrl {
    param([Parameter(Mandatory = $true)][int]$GatewayPort)
    foreach ($apiPort in @(4040, 4042)) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:${apiPort}/api/tunnels" -TimeoutSec 3
        } catch {
            Write-Log "ngrok API on 127.0.0.1:${apiPort} is not available"
            continue
        }
        foreach ($tunnel in @($response.tunnels)) {
            $public = [string]$tunnel.public_url
            if ($public -notlike "https://*") { continue }
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
    Assert-AllowedPort $GatewayPort "ngrok"
    $existing = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
    if ($existing) {
        Write-Log "ngrok https tunnel already present; not starting another"
        return $existing
    }
    $ngrokPath = Resolve-ToolPath $CommandName
    if (-not $ngrokPath) {
        Write-Log "ngrok command not found: $CommandName"
        return $null
    }
    Write-Log "starting ngrok http $GatewayPort"
    try {
        $proc = Start-Background -FileName $ngrokPath -Arguments "http $GatewayPort"
        Write-Log "started ngrok pid $($proc.Id)"
    } catch {
        Write-Log "failed to start ngrok: $($_.Exception.Message)"
    }
    foreach ($delay in @($script:Retries)) {
        Write-Log "waiting ${delay}s for ngrok https tunnel"
        Start-Sleep -Seconds ([int]$delay)
        $found = Get-NgrokHttpsUrl -GatewayPort $GatewayPort
        if ($found) { return $found }
    }
    Write-Log "ngrok https tunnel still not available"
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
    $script:Retries = @($config.retries | ForEach-Object { [int]$_ })
    if ($script:Retries.Count -eq 0) { throw "retries must list at least one delay" }

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

    Write-Log "wake started repo=$RepoRoot gateway=$gatewayPort mcp=$mcpPort llm=$llmPort"
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
