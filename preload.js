const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ondasWhisper', {
  carregar: modelo => ipcRenderer.invoke('whisper-carregar', modelo),
  transcrever: (wav, lingua, modelo) => ipcRenderer.invoke('whisper-transcrever', wav, lingua, modelo),
  onMsg: cb => ipcRenderer.on('whisper-msg', (_e, t) => cb(t))
});
contextBridge.exposeInMainWorld('ondasIA', {
  testar: () => ipcRenderer.invoke('ia-testar'),
  perguntar: (modelo, sistema, texto) => ipcRenderer.invoke('ia-perguntar', modelo, sistema, texto),
  limpar: () => ipcRenderer.invoke('ia-limpar'),
  onMsg: cb => ipcRenderer.on('ia-msg', (_e, t) => cb(t))
});
