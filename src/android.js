import './android.css';
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
  document.querySelector('.side-bottom small').textContent = 'Android · v0.1.0';
  if (window.NexoNative.isTv()) document.documentElement.classList.add('android-tv');
  window.nexoAndroidBack = () => {
    const dialog = document.querySelector('dialog[open]'); if (dialog) { dialog.close(); return true; }
    if (!document.querySelector('#series-detail').hidden) { document.querySelector('#close-series').click(); return true; }
    if (!document.querySelector('.app').hidden) { document.querySelector(document.querySelector('#home-view').hidden ? '[data-view="home"]' : '#change-account').click(); return true; }
    return false;
  };
  document.addEventListener('keydown', event => {
    if (!document.documentElement.classList.contains('android-tv') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key)) return;
    if (document.activeElement?.matches('input,select,textarea')) return;
    if (event.key === 'Enter') { if (document.activeElement?.matches('button,a')) { event.preventDefault(); document.activeElement.click(); } return; }
    const scope = document.querySelector('dialog[open]') || document;
    const candidates = [...scope.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden'; });
    const current = document.activeElement, rect = current?.getBoundingClientRect();
    if (!rect || !candidates.includes(current)) { candidates[0]?.focus(); event.preventDefault(); return; }
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2,horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    let best=null,score=Infinity;
    for(const el of candidates){if(el===current)continue;const r=el.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y,primary=(horizontal?dx:dy)*direction,cross=horizontal?dy:dx;if(primary<5)continue;const distance=primary*primary+cross*cross*4;if(distance<score){score=distance;best=el;}}
    if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'});}event.preventDefault();
  });
}
