import Hls from 'hls.js';
import { parseM3U, filterChannels, httpUrl } from './playlist.js';
import { classifyM3U, sections } from './library.js';
import { loadXtream, loadEpisodes, normalizeServer } from './xtream.js';
import { requestText, requestJson, friendlyError } from './network.js';
import { readState, writeState } from './storage.js';
import './style.css';

const $ = selector => document.querySelector(selector);
let state = { accounts: [], activeId: null, favorites: {} };
let view = 'home', group = '', limit = 120, accountType = null, busy = false, storageFailed = false;
let current = null, hls = null, playbackVersion = 0, episodeVersion = 0, episodes = [], deleteId = null;
const video = $('#video'), dialog = $('#account-dialog');
const account = () => state.accounts.find(a => a.id === state.activeId);
const favorites = () => new Set(state.favorites[state.activeId] || []);
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
function notify(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
async function commit(next) {
  if (storageFailed) throw new Error('No se pudieron abrir tus datos. Reinicia la aplicación antes de guardar cambios.');
  await writeState(next); state = next;
}
function resetFilters() { group = ''; limit = 120; $('#search').value = ''; }
function setView(next) {
  if (view !== next) stopPlayback();
  view = next; resetFilters(); render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function openAccount() {
  if (storageFailed) { notify('No se pudieron abrir tus cuentas guardadas. Reinicia la aplicación para evitar sobrescribirlas.'); return; }
  $('#account-form').reset(); accountType = null;
  $('#account-fields').hidden = true; $('#account-submit').disabled = true; $('#account-error').textContent = '';
  $('#file-name').textContent = 'Ningún archivo seleccionado';
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  dialog.showModal();
}
for (const id of ['add-account', 'hero-add', 'empty-add']) $(`#${id}`).onclick = openAccount;
for (const id of ['close-dialog', 'cancel-account']) $(`#${id}`).onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
for (const button of document.querySelectorAll('[data-type]')) button.onclick = () => {
  if (busy) return;
  accountType = button.dataset.type;
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('#account-fields').hidden = false; $('#xtream-fields').hidden = accountType !== 'xtream'; $('#m3u-fields').hidden = accountType !== 'm3u';
  $('#account-submit').disabled = false;
  $('#server-url').required = accountType === 'xtream'; $('#username').required = accountType === 'xtream'; $('#password').required = accountType === 'xtream';
  $('#playlist-url').disabled = accountType !== 'm3u';
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
    const type = accountType;
    let items, config, warnings = [];
    if (type === 'xtream') {
      config = { server: normalizeServer($('#server-url').value), username: $('#username').value.trim(), password: $('#password').value };
      if (!config.username || !config.password) throw new Error('Completa el usuario y la contraseña.');
      ({ items, warnings } = await loadXtream(config, requestJson));
    } else {
      const file = $('#playlist-file').files[0], url = $('#playlist-url').value.trim();
      if (!file && !url) throw new Error('Selecciona un archivo o introduce el enlace M3U.');
      if (url && !httpUrl(url)) throw new Error('Usa un enlace HTTP o HTTPS válido.');
      if (file?.size > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB.');
      const source = file ? { text: await file.text() } : await requestText(url);
      items = classifyM3U(parseM3U(source.text, source.url));
      config = { url: url || '' };
    }
    const added = { id: crypto.randomUUID(), name: $('#account-name').value.trim() || (type === 'xtream' ? 'Mi cuenta Xtream' : $('#playlist-file').files[0]?.name || 'Mi lista M3U'), type, config, items, updatedAt: Date.now() };
    await commit({ ...state, accounts: [...state.accounts, added], activeId: added.id });
    stopPlayback(); view = 'home'; resetFilters(); dialog.close();
    $('#account-form').reset();
    notify(warnings.length ? `Cuenta conectada. No se pudo cargar: ${warnings.map(k => sections[k]).join(', ')}. Puedes actualizarla más tarde.` : 'Cuenta conectada. Elige TV en vivo, cine o series para empezar.');
    render();
  } catch (error) { $('#account-error').textContent = friendlyError(error); }
  finally { busy = false; $('#account-submit').disabled = false; $('#account-submit').textContent = 'Conectar cuenta →'; }
};
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => setView(button.dataset.view);
for (const button of document.querySelectorAll('[data-open]')) button.onclick = () => { if (!account()) openAccount(); else setView(button.dataset.open); };
$('.brand').onclick = event => { event.preventDefault(); setView('home'); };
$('#account-select').onchange = async event => {
  const id = event.target.value;
  if (busy) { render(); return; }
  busy = true;
  try { await commit({ ...state, activeId: id }); stopPlayback(); episodeVersion++; $('#series-dialog').close(); resetFilters(); notify(''); render(); }
  catch (error) { notify(friendlyError(error)); render(); }
  finally { busy = false; }
};
$('#search').oninput = () => { limit = 120; renderItems(); };
$('#clear-category').onclick = () => { group = ''; render(); };
$('#load-more').onclick = () => { limit += 120; renderItems(); };
function sectionItems() { const selected = favorites(); return (account()?.items || []).filter(item => view === 'favorites' ? selected.has(item.id) : item.kind === view); }
function render() {
  const active = account();
  $('#home-view').hidden = view !== 'home'; $('#library-view').hidden = view === 'home';
  $('#page-label').textContent = view === 'home' ? 'INICIO' : view === 'favorites' ? 'FAVORITOS' : sections[view].toUpperCase();
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#account-select').replaceChildren();
  for (const a of state.accounts) { const option = node('option', '', a.name); option.value = a.id; $('#account-select').append(option); }
  if (!state.accounts.length) { const option = node('option', '', 'Sin cuenta conectada'); option.value = ''; $('#account-select').append(option); }
  $('#account-select').value = state.activeId || ''; $('#account-select').disabled = !state.accounts.length;
  for (const kind of Object.keys(sections)) {
    const count = (active?.items || []).filter(i => i.kind === kind).length;
    $(`#count-${kind}`).textContent = count;
    $(`#portal-${kind}`).textContent = `${count} ${kind === 'live' ? (count === 1 ? 'canal' : 'canales') : kind === 'movie' ? (count === 1 ? 'película' : 'películas') : (count === 1 ? 'serie' : 'series')}`;
  }
  const favoriteIds = favorites();
  $('#count-favorites').textContent = (active?.items || []).filter(i => favoriteIds.has(i.id)).length;
  $('#home-account').textContent = active ? `${active.name} / ${active.type === 'xtream' ? 'XTREAM CODES' : 'M3U'}` : 'Agrega una cuenta para empezar';
  renderAccounts();
  $('#categories').replaceChildren();
  $('.category-label').hidden = view === 'home';
  const groups = new Map(); sectionItems().forEach(i => groups.set(i.group, (groups.get(i.group) || 0) + 1));
  for (const [name, count] of groups) {
    const button = node('button', `category${group === name ? ' active' : ''}`);
    button.append(node('span', '', name), node('b', '', count)); button.onclick = () => { group = name; limit = 120; render(); };
    $('#categories').append(button);
  }
  $('#view-title').textContent = view === 'favorites' ? 'Favoritos' : sections[view] || 'Inicio';
  $('#list-name').textContent = active?.name || 'Sin cuenta conectada';
  renderItems();
}
function renderAccounts() {
  $('#accounts-list').replaceChildren();
  if (!state.accounts.length) { $('#accounts-list').append(node('p', 'muted', 'Sin cuentas todavía. Agrega una conexión Xtream Codes o una lista M3U.')); return; }
  for (const a of state.accounts) {
    const row = node('div', `account-row${a.id === state.activeId ? ' connected' : ''}`);
    const info = node('div', 'account-info'); info.append(node('strong', '', a.name), node('small', '', `${a.type === 'xtream' ? 'XTREAM CODES' : 'M3U'} · ${a.items.length} títulos${a.id === state.activeId ? ' · ACTIVA' : ''}`));
    const select = node('button', 'secondary', a.id === state.activeId ? 'Conectada' : 'Usar cuenta'); select.disabled = a.id === state.activeId; select.onclick = async () => { $('#account-select').value = a.id; $('#account-select').dispatchEvent(new Event('change')); };
    const refresh = node('button', 'text-button', 'Actualizar'); refresh.disabled = a.type === 'm3u' && !a.config.url; refresh.title = refresh.disabled ? 'Vuelve a agregar el archivo local para actualizarlo.' : 'Actualizar catálogo'; refresh.onclick = () => refreshAccount(a.id);
    const remove = node('button', 'icon-button', '×'); remove.setAttribute('aria-label', `Eliminar cuenta ${a.name}`); remove.onclick = () => { deleteId = a.id; $('#delete-error').textContent = ''; $('#delete-dialog').showModal(); };
    row.append(info, select, refresh, remove); $('#accounts-list').append(row);
  }
}
async function refreshAccount(id) {
  if (busy) return; busy = true; notify('Actualizando el catálogo…');
  try {
    const a = state.accounts.find(a => a.id === id); let items, warnings = [];
    if (a.type === 'xtream') ({ items, warnings } = await loadXtream(a.config, requestJson));
    else { const source = await requestText(a.config.url); items = classifyM3U(parseM3U(source.text, source.url)); }
    // Keep existing sections when the provider temporarily fails to return them.
    if (warnings.length) items.push(...a.items.filter(i => warnings.includes(i.kind)));
    await commit({ ...state, accounts: state.accounts.map(old => old.id === id ? { ...a, items, updatedAt: Date.now() } : old) });
    notify(warnings.length ? `Actualización parcial. Se conservó el catálogo anterior de: ${warnings.map(k => sections[k]).join(', ')}.` : 'Catálogo actualizado.'); render();
  } catch (error) { notify(friendlyError(error)); } finally { busy = false; }
}
$('#cancel-delete').onclick = () => $('#delete-dialog').close();
$('#confirm-delete').onclick = async () => {
  if (busy) return; busy = true;
  try {
    const accounts = state.accounts.filter(a => a.id !== deleteId), nextFavorites = { ...state.favorites }; delete nextFavorites[deleteId];
    await commit({ ...state, accounts, activeId: state.activeId === deleteId ? accounts[0]?.id || null : state.activeId, favorites: nextFavorites });
    stopPlayback(); resetFilters(); $('#delete-dialog').close(); render();
  } catch (error) { $('#delete-error').textContent = friendlyError(error); } finally { busy = false; }
};
function renderItems() {
  const filtered = filterChannels(sectionItems(), { search: $('#search').value, group });
  $('#visible-count').textContent = `${filtered.length} ${view === 'live' ? 'canales' : 'títulos'}${group ? ` / ${group}` : ''}`;
  $('#clear-category').hidden = !group;
  $('#channels').replaceChildren();
  for (const item of filtered.slice(0, limit)) {
    const card = node('article', `content-card ${item.kind}${current?.id === item.id ? ' selected' : ''}`);
    const play = node('button', 'content-play'); play.setAttribute('aria-label', `${item.kind === 'series' && !item.url ? 'Ver episodios de' : 'Reproducir'} ${item.name}`);
    const art = node('span', 'content-art'); art.append(node('span', 'art-initials', item.name.slice(0, 2).toUpperCase()), node('span', 'art-play', item.kind === 'series' && !item.url ? '≡' : '▷'));
    if (httpUrl(item.logo)) { const img = node('img'); img.src = item.logo; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); art.prepend(img); }
    play.append(art, node('strong', '', item.name), node('span', 'content-group', item.group));
    play.onclick = () => item.kind === 'series' && !item.url ? openSeries(item) : playItem(item);
    const star = node('button', 'favorite', favorites().has(item.id) ? '★' : '☆'); star.setAttribute('aria-label', `Favorito: ${item.name}`); star.setAttribute('aria-pressed', String(favorites().has(item.id)));
    star.onclick = async () => {
      if (busy) return; busy = true;
      const next = favorites(); next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      try { await commit({ ...state, favorites: { ...state.favorites, [state.activeId]: [...next] } }); render(); }
      catch (error) { notify(friendlyError(error)); } finally { busy = false; }
    };
    card.append(play, star); $('#channels').append(card);
  }
  $('#empty').hidden = filtered.length > 0; $('#load-more').hidden = filtered.length <= limit;
  $('#empty-add').hidden = !!account();
  $('#empty h2').textContent = !account() ? 'Tu universo está por comenzar' : view === 'favorites' ? 'Aquí van tus imprescindibles' : 'No hay títulos para mostrar';
  $('#empty p').textContent = !account() ? 'Agrega una cuenta para explorar tu contenido.' : $('#search').value || group ? 'Prueba otra búsqueda o categoría.' : view === 'favorites' ? 'Pulsa la estrella de un título para guardarlo.' : account().type === 'm3u' ? 'Tu lista no contiene elementos identificados en esta sección. Se organizan según su categoría o ruta.' : 'Tu proveedor no devolvió contenido para esta sección.';
}
async function openSeries(item) {
  const a = account(), version = ++episodeVersion;
  $('#series-name').textContent = item.name; $('#series-status').textContent = 'Cargando temporadas y episodios…'; $('#season-field').hidden = true; $('#episodes').replaceChildren(); $('#series-dialog').showModal();
  try {
    const loaded = await loadEpisodes(a.config, item.streamId, requestJson);
    if (version !== episodeVersion || a.id !== state.activeId) return;
    episodes = loaded; const seasons = [...new Set(episodes.map(e => e.season))]; $('#season-select').replaceChildren();
    for (const season of seasons) { const option = node('option', '', `Temporada ${season}`); option.value = season; $('#season-select').append(option); }
    $('#season-field').hidden = !seasons.length; $('#series-status').textContent = episodes.length ? `${episodes.length} episodios disponibles` : 'Esta serie todavía no tiene episodios disponibles.'; renderEpisodes();
  } catch (error) { if (version === episodeVersion) $('#series-status').textContent = friendlyError(error); }
}
function renderEpisodes() {
  $('#episodes').replaceChildren();
  for (const ep of episodes.filter(e => e.season === $('#season-select').value)) {
    const button = node('button', 'episode'); button.append(node('span', '', `${String(ep.number).padStart(2, '0')} /`), node('strong', '', ep.name), node('span', '', '▷'));
    button.onclick = () => { $('#series-dialog').close(); playItem(ep); }; $('#episodes').append(button);
  }
}
$('#season-select').onchange = renderEpisodes;
$('#close-series').onclick = () => { episodeVersion++; $('#series-dialog').close(); };
$('#series-dialog').addEventListener('cancel', () => { episodeVersion++; });
function stopPlayback() {
  playbackVersion++; hls?.destroy(); hls = null; current = null;
  video.onplaying = null; video.onwaiting = null; video.onerror = null;
  video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
  $('#watch-area').hidden = true; $('#placeholder').hidden = false;
}
function playItem(item) {
  stopPlayback(); current = item;
  const version = playbackVersion;
  $('#watch-area').hidden = false; $('#placeholder').hidden = true; video.hidden = false; $('#current-name').textContent = item.name;
  const status = message => { if (version === playbackVersion) $('#playback-status').textContent = message; };
  status('Conectando con la señal…');
  const start = () => video.play().catch(error => { if (error.name !== 'AbortError') status('Pulsa reproducir. Si no inicia, comprueba el formato y la conexión.'); });
  video.onplaying = () => status(`Reproduciendo · ${item.group}`); video.onwaiting = () => status('Cargando señal…');
  video.onerror = () => status('No se pudo reproducir. El enlace puede estar fuera de línea o usar un formato no compatible.');
  if (/\.m3u8(?:[?#]|$)/i.test(item.url) && Hls.isSupported()) {
    const instance = new Hls({ enableWorker: true }); hls = instance;
    instance.on(Hls.Events.MANIFEST_PARSED, start);
    instance.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && version === playbackVersion) { status('No se pudo cargar HLS. Revisa la conexión y los permisos CORS del proveedor.'); instance.destroy(); if (hls === instance) hls = null; } });
    instance.loadSource(item.url); instance.attachMedia(video);
  } else { video.src = item.url; start(); }
  renderItems(); $('#watch-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#close-player').onclick = () => { stopPlayback(); renderItems(); };
$('#fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#player').requestFullscreen(); } catch { $('#playback-status').textContent = 'No se pudo activar la pantalla completa.'; } };
window.addEventListener('beforeunload', () => hls?.destroy());
try {
  const loaded = await readState();
  if (!Array.isArray(loaded?.accounts) || !loaded.favorites || typeof loaded.favorites !== 'object' || loaded.accounts.some(a => !a.id || !Array.isArray(a.items) || !a.config || !['m3u', 'xtream'].includes(a.type))) throw new Error('Los datos de cuentas no se pueden leer.');
  state = loaded;
  if (!state.accounts.some(a => a.id === state.activeId)) state.activeId = state.accounts[0]?.id || null;
} catch { storageFailed = true; notify('No se pudieron abrir las cuentas guardadas. Reinicia la aplicación. Tus datos no se sobrescribirán.'); }
render();
