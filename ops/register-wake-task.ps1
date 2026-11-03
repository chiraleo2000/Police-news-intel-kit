# Registers the current user's PoliceNewsWakeTunnel task from ops/tunnel.config.json.
$ErrorActionPreference = "Stop"

$OpsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$RepoRoot = Split-Path -Parent $OpsDir
$ConfigPath = Join-Path $OpsDir "tunnel.config.json"
$WakeScript = Join-Path $OpsDir "wake-tunnel.ps1"
$TaskName = "PoliceNewsWakeTunnel"

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
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$WakeScript`""
$startBoundary = (Get-Date).ToString("yyyy-MM-dd") + "T$dailyTime`:00"
$query = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name=''Microsoft-Windows-Kernel-Power''] and (EventID=107 or EventID=507)]]</Select></Query></QueryList>'

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start this kit's RAG only (MCP, gateway :8790, LM Studio, dedicated ngrok). Never stop other ngrok or touch LINE :18080 / tor. Then publish github-pages/data/tunnel.json for Pages chat.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$(Escape-XmlText $userId)</UserId>
      <Delay>PT15S</Delay>
    </LogonTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$(Escape-XmlText $query)</Subscription>
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
    <MultipleInstancesPolicy>Queue</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Count>3</Count>
      <Interval>PT5M</Interval>
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

Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force | Out-Null
Write-Host "Registered scheduled task $TaskName for $userId"
