# Register Windows Scheduled Tasks:
#   NewsIntel-GitPublish-Morning — daily 10:00
#   NewsIntel-GitPublish-Afternoon — daily 14:00
# Both run ops/git-publish-pages.ps1 (rebuild feed + commit + push).
#
# Re-run after moving the repo.
# Requires: git credentials that work non-interactively for this user.

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
        -RestartCount 2 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 20))
}

function Register-PublishAt {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][datetime]$At
    )
    $arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PublishScript
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument $arg -WorkingDirectory $KitRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $At
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Name -Action $action `
        -Trigger $trigger -Settings (Get-CommonSettings) -Principal $principal -Force | Out-Null
    Write-Output ("registered {0} daily at {1:HH:mm}" -f $Name, $At)
}

# Local machine clock — set Windows TZ to SE Asia Standard Time for Bangkok
Register-PublishAt -Name 'NewsIntel-GitPublish-Morning' -At ([datetime]'10:00')
Register-PublishAt -Name 'NewsIntel-GitPublish-Afternoon' -At ([datetime]'14:00')

Write-Output ''
Write-Output 'Tasks:'
Get-ScheduledTask -TaskName 'NewsIntel-GitPublish-*' |
    ForEach-Object {
        $info = $_ | Get-ScheduledTaskInfo
        '{0}  next={1}  last={2}  result={3}' -f $_.TaskName, $info.NextRunTime, $info.LastRunTime, $info.LastTaskResult
    }
Write-Output ''
Write-Output 'Manual test: powershell -NoProfile -ExecutionPolicy Bypass -File ops\git-publish-pages.ps1'
Write-Output 'Log: logs\git-publish.log'
