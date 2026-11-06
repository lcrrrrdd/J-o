# Ondas + Tradutor ESP32 — v1.3.0

Mudanças desta versão:
- **Whisper open-source local**: a transcrição de voz não usa mais API (Groq, OpenAI, Deepgram). O app roda o
  código-fonte do GitHub [openai/whisper](https://github.com/openai/whisper) (pasta `whisper-src/`, licença MIT,
  commit 8609812, de 31/08/2026) em Python, no seu próprio PC. Sem chave de API e sem enviar áudio para a internet.
- **IA agora usa o OpenCode** (opencode.ai) no lugar do Ollama. O app inicia o `opencode serve` sozinho (só em 127.0.0.1,
  com senha aleatória, numa pasta vazia e com todas as ferramentas de código desligadas: a IA só conversa).
  As instruções da aba *Instruções* são enviadas como prompt de sistema em cada pergunta.
- **Função de celular removida** (servidor HTTPS, `celular.html`, pasta `cert/` com a chave privada e a opção "Celular Android").

## Como usar
1. Instale o **Python 3.9+** (marque "Add python.exe to PATH") e o **Node.js**.
2. Rode `INSTALAR-WHISPER.bat` (uma vez): cria a pasta `venv` e instala PyTorch e as dependências do Whisper.
3. Rode `TESTAR.bat` (abre o app) ou `GERAR-EXE.bat` (gera o .exe em `dist/`; depois rode o `INSTALAR-WHISPER.bat` que foi copiado para lá).
4. Aba **Voz e Som**: escolha a fonte (ESP32 ou PC) e o **Modelo Whisper**, clique em *Carregar / testar modelo*
   e use os botões 🎤 da aba Serial. O modelo é baixado sozinho na 1ª vez (tiny ≈ 75 MB … large-v3 ≈ 3 GB).

Dicas: `base`/`small` rodam bem em CPU; `large-v3-turbo` e `large-v3` pedem GPU NVIDIA (veja a dica no final do
`INSTALAR-WHISPER.bat`). Não precisa instalar o ffmpeg: o app entrega o áudio já decodificado ao Whisper.

## IA (OpenCode)
1. Rode `INSTALAR-OPENCODE.bat` (instala `opencode-ai` pelo npm e abre `opencode auth login` para escolher o provedor/modelo).
2. No app, aba **IA**, clique em *Testar conexão / listar modelos*; escolha um modelo no campo Modelo (vazio = padrão do OpenCode).
3. Na aba **Serial**, escreva a pergunta e clique em *🤖 Perguntar à IA* (ou use o botão 🎤🤖).

## Correções desta versão
- Erros da IA, de conexão e do código da aba *Programação do HTML* agora aparecem no log (antes eram engolidos em silêncio).
- Nomes/gatilhos com aspas ou `<` na tabela de gatilhos quebravam a tela (e permitiam injetar HTML via projeto .json): agora são escapados.
- Cabo USB desconectado agora fecha a conexão e atualiza o status.
- Bluetooth: comandos enviados em sequência não misturam mais os pedaços.

## Arquivos
- `main.js` / `preload.js` — Electron; inicia e conversa com o servidor do Whisper (só em 127.0.0.1).
- `whisper_server.py` — servidor local que usa `whisper-src/whisper`.
- `whisper-src/` — código-fonte do openai/whisper (+ LICENSE).
- `index.html` — interface (a aba Voz e Som agora escolhe o modelo Whisper).
- Projetos `.json` antigos continuam abrindo; campos de API/celular são ignorados.
