import Hls from 'hls.js';
import { createAndroidPlayer } from './android-player.js';
import mpegts from 'mpegts.js';
import { subtitleVtt } from './subtitles.js';
import { createCompatibilityPlayer } from './compat-player.js';
import { transport } from './transport.js';
mpegts.LoggingControl.enableAll = false;
export function createPlayer(video, { status = () => {}, changed = () => {}, queue, program } = {}) {
  if (window.androidHost) return createAndroidPlayer(video, { status, changed, queue, program });
  let hls = null, ts = null, disposed = false, externalTrack = null, externalUrl = null, compat = null, prepared = null, currentItem = null, sourceHint = '', externalCues = null, externalOffset = NaN;
  const listeners = [];
  const on = (target, name, listener) => { target?.addEventListener(name, listener); listeners.push(() => target?.removeEventListener(name, listener)); };
  const report = text => { if (!disposed) status(text); };
  const tracksChanged = () => { if (!disposed) { adjustExternal(); changed(); } };
  function adjustExternal() {
    const offset = compat?.offset() || 0;
    if (!externalTrack || !externalCues || offset === externalOffset) return;
    externalOffset = offset; const track = externalTrack.track;
    for (const cue of Array.from(track.cues || [])) track.removeCue(cue);
    for (const cue of externalCues) if (cue.end > offset) track.addCue(new VTTCue(Math.max(0, cue.start - offset), cue.end - offset, cue.text));
  }
  on(video, 'playing', () => report('Reproduciendo'));
  on(video, 'waiting', () => report('Cargando señal…'));
  on(video, 'error', () => report('Formato o códec no compatible, o señal no disponible. Prueba otra pista de audio o Abrir en VLC.'));
  on(video, 'loadedmetadata', tracksChanged);
  on(video, 'volumechange', tracksChanged);
  on(video.videoTracks, 'change', tracksChanged);
  for (const list of [video.audioTracks, video.textTracks]) for (const event of ['addtrack', 'removetrack', 'change']) on(list, event, tracksChanged);
  const label = (track, index) => [track.name || track.label || `Pista ${index + 1}`, track.lang || track.language].filter(Boolean).join(' · ');
  const start = () => video.play().catch(error => { if (error.name !== 'AbortError') report('Pulsa reproducir para iniciar. Si no suena, elige otra pista o usa VLC para códecs no compatibles.'); });
  const api = {
    async play(item, source) {
      currentItem = item; sourceHint = source;
      if (window.desktop?.mediaPrepare && ['movie', 'episode'].includes(item.kind)) {
        report('Analizando pistas de audio y subtítulos…');
        try {
          const media = await window.desktop.mediaPrepare(item.url);
          if (disposed) { await window.desktop.mediaStop(media.id); return; }
          prepared = media;
          if (media.needsCompatibility) { await api.enableCompatibility(); return; }
        } catch { if (disposed) return; report('El análisis no está disponible. Probando el motor normal…'); }
      }
      if (!disposed) api.nativePlay(item, source);
    },
    async enableCompatibility() {
      if (compat || !currentItem) return;
      if (!window.desktop?.mediaPrepare) { report('El modo compatible AC3 está disponible en la aplicación de escritorio.'); return; }
      const position = video.currentTime || 0;
      report('Activando motor compatible…'); video.pause();
      try {
        const media = prepared || await window.desktop.mediaPrepare(currentItem.url);
        if (disposed) { await window.desktop.mediaStop(media.id); return; }
        prepared = media; hls?.destroy(); hls = null; ts?.destroy(); ts = null;
        compat = createCompatibilityPlayer(video, media, { status: report, changed: tracksChanged });
        video.muted = false; tracksChanged(); await compat.play(position);
      } catch { report('No se pudo activar el motor compatible. Comprueba la instalación y los permisos de FFmpeg/FFprobe en Windows.'); }
    },
    isCompatibility() { return !!compat; },
    position() { return compat ? compat.position() : video.currentTime || 0; },
    duration() { return compat ? compat.duration() : Number.isFinite(video.duration) ? video.duration : 0; },
    seek(position) { if (compat) void compat.play(position); else video.currentTime = position; },
    audioDisabled() { return video.muted; },
    nativePlay(item, source) {
      video.controls = true;
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
    videoTracks() {
      if (compat) return compat.videoTracks();
      if (hls?.levels.length) return [{ id: 'auto', label: 'Calidad automática', selected: hls.autoLevelEnabled }, ...hls.levels.map((level, i) => ({ id: String(i), label: `${level.height || '?'}p${level.bitrate ? ' · ' + Math.round(level.bitrate / 1000) + ' kb/s' : ''}`, selected: !hls.autoLevelEnabled && hls.currentLevel === i }))];
      return Array.from(video.videoTracks || []).map((t, i) => ({ id: String(i), label: label(t, i), selected: t.selected }));
    },
    selectVideo(id) {
      if (compat) { compat.selectVideo(id); return; }
      if (hls) hls.currentLevel = id === 'auto' ? -1 : Number(id);
      else Array.from(video.videoTracks || []).forEach((t, i) => { t.selected = String(i) === id; });
      tracksChanged();
    },
    audioTracks() {
      if (compat) return compat.audioTracks();
      if (hls?.audioTracks.length) return hls.audioTracks.map((t, i) => ({ id: String(i), label: label(t, i), selected: i === hls.audioTrack && !video.muted }));
      return Array.from(video.audioTracks || []).map((t, i) => ({ id: String(i), label: label(t, i), selected: t.enabled && !video.muted }));
    },
    selectAudio(id) {
      if (compat) { compat.selectAudio(id); return; }
      if (id === 'off') { video.muted = true; tracksChanged(); return; }
      video.muted = false;
      if (hls?.audioTracks.length) { hls.audioTrack = Number(id); }
      else Array.from(video.audioTracks || []).forEach((t, i) => { t.enabled = String(i) === id; });
      tracksChanged();
    },
    subtitleTracks() {
      if (compat) return [...compat.subtitleTracks(), ...Array.from(video.textTracks).flatMap((t, i) => externalTrack?.track === t ? [{ id: `text:${i}`, label: label(t, i), selected: t.mode === 'showing' }] : [])];
      const tracks = hls?.subtitleTracks.length ? hls.subtitleTracks.map((t, i) => ({ id: `hls:${i}`, label: label(t, i), selected: hls.subtitleTrack === i && hls.subtitleDisplay })) : [];
      Array.from(video.textTracks).forEach((t, i) => { if (!hls?.subtitleTracks.length || externalTrack?.track === t) tracks.push({ id: `text:${i}`, label: label(t, i), selected: t.mode === 'showing' }); });
      return tracks;
    },
    selectSubtitle(id) {
      if (compat) {
        compat.selectSubtitle(id);
        if (externalTrack) externalTrack.track.mode = id === `text:${Array.from(video.textTracks).indexOf(externalTrack.track)}` ? 'showing' : 'disabled';
        tracksChanged(); return;
      }
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
        track.onload = () => { externalCues = Array.from(track.track.cues || []).map(cue => ({ start: cue.startTime, end: cue.endTime, text: cue.text })); externalOffset = NaN; adjustExternal(); resolve(); }; track.onerror = () => reject(new Error('No se pudo cargar el subtítulo.'));
        video.append(track); track.track.mode = 'hidden';
      });
      if (disposed) return;
      api.selectSubtitle(`text:${Array.from(video.textTracks).indexOf(track.track)}`);
    },
    destroy() {
      disposed = true; compat?.destroy(); if (prepared && !compat) void window.desktop.mediaStop(prepared.id).catch(() => {}); listeners.forEach(remove => remove()); hls?.destroy(); ts?.destroy();
      externalTrack?.remove(); if (externalUrl) URL.revokeObjectURL(externalUrl);
      video.controls = true; video.pause(); video.removeAttribute('src'); video.load();
    }
  };
  return api;
}
