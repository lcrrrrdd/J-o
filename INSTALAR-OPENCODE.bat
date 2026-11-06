@echo off
echo Instalando o OpenCode (open source, opencode.ai). Precisa do Node.js e de internet.
call npm install -g opencode-ai
if errorlevel 1 (
  echo Falhou a instalacao. Veja a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Agora escolha o provedor/modelo da IA (siga as telas):
call opencode auth login
echo.
echo Pronto! No app, aba IA, clique em "Testar conexao / listar modelos".
pause
