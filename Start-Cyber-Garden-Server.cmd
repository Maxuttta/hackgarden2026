@echo off
setlocal
title Cyber Garden Server
set "server_exit=1"
set "server_dir=%~dp0server"
if not exist "%server_dir%\index.cjs" set "server_dir=%USERPROFILE%\Desktop\cybergarden\hackgarden2026-main\server"
if not exist "%server_dir%\index.cjs" (
    echo Cyber Garden server folder was not found.
    echo Run this file from the Cyber Garden project folder, next to the server folder.
    goto finish
)
pushd "%server_dir%" || (
    echo Could not open the server folder.
    goto finish
)
echo Cyber Garden server folder: "%CD%"
call node --version
if errorlevel 1 (
    echo Node.js is unavailable. This server requires Node.js 22 or later.
    popd
    goto finish
)
if not exist "node_modules\pdfkit\package.json" (
    echo Server dependencies are missing. Run npm.cmd ci in the server folder.
    popd
    goto finish
)
echo Starting Cyber Garden server. Press Ctrl+C to stop.
call node --env-file-if-exists=.env index.cjs
set "server_exit=%errorlevel%"
popd
echo Cyber Garden server stopped with exit code %server_exit%.

:finish
pause
exit /b %server_exit%
