import { parseXmltv, windowPrograms, currentPrograms, discoverEpgUrl, resolveEpgUrl, epgMode } from './epg.js';
import { httpUrl, filterChannels } from './playlist.js';
import { requestText, friendlyError } from './network.js';
export function setupEpg({ getAccount, updateConfig, getCategory = () => '', getPlaying = () => null, play }) {
  const $ = s => document.querySelector(s), cache = new Map(), errors = new Map();
  let generation = 0, limit = 120, offset = 0, serial = 0, pending = null;
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  const time = ms => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(ms);
  function data() { const a = getAccount(), entry = a && cache.get(a.id); return entry?.url === resolveEpgUrl(a) ? entry.data : null; }
  function settingsMode() {
    const a = getAccount(), mode = $('#epg-mode').value;
    $('#epg-url').readOnly = mode !== 'manual'; $('#epg-url').required = mode === 'manual';
    $('#epg-url').value = mode === 'auto' ? discoverEpgUrl(a) : mode === 'manual' ? a.config.epgUrl || '' : '';
    $('#epg-detection').textContent = mode === 'off' ? 'La guía está desactivada para esta cuenta.' : mode === 'auto' ? ($('#epg-url').value ? 'Enlace XMLTV detectado a partir de tu cuenta.' : 'No se encontró un enlace automático. Puedes introducirlo en modo manual.') : 'Se usará la dirección que introduzcas.';
  }
  $('#epg-settings').onclick = () => { const a = getAccount(); if (!a) return; $('#epg-mode').value = epgMode(a); $('#epg-error').textContent = ''; settingsMode(); $('#epg-dialog').showModal(); };
  $('#epg-close').onclick = () => $('#epg-dialog').close(); $('#epg-mode').onchange = settingsMode;
  $('#epg-form').onsubmit = async event => {
    event.preventDefault(); $('#epg-save').disabled = true;
    try {
      const mode = $('#epg-mode').value, address = mode === 'manual' ? $('#epg-url').value.trim() : '';
      if (mode === 'manual' && !httpUrl(address)) throw new Error('Introduce una URL HTTP o HTTPS válida.');
      const id = getAccount().id;
      await updateConfig({ epgMode: mode, epgUrl: address }); generation++; cache.delete(id); errors.delete(id);
      $('#epg-dialog').close(); limit = 120; await load(true);
    } catch (error) { $('#epg-error').textContent = friendlyError(error); }
    finally { $('#epg-save').disabled = false; }
  };
  $('#epg-search').oninput = () => { limit = 120; render(); };
  $('#epg-more').onclick = () => { limit += 120; render(); };
  $('#epg-reload').onclick = () => load(true);
  $('#epg-prev').onclick = () => { offset = Math.max(-6, offset - 3); render(); };
  $('#epg-next').onclick = () => { offset = Math.min(45, offset + 3); render(); };
  $('#epg-now').onclick = () => { offset = 0; render(); };
  $('#programme-close').onclick = () => $('#programme-dialog').close();
  function detail(channel, program) {
    $('#programme-title').textContent = program.title;
    const format = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    $('#programme-time').textContent = `${channel.name} · ${format.format(program.start)} — ${format.format(program.stop)}`;
    $('#programme-description').textContent = program.description || 'Sin descripción disponible.';
    $('#programme-play').onclick = () => { $('#programme-dialog').close(); play(channel); };
    $('#programme-dialog').showModal();
  }
  function render() {
    const a = getAccount(); if (!a) return;
    const epg = data(), now = Date.now(), start = Math.floor(now / 1800000) * 1800000 + offset * 3600000, end = start + 3 * 3600000;
    $('#epg-programs').replaceChildren();
    $('#epg-prev').disabled = offset <= -6; $('#epg-next').disabled = offset >= 45;
    const format = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    $('#epg-window-label').textContent = `${format.format(start)} — ${format.format(end)}`;
    const channels = filterChannels(a.items.filter(i => i.kind === 'live'), { search: $('#epg-search').value, group: getCategory() });
    $('#epg-more').hidden = !epg || channels.length <= limit;
    if (!resolveEpgUrl(a)) { $('#epg-status').textContent = epgMode(a) === 'off' ? 'La EPG está desactivada. Puedes activarla en Configurar EPG.' : 'No se pudo detectar un enlace EPG. Puedes agregarlo en Configurar EPG.'; return; }
    if (!epg) return;
    $('#epg-status').textContent = `${channels.length} canales · Horario local · Actualizada ${time(epg.loadedAt)}`;
    const header = node('div', '', 'epg-axis'), label = node('div', 'CANAL', 'epg-channel-label'), hours = node('div', '', 'epg-hours');
    for (let i = 0; i < 6; i++) hours.append(node('span', time(start + i * 1800000)));
    if (now >= start && now < end) { const mark = node('span', 'AHORA', 'epg-axis-now'); mark.style.left = `${(now - start) / (end - start) * 100}%`; hours.append(mark); }
    header.append(label, hours); $('#epg-programs').append(header);
    for (const [index, channel] of channels.slice(0, limit).entries()) {
      const row = node('article', '', 'epg-row');
      const button = node('button', '', 'epg-channel'); button.setAttribute('aria-label', `Ver ${channel.name} en vivo`);
      button.append(node('small', String(index + 1).padStart(2, '0')));
      if (httpUrl(channel.logo)) { const img = document.createElement('img'); img.src = channel.logo; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); button.append(img); }
      button.append(node('strong', channel.name)); button.onclick = () => play(channel);
      const track = node('div', '', 'epg-track'), programs = windowPrograms(epg, channel, start, end);
      if (!programs.length) track.append(node('span', 'Sin programación disponible en este horario', 'epg-no-data'));
      for (const p of programs) {
        const card = node('button', '', `epg-program${p.start <= now && p.stop > now ? ' on-air' : ''}`);
        const left = (Math.max(p.start, start) - start) / (end - start) * 100, width = (Math.min(p.stop, end) - Math.max(p.start, start)) / (end - start) * 100;
        card.style.left = `${left}%`; card.style.width = `${width}%`;
        card.append(node('small', `${time(p.start)} — ${time(p.stop)}`), node('strong', p.title));
        card.title = `${p.title} · ${time(p.start)} — ${time(p.stop)}`; card.onclick = () => detail(channel, p);
        track.append(card);
      }
      if (now >= start && now < end) { const mark = node('span', '', 'epg-now-line'); mark.style.left = `${(now - start) / (end - start) * 100}%`; track.append(mark); }
      row.append(button, track); $('#epg-programs').append(row);
    }
  }
  function renderPlaying() {
    const channel = getPlaying(), a = getAccount(), container = $('#channel-epg');
    container.replaceChildren(); container.hidden = !channel || !a;
    if (!channel || !a) return;
    const epg = data();
    if (!epg) { container.append(node('p', !resolveEpgUrl(a) ? 'Sin guía EPG configurada para esta cuenta.' : errors.get(a.id) || 'Cargando programación del canal…', 'muted')); return; }
    const { current, next } = currentPrograms(epg, channel);
    if (!current && !next) { container.append(node('p', 'No hay programación asociada a este canal.', 'muted')); return; }
    if (current) {
      const info = node('div', '', 'channel-program-current');
      info.append(node('small', `AHORA · ${time(current.start)} — ${time(current.stop)}`, 'kicker'), node('h3', current.title));
      const progress = document.createElement('progress'); progress.max = 100; progress.value = Math.max(0, Math.min(100, (Date.now() - current.start) / (current.stop - current.start) * 100)); progress.setAttribute('aria-label', 'Progreso del programa actual'); info.append(progress);
      if (current.description) info.append(node('p', current.description, 'muted'));
      container.append(info);
    }
    if (next) { const info = node('div', '', 'channel-program-next'); info.append(node('small', `DESPUÉS · ${time(next.start)} — ${time(next.stop)}`, 'kicker'), node('h3', next.title)); container.append(info); }
  }
  async function load(force = false) {
    const a = getAccount(); if (!a) return;
    const address = resolveEpgUrl(a), version = generation;
    if (!address) { render(); renderPlaying(); return; }
    const old = cache.get(a.id), key = `${a.id}|${address}`;
    if (!force && old?.url === address && Date.now() - old.data.loadedAt < 1800000) { render(); renderPlaying(); return; }
    if (!force && pending?.key === key) return pending.promise;
    const ticket = ++serial; errors.delete(a.id); renderPlaying();
    $('#epg-status').textContent = 'Descargando guía XMLTV…'; $('#epg-reload').disabled = true;
    const promise = (async () => {
      try {
        const { text } = await requestText(address, 'epg');
        if (version !== generation || getAccount()?.id !== a.id || pending?.ticket !== ticket) return;
        cache.set(a.id, { url: address, data: parseXmltv(text) }); errors.delete(a.id); render(); renderPlaying();
      } catch (error) {
        if (version === generation && getAccount()?.id === a.id && pending?.ticket === ticket) {
          const message = `${friendlyError(error)}${old ? ' Se conserva la guía anterior.' : ''}`;
          errors.set(a.id, message); render(); renderPlaying(); $('#epg-status').textContent = message;
        }
      } finally { if (pending?.ticket === ticket) { pending = null; $('#epg-reload').disabled = false; } }
    })();
    pending = { key, ticket, promise }; return promise;
  }
  setInterval(() => { if (!$('#epg-view').hidden && getAccount()) render(); renderPlaying(); }, 60000);
  return { load, render, renderPlaying, showPlaying() { renderPlaying(); if (getPlaying() && resolveEpgUrl(getAccount())) void load(); }, reset() { generation++; pending = null; limit = 120; offset = 0; $('#epg-search').value = ''; $('#epg-programs').replaceChildren(); $('#epg-reload').disabled = false; $('#epg-status').textContent = ''; renderPlaying(); } };
}
