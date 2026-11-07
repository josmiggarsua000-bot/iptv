const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { fetchPlaylist: url => ipcRenderer.invoke('playlist:fetch', url) });
