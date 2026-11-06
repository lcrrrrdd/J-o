#!/usr/bin/env python3
"""
Servidor local do Whisper (open-source, github.com/openai/whisper).

Usa o código-fonte que está em  whisper-src/whisper  (nada de API na nuvem).
Escuta SOMENTE em 127.0.0.1 e é iniciado/encerrado pelo app (main.js).

  GET  /status                         -> {"estado","modelo","dispositivo","erro"}
  POST /carregar?modelo=base           -> carrega (baixa na 1a vez) o modelo
  POST /transcrever?lingua=pt&modelo=base   (corpo = arquivo WAV PCM 16 bits mono)
                                       -> {"texto": "..."}
"""
import argparse
import io
import json
import os
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "whisper-src"))  # usa o código-fonte do GitHub incluído no projeto

import numpy as np  # noqa: E402

TAXA_WHISPER = 16000
MODELOS = ["tiny", "base", "small", "medium", "large-v3", "large-v3-turbo"]

estado = {"estado": "parado", "modelo": "", "dispositivo": "", "erro": ""}
trava = threading.Lock()
whisper = None
modelo_obj = None
pasta_modelos = None


def importar_whisper():
    global whisper
    if whisper is None:
        import whisper as w  # código-fonte local: whisper-src/whisper
        whisper = w
    return whisper


def dispositivo():
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def carregar(nome):
    """Carrega o modelo (precisa estar com a trava)."""
    global modelo_obj
    if nome not in MODELOS:
        raise ValueError("modelo inválido: " + nome)
    if modelo_obj is not None and estado["modelo"] == nome:
        return
    estado.update(estado="carregando", modelo=nome, erro="")
    try:
        w = importar_whisper()
        dev = dispositivo()
        modelo_obj = None
        modelo_obj = w.load_model(nome, device=dev, download_root=pasta_modelos)
        estado.update(estado="pronto", dispositivo=dev, erro="")
    except Exception as e:  # noqa: BLE001
        modelo_obj = None
        estado.update(estado="erro", erro=str(e))
        raise


def ler_wav(dados):
    with wave.open(io.BytesIO(dados), "rb") as w:
        canais, largura, taxa, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        bruto = w.readframes(n)
    if largura != 2:
        raise ValueError("WAV precisa ser PCM de 16 bits")
    x = np.frombuffer(bruto, dtype="<i2").astype(np.float32) / 32768.0
    if canais > 1:
        x = x.reshape(-1, canais).mean(axis=1)
    if taxa != TAXA_WHISPER and len(x) > 1:
        novo = int(round(len(x) * TAXA_WHISPER / taxa))
        x = np.interp(np.linspace(0, len(x) - 1, novo), np.arange(len(x)), x).astype(np.float32)
    return x


def transcrever(dados, lingua, nome):
    audio = ler_wav(dados)
    with trava:
        carregar(nome)
        # preenche até 1 s: trechos muito curtos deixam o Whisper instável
        if len(audio) < TAXA_WHISPER:
            audio = np.concatenate([audio, np.zeros(TAXA_WHISPER - len(audio), dtype=np.float32)])
        r = modelo_obj.transcribe(
            audio,
            language=lingua or None,
            temperature=0.0,
            fp16=(estado["dispositivo"] == "cuda"),
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            verbose=None,
        )
    return (r.get("text") or "").strip()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # silencioso
        pass

    def responder(self, codigo, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if urlparse(self.path).path == "/status":
            return self.responder(200, dict(estado))
        self.responder(404, {"erro": "não encontrado"})

    def do_POST(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        n = int(self.headers.get("Content-Length") or 0)
        dados = self.rfile.read(n) if n else b""
        try:
            if u.path == "/carregar":
                with trava:
                    carregar(q.get("modelo", "base"))
                return self.responder(200, dict(estado))
            if u.path == "/transcrever":
                texto = transcrever(dados, q.get("lingua", ""), q.get("modelo", "base"))
                return self.responder(200, {"texto": texto})
            self.responder(404, {"erro": "não encontrado"})
        except Exception as e:  # noqa: BLE001
            self.responder(500, {"erro": str(e)})


def main():
    global pasta_modelos
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, required=True)
    ap.add_argument("--modelos", default=os.path.join(AQUI, "modelos"), help="pasta onde os modelos são guardados")
    a = ap.parse_args()
    pasta_modelos = a.modelos
    os.makedirs(pasta_modelos, exist_ok=True)

    try:
        importar_whisper()
        estado.update(estado="ocioso", dispositivo=dispositivo())
    except Exception as e:  # noqa: BLE001
        estado.update(estado="erro", erro="Dependências do Whisper faltando: " + str(e))

    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), Handler)
    print("PRONTO", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
