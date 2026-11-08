"""Keep actionable failures visible through GitHub check annotations."""
import subprocess, traceback, runpy
from pathlib import Path
try:
    result = subprocess.run(['./gradlew','connectedDebugAndroidTest','--stacktrace'],cwd='android',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    Path('/tmp/nexo-gradle-validation.log').write_text(result.stdout)
    if result.returncode:
        raise RuntimeError('Gradle test failure: '+result.stdout[-5500:])
    print('::notice title=Android instrumentation::Native tests passed')
    version=__import__('json').loads(Path('android/version.json').read_text())['name']
    subprocess.run(['adb','install','-r',f'prebuilt/Nexo-IPTV-Android-{version}.apk'],check=True)
    subprocess.run(['adb','shell','am','start','-W','-n','com.nexo.iptv/com.nexo.iptv.MainActivity'],check=True)
    runpy.run_path('scripts/android-release-smoke.py')
except Exception:
    message=traceback.format_exc().replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print('::error title=Android validation::'+message,flush=True)
    raise SystemExit(1)
