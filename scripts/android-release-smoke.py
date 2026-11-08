"""Verify first-run selection and persistence on the installed release APK."""
import re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True)

def screen():
    adb('shell', 'uiautomator', 'dump', '/sdcard/nexo-window.xml')
    return adb('shell', 'cat', '/sdcard/nexo-window.xml')

xml = screen()
assert '¿Dónde usarás Nexo?' in xml, 'Missing initial screen choice'
for node in ET.fromstring(xml).iter('node'):
    if 'Teléfono / tablet' in node.attrib.get('text', ''):
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
        adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
        break
else:
    raise AssertionError('Phone choice missing')
time.sleep(2)
assert 'Agregar cuenta' in screen(), 'No account picker after selection'
adb('shell', 'am', 'force-stop', 'com.nexo.iptv')
adb('shell', 'am', 'start', '-n', 'com.nexo.iptv/com.nexo.iptv.MainActivity')
time.sleep(6)
xml = screen()
assert 'Agregar cuenta' in xml and '¿Dónde usarás Nexo?' not in xml, 'Display preference not remembered'
Path('artifacts').mkdir(exist_ok=True)
Path('artifacts/android-release-window.xml').write_text(xml)
with open('artifacts/android-release-home.png', 'wb') as out:
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=out, check=True)
print('Signed APK: first-run choice, empty account picker and preference persisted after restart: OK')
