## Nexo IPTV v0.4.0 · Cuentas, catálogo y guía de televisión

- Cuentas en tarjetas rectangulares de dos columnas, icono de usuario, Editar, Entrar y Actualizar.
- Edición del nombre, conexión o tipo de cuenta sin duplicarla. Se valida una fuente nueva antes de sustituir el catálogo. Renombrar un archivo local no requiere volver a seleccionarlo.
- TV en vivo, Cine, Series y Guía EPG en una fila, con ilustraciones originales incluidas en la aplicación; no dependen de una web de imágenes.
- Guía de TV con horarios alineados, bloques proporcionales, línea de ahora, navegación por ventanas de tres horas y detalle de programa.
- Programa actual, avance, descripción y siguiente debajo del reproductor de TV. La guía se carga automáticamente al ver un canal y comparte caché con EPG.
- Corrección M3U: categorías CINE o SERIES ya no reclasifican un canal cuya ruta indica TV en vivo. Se actualiza la clasificación de las cuentas anteriores sin eliminar entradas.
- Desglose de catálogos para distinguir episodios M3U de series agrupadas Xtream. Los totales por sí solos no demuestran contenido ausente.
- Editar → Usar catálogo completo de Xtream infiere los datos del enlace M3U, permite revisarlos y cambia a la API después de conectar. Se conservan la cuenta y las referencias a favoritos; se relacionan TV/cine identificables. Los episodios M3U no se convierten en favoritos de series completas por un ID numérico.

Pruebas: clasificación, comparación de conteos, credenciales inferidas y favoritos; edición y conversión con proveedor simulado; tarjetas en dos columnas y secciones en una fila; EPG temporal, detalle y programación del reproductor. Se mantienen las pruebas de HLS/MP4 dual, subtítulos, TS y multiscreen, y la validación de escritorio Windows. No se ha comparado el catálogo real del usuario ni se garantiza que toda exportación M3U contenga todos los datos de una API.

Actualiza desde código extrayendo esta versión en una carpeta nueva y ejecutando `npm.cmd ci` seguido de `npm.cmd start` con Node.js 24 LTS. Las cuentas se conservan fuera del código. El portable sigue sin firma digital y puede ser bloqueado por Control Inteligente de Aplicaciones.
