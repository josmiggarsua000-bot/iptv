export function httpUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

// Split EXTINF at the first comma outside quoted attributes.
function splitInfo(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ',' && !quoted) return [line.slice(0, i), line.slice(i + 1).trim()];
  }
  return [line, ''];
}

export function parseM3U(text, base) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim());
  if (!lines[0]?.startsWith('#EXTM3U')) throw new Error('El archivo no es una lista M3U válida (falta #EXTM3U).');
  const channels = [], seen = new Set();
  let info = null, group = '';
  for (const line of lines.slice(1)) {
    if (line.startsWith('#EXTINF:')) {
      const [attributes, title] = splitInfo(line);
      const attrs = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      info = { name: title || attrs['tvg-name'] || 'Canal sin nombre', group: attrs['group-title'] || '', logo: httpUrl(attrs['tvg-logo']) || '', epgId: attrs['tvg-id'] || '' };
      group = '';
    } else if (line.startsWith('#EXTGRP:')) group = line.slice(8).trim();
    else if (line && !line.startsWith('#')) {
      const url = httpUrl(line, base);
      if (url && !seen.has(url)) {
        channels.push({ id: url, url, name: info?.name || `Canal ${channels.length + 1}`, group: info?.group || group || 'Sin categoría', logo: info?.logo || '', epgId: info?.epgId || '' });
        seen.add(url);
      }
      info = null;
      group = '';
    }
  }
  if (!channels.length) throw new Error('La lista no contiene canales con enlaces HTTP o HTTPS compatibles.');
  return channels;
}

export function filterChannels(channels, { search = '', group = '', favorites = null } = {}) {
  const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const term = normalize(search.trim());
  return channels.filter(channel => (!group || channel.group === group) && (!favorites || favorites.has(channel.id)) && normalize(channel.name).includes(term));
}

export function playlistEpgUrl(text, base) {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const match = /(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(header);
  for (const value of (match?.[1] || '').split(',')) {
    const url = value.trim() && httpUrl(value.trim(), base);
    if (url) return url;
  }
  return '';
}
