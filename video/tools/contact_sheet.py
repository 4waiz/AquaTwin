"""Labelled contact sheet of a clip (developer utility for planning the edit)."""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

clip, out, step = sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]).decode().strip())
tmp = Path(tempfile.mkdtemp())
times, t = [], 0.0
while t < dur - 0.05:
    times.append(round(t, 2)); t += step
thumbs = []
for tt in times:
    p = tmp / f"{tt:06.2f}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(tt), "-i", clip, "-frames:v", "1", "-vf", "scale=480:-1", str(p)], check=True)
    im = Image.open(p).convert("RGB")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 64, 20], fill=(0, 0, 0))
    d.text((4, 4), f"{tt:.1f}s", fill=(255, 220, 0))
    thumbs.append(im)
cols = 4
w, h = thumbs[0].size
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new("RGB", (w * cols, h * rows), (20, 20, 20))
for i, im in enumerate(thumbs):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
print(out, dur, len(thumbs))
