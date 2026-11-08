# Propuesta Arcade Neon

Borrador para revisión visual. El usuario eligió el logo C / Pulso de la primera lámina; está integrado en la marca, el arranque y el icono de ventana. Las cuatro ilustraciones minimalistas de TV, cine, series y EPG han sido aprobadas e integradas. Cada tarjeta ilumina su fondo y borde con su color al pasar el puntero o recibir foco por teclado.

Estilo original de arcade neón: cian, magenta y violeta, luz central detrás de los títulos, mayor contraste y tipografía legible en toda la interfaz. No se utilizan imágenes ni personajes de Neon Abyss.

Arranque de 3,6 segundos que espera a que cargue el logo, con un sonido original breve y volumen moderado. No bloquea clics, no parpadea y se omite si el sistema solicita movimiento reducido. En el navegador, el sonido depende de su política de reproducción automática.

Botones anterior/siguiente dentro del reproductor normal y a pantalla completa. Recorren la categoría y búsqueda seleccionadas; películas recorren títulos, episodios recorren las temporadas de la serie abierta. Los extremos quedan desactivados. La guía abre el canal en TV en vivo y usa allí esos controles.

Validación: compilación de producción, 22 pruebas de módulos y motor AC3, y Playwright con cambio de canales conservando fullscreen, límites de categoría, títulos de cine y episodios entre temporadas. Esta vista previa incorpora el logo y las ilustraciones aprobados.


## Información y series

En fullscreen de TV en vivo se muestra logo/nombre a la izquierda y EPG actual, avance y siguiente programa a la derecha, sobre una franja encima de los controles. Sin programa actual muestra «Sin información». Si el logo falla se utilizan iniciales. Al cambiar de canal se actualiza sin salir de fullscreen.

Una serie abre su propia vista con el reproductor arriba, selector de temporadas y capítulos debajo, episodio activo marcado y botón para volver al catálogo. El cambio anterior/siguiente sincroniza la temporada seleccionada. Las entradas M3U sin catálogo de serie solo muestran su episodio conocido, sin inventar temporadas.

La ventana se llama Nexo IPTV. Se retiraron los números decorativos de las cuatro tarjetas. El tono de entrada es una composición sintética original, reproducible con scripts/generate-intro.py.

Comprobaciones: 22 pruebas de módulos; Playwright para EPG en fullscreen con/sin datos, logo, cambio de canal, serie sin ventana modal, selector y episodio activo, regreso al catálogo y reproducción HLS/TS/AC3. Grabación de la intro y comprobación de que el sonido se reproduce y la animación permanece visible después de los primeros 1,8 segundos.
