import { parseXmltv, channelPrograms, xtreamEpgUrl } from './epg.js';
import { httpUrl, filterChannels } from './playlist.js';
import { requestText, friendlyError } from './network.js';
export function setupEpg({ getAccount, updateConfig, play }) {
  const $ = s => document.querySelector(s), cache = new Map();
  let generation = 0, limit = 120;
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  function openSettings() {
    const a = getAccount(); if (!a) return;
    $('#epg-url').value = a.config.epgUrl || ''; $('#epg-error').textContent = '';
    $('#epg-xtream').hidden = a.type !== 'xtream'; $('#epg-dialog').showModal();
  }
  $('#epg-settings').onclick = openSettings;
  $('#epg-close').onclick = () => $('#epg-dialog').close();
  $('#epg-xtream').onclick = () => { $('#epg-url').value = xtreamEpgUrl(getAccount().config); };
  $('#epg-form').onsubmit = async event => {
    event.preventDefault(); $('#epg-save').disabled = true;
    try {
      const address = $('#epg-url').value.trim();
      if (address && !httpUrl(address)) throw new Error('Introduce una URL HTTP o HTTPS válida.');
      const id = getAccount().id;
      await updateConfig({ epgUrl: address }); cache.delete(id);
      $('#epg-dialog').close(); limit = 120; await load(true);
    } catch (error) { $('#epg-error').textContent = friendlyError(error); }
    finally { $('#epg-save').disabled = false; }
  };
  $('#epg-search').oninput = () => { limit = 120; render(); };
  $('#epg-more').onclick = () => { limit += 120; render(); };
  $('#epg-reload').onclick = () => load(true);
  function render() {
    const a = getAccount(); if (!a) return;
    const entry = cache.get(a.id), epg = entry?.url === a.config.epgUrl ? entry.data : null;
    $('#epg-programs').replaceChildren();
    const channels = filterChannels(a.items.filter(i => i.kind === 'live'), { search: $('#epg-search').value });
    $('#epg-more').hidden = !epg || channels.length <= limit;
    if (!a.config.epgUrl) { $('#epg-status').textContent = 'Esta cuenta no tiene EPG. Pulsa Configurar EPG para agregarla (opcional).'; return; }
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
    const version = ++generation, address = a.config.epgUrl;
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
