# Nexo IPTV

Reproductor de escritorio para Windows 11 x64, con interfaz en español y diseño cyberpunk.

## Empezar

Al abrir el programa aparece el selector de cuentas. Si todavía no hay ninguna, solo se muestra **Agregar cuenta**. Las cuentas guardadas se conservan al cerrar; en cada inicio debes seleccionar **Entrar** en la cuenta que quieras usar. Dentro de la cuenta aparecen cuatro tarjetas en una sola fila, con fondos ilustrados locales: **TV en vivo**, **Cine**, **Series** y **Guía EPG**. La barra lateral y sus categorías se muestran al elegir una sección. Desde **Inicio** puedes volver a los cuatro cuadros. **Cambiar cuenta** vuelve al selector y detiene la reproducción.

Pulsa **Agregar cuenta** y elige:

- **Xtream Codes**: introduce el servidor HTTP/HTTPS (con puerto si lo requiere), usuario y contraseña del proveedor. Se cargan TV, cine y series por separado. En series puedes elegir temporada y episodio.
- **Enlace M3U**: introduce una URL de tu proveedor.
- **Archivo M3U**: selecciona un archivo de tu equipo.

En las listas M3U, cine y series se identifican por las categorías (`Cine`, `Películas`, `Movies`, `VOD`, `Series`, etc.) o rutas `/movie/` y `/series/`. Sin esos datos aparecen en TV en vivo; no se inventa un catálogo. Las series M3U se reproducen como entradas individuales.

El selector muestra las cuentas en tarjetas de dos columnas, con icono de usuario y botones Entrar, Editar y Actualizar. **Editar** permite renombrar o cambiar la fuente y credenciales sin crear otra cuenta. Renombrar un archivo local no exige importarlo de nuevo; cambiar conexión exige validarla y el fallo conserva los datos anteriores.

Puedes guardar varias cuentas, cambiar entre ellas, actualizar catálogos remotos y eliminar cuentas. Las listas de archivo se actualizan agregando el archivo nuevo. Los favoritos pertenecen a cada cuenta. La lista y favoritos de v0.1 se migran a una cuenta M3U al abrir la nueva versión; el almacenamiento anterior solo se elimina tras un guardado correcto.

No incluye canales ni suscripciones, DRM ni reproducción RTSP/UDP. Compatible con HLS (`.m3u8`), MPEG-TS H.264/AAC mediante mpegts.js y formatos que soporte Chromium. Algunos proveedores necesitan códecs, VPN o cabeceras que esta versión no admite. HLS y MPEG-TS requieren CORS en manifiestos, segmentos y señal, también en Electron: la aplicación mantiene habilitada la seguridad del navegador. Una URL HLS sin extensión `.m3u8` no se identifica automáticamente.

## M3U frente a Xtream

Los totales no son directamente equivalentes: M3U suele incluir cada episodio como una entrada independiente, mientras Xtream agrupa las series y pide sus episodios al abrirlas. El selector ahora muestra un desglose por canales, películas y entradas de series/series agrupadas.

Se corrigió la clasificación de categorías como CINE PREMIUM o SERIES 24/7: una ruta de canal `/live/` (o una ruta Xtream de TV sin prefijo) tiene prioridad sobre el nombre de la categoría. Las rutas `/movie/` y `/series/` también son autoritativas. Las listas anteriores se reclasifican al abrirlas sin eliminar entradas.

Si una cuenta M3U ofrece menos contenido, su exportación puede ser parcial o estar filtrada por el proveedor; la aplicación no puede inventar lo que no está en el archivo. **Editar → Usar catálogo completo de Xtream** obtiene servidor y credenciales del enlace/streams, permite revisarlos y carga la API al guardar. Conserva el ID de cuenta. Los favoritos de TV/cine se relacionan por servidor, tipo e ID de stream; las referencias anteriores se conservan. No se asocian episodios M3U con series completas por coincidencia de números. La conversión solo se guarda después de conectar; no garantiza que el proveedor permita su API o devuelva un catálogo completo.

## EPG, actualización y vencimiento

