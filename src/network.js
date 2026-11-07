export async function requestText(address, kind) {
  if (window.desktop?.fetchPlaylist) return window.desktop.fetchPlaylist(address, kind);
  const response = await fetch(address, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}. El proveedor no pudo completar la solicitud.`);
  let body = response.body;
  if (/\.gz(?:[?#]|$)/i.test(response.url) && !response.headers.get('content-encoding')) body = body.pipeThrough(new DecompressionStream('gzip'));
  const reader = body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > (kind === 'epg' ? 128 : 64) * 1024 * 1024) throw new Error('La descarga supera el límite de tamaño (64 MB para catálogos, 128 MB para EPG).');
      text += decoder.decode(value, { stream: true });
    }
    return { text: text + decoder.decode(), url: response.url };
  } finally { await reader.cancel(); }
}
export async function requestJson(url) {
  const { text } = await requestText(url);
  try { return JSON.parse(text); } catch { throw new Error('El servidor no devolvió una respuesta Xtream válida.'); }
}
export function friendlyError(error) {
  const message = String(error?.message || 'Error desconocido');
  if (/fetch failed|Failed to fetch|network error|NetworkError|ENOTFOUND|ECONN|ERR_/i.test(message)) return 'No se pudo conectar. Comprueba el servidor y tu conexión. En navegador, el proveedor debe permitir CORS.';
  if (/timeout|abort/i.test(error?.name)) return 'El proveedor tardó demasiado en responder. Vuelve a intentarlo.';
  if (/QuotaExceededError/.test(error?.name)) return 'No hay espacio local suficiente. Los datos anteriores se conservan.';
  // Never render URLs containing provider credentials from a transport exception.
  return message.replace(/https?:\/\/[^\s]+/g, '[servidor]');
}
