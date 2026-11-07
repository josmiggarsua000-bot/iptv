## Nexo IPTV v0.5.0 · Audio y subtítulos dentro del reproductor

- Menú de video/calidad, idioma de audio, subtítulos y SRT/VTT dentro del video, también en pantalla completa.
- Motor local FFmpeg para AC3, EAC3 y DTS: decodifica la pista elegida y entrega AAC al reproductor. Se activa automáticamente en cine/episodios cuando el análisis detecta incompatibilidad; también hay botón manual.
- Prefiere español cuando está disponible. Desactivado es una opción de silencio, no una pista de audio inicial.
- Extrae subtítulos integrados de texto. Los subtítulos gráficos siguen requiriendo un reproductor externo.
- Controles de reproducción, volumen y búsqueda dentro del video para el modo compatible.

Validación: señal sintética con dos pistas AC3, selección inglesa comprobada por frecuencia y audio no silencioso, subtítulo español integrado, cambio de pista desde la interfaz y menú en pantalla completa. Se mantienen las pruebas de cuentas, guía, HLS/MP4 dual, TS y multiscreen. No se ha probado la película del proveedor del usuario.

Extrae el código en una carpeta nueva. Ejecuta `npm.cmd ci` y `npm.cmd start` con Node.js 24 LTS. Las cuentas se conservan fuera del código. El motor compatible requiere ejecutar los binarios FFmpeg y FFprobe incluidos; la política de Windows puede bloquear aplicaciones sin firma.

Los binarios y avisos de terceros se describen en docs/THIRD_PARTY_MEDIA.md.
