# Motores multimedia de terceros

Nexo no incorpora código ni binarios de los reproductores enviados para análisis.

El modo compatible ejecuta FFmpeg y FFprobe como procesos separados. FFmpeg es un proyecto de https://ffmpeg.org/; su licencia depende de la configuración de compilación (las compilaciones utilizadas habilitan GPL). Se conservan las licencias y README originales en node_modules, también al empaquetar.

- ffmpeg-static 5.3.0: https://github.com/eugeneware/ffmpeg-static . Binarios y avisos del release b6.1.1: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 . El paquete entrega el binario específico del sistema al instalar. Fuentes/recetas de construcción indicadas por el distribuidor: Windows https://www.gyan.dev/ffmpeg/builds/ ; Linux https://johnvansickle.com/ffmpeg/ . Consultar ffmpeg.LICENSE y ffmpeg.README junto al binario.
- ffprobe-static 3.1.0: https://github.com/joshwnj/ffprobe-static . El código envoltorio tiene licencia MIT y el binario FFprobe pertenece a FFmpeg; el README identifica FFmpeg 4.0.2 y el proveedor original de la compilación. Fuentes FFmpeg 4.0.2: https://github.com/FFmpeg/FFmpeg/tree/n4.0.2 .

El archivo tests/fixtures/dual-ac3-subtitles.mkv es contenido sintético generado para este proyecto: patrón de video, tonos de 440/880 Hz y una frase de subtítulo. No contiene material de los archivos enviados por el usuario.
