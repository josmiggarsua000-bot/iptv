import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, filterChannels, httpUrl } from '../src/playlist.js';

test('Lee atributos, comas entre comillas, BOM y grupos', () => {
  const [channel] = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 tvg-name="Noticias" group-title="Actualidad, mundo" tvg-logo="https://example.com/logo.png",Noticias, en vivo\r\nhttps://example.com/live.m3u8');
  assert.equal(channel.name, 'Noticias, en vivo');
  assert.equal(channel.group, 'Actualidad, mundo');
  assert.equal(channel.logo, 'https://example.com/logo.png');
});
test('Resuelve rutas relativas, EXTGRP y elimina duplicados', () => {
  const channels = parseM3U('#EXTM3U\n#EXTINF:-1,Uno\n#EXTGRP:Cultura\n../live.m3u8\nhttps://example.com/live.m3u8\nhttps://example.com/two.mp4', 'https://example.com/lists/index.m3u');
  assert.equal(channels.length, 2);
  assert.equal(channels[0].group, 'Cultura');
  assert.equal(channels[1].name, 'Canal 2');
});
test('Rechaza archivos inválidos, vacíos y protocolos ejecutables', () => {
  assert.throws(() => parseM3U('<html>Error</html>'), /válida/);
  assert.throws(() => parseM3U('#EXTM3U\n#EXTINF:-1,Malicioso\njavascript:alert(1)'), /compatibles/);
  assert.equal(httpUrl('file:///etc/passwd'), null);
  assert.equal(httpUrl('https://example.com'), 'https://example.com/');
});
test('Filtra por acentos, favoritos y categoría a la vez', () => {
  const channels = parseM3U('#EXTM3U\n#EXTINF:-1 group-title="Música",Música Uno\nhttps://example.com/a\n#EXTINF:-1 group-title="Noticias",Noticias\nhttps://example.com/b');
  assert.deepEqual(filterChannels(channels, { search: 'MUSICA', group: 'Música', favorites: new Set([channels[0].id]) }), [channels[0]]);
  assert.deepEqual(filterChannels(channels, { favorites: new Set() }), []);
});
