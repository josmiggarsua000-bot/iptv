// Runs inside Electron on Windows, with a disposable profile and fake credentials.
const { app, BrowserWindow, safeStorage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-desktop-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
let fixture;
const deadline = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 45000);
app.once('browser-window-created', (_, window) => {
  window.hide();
  window.webContents.once('did-finish-load', async () => {
    try {
      await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(() => {
          if (document.querySelector('#picker-add')?.onclick) { clearInterval(timer); resolve(); }
          else if (++attempts > 100) { clearInterval(timer); reject(new Error('La interfaz no inició')); }
        }, 100);
      })`);
      assert.equal(safeStorage.isEncryptionAvailable(), true, 'Windows must provide account encryption');
      const state = { accounts: [{ id: 'test', name: 'Prueba de escritorio', type: 'xtream', config: { server: 'https://example.com', username: 'fixture-user', password: 'fixture-secret-not-real' }, items: [] }], activeId: 'test', favorites: {} };
      await window.webContents.executeJavaScript(`window.desktop.saveState(${JSON.stringify(state)})`);
      const bytes = fs.readFileSync(path.join(profile, 'accounts.enc'));
      assert.equal(bytes.includes(Buffer.from('fixture-secret-not-real')), false);
      assert.deepEqual(JSON.parse(safeStorage.decryptString(bytes)), state);
      assert.deepEqual(await window.webContents.executeJavaScript('window.desktop.readState()'), state);
      fixture = http.createServer((req, res) => { res.end('#EXTM3U\n#EXTINF:-1,Desktop\nhttps://example.com/live.m3u8'); });
      await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
      const response = await window.webContents.executeJavaScript(`window.desktop.fetchPlaylist('http://127.0.0.1:${fixture.address().port}/list')`);
      assert.match(response.text, /^#EXTM3U/);
      let rejected = false;
      try { await window.webContents.executeJavaScript("window.desktop.fetchPlaylist('file:///C:/Windows/win.ini')"); } catch { rejected = true; }
      assert.equal(rejected, true, 'IPC rejects local file URLs');
      console.log('Desktop Windows: interfaz de producción, IPC, cifrado/lectura real de cuentas y descarga HTTP: OK');
      clearTimeout(deadline);
      fixture.close();
      for (const win of BrowserWindow.getAllWindows()) win.destroy();
      app.exit(0);
    } catch (error) { console.error(error); clearTimeout(deadline); fixture?.close(); app.exit(1); }
  });
});
require('../electron/main.cjs');
