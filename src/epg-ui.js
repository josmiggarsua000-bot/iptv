import { parseXmltv, channelPrograms, discoverEpgUrl, resolveEpgUrl, epgMode } from './epg.js';
import { httpUrl, filterChannels } from './playlist.js';
import { requestText, friendlyError } from './network.js';
export function setupEpg({ getAccount, updateConfig, getCategory = () => '', play }) {
  const $ = s => document.querySelector(s), cache = new Map();
  let generation = 0, limit = 120;
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  function openSettings() {
    const a = getAccount(); if (!a) return;
    $('#epg-mode').value = epgMode(a); $('#epg-error').textContent = '';
    settingsMode(); $('#epg-dialog').showModal();
  }
  $('#epg-settings').onclick = openSettings;
  $('#epg-close').onclick = () => $('#epg-dialog').close();
  function settingsMode() {
    const a = getAccount(), mode = $('#epg-mode').value;
    $('#epg-url').readOnly = mode !== 'manual'; $('#epg-url').required = mode === 'manual';
    $('#epg-url').value = mode === 'auto' ? discoverEpgUrl(a) : mode === 'manual' ? a.config.epgUrl || '' : '';
    $('#epg-detection').textContent = mode === 'off' ? 'La guía está desactivada para esta cuenta.' : mode === 'auto' ? ($('#epg-url').value ? 'Enlace XMLTV detectado a partir de tu cuenta. Se descargará al abrir la guía.' : 'No se encontró un enlace automático. Puedes introducirlo en modo manual.') : 'Se usará la dirección que introduzcas.';
  }
  $('#epg-mode').onchange = settingsMode;
  $('#epg-form').onsubmit = async event => {
    event.preventDefault(); $('#epg-save').disabled = true;
    try {
      const mode = $('#epg-mode').value, address = mode === 'manual' ? $('#epg-url').value.trim() : '';
      if (mode === 'manual' && !httpUrl(address)) throw new Error('Introduce una URL HTTP o HTTPS válida.');
      const id = getAccount().id;
      await updateConfig({ epgMode: mode, epgUrl: address }); cache.delete(id);
      $('#epg-dialog').close(); limit = 120; await load(true);
    } catch (error) { $('#epg-error').textContent = friendlyError(error); }
    finally { $('#epg-save').disabled = false; }
  };
  $('#epg-search').oninput = () => { limit = 120; render(); };
  $('#epg-more').onclick = () => { limit += 120; render(); };
  $('#epg-reload').onclick = () => load(true);
  function render() {
    const a = getAccount(); if (!a) return;
    const entry = cache.get(a.id), epg = entry?.url === resolveEpgUrl(a) ? entry.data : null;
    $('#epg-programs').replaceChildren();
    const channels = filterChannels(a.items.filter(i => i.kind === 'live'), { search: $('#epg-search').value, group: getCategory() });
    $('#epg-more').hidden = !epg || channels.length <= limit;
    if (!resolveEpgUrl(a)) { $('#epg-status').textContent = epgMode(a) === 'off' ? 'La EPG está desactivada. Puedes activarla en Configurar EPG.' : 'No se pudo detectar un enlace EPG. Puedes agregarlo en Configurar EPG.'; return; }
    if (!epg) return;
    const date = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    $('#epg-status').textContent = `Última actualización: ${date.format(epg.loadedAt)} · ${channels.length} canales. Horario local.`;
    const time = ms => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(ms);
    for (const channel of channels.slice(0, limit)) {
      const row = node('article', '', 'epg-row');
      const button = node('button', channel.name, 'secondary'); button.onclick = () => play(channel);
      row.append(button);
      const programs = channelPrograms(epg, channel);
      if (!programs.length) row.append(node('p', 'Sin programación asociada a este canal.', 'muted'));
      for (const p of programs) {
        const card = node('div', '', 'epg-program');
        card.append(node('small', `${p.start <= Date.now() ? 'AHORA · ' : ''}${time(p.start)} — ${time(p.stop)}`), node('strong', p.title));
        if (p.description) card.title = p.description;
        row.append(card);
      }
      $('#epg-programs').append(row);
    }
  }
  async function load(force = false) {
    const a = getAccount(); if (!a) return;
    const version = ++generation, address = resolveEpgUrl(a);
    if (!address) { render(); return; }
    const old = cache.get(a.id);
    if (!force && old?.url === address && Date.now() - old.data.loadedAt < 1800000) { render(); return; }
    $('#epg-status').textContent = 'Descargando guía XMLTV…'; $('#epg-reload').disabled = true;
    try {
      const { text } = await requestText(address, 'epg');
      const data = parseXmltv(text);
      if (version !== generation || getAccount()?.id !== a.id) return;
      cache.set(a.id, { url: address, data }); render();
    } catch (error) {
      if (version === generation && getAccount()?.id === a.id) { render(); $('#epg-status').textContent = `${friendlyError(error)}${old ? ' Se conserva la guía anterior.' : ''}`; }
    } finally { if (version === generation) $('#epg-reload').disabled = false; }
  }
  setInterval(() => { if (!$('#epg-view').hidden && getAccount()) render(); }, 60000);
  return { load, render, reset() { generation++; limit = 120; $('#epg-search').value = ''; $('#epg-programs').replaceChildren(); $('#epg-reload').disabled = false; $('#epg-status').textContent = ''; } };
}
