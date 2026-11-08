import { setupAndroidMultiscreen } from './android-player.js';
import { createPlayer } from './player.js';
import { filterChannels } from './playlist.js';
export function setupMultiscreen(getAccount) {
  if (window.androidHost) return setupAndroidMultiscreen(getAccount);
  const $ = s => document.querySelector(s);
  const slots = []; let target = 0;
  for (let index = 0; index < 4; index++) {
    const cell = document.createElement('article'); cell.className = 'multi-cell';
    const heading = document.createElement('div'); heading.className = 'multi-heading';
    const title = document.createElement('strong'); title.textContent = `Pantalla ${index + 1}`;
    const choose = document.createElement('button'); choose.className = 'secondary'; choose.textContent = 'Elegir canal'; choose.setAttribute('aria-label', `Elegir canal para pantalla ${index + 1}`);
    choose.onclick = () => { target = index; $('#multi-choose-title').textContent = `Canal para pantalla ${index + 1}`; $('#multi-search').value = ''; options(); $('#multi-dialog').showModal(); $('#multi-search').focus(); };
    const mute = document.createElement('button'); mute.className = 'text-button'; mute.textContent = 'Escuchar'; mute.setAttribute('aria-label', `Escuchar pantalla ${index + 1}`); mute.setAttribute('aria-pressed', 'false');
    mute.onclick = () => {
      const wasMuted = video.muted;
      slots.forEach(slot => { slot.video.muted = true; slot.mute.setAttribute('aria-pressed', 'false'); slot.mute.textContent = 'Escuchar'; });
      video.muted = !wasMuted; mute.setAttribute('aria-pressed', String(wasMuted)); mute.textContent = wasMuted ? 'Silenciar' : 'Escuchar';
    };
    const close = document.createElement('button'); close.className = 'icon-button'; close.textContent = '×'; close.setAttribute('aria-label', `Detener pantalla ${index + 1}`); close.onclick = () => stop(index);
    heading.append(title, choose, mute, close);
    const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.muted = true; video.setAttribute('aria-label', `Pantalla ${index + 1}`);
    // Native volume controls may unmute a slot; preserve the one-audio policy.
    video.addEventListener('volumechange', () => { if (!video.muted) slots.forEach(slot => { if (slot.video !== video) { slot.video.muted = true; slot.mute.setAttribute('aria-pressed', 'false'); slot.mute.textContent = 'Escuchar'; } }); mute.setAttribute('aria-pressed', String(!video.muted)); mute.textContent = video.muted ? 'Escuchar' : 'Silenciar'; });
    const status = document.createElement('p'); status.className = 'muted'; status.textContent = 'Selecciona un canal.'; status.setAttribute('role', 'status');
    cell.append(heading, video, status); $('#multi-grid').append(cell);
    slots.push({ video, title, mute, status, player: null });
  }
  function stop(index) {
    const slot = slots[index]; slot.player?.destroy(); slot.player = null;
    slot.video.muted = true; slot.mute.setAttribute('aria-pressed', 'false'); slot.mute.textContent = 'Escuchar';
    slot.title.textContent = `Pantalla ${index + 1}`; slot.status.textContent = 'Selecciona un canal.';
  }
  function options() {
    $('#multi-options').replaceChildren();
    const channels = filterChannels(getAccount()?.items.filter(i => i.kind === 'live') || [], { search: $('#multi-search').value });
    for (const item of channels.slice(0, 120)) {
      const button = document.createElement('button'); button.className = 'episode'; button.textContent = item.name;
      button.onclick = () => {
        stop(target); const slot = slots[target]; slot.title.textContent = item.name;
        slot.player = createPlayer(slot.video, { status: message => { slot.status.textContent = message; } });
        slot.player.play(item, getAccount().config.url); $('#multi-dialog').close();
      };
      $('#multi-options').append(button);
    }
    if (!channels.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No hay canales que coincidan.'; $('#multi-options').append(p); }
  }
  $('#multi-search').oninput = options;
  $('#multi-close').onclick = () => $('#multi-dialog').close();
  const stopAll = () => { slots.forEach((_, i) => stop(i)); $('#multi-dialog').close(); };
  $('#multi-stop').onclick = stopAll;
  $('#multi-fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#multi-grid').requestFullscreen(); } catch { slots[0].status.textContent = 'No se pudo activar la pantalla completa.'; } };
  return { stopAll };
}
