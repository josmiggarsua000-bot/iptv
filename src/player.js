import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { subtitleVtt } from './subtitles.js';
import { transport } from './transport.js';
mpegts.LoggingControl.enableAll = false;
export function createPlayer(video, { status = () => {}, changed = () => {} } = {}) {
  let hls = null, ts = null, disposed = false, externalTrack = null, externalUrl = null;
  const listeners = [];
  const on = (target, name, listener) => { target?.addEventListener(name, listener); listeners.push(() => target?.removeEventListener(name, listener)); };
  const report = text => { if (!disposed) status(text); };
  const tracksChanged = () => { if (!disposed) changed(); };
  on(video, 'playing', () => report('Reproduciendo'));
  on(video, 'waiting', () => report('Cargando señal…'));
  on(video, 'error', () => report('Formato o códec no compatible, o señal no disponible. Prueba otra pista de audio o Abrir en VLC.'));
  on(video, 'loadedmetadata', tracksChanged);
  for (const list of [video.audioTracks, video.textTracks]) for (const event of ['addtrack', 'removetrack', 'change']) on(list, event, tracksChanged);
  const label = (track, index) => [track.name || track.label || `Pista ${index + 1}`, track.lang || track.language].filter(Boolean).join(' · ');
  const start = () => video.play().catch(error => { if (error.name !== 'AbortError') report('Pulsa reproducir para iniciar. Si no suena, elige otra pista o usa VLC para códecs no compatibles.'); });
  const api = {
    play(item, source) {
      const type = transport(item, source); report('Conectando con la señal…');
      if (type === 'hls' && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        for (const event of [Hls.Events.AUDIO_TRACKS_UPDATED, Hls.Events.AUDIO_TRACK_SWITCHED, Hls.Events.SUBTITLE_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACK_SWITCH]) hls.on(event, tracksChanged);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { tracksChanged(); start(); });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) report('No se pudo reproducir HLS. Comprueba la señal, CORS y los códecs; prueba VLC si el audio no es compatible.');
          else if (/audio.*(codec|error)|bufferAddCodecError/i.test(data.details || '')) report('La pista de audio puede no ser compatible. Selecciona otra pista o abre el contenido en VLC.');
        });
        hls.loadSource(item.url); hls.attachMedia(video);
      } else if (type === 'mpegts' && mpegts.isSupported()) {
        ts = mpegts.createPlayer({ type: 'mpegts', url: item.url, isLive: item.kind === 'live' }, { enableWorker: false, lazyLoad: false });
        ts.on(mpegts.Events.ERROR, () => report('No se pudo reproducir MPEG-TS. Comprueba CORS, la señal y los códecs; puedes probar en VLC.'));
        ts.attachMediaElement(video); ts.load(); start();
      } else { video.src = item.url; start(); }
    },
    audioTracks() {
      if (hls?.audioTracks.length) return hls.audioTracks.map((t, i) => ({ id: String(i), label: label(t, i), selected: i === hls.audioTrack }));
      return Array.from(video.audioTracks || []).map((t, i) => ({ id: String(i), label: label(t, i), selected: t.enabled }));
    },
    selectAudio(id) {
      if (hls?.audioTracks.length) { hls.audioTrack = Number(id); }
      else Array.from(video.audioTracks || []).forEach((t, i) => { t.enabled = String(i) === id; });
      tracksChanged();
    },
    subtitleTracks() {
      const tracks = hls?.subtitleTracks.length ? hls.subtitleTracks.map((t, i) => ({ id: `hls:${i}`, label: label(t, i), selected: hls.subtitleTrack === i && hls.subtitleDisplay })) : [];
      Array.from(video.textTracks).forEach((t, i) => { if (!hls?.subtitleTracks.length || externalTrack?.track === t) tracks.push({ id: `text:${i}`, label: label(t, i), selected: t.mode === 'showing' }); });
      return tracks;
    },
    selectSubtitle(id) {
      Array.from(video.textTracks).forEach((t, i) => { t.mode = id === `text:${i}` ? 'showing' : 'disabled'; });
      if (hls) { hls.subtitleTrack = id.startsWith('hls:') ? Number(id.slice(4)) : -1; hls.subtitleDisplay = id.startsWith('hls:'); }
      tracksChanged();
    },
    async addSubtitle(file) {
      if (file.size > 5 * 1024 * 1024) throw new Error('El subtítulo supera el límite de 5 MB.');
      const vtt = subtitleVtt(await file.text());
      if (disposed) return;
      externalTrack?.remove(); if (externalUrl) URL.revokeObjectURL(externalUrl);
      externalUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      const track = document.createElement('track'); track.kind = 'subtitles'; track.label = file.name; track.srclang = 'es'; track.src = externalUrl;
      externalTrack = track;
      await new Promise((resolve, reject) => {
        track.onload = resolve; track.onerror = () => reject(new Error('No se pudo cargar el subtítulo.'));
        video.append(track); track.track.mode = 'hidden';
      });
      if (disposed) return;
      api.selectSubtitle(`text:${Array.from(video.textTracks).indexOf(track.track)}`);
    },
    destroy() {
      disposed = true; listeners.forEach(remove => remove()); hls?.destroy(); ts?.destroy();
      externalTrack?.remove(); if (externalUrl) URL.revokeObjectURL(externalUrl);
      video.pause(); video.removeAttribute('src'); video.load();
    }
  };
  return api;
}
