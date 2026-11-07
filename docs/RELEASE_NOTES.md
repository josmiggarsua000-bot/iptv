## Nexo IPTV v0.2.0 · Neon Edition

Pantalla principal nueva con diseño cyberpunk, colores cian/magenta/violeta y accesos a TV en vivo, cine y series.

- Agregar cuenta: elegir Xtream Codes o lista M3U antes de introducir datos.
- Xtream Codes: servidor, usuario y contraseña; carga de TV, películas y series; temporadas y episodios.
- M3U por enlace o archivo; clasificación según categorías y rutas de los títulos.
- Varias cuentas, cambio de cuenta, actualización del catálogo, eliminación y favoritos por cuenta.
- Almacenamiento cifrado en Windows con Electron safeStorage (DPAPI). Migración de la lista de la versión anterior.
- Reproducción HLS y formatos compatibles con Chromium.

### Ejecutar en Windows 11

Descarga `Nexo-IPTV-Windows11-x64.zip`, extrae toda la carpeta y abre `Nexo-IPTV.exe`. Mantén todos los archivos junto al ejecutable. No lleva firma digital ni instalador. No incluye canales ni suscripciones.

Validación: pruebas unitarias, flujos de interfaz con proveedor Xtream simulado (incluidos cine, series y episodios) y reproducción HLS H.264 en Chromium/Linux. Empaquetado, pruebas unitarias y prueba de escritorio con almacenamiento cifrado nativo en Windows mediante GitHub Actions. La conexión a tu proveedor y la reproducción del ejecutable deben comprobarse en tu PC; no se ha probado una cuenta de proveedor real.

No incluye EPG ni DRM. Algunos proveedores requieren códecs o cabeceras especiales no compatibles. Las señales HLS deben permitir CORS. Los títulos de series en una M3U se reproducen directamente; temporadas y episodios se obtienen con Xtream Codes.
