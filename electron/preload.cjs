const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { fetchPlaylist: (url, kind) => ipcRenderer.invoke('playlist:fetch', url, kind), openVlc: url => ipcRenderer.invoke('player:vlc', url), readState: () => ipcRenderer.invoke('state:read'), saveState: state => ipcRenderer.invoke('state:save', state) });
