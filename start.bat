@echo off
cd /d "%~dp0"
set PORT=8080
echo Redline Legends at http://127.0.0.1:%PORT%/
start "" http://127.0.0.1:%PORT%/
python -m http.server %PORT%
if errorlevel 1 py -m http.server %PORT%
