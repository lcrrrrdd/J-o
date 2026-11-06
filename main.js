const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs'), net = require('net'), http = require('http'), path = require('path'), crypto = require('crypto');

let w = null;
const portaLivre = () => new Promise((ok, no) => {
  const s = net.createServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});
const matar = p => {
  try {
    if (!p) return;
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {});
    else p.kill();
  } catch (_) {}
};
// Requisição HTTP simples a um servidor local (127.0.0.1)
function http_(porta, metodo, caminho, corpo, headers = {}, timeout = 0) {
  return new Promise((ok, no) => {
    const dados = corpo == null ? null : (Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo)));
    const r = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo,
      headers: { ...headers, ...(dados ? { 'Content-Length': dados.length } : {}) } }, res => {
      const b = [];
      res.on('data', d => b.push(d));
      res.on('end', () => {
        const t = Buffer.concat(b).toString('utf8');
        let j = null;
        try { j = t ? JSON.parse(t) : {}; } catch (_) {}
        if (res.statusCode >= 400) {
          const e = new Error((j && (j.erro || (j.data && j.data.message) || j.message)) || ('HTTP ' + res.statusCode + ' ' + t.slice(0, 200)));
          e.status = res.statusCode; no(e);
        } else ok(j == null ? t : j);
      });
    });
    if (timeout) r.setTimeout(timeout, () => r.destroy(new Error('tempo esgotado')));
    r.on('error', no);
    if (dados) r.write(dados);
    r.end();
  });
}
const msg = (canal, t) => { if (w && !w.isDestroyed()) w.webContents.send(canal, t); };

