import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH === 'playwright' ? undefined : (process.env.CHROMIUM_PATH || '/usr/bin/chromium'), headless: true, args: ['--no-sandbox', '--enable-blink-features=AudioVideoTracks'] });
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
  const playlist = port => `#EXTM3U\n#EXTINF:-1 tvg-id="news" group-title="Noticias",Noticias Uno\nhttp://127.0.0.1:${port}/video.webm\n#EXTINF:-1 group-title="Música",Música Dos\nhttp://127.0.0.1:${port}/video.webm?second=1`;
  let requests = 0, denyList = false, dtdRequests = 0;
  const epgQueries = [];
  if (process.argv.includes('--hls')) {
    hlsDir = await mkdtemp(join(tmpdir(), 'nexo-hls-'));
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '24', '-hls_time', '1', '-hls_list_size', '0', join(hlsDir, 'stream.m3u8')]);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '8', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-g', '24', '-c:a', 'aac', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=spa', '-movflags', '+faststart', join(hlsDir, 'dual.mp4')]);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(hlsDir, 'dual.mp4'), '-map', '0:v', '-map', '0:a:0', '-map', '0:a:1', '-c', 'copy', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', '-var_stream_map', 'v:0,agroup:aud a:0,agroup:aud,language:eng,default:yes a:1,agroup:aud,language:spa', '-master_pl_name', 'dual-master.m3u8', '-hls_segment_filename', join(hlsDir, 'dual-%v-%03d.ts'), join(hlsDir, 'dual-%v.m3u8')]);
    const master = await readFile(join(hlsDir, 'dual-master.m3u8'), 'utf8');
    await writeFile(join(hlsDir, 'dual-master.m3u8'), master.replace('#EXTM3U', '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Español",LANGUAGE="es",AUTOSELECT=YES,DEFAULT=NO,FORCED=NO,URI="dual-subs.m3u8"').split('\n').map(line => line.startsWith('#EXT-X-STREAM-INF:') ? line + ',SUBTITLES="subs"' : line).join('\n'));
    await writeFile(join(hlsDir, 'dual-subs.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:8\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:8.0,\ndual-es.vtt\n#EXT-X-ENDLIST\n');
    await writeFile(join(hlsDir, 'dual-es.vtt'), 'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:126000\n\n00:00:00.000 --> 00:00:08.000\nSubtítulos HLS de prueba\n');


  }
  fixture = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/epg.xml' || url.pathname === '/xmltv.php') {
      epgQueries.push(url.searchParams.get('username'));
      const time = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0,14) + ' +0000';
      res.setHeader('Content-Type', 'application/xml');
      res.end(`<?xml version="1.0"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv><channel id="news"><display-name>Noticias Uno</display-name></channel><programme channel="news" start="${time(Date.now()-600000)}" stop="${time(Date.now()+1800000)}"><title>Programa de prueba</title><desc>Actualidad</desc></programme></tv>`);
    }
    else if (url.pathname === '/xmltv.dtd') { dtdRequests++; res.end(''); }
    else if (hlsDir && /^\/dual[-\w]*\.(mp4|m3u8|ts|vtt)$/.test(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : url.pathname.endsWith('.mp4') ? 'video/mp4' : url.pathname.endsWith('.vtt') ? 'text/vtt' : 'video/mp2t');
      res.end(await readFile(join(hlsDir, url.pathname.slice(1))));
    }
    else if (url.pathname === '/player_api.php') {
      res.setHeader('Content-Type', 'application/json');
      const action = url.searchParams.get('action');
      let result;
      if (url.searchParams.get('username') !== 'demo +&' || url.searchParams.get('password') !== 'test/?!') result = { user_info: { auth: 0 } };
      else if (!action) result = { user_info: { auth: 1, status: 'Active', exp_date: '1900000000', max_connections: '4' } };
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
    else { requests++; if (denyList) { res.writeHead(403); res.end(); } else { res.setHeader('Content-Type', 'text/plain'); res.end(playlist(fixture.address().port)); } }
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
  const goto = async kind => {
    if (kind === 'home') { if (!(await page.locator('#home-view').isVisible())) await page.locator('[data-view="home"]').click(); return; }
    if (!(await page.locator('#home-view').isVisible())) await page.locator('[data-view="home"]').click();
    await page.locator(`[data-open="${kind}"]`).click();
  };
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
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  assert.equal(await page.locator('.account-portals [data-open]').count(), 4);
  assert.equal(await page.locator('#count-movie').textContent(), '1');
  assert.equal(await page.locator('#count-series').textContent(), '1');
  await goto('live');
  assert.equal(await page.locator('.sidebar').isVisible(), true);
  assert.equal(await page.locator('.category').filter({ hasText: 'Noticias' }).isVisible(), true);
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
  await page.locator('#subtitle-file').setInputFiles({ name: 'es.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 00:01:00,000\nSubtítulo de prueba') });
  await page.waitForFunction(() => [...document.querySelector('#video').textTracks].some(t => t.mode === 'showing' && t.cues?.length));
  assert.match(await page.locator('#subtitle-track').textContent(), /es.srt/);
  await page.locator('#subtitle-track').selectOption('');
  await page.waitForFunction(() => [...document.querySelector('#video').textTracks].every(t => t.mode !== 'showing'));
  await page.locator('#epg-settings').click();
  await page.locator('#epg-mode').selectOption('manual');
  await page.locator('#epg-url').fill(`http://127.0.0.1:${port}/epg.xml`);
  await page.locator('#epg-save').click();
  await page.waitForSelector('#epg-dialog', { state: 'hidden' });
  await goto('epg');
  await page.waitForSelector('.epg-program');
  assert.match(await page.locator('#epg-programs').textContent(), /Programa de prueba/);
  assert.equal(dtdRequests, 0);
  await page.locator('.category').filter({ hasText: 'Música' }).click();
  assert.doesNotMatch(await page.locator('#epg-programs').textContent(), /Noticias Uno/);
  await page.locator('.category').filter({ hasText: 'Todas las categorías' }).click();
  await page.screenshot({ path: 'artifacts/epg.png', fullPage: true });
  await goto('multi');
  for (let i = 1; i <= 4; i++) {
    await page.getByRole('button', { name: `Elegir canal para pantalla ${i}`, exact: true }).click();
    await page.locator('#multi-options button').first().click();
  }
  await page.waitForFunction(() => [...document.querySelectorAll('#multi-grid video')].every(v => v.currentTime > 0));
  await page.getByRole('button', { name: 'Escuchar pantalla 2', exact: true }).click();
  assert.equal(await page.locator('#multi-grid video').evaluateAll(videos => videos.filter(v => !v.muted).length), 1);
  await page.screenshot({ path: 'artifacts/multiscreen.png', fullPage: true });
  await goto('movie');
  assert.equal(await page.locator('#multi-grid video').evaluateAll(videos => videos.every(v => !v.getAttribute('src'))), true);
  assert.equal(await page.locator('#watch-area').isVisible(), false);
  assert.equal(await page.locator('.content-card').count(), 1);
  await goto('series');
  assert.equal(await page.locator('.content-card').count(), 1);
  // A second account must not replace the first or share its favorites.
  if (await page.locator('.app').isVisible()) await page.locator('#change-account').click();
  await page.locator('#picker-add').click();
  await page.locator('[data-type="m3u-file"]').click();
  await page.locator('[data-type="m3u-url"]').click();
  await page.locator('#playlist-url').fill(`http://127.0.0.1:${port}/get.php?username=fixture&password=fake&type=m3u_plus&output=ts`);
  await page.locator('#account-name').fill('Cuenta por URL');
  await page.locator('#account-submit').click();
  await page.waitForSelector('#account-dialog', { state: 'hidden' });
  assert.equal(await page.locator('.account-row').count(), 2);
  assert.equal(await page.locator('#count-favorites').textContent(), '0');
  await goto('epg');
  await page.waitForSelector('.epg-program');
  assert.ok(epgQueries.includes('fixture'));
  assert.equal(dtdRequests, 0);
  await page.locator('#epg-settings').click();
  await page.locator('#epg-mode').selectOption('off');
  await page.locator('#epg-save').click();
  await page.waitForSelector('#epg-dialog', { state: 'hidden' });
  const offRequests = epgQueries.length;
  await goto('home'); await goto('epg');
  assert.match(await page.locator('#epg-status').textContent(), /desactivada/);
  assert.equal(epgQueries.length, offRequests);
  await page.locator('#epg-settings').click();
  await page.locator('#epg-mode').selectOption('auto');
  await page.locator('#epg-save').click();
  await page.waitForSelector('#epg-dialog', { state: 'hidden' });
  await page.waitForSelector('.epg-program');
  await goto('home');
  const beforeRefresh = requests;
  await page.locator('#refresh-account').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Catálogo actualizado.');
  assert.ok(requests > beforeRefresh);
  denyList = true;
  await page.locator('#refresh-account').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Se conserva tu catálogo anterior'));
  assert.equal(await page.locator('#count-live').textContent(), '2');
  assert.match(await page.locator('#notice').textContent(), /HTTP 403/);
  denyList = false;

  await page.locator('#change-account').click();
  const beforeEntry = requests;
  await page.getByRole('button', { name: 'Entrar a Cuenta por URL', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Catálogo actualizado.');
  assert.ok(requests > beforeEntry);
  await page.locator('#auto-refresh').uncheck();
  await page.waitForFunction(() => !document.querySelector('#refresh-account').disabled);
  await page.locator('#change-account').click();
  const disabledCount = requests;
  await page.getByRole('button', { name: 'Entrar a Cuenta por URL', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.app').hidden);
  assert.equal(requests, disabledCount);


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
  assert.match(await page.locator('#account-expiration').textContent(), /2030/);
  await goto('epg');
  await page.waitForSelector('.epg-row');
  assert.ok(epgQueries.includes('demo +&'));
  await goto('home');
  await page.screenshot({ path: 'artifacts/cyberpunk-inicio.png', fullPage: true });
  await goto('movie');
  await page.getByRole('button', { name: 'Reproducir Cine Xtream', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0);
  await goto('series');
  await page.getByRole('button', { name: 'Ver episodios de Serie Xtream', exact: true }).click();
  await page.waitForSelector('#episodes .episode');
  assert.equal(await page.locator('#season-select option').count(), 2);
  await page.locator('#season-select').selectOption('2');
  assert.match(await page.locator('#episodes .episode').textContent(), /Episodio dos/);
  await page.locator('#episodes .episode').click();
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
    await addM3u('Audio dual', `#EXTM3U\n#EXTINF:-1,Audio bilingüe\nhttp://127.0.0.1:${port}/dual-master.m3u8`);
    await goto('live');
    await page.getByRole('button', { name: 'Reproducir Audio bilingüe', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#audio-track').options.length === 2);
    await page.locator('#audio-track').selectOption('1');
    await page.waitForFunction(() => document.querySelector('#audio-track').value === '1' && document.querySelector('#video').currentTime > 0.5);
    assert.match(await page.locator('#audio-track option:checked').textContent(), /spa/);
    await page.waitForFunction(() => document.querySelector('#subtitle-track').options.length > 1);
    await page.locator('#subtitle-track').selectOption('hls:0');
    await page.waitForFunction(() => [...document.querySelector('#video').textTracks].some(t => t.mode === 'showing' && t.cues?.length));

    await addM3u('MP4 dual', `#EXTM3U\n#EXTINF:-1 group-title="Películas",Película bilingüe\nhttp://127.0.0.1:${port}/dual.mp4`);
    await goto('movie');
    await page.getByRole('button', { name: 'Reproducir Película bilingüe', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.5);
    assert.equal(await page.locator('#audio-track option').count(), 2);
    await page.locator('#audio-track').selectOption('1');
    await page.waitForFunction(() => document.querySelector('#video').audioTracks[1].enabled);
    assert.match(await page.locator('#audio-track option:checked').textContent(), /spa/);
    await addM3u('TS directo', `#EXTM3U\n#EXTINF:-1,Canal TS\nhttp://127.0.0.1:${port}/stream0.ts`);
    await goto('live');
    await page.getByRole('button', { name: 'Reproducir Canal TS', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#video').currentTime > 0);
    console.log('HLS H.264, selección de audio bilingüe y MPEG-TS directo: OK');
  }
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.locator('#change-account').click();
  await page.screenshot({ path: 'artifacts/cyberpunk-1000px.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('UI: cuentas y migración, EPG XMLTV, vencimiento, Refresh manual/automático y opcional, SRT, 4 pantallas con audio exclusivo, cine y episodios: OK');
} finally {
  await browser?.close();
  if (fixture) await new Promise(resolve => fixture.close(resolve));
  vite.kill();
  if (hlsDir) await rm(hlsDir, { recursive: true, force: true });
}
