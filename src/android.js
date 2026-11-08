import './android.css';
import { setupAndroidDisplay } from './android-display.js';
import androidVersion from '../android/version.json';
if (window.NexoNative) {
  const pending = new Map();
  const origin = 'https://appassets.androidplatform.net';
  function rpc(method, args = {}) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Android tardó demasiado en responder.')); }, 150000);
      pending.set(id, { resolve, reject, timeout });
      window.NexoNative.request(id, method, JSON.stringify(args));
    });
  }
  window.__nexoReply = message => { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timeout); message.ok ? request.resolve(message.result) : request.reject(new Error(message.error)); };
  window.desktop = {
    async readState() { const response = await fetch(origin + '/native/state', { cache: 'no-store' }); if (!response.ok) throw new Error('No se pudo abrir el almacenamiento protegido de Android.'); return response.json(); },
    async saveState(state) {
      const token = await rpc('stateBegin'), bytes = new TextEncoder().encode(JSON.stringify(state));
      for (let i = 0; i < bytes.length; i += 16384) {
        const result = window.NexoNative.stateChunk(token, btoa(String.fromCharCode(...bytes.subarray(i, i + 16384))));
        if (result !== 'ok') throw new Error(result);
        if ((i / 16384) % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      await rpc('stateFinish', { token });
    },
    async fetchPlaylist(url, kind) { const result = await rpc('fetch', { url, kind }); const response = await fetch(origin + '/native/download/' + result.token); if (!response.ok) throw new Error('No se pudo leer el catálogo descargado.'); return { text: await response.text(), url: result.url }; }
  };
  window.androidHost = { play: options => rpc('play', options), program: options => rpc('program', options) };
  document.documentElement.classList.add('android-app');
  document.querySelector('.side-bottom small').textContent = 'Android · v' + androidVersion.name;
  setupAndroidDisplay();
  window.nexoAndroidBack = () => {
    const displayBack = window.nexoDisplayBack(); if (displayBack !== null) return displayBack;
    const dialog = document.querySelector('dialog[open]'); if (dialog) { dialog.close(); return true; }
    if (!document.querySelector('#series-detail').hidden) { document.querySelector('#close-series').click(); return true; }
    if (!document.querySelector('.app').hidden) { document.querySelector(document.querySelector('#home-view').hidden ? '[data-view="home"]' : '#change-account').click(); return true; }
    return false;
  };
  const visible = el => { const r = el?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !(document.documentElement.classList.contains('android-tv') && el.matches('.favorite')); };
  let lastFocus = null, focusScheduled = false;
  document.addEventListener('focusin', event => {
    const el = event.target;
    lastFocus = { id: el.id, label: el.getAttribute('aria-label'), category: el.matches('.category') ? el.textContent : null };
  });
  const restoreFocus = () => {
    focusScheduled = false;
    for (const star of document.querySelectorAll('.favorite')) star.tabIndex = document.documentElement.classList.contains('android-tv') ? -1 : 0;
    if (!document.documentElement.classList.contains('android-tv') || document.querySelector('#startup-intro') || document.documentElement.classList.contains('android-setup-pending')) return;
    if (document.activeElement !== document.body && visible(document.activeElement)) return;
    const scope = document.querySelector('dialog[open]') || document;
    const controls = [...scope.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(visible);
    const remembered = controls.find(el => (lastFocus?.id && el.id === lastFocus.id) || (lastFocus?.label && el.getAttribute('aria-label') === lastFocus.label) || (lastFocus?.category && el.matches('.category') && el.textContent === lastFocus.category));
    const preferred = controls.find(el => el.matches('.account-open,[data-open],.content-play,.episode,[data-display-mode]'));
    (remembered || preferred || controls[0])?.focus({ preventScroll: true });
  };
  new MutationObserver(() => { if (!focusScheduled) { focusScheduled = true; requestAnimationFrame(restoreFocus); } }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden','open'] });
  const hint = document.createElement('p'); hint.id = 'tv-remote-help'; hint.textContent = 'OK: abrir · Mantén OK presionado: agregar o quitar de favoritos';
  document.querySelector('#channels').before(hint);
  const feedback = document.createElement('span'); feedback.className = 'sr-only'; feedback.setAttribute('role','status'); document.body.append(feedback);
  let heldOK = null;
  const cancelHeldOK = () => { if (heldOK) clearTimeout(heldOK.timer); heldOK = null; };
  window.addEventListener('blur', cancelHeldOK);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHeldOK(); });
  document.addEventListener('keyup', event => {
    if (event.key !== 'Enter' || !heldOK) return;
    event.preventDefault(); const press = heldOK; cancelHeldOK();
    if (!press.long && press.target.isConnected && document.activeElement === press.target) press.target.click();
  });
  document.addEventListener('keydown', event => {
    if ((!document.documentElement.classList.contains('android-tv') && !document.querySelector('#display-mode-dialog[open]')) || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key)) return;
    if (document.activeElement?.matches('select') || (document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]),textarea') && !['ArrowUp','ArrowDown'].includes(event.key))) return;
    if (event.key === 'Enter' && (heldOK || document.activeElement?.matches('.content-play'))) {
      event.preventDefault();
      if (!heldOK && !event.repeat) {
        const target = document.activeElement, press = { target, long: false, timer: null }; heldOK = press;
        press.timer = setTimeout(() => {
          if (heldOK !== press || document.activeElement !== target || !target.isConnected) return;
          press.long = true; const star = target.closest('.content-card')?.querySelector('.favorite');
          if (star) { feedback.textContent = star.getAttribute('aria-pressed') === 'true' ? 'Quitado de favoritos' : 'Agregado a favoritos'; star.click(); }
        }, 650);
      }
      return;
    }
    if (event.key === 'Enter' && event.repeat) { event.preventDefault(); return; }
    if (event.key === 'Enter') { if (document.activeElement?.matches('button,a,input[type=checkbox],input[type=radio]')) { event.preventDefault(); document.activeElement.click(); } return; }
    const scope = document.querySelector('dialog[open]') || document;
    const candidates = [...scope.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(visible);
    const current = document.activeElement, rect = current?.getBoundingClientRect();
    if (!rect || !candidates.includes(current)) { candidates[0]?.focus(); event.preventDefault(); return; }
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2,horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    let best=null,score=Infinity;
    for(const el of candidates){if(el===current)continue;const r=el.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y,primary=(horizontal?dx:dy)*direction,cross=horizontal?dy:dx;if(primary<5)continue;const distance=primary*primary+cross*cross*4;if(distance<score){score=distance;best=el;}}
    if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'});}event.preventDefault();
  });
}