/* ================= Whisper open-source (github.com/openai/whisper), LOCAL, em Python ================= */
let py = null, wPorta = 0, wIniciando = null;
const procuraPython = () => {
  const c = [path.join(__dirname, 'venv', 'Scripts', 'python.exe'), path.join(__dirname, 'venv', 'bin', 'python')].filter(p => fs.existsSync(p));
  return c[0] || (process.platform === 'win32' ? 'python' : 'python3');
};
function iniciarWhisper() {
  if (py && wPorta) return Promise.resolve();
  if (wIniciando) return wIniciando;
  wIniciando = (async () => {
    wPorta = await portaLivre();
    const script = path.join(__dirname, 'whisper_server.py');
    const pasta = path.join(app.getPath('userData'), 'modelos-whisper');
    msg('whisper-msg', 'Iniciando o Whisper local…');
    try {
      await new Promise((ok, no) => {
        let log = '', pronto = false;
        const p = spawn(procuraPython(), ['-u', script, '--porta', String(wPorta), '--modelos', pasta],
          { cwd: __dirname, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        py = p;
        p.on('error', e => no(new Error('Python não encontrado. Rode INSTALAR-WHISPER.bat (precisa do Python 3.9+). ' + e.message)));
        p.stdout.on('data', d => { if (!pronto && String(d).includes('PRONTO')) { pronto = true; ok(); } });
        let ult = 0;
        p.stderr.on('data', d => {
          const t = String(d); log = (log + t).slice(-2000);
          const l = t.split(/[\r\n]+/).map(x => x.trim()).filter(Boolean).pop();
          if (l && Date.now() - ult > 300) { ult = Date.now(); msg('whisper-msg', l.slice(0, 160)); }   // progresso do download do modelo
        });
        p.on('exit', () => {
          if (py === p) { py = null; wPorta = 0; }
          if (!pronto) no(new Error('O servidor do Whisper não iniciou. ' + (log.trim().split('\n').pop() || 'Rode INSTALAR-WHISPER.bat.')));
        });
      });
      const st = await http_(wPorta, 'GET', '/status');
      if (st.estado === 'erro') throw new Error(st.erro);
    } catch (e) { matar(py); py = null; wPorta = 0; throw e; }
  })();
  const p = wIniciando;
  p.catch(() => {}).then(() => { if (wIniciando === p) wIniciando = null; });
  return p;
}
ipcMain.handle('whisper-carregar', async (_e, modelo) => {
  await iniciarWhisper();
  const st = await http_(wPorta, 'POST', '/carregar?modelo=' + encodeURIComponent(modelo));
  return { dispositivo: st.dispositivo, modelo: st.modelo };
});
ipcMain.handle('whisper-transcrever', async (_e, wav, lingua, modelo) => {
  await iniciarWhisper();
  const r = await http_(wPorta, 'POST', '/transcrever?lingua=' + encodeURIComponent(lingua || '') + '&modelo=' + encodeURIComponent(modelo), Buffer.from(wav));
  return r.texto || '';
});

/* ================= IA: OpenCode (opencode.ai), em modo servidor local (opencode serve) ================= */
// O app inicia o "opencode serve" sozinho, só em 127.0.0.1, com senha aleatória, numa pasta vazia
// e com TODAS as ferramentas de código desligadas (a IA só conversa: não lê nem altera arquivos, nem roda comandos).
let oc = null, ocPorta = 0, ocAuth = '', ocIniciando = null, ocSessao = null, ocVersao = '';
const AGENTE = 'ondas';
const SEM_FERRAMENTAS = { bash: false, edit: false, write: false, read: false, grep: false, glob: false, list: false, patch: false, todowrite: false, todoread: false, webfetch: false, task: false };
const ocReq = (m, c, corpo, timeout) => http_(ocPorta, m, c, corpo == null ? null : JSON.stringify(corpo),
  { Authorization: ocAuth, ...(corpo == null ? {} : { 'Content-Type': 'application/json' }) }, timeout);
const DICA_OC = 'Instale o OpenCode (rode INSTALAR-OPENCODE.bat ou: npm i -g opencode-ai) e configure um provedor/modelo (comando: opencode auth login).';

function iniciarOpenCode() {
  if (oc && ocPorta) return Promise.resolve();
  if (ocIniciando) return ocIniciando;
  ocIniciando = (async () => {
    ocPorta = await portaLivre();
    const senha = crypto.randomBytes(16).toString('hex');
    ocAuth = 'Basic ' + Buffer.from('opencode:' + senha).toString('base64');
    const pasta = path.join(app.getPath('userData'), 'opencode-vazio');
    fs.mkdirSync(pasta, { recursive: true });
    const cfg = {
      $schema: 'https://opencode.ai/config.json',
      autoupdate: false, share: 'disabled',
      permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
      agent: { [AGENTE]: {
        mode: 'primary', description: 'Assistente do painel Ondas ESP32 (só conversa)',
        prompt: 'Você é um assistente de conversa. Não use ferramentas. Siga as instruções do sistema e responda somente com texto.',
        tools: SEM_FERRAMENTAS, permission: { '*': 'deny' } } }
    };
    msg('ia-msg', 'Iniciando o OpenCode…');
    try {
      await new Promise((ok, no) => {
        let log = '', exit = false;
        const p = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(ocPorta)], {
          cwd: pasta, windowsHide: true, shell: process.platform === 'win32',   // no Windows o npm cria opencode.cmd
          env: { ...process.env, OPENCODE_SERVER_PASSWORD: senha, OPENCODE_CONFIG_CONTENT: JSON.stringify(cfg) } });
        oc = p;
        const ac = d => { log = (log + d).slice(-1500); };
        p.stdout.on('data', ac); p.stderr.on('data', ac);
        p.on('error', e => { exit = true; no(new Error('Não consegui executar o OpenCode (' + e.message + '). ' + DICA_OC)); });
        p.on('exit', () => { exit = true; if (oc === p) { oc = null; ocPorta = 0; ocSessao = null; } no(new Error('O OpenCode fechou ao iniciar. ' + (log.trim().split('\n').pop() || '') + ' ' + DICA_OC)); });
        const t0 = Date.now();
        (async function espera() {
          while (!exit && Date.now() - t0 < 90000) {
            try {
              const h = await ocReq('GET', '/global/health', null, 2000);
              if (h && h.healthy) { ocVersao = h.version || ''; return ok(); }
            } catch (_) {}
            await new Promise(r => setTimeout(r, 500));
          }
          if (!exit) no(new Error('O OpenCode demorou demais para iniciar. ' + DICA_OC));
        })();
      });
    } catch (e) { matar(oc); oc = null; ocPorta = 0; throw e; }
  })();
  const p = ocIniciando;
  p.catch(() => {}).then(() => { if (ocIniciando === p) ocIniciando = null; });
  return p;
}

