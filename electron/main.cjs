const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  ipcMain.handle('playlist:fetch', async (event, address) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Origen no permitido.');
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se admiten enlaces HTTP o HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`El proveedor respondió con HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 20 * 1024 * 1024) throw new Error('La lista supera el límite de 20 MB.');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return { text: Buffer.concat(chunks).toString('utf8'), url: response.url };
  });
  const createWindow = () => {
    const window = new BrowserWindow({
      width: 1440, height: 940, minWidth: 1000, minHeight: 700,
      backgroundColor: '#0b1018', title: 'Nexo IPTV', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  };
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