Al abrir **Guía EPG**, la aplicación intenta detectar su dirección usando la cuenta Xtream o los parámetros `username` y `password` del enlace M3U para construir `xmltv.php` en el mismo servidor y puerto. También reconoce `url-tvg`/`x-tvg-url` de una lista y rutas de stream Xtream en archivos locales. No se escanean servidores ni se necesita volver a escribir las credenciales. Una dirección inferida no garantiza que el proveedor tenga EPG disponible.

En **Configurar EPG** puedes elegir **Detectar automáticamente**, **Enlace manual** o **Desactivada**. Los enlaces manuales guardados en versiones anteriores siguen teniendo prioridad. Se aceptan XMLTV/XMLTV.GZ con una declaración externa estándar `<!DOCTYPE tv SYSTEM "xmltv.dtd">`: se elimina la declaración antes de analizar el XML, sin descargar DTD ni resolver entidades externas. Las declaraciones internas de entidades no son compatibles.

La guía se presenta como una cuadrícula con canales fijos a la izquierda, horarios alineados, bloques proporcionales a su duración y una línea de ahora. Muestra ventanas de tres horas con navegación Anterior/Ahora/Siguiente; pulsar un programa abre su detalle y permite ver el canal en vivo. Debajo del reproductor de TV aparece la EPG del canal con programa actual, progreso, descripción y siguiente. Se descarga automáticamente al reproducir TV si hay una fuente EPG y se comparte la descarga/caché con la guía.

La guía se asocia por `tvg-id`/`epg_channel_id`, o nombre como alternativa, y se filtra con las categorías de TV a la izquierda. Presenta programación actual/próxima en horario local, hasta 48 horas, y conserva una ventana de 6 horas anteriores. Se pagina por 120 canales y se conserva en memoria durante 30 minutos. La EPG sigue siendo opcional.

**Refresh** actualiza el catálogo sin borrar el anterior si la descarga falla. **Actualizar listas al entrar** está activado por defecto para fuentes remotas y puede desactivarse por cuenta desde Inicio. Los archivos locales no se pueden descargar otra vez: Refresh pide seleccionar su archivo actualizado. El botón también recarga una EPG configurada.

En Inicio aparece el vencimiento que informa Xtream. Si no se proporciona (incluidas cuentas M3U), se muestra **No informado por el proveedor**. El dato se actualiza junto al catálogo.

## Audio, subtítulos y cuatro pantallas

Debajo del reproductor están los selectores de audio y subtítulos. Detectan audio alternativo y subtítulos HLS, y pistas nativas que exponga Electron con `AudioVideoTracks`. Puedes cargar SRT/VTT de hasta 5 MB; se eliminan al cambiar de contenido. La disponibilidad depende de la fuente y de sus códecs. Para AC3/DTS, determinados MKV o subtítulos integrados no admitidos, instala VLC en su ubicación estándar de Windows y pulsa **Abrir en VLC**. No se incluye VLC ni se convierten códecs. El modo navegador puede no exponer audio nativo; para ello usa la aplicación Electron.

**Multiscreen** permite elegir cuatro canales de la cuenta, con buscador por pantalla y un único audio activo. Al salir de la sección, cambiar de cuenta o cerrar una pantalla se liberan sus reproductores. Tu proveedor debe permitir las conexiones simultáneas correspondientes; se muestra el máximo que informe Xtream. El ancho de banda y el hardware también limitan la reproducción.

## Listas get.php sin extensión

Se aceptan enlaces con query como `get.php?...&type=m3u_plus&output=ts`; no se exige que terminen en `.m3u`. El archivo descargado debe contener una lista M3U real. `output=ts` describe la señal MPEG-TS de los canales, no una extensión obligatoria de la lista. Un rechazo HTTP, una descarga demasiado lenta, un tamaño excesivo o un servidor inaccesible son problemas distintos y se muestran como tales. Las pruebas usan URLs falsas, nunca credenciales del usuario.

## Ejecutar en Windows 11

Instala Node.js 24 LTS. En PowerShell dentro del repositorio:

```powershell
npm ci
npm start
```

Para generar una carpeta portable:

```powershell
npm run package:win
```

