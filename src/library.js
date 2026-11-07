export const sections = { live: 'TV en vivo', movie: 'Cine', series: 'Series' };
export function classifyM3U(items) {
  return items.map(item => {
    const group = item.group.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const path = new URL(item.url).pathname;
    // Stream paths identify the content more reliably than marketing categories
    // such as CINE PREMIUM, which frequently contain live TV channels.
    const kind = /\/live\//i.test(path) || /^\/[^/]+\/[^/]+\/\d+(?:\.(?:ts|m3u8))?$/i.test(path) ? 'live'
      : /\/movie\//i.test(path) ? 'movie' : /\/series\//i.test(path) ? 'series'
      : /\b(series|temporadas|episodios)\b/.test(group) || /\bS\d{1,3}[ ._-]*E\d{1,4}\b/i.test(item.name) ? 'series'
      : /\b(cine|peliculas|movies|vod)\b/.test(group) ? 'movie' : 'live';
    return { ...item, kind };
  });
}
export function migrateLegacy(saved) {
  if (!Array.isArray(saved?.channels) || !saved.channels.length) return { accounts: [], activeId: null, favorites: {} };
  const id = 'legacy-m3u';
  return { accounts: [{ id, name: saved.name || 'Mi televisión', type: 'm3u', items: classifyM3U(saved.channels), config: {} }], activeId: id, favorites: { [id]: saved.favorites || [] } };
}
