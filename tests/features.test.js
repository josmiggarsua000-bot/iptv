import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { fetchText } from '../electron/download.cjs';
import { xmltvTime, channelPrograms, safeXmltv, discoverEpgUrl, resolveEpgUrl } from '../src/epg.js';
import { subtitleVtt } from '../src/subtitles.js';
import { parseM3U, playlistEpgUrl } from '../src/playlist.js';
import { transport } from '../src/transport.js';
import { loadXtream } from '../src/xtream.js';

test('Descarga URLs get.php conservando query, archivos >20 MB y GZIP con límites', async () => {
  let received = '';
  const server = createServer((req, res) => {
    received = req.url;
    if (req.url === '/gzip') return res.end(gzipSync(Buffer.from('<tv></tv>')));
    if (req.url === '/denied') { res.writeHead(403); return res.end(); }
    if (req.url === '/big') return res.end('#EXTM3U\n' + '#'.repeat(21 * 1024 * 1024));
    res.end('#EXTM3U\n#EXTINF:-1 tvg-id="news",Noticias\nhttps://example.com/live/1.ts');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const { text } = await fetchText(root + '/get.php?username=fixture&password=fake&type=m3u_plus&output=ts');
    assert.match(received, /type=m3u_plus&output=ts/);
    assert.equal(parseM3U(text)[0].epgId, 'news');
    assert.equal((await fetchText(root + '/gzip')).text, '<tv></tv>');
    assert.ok((await fetchText(root + '/big')).text.length > 20 * 1024 * 1024);
    await assert.rejects(fetchText(root + '/gzip', { maxBytes: 2 }), /límite/);
    await assert.rejects(fetchText(root + '/denied'), /HTTP 403/);
    await assert.rejects(fetchText('file:///private'), /HTTP/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('XMLTV interpreta offsets y asocia IDs con prioridad sobre el nombre', () => {
  assert.equal(xmltvTime('20261107120000 -0600'), Date.UTC(2026, 10, 7, 18));
  assert.equal(xmltvTime('20261107180000 +0000'), Date.UTC(2026, 10, 7, 18));
  assert.ok(Number.isNaN(xmltvTime('invalid')));
  const now = Date.now();
  const epg = { names: new Map([['musica', 'a']]), programs: new Map([['a', [{ stop: now + 1000, title: 'Actual' }]]]) };
  assert.equal(channelPrograms(epg, { epgId: 'a', name: 'Otro' }, now)[0].title, 'Actual');
  assert.equal(channelPrograms(epg, { name: 'Música' }, now)[0].title, 'Actual');
  assert.deepEqual(channelPrograms(epg, { name: 'Desconocido' }, now), []);
});
test('Convierte SRT a VTT y rechaza subtítulos inválidos', () => {
  const output = subtitleVtt('1\r\n00:00:01,000 --> 00:00:02,000\r\nHola');
  assert.match(output, /^WEBVTT/); assert.match(output, /00:00:01\.000/);
  assert.equal(subtitleVtt('WEBVTT\n\n00:00.000 --> 00:02.000\nHola').startsWith('WEBVTT'), true);
  assert.throws(() => subtitleVtt('not subtitles'), /válidos/);
});
test('Vencimiento del proveedor se guarda como dato temporal y no se inventa para M3U', async () => {
  const config = { server: 'https://example.com', username: 'fake', password: 'fake' };
  const result = await loadXtream(config, async address => new URL(address).searchParams.has('action') ? [] : { user_info: { auth: 1, exp_date: '1900000000', max_connections: '4' } });
  assert.equal(result.accountInfo.expiresAt, 1900000000000);
  assert.equal(result.accountInfo.maxConnections, 4);
});

test('Detecta HLS y TS sin exigir .m3u en la URL de la lista', () => {
  assert.equal(transport({ url: 'https://example.com/user/pass/123', kind: 'live' }), 'mpegts');
  assert.equal(transport({ url: 'https://example.com/signal', kind: 'live' }, 'https://example.com/get.php?type=m3u_plus&output=ts'), 'mpegts');
  assert.equal(transport({ url: 'https://example.com/signal', kind: 'live' }, 'https://example.com/get.php?output=m3u8'), 'hls');
  assert.equal(transport({ url: 'https://example.com/film.mp4', kind: 'movie' }), 'native');
});

test('XMLTV permite DOCTYPE externo estándar sin cargarlo y rechaza entidades internas', () => {
  assert.equal(safeXmltv('<!DOCTYPE tv SYSTEM "xmltv.dtd"><tv/>'), '<tv/>');
  assert.equal(safeXmltv("<!DOCTYPE tv PUBLIC '-//XMLTV//DTD XMLTV//EN' 'https://example.com/xmltv.dtd'><tv/>"), '<tv/>');
  assert.throws(() => safeXmltv('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///private">]><tv>&x;</tv>'), /entidades/);
  const text = '<tv><desc><![CDATA[Texto literal <!DOCTYPE html>]]></desc></tv>';
  assert.equal(safeXmltv(text), text);
});
test('EPG automático para Xtream, M3U remoto y archivos con rutas de stream', () => {
  const account = { type: 'xtream', config: { server: 'https://example.com:2095', username: 'user+&', password: 'p/?!' }, items: [] };
  let url = new URL(discoverEpgUrl(account));
  assert.equal(url.pathname, '/xmltv.php'); assert.equal(url.searchParams.get('username'), 'user+&'); assert.equal(url.searchParams.get('password'), 'p/?!');
  const m3u = { type: 'm3u', config: { url: 'https://example.com:2095/sub/get.php?username=fixture&password=fake&type=m3u_plus&output=ts' }, items: [] };
  url = new URL(discoverEpgUrl(m3u)); assert.equal(url.pathname, '/sub/xmltv.php'); assert.equal(url.searchParams.get('username'), 'fixture');
  const local = { type: 'm3u', config: {}, items: [{ url: 'https://example.com/live/user%2B/password%26/123.ts' }] };
  url = new URL(discoverEpgUrl(local)); assert.equal(url.searchParams.get('username'), 'user+'); assert.equal(url.searchParams.get('password'), 'password&');
  assert.equal(resolveEpgUrl({ ...account, config: { ...account.config, epgMode: 'off' } }), '');
  assert.equal(resolveEpgUrl({ ...account, config: { ...account.config, epgUrl: 'https://example.com/custom.xml' } }), 'https://example.com/custom.xml');
  assert.equal(discoverEpgUrl({ type: 'm3u', config: {}, items: [{ url: 'https://example.com/clip.mp4' }] }), '');
  assert.equal(playlistEpgUrl('#EXTM3U x-tvg-url="https://example.com/epg.xml"'), 'https://example.com/epg.xml');
  assert.equal(playlistEpgUrl('#EXTM3U url-tvg="epg.xml"', 'https://example.com/list.m3u'), 'https://example.com/epg.xml');
});
