import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import probe from 'ffprobe-static';
import { createMediaEngine, parseVtt } from '../electron/media-engine.cjs';
test('Compatibilidad real: detecta AC3 español/inglés, reproduce la pista elegida como AAC y extrae subtítulos', { timeout: 40000 }, async () => {
  const bytes = await readFile(new URL('./fixtures/dual-ac3-subtitles.mkv', import.meta.url));
  const server = createServer((req, res) => {
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start >= bytes.length) { res.writeHead(416); res.end(); return; }
    res.setHeader('Content-Type', 'video/x-matroska'); res.setHeader('Accept-Ranges', 'bytes');
    if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`); }
    res.setHeader('Content-Length', end - start + 1); res.end(bytes.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'nexo-media-test-'));
  const engine = createMediaEngine({ ffmpegPath: ffmpeg, ffprobePath: probe.path, directory });
  try {
    const media = await engine.prepare(1, `http://127.0.0.1:${server.address().port}/movie.mkv`);
    assert.equal(media.needsCompatibility, true);
    assert.deepEqual(media.audio.map(t => [t.codec, t.language]), [['ac3', 'spa'], ['ac3', 'eng']]);
    assert.equal(media.subtitles[0].supported, true);
    const audio = media.audio.find(t => t.language === 'eng');
    const source = engine.source(1, media.id, { audio: audio.id, video: media.video[0].id });
    const response = await fetch(source.url);
    assert.equal(response.ok, true);
    const output = join(directory, 'output.mp4');
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    const metadata = JSON.parse(execFileSync(probe.path, ['-v', 'error', '-show_streams', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
    assert.equal(metadata.streams.find(t => t.codec_type === 'audio').codec_name, 'aac');
    const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    let crossings = 0, energy = 0;
    for (let i = 4; i < pcm.length; i += 4) { const previous = pcm.readFloatLE(i - 4), current = pcm.readFloatLE(i); if (previous * current < 0) crossings++; energy += current * current; }
    const hz = crossings / (2 * (pcm.length / 4 / 8000));
    assert.ok(hz > 800 && hz < 950, `La pista inglesa debe contener la señal de 880 Hz, no la de 440 Hz: ${hz}`);
    assert.ok(energy > 1, 'El audio decodificado no debe ser silencio');
    const cues = engine.cues(1, media.id).tracks.flatMap(t => t.cues);
    assert.ok(cues.some(c => c.text.includes('Subtítulo español integrado')));
    assert.throws(() => engine.source(2, media.id, { audio: audio.id, video: media.video[0].id }), /sesión/);
    assert.throws(() => engine.source(1, media.id, { audio: 99999, video: media.video[0].id }), /pista/);
    engine.stop(1, media.id);
    assert.equal((await fetch(source.url)).status, 404);
    await assert.rejects(engine.prepare(1, 'file:///private'), /HTTP/);
  } finally { await engine.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
test('El lector WebVTT conserva idiomas y tiempos sin ejecutar etiquetas', () => {
  const cues = parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<i>Español</i>\n\n');
  assert.deepEqual(cues, [{ start: 1, end: 3, text: 'Español' }]);
});
