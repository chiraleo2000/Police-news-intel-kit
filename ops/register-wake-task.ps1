# Registers:
#   PoliceNewsWakeTunnel — boot / logon / resume-from-sleep / daily (-Wake)
#   PoliceNewsLmsWatch   — every 2 minutes + logon/resume (-Watch)
#                          LMS + gateway/MCP + RAG ngrok + tunnel.json publish
#
# Aligned with NewsIntel-LineWebhook* (Power-Troubleshooter EventID=1).
# Stagger: LINE wake ~45s, RAG wake ~120s, RAG watch resume ~150s — avoids
# three ngrok agents racing the free-session limit right after hibernate.
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
    <Description>RAG wake: MCP + gateway :8790 + LM Studio google/gemma-4-e2b + dedicated ngrok. Runs after LINE wake (staggered). Never touches :18080 / tor.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT2M</Delay>
    </BootTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$(Escape-XmlText $userId)</UserId>
      <Delay>PT90S</Delay>
    </LogonTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$(Escape-XmlText $resumeQuery)</Subscription>
      <Delay>PT2M</Delay>
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
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
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
    Write-Host "Registered $TaskName (boot+logon+resume+daily $dailyTime)"
} catch {
    Write-Host "BootTrigger denied ($($_.Exception.Message)); registering without boot trigger"
    $xmlNoBoot = $xml -replace '(?s)\s*<BootTrigger>.*?</BootTrigger>\s*', "`n    "
    Register-ScheduledTask -TaskName $TaskName -Xml $xmlNoBoot -Force | Out-Null
    Write-Host "Registered $TaskName (logon+resume+daily $dailyTime)"
}

# Watchdog every 2 minutes (same cadence as LINE webhook repair) + resume/logon backup.
$watchXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>RAG watchdog every 2 min + resume/logon: keep LMS, gateway, MCP, RAG ngrok, and Pages tunnel.json in sync.</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <Enabled>true</Enabled>
      <StartBoundary>$(Escape-XmlText ((Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')))</StartBoundary>
      <Repetition>
        <Interval>PT2M</Interval>
        <Duration>P9999D</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$(Escape-XmlText $userId)</UserId>
      <Delay>PT3M</Delay>
    </LogonTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$(Escape-XmlText $resumeQuery)</Subscription>
      <Delay>PT2M30S</Delay>
    </EventTrigger>
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
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <Priority>5</Priority>
    <RestartOnFailure>
      <Count>5</Count>
      <Interval>PT1M</Interval>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(Escape-XmlText $powershell)</Command>
      <Arguments>$(Escape-XmlText $watchArgs)</Arguments>
      <WorkingDirectory>$(Escape-XmlText $RepoRoot)</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

Register-ScheduledTask -TaskName $WatchName -Xml $watchXml -Force | Out-Null
Write-Host "Registered $WatchName (every 2 min + logon/resume, -Watch)"

Write-Host ""
Write-Host "Manual full wake:  powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -Wake"
Write-Host "Manual watch:      powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -Watch"
Write-Host "Manual LMS only:   powershell -NoProfile -ExecutionPolicy Bypass -File ops\wake-tunnel.ps1 -LmsOnly"
Write-Host "Log: logs\wake-tunnel.log"
Write-Host "Stagger after hibernate: LINE ~45s -> RAG Wake ~120s -> RAG Watch ~150s"
