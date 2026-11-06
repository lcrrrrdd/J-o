@echo off
setlocal
set "BASE=%~dp0"
if exist "%BASE%resources\app\whisper_server.py" set "BASE=%BASE%resources\app\"
cd /d "%BASE%"
echo Pasta: %CD%
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python nao encontrado. Instale o Python 3.9 ou superior em https://www.python.org/downloads/
  echo ^(marque "Add python.exe to PATH"^) e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist venv (
  echo Criando ambiente Python ^(venv^)...
  python -m venv venv
)
echo Instalando as dependencias do Whisper ^(precisa de internet, pode demorar e baixar ~200 MB^)...
call venv\Scripts\python.exe -m pip install --upgrade pip
call venv\Scripts\python.exe -m pip install -r whisper-src\requirements.txt
if errorlevel 1 (
  echo.
  echo Falhou a instalacao. Veja a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Pronto! O Whisper (codigo-fonte em whisper-src) esta instalado.
echo Os modelos sao baixados sozinhos na primeira vez que voce usar o microfone.
echo.
echo Para usar a placa de video NVIDIA, troque o PyTorch pela versao CUDA, por exemplo:
echo   venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu121
pause
