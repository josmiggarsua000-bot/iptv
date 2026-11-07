export async function requestText(address) {
  if (window.desktop) return window.desktop.fetchPlaylist(address);
  const response = await fetch(address, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}. El proveedor no pudo completar la solicitud.`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 20 * 1024 * 1024) throw new Error('El catálogo supera el límite de 20 MB.');
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
  if (/fetch|network|timeout|abort|ENOTFOUND|ECONN|ERR_/i.test(message)) return 'No se pudo conectar. Comprueba el servidor y tu conexión. En navegador, el proveedor debe permitir CORS.';
  if (/QuotaExceededError/.test(error?.name)) return 'No hay espacio local suficiente. Los datos anteriores se conservan.';
  // Never render URLs containing provider credentials from a transport exception.
  return message.replace(/https?:\/\/[^\s]+/g, '[servidor]');
}
