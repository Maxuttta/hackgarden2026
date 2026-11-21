@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Downloading Electron. Internet access to GitHub is required.
  call node node_modules\electron\install.js
  if errorlevel 1 (
    echo Electron download failed.
    pause
    exit /b 1
  )
)
wscript.exe "%~dp0Start-Cyber-Garden.vbs"
