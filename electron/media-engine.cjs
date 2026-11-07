const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { StringDecoder } = require('node:string_decoder');
const textCodecs = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
function safeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('El motor solo admite enlaces HTTP/HTTPS sin credenciales incrustadas en el host.');
  return url.href;
}
function parseVtt(text) {
  const clock = value => value.split(':').reduce((sum, number) => sum * 60 + Number(number), 0);
  return text.replace(/\r/g, '').split(/\n\n+/).flatMap(block => {
    const match = /(?:^|\n)((?:\d+:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d+:)?\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*)/.exec(block);
    if (!match) return [];
    const start = clock(match[1]), end = clock(match[2]);
    return Number.isFinite(start) && end > start ? [{ start, end, text: match[3].replace(/<[^>]*>/g, '').slice(0, 8000) }] : [];
  });
}
function createMediaEngine({ ffmpegPath, ffprobePath, fetchImpl = fetch }) {
  let server, base, initializing;
  const sessions = new Map(), probes = new Set(), owners = new Map();
  const executable = value => value.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  async function initializeOnce() {
    if (base) return;
    server = http.createServer(handle);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  }
  // Restrict nested media protocols too: an HTTP playlist cannot open local files.
  const inputOptions = () => ['-protocol_whitelist', 'http,tcp,crypto', '-rw_timeout', '20000000'];
  function stopSession(id) {
    const s = sessions.get(id); if (!s) return;
    sessions.delete(id); s.job?.child.kill(); s.job?.response.destroy();
  }
  async function prepare(owner, address) {
    address = safeUrl(address);
    await (initializing ||= initializeOnce());
    const ticket = randomBytes(16).toString('hex'); owners.set(owner, ticket);
    for (const [id, s] of sessions) if (s.owner === owner) stopSession(id);
    for (const probe of probes) if (probe.owner === owner) probe.child.kill();
    const id = randomBytes(24).toString('hex');
    const record = { owner, address, metadata: null, job: null, revision: 0, cues: new Map(), error: '', resources: new Set([address]) }; sessions.set(id, record);
    let info;
    try {
      info = await new Promise((resolve, reject) => {
        const child = spawn(executable(ffprobePath), ['-v', 'error', ...inputOptions(), '-probesize', '8000000', '-analyzeduration', '5000000', '-show_streams', '-show_format', '-of', 'json', `${base}/${id}/input`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        const record = { owner, child }; probes.add(record); let output = '', bytes = 0;
        const timeout = setTimeout(() => child.kill(), 25000);
        child.stdout.on('data', data => { bytes += data.length; if (bytes > 2 * 1024 * 1024) child.kill(); else output += data; });
        child.once('error', () => reject(new Error('No se pudo iniciar el analizador multimedia. Comprueba que FFmpeg y FFprobe se instalaron y que Windows permite ejecutarlos.')));
        child.once('close', code => { clearTimeout(timeout); probes.delete(record); if (code !== 0) reject(new Error('No se pudieron analizar las pistas del proveedor. Se mantendrá disponible el reproductor normal.')); else { try { resolve(JSON.parse(output)); } catch { reject(new Error('Metadatos multimedia no válidos.')); } } });
      });
    } catch (error) { stopSession(id); if (owners.get(owner) !== ticket) throw new Error('Análisis cancelado al cambiar de contenido.'); throw error; }
    if (owners.get(owner) !== ticket) throw new Error('Análisis cancelado al cambiar de contenido.');
    const streams = (info.streams || []).filter(s => Number.isInteger(s.index)).slice(0, 64);
    const video = streams.filter(s => s.codec_type === 'video' && !s.disposition?.attached_pic).map(s => ({ id: s.index, codec: s.codec_name || '', width: s.width, height: s.height, label: `${s.codec_name || 'video'} · ${s.width || '?'} × ${s.height || '?'}`, default: !!s.disposition?.default }));
    const audio = streams.filter(s => s.codec_type === 'audio').map(s => ({ id: s.index, codec: s.codec_name || '', language: s.tags?.language || '', label: [s.tags?.title, s.tags?.language, s.codec_name, s.channels ? `${s.channels} canales` : '', s.sample_rate ? `${s.sample_rate} Hz` : ''].filter(Boolean).join(' · '), default: !!s.disposition?.default }));
    let subtitleCount = 0;
    const subtitles = streams.filter(s => s.codec_type === 'subtitle').map(s => ({ id: s.index, codec: s.codec_name, language: s.tags?.language || '', label: [s.tags?.title, s.tags?.language || 'Sin idioma', s.codec_name].filter(Boolean).join(' · '), supported: textCodecs.has(s.codec_name) && subtitleCount++ < 16 }));
    const duration = Number(info.format?.duration) || 0;
    const needsCompatibility = audio.some(s => !['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(s.codec)) || /matroska/i.test(info.format?.format_name || '') || subtitles.some(s => s.supported) || video.some(s => !['h264', 'vp8', 'vp9', 'av1'].includes(s.codec));
    if (!video.length) { stopSession(id); throw new Error('La fuente no tiene una pista de video reproducible.'); }
    const metadata = { id, video, audio, subtitles, duration, needsCompatibility };
    record.metadata = metadata;
    return metadata;
  }
  const session = (owner, id) => { const s = sessions.get(id); if (!s || s.owner !== owner) throw new Error('La sesión multimedia terminó.'); return s; };
  function source(owner, id, options = {}) {
    const s = session(owner, id);
    const video = Number(options.video), audio = Number(options.audio), offset = Number(options.offset || 0);
    if (!s.metadata.video.some(t => t.id === video) || (audio !== -1 && !s.metadata.audio.some(t => t.id === audio))) throw new Error('Selecciona una pista multimedia válida.');
    if (!Number.isFinite(offset) || offset < 0 || (s.metadata.duration && offset >= s.metadata.duration)) throw new Error('La posición de reproducción no es válida.');
    s.job?.child.kill(); s.job?.response.destroy(); s.job = null; s.cues.clear(); s.error = '';
    const revision = ++s.revision;
    return { url: `${base}/${id}/stream.mp4?v=${video}&a=${audio}&offset=${offset}&revision=${revision}`, revision, offset };
  }
  // FFmpeg only reads our loopback relay. HTTPS, redirects and certificate
  // verification stay in Electron net.fetch (or Node fetch in tests).
  async function relay(req, res, s, id, url) {
    const address = url.searchParams.get('resource') || s.address;
    if (!s.resources.has(address)) { res.writeHead(403); res.end(); return; }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    res.once('close', () => controller.abort());
    try {
      const headers = {}; if (req.headers.range) headers.Range = req.headers.range;
      const response = await fetchImpl(address, { headers, signal: controller.signal, method: req.method });
      clearTimeout(timer);
      res.statusCode = response.status;
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
      if (response.headers.has('content-encoding')) res.removeHeader('content-length');
      if (!response.body || req.method === 'HEAD') { res.end(); return; }
      const reader = response.body.getReader(), first = await reader.read();
      const prefix = Buffer.from(first.value || []).toString('utf8').replace(/^\uFEFF/, '').trimStart();
      if (prefix.startsWith('#EXTM3U')) {
        let text = Buffer.from(first.value).toString('utf8'), size = first.value.length;
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 2 * 1024 * 1024) throw new Error('Playlist too large'); text += Buffer.from(chunk.value).toString('utf8'); } } finally { await reader.cancel(); }
        const resource = value => {
          const target = safeUrl(new URL(value, response.url || address).href);
          if (s.resources.size > 10000) for (const old of s.resources) { if (old !== s.address) { s.resources.delete(old); break; } }
          s.resources.add(target); return `${base}/${id}/input?resource=${encodeURIComponent(target)}`;
        };
        text = text.split(/\r?\n/).map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_, value) => `URI="${resource(value)}"`) : line.trim() ? resource(line.trim()) : line).join('\n');
        res.removeHeader('content-length'); res.removeHeader('content-range'); res.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); res.end(text); return;
      }
      async function* body() { try { if (first.value) yield Buffer.from(first.value); while (true) { const chunk = await reader.read(); if (chunk.done) break; yield Buffer.from(chunk.value); } } finally { await reader.cancel().catch(() => {}); } }
      const stream = Readable.from(body()); stream.once('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res);
    } catch { clearTimeout(timer); if (!res.headersSent) { res.writeHead(502); res.end(); } else res.destroy(); }
  }
  function handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'null'); res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://127.0.0.1');
    const [, id, route, indexString] = url.pathname.split('/'), s = sessions.get(id);
    if (!s) { res.writeHead(404); res.end(); return; }
    if (route === 'input' && ['GET', 'HEAD'].includes(req.method)) { void relay(req, res, s, id, url); return; }
    if (!s.metadata) { res.writeHead(409); res.end(); return; }
    if (route === 'subtitle' && req.method === 'POST') {
      const index = Number(indexString), revision = Number(url.searchParams.get('revision'));
      if (revision !== s.revision || !s.metadata.subtitles.some(t => t.id === index && t.supported)) { res.writeHead(403); res.end(); return; }
      let text = '', bytes = 0; const decoder = new StringDecoder('utf8'); const cues = []; s.cues.set(index, cues);
      res.writeHead(200); res.flushHeaders();
      req.on('data', chunk => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) req.destroy(); else { text += decoder.write(chunk); const boundary = text.lastIndexOf('\n\n'); if (boundary >= 0) { const complete = text.slice(0, boundary + 2); text = text.slice(boundary + 2); if (cues.length < 5000) cues.push(...parseVtt(complete).slice(0, 5000 - cues.length)); } } });
      req.on('end', () => { text += decoder.end(); if (cues.length < 5000) cues.push(...parseVtt(text).slice(0, 5000 - cues.length)); res.end(); }); req.on('error', () => {}); return;
    }
    if (route !== 'stream.mp4' || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    if (Number(url.searchParams.get('revision')) !== s.revision) { res.writeHead(410); res.end(); return; }
    res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'none');
    if (req.method === 'HEAD') { res.end(); return; }
    if (s.job) { res.writeHead(409); res.end(); return; }
    const videoId = Number(url.searchParams.get('v')), audioId = Number(url.searchParams.get('a')), offset = Number(url.searchParams.get('offset'));
    if (!s.metadata.video.some(t => t.id === videoId) || (audioId !== -1 && !s.metadata.audio.some(t => t.id === audioId)) || !Number.isFinite(offset) || offset < 0) { res.writeHead(400); res.end(); return; }
    const video = s.metadata.video.find(t => t.id === videoId);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputOptions(), '-re', ...(offset ? ['-ss', String(offset)] : []), '-i', `${base}/${id}/input`, '-map', `0:${videoId}`, ...(audioId < 0 ? ['-an'] : ['-map', `0:${audioId}`, '-c:a', 'aac', '-b:a', '192k', '-ac', '2']), '-c:v', video.codec === 'h264' ? 'copy' : 'libx264', ...(video.codec === 'h264' ? [] : ['-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2']), '-sn', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', '-f', 'mp4', 'pipe:1'];
    for (const sub of s.metadata.subtitles.filter(t => t.supported).slice(0, 16)) args.push('-map', `0:${sub.id}`, '-vn', '-an', '-c:s', 'webvtt', '-flush_packets', '1', '-f', 'webvtt', '-method', 'POST', `${base}/${id}/subtitle/${sub.id}?revision=${s.revision}`);
    const child = spawn(executable(ffmpegPath), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const job = { child, response: res }; s.job = job;
    child.stdout.pipe(res);
    child.once('error', () => { s.error = 'Windows no permitió iniciar el decodificador multimedia.'; res.destroy(); });
    child.once('close', code => { if (s.job === job) s.job = null; if (code && !res.destroyed) { s.error = 'El motor no pudo decodificar la señal o el proveedor cerró la conexión.'; res.destroy(); } });
    res.once('close', () => child.kill());
  }
  return {
    prepare, source,
    cues(owner, id, cursors = {}) { const s = session(owner, id); return { revision: s.revision, tracks: [...s.cues].map(([id, cues]) => ({ id, cues: cues.slice(Math.max(0, Math.min(cues.length, Number(cursors[id]) || 0))), count: cues.length })), error: s.error }; },
    stop(owner, id) { if (sessions.get(id)?.owner === owner) stopSession(id); },
    async close() { for (const probe of probes) probe.child.kill(); for (const id of sessions.keys()) stopSession(id); if (server) { const closing = server; server = null; base = null; closing.closeAllConnections(); await new Promise(resolve => closing.close(resolve)); } }
  };
}
module.exports = { createMediaEngine, parseVtt };
