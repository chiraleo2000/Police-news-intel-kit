# Register:
#   NewsIntel-LineWebhook     — every 1 minute (repair tunnel + sync LINE URL)
#   NewsIntel-LineWebhookWake — at logon and after sleep/hibernate (-Wake)
#   NewsIntel-LineExcel       — rewrite continuous Excel every 5 minutes
#
# After hibernate, ngrok-free issues a NEW public URL. The Wake task forces a
# fresh tunnel and PUTs https://<new-host>/line/webhook to LINE automatically.
# Re-run this script after moving the repo.

$ErrorActionPreference = 'Stop'
$WatchScript = Join-Path $PSScriptRoot 'ensure-line-webhook.ps1'
$ExportScript = Join-Path $PSScriptRoot 'export-line-continuous.ps1'
$KitRoot = Split-Path -Parent $PSScriptRoot
$account = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $WatchScript)) { throw "Missing $WatchScript" }
if (-not (Test-Path $ExportScript)) { throw "Missing $ExportScript" }

function New-ResumeTrigger {
    $eventClass = Get-CimClass -Namespace root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger
    $resume = New-CimInstance -CimClass $eventClass -ClientOnly
    $resume.Enabled = $true
    $resume.Subscription = @'
<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[(Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1) or (Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=107)]]</Select>
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

$repeat1m = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$repeat5m = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $account
$resume = New-ResumeTrigger

Register-NewsIntelTask -Name 'NewsIntel-LineWebhook' -ScriptPath $WatchScript -Triggers @($repeat1m)
Register-NewsIntelTask -Name 'NewsIntel-LineWebhookWake' -ScriptPath $WatchScript `
    -ExtraArgs '-Wake' -Triggers @($logon, $resume)
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
Write-Output 'ngrok-free URL changes after hibernate are handled automatically:'
Write-Output '  Wake/logon -> recycle tunnel -> update PUBLIC_BASE_URL -> PUT LINE webhook'
Write-Output '  Every 1 min -> repair if public URL dies or LINE endpoint drifts'
Write-Output 'Optional stable host: set NGROK_DOMAIN=your-name.ngrok-free.app in server\.env'
