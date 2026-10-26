# Publish local news/Pages data to GitHub (commit + push).
# Safe: never force-push, never commit .env / local config / cache / sqlite / _to_delete / ops/run.
# Schedule: 10:00 and 14:00 Asia/Bangkok via register-git-publish-task.ps1
#
# Hardened for Task Scheduler:
#   - resolves node/git even with a minimal PATH
#   - git stderr warnings are NOT treated as failures
#   - commits only when there are staged tracked changes
#   - retries push once
#   - always writes a clear start/end line to logs\git-publish.log

param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Continue'
$KitRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $KitRoot 'logs'
$LogFile = Join-Path $LogDir 'git-publish.log'
$Rebuild = Join-Path $PSScriptRoot 'rebuild-pages-feed.js'
$script:NodeExe = $null
$script:GitExe = $null

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Find-Exe([string]$Name, [string[]]$Candidates) {
    foreach ($c in $Candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path }
    }
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    return $null
}

function Initialize-Tools {
    # Task Scheduler often has a stripped PATH - prepend common install dirs.
    $extra = @(
        'C:\Program Files\nodejs',
        'C:\Program Files\Git\cmd',
        'C:\Program Files\Git\bin',
        "$env:LOCALAPPDATA\Programs\Git\cmd",
        "$env:ProgramFiles\nodejs"
    ) | Where-Object { $_ -and (Test-Path $_) }
    $env:Path = (($extra + ($env:Path -split ';' | Where-Object { $_ })) -join ';')

    $script:NodeExe = Find-Exe 'node.exe' @(
        'C:\Program Files\nodejs\node.exe',
        "$env:ProgramFiles\nodejs\node.exe"
    )
    $script:GitExe = Find-Exe 'git.exe' @(
        'C:\Program Files\Git\cmd\git.exe',
        'C:\Program Files\Git\bin\git.exe',
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )

    if (-not $script:NodeExe) { throw 'node.exe not found - install Node.js or add it to PATH' }
    if (-not $script:GitExe) { throw 'git.exe not found - install Git or add it to PATH' }
    Write-Log ("tools node={0}" -f $script:NodeExe)
    Write-Log ("tools git={0}" -f $script:GitExe)
}

function Invoke-GitLogged {
    param([Parameter(Mandatory)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & $script:GitExe @GitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    foreach ($line in @($out)) {
        Write-Log ("  git: {0}" -f $line)
    }
    if ($null -eq $code) { return 0 }
    return [int]$code
}

function Get-StagedPaths {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $lines = & $script:GitExe diff --cached --name-only 2>$null
    $ErrorActionPreference = $prev
    return @($lines | Where-Object { $_ -and $_.Trim() })
}

function Test-PublishPreflight {
    Initialize-Tools
    Set-Location $KitRoot

    if (-not (Test-Path $Rebuild)) { throw "missing $Rebuild" }

    Write-Log 'selftest: node -v'
    & $script:NodeExe -v 2>&1 | ForEach-Object { Write-Log "  $_" }

    Write-Log 'selftest: git status'
    $null = Invoke-GitLogged @('status', '-sb')

    Write-Log 'selftest: remote HEAD'
    $code = Invoke-GitLogged @('ls-remote', '--heads', 'origin', 'main')
    if ($code -ne 0) { throw "cannot reach origin (exit=$code) - check credentials / network" }

    Write-Log 'selftest: rebuild dry'
    & $script:NodeExe $Rebuild 2>&1 | ForEach-Object { Write-Log "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "rebuild failed exit=$LASTEXITCODE" }

    Write-Log 'selftest ok'
}

Set-Location $KitRoot
Write-Log '==== git-publish start ===='

if (-not $env:GIT_AUTHOR_NAME) {
    $env:GIT_AUTHOR_NAME = 'chiraleo2000'
    $env:GIT_AUTHOR_EMAIL = 'chirapathleo.saelim@gmail.com'
    $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
    $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL
}

try {
    if ($SelfTest) {
        Test-PublishPreflight
        Write-Log '==== git-publish selftest end ok ===='
        exit 0
    }

    Initialize-Tools

    if (Test-Path $Rebuild) {
        Write-Log 'rebuild-pages-feed.js'
        & $script:NodeExe $Rebuild 2>&1 | ForEach-Object { Write-Log "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Log "rebuild failed exit=$LASTEXITCODE"
            Write-Log '==== git-publish end FAIL ===='
            exit $LASTEXITCODE
        }
    }

    $null = Invoke-GitLogged @(
        'add', '-A', '--',
        'github-pages/',
        'Document/',
        'prompts/',
        'ops/',
        'police-crime-news-pipeline.md',
        '.github/',
        '.gitignore',
        'docs/',
        'server/.env.example',
        'server/src/',
        'server/package.json'
    )

    $null = Invoke-GitLogged @(
        'reset', 'HEAD', '--',
        'server/.env',
        'server/.env.local',
        'server/data/',
        'server/exports/',
        'server/dist/',
        'server/node_modules/',
        'logs/',
        '_to_delete/',
        'ops/run/',
        'ops/__pycache__/'
    )

    $staged = Get-StagedPaths
    if ($staged.Count -eq 0) {
        Write-Log 'no staged changes - skip commit/push'
        Write-Log '==== git-publish end ok (noop) ===='
        exit 0
    }

    Write-Log ("staged ({0}):`n  {1}" -f $staged.Count, ($staged -join "`n  "))

    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $msg = @"
Scheduled publish of news intel kit outputs ($stamp Asia/Bangkok).

Sync github-pages feed/downloads and Document reports for GitHub Pages.
"@
    $commitCode = Invoke-GitLogged @('commit', '-m', $msg)
    if ($commitCode -ne 0) {
        Write-Log "commit failed exit=$commitCode"
        Write-Log '==== git-publish end FAIL ===='
        exit $commitCode
    }

    $pushCode = Invoke-GitLogged @('push', 'origin', 'HEAD')
    if ($pushCode -ne 0) {
        Write-Log "push failed exit=$pushCode - retry once in 15s"
        Start-Sleep -Seconds 15
        $pushCode = Invoke-GitLogged @('push', 'origin', 'HEAD')
    }
    if ($pushCode -ne 0) {
        Write-Log "push failed exit=$pushCode after retry"
        Write-Log '==== git-publish end FAIL ===='
        exit $pushCode
    }

    Write-Log 'push ok'
    Write-Log '==== git-publish end ok ===='
    exit 0
}
catch {
    Write-Log ("ERROR: {0}" -f $_.Exception.Message)
    Write-Log '==== git-publish end FAIL ===='
    exit 1
}
