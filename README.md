# Nexo IPTV · Neon Edition

Reproductor de escritorio para Windows 11 x64, con interfaz en español y diseño cyberpunk.

## Empezar

En la pantalla principal pulsa **Agregar cuenta** y elige:

- **Xtream Codes**: introduce el servidor HTTP/HTTPS (con puerto si lo requiere), usuario y contraseña del proveedor. Se cargan TV, cine y series por separado. En series puedes elegir temporada y episodio.
- **Lista M3U**: importa un archivo o introduce una URL. Cine y series se identifican por las categorías (`Cine`, `Películas`, `Movies`, `VOD`, `Series`, etc.) o rutas `/movie/` y `/series/`. Sin esos datos aparecen en TV en vivo; no se inventa un catálogo. Las series M3U se reproducen como entradas individuales.

Puedes guardar varias cuentas, cambiar entre ellas, actualizar catálogos remotos y eliminar cuentas. Las listas de archivo se actualizan agregando el archivo nuevo. Los favoritos pertenecen a cada cuenta. La lista y favoritos de v0.1 se migran a una cuenta M3U al abrir la nueva versión; el almacenamiento anterior solo se elimina tras un guardado correcto.

No incluye canales ni suscripciones, EPG, DRM, reproducción RTSP/UDP ni MPEG-TS directo. Compatible con HLS (`.m3u8`) y formatos que soporte Chromium. Algunos proveedores necesitan códecs, VPN o cabeceras que esta versión no admite. HLS requiere CORS en manifiestos y segmentos, también en Electron: la aplicación mantiene habilitada la seguridad del navegador. Una URL HLS sin extensión `.m3u8` no se identifica automáticamente.

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

Las pruebas cubren M3U por archivo y URL, errores de autenticación, varios catálogos, episodios y temporadas, cambio/eliminación de cuentas, favoritos, búsqueda, categorías, persistencia, migración y reproducción. Se valida contra un proveedor simulado; la compatibilidad con un proveedor real y la reproducción del ejecutable deben comprobarse en Windows 11.

## Datos y credenciales

En Electron las cuentas, catálogos y favoritos se escriben en `accounts.enc` en el perfil de usuario (`%APPDATA%/nexo-iptv`, según el nombre de la aplicación). Se cifran con Electron `safeStorage`, que utiliza DPAPI de Windows. La aplicación no guarda si no hay cifrado seguro disponible. El archivo pertenece al usuario de Windows y no debe copiarse a otro equipo como método de exportación.

**En modo navegador** se usa `localStorage` sin cifrado; el formulario lo advierte antes de conectar. No uses ese modo para cuentas sensibles en un equipo compartido. Los enlaces M3U pueden contener contraseñas. No hay telemetría ni servidor propio. Catálogos, logos y vídeo se solicitan al proveedor.

Cada respuesta se limita a 20 MB y el estado de escritorio a 40 MB. Si el guardado falla se conservan los datos anteriores. Las actualizaciones con errores parciales conservan los catálogos anteriores de las secciones afectadas.

## Código

- `electron/`: ventana aislada, descarga HTTP y almacenamiento cifrado.
- `src/xtream.js`: API de cuentas, catálogos y episodios.
- `src/library.js`, `src/playlist.js`: clasificación, migración y M3U.
- `src/storage.js`, `src/network.js`: persistencia y solicitudes con límites.
- `src/main.js`, `src/style.css`: interfaz y reproducción.
- `tests/`: pruebas unitarias y funcionales.
