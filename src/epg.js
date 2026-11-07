import { httpUrl } from './playlist.js';
export function xmltvTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?$/.exec(value || '');
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const offset = m[7] ? (m[7] === '+' ? 1 : -1) * (+m[8] * 60 + +m[9]) * 60000 : 0;
  return utc - offset;
}
export const normalizeName = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export function safeXmltv(text) {
  // XMLTV providers commonly include an external xmltv.dtd. Remove that
  // declaration before parsing: the guide needs no external DTD or entities.
  const allowed = /^<!DOCTYPE\s+tv(?:\s+SYSTEM\s+(?:"[^"]*"|'[^']*')|\s+PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*'))?\s*>$/i;
  const clean = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE(?:[^>"'\[]|"[^"]*"|'[^']*')*>/gi, token => /^<!DOCTYPE/i.test(token) && allowed.test(token) ? '' : token);
  const declarations = clean.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(declarations)) throw new Error('La guía XMLTV contiene entidades o una declaración interna no compatible.');
  return clean;
}
export function parseXmltv(text, now = Date.now()) {
  const xml = new DOMParser().parseFromString(safeXmltv(text), 'application/xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'tv') throw new Error('El archivo no es una guía XMLTV válida.');
  const names = new Map(), programs = new Map();
  for (const channel of xml.querySelectorAll('tv > channel')) {
    const id = channel.getAttribute('id');
    for (const name of channel.querySelectorAll('display-name')) names.set(normalizeName(name.textContent), id);
  }
  for (const programme of xml.querySelectorAll('tv > programme')) {
    const id = programme.getAttribute('channel'), start = xmltvTime(programme.getAttribute('start'));
    const stop = xmltvTime(programme.getAttribute('stop')) || start + 3600000;
    if (!Number.isFinite(start) || stop < now - 6 * 3600000 || start > now + 48 * 3600000) continue;
    if (!programs.has(id)) programs.set(id, []);
    programs.get(id).push({ start, stop, title: programme.querySelector('title')?.textContent || 'Sin título', description: programme.querySelector('desc')?.textContent || '' });
  }
  for (const list of programs.values()) list.sort((a, b) => a.start - b.start);
  return { names, programs, loadedAt: now };
}
export function channelPrograms(epg, channel, now = Date.now()) {
  if (!epg) return [];
  const id = epg.programs.has(channel.epgId) ? channel.epgId : epg.names.get(normalizeName(channel.name));
  return (epg.programs.get(id) || []).filter(p => p.stop > now).slice(0, 3);
}
export function xtreamEpgUrl(config) {
  const url = new URL(config.server.replace(/\/$/, '') + '/xmltv.php');
  url.search = new URLSearchParams({ username: config.username, password: config.password });
  return url.href;
}

const discoveryCache = new WeakMap();
export function discoverEpgUrl(account) {
  if (!account) return '';
  if (discoveryCache.has(account)) return discoveryCache.get(account);
  const address = inferEpgUrl(account);
  discoveryCache.set(account, address);
  return address;
}
function inferEpgUrl(account) {
  if (!account) return '';
  const config = account.config;
  if (account.type === 'xtream' && config.server && config.username && config.password) return httpUrl(xtreamEpgUrl(config)) || '';
  if (httpUrl(config.detectedEpgUrl)) return httpUrl(config.detectedEpgUrl);
  if (httpUrl(config.url)) {
    const source = new URL(config.url);
    const username = source.searchParams.get('username'), password = source.searchParams.get('password');
    if (username && password) {
      const guide = new URL('xmltv.php', source);
      guide.search = new URLSearchParams({ username, password }); guide.hash = '';
      return guide.href;
    }
  }
  // Local M3U files can still contain standard Xtream stream paths.
  for (const item of account.items) {
    if (!httpUrl(item.url)) continue;
    const source = new URL(item.url), parts = source.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex(p => ['live', 'movie', 'series'].includes(p));
    const offset = marker >= 0 ? marker + 1 : parts.length === 3 ? 0 : -1;
    if (offset < 0 || parts.length !== offset + 3 || !/^\d+(?:\.[a-z0-9]+)?$/i.test(parts[offset + 2])) continue;
    try {
      const username = decodeURIComponent(parts[offset]), password = decodeURIComponent(parts[offset + 1]);
      source.pathname = '/' + [...parts.slice(0, marker >= 0 ? marker : 0), 'xmltv.php'].join('/');
      source.search = new URLSearchParams({ username, password }); source.hash = '';
      return source.href;
    } catch { /* Ignore malformed percent escapes and try another item. */ }
  }
  return '';
}
export function epgMode(account) {
  return account?.config.epgMode || (account?.config.epgUrl ? 'manual' : 'auto');
}
export function resolveEpgUrl(account) {
  const mode = epgMode(account);
  return mode === 'off' ? '' : mode === 'manual' ? httpUrl(account.config.epgUrl) || '' : discoverEpgUrl(account);
}
export function windowPrograms(epg, channel, start, end) {
  if (!epg) return [];
  const id = epg.programs.has(channel.epgId) ? channel.epgId : epg.names.get(normalizeName(channel.name));
  return (epg.programs.get(id) || []).filter(p => p.start < end && p.stop > start && p.stop > p.start);
}
export function currentPrograms(epg, channel, now = Date.now()) {
  const list = windowPrograms(epg, channel, now, now + 48 * 3600000);
  return { current: list.find(p => p.start <= now && p.stop > now) || null, next: list.find(p => p.start > now) || null };
}
