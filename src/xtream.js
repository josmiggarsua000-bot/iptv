import { httpUrl } from './playlist.js';

export function normalizeServer(value) {
  const valid = httpUrl(value.trim());
  if (!valid) throw new Error('Introduce un servidor HTTP o HTTPS válido.');
  const url = new URL(valid);
  if (url.username || url.password) throw new Error('Introduce el usuario y la contraseña en sus campos.');
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/(player_api|get)\.php\/?$/i, '').replace(/\/+$/, '');
  return url.href.replace(/\/$/, '');
}
export function apiUrl(config, action, extra = {}) {
  const url = new URL(`${normalizeServer(config.server)}/player_api.php`);
  url.search = new URLSearchParams({ username: config.username, password: config.password, ...(action ? { action } : {}), ...extra });
  return url.href;
}
export function streamUrl(config, kind, id, extension) {
  return `${normalizeServer(config.server)}/${kind}/${encodeURIComponent(config.username)}/${encodeURIComponent(config.password)}/${encodeURIComponent(String(id))}.${extension}`;
}
const extensionOf = value => /^[a-z0-9]{2,6}$/i.test(value || '') ? value : 'mp4';
export async function loadXtream(config, request) {
  const auth = await request(apiUrl(config));
  if (!['1', 1, true].includes(auth?.user_info?.auth)) throw new Error('El servidor rechazó el usuario o la contraseña.');
  const status = auth.user_info.status;
  if (status && String(status).toLowerCase() !== 'active') throw new Error('La cuenta no está activa. Comprueba su estado con tu proveedor.');
  const kinds = [['live', 'get_live_streams', 'get_live_categories'], ['movie', 'get_vod_streams', 'get_vod_categories'], ['series', 'get_series', 'get_series_categories']];
  const catalogs = await Promise.all(kinds.map(async ([kind, action, categories]) => {
    const [streams, groups] = await Promise.allSettled([request(apiUrl(config, action)), request(apiUrl(config, categories))]);
    if (streams.status !== 'fulfilled' || !Array.isArray(streams.value)) return { kind, error: true, items: [] };
    const groupMap = new Map((groups.status === 'fulfilled' && Array.isArray(groups.value) ? groups.value : []).map(g => [String(g.category_id), g.category_name]));
    return { kind, items: streams.value.filter(s => s.stream_id != null || s.series_id != null).map(s => {
      const streamId = s.series_id ?? s.stream_id;
      return {
        id: `${kind}:${streamId}`, streamId, kind, epgId: String(s.epg_channel_id || ''),
        name: String(s.name || 'Sin título'), group: String(groupMap.get(String(s.category_id)) || 'Sin categoría'),
        logo: httpUrl(s.stream_icon || s.cover) || '',
        url: kind === 'series' ? '' : streamUrl(config, kind === 'live' ? 'live' : 'movie', streamId, kind === 'live' ? 'm3u8' : extensionOf(s.container_extension))
      };
    }) };
  }));
  if (catalogs.every(c => c.error)) throw new Error('No se pudo cargar el catálogo del proveedor.');
  const expires = Number(auth.user_info.exp_date);
  const accountInfo = { expiresAt: expires > 0 && Number.isFinite(new Date(expires * 1000).getTime()) ? expires * 1000 : null, status: String(auth.user_info.status || ''), maxConnections: Number(auth.user_info.max_connections) || null };
  return { items: catalogs.flatMap(c => c.items), warnings: catalogs.filter(c => c.error).map(c => c.kind), accountInfo };
}
export async function loadEpisodes(config, seriesId, request) {
  const data = await request(apiUrl(config, 'get_series_info', { series_id: String(seriesId) }));
  if (!data?.episodes || typeof data.episodes !== 'object') throw new Error('El proveedor no devolvió los episodios de esta serie.');
  const image = (...values) => values.map(value => httpUrl(value)).find(Boolean) || '';
  const seasonCovers = new Map((Array.isArray(data.seasons) ? data.seasons : []).map(season => [String(season.season_number), image(season.cover_big, season.cover, season.cover_tmdb)]));
  return Object.entries(data.episodes).flatMap(([season, episodes]) => (Array.isArray(episodes) ? episodes : []).filter(e => e.id != null).map(e => ({
    id: `episode:${e.id}`, kind: 'episode', season: String(season), number: Number(e.episode_num) || 0,
    name: String(e.title || `Episodio ${e.episode_num || e.id}`), group: `Temporada ${season}`,
    url: httpUrl(e.direct_source) || streamUrl(config, 'series', e.id, extensionOf(e.container_extension)),
    logo: image(e.info?.movie_image, e.info?.cover_big, e.info?.cover, e.cover_big, e.cover, e.stream_icon), seasonLogo: seasonCovers.get(String(season)) || ''
  }))).sort((a, b) => Number(a.season) - Number(b.season) || a.number - b.number);
}
