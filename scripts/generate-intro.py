"""Generate an original single cinematic startup impact. No external audio samples."""
import math
import random
import struct
import wave
from pathlib import Path

rate, duration = 44100, 2.5
rng = random.Random(17)
samples = []
for n in range(int(rate * duration)):
    t = n / rate
    attack = min(1, t / .006)
    # One struck low body with a downward pitch bend, a soft transient and a long tail.
    phase = 2 * math.pi * (48 * t + 40 * .065 * (1 - math.exp(-t / .065)))
    body = .62 * math.sin(phase) * math.exp(-3.4 * t)
    overtone = .16 * math.sin(2 * math.pi * 96 * t) * math.exp(-4.8 * t)
    transient = .13 * rng.uniform(-1, 1) * math.exp(-45 * t)
    tail = .09 * (math.sin(2 * math.pi * 144 * t) + .4 * math.sin(2 * math.pi * 192 * t)) * math.exp(-2.3 * t)
    samples.append(attack * (body + overtone + transient + tail) * min(1, (duration - t) / .25))
peak = max(abs(sample) for sample in samples)
out = Path(__file__).resolve().parent.parent / 'src/assets/nexo-intro.wav'
with wave.open(str(out), 'wb') as audio:
    audio.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    audio.writeframes(b''.join(struct.pack('<h', int(sample / peak * .82 * 32767)) for sample in samples))
