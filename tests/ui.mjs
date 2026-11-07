import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { stdio: 'pipe' });
let browser, fixture, hlsDir;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite no inició')), 15000);
    vite.stdout.on('data', data => { if (data.toString().includes('5179')) { clearTimeout(timer); resolve(); } });
    vite.on('exit', code => { clearTimeout(timer); reject(new Error(`Vite terminó: ${code}`)); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH === 'playwright' ? undefined : (process.env.CHROMIUM_PATH || '/usr/bin/chromium'), headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5179');
  await mkdir('artifacts', { recursive: true });
  assert.equal(await page.locator('.app').isVisible(), false);
  assert.equal(await page.locator('#account-picker button:visible').count(), 1);
  await page.screenshot({ path: 'artifacts/inicio.png', fullPage: true });
  // Produce a real local media fixture without depending on an external channel.
  const media = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
    recorder.start();
    let n = 0; const timer = setInterval(() => { ctx.fillStyle = n++ % 2 ? '#78e2c5' : '#152538'; ctx.fillRect(0, 0, 320, 180); }, 60);
    await new Promise(resolve => setTimeout(resolve, 1600)); recorder.stop(); clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return done;
  });
  const data = Buffer.from(media);
  const playlist = port => `#EXTM3U\n#EXTINF:-1 group-title="Noticias",Noticias Uno\nhttp://127.0.0.1:${port}/video.webm\n#EXTINF:-1 group-title="Música",Música Dos\nhttp://127.0.0.1:${port}/video.webm?second=1`;
  if (process.argv.includes('--hls')) {
    hlsDir = await mkdtemp(join(tmpdir(), 'nexo-hls-'));
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '24', '-hls_time', '1', '-hls_list_size', '0', join(hlsDir, 'stream.m3u8')]);
  }
  fixture = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/player_api.php') {
      res.setHeader('Content-Type', 'application/json');
      const action = url.searchParams.get('action');
      let result;
      if (url.searchParams.get('username') !== 'demo +&' || url.searchParams.get('password') !== 'test/?!') result = { user_info: { auth: 0 } };
      else if (!action) result = { user_info: { auth: 1, status: 'Active' } };
      else if (action.endsWith('categories')) result = [{ category_id: 1, category_name: 'Selección neón' }];
      else if (action === 'get_live_streams') result = [{ stream_id: 1, name: 'TV Xtream', category_id: 1 }];
      else if (action === 'get_vod_streams') result = [{ stream_id: 2, name: 'Cine Xtream', category_id: 1, container_extension: 'webm' }];
      else if (action === 'get_series') result = [{ series_id: 3, name: 'Serie Xtream', category_id: 1 }];
      else if (action === 'get_series_info') result = { episodes: { 1: [{ id: 4, title: 'Episodio uno', episode_num: 1, container_extension: 'webm' }], 2: [{ id: 5, title: 'Episodio dos', episode_num: 1, container_extension: 'webm' }] } };
      else result = [];
      res.end(JSON.stringify(result));
    }
    else if (hlsDir && /^\/stream(?:\d+\.ts|\.m3u8)$/.test(req.url)) {
      res.setHeader('Content-Type', req.url.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
      res.end(await readFile(join(hlsDir, req.url.slice(1))));
    }
    else if (req.url.startsWith('/video') || req.url.startsWith('/movie/') || req.url.startsWith('/series/')) { res.setHeader('Content-Type', 'video/webm'); res.end(data); }
    else { res.setHeader('Content-Type', 'text/plain'); res.end(playlist(fixture.address().port)); }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const port = fixture.address().port;
  const addM3u = async (name, text) => {
    if (await page.locator('.app').isVisible()) await page.locator('#change-account').click();
    await page.locator('#picker-add').click();
    await page.locator('[data-type="m3u-file"]').click();
    await page.locator('#account-name').fill(name);
    await page.locator('#playlist-file').setInputFiles({ name: 'Prueba.m3u', mimeType: 'text/plain', buffer: Buffer.from(text) });
    await page.locator('#account-submit').click();
    await page.waitForSelector('#account-dialog', { state: 'hidden' });
  };
  const goto = kind => page.locator(`[data-view="${kind}"]`).click();
  if (await page.locator('.app').isVisible()) await page.locator('#change-account').click();
  await page.locator('#picker-add').click();
  assert.equal(await page.locator('#account-fields').isVisible(), false);
  await page.locator('[data-type="m3u-file"]').click();
  await page.locator('#playlist-file').setInputFiles({ name: 'invalid.m3u', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await page.locator('#account-submit').click();
  await page.waitForFunction(() => document.querySelector('#account-error').textContent.includes('válida'));
  await page.locator('#cancel-account').click();
  await addM3u('Mi cuenta M3U', playlist(port) + `\n#EXTINF:-1 group-title="Películas",Cine de prueba\nhttp://127.0.0.1:${port}/video.webm?movie=1\n#EXTINF:-1 group-title="Series",Serie M3U\nhttp://127.0.0.1:${port}/video.webm?series=1`);
  assert.equal(await page.locator('#count-live').textContent(), '2');
  assert.equal(await page.locator('#count-movie').textContent(), '1');
  assert.equal(await page.locator('#count-series').textContent(), '1');
  await goto('live');
  assert.equal(await page.locator('.content-card').count(), 2);
  await page.getByRole('button', { name: 'Favorito: Noticias Uno', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#count-favorites').textContent === '1');
  await goto('favorites');
  assert.equal(await page.locator('.content-card').count(), 1);
  await page.reload();
  assert.equal(await page.locator('.app').isVisible(), false);
  assert.equal(await page.locator('#account-picker').isVisible(), true);
  await page.getByRole('button', { name: 'Entrar a Mi cuenta M3U', exact: true }).click();
  await goto('favorites');
  assert.equal(await page.locator('.content-card').count(), 1);
  await goto('live');
  await page.locator('#search').fill('musica');
  assert.equal(await page.locator('.content-card').count(), 1);
  await page.locator('#search').fill('ninguno');
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.locator('#search').fill('');
  await page.locator('.category').filter({ hasText: 'Noticias' }).click();
  assert.equal(await page.locator('.content-card').count(), 1);
  await page.getByRole('button', { name: 'Reproducir Noticias Uno', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0);
  assert.match(await page.locator('#playback-status').textContent(), /Reproduciendo/);
  await goto('movie');
  assert.equal(await page.locator('#watch-area').isVisible(), false);
  assert.equal(await page.locator('.content-card').count(), 1);
  await goto('series');
  assert.equal(await page.locator('.content-card').count(), 1);
  // A second account must not replace the first or share its favorites.
  if (await page.locator('.app').isVisible()) await page.locator('#change-account').click();
  await page.locator('#picker-add').click();
  await page.locator('[data-type="m3u-file"]').click();
  await page.locator('[data-type="m3u-url"]').click();
  await page.locator('#playlist-url').fill(`http://127.0.0.1:${port}/playlist.m3u`);
  await page.locator('#account-name').fill('Cuenta por URL');
  await page.locator('#account-submit').click();
  await page.waitForSelector('#account-dialog', { state: 'hidden' });
  assert.equal(await page.locator('.account-row').count(), 2);
  assert.equal(await page.locator('#count-favorites').textContent(), '0');
  await page.locator('#change-account').click();
  await page.getByRole('button', { name: 'Entrar a Mi cuenta M3U', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#count-favorites').textContent === '1');
  // A real HTTP Xtream fixture serves separate catalogs and on-demand episodes.
  if (await page.locator('.app').isVisible()) await page.locator('#change-account').click();
  await page.locator('#picker-add').click();
  await page.locator('[data-type="xtream"]').click();
  await page.locator('#server-url').fill(`http://127.0.0.1:${port}`);
  await page.locator('#username').fill('demo +&');
  await page.locator('#password').fill('bad');
  await page.locator('#account-submit').click();
  await page.waitForFunction(() => document.querySelector('#account-error').textContent.includes('rechazó'));
  assert.equal(await page.locator('.account-row').count(), 2);
  await page.locator('#password').fill('test/?!');
  await page.locator('#account-name').fill('Xtream de prueba');
  await page.locator('#account-submit').click();
  await page.waitForSelector('#account-dialog', { state: 'hidden' });
  assert.equal(await page.locator('.account-row').count(), 3);
  assert.equal(await page.locator('#count-live').textContent(), '1');
  assert.equal(await page.locator('#count-movie').textContent(), '1');
  assert.equal(await page.locator('#count-series').textContent(), '1');
  await page.screenshot({ path: 'artifacts/cyberpunk-inicio.png', fullPage: true });
  await goto('movie');
  await page.getByRole('button', { name: 'Reproducir Cine Xtream', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0);
  await goto('series');
  await page.getByRole('button', { name: 'Ver episodios de Serie Xtream', exact: true }).click();
  await page.waitForSelector('.episode');
  assert.equal(await page.locator('#season-select option').count(), 2);
  await page.locator('#season-select').selectOption('2');
  assert.match(await page.locator('.episode').textContent(), /Episodio dos/);
  await page.locator('.episode').click();
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0);
  assert.equal(await page.locator('#current-name').textContent(), 'Episodio dos');
  await page.screenshot({ path: 'artifacts/cyberpunk-series.png', fullPage: true });
  await page.reload();
  assert.equal(await page.locator('.app').isVisible(), false);
  await page.getByRole('button', { name: 'Entrar a Xtream de prueba', exact: true }).click();
  assert.match(await page.locator('#home-account').textContent(), /Xtream de prueba/);
  await page.locator('#change-account').click();
  await page.getByRole('button', { name: 'Eliminar cuenta Xtream de prueba', exact: true }).click();
  await page.locator('#confirm-delete').click();
  await page.waitForSelector('#delete-dialog', { state: 'hidden' });
  assert.equal(await page.locator('.account-row').count(), 2);
  // Existing users keep their previous M3U library and favorites.
  const legacy = await browser.newPage();
  await legacy.goto('http://127.0.0.1:5179');
  await legacy.evaluate(port => {
    localStorage.setItem('nexo.library.v1', JSON.stringify({ name: 'Cuenta anterior', channels: [{ id: `http://127.0.0.1:${port}/video.webm`, url: `http://127.0.0.1:${port}/video.webm`, name: 'Anterior', group: 'Noticias' }], favorites: [`http://127.0.0.1:${port}/video.webm`] }));
  }, port);
  await legacy.reload();
  assert.equal(await legacy.locator('.app').isVisible(), false);
  await legacy.getByRole('button', { name: 'Entrar a Cuenta anterior', exact: true }).click();
  assert.match(await legacy.locator('#home-account').textContent(), /Cuenta anterior/);
  assert.equal(await legacy.locator('#count-favorites').textContent(), '1');
  await legacy.close();
  if (hlsDir) {
    await addM3u('HLS de prueba', `#EXTM3U\n#EXTINF:-1,Canal HLS\nhttp://127.0.0.1:${port}/stream.m3u8`);
    await goto('live');
    await page.getByRole('button', { name: 'Reproducir Canal HLS', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.5);
    assert.match(await page.locator('#playback-status').textContent(), /Reproduciendo/);
    console.log('HLS: manifiesto y segmentos H.264 reproducidos: OK');
  }
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.locator('#change-account').click();
  await page.screenshot({ path: 'artifacts/cyberpunk-1000px.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('UI: cuentas M3U/URL/Xtream, autenticación, TV/cine/series, temporadas, reproducción, favoritos, cambio/eliminación de cuenta, persistencia y migración: OK');
} finally {
  await browser?.close();
  if (fixture) await new Promise(resolve => fixture.close(resolve));
  vite.kill();
  if (hlsDir) await rm(hlsDir, { recursive: true, force: true });
}
