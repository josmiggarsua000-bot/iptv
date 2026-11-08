"""Verify first-run selection and persistence on the installed release APK."""
import re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True)

def screen():
    adb('shell', 'uiautomator', 'dump', '/sdcard/nexo-window.xml')
    return adb('shell', 'cat', '/sdcard/nexo-window.xml')

def nodes(xml):
    return list(ET.fromstring(xml).iter('node'))

def contains(xml, value):
    return any(value in n.attrib.get('text','') or value in n.attrib.get('content-desc','') for n in nodes(xml))

def wait_screen(value):
    last = ''
    for _ in range(15):
        last = screen()
        if contains(last, value):
            return last
        time.sleep(1)
    raise AssertionError('Expected '+value+'; screen: '+last[:3500])

xml = wait_screen('¿Dónde usarás Nexo?')
for node in nodes(xml):
    if 'Teléfono / tablet' in node.attrib.get('text', '') or 'Teléfono / tablet' in node.attrib.get('content-desc',''):
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
        adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
        break
else:
    raise AssertionError('Phone choice missing: '+xml[:3500])
wait_screen('Agregar cuenta')
adb('shell', 'am', 'force-stop', 'com.nexo.iptv')
adb('shell', 'am', 'start', '-W', '-n', 'com.nexo.iptv/com.nexo.iptv.MainActivity')
xml = wait_screen('Agregar cuenta')
assert not contains(xml, '¿Dónde usarás Nexo?'), 'Display preference not remembered'
Path('artifacts').mkdir(exist_ok=True)
Path('artifacts/android-release-window.xml').write_text(xml)
with open('artifacts/android-release-home.png', 'wb') as out:
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=out, check=True)
print('Signed APK: first-run choice, empty account picker and preference persisted after restart: OK')
