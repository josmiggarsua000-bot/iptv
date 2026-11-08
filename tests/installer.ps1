param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path $Installer).Path
$root = Split-Path $PSScriptRoot -Parent
$smokeRoot = Join-Path ([IO.Path]::GetTempPath()) ('nexo-installer-' + [guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $smokeRoot 'Nexo IPTV'
$profile = Join-Path $smokeRoot 'profile'
$startShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Nexo IPTV\Nexo IPTV.lnk'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nexo IPTV.lnk'
$application = $null
if ((Test-Path $startShortcut) -or (Test-Path $desktopShortcut)) { throw 'Ejecuta esta prueba en un usuario Windows desechable sin accesos directos Nexo existentes.' }
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$sentinel = Join-Path $profile 'keep-profile.txt'
Set-Content $sentinel 'Installer must preserve account data outside the installation directory.'
Add-Type -AssemblyName System.Drawing
function Assert-PulsoIcon([string]$Executable) {
    $actualIcon = [Drawing.Icon]::ExtractAssociatedIcon($Executable)
    if (-not $actualIcon) { throw "No se extrajo el icono de $Executable" }
    $actual = $actualIcon.ToBitmap()
    $expectedIcon = [Drawing.Icon]::new((Join-Path $root 'build\nexo.ico'), $actual.Size)
    $expected = $expectedIcon.ToBitmap()
    try {
        $checked = 0; $different = 0
        for ($x = 0; $x -lt $actual.Width; $x++) {
            for ($y = 0; $y -lt $actual.Height; $y++) {
                $a = $actual.GetPixel($x,$y); $e = $expected.GetPixel($x,$y)
                if ($e.A -gt 200) {
                    $checked++
                    if ([Math]::Abs([int]$a.R-[int]$e.R) -gt 64 -or [Math]::Abs([int]$a.G-[int]$e.G) -gt 64 -or [Math]::Abs([int]$a.B-[int]$e.B) -gt 64) { $different++ }
                }
            }
        }
        if ($checked -lt 20 -or $different / $checked -gt 0.2) { throw "El icono incrustado no coincide con Pulso: $different de $checked pixeles en $Executable" }
    } finally { $actual.Dispose(); $expected.Dispose(); $actualIcon.Dispose(); $expectedIcon.Dispose() }
}
try {
    Assert-PulsoIcon $installerPath
    $installLog = Join-Path $smokeRoot 'install.log'
    $result = Start-Process -FilePath $installerPath -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=desktopicon', "/DIR=`"$installRoot`"", "/LOG=`"$installLog`"") -Wait -PassThru
    if ($result.ExitCode -ne 0) { throw "Instalador devolvió $($result.ExitCode): $(Get-Content $installLog -Tail 10 -ErrorAction SilentlyContinue)" }
    $executable = Join-Path $installRoot 'Nexo-IPTV.exe'
    if (-not (Test-Path $executable)) { throw 'No se instaló el ejecutable.' }
    Assert-PulsoIcon $executable
    $shell = New-Object -ComObject WScript.Shell
    foreach ($shortcut in @($startShortcut, $desktopShortcut)) {
        if (-not (Test-Path $shortcut)) { throw "No se creó el acceso directo: $shortcut" }
        $link = $shell.CreateShortcut($shortcut)
        if ($link.TargetPath -ne $executable) { throw "Destino incorrecto del acceso directo: $shortcut" }
    }
    & (Join-Path $installRoot 'resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe') -version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FFmpeg instalado no inicia.' }
    & (Join-Path $installRoot 'resources\app.asar.unpacked\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe') -version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FFprobe instalado no inicia.' }
    $application = Start-Process -FilePath $executable -ArgumentList @("--user-data-dir=`"$profile`"", '--disable-gpu') -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        Start-Sleep -Milliseconds 250
        $application.Refresh()
        if ($application.HasExited) { throw "La aplicación instalada terminó antes de abrir la ventana: $($application.ExitCode)" }
    } while ($application.MainWindowTitle -ne 'Nexo IPTV' -and [DateTime]::UtcNow -lt $deadline)
    if ($application.MainWindowTitle -ne 'Nexo IPTV') { throw 'La aplicación instalada no abrió su ventana.' }
    $application.CloseMainWindow() | Out-Null
    if (-not $application.WaitForExit(10000)) { $application.Kill($true); throw 'La aplicación instalada no cerró correctamente.' }
    $uninstaller = Join-Path $installRoot 'unins000.exe'
    $result = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
    if ($result.ExitCode -ne 0) { throw "El desinstalador devolvió $($result.ExitCode)." }
    if ((Test-Path $executable) -or (Test-Path $startShortcut) -or (Test-Path $desktopShortcut)) { throw 'La desinstalación dejó ejecutables o accesos directos.' }
    if (-not (Test-Path $sentinel)) { throw 'Se eliminaron datos fuera de la carpeta de instalación.' }
    Write-Host 'Instalador Windows: iconos Pulso, instalación, accesos directos, motores, arranque, cierre y desinstalación sin borrar perfil: OK'
} catch {
    Write-Host "::error title=Installer smoke test::$($_.Exception.Message)"
    throw
} finally {
    if ($application -and -not $application.HasExited) { $application.Kill($true) }
    $uninstaller = Join-Path $installRoot 'unins000.exe'
    if (Test-Path $uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait | Out-Null }
    Remove-Item $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
