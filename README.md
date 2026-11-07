# Nexo IPTV

Primera versión de un reproductor de escritorio para Windows 11 (x64), con interfaz propia en español inspirada en la navegación por biblioteca de los reproductores IPTV.

## Funciones

- Importación M3U/M3U8 por archivo o enlace HTTP/HTTPS, hasta 20 MB.
- Categorías, búsqueda sin distinción de acentos y favoritos.
- Reproducción HLS (`.m3u8`) mediante hls.js y formatos que soporte Chromium, como MP4 H.264/AAC.
- Controles de reproducción, volumen y pantalla completa.
- Lista y favoritos guardados localmente entre sesiones. La importación sustituye la lista actual; conserva favoritos cuyas URL siguen presentes.
- Renderizado por bloques de 120 canales para listas grandes.

No incluye canales ni suscripciones. No implementa todavía Xtream Codes, EPG, catálogo de series/películas, DRM ni reproducción MPEG-TS directa, RTSP o UDP. Algunas fuentes requieren cabeceras o códecs que esta versión no admite. Las fuentes HLS deben permitir las solicitudes CORS de segmentos y manifiestos; no se desactiva la seguridad del navegador para evitarlas. Una URL HLS sin extensión `.m3u8` no se detecta automáticamente en esta versión.

## Ejecutar en Windows 11

Instala Node.js 24 LTS y abre PowerShell dentro de esta carpeta:

```powershell
npm ci
npm start
```

Para crear una carpeta portable de Windows:

```powershell
npm run package:win
```

Abre `release/Nexo-IPTV-win32-x64/Nexo-IPTV.exe`. Conserva toda la carpeta junto al ejecutable; no funciona copiando solo el `.exe`. Este paquete no lleva firma digital ni instalador. La verificación final de reproducción y del ejecutable debe hacerse en Windows 11 con una lista de prueba autorizada.

## Desarrollo y pruebas

Usa el checkout existente; no necesitas crear un worktree. No se requieren servicios, credenciales ni variables de entorno para desarrollar.

```sh
npm ci
npm run dev     # interfaz en navegador; las listas remotas necesitan CORS
npm test        # parser y filtros
npm run build   # frontend para Electron
npm run test:ui # Chromium instalado, o CHROMIUM_PATH apuntando a su ejecutable
npm run test:hls # añade reproducción HLS H.264; requiere FFmpeg con libx264
npm start      # escritorio; Linux necesita sesión gráfica y bibliotecas de Electron
```

`test:ui` levanta y detiene su propio servidor de Vite y valida importación, búsqueda, categorías, favoritos, persistencia, errores y reproducción de un vídeo WebM generado localmente. Para usar el Chromium de Playwright: `npx playwright install chromium` y `CHROMIUM_PATH=playwright npm run test:ui`. En Linux, el empaquetado de Windows necesita acceso a las descargas oficiales de Electron.

## Datos locales

Las listas y favoritos se guardan en `localStorage` en el perfil de Electron (`%APPDATA%/nexo-iptv` en Windows). Los enlaces de proveedores pueden contener credenciales: se almacenan en ese perfil sin cifrado. No compartas el perfil ni subas listas privadas al repositorio. No hay telemetría ni servidor propio. Los logos y vídeos se solicitan directamente al proveedor. El almacenamiento local tiene una cuota: si una lista no cabe, se mantiene la anterior y se muestra un error.

## Estructura

- `electron/`: ventana aislada y puente limitado para descargar listas sin el CORS del navegador.
- `src/playlist.js`: lectura y filtrado de listas.
- `src/main.js`: biblioteca, persistencia y reproducción.
- `src/style.css`: interfaz adaptable.
- `tests/`: pruebas unitarias y funcionales.
