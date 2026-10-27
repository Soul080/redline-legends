@echo off
cd /d "%~dp0"
set PORT=8080
echo Redline Legends
echo Leave this window open while you play.
where py >nul 2>&1 && goto :py
where python >nul 2>&1 && goto :python
echo Python 3 was not found. Install it from https://www.python.org/ and run this file again.
pause
goto :eof
:py
py -3 serve.py --open --port %PORT%
goto :eof
:python
python serve.py --open --port %PORT%
goto :eof
