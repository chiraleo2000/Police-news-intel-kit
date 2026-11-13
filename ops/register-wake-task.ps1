# Registers:
#   PoliceNewsWakeTunnel — logon / startup / resume-from-sleep / daily (-Wake)
#   PoliceNewsLmsWatch   — every 5 minutes (-Watch): LMS + gateway/MCP + RAG ngrok
#                          + tunnel.json so hibernate/resume cannot leave Pages chat dead
#
# Resume trigger matches NewsIntel-LineWebhookWake (Power-Troubleshooter EventID=1).
# Kernel-Power 107 alone was unreliable / noisy across sleep vs hibernate.
$ErrorActionPreference = "Stop"

$OpsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$RepoRoot = Split-Path -Parent $OpsDir
$ConfigPath = Join-Path $OpsDir "tunnel.config.json"
$WakeScript = Join-Path $OpsDir "wake-tunnel.ps1"
$TaskName = "PoliceNewsWakeTunnel"
$WatchName = "PoliceNewsLmsWatch"

function Escape-XmlText {
    param([Parameter(Mandatory = $true)][string]$Text)
    return [System.Security.SecurityElement]::Escape($Text)
}

if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "missing $ConfigPath" }
if (-not (Test-Path -LiteralPath $WakeScript)) { throw "missing $WakeScript" }

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$dailyTime = [string]$config.dailyTime
if ($dailyTime -notmatch '^\d{2}:\d{2}$') { throw "dailyTime must be HH:mm" }
$hour = [int]$dailyTime.Substring(0, 2)
$minute = [int]$dailyTime.Substring(3, 2)
if ($hour -gt 23 -or $minute -gt 59) { throw "dailyTime is out of range" }

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$WakeScript`" -Wake"
$watchArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$WakeScript`" -Watch"
$startBoundary = (Get-Date).ToString("yyyy-MM-dd") + "T$dailyTime`:00"

# Same resume signal LINE wake uses (hibernate + modern standby).
$resumeQuery = @'
<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and (EventID=1)]]</Select>
  </Query>
</QueryList>
'@

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start this kit's RAG (MCP, gateway :8790, LM Studio google/gemma-4-e2b, dedicated ngrok) on logon, startup, and resume-from-sleep/hibernate. Never stop other ngrok or touch LINE :18080 / tor.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT60S</Delay>
    </BootTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$(Escape-XmlText $userId)</UserId>
      <Delay>PT30S</Delay>
    </LogonTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$(Escape-XmlText $resumeQuery)</Subscription>
      <Delay>PT90S</Delay>
    </EventTrigger>
    <CalendarTrigger>
      <StartBoundary>$(Escape-XmlText $startBoundary)</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(Escape-XmlText $userId)</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT25M</ExecutionTimeLimit>
    <Priority>4</Priority>
    <RestartOnFailure>
      <Count>5</Count>
      <Interval>PT1M</Interval>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(Escape-XmlText $powershell)</Command>
      <Arguments>$(Escape-XmlText $arguments)</Arguments>
      <WorkingDirectory>$(Escape-XmlText $RepoRoot)</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

try {
    Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force | Out-Null
    Write-Host "Registered scheduled task $TaskName for $userId (boot+logon+resume+daily $dailyTime, WakeToRun=true)"
} catch {
    Write-Host "BootTrigger denied ($($_.Exception.Message)); registering without boot trigger"
    $xmlNoBoot = $xml -replace '(?s)\s*<BootTrigger>.*?</BootTrigger>\s*', "`n    "
    Register-ScheduledTask -TaskName $TaskName -Xml $xmlNoBoot -Force | Out-Null
    Write-Host "Registered scheduled task $TaskName for $userId (logon+resume+daily $dailyTime, WakeToRun=true)"
}

# Watchdog: every 5 minutes restore LMS + RAG tunnel (not Gemma-only).
$watchAction = New-ScheduledTaskAction -Execute $powershell -Argument $watchArgs -WorkingDirectory $RepoRoot
$watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$watchSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$watchPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $WatchName -Action $watchAction `
    -Trigger $watchTrigger -Settings $watchSettings -Principal $watchPrincipal -Force | Out-Null
Write-Host "Registered scheduled task $WatchName (every 5 min, -Watch: LMS+gateway+RAG ngrok+tunnel.json)"

Write-Host ""
Write-Host "Manual full wake:  powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -Wake"
Write-Host "Manual watch:      powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -Watch"
Write-Host "Manual LMS only:   powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -LmsOnly"
Write-Host "Log: logs\wake-tunnel.log"
