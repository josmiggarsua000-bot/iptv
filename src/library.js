export const sections = { live: 'TV en vivo', movie: 'Cine', series: 'Series' };
export function classifyM3U(items) {
  return items.map(item => {
    const group = item.group.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const path = new URL(item.url).pathname;
    const kind = /\/series\//i.test(path) || /\b(series|temporadas|episodios)\b/.test(group) ? 'series' : /\/movie\//i.test(path) || /\b(cine|peliculas|movies|vod)\b/.test(group) ? 'movie' : 'live';
    return { ...item, kind };
  });
}
export function migrateLegacy(saved) {
  if (!Array.isArray(saved?.channels) || !saved.channels.length) return { accounts: [], activeId: null, favorites: {} };
  const id = 'legacy-m3u';
  return { accounts: [{ id, name: saved.name || 'Mi televisión', type: 'm3u', items: classifyM3U(saved.channels), config: {} }], activeId: id, favorites: { [id]: saved.favorites || [] } };
}
