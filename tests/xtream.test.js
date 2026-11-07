import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServer, apiUrl, streamUrl, loadXtream, loadEpisodes } from '../src/xtream.js';
import { classifyM3U, migrateLegacy } from '../src/library.js';
const config = { server: 'https://example.com:8080/', username: 'user +&', password: 'secret/?!' };
test('Normaliza servidor y codifica credenciales sin alterar su contenido', () => {
  assert.equal(normalizeServer('https://example.com/sub/player_api.php?old=1'), 'https://example.com/sub');
  assert.throws(() => normalizeServer('javascript:alert(1)'), /HTTP/);
  assert.throws(() => normalizeServer('https://user:pass@example.com'), /campos/);
  const url = new URL(apiUrl(config, 'get_series_info', { series_id: '1' }));
  assert.equal(url.searchParams.get('username'), config.username);
  assert.equal(url.searchParams.get('password'), config.password);
  assert.match(streamUrl(config, 'live', 3, 'm3u8'), /user%20%2B%26\/secret%2F%3F!/);
});
test('Autenticación inválida o expirada no crea catálogo', async () => {
  await assert.rejects(loadXtream(config, async () => ({ user_info: { auth: 0 } })), /rechazó/);
  await assert.rejects(loadXtream(config, async () => ({ user_info: { auth: 1, status: 'Expired' } })), /activa/);
});
test('Carga catálogos separados y permite fallos parciales sin inventar contenido', async () => {
  const request = async address => {
    const action = new URL(address).searchParams.get('action');
    if (!action) return { user_info: { auth: 1, status: 'Active' } };
    if (action.endsWith('categories')) return [{ category_id: 7, category_name: 'Mi categoría' }];
    if (action === 'get_live_streams') return [{ stream_id: 1, name: 'TV', category_id: '7' }];
    if (action === 'get_vod_streams') return [{ stream_id: 2, name: 'Film', container_extension: 'mkv' }];
    throw new Error('Unavailable');
  };
  const { items, warnings } = await loadXtream(config, request);
  assert.deepEqual(items.map(i => i.kind), ['live', 'movie']);
  assert.equal(items[0].group, 'Mi categoría');
  assert.ok(items[0].url.endsWith('/1.m3u8'));
  assert.ok(items[1].url.endsWith('/2.mkv'));
  assert.deepEqual(warnings, ['series']);
  await assert.rejects(loadXtream(config, async address => new URL(address).searchParams.has('action') ? {} : { user_info: { auth: 1 } }), /catálogo/);
});
test('Temporadas y episodios se ordenan y descartan enlaces inseguros', async () => {
  const items = await loadEpisodes(config, 4, async () => ({ episodes: { 2: [{ id: 3, episode_num: 2, container_extension: '../bad', direct_source: 'file:///secret' }], 1: [{ id: 2, episode_num: 1, title: 'Piloto', direct_source: 'https://cdn.example.com/pilot.mp4' }] } }));
  assert.equal(items[0].name, 'Piloto');
  assert.equal(items[0].url, 'https://cdn.example.com/pilot.mp4');
  assert.ok(items[1].url.endsWith('/3.mp4'));
});
test('Clasifica listas M3U y migra biblioteca anterior conservando favoritos', () => {
  const channels = [{ id: 'https://example.com/live/1', url: 'https://example.com/live/1', name: 'TV', group: 'Noticias' }, { id: '2', url: 'https://example.com/movie/2', name: 'Film', group: 'Acción' }, { id: '3', url: 'https://example.com/3', name: 'Serie', group: 'Series' }];
  assert.deepEqual(classifyM3U(channels).map(i => i.kind), ['live', 'movie', 'series']);
  const state = migrateLegacy({ name: 'Anterior', channels, favorites: [channels[0].id] });
  assert.equal(state.accounts[0].name, 'Anterior');
  assert.deepEqual(state.favorites[state.activeId], [channels[0].id]);
});
