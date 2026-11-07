import Hls from 'hls.js';
import { parseM3U, filterChannels, httpUrl } from './playlist.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const storeKey = 'nexo.library.v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storeKey)); } catch { saved = null; }
let channels = Array.isArray(saved?.channels) ? saved.channels.filter(c => typeof c.name === 'string' && typeof c.group === 'string' && httpUrl(c.url) && c.id === c.url) : [];
let favorites = new Set(Array.isArray(saved?.favorites) ? saved.favorites : []);
let listName = typeof saved?.name === 'string' ? saved.name : '';
let group = '', favoriteView = false, limit = 120, current = null, hls = null, playbackVersion = 0;
const video = $('#video');
const dialog = $('#import-dialog');

function persist(nextChannels = channels, nextName = listName, nextFavorites = favorites) {
  localStorage.setItem(storeKey, JSON.stringify({ channels: nextChannels, name: nextName, favorites: [...nextFavorites] }));
}
function openImport() { $('#import-error').textContent = ''; dialog.showModal(); $('#playlist-name').focus(); }
for (const id of ['add-list', 'player-add', 'empty-add']) $(`#${id}`).onclick = openImport;
for (const id of ['close-dialog', 'cancel-import']) $(`#${id}`).onclick = () => dialog.close();
$('#playlist-file').onchange = () => { $('#file-name').textContent = $('#playlist-file').files[0]?.name || 'Ningún archivo seleccionado'; if ($('#playlist-file').files.length) $('#playlist-url').value = ''; };
$('#playlist-url').oninput = () => { if ($('#playlist-url').value) { $('#playlist-file').value = ''; $('#file-name').textContent = 'Ningún archivo seleccionado'; } };

