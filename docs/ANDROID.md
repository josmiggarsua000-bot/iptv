# Android

El proyecto nativo está en android/. Reutiliza la interfaz Vite y emplea LibVLC 3.6.5 para reproducir en una actividad nativa, sin depender de los códecs de WebView. No se reutilizan binarios de los reproductores enviados para análisis.

## Compilación

Requiere JDK 21, Android SDK 35, Build Tools 35.0.0 y el Gradle Wrapper incluido.

```
npm ci
npm run build:android
cd android
./gradlew assembleDebug
```

El debug usa com.nexo.iptv.dev y no modifica las cuentas de la aplicación release com.nexo.iptv. Las pruebas instrumentadas incluyen exclusivamente un video sintético de dos pistas AC3 y subtítulo de texto.

Para release, configurar NEXO_ANDROID_KEYSTORE y NEXO_ANDROID_STORE_PASSWORD fuera del repositorio. El alias de firma es nexo. No subir la clave privada ni la contraseña a Git, releases o logs. La clave original debe respaldarse en un almacén privado para poder actualizar el APK sin cambiar su identidad. Gradle usa versionCode para las actualizaciones.

En este entorno, los archivos privados de firma se conservan fuera del repositorio en /workspace/.nexo-private/android-signing/. La integración actual de GitHub no permite administrar secretos de Actions: el APK se firma en el entorno privado y el flujo de publicación verifica el hash, certificado y commit de origen del binario de la rama android-apks. Esa rama contiene únicamente el APK público y su manifiesto; nunca la clave.

## Diseño y almacenamiento

Android usa un origen HTTPS local WebViewAssetLoader. Se bloquea navegación a páginas externas. El puente nativo permite solicitudes HTTP/HTTPS, cifrado y reproducción. Las descargas grandes se entregan a la interfaz mediante flujos internos y las escrituras de estado se cifran por fragmentos para no enviar todo el catálogo como una sola respuesta JavaScript.

Estado AES-GCM con Android Keystore, copias de seguridad de Android desactivadas. Los archivos temporales se guardan en el caché privado. El selector de documentos proporciona permisos de lectura específicos para M3U o subtítulos. El reproductor se pausa al salir de la aplicación.

## Terceros

LibVLC Android: https://code.videolan.org/videolan/libvlcjni (artefacto org.videolan.android:libvlc-all:3.6.5, repositorio Maven Central). AndroidX WebKit y AndroidX Test se obtienen del repositorio oficial Google Maven. Consultar licencias y fuentes de VideoLAN al redistribuir sus bibliotecas. Los cambios propios de UI y puente están incluidos en este repositorio.
