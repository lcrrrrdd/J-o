@echo off
cd /d "%~dp0"
if not exist venv\Scripts\python.exe echo Dica: rode INSTALAR-WHISPER.bat antes, para o microfone usar o Whisper local.
call npm install
call npx electron .
pause