Abre `release/Nexo-IPTV-win32-x64/Nexo-IPTV.exe`. Conserva toda la carpeta junto al ejecutable. El paquete no tiene firma digital ni instalador.

Las versiones descargables se generan con GitHub Actions al publicar una etiqueta `v*`. El workflow también se puede ejecutar manualmente indicando una etiqueta existente. Cada versión se construye desde su propia etiqueta y publica ZIP y SHA-256 en su Release.

## Desarrollo y validación

Usa el checkout existente; no necesitas crear un worktree. El desarrollo no requiere credenciales ni servicios de terceros. Las pruebas usan un servidor local que simula Xtream sin credenciales reales.

```sh
npm ci
npm run dev      # interfaz en navegador; solicitudes al proveedor necesitan CORS
npm test         # parser, clasificación, migración, autenticación y episodios
npm run test:ui  # flujos funcionales y reproducción WebM; requiere Chromium
npm run test:hls # añade HLS H.264 real; requiere FFmpeg con libx264
npm run test:desktop # en Windows: interfaz de producción, IPC y cifrado nativo
npm run build    # interfaz de producción para Electron
npm start       # escritorio; Linux necesita sesión gráfica y un almacén seguro
```

Las pruebas de UI usan `/usr/bin/chromium`; puedes definir `CHROMIUM_PATH` con otro ejecutable. Para Chromium de Playwright: `npx playwright install chromium`, después `CHROMIUM_PATH=playwright npm run test:ui`. Se guardan capturas en `artifacts/` (ignorado por Git).

Las pruebas cubren EPG, vencimiento, audio bilingüe MP4 y HLS, subtítulos HLS y SRT, cuatro vídeos simultáneos, Refresh manual/automático, M3U por archivo y URL, errores de autenticación, varios catálogos, episodios y temporadas, cambio/eliminación de cuentas, favoritos, búsqueda, categorías, persistencia, migración y reproducción. Se valida contra un proveedor simulado; la compatibilidad con un proveedor real y la reproducción del ejecutable deben comprobarse en Windows 11.

## Datos y credenciales

En Electron las cuentas, catálogos y favoritos se escriben en `accounts.enc` en el perfil de usuario (`%APPDATA%/nexo-iptv`, según el nombre de la aplicación). Se cifran con Electron `safeStorage`, que utiliza DPAPI de Windows. La aplicación no guarda si no hay cifrado seguro disponible. El archivo pertenece al usuario de Windows y no debe copiarse a otro equipo como método de exportación.

**En modo navegador** se usa `localStorage` sin cifrado; el formulario lo advierte antes de conectar. No uses ese modo para cuentas sensibles en un equipo compartido. Los enlaces M3U pueden contener contraseñas. No hay telemetría ni servidor propio. Catálogos, logos y vídeo se solicitan al proveedor.

Las descargas tienen un límite de 120 segundos: hasta 64 MB para listas/catálogos y 128 MB para EPG (también tras descomprimir GZIP). El estado cifrado de escritorio admite hasta 256 MB; el navegador conserva su propia cuota, normalmente mucho menor. Si el guardado falla se conservan los datos anteriores. Las actualizaciones con errores parciales conservan los catálogos anteriores de las secciones afectadas.

## Código

- `electron/`: ventana aislada, descarga HTTP y almacenamiento cifrado.
- `src/xtream.js`: API de cuentas, catálogos, episodios y vencimiento.
- `src/player.js`, `src/transport.js`: HLS, TS, pistas de audio y subtítulos.
- `src/epg.js`, `src/epg-ui.js`: lectura XMLTV y guía por cuenta.
- `src/multiscreen.js`: cuatro reproductores independientes.
- `tests/fixtures/dual-audio.mp4`: señal sintética H.264 con dos pistas AAC, generada con FFmpeg para la prueba de Windows.
- `src/library.js`, `src/playlist.js`: clasificación, migración y M3U.
- `src/storage.js`, `src/network.js`: persistencia y solicitudes con límites.
- `src/main.js`, `src/style.css`: interfaz y reproducción.
- `tests/`: pruebas unitarias y funcionales.
