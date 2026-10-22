# Publish local news/Pages data to GitHub (commit + push).
# Safe: never force-push, never commit .env / secrets / sqlite / _to_delete.
# Intended schedule: 10:00 and 14:00 Asia/Bangkok via register-git-publish-task.ps1

$ErrorActionPreference = 'Stop'
$KitRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $KitRoot 'logs'
$LogFile = Join-Path $LogDir 'git-publish.log'
$Rebuild = Join-Path $PSScriptRoot 'rebuild-pages-feed.js'

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Output $line
}

Set-Location $KitRoot

# Identity for scheduled runs (does not touch git config permanently)
if (-not $env:GIT_AUTHOR_NAME) {
    $env:GIT_AUTHOR_NAME = 'chiraleo2000'
    $env:GIT_AUTHOR_EMAIL = 'chirapathleo.saelim@gmail.com'
    $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
    $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL
}

try {
    if (Test-Path $Rebuild) {
        Write-Log 'rebuild-pages-feed.js'
        & node $Rebuild 2>&1 | ForEach-Object { Write-Log "  $_" }
    }

    git add -A -- `
        'github-pages/' `
        'Document/' `
        'prompts/' `
        'ops/' `
        'police-crime-news-pipeline.md' `
        '.github/' `
        '.gitignore' `
        'docs/' `
        'server/.env.example' `
        'server/src/' `
        'server/package.json' 2>&1 | Out-Null

    # Never stage secrets / runtime
    git reset HEAD -- `
        'server/.env' `
        'server/data/' `
        'server/exports/' `
        'server/node_modules/' `
        'logs/' `
        '_to_delete/' 2>$null | Out-Null

    $status = git status --porcelain
    if (-not $status) {
        Write-Log 'no changes — skip commit/push'
        exit 0
    }

    Write-Log ("staging:`n{0}" -f ($status -join "`n"))

    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $msg = @"
Scheduled publish of news intel kit outputs ($stamp Asia/Bangkok).

Sync github-pages feed/downloads and Document reports for GitHub Pages.
"@
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) {
        Write-Log "commit failed exit=$LASTEXITCODE"
        exit $LASTEXITCODE
    }

    git push origin HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Log "push failed exit=$LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Write-Log 'push ok'
    exit 0
}
catch {
    Write-Log ("ERROR: {0}" -f $_.Exception.Message)
    exit 1
}
