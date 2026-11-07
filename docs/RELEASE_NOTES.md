## Nexo IPTV v0.3.0 · EPG, audio y multiscreen

- EPG opcional por cuenta: XMLTV y XMLTV.GZ, búsqueda de canales, programación actual/próxima y horarios locales. Configuración dentro de la cuenta; botón para usar la URL de Xtream sin escribirla a mano.
- Vencimiento visible en Inicio cuando el proveedor Xtream lo informa. M3U o datos ausentes muestran No informado; no se inventa una fecha.
- Selectores de audio y subtítulos: pistas HLS y pistas nativas que exponga Electron. Carga de subtítulos externos SRT/VTT y opción Desactivados.
- Abrir en VLC, si está instalado en Windows en su ubicación predeterminada, para códecs como AC3/DTS o subtítulos integrados que el motor no admita. VLC no está incluido y elegir una pista no convierte un códec incompatible.
- Refresh dentro de la cuenta; actualización automática al entrar activada por defecto y configurable en Inicio. Si falla, se conserva el catálogo anterior. Los archivos M3U locales se actualizan eligiendo de nuevo el archivo.
- Multiscreen: cuatro señales de TV simultáneas, búsqueda por pantalla, un único audio activo y liberación de conexiones al salir. Depende del límite de conexiones de la suscripción y de los recursos del PC.
- MPEG-TS directo mediante mpegts.js para TS H.264/AAC compatible. También se detectan enlaces Xtream sin extensión y enlaces de lista get.php con type=m3u_plus&output=ts.
- Descargas con la pila de red de Electron, límite de 120 segundos, catálogos de hasta 64 MB y EPG de hasta 128 MB. Errores HTTP y de tamaño diferenciados. La URL de lista no necesita terminar en .m3u.

Validación: pruebas unitarias de descarga, gzip, límites, XMLTV, subtítulos y vencimiento; flujos en Chromium con proveedor simulado, audio bilingüe real en MP4 y HLS, subtítulos HLS y SRT, MPEG-TS y cuatro vídeos a la vez. En Windows, prueba nativa de interfaz, cifrado, descarga y selección de audio dual antes de empaquetar. No se ha conectado la cuenta real del usuario: un bloqueo, puerto cerrado o restricción del proveedor puede seguir requiriendo revisión.

### Actualización desde el código

Si Windows bloquea el portable sin firma, descarga el código de esta versión, extráelo en una carpeta nueva y ejecuta `npm.cmd ci` seguido de `npm.cmd start` con Node.js 24 LTS. Las cuentas siguen en el perfil de usuario, fuera del código.

El ZIP portable debe extraerse completo. No tiene firma digital. No incluye canales, suscripciones ni VLC. No se desactiva TLS ni la seguridad web; HLS y TS en el reproductor necesitan CORS. Sin EPG configurada, el resto de la aplicación funciona normalmente.
