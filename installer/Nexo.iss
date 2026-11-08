; Per-user installation. Account data is stored by Electron outside {app}.
#ifndef MyAppVersion
  #define MyAppVersion "0.6.0"
#endif
#define MyAppName "Nexo IPTV"
#define MyAppExeName "Nexo-IPTV.exe"

[Setup]
AppId={{47EF9245-B41B-4D84-B9D3-01C3AB53D150}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Nexo IPTV
VersionInfoVersion={#MyAppVersion}
VersionInfoDescription=Nexo IPTV Installer
DefaultDirName={localappdata}\Programs\Nexo IPTV
DefaultGroupName=Nexo IPTV
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupIconFile=..\build\nexo.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
OutputDir=..\release
OutputBaseFilename=Nexo-IPTV-Setup-{#MyAppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Files]
Source: "..\release\Nexo-IPTV-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Nexo IPTV"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; AppUserModelID: "com.nexo.iptv"
Name: "{autodesktop}\Nexo IPTV"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; AppUserModelID: "com.nexo.iptv"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Nexo IPTV"; Flags: nowait postinstall skipifsilent
