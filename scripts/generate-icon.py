"""Convert the approved Pulso PNG to the multi-size Windows icon (requires Pillow)."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
with Image.open(root / 'src/assets/nexo-pulso.png') as image:
    image.convert('RGBA').save(root / 'build/nexo.ico', format='ICO', sizes=[(n, n) for n in [16, 24, 32, 48, 64, 128, 256]])
