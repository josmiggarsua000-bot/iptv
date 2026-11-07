export function transport(item, source = '') {
  const path = new URL(item.url).pathname;
  if (/\.m3u8$/i.test(path)) return 'hls';
  if (/\.ts$/i.test(path)) return 'mpegts';
  let output = ''; try { output = new URL(source).searchParams.get('output'); } catch {}
  if (item.kind === 'live' && !/\.(mp4|webm|mkv|avi)$/i.test(path)) return output === 'm3u8' ? 'hls' : output === 'ts' || /^\/(?:live\/)?[^/]+\/[^/]+\/\d+$/.test(path) ? 'mpegts' : 'native';
  return 'native';
}
