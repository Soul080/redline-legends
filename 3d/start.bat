@echo off
cd /d "%~dp0"
set PORT=8080
echo Redline Legends 3D
echo Leave this window open while you play.
where py >nul 2>&1 && goto :py
where python >nul 2>&1 && goto :python
echo Python 3 was not found. Install it from https://www.python.org/ and run this file again.
echo You can also open index.html directly. The game is a single script and does not need a CDN.
pause
goto :eof
:py
py -3 serve.py --open --port %PORT%
goto :eof
:python
python serve.py --open --port %PORT%
goto :eof
