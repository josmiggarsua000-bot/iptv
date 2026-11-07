const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

app.whenReady().then(() => {
  const stateFile = path.join(app.getPath('userData'), 'accounts.enc');
  const checkSender = event => { if (event.senderFrame !== event.sender.mainFrame) throw new Error('Origen no permitido.'); };
  ipcMain.handle('state:read', async event => {
    checkSender(event);
    let bytes;
    try { bytes = await fs.readFile(stateFile); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible.');
    return JSON.parse(safeStorage.decryptString(bytes));
  });
  ipcMain.handle('state:save', async (event, state) => {
    checkSender(event);
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('No hay un almacén de claves seguro disponible.');
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json) > 40 * 1024 * 1024) throw new Error('Las cuentas superan el límite de almacenamiento de 40 MB.');
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile + '.tmp', safeStorage.encryptString(json));
    await fs.rename(stateFile + '.tmp', stateFile);
  });
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
      backgroundColor: '#090713', title: 'Nexo IPTV', autoHideMenuBar: true,
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
