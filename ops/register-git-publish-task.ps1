# Register Windows Scheduled Tasks:
#   NewsIntel-GitPublish-Morning - daily 10:00
#   NewsIntel-GitPublish-Afternoon - daily 14:00
# Both run ops/git-publish-pages.ps1 (rebuild feed + commit + push).
#
# Re-run after moving the repo.
# Requires: git credentials that work non-interactively for this user
# (Git Credential Manager / signed-in session).

$ErrorActionPreference = 'Stop'
$PublishScript = Join-Path $PSScriptRoot 'git-publish-pages.ps1'
$KitRoot = Split-Path -Parent $PSScriptRoot
$account = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $PublishScript)) { throw "Missing $PublishScript" }

function Get-CommonSettings {
    return (New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -WakeToRun `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 25))
}

function Register-PublishAt {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][datetime]$At
    )
    # -File ensures $PSScriptRoot works; working directory = kit root
    $arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PublishScript
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument $arg -WorkingDirectory $KitRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $At
    # Interactive: uses this user's Git Credential Manager (needed for HTTPS push)
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Name -Action $action `
        -Trigger $trigger -Settings (Get-CommonSettings) -Principal $principal -Force | Out-Null
    Write-Output ("registered {0} daily at {1:HH:mm}" -f $Name, $At)
}

Register-PublishAt -Name 'NewsIntel-GitPublish-Morning' -At ([datetime]'10:00')
Register-PublishAt -Name 'NewsIntel-GitPublish-Afternoon' -At ([datetime]'14:00')

Write-Output ''
Write-Output 'Running self-test (node/git/origin/rebuild)...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PublishScript -SelfTest
if ($LASTEXITCODE -ne 0) {
    Write-Output "SELFTEST FAILED exit=$LASTEXITCODE - fix before relying on the schedule"
    exit $LASTEXITCODE
}

Write-Output ''
Write-Output 'Tasks:'
Get-ScheduledTask -TaskName 'NewsIntel-GitPublish-*' |
    ForEach-Object {
        $info = $_ | Get-ScheduledTaskInfo
        '{0}  state={1}  next={2}  last={3}  result={4}' -f `
            $_.TaskName, $_.State, $info.NextRunTime, $info.LastRunTime, $info.LastTaskResult
    }
Write-Output ''
Write-Output 'Manual publish: powershell -NoProfile -ExecutionPolicy Bypass -File ops\git-publish-pages.ps1'
Write-Output 'Self-test:     powershell -NoProfile -ExecutionPolicy Bypass -File ops\git-publish-pages.ps1 -SelfTest'
Write-Output 'Log: logs\git-publish.log'
Write-Output 'Note: PC should stay logged in (Interactive) so Git Credential Manager can push.'
