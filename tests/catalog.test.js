import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyM3U } from '../src/library.js';
import { xtreamConfigFromM3U, mappedFavorites, catalogCounts } from '../src/catalog.js';
import { windowPrograms, currentPrograms } from '../src/epg.js';
test('Las rutas tienen prioridad sobre categorías CINE o SERIES de canales en vivo', () => {
  const items = classifyM3U([
    { name: 'Cine Premium', group: 'CINE VIP', url: 'https://example.com/live/u/p/1.ts' },
    { name: 'Series 24/7', group: 'SERIES', url: 'https://example.com/u/p/2.ts' },
    { name: 'Documental', group: 'Cultura', url: 'https://example.com/movie/u/p/3.mp4' },
    { name: 'Piloto', group: 'Cine', url: 'https://example.com/series/u/p/4.mp4' }
  ]);
  assert.deepEqual(items.map(i => i.kind), ['live', 'live', 'movie', 'series']);
  assert.deepEqual(catalogCounts(items), { live: 2, movie: 1, series: 1 });
});
test('Conversión Xtream infiere credenciales de enlaces o archivos y respeta subdirectorios', () => {
  const remote = { type: 'm3u', config: { url: 'https://example.com:2095/sub/get.php?username=u%2B&password=p%26&type=m3u_plus' }, items: [] };
  assert.deepEqual(xtreamConfigFromM3U(remote), { server: 'https://example.com:2095/sub', username: 'u+', password: 'p&' });
  const local = { type: 'm3u', config: {}, items: [{ url: 'https://example.com/sub/live/u%2B/p%26/123.ts' }] };
  assert.deepEqual(xtreamConfigFromM3U(local), { server: 'https://example.com/sub', username: 'u+', password: 'p&' });
  assert.equal(xtreamConfigFromM3U({ type: 'm3u', config: {}, items: [{ url: 'https://example.com/video.mp4' }] }), null);
});
test('Favoritos se relacionan entre TS/M3U y HLS/Xtream sin mezclar proveedores ni episodios con series', () => {
  const previous = [{ id: 'old', url: 'https://example.com/live/u/p/123.ts' }, { id: 'episode', url: 'https://example.com/series/u/p/9.mp4' }];
  const next = [{ id: 'live:123', url: 'https://example.com/live/u/new/123.m3u8' }, { id: 'series:9', url: '' }];
  assert.deepEqual(mappedFavorites(previous, next, ['old', 'episode']).sort(), ['episode', 'live:123', 'old']);
  assert.deepEqual(mappedFavorites(previous, [{ id: 'other', url: 'https://other.example.com/live/u/p/123.m3u8' }], ['old']), ['old']);
});
test('La guía usa intervalos reales y distingue programa actual y siguiente', () => {
  const now = 10000, previous = { start: 0, stop: 5000 }, current = { start: 5000, stop: 15000, title: 'Ahora' }, next = { start: 15000, stop: 25000, title: 'Después' };
  const epg = { names: new Map(), programs: new Map([['news', [previous, current, next]]]) }, channel = { epgId: 'news' };
  assert.deepEqual(windowPrograms(epg, channel, now, 20000), [current, next]);
  assert.deepEqual(currentPrograms(epg, channel, now), { current, next });
});
