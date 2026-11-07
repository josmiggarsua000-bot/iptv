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
const deadline = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 150000);
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
      fixture = http.createServer((req, res) => {
        if (req.url.startsWith('/ac3.mkv')) {
          const bytes=fs.readFileSync(path.join(__dirname,'fixtures/dual-ac3-subtitles.mkv'));
          const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
          const start=range ? Number(range[1]) : 0, end=range?.[2] ? Math.min(Number(range[2]),bytes.length-1) : bytes.length-1;
          if(start>=bytes.length) {res.writeHead(416);res.end();return;}
          res.setHeader('Content-Type','video/x-matroska');res.setHeader('Accept-Ranges','bytes');
          if(range) {res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
          res.setHeader('Content-Length',end-start+1);res.end(bytes.subarray(start,end+1));
        }
        else if (req.url.startsWith('/dual.mp4')) { res.setHeader('Content-Type', 'video/mp4'); res.end(fs.readFileSync(path.join(__dirname, 'fixtures/dual-audio.mp4'))); }
        else res.end('#EXTM3U\n#EXTINF:-1,Desktop\nhttps://example.com/live.m3u8');
      });
      await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
      const response = await window.webContents.executeJavaScript(`window.desktop.fetchPlaylist('http://127.0.0.1:${fixture.address().port}/list')`);
      assert.match(response.text, /^#EXTM3U/);
      let rejected = false;
      try { await window.webContents.executeJavaScript("window.desktop.fetchPlaylist('file:///C:/Windows/win.ini')"); } catch { rejected = true; }
      assert.equal(rejected, true, 'IPC rejects local file URLs');
      const playbackState = { ...state, accounts: [{ id: 'play', name: 'Prueba multimedia', type: 'm3u', config: {}, items: [{ id: 'film', name: 'Dual', kind: 'movie', group: 'Cine', logo: '', url: `http://127.0.0.1:${fixture.address().port}/dual.mp4` }] }] };
      await window.webContents.executeJavaScript(`window.desktop.saveState(${JSON.stringify(playbackState)})`);
      await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload(); });
      const wait = expression => window.webContents.executeJavaScript(`new Promise((resolve, reject) => { let n=0; const timer=setInterval(() => { if (${expression}) { clearInterval(timer); resolve(); } else if (++n>100) { clearInterval(timer); reject(new Error('Multimedia check timed out')); } },100); })`);
      await wait("document.querySelector('.account-enter')");
      await window.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Editar cuenta Prueba multimedia\"]').click(); document.querySelector('#account-name').value='Prueba multimedia editada'; document.querySelector('#account-submit').click()", true);
      await wait("document.querySelector('.account-info strong')?.textContent === 'Prueba multimedia editada'");
      await window.webContents.executeJavaScript("document.querySelector('.account-enter').click()", true);
      await wait("!document.querySelector('.app').hidden");
      await window.webContents.executeJavaScript("document.querySelector('[data-open=movie]').click(); document.querySelector('#video').muted = true; document.querySelector('.content-play').click()", true);
      await wait("document.querySelector('#video').currentTime > 0.2 && document.querySelector('#audio-track').options.length === 3");
      await window.webContents.executeJavaScript("const select=document.querySelector('#audio-track'); select.value='1'; select.dispatchEvent(new Event('change'))");
      await wait("document.querySelector('#video').audioTracks[1].enabled");
      const ac3 = { ...playbackState, accounts: [{ ...playbackState.accounts[0], items: [{ id: 'ac3', name: 'AC3', kind: 'movie', group: 'Cine', logo: '', url: `http://127.0.0.1:${fixture.address().port}/ac3.mkv` }] }] };
      await window.webContents.executeJavaScript(`window.desktop.saveState(${JSON.stringify(ac3)})`);
      await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload(); });
      await wait("document.querySelector('.account-enter')");
      await window.webContents.executeJavaScript("document.querySelector('.account-enter').click()", true);
      await wait("!document.querySelector('.app').hidden");
      await window.webContents.executeJavaScript("document.querySelector('[data-open=movie]').click(); document.querySelector('.content-play').click()", true);
      await wait("!document.querySelector('#compat-bar').hidden && document.querySelector('#video').currentTime>0.2");
      await window.webContents.executeJavaScript("document.querySelector('#player-settings-toggle').click(); const audio=document.querySelector('#audio-track'); audio.value='compat:2'; audio.dispatchEvent(new Event('change')); const subs=document.querySelector('#subtitle-track'); subs.value='compat-s:3'; subs.dispatchEvent(new Event('change'))", true);
      await wait("document.querySelector('#audio-track').value==='compat:2' && document.querySelector('#video').currentTime>0.3 && [...document.querySelector('#video').textTracks].some(t=>t.mode==='showing' && t.cues?.length)");
      assert.equal(await window.webContents.executeJavaScript("document.querySelector('#player').contains(document.querySelector('#track-controls'))"), true);
      console.log('Desktop Windows: motor AC3 nativo, cambio a inglés, subtítulos integrados y menú interior: OK');
      console.log('Desktop Windows: interfaz, IPC, cifrado, descarga HTTP, reproducción MP4 y edición de cuenta y selección de audio dual: OK');
      clearTimeout(deadline);
      fixture.close();
      for (const win of BrowserWindow.getAllWindows()) win.destroy();
      app.exit(0);
    } catch (error) { console.error(error); clearTimeout(deadline); fixture?.close(); app.exit(1); }
  });
});
require('../electron/main.cjs');