async function fetchPlaylist(url) {
  if (window.desktop) return window.desktop.fetchPlaylist(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`El proveedor respondió con HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 20 * 1024 * 1024) throw new Error('La lista supera el límite de 20 MB.');
      text += decoder.decode(value, { stream: true });
    }
    return { text: text + decoder.decode(), url: response.url };
  } finally { await reader.cancel(); }
}
$('#import-form').onsubmit = async event => {
  event.preventDefault();
  const submit = $('#import-submit');
  const file = $('#playlist-file').files[0], url = $('#playlist-url').value.trim();
  $('#import-error').textContent = '';
  submit.disabled = true; submit.textContent = 'Importando…';
  try {
    if (!file && !url) throw new Error('Selecciona un archivo o introduce el enlace de tu lista.');
    if (url && !httpUrl(url)) throw new Error('Usa un enlace HTTP o HTTPS válido.');
    if (file?.size > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB.');
    const source = file ? { text: await file.text(), url: undefined } : await fetchPlaylist(url);
    const imported = parseM3U(source.text, source.url);
    const name = $('#playlist-name').value.trim() || file?.name || 'Mi televisión';
    const importedIds = new Set(imported.map(channel => channel.id));
    const retained = new Set([...favorites].filter(id => importedIds.has(id)));
    persist(imported, name, retained);
    stopPlayback();
    channels = imported; listName = name; favorites = retained;
    group = ''; favoriteView = false; limit = 120; $('#search').value = '';
    render(); dialog.close(); $('#import-form').reset(); $('#file-name').textContent = 'Ningún archivo seleccionado';
  } catch (error) {
    $('#import-error').textContent = error.name === 'QuotaExceededError' ? 'No hay espacio local suficiente. Prueba una lista más pequeña; tu lista anterior se conserva.' : error.message.includes('fetch') ? 'No se pudo descargar la lista. Comprueba la conexión y el enlace. En navegador, el proveedor debe permitir CORS.' : error.message;
  } finally { submit.disabled = false; submit.textContent = 'Importar canales →'; }
};
function setView(favorite) { favoriteView = favorite; group = ''; limit = 120; render(); }
$('#all-view').onclick = () => setView(false);
$('#favorites-view').onclick = () => setView(true);
$('.brand').onclick = event => { event.preventDefault(); setView(false); };
$('#search').oninput = () => { limit = 120; renderChannels(); };
$('#load-more').onclick = () => { limit += 120; renderChannels(); };
function render() {
  $('#total').textContent = channels.length;
  $('#favorite-count').textContent = favorites.size;
  $('#all-view').classList.toggle('active', !favoriteView && !group);
  $('#favorites-view').classList.toggle('active', favoriteView);
  const groups = new Map();
  channels.forEach(c => groups.set(c.group, (groups.get(c.group) || 0) + 1));
  $('#categories').replaceChildren();
  for (const [name, count] of groups) {
    const button = document.createElement('button'); button.className = 'category';
    button.classList.toggle('active', group === name);
    const label = document.createElement('span'); label.textContent = name;
    const number = document.createElement('span'); number.textContent = count;
    button.append(label, number);
    button.onclick = () => { group = name; favoriteView = false; limit = 120; render(); };
    $('#categories').append(button);
  }
  $('#view-title').firstChild.textContent = favoriteView ? 'Favoritos ' : group ? `${group} ` : 'TV en vivo ';
  $('#list-name').textContent = listName || 'Tu biblioteca personal de televisión';
  renderChannels();
}
function renderChannels() {
  const filtered = filterChannels(channels, { search: $('#search').value, group, favorites: favoriteView ? favorites : null });
  $('#visible-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'canal' : 'canales'}`;
  $('#channels').replaceChildren();
  for (const channel of filtered.slice(0, limit)) {
    const card = document.createElement('article'); card.className = 'channel-card';
    card.classList.toggle('selected', current?.id === channel.id);
    const play = document.createElement('button'); play.className = 'channel-play';
    play.setAttribute('aria-label', `Reproducir ${channel.name}`);
    const logo = document.createElement('span'); logo.className = 'channel-logo'; logo.textContent = channel.name.slice(0, 2).toUpperCase();
    if (httpUrl(channel.logo)) {
      const img = document.createElement('img'); img.src = channel.logo; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove(); logo.append(img);
    }
    const name = document.createElement('strong'); name.textContent = channel.name;
    const category = document.createElement('span'); category.className = 'channel-group'; category.textContent = channel.group;
    play.append(logo, name, category); play.onclick = () => playChannel(channel);
    const star = document.createElement('button'); star.className = 'favorite'; star.textContent = favorites.has(channel.id) ? '★' : '☆';
    star.setAttribute('aria-label', `Favorito: ${channel.name}`); star.setAttribute('aria-pressed', String(favorites.has(channel.id)));
    star.onclick = () => {
      const next = new Set(favorites); next.has(channel.id) ? next.delete(channel.id) : next.add(channel.id);
      try { persist(channels, listName, next); favorites = next; render(); }
      catch { $('#playback-status').textContent = 'No se pudo guardar el favorito. Comprueba el espacio local.'; }
    };
    card.append(play, star); $('#channels').append(card);
  }
  $('#empty').hidden = filtered.length > 0;
  $('#load-more').hidden = filtered.length <= limit;
  if (channels.length && !filtered.length) {
    $('#empty h3').textContent = favoriteView ? 'Tus favoritos van aquí' : 'No encontramos canales';
    $('#empty p').textContent = favoriteView ? 'Marca la estrella de un canal para guardarlo aquí.' : 'Prueba otra búsqueda o categoría.';
    $('#empty-add').hidden = true;
  } else if (!channels.length) {
    $('#empty h3').textContent = 'Tu biblioteca está por comenzar';
    $('#empty p').textContent = 'Importa una lista M3U desde tu equipo o pega un enlace. Nosotros ponemos el reproductor. Tú eliges los canales.';
    $('#empty-add').hidden = false;
  }
}
function stopPlayback() {
  playbackVersion++; hls?.destroy(); hls = null;
  video.onplaying = null; video.onwaiting = null; video.onerror = null;
  video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
  current = null; $('#placeholder').hidden = false;
  $('#current-name').textContent = 'Tu próximo canal favorito'; $('#playback-status').textContent = 'Elige un canal para empezar.';
}
function playChannel(channel) {
  stopPlayback(); current = channel;
  const version = playbackVersion;
  $('#placeholder').hidden = true; video.hidden = false;
  $('#current-name').textContent = channel.name;
  const status = message => { if (version === playbackVersion) $('#playback-status').textContent = message; };
  status('Conectando con el canal…');
  const start = () => video.play().catch(error => { if (error.name !== 'AbortError') status('Pulsa reproducir para iniciar. Si no funciona, revisa el formato o la conexión.'); });
  video.onplaying = () => status(`Reproduciendo · ${channel.group}`);
  video.onwaiting = () => status('Cargando señal…');
  video.onerror = () => status('No se pudo reproducir. El enlace puede estar fuera de línea o usar un formato no compatible.');
  if (/\.m3u8(?:[?#]|$)/i.test(channel.url) && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(channel.url); hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, start);
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { status('No se pudo cargar la señal HLS. Revisa el enlace, la conexión y los permisos CORS del proveedor.'); hls?.destroy(); hls = null; } });
  } else { video.src = channel.url; start(); }
  renderChannels();
}
$('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#player').requestFullscreen(); }
  catch { $('#playback-status').textContent = 'No se pudo activar la pantalla completa.'; }
};
window.addEventListener('beforeunload', () => hls?.destroy());
render();
