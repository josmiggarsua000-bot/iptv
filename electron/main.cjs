const { app, BrowserWindow, ipcMain, safeStorage, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { fetchText } = require('./download.cjs');
const { spawn } = require('node:child_process');
const { createMediaEngine } = require('./media-engine.cjs');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
let mediaEngine;

app.whenReady().then(async () => {
  const assetsDirectory = path.join(__dirname, "../dist/assets");
  const logoName = (await fs.readdir(assetsDirectory)).find(name => name.startsWith("nexo-pulso-") && name.endsWith(".png"));
  mediaEngine = createMediaEngine({ ffmpegPath, ffprobePath, fetchImpl: (url, options) => net.fetch(url, options) });
  const stateFile = path.join(app.getPath('userData'), 'accounts.enc');
  const checkSender = event => { if (event.senderFrame !== event.sender.mainFrame) throw new Error('Origen no permitido.'); };
  ipcMain.handle('media:prepare', (event, url) => { checkSender(event); return mediaEngine.prepare(event.sender.id, url); });
  ipcMain.handle('media:source', (event, id, options) => { checkSender(event); return mediaEngine.source(event.sender.id, id, options); });
  ipcMain.handle('media:cues', (event, id, cursors) => { checkSender(event); return mediaEngine.cues(event.sender.id, id, cursors); });
  ipcMain.handle('media:stop', (event, id) => { checkSender(event); mediaEngine.stop(event.sender.id, id); });
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
    if (Buffer.byteLength(json) > 256 * 1024 * 1024) throw new Error('Las cuentas superan el límite de almacenamiento de 256 MB.');
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile + '.tmp', safeStorage.encryptString(json));
    await fs.rename(stateFile + '.tmp', stateFile);
  });
  ipcMain.handle('playlist:fetch', async (event, address, kind) => {
    checkSender(event);
    return fetchText(address, { fetchImpl: (url, options) => net.fetch(url, options), epg: kind === 'epg' });
  });
  ipcMain.handle('player:vlc', async (event, address) => {
    checkSender(event);
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('El enlace de vídeo no es válido.');
    if (process.platform !== 'win32') throw new Error('La integración con VLC está disponible en Windows.');
    const candidates = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(root => path.join(root, 'VideoLAN', 'VLC', 'vlc.exe'));
    let executable;
    for (const candidate of candidates) { try { await fs.access(candidate); executable = candidate; break; } catch {} }
    if (!executable) throw new Error('Instala VLC desde videolan.org en su carpeta predeterminada para reproducir formatos de audio o subtítulos no compatibles aquí.');
    await new Promise((resolve, reject) => { const child = spawn(executable, ['--no-one-instance', '--', url.href], { detached: true, stdio: 'ignore' }); child.once('error', () => reject(new Error('No se pudo abrir VLC.'))); child.once('spawn', () => { child.unref(); resolve(); }); });
  });
  const createWindow = () => {
    const window = new BrowserWindow({
      icon: logoName ? path.join(assetsDirectory, logoName) : undefined,
      width: 1440, height: 940, minWidth: 1000, minHeight: 700,
      backgroundColor: '#090713', title: 'Nexo IPTV', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, enableBlinkFeatures: 'AudioVideoTracks', autoplayPolicy: 'no-user-gesture-required' }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  };
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => { void mediaEngine?.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
