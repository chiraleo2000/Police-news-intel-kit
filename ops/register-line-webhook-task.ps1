# Register long-running LINE webhook keep-alive for ngrok Free:
#   NewsIntel-LineWebhook     — every 2 minutes (repair only if edge/hub dead)
#   NewsIntel-LineWebhookWake — at startup, logon, and resume-from-sleep (-Wake)
#   NewsIntel-LineExcel       — continuous Excel/JSON via hub HTTP every 5 minutes
#
# Free-plan URL policy (implemented in ensure-line-webhook.ps1):
#   keep healthy tunnel; recycle only when public /health is dead;
#   after hibernate/shutdown always re-sync LINE to the live URL.
# Re-run this script after moving the repo.

$ErrorActionPreference = 'Stop'
$WatchScript = Join-Path $PSScriptRoot 'ensure-line-webhook.ps1'
$ExportScript = Join-Path $PSScriptRoot 'export-line-continuous.ps1'
$KitRoot = Split-Path -Parent $PSScriptRoot
$account = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $WatchScript)) { throw "Missing $WatchScript" }
if (-not (Test-Path $ExportScript)) { throw "Missing $ExportScript" }

function New-ResumeTrigger {
    # Only resume-from-sleep. Kernel-Power 107 is too noisy and caused Wake thrash.
    $eventClass = Get-CimClass -Namespace root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger
    $resume = New-CimInstance -CimClass $eventClass -ClientOnly
    $resume.Enabled = $true
    $resume.Subscription = @'
<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and (EventID=1)]]</Select>
  </Query>
</QueryList>
'@
    return $resume
}

function Get-CommonSettings {
    return (New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -WakeToRun `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 8))
}

function Register-NewsIntelTask {
    param(
        [string]$Name,
        [string]$ScriptPath,
        [string]$ExtraArgs = '',
        [object[]]$Triggers
    )
    $arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $ScriptPath
    if ($ExtraArgs) { $arg = "$arg $ExtraArgs" }
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument $arg -WorkingDirectory $KitRoot
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Name -Action $action `
        -Trigger $Triggers -Settings (Get-CommonSettings) -Principal $principal -Force | Out-Null
    Write-Output "registered $Name"
}

# 2 minutes is enough to detect dead Free edges without hammering ngrok/LINE APIs.
$repeat2m = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 2) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$repeat5m = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $account
$resume = New-ResumeTrigger
# AtStartup often needs elevation; try it, fall back to logon+resume.
$startup = New-ScheduledTaskTrigger -AtStartup

Register-NewsIntelTask -Name 'NewsIntel-LineWebhook' -ScriptPath $WatchScript -Triggers @($repeat2m)

$wakeTriggers = @($startup, $logon, $resume)
try {
    Register-NewsIntelTask -Name 'NewsIntel-LineWebhookWake' -ScriptPath $WatchScript `
        -ExtraArgs '-Wake' -Triggers $wakeTriggers
} catch {
    Write-Output "AtStartup denied - registering Wake with logon+resume only"
    Register-NewsIntelTask -Name 'NewsIntel-LineWebhookWake' -ScriptPath $WatchScript `
        -ExtraArgs '-Wake' -Triggers @($logon, $resume)
}

Register-NewsIntelTask -Name 'NewsIntel-LineExcel' -ScriptPath $ExportScript -Triggers @($repeat5m, $logon, $resume)

foreach ($cmd in @(
    'powercfg /change standby-timeout-ac 0',
    'powercfg /change hibernate-timeout-ac 0'
)) {
    cmd /c $cmd | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Output "ok $cmd" }
    else { Write-Output "skipped $cmd (needs elevated PowerShell)" }
}

Write-Output ''
Write-Output 'ngrok Free keep-alive:'
Write-Output '  keep URL while public /health is ok'
Write-Output '  recycle only when edge dies (hibernate/shutdown) then PUT LINE webhook'
Write-Output '  startup + logon + resume -> -Wake (sync LINE; recycle only if dead)'
Write-Output '  every 2 min -> repair if hub/tunnel/LINE drift'
Write-Output 'Optional stable host: set NGROK_DOMAIN=your-name.ngrok-free.app in server\.env'
