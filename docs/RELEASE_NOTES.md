## Nexo IPTV v0.2.1 · Selector de cuentas

- Inicio separado: sin cuentas, un único botón Agregar cuenta; con cuentas, lista guardada para elegir cuál usar.
- TV, cine, series y favoritos aparecen únicamente después de crear o seleccionar una cuenta.
- En cada inicio se vuelve al selector, sin entrar automáticamente a la última cuenta.
- Cambiar cuenta detiene la reproducción y vuelve al selector.
- Tres opciones de conexión: Xtream Codes, enlace M3U y archivo M3U.
- Se conservan las cuentas, catálogos y favoritos de v0.2.0.

Pruebas: flujos de interfaz, persistencia, selección al reiniciar, cuentas M3U y proveedor Xtream simulado, temporadas, episodios y reproducción HLS en Chromium/Linux. En Windows se ejecutan pruebas unitarias y de escritorio con almacenamiento cifrado antes del empaquetado.

### Actualizar desde el código fuente en Windows

El paquete portable sigue sin firma digital. Si Control Inteligente de Aplicaciones lo bloquea, usa el código fuente con Node.js 24 LTS. Extrae el código actualizado en una carpeta nueva, abre PowerShell allí y ejecuta `npm.cmd ci` y después `npm.cmd start`. El perfil de cuentas se conserva fuera de la carpeta del código.

### Paquete portable

Extrae toda la carpeta del ZIP y ejecuta Nexo-IPTV.exe. No incluye canales ni suscripciones. No hay EPG ni DRM. Las fuentes deben usar formatos compatibles y permitir CORS para HLS. La conexión a proveedores reales requiere validación con tu cuenta.
