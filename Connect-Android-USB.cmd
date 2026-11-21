@echo off
cd /d "%~dp0"
node scripts\connect-android-usb.cjs
echo.
pause
