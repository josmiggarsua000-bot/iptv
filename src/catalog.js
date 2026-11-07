import { httpUrl } from './playlist.js';
export function xtreamConfigFromM3U(account) {
  if (account?.type !== 'm3u') return null;
  if (httpUrl(account.config.url)) {
    const source = new URL(account.config.url);
    const username = source.searchParams.get('username'), password = source.searchParams.get('password');
    if (username && password && /\/get\.php$/i.test(source.pathname)) {
      source.pathname = source.pathname.replace(/\/get\.php$/i, ''); source.search = ''; source.hash = '';
      return { server: source.href.replace(/\/$/, ''), username, password };
    }
  }
  for (const item of account.items) {
    const key = streamIdentity(item.url);
    if (!key) continue;
    const source = new URL(item.url), parts = source.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex(p => ['live', 'movie', 'series'].includes(p));
    const offset = marker < 0 ? 0 : marker + 1;
    try {
      const username = decodeURIComponent(parts[offset]), password = decodeURIComponent(parts[offset + 1]);
      source.pathname = marker < 0 ? '' : '/' + parts.slice(0, marker).join('/'); source.search = ''; source.hash = '';
      return { server: source.href.replace(/\/$/, ''), username, password };
    } catch { /* Invalid escaped credentials are not inferred. */ }
  }
  return null;
}
export function streamIdentity(address) {
  if (!httpUrl(address)) return null;
  const url = new URL(address), parts = url.pathname.split('/').filter(Boolean);
  const marker = parts.findIndex(p => ['live', 'movie', 'series'].includes(p));
  const offset = marker < 0 ? (parts.length === 3 ? 0 : -1) : marker + 1;
  if (offset < 0 || parts.length !== offset + 3) return null;
  const id = /^(\d+)(?:\.[\w]+)?$/.exec(parts[offset + 2]); if (!id) return null;
  const kind = marker < 0 ? 'live' : parts[marker] === 'series' ? 'episode' : parts[marker];
  return `${url.origin}/${marker < 0 ? '' : parts.slice(0, marker).join('/')}/${kind}:${id[1]}`;
}
export function mappedFavorites(previous, next, favoriteIds) {
  const result = new Set(favoriteIds);
  const targets = new Map(next.map(item => [streamIdentity(item.url), item.id]).filter(([key]) => key));
  for (const item of previous) if (result.has(item.id)) {
    const id = targets.get(streamIdentity(item.url)); if (id) result.add(id);
  }
  return [...result];
}
export function catalogCounts(items) {
  return { live: items.filter(i => i.kind === 'live').length, movie: items.filter(i => i.kind === 'movie').length, series: items.filter(i => i.kind === 'series').length };
}
