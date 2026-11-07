export function xmltvTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?$/.exec(value || '');
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const offset = m[7] ? (m[7] === '+' ? 1 : -1) * (+m[8] * 60 + +m[9]) * 60000 : 0;
  return utc - offset;
}
export const normalizeName = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export function parseXmltv(text, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('El XMLTV contiene declaraciones no compatibles.');
  const xml = new DOMParser().parseFromString(text, 'application/xml');
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
