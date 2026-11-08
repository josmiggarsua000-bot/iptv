"""Generate Nexo's original two-second soft startup chime without external samples."""
import math
import struct
import wave
from pathlib import Path

rate = 44100
out = Path(__file__).resolve().parent.parent / 'src/assets/nexo-intro.wav'
with wave.open(str(out), 'wb') as audio:
    audio.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    frames = bytearray()
    for n in range(int(rate * 2.2)):
        t = n / rate
        value = 0
        for delay, hz in [(0, 493.883), (.16, 659.255), (.32, 830.609), (.48, 987.767)]:
            u = t - delay
            if u >= 0:
                envelope = min(1, u / .025) * math.exp(-u * 3) * min(1, (2.2 - t) / .2)
                value += .20 * envelope * (math.sin(2 * math.pi * hz * u) + .12 * math.sin(4 * math.pi * hz * u))
        frames += struct.pack('<h', int(max(-1, min(1, value)) * 32767))
    audio.writeframes(frames)
