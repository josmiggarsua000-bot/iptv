const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { fetchPlaylist: url => ipcRenderer.invoke('playlist:fetch', url), readState: () => ipcRenderer.invoke('state:read'), saveState: state => ipcRenderer.invoke('state:save', state) });
