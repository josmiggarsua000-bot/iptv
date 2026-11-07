export function subtitleVtt(text) {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT(?:\s|$)/.test(input)) return input;
  if (!/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(input)) throw new Error('Selecciona subtítulos WebVTT (.vtt) o SubRip (.srt) válidos.');
  return 'WEBVTT\n\n' + input.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}
