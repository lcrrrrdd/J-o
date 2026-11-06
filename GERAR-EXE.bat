@echo off
cd /d "%~dp0"
echo Instalando (so na primeira vez, precisa de internet)...
call npm install
echo Gerando o .exe...
call npx @electron/packager . OndasESP32 --platform=win32 --arch=x64 --out=dist --overwrite --ignore="^/(dist|venv|modelos)"
copy /y INSTALAR-WHISPER.bat "dist\OndasESP32-win32-x64\" >nul
echo.
echo Pronto! Abra a pasta dist\OndasESP32-win32-x64
echo   1) Rode INSTALAR-WHISPER.bat (uma vez) para instalar o Whisper local
echo   2) Execute OndasESP32.exe
pause
