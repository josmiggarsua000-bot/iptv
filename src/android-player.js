export function createAndroidPlayer(video, { status, queue = () => [], program = () => null }) {
  let item = null, disposed = false;
  const open = async () => { if (!item || disposed) return; status('Abriendo reproductor Android…'); try { await window.androidHost.play({ item, queue: queue(), program: program(), mode: 'single' }); status('Reproducción nativa de Android. Pulsa para volver a abrir.'); } catch { status('No se pudo abrir el reproductor de Android.'); } };
  const button = document.createElement('button'); button.className = 'android-open-player'; button.textContent = '▶ Abrir reproductor'; button.onclick = open; video.parentElement.append(button);
  const selected = event => { item = event.detail; }; window.addEventListener('nexo:selection', selected);
  return { play(value) { item = value; return open(); }, destroy() { disposed = true; button.remove(); window.removeEventListener('nexo:selection', selected); }, isCompatibility: () => false, position: () => 0, duration: () => 0, audioDisabled: () => false, videoTracks: () => [], audioTracks: () => [], subtitleTracks: () => [], selectVideo() {}, selectAudio() {}, selectSubtitle() {}, seek() {}, enableCompatibility: open, addSubtitle: async () => { status('Carga SRT/VTT desde Ajustes en el reproductor Android.'); } };
}
export function setupAndroidMultiscreen(getAccount) {
  const $ = s => document.querySelector(s), slots = [null,null,null,null]; let target = 0;
  const render = () => {
    $('#multi-grid').replaceChildren();
    for(let i=0;i<4;i++){
      const card=document.createElement('article');card.className='multi-cell android-multi-cell';const name=document.createElement('h3');name.textContent=slots[i]?.name||`Pantalla ${i+1}`;
      const choose=document.createElement('button');choose.className='secondary';choose.textContent='Elegir canal';choose.onclick=()=>{target=i;$('#multi-choose-title').textContent=`Canal para pantalla ${i+1}`;$('#multi-search').value='';options();$('#multi-dialog').showModal();};
      const stop=document.createElement('button');stop.className='text-button';stop.textContent='Quitar';stop.onclick=()=>{slots[i]=null;render();};card.append(name,choose,stop);$('#multi-grid').append(card);
    }
    $('#multi-fullscreen').disabled=!slots.some(Boolean);$('#multi-fullscreen').textContent='▶ Abrir pantallas';
  };
  const options = () => { $('#multi-options').replaceChildren(); const query=$('#multi-search').value.toLocaleLowerCase();for(const item of (getAccount()?.items||[]).filter(i=>i.kind==='live'&&i.name.toLocaleLowerCase().includes(query)).slice(0,120)){const button=document.createElement('button');button.className='episode';button.textContent=item.name;button.onclick=()=>{slots[target]=item;$('#multi-dialog').close();render();};$('#multi-options').append(button);} };
  $('#multi-search').oninput=options;$('#multi-close').onclick=()=>$('#multi-dialog').close();
  $('#multi-fullscreen').onclick=()=>window.androidHost.play({items:slots,mode:'multi'}).catch(()=>{document.querySelector('#multi-limit').textContent='No se pudo abrir la reproducción múltiple.';});
  const stopAll=()=>{slots.fill(null);$('#multi-dialog').close();render();};$('#multi-stop').onclick=stopAll;render();return{stopAll};
}
