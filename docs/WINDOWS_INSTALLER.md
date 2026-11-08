# Instalador Windows x64

`Nexo-IPTV-Setup-0.6.0-x64.exe` incluye la aplicación y los motores multimedia. No requiere Node.js en el equipo del usuario. Instala por usuario en `%LOCALAPPDATA%\Programs\Nexo IPTV`, crea el acceso del menú Inicio y ofrece el acceso del escritorio.

El icono Pulso aprobado se convierte a un ICO de 16, 24, 32, 48, 64, 128 y 256 píxeles mediante `scripts/generate-icon.py` (Pillow). El ICO está incluido en el repositorio, así que no hace falta Python para compilar o instalar. Electron Packager incrusta el icono en el ejecutable e Inno Setup lo usa en el instalador.

Para compilar en Windows con Node.js 24 e Inno Setup 6:

```powershell
npm.cmd ci
npm.cmd run package:win
npm.cmd run installer:win
```

Se puede indicar la ruta de ISCC.exe mediante `INNO_SETUP_COMPILER`. La versión se toma de package.json. GitHub Actions ejecuta las pruebas, compila y valida el instalador antes de publicar los archivos y SHA256SUMS.txt.

La prueba `tests/installer.ps1` está destinada a un usuario Windows desechable de CI: instala en una carpeta temporal, compara los iconos incrustados, comprueba accesos directos, abre el ejecutable instalado, prueba los motores y desinstala. Verifica que los archivos del perfil fuera de la instalación sigan presentes.

El nombre interno de la aplicación continúa siendo `nexo-iptv` para conservar el perfil y las cuentas de las versiones anteriores. El instalador no elimina ese perfil.

El instalador no tiene firma digital. Control Inteligente de Aplicaciones puede bloquear aplicaciones sin firma; crear un instalador no cambia esa política. El código fuente sigue disponible para ejecutarlo con el runtime de Electron distribuido por npm.
