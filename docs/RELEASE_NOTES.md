## Nexo IPTV v0.3.1 · Inicio central y EPG automático

- Al entrar a una cuenta aparecen cuatro cuadros centrales: TV en vivo, Cine, Series y Guía EPG. No hay barra lateral en ese inicio.
- Al abrir una sección, aparecen su contenido y las categorías a la izquierda. Inicio vuelve a los cuadros. La guía también permite filtrar por categorías.
- Detección automática del EPG desde Xtream, los parámetros username/password de una URL M3U, cabeceras url-tvg/x-tvg-url y rutas de stream Xtream en archivos locales.
- Se forma xmltv.php en el mismo servidor y puerto sin volver a escribir credenciales. Se comprueba al abrir la guía; depende de que el proveedor la ofrezca.
- Configurar EPG ofrece Automático, Manual y Desactivada. Se respetan los enlaces manuales anteriores y se conservan cuentas/favoritos.
- Corregido el rechazo de DOCTYPE externo estándar xmltv.dtd. Se analiza la guía sin descargar la DTD ni resolver entidades externas; las entidades internas siguen sin admitirse.

Validación: pruebas unitarias y flujos con proveedor simulado para autodetección Xtream/M3U, XMLTV con DOCTYPE, ausencia de solicitudes a la DTD, categorías EPG e inicio con cuatro cuadros. Se mantienen las pruebas de audio dual MP4/HLS, subtítulos y multiscreen. La guía real del proveedor del usuario no se ha descargado en este entorno.

Para actualizar desde código en Windows, extrae esta versión en una carpeta nueva y ejecuta `npm.cmd ci` seguido de `npm.cmd start` con Node.js 24 LTS. Las cuentas se conservan en el perfil de usuario. El paquete portable no tiene firma digital y puede ser bloqueado por Control Inteligente de Aplicaciones.
