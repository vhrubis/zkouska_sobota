@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Spoustim dashboard FVE-UK...
start "" http://localhost:8080/web/
node server.js
pause
