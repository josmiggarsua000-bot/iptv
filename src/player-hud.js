// Reuse the same controls in fullscreen so playback, tracks and focus retain their state.
export function setupPlayerHud({ video, getPlayer }) {
  const $ = selector => document.querySelector(selector);
  const host = $('#player'), bar = $('#fullscreen-controls'), settings = $('#track-controls');
  const nodes = [$('#player-previous'), $('#compat-play'), $('#player-next'), $('#compat-clock'), $('#compat-seek'), $('#compat-volume').closest('label'), $('#player-settings-toggle'), $('#player-fullscreen')];
  const homes = new Map();
  let timer = null, dragging = false;
  const fullscreen = () => document.fullscreenElement === host;
  function reveal() {
    clearTimeout(timer); host.classList.remove('hud-idle');
    if (!fullscreen()) return;
    timer = setTimeout(() => {
      if (dragging || !settings.hidden) { reveal(); return; }
      host.classList.add('hud-idle');
    }, 3000);
  }
  function refresh() { video.controls = !fullscreen() && !getPlayer()?.isCompatibility(); }
  function changed() {
    if (fullscreen() && !homes.size) {
      for (const node of nodes) { const marker = document.createComment('control home'); node.before(marker); homes.set(node, marker); bar.append(node); }
    } else if (!fullscreen() && homes.size) {
      for (const [node, marker] of homes) marker.replaceWith(node);
      homes.clear();
    }
    refresh(); reveal();
  }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('keydown', () => { if (fullscreen()) reveal(); });
  for (const event of ['pointermove', 'keydown', 'focusin', 'input', 'change', 'click']) host.addEventListener(event, reveal);
  host.addEventListener('pointerdown', () => { dragging = true; reveal(); });
  window.addEventListener('pointerup', () => { if (dragging) { dragging = false; reveal(); } });
  window.addEventListener('pointercancel', () => { dragging = false; reveal(); });
  for (const event of ['loadedmetadata', 'playing']) video.addEventListener(event, refresh);
  $('#player-mute').onclick = () => { video.muted = !video.muted; reveal(); };
  return { refresh, reveal, fullscreen, syncFullscreen: changed };
}
