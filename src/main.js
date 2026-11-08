import { createPlayer } from './player.js';
import { setupEpg } from './epg-ui.js';
import { resolveEpgUrl, epgMode } from './epg.js';
import { setupMultiscreen } from './multiscreen.js';
import { parseM3U, playlistEpgUrl, filterChannels, httpUrl } from './playlist.js';
import { xtreamConfigFromM3U, mappedFavorites, catalogCounts } from './catalog.js';
import { classifyM3U, sections } from './library.js';
import { loadXtream, loadEpisodes, normalizeServer } from './xtream.js';
import { requestText, requestJson, friendlyError } from './network.js';
import { readState, writeState } from './storage.js';
import './style.css';
import './arcade.css';

const $ = selector => document.querySelector(selector);
let state = { accounts: [], activeId: null, favorites: {} };
let sessionAccountId = null;
let view = 'home', group = '', limit = 120, accountType = null, busy = false, storageFailed = false;
let playbackQueue = [], seriesItem = null;
let current = null, player = null, playbackVersion = 0, episodeVersion = 0, episodes = [], deleteId = null, editingId = null;
const video = $('#video'), dialog = $('#account-dialog');
const account = () => state.accounts.find(a => a.id === sessionAccountId);
const epg = setupEpg({ getAccount: account, updateConfig, getCategory: () => group, getPlaying: () => current?.kind === 'live' ? current : null, play: item => { setView('live'); playItem(item); } });
const multiscreen = setupMultiscreen(account);
const favorites = () => new Set(state.favorites[sessionAccountId] || []);
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
function notify(message) { for (const id of ['notice', 'picker-notice']) { $(`#${id}`).textContent = message; $(`#${id}`).hidden = !message; } }
async function commit(next) {
  if (storageFailed) throw new Error('No se pudieron abrir tus datos. Reinicia la aplicación antes de guardar cambios.');
  await writeState(next); state = next;
}
function resetFilters() { group = ''; limit = 120; $('#search').value = ''; }
function setView(next) {
  if (!account()) return;
  if (view !== next || seriesItem) { stopPlayback(); multiscreen.stopAll(); clearSeries(); }
  view = next; resetFilters(); render(); if (view === 'epg') epg.load(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function openAccount(existing = null) {
  if (busy) return;
  if (storageFailed) { notify('No se pudieron abrir tus cuentas guardadas. Reinicia la aplicación para evitar sobrescribirlas.'); return; }
  $('#account-form').reset(); accountType = null; editingId = existing?.id || null;
  $('#account-dialog-title').textContent = editingId ? 'Editar cuenta' : 'Agregar cuenta';
  $('#account-submit').textContent = editingId ? 'Guardar cambios →' : 'Conectar cuenta →';
  $('#use-xtream').hidden = !editingId || !xtreamConfigFromM3U(existing);
  $('#edit-note').hidden = !editingId;
  $('#edit-note').textContent = existing?.type === 'm3u' ? 'M3U puede contar cada episodio por separado. Si el enlace incluye credenciales, Usar catálogo completo de Xtream permite cargar películas y series agrupadas. Guarda para confirmar el cambio de fuente; se conserva la cuenta anterior si la conexión falla. Los favoritos de TV/cine se relacionan cuando se identifican; un episodio M3U no equivale a una serie Xtream.' : 'Puedes cambiar el nombre o los datos de conexión. Los cambios de servidor o credenciales se validan antes de guardar.';
  $('#account-fields').hidden = true; $('#account-submit').disabled = true; $('#account-error').textContent = '';
  $('#file-name').textContent = 'Ningún archivo seleccionado';
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  dialog.showModal();
  if (existing) {
    const type = existing.type === 'xtream' ? 'xtream' : existing.config.url ? 'm3u-url' : 'm3u-file';
    document.querySelector(`[data-type="${type}"]`).click();
    $('#account-name').value = existing.name;
    $('#server-url').value = existing.config.server || '';
    $('#username').value = existing.config.username || '';
    $('#password').value = existing.config.password || '';
    $('#playlist-url').value = existing.config.url || '';
  }
}
$('#use-xtream').onclick = () => {
  const original = state.accounts.find(a => a.id === editingId), config = xtreamConfigFromM3U(original);
  if (!config) return;
  document.querySelector('[data-type="xtream"]').click();
  $('#server-url').value = config.server; $('#username').value = config.username; $('#password').value = config.password;
};
for (const id of ['picker-add', 'empty-add']) $(`#${id}`).onclick = () => openAccount();
for (const id of ['close-dialog', 'cancel-account']) $(`#${id}`).onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
for (const button of document.querySelectorAll('[data-type]')) button.onclick = () => {
  if (busy) return;
  accountType = button.dataset.type;
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('#account-fields').hidden = false; $('#xtream-fields').hidden = accountType !== 'xtream'; $('#m3u-fields').hidden = accountType === 'xtream';
  $('#m3u-url-field').hidden = accountType !== 'm3u-url'; $('#m3u-file-field').hidden = accountType !== 'm3u-file';
  $('#account-submit').disabled = false;
  $('#server-url').required = accountType === 'xtream'; $('#username').required = accountType === 'xtream'; $('#password').required = accountType === 'xtream';
  $('#playlist-url').disabled = accountType !== 'm3u-url';
  $('#playlist-file').disabled = accountType !== 'm3u-file';
  for (const id of ['server-url', 'username', 'password']) $(`#${id}`).disabled = accountType !== 'xtream';
  $('#storage-note').textContent = window.desktop?.saveState ? 'Las cuentas se guardan cifradas en este equipo con la protección de Windows.' : 'Modo navegador: las cuentas y contraseñas se guardan en este navegador sin cifrado. Usa la aplicación de Windows si necesitas almacenamiento protegido.';
  $('#account-name').focus();
};
$('#playlist-file').onchange = () => { $('#file-name').textContent = $('#playlist-file').files[0]?.name || 'Ningún archivo seleccionado'; if ($('#playlist-file').files.length) $('#playlist-url').value = ''; };
$('#playlist-url').oninput = () => { if ($('#playlist-url').value) { $('#playlist-file').value = ''; $('#file-name').textContent = 'Ningún archivo seleccionado'; } };
$('#account-form').onsubmit = async event => {
  event.preventDefault(); if (busy || !accountType) return;
  busy = true; $('#account-submit').disabled = true; $('#account-submit').textContent = 'Conectando…'; $('#account-error').textContent = '';
  try {
    const previous = state.accounts.find(a => a.id === editingId);
    const type = accountType === 'xtream' ? 'xtream' : 'm3u';
    let items, config = { ...(previous?.config || {}) }, accountInfo = previous?.accountInfo || null, warnings = [], changed = !previous || previous.type !== type;
    if (type === 'xtream') {
      Object.assign(config, { server: normalizeServer($('#server-url').value), username: $('#username').value.trim(), password: $('#password').value });
      if (!config.username || !config.password) throw new Error('Completa el usuario y la contraseña.');
      changed ||= ['server', 'username', 'password'].some(key => config[key] !== previous?.config[key]);
      if (changed) ({ items, warnings, accountInfo } = await loadXtream(config, requestJson));
      else items = previous.items;
    } else {
      const file = accountType === 'm3u-file' ? $('#playlist-file').files[0] : null, url = accountType === 'm3u-url' ? $('#playlist-url').value.trim() : '';
      changed ||= !!file || url !== (previous?.config.url || '');
      if (!changed && previous) items = classifyM3U(previous.items);
      else {
        if (!file && !url) throw new Error('Selecciona un archivo o introduce el enlace M3U.');
        if (url && !httpUrl(url)) throw new Error('Usa un enlace HTTP o HTTPS válido.');
        if (file?.size > 64 * 1024 * 1024) throw new Error('El archivo supera el límite de 64 MB.');
        const source = file ? { text: await file.text() } : await requestText(url);
        items = classifyM3U(parseM3U(source.text, source.url));
        config.detectedEpgUrl = playlistEpgUrl(source.text, source.url); accountInfo = null;
      }
      config.url = url;
    }
    const added = { ...(previous || {}), id: previous?.id || crypto.randomUUID(), name: $('#account-name').value.trim() || previous?.name || (type === 'xtream' ? 'Mi cuenta Xtream' : $('#playlist-file').files[0]?.name || 'Mi lista M3U'), type, config, accountInfo, items, updatedAt: changed ? Date.now() : previous.updatedAt };
    const nextAccounts = previous ? state.accounts.map(a => a.id === previous.id ? added : a) : [...state.accounts, added];
    const nextFavorites = { ...state.favorites };
    if (previous) nextFavorites[added.id] = mappedFavorites(previous.items, items, state.favorites[added.id] || []);
    await commit({ ...state, accounts: nextAccounts, favorites: nextFavorites, activeId: added.id });
    stopPlayback(); multiscreen.stopAll(); epg.reset(); sessionAccountId = previous ? null : added.id; view = 'home'; resetFilters(); dialog.close();
    $('#account-form').reset();
    notify(warnings.length ? `Cuenta guardada. No se pudo cargar: ${warnings.map(k => sections[k]).join(', ')}. Puedes actualizarla más tarde.` : previous ? 'Cuenta actualizada.' : 'Cuenta conectada.');
    render();
  } catch (error) { $('#account-error').textContent = friendlyError(error); }
  finally { busy = false; $('#account-submit').disabled = false; $('#account-submit').textContent = editingId ? 'Guardar cambios →' : 'Conectar cuenta →'; render(); }
};
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => setView(button.dataset.view);
for (const button of document.querySelectorAll('[data-open]')) button.onclick = () => { if (!account()) openAccount(); else setView(button.dataset.open); };
$('.brand').onclick = event => { event.preventDefault(); setView('home'); };
async function enterAccount(id) {
  if (busy || !state.accounts.some(a => a.id === id)) return;
  busy = true;
  try {
    await commit({ ...state, activeId: id });
    stopPlayback(); multiscreen.stopAll(); epg.reset(); sessionAccountId = id; view = 'home'; episodeVersion++; clearSeries(); resetFilters(); notify(''); render(); window.scrollTo(0, 0);
  } catch (error) { notify(friendlyError(error)); render(); }
  finally { busy = false; render(); }
  const selected = account();
  if (selected?.id === id && selected.config.refreshOnEntry !== false && (selected.type === 'xtream' || selected.config.url)) await refreshAccount(id);
}
$('#change-account').onclick = () => {
  if (busy) return;
  stopPlayback(); multiscreen.stopAll(); epg.reset(); sessionAccountId = null; episodeVersion++; clearSeries(); resetFilters(); notify(''); render(); window.scrollTo(0, 0);
};
$('#search').oninput = () => { limit = 120; renderItems(); };
$('#clear-category').onclick = () => { group = ''; render(); };
$('#load-more').onclick = () => { limit += 120; renderItems(); };
function sectionItems() { const selected = favorites(); return (account()?.items || []).filter(item => view === 'favorites' ? selected.has(item.id) : item.kind === (view === 'epg' ? 'live' : view)); }
function render() {
  const active = account();
  $('.app').classList.toggle('is-home', view === 'home');
  $('#portal-epg').textContent = !resolveEpgUrl(active) ? 'EPG opcional · Configurar' : epgMode(active) === 'auto' ? 'Buscar EPG automáticamente' : 'Guía configurada';
  $('.app').hidden = !active; $('#account-picker').hidden = !!active;
  $('#picker-title').textContent = state.accounts.length ? '¿Qué cuenta vas a usar?' : 'Tu universo empieza aquí.';
  $('#picker-description').textContent = state.accounts.length ? 'Selecciona una cuenta guardada o agrega una nueva.' : 'Agrega tu primera cuenta para comenzar.';
  $('#active-account-name').textContent = active?.name || '';
  $('#refresh-account').disabled = busy || !active;
  const remote = active?.type === 'xtream' || !!active?.config.url;
  $('#auto-refresh').disabled = !remote; $('#auto-refresh').checked = !!remote && active?.config.refreshOnEntry !== false;
  $('#auto-refresh').title = remote ? 'Actualizar catálogo al seleccionar esta cuenta' : 'Los archivos locales se actualizan con Refresh, seleccionando el archivo de nuevo';
  $('#multi-limit').textContent = `Elige un canal por pantalla. Solo una pantalla tendrá sonido. ${active?.accountInfo?.maxConnections ? `Tu proveedor informa un límite de ${active.accountInfo.maxConnections} conexiones para esta cuenta.` : 'El proveedor debe permitir hasta 4 conexiones simultáneas.'}`;
  const expires = active?.accountInfo?.expiresAt;
  $('#account-expiration').textContent = expires ? `Vencimiento: ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(expires)}${expires < Date.now() ? ' · VENCIDA' : ''}` : 'Vencimiento: No informado por el proveedor';
  $('#account-expiration').classList.toggle('expired', !!expires && expires < Date.now());
  $('#account-updated').textContent = active?.updatedAt ? `Lista actualizada: ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(active.updatedAt)}` : '';
  $('#home-view').hidden = view !== 'home'; $('#library-view').hidden = !['live', 'movie', 'series', 'favorites'].includes(view);
  $('#epg-view').hidden = view !== 'epg'; $('#multiscreen-view').hidden = view !== 'multi';
  $('#page-label').textContent = view === 'home' ? 'INICIO' : view === 'favorites' ? 'FAVORITOS' : ({ epg: 'GUÍA EPG', multi: 'MULTISCREEN', ...sections }[view] || '').toUpperCase();
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  for (const kind of Object.keys(sections)) {
    const count = (active?.items || []).filter(i => i.kind === kind).length;
    $(`#count-${kind}`).textContent = count;
    $(`#portal-${kind}`).textContent = `${count} ${kind === 'live' ? (count === 1 ? 'canal' : 'canales') : kind === 'movie' ? (count === 1 ? 'película' : 'películas') : (active?.type === 'm3u' ? 'entradas de series' : count === 1 ? 'serie' : 'series')}`;
  }
  const favoriteIds = favorites();
  $('#count-favorites').textContent = (active?.items || []).filter(i => favoriteIds.has(i.id)).length;
  $('#catalog-note').hidden = active?.type !== 'm3u';
  $('#catalog-note').textContent = 'En M3U se cuentan entradas y episodios por separado; no equivale al número de series agrupadas de Xtream. Si faltan categorías, puedes cargar el catálogo Xtream desde Editar cuenta cuando la lista incluya credenciales.';
  $('#home-account').textContent = active ? `${active.name} / ${active.type === 'xtream' ? 'XTREAM CODES' : 'M3U'}` : 'Agrega una cuenta para empezar';
  renderAccounts();
  $('#categories').replaceChildren();
  $('.category-label').hidden = !['live', 'movie', 'series', 'favorites', 'epg'].includes(view);
  const groups = new Map(); sectionItems().forEach(i => groups.set(i.group, (groups.get(i.group) || 0) + 1));
  if (groups.size) { const all = node('button', `category${!group ? ' active' : ''}`); all.textContent = 'Todas las categorías'; all.onclick = () => { group = ''; limit = 120; render(); }; $('#categories').append(all); }
  for (const [name, count] of groups) {
    const button = node('button', `category${group === name ? ' active' : ''}`);
    button.append(node('span', '', name), node('b', '', count)); button.onclick = () => { group = name; limit = 120; render(); };
    $('#categories').append(button);
  }
  $('#view-title').textContent = seriesItem ? seriesItem.name : view === 'favorites' ? 'Favoritos' : sections[view] || 'Inicio';
  $('#list-name').textContent = active?.name || 'Sin cuenta conectada';
  renderItems();
  if (view === 'epg') epg.render();
}
function renderAccounts() {
  $('#accounts-list').replaceChildren();
  if (!state.accounts.length) return;
  for (const a of state.accounts) {
    const row = node('div', 'account-row');
    const counts = catalogCounts(a.items);
    const avatar = node('span', 'account-avatar', ''); avatar.setAttribute('aria-hidden', 'true');
    const info = node('div', 'account-info'); info.append(node('strong', '', a.name), node('small', '', `${a.type === 'xtream' ? 'XTREAM CODES' : 'M3U'} · ${a.items.length} ${a.type === 'm3u' ? 'entradas' : 'elementos'}`), node('small', 'account-counts', `${counts.live} ${counts.live === 1 ? 'canal' : 'canales'} · ${counts.movie} ${counts.movie === 1 ? 'película' : 'películas'} · ${counts.series} ${a.type === 'm3u' ? (counts.series === 1 ? 'entrada de serie' : 'entradas de series') : (counts.series === 1 ? 'serie' : 'series')}`));
    const edit = node('button', 'secondary', 'Editar'); edit.setAttribute('aria-label', `Editar cuenta ${a.name}`); edit.onclick = () => openAccount(a);
    const select = node('button', 'primary account-enter', 'Entrar →'); select.setAttribute('aria-label', `Entrar a ${a.name}`); select.onclick = () => enterAccount(a.id);
    const refresh = node('button', 'text-button', 'Actualizar'); refresh.disabled = a.type === 'm3u' && !a.config.url; refresh.title = refresh.disabled ? 'Vuelve a agregar el archivo local para actualizarlo.' : 'Actualizar catálogo'; refresh.onclick = () => refreshAccount(a.id);
    const remove = node('button', 'icon-button', '×'); remove.setAttribute('aria-label', `Eliminar cuenta ${a.name}`); remove.onclick = () => { deleteId = a.id; $('#delete-error').textContent = ''; $('#delete-dialog').showModal(); };
    const actions = node('div', 'account-actions'); actions.append(select, edit, refresh, remove); row.append(avatar, info, actions); $('#accounts-list').append(row);
  }
}
async function refreshAccount(id) {
  if (busy) return; busy = true; notify('Actualizando el catálogo…');
  try {
    const a = state.accounts.find(a => a.id === id); let items, warnings = [], accountInfo = a.accountInfo, detectedEpgUrl = a.config.detectedEpgUrl;
    if (a.type === 'm3u' && !a.config.url) { notify('Selecciona el archivo M3U actualizado. Si cancelas, se conserva la lista actual.'); $('#local-refresh-file').click(); return; }
    if (a.type === 'xtream') ({ items, warnings, accountInfo } = await loadXtream(a.config, requestJson));
    else { const source = await requestText(a.config.url); items = classifyM3U(parseM3U(source.text, source.url)); detectedEpgUrl = playlistEpgUrl(source.text, source.url); }
    // Keep existing sections when the provider temporarily fails to return them.
    if (warnings.length) items.push(...a.items.filter(i => warnings.includes(i.kind)));
    await commit({ ...state, accounts: state.accounts.map(old => old.id === id ? { ...a, config: { ...a.config, detectedEpgUrl }, items, accountInfo, updatedAt: Date.now() } : old) });
    notify(warnings.length ? `Actualización parcial. Se conservó el catálogo anterior de: ${warnings.map(k => sections[k]).join(', ')}.` : 'Catálogo actualizado.'); render();
  } catch (error) { notify(`No se pudo actualizar. Se conserva tu catálogo anterior. ${friendlyError(error)}`); } finally { busy = false; render(); }
}
$('#cancel-delete').onclick = () => $('#delete-dialog').close();
$('#confirm-delete').onclick = async () => {
  if (busy) return; busy = true;
  try {
    const accounts = state.accounts.filter(a => a.id !== deleteId), nextFavorites = { ...state.favorites }; delete nextFavorites[deleteId];
    await commit({ ...state, accounts, activeId: state.activeId === deleteId ? accounts[0]?.id || null : state.activeId, favorites: nextFavorites });
    stopPlayback(); multiscreen.stopAll(); epg.reset(); sessionAccountId = null; resetFilters(); $('#delete-dialog').close(); render();
  } catch (error) { $('#delete-error').textContent = friendlyError(error); } finally { busy = false; }
};
function renderItems() {
  const filtered = filterChannels(sectionItems(), { search: $('#search').value, group });
  $('#visible-count').textContent = `${filtered.length} ${view === 'live' ? 'canales' : 'títulos'}${group ? ` / ${group}` : ''}`;
  $('#clear-category').hidden = !group;
  $('#channels').replaceChildren();
  for (const item of filtered.slice(0, limit)) {
    const card = node('article', `content-card ${item.kind}${current?.id === item.id ? ' selected' : ''}`);
    const play = node('button', 'content-play'); play.setAttribute('aria-label', `${item.kind === 'series' ? 'Ver episodios de' : 'Reproducir'} ${item.name}`);
    const art = node('span', 'content-art'); art.append(node('span', 'art-initials', item.name.slice(0, 2).toUpperCase()), node('span', 'art-play', item.kind === 'series' && !item.url ? '≡' : '▷'));
    if (httpUrl(item.logo)) { const img = node('img'); img.src = item.logo; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); art.prepend(img); }
    play.append(art, node('strong', '', item.name), node('span', 'content-group', item.group));
    play.onclick = () => item.kind === 'series' ? openSeries(item) : playItem(item);
    const star = node('button', 'favorite', favorites().has(item.id) ? '★' : '☆'); star.setAttribute('aria-label', `Favorito: ${item.name}`); star.setAttribute('aria-pressed', String(favorites().has(item.id)));
    star.onclick = async () => {
      if (busy) return; busy = true;
      const next = favorites(); next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      try { await commit({ ...state, favorites: { ...state.favorites, [sessionAccountId]: [...next] } }); render(); }
      catch (error) { notify(friendlyError(error)); } finally { busy = false; }
    };
    card.append(play, star); $('#channels').append(card);
  }
  $('#empty').hidden = filtered.length > 0; $('#load-more').hidden = filtered.length <= limit;
  $('#empty-add').hidden = !!account();
  $('#empty h2').textContent = !account() ? 'Tu universo está por comenzar' : view === 'favorites' ? 'Aquí van tus imprescindibles' : 'No hay títulos para mostrar';
  $('#empty p').textContent = !account() ? 'Agrega una cuenta para explorar tu contenido.' : $('#search').value || group ? 'Prueba otra búsqueda o categoría.' : view === 'favorites' ? 'Pulsa la estrella de un título para guardarlo.' : account().type === 'm3u' ? 'Tu lista no contiene elementos identificados en esta sección. Se organizan según su categoría o ruta.' : 'Tu proveedor no devolvió contenido para esta sección.';
}
function clearSeries() {
  episodeVersion++; seriesItem = null; episodes = [];
  $('#series-detail').hidden = true; $('.app').classList.remove('series-detail-open');
}
async function openSeries(item) {
  stopPlayback(); seriesItem = item; episodes = []; playbackQueue = []; updatePlayerNavigation();
  const a = account(), version = ++episodeVersion;
  $('.app').classList.add('series-detail-open'); $('#series-detail').hidden = false; $('#watch-area').hidden = false;
  $('#current-name').textContent = 'Selecciona un capítulo'; $('#playback-status').textContent = '';
  $('#view-title').textContent = item.name; $('#series-name').textContent = item.name;
  $('#series-status').textContent = 'Cargando temporadas y episodios…'; $('#season-field').hidden = true; $('#episodes').replaceChildren();
  $('#watch-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    // A local M3U may expose only a single episode without series metadata.
    const loaded = item.url ? [{ ...item, kind: 'episode', season: 'unknown', number: 1 }] : await loadEpisodes(a.config, item.streamId, requestJson);
    if (version !== episodeVersion || a.id !== sessionAccountId) return;
    episodes = loaded; const seasons = [...new Set(episodes.map(e => e.season))]; $('#season-select').replaceChildren();
    for (const season of seasons) { const option = node('option', '', season === 'unknown' ? 'Sin temporada indicada' : `Temporada ${season}`); option.value = season; $('#season-select').append(option); }
    $('#season-field').hidden = !seasons.length; $('#series-status').textContent = episodes.length ? `${episodes.length} episodios disponibles` : 'Esta serie todavía no tiene episodios disponibles.'; renderEpisodes();
  } catch (error) { if (version === episodeVersion) $('#series-status').textContent = friendlyError(error); }
}
function renderEpisodes() {
  $('#episodes').replaceChildren();
  for (const ep of episodes.filter(e => e.season === $('#season-select').value)) {
    const selected = current?.kind === 'episode' && current.id === ep.id;
    const button = node('button', `episode${selected ? ' selected' : ''}`);
    button.setAttribute('aria-label', `Reproducir capítulo ${ep.number}: ${ep.name}`); button.setAttribute('aria-pressed', String(selected));
    button.append(node('span', 'episode-number', `${String(ep.number).padStart(2, '0')}`), node('strong', '', ep.name), node('span', 'episode-action', selected ? 'REPRODUCIENDO' : '▷ REPRODUCIR'));
    button.onclick = () => playItem(ep); $('#episodes').append(button);
  }
}
$('#season-select').onchange = renderEpisodes;
$('#close-series').onclick = () => { stopPlayback(); clearSeries(); render(); };
function stopPlayback() {
  playbackVersion++; player?.destroy(); player = null; current = null;
  video.hidden = true; $('#track-controls').hidden = true; $('#player-settings-toggle').setAttribute('aria-expanded', 'false'); $('#compat-bar').hidden = true;
  $('#watch-area').hidden = true; $('#placeholder').hidden = false; epg.renderPlaying();
}
function updateTracks() {
  const audio = player?.audioTracks() || [], subtitles = player?.subtitleTracks() || [], videos = player?.videoTracks() || [];
  $('#video-track').replaceChildren();
  for (const track of videos) { const option = node('option', '', track.label); option.value = track.id; option.selected = track.selected; $('#video-track').append(option); }
  if (!videos.length) $('#video-track').append(node('option', '', 'Video automático'));
  $('#video-track').disabled = !videos.length;
  $('#compat-bar').hidden = !player?.isCompatibility();
  $('#compat-enable').disabled = !!player?.isCompatibility(); $('#compat-enable').textContent = player?.isCompatibility() ? 'Motor compatible activo' : 'Motor compatible AC3 / DTS';
  $('#audio-track').replaceChildren();
  if (audio.length) { const off = node('option', '', 'Desactivado (sin audio)'); off.value = 'off'; off.selected = player?.audioDisabled(); $('#audio-track').append(off); }
  for (const track of audio) { const option = node('option', '', track.label); option.value = track.id; option.selected = track.selected; $('#audio-track').append(option); }
  if (!audio.length) $('#audio-track').append(node('option', '', 'Automático / no expuestas'));
  $('#audio-track').disabled = !audio.length;
  $('#subtitle-track').replaceChildren();
  const off = node('option', '', 'Desactivados'); off.value = ''; $('#subtitle-track').append(off);
  for (const track of subtitles) { const option = node('option', '', track.label); option.value = track.id; option.selected = track.selected; option.disabled = !!track.disabled; $('#subtitle-track').append(option); }
  updateClock();
  $('#track-note').textContent = player?.isCompatibility() ? 'Compatibilidad local: audio convertido a AAC. Las pistas de texto integradas se muestran aquí. Los subtítulos gráficos requieren un reproductor externo.' : audio.length ? 'Si una pista no suena, prueba otra: algunos códecs necesitan VLC.' : 'El motor no expone pistas alternativas para este archivo. Puedes cargar SRT/VTT o usar VLC para audio dual, AC3/DTS y subtítulos integrados no compatibles.';
}
function playItem(item, queue = null) {
  const candidates = queue || (item.kind === 'episode' && episodes.some(ep => ep.id === item.id) ? episodes : filterChannels((account()?.items || []).filter(entry => entry.kind === item.kind && (view !== 'favorites' || favorites().has(entry.id))), { search: $('#search').value, group }));
  stopPlayback(); current = item;
  playbackQueue = candidates.filter(entry => entry.url);
  updatePlayerNavigation();
  const version = playbackVersion;
  $('#watch-area').hidden = false; $('#track-controls').hidden = true; $('#player-settings-toggle').setAttribute('aria-expanded', 'false'); $('#placeholder').hidden = true; video.hidden = false; $('#current-name').textContent = item.name;
  player = createPlayer(video, { status: message => { if (version === playbackVersion) $('#playback-status').textContent = message; }, changed: updateTracks });
  player.play(item, account()?.config.url); updateTracks();
  if (item.kind === 'live') epg.showPlaying();
  if (seriesItem) { $('#season-select').value = item.season; renderEpisodes(); }
  renderItems(); $('#watch-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updatePlayerNavigation() {
  const index = playbackQueue.findIndex(item => item.id === current?.id);
  const noun = current?.kind === 'live' ? 'canal' : current?.kind === 'episode' ? 'episodio' : 'título';
  for (const [id, step] of [['player-previous', -1], ['player-next', 1]]) {
    const target = playbackQueue[index + step], button = $(`#${id}`);
    button.disabled = index < 0 || !target;
    button.setAttribute('aria-label', `${step < 0 ? 'Anterior' : 'Siguiente'} ${noun}`);
    button.title = target ? `${step < 0 ? 'Anterior' : 'Siguiente'}: ${target.name}` : `No hay ${noun} ${step < 0 ? 'anterior' : 'siguiente'}`;
  }
  $('#player-navigation-label').textContent = current?.name || '';
}
function changePlaying(step) {
  const index = playbackQueue.findIndex(item => item.id === current?.id);
  const item = index >= 0 && playbackQueue[index + step];
  if (item) playItem(item, playbackQueue);
}
$('#player-previous').onclick = () => changePlaying(-1);
$('#player-next').onclick = () => changePlaying(1);
const intro = $('#startup-intro');
const introSound = $('#startup-sound');
function finishIntro() { intro.remove(); introSound.pause(); introSound.remove(); }
intro.addEventListener('animationend', event => { if (event.target === intro) finishIntro(); });
async function startIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishIntro(); return; }
  try { await intro.querySelector('img').decode(); } catch { /* Keep startup usable if the image fails. */ }
  intro.classList.add('is-ready');
  introSound.volume = .3;
  void introSound.play().catch(() => {}); // Browsers may require a gesture; desktop allows the startup sound.
  setTimeout(finishIntro, 4200);
}
void startIntro();
function updateClock() {
  if (!player?.isCompatibility()) return;
  const position = player.position(), duration = player.duration();
  const clock = value => { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 3600) ? Math.floor(seconds / 3600) + ':' : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
  $('#compat-clock').textContent = `${clock(position)} / ${duration ? clock(duration) : 'EN VIVO'}`;
  $('#compat-seek').max = duration || 1; $('#compat-seek').disabled = !duration; $('#compat-seek').value = position;
  $('#compat-play').textContent = video.paused ? '▶' : 'Ⅱ'; $('#compat-volume').value = video.volume;
}
for (const event of ['timeupdate', 'play', 'pause', 'volumechange', 'loadedmetadata']) video.addEventListener(event, updateClock);
$('#compat-enable').onclick = () => player?.enableCompatibility();
$('#compat-play').onclick = () => { if (video.paused) void video.play().catch(() => {}); else video.pause(); };
$('#compat-volume').oninput = () => { video.volume = Number($('#compat-volume').value); video.muted = video.volume === 0; };
$('#compat-seek').onchange = () => player?.seek(Number($('#compat-seek').value));
$('#player-settings-toggle').onclick = () => { const open = $('#track-controls').hidden; $('#track-controls').hidden = !open; $('#player-settings-toggle').setAttribute('aria-expanded', String(open)); };
$('#settings-close').onclick = () => { $('#track-controls').hidden = true; $('#player-settings-toggle').setAttribute('aria-expanded', 'false'); $('#player-settings-toggle').focus(); };
$('#player').addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#track-controls').hidden) { event.preventDefault(); $('#settings-close').click(); } });
$('#video-track').onchange = () => player?.selectVideo($('#video-track').value);
$('#audio-track').onchange = () => player?.selectAudio($('#audio-track').value);
$('#subtitle-track').onchange = () => player?.selectSubtitle($('#subtitle-track').value);
$('#subtitle-file').onchange = async () => {
  const file = $('#subtitle-file').files[0]; if (!file || !player) return;
  try { await player.addSubtitle(file); } catch (error) { $('#playback-status').textContent = friendlyError(error); }
  finally { $('#subtitle-file').value = ''; }
};
$('#open-vlc').onclick = async () => {
  if (!current) return;
  if (!window.desktop?.openVlc) { $('#playback-status').textContent = 'Abrir en VLC está disponible en la aplicación de Windows con VLC instalado.'; return; }
  try { await window.desktop.openVlc(current.url); player?.destroy(); player = null; updateTracks(); $('#playback-status').textContent = 'Abierto en VLC. Allí puedes elegir todas las pistas compatibles de audio y subtítulos.'; }
  catch (error) { $('#playback-status').textContent = friendlyError(error); }
};
async function updateConfig(patch) {
  if (busy) throw new Error('Espera a que termine la actualización actual.');
  const a = account(); if (!a) throw new Error('Selecciona una cuenta.');
  busy = true;
  try { await commit({ ...state, accounts: state.accounts.map(old => old.id === a.id ? { ...old, config: { ...old.config, ...patch } } : old) }); render(); }
  finally { busy = false; render(); }
}
$('#auto-refresh').onchange = async () => { try { await updateConfig({ refreshOnEntry: $('#auto-refresh').checked }); } catch (error) { notify(friendlyError(error)); render(); } };
$('#refresh-account').onclick = async () => {
  const a = account(); if (!a) return;
  await refreshAccount(a.id);
  if (resolveEpgUrl(account())) await epg.load(true);
};
$('#local-refresh-file').onchange = async () => {
  const file = $('#local-refresh-file').files[0], a = account(); if (!file || !a || busy) return;
  busy = true;
  try {
    if (file.size > 64 * 1024 * 1024) throw new Error('El archivo supera 64 MB.');
    const text = await file.text(), items = classifyM3U(parseM3U(text)), detectedEpgUrl = playlistEpgUrl(text);
    await commit({ ...state, accounts: state.accounts.map(old => old.id === a.id ? { ...old, config: { ...old.config, detectedEpgUrl }, items, updatedAt: Date.now() } : old) }); notify('Archivo actualizado. Se conservaron tus favoritos.'); render();
  } catch (error) { notify(friendlyError(error)); }
  finally { busy = false; $('#local-refresh-file').value = ''; render(); }
};
$('#close-player').onclick = () => { stopPlayback(); if (seriesItem) { $('#watch-area').hidden = false; $('#current-name').textContent = 'Selecciona un capítulo'; renderEpisodes(); } renderItems(); };
const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#player').requestFullscreen(); } catch { $('#playback-status').textContent = 'No se pudo activar la pantalla completa.'; } };
$('#fullscreen').onclick = toggleFullscreen;
$('#player-fullscreen').onclick = toggleFullscreen;
window.addEventListener('beforeunload', () => { player?.destroy(); multiscreen.stopAll(); });
try {
  const loaded = await readState();
  if (!Array.isArray(loaded?.accounts) || !loaded.favorites || typeof loaded.favorites !== 'object' || loaded.accounts.some(a => !a.id || !Array.isArray(a.items) || !a.config || !['m3u', 'xtream'].includes(a.type))) throw new Error('Los datos de cuentas no se pueden leer.');
  state = { ...loaded, accounts: loaded.accounts.map(a => a.type === 'm3u' ? { ...a, items: classifyM3U(a.items) } : a) };
  if (!state.accounts.some(a => a.id === state.activeId)) state.activeId = state.accounts[0]?.id || null;
} catch { storageFailed = true; notify('No se pudieron abrir las cuentas guardadas. Reinicia la aplicación. Tus datos no se sobrescribirán.'); }
render();