async function ocModelos() {
  let all = [], padrao = {}, conectados = null;
  try {
    const r = await ocReq('GET', '/provider', null, 15000);
    all = r.all || []; padrao = r.default || {}; conectados = r.connected || [];
  } catch (_) {
    const r = await ocReq('GET', '/config/providers', null, 15000);   // servidores mais antigos
    all = r.providers || []; padrao = r.default || {};
  }
  const lista = [];
  for (const p of all) {
    if (conectados && !conectados.includes(p.id)) continue;
    for (const id of Object.keys(p.models || {})) lista.push(p.id + '/' + id);
  }
  const pid = Object.keys(padrao).find(k => !conectados || conectados.includes(k));
  return { lista, padrao: pid ? pid + '/' + padrao[pid] : (lista[0] || '') };
}
const dividirModelo = s => { const i = s.indexOf('/'); return i < 0 ? null : { providerID: s.slice(0, i), modelID: s.slice(i + 1) }; };

ipcMain.handle('ia-testar', async () => {
  await iniciarOpenCode();
  const m = await ocModelos();
  return { versao: ocVersao, modelos: m.lista.slice(0, 500), padrao: m.padrao };
});
ipcMain.handle('ia-limpar', async () => {
  const s = ocSessao; ocSessao = null;
  if (s && oc) { try { await ocReq('DELETE', '/session/' + s, null, 5000); } catch (_) {} }
  return true;
});
ipcMain.handle('ia-perguntar', async (_e, modeloTxt, sistema, texto) => {
  await iniciarOpenCode();
  let modelo = dividirModelo(String(modeloTxt || '').trim());
  if (!modelo) {
    const m = await ocModelos();
    modelo = dividirModelo(m.padrao);
    if (!modelo) throw new Error('Nenhum modelo disponível no OpenCode. No terminal rode: opencode auth login (ou configure um provedor).');
  }
  const corpo = { agent: AGENTE, model: modelo, system: String(sistema || ''), tools: SEM_FERRAMENTAS, parts: [{ type: 'text', text: String(texto) }] };
  for (let tentativa = 0; ; tentativa++) {
    if (!ocSessao) ocSessao = (await ocReq('POST', '/session', { title: 'Painel ESP32' }, 15000)).id;
    try {
      const r = await ocReq('POST', '/session/' + ocSessao + '/message', corpo, 240000);
      if (r.info && r.info.error) {
        const er = r.info.error;
        throw new Error((er.data && er.data.message) || er.name || 'erro do provedor/modelo');
      }
      const t = (r.parts || []).filter(p => p.type === 'text' && !p.synthetic).map(p => p.text).join('\n').trim();
      return t;
    } catch (e) {
      if (e.message === 'tempo esgotado') { try { await ocReq('POST', '/session/' + ocSessao + '/abort', null, 5000); } catch (_) {} }
      if (e.status === 404 && tentativa === 0) { ocSessao = null; continue; }   // sessão sumiu (servidor reiniciado)
      throw e;
    }
  }
});

app.whenReady().then(() => {
  w = new BrowserWindow({ width: 1200, height: 800, webPreferences: { webSecurity: false, preload: path.join(__dirname, 'preload.js') } });
  const s = w.webContents.session;
  s.on('select-serial-port', (e, lista, wc, cb) => { e.preventDefault(); cb(lista[0] ? lista[0].portId : ''); });
  s.setPermissionCheckHandler(() => true);
  s.setPermissionRequestHandler((wc, perm, cb) => cb(true));
  s.setDevicePermissionHandler(() => true);
  w.setMenuBarVisibility(false);
  w.loadFile('index.html');
});
app.on('before-quit', () => { matar(py); matar(oc); });
app.on('window-all-closed', () => app.quit());
