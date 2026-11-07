const names = { spa: 'Español', es: 'Español', eng: 'Inglés', en: 'Inglés', por: 'Portugués', pt: 'Portugués', fra: 'Francés', fr: 'Francés', ita: 'Italiano', it: 'Italiano', deu: 'Alemán', de: 'Alemán' };
function title(track) { return `${names[track.language] || track.language || 'Sin idioma'} · ${track.label || track.codec || 'Pista'}`; }
export function createCompatibilityPlayer(video, media, { status, changed }) {
  let disposed = false, revision = 0, offset = 0, restartSerial = 0, pollBusy = false;
  let audioId = (media.audio.find(t => ['spa', 'es'].includes(t.language)) || media.audio.find(t => t.default) || media.audio[0])?.id ?? -1;
  let videoId = (media.video.find(t => t.default) || media.video[0]).id;
  const tracks = new Map(), cursors = {};
  for (const sub of media.subtitles.filter(t => t.supported)) {
    const element = document.createElement('track'); element.kind = 'subtitles'; element.label = title(sub); element.srclang = sub.language || 'und'; video.append(element); element.track.mode = 'disabled'; tracks.set(sub.id, element);
  }
  function clearCues() {
    for (const element of tracks.values()) for (const cue of Array.from(element.track.cues || [])) element.track.removeCue(cue);
    for (const key of Object.keys(cursors)) delete cursors[key];
  }
  async function restart(position = 0) {
    const serial = ++restartSerial;
    const maximum = media.duration ? Math.max(0, media.duration - 0.2) : Infinity;
    position = Math.max(0, Math.min(position, maximum));
    status('Preparando audio compatible y pistas integradas…');
    video.pause(); video.removeAttribute('src'); video.load();
    try {
      const source = await window.desktop.mediaSource(media.id, { video: videoId, audio: audioId, offset: position });
      if (disposed || serial !== restartSerial) return;
      offset = source.offset; revision = source.revision; clearCues();
      video.controls = false; video.src = source.url; changed();
      await video.play();
    } catch { if (!disposed && serial === restartSerial) status('No se pudo iniciar la compatibilidad local. Revisa el enlace y que Windows permita ejecutar el motor incluido.'); }
  }
  const interval = setInterval(async () => {
    if (disposed || pollBusy || !revision) return; pollBusy = true;
    try {
      const response = await window.desktop.mediaCues(media.id, { ...cursors });
      if (disposed || response.revision !== revision) return;
      for (const track of response.tracks) {
        const element = tracks.get(track.id); if (!element) continue;
        for (const cue of track.cues) { const item = new VTTCue(cue.start, cue.end, cue.text); item.line = -4; element.track.addCue(item); }
        cursors[track.id] = track.count;
      }
      if (response.error) status(response.error);
    } catch { if (!disposed) status('La sesión del motor multimedia terminó. Vuelve a abrir el contenido.'); }
    finally { pollBusy = false; }
  }, 500);
  return {
    play: restart,
    position() { return Math.min(media.duration || Infinity, offset + (video.currentTime || 0)); },
    offset() { return offset; }, duration() { return media.duration; },
    audioTracks() { return media.audio.map(t => ({ id: `compat:${t.id}`, label: title(t), selected: audioId === t.id && !video.muted })); },
    selectAudio(id) {
      if (id === 'off') { video.muted = true; changed(); return; }
      const value = Number(id.replace('compat:', '')); if (!media.audio.some(t => t.id === value)) return;
      video.muted = false;
      if (value !== audioId) { audioId = value; void restart(offset + (video.currentTime || 0)); } else changed();
    },
    videoTracks() { return media.video.map(t => ({ id: `compat:${t.id}`, label: t.label, selected: videoId === t.id })); },
    selectVideo(id) { const value = Number(id.replace('compat:', '')); if (media.video.some(t => t.id === value) && value !== videoId) { videoId = value; void restart(offset + (video.currentTime || 0)); } },
    subtitleTracks() { return media.subtitles.map(t => ({ id: `compat-s:${t.id}`, label: title(t) + (t.supported ? '' : ' · requiere reproductor externo'), disabled: !t.supported, selected: tracks.get(t.id)?.track.mode === 'showing' })); },
    selectSubtitle(id) { for (const [index, element] of tracks) element.track.mode = id === `compat-s:${index}` ? 'showing' : 'disabled'; changed(); },
    destroy() { disposed = true; clearInterval(interval); for (const element of tracks.values()) { element.track.mode = 'disabled'; element.remove(); } void window.desktop.mediaStop(media.id).catch(() => {}); }
  };
}
