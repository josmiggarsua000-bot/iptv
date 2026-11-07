const { gunzipSync } = require('node:zlib');
async function fetchText(address, { fetchImpl = fetch, epg = false, timeout = 120000, maxBytes = (epg ? 128 : 64) * 1024 * 1024 } = {}) {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se admiten enlaces HTTP o HTTPS.');
  try {
    const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`El proveedor respondió con HTTP ${response.status}${response.status === 403 ? ': acceso rechazado. Comprueba los permisos y la vigencia de la cuenta.' : response.status === 401 ? ': usuario o contraseña rechazados.' : '.'}`);
    const reader = response.body.getReader(), chunks = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error(`La descarga supera el límite de ${maxBytes / 1024 / 1024} MB.`);
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    let data = Buffer.concat(chunks);
    if (data[0] === 0x1f && data[1] === 0x8b) {
      try { data = gunzipSync(data, { maxOutputLength: maxBytes }); }
      catch { throw new Error('El archivo GZIP está dañado o supera el límite de tamaño descomprimido.'); }
    }
    return { text: data.toString('utf8'), url: response.url || url.href };
  } catch (error) {
    if (/Timeout|Abort/i.test(error.name)) throw new Error('El proveedor tardó demasiado en responder (límite de descarga: 120 segundos).');
    if (error instanceof TypeError || error.cause) throw new Error('No se pudo conectar al proveedor. Comprueba el servidor, el puerto, la conexión y si el proveedor permite este dispositivo.');
    throw error;
  }
}
module.exports = { fetchText };
