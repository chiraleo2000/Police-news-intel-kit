@echo off
setlocal EnableExtensions
rem =====================================================================
rem news-intel : Windows setup  (single file, no PowerShell, no pause)
rem - Creates folders, sets NEWSINTEL_HOME, builds the server if present,
rem   and registers ALL scheduled tasks in this same script.
rem - Run as Administrator. Safe to re-run.
rem - Usage:  setup-windows.bat [install_dir]     default C:\news-intel
rem - Claude scheduled tasks are NOT created here; they are created in the
rem   Claude app from the files in the prompts folder.
rem =====================================================================

set "NI_HOME=C:\news-intel"
if not "%~1"=="" set "NI_HOME=%~1"

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run this script as Administrator.
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE (
  echo [ERROR] Node.js not found in PATH. Install Node.js LTS first.
  exit /b 1
)
echo [OK] node: %NODE_EXE%

for /f "delims=" %%Z in ('tzutil /g') do set "NI_TZ=%%Z"
if /i not "%NI_TZ%"=="SE Asia Standard Time" echo [WARN] Windows time zone is "%NI_TZ%". Schedules below assume SE Asia Standard Time.

for %%D in (server data vault logs backup exports) do if not exist "%NI_HOME%\%%D" mkdir "%NI_HOME%\%%D"
echo [OK] folders ready under %NI_HOME%

setx /M NEWSINTEL_HOME "%NI_HOME%" >nul
echo [OK] NEWSINTEL_HOME set. Restart Claude Desktop and Obsidian so they see it.

if not exist "%NI_HOME%\server\.env" echo [WARN] %NI_HOME%\server\.env is missing. Create it first, see docs\01-install-windows.md step 4.

if exist "%NI_HOME%\server\package.json" (
  pushd "%NI_HOME%\server"
  call npm ci
  if errorlevel 1 (
    echo [ERROR] npm ci failed.
    popd
    exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    echo [ERROR] npm run build failed.
    popd
    exit /b 1
  )
  popd
  echo [OK] server built
) else (
  echo [WARN] %NI_HOME%\server\package.json not found. Copy the server code there, then re-run this script.
)

rem Keep the machine awake while on AC power, needed by Claude Desktop scheduled tasks
powercfg /change standby-timeout-ac 0 >nul
powercfg /change hibernate-timeout-ac 0 >nul
echo [OK] sleep and hibernate disabled on AC power

rem ---- server process: starts at boot ----
schtasks /Create /TN "NewsIntel-Server" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "cmd /c cd /d \"%NI_HOME%\server\" && \"%NODE_EXE%\" dist\index.js >> \"%NI_HOME%\logs\server.log\" 2>&1" /F >nul
if errorlevel 1 (echo [ERROR] failed to register NewsIntel-Server) else (echo [OK] NewsIntel-Server at startup)

rem ---- daily server jobs  name / time / script in dist\jobs ----
call :reg NewsIntel-ExportLinks 05:00 export-links
call :reg NewsIntel-VaultBuild 07:45 vault-build
call :reg NewsIntel-Healthcheck 08:15 healthcheck
call :reg NewsIntel-Backup 23:30 backup

if exist "%NI_HOME%\server\dist\index.js" (
  schtasks /Run /TN "NewsIntel-Server" >nul
  echo [OK] server started
)

echo.
echo Done. Check with:  schtasks /Query /TN "NewsIntel-Server"
exit /b 0

:reg
schtasks /Create /TN "%~1" /SC DAILY /ST %~2 /RU SYSTEM /RL HIGHEST /TR "cmd /c cd /d \"%NI_HOME%\server\" && \"%NODE_EXE%\" dist\jobs\%~3.js >> \"%NI_HOME%\logs\%~3.log\" 2>&1" /F >nul
if errorlevel 1 (echo [ERROR] failed to register %~1) else (echo [OK] %~1 daily at %~2)
exit /b 0
