export function setupAndroidDisplay() {
  const root = document.documentElement, key = 'nexo.display.mode.v1';
  const read = () => typeof window.NexoNative.getDisplayMode === 'function' ? window.NexoNative.getDisplayMode() : localStorage.getItem(key);
  let mode = read(); if (!['tv', 'phone'].includes(mode)) mode = null;
  const apply = value => { root.classList.toggle('android-tv', value === 'tv'); root.classList.toggle('android-phone', value === 'phone'); };
  apply(mode || (window.NexoNative.isTv() ? 'tv' : 'phone'));
  const dialog = document.createElement('dialog'); dialog.id = 'display-mode-dialog'; dialog.className = 'display-mode-dialog';
  dialog.setAttribute('aria-labelledby', 'display-mode-title');
  dialog.innerHTML = '<span class="kicker">BIENVENIDO A NEXO</span><h2 id="display-mode-title">¿Dónde usarás Nexo?</h2><p>Elige la pantalla para ajustar el tamaño y los controles. Solo te lo preguntaremos una vez.</p><div class="display-mode-options"><button type="button" data-display-mode="tv"><svg viewBox="0 0 80 64" aria-hidden="true"><rect x="5" y="5" width="70" height="43" rx="8"/><path d="M27 58h26M40 48v10"/></svg><strong>TV</strong><small>Pantalla horizontal y control remoto</small></button><button type="button" data-display-mode="phone"><svg viewBox="0 0 80 64" aria-hidden="true"><rect x="24" y="3" width="32" height="58" rx="7"/><path d="M35 9h10M37 54h6"/></svg><strong>Teléfono / tablet</strong><small>Pantalla táctil y tamaño adaptable</small></button></div><p id="display-mode-error" role="alert"></p>';
  document.body.append(dialog);
  const settings = document.createElement('button'); settings.id = 'android-display-settings'; settings.className = 'secondary'; settings.type = 'button'; settings.setAttribute('aria-label', 'Cambiar modo de pantalla');
  document.querySelector('#account-picker').append(settings);
  const updateLabel = () => { settings.textContent = mode === 'tv' ? 'Pantalla: TV' : 'Pantalla: Teléfono'; settings.hidden = !mode; };
  const open = () => { dialog.showModal(); dialog.querySelector(`[data-display-mode="${mode || (window.NexoNative.isTv() ? 'tv' : 'phone')}"]`).focus(); };
  settings.onclick = open;
  for (const button of dialog.querySelectorAll('[data-display-mode]')) button.onclick = () => {
    const value = button.dataset.displayMode;
    try {
      if (typeof window.NexoNative.setDisplayMode === 'function') { if (!window.NexoNative.setDisplayMode(value)) throw new Error(); }
      else localStorage.setItem(key, value);
      mode = value; apply(mode); updateLabel(); root.classList.remove('android-setup-pending'); dialog.close();
      const target = document.querySelector('#accounts-list .account-open') || document.querySelector('#picker-add'); target?.focus();
    } catch { dialog.querySelector('#display-mode-error').textContent = 'No se pudo guardar la preferencia. Inténtalo otra vez.'; }
  };
  dialog.addEventListener('cancel', event => { if (!mode) event.preventDefault(); });
  window.nexoDisplayBack = () => { if (!dialog.open) return null; if (!mode) return false; dialog.close(); return true; };
  updateLabel();
  if (!mode) {
    root.classList.add('android-setup-pending');
    const ready = () => { if (!document.querySelector('#startup-intro')) { observer.disconnect(); open(); } };
    const observer = new MutationObserver(ready); observer.observe(document.body, { childList: true }); ready();
  }
}
