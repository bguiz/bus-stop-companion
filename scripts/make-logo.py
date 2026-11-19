#!/usr/bin/env python3
"""Build the app logo: the bus with a face.

Writes icon.svg, renders the 512 px PNG with headless Chrome, and derives the 180 and 192 px PNGs with ImageMagick.
The 相棒 on the destination board is drawn as dot-matrix dots from scripts/aibou-dots.txt, so the
SVG does not depend on any installed font. Edit the dot file or the geometry below, then run:

    python3 scripts/make-logo.py
"""
import pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAVY, DEEP, AMBER, LED, CREAM = "#14203b", "#0b1224", "#ffb454", "#ffc46e", "#f6f7fb"

rows = (ROOT / "scripts/aibou-dots.txt").read_text().strip().split("\n")
cols, nrows, pitch = len(rows[0]), len(rows), 1.2
ox, oy = 50 - cols * pitch / 2, 30.5 - nrows * pitch / 2
dots = "".join(
    f'<circle class="d" cx="{ox + (x + .5) * pitch:.2f}" cy="{oy + (y + .5) * pitch:.2f}" r=".5"/>'
    for y, r in enumerate(rows) for x, c in enumerate(r) if c == "#"
)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <title>Bus stop aibou</title>
  <defs>
    <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".55"/></filter>
    <g id="dots">{dots}</g>
  </defs>
  <rect width="100" height="100" fill="{NAVY}"/>
  <rect x="12" y="11" width="76" height="78" rx="22" fill="{AMBER}"/>
  <rect x="19" y="17" width="62" height="27" rx="7" fill="{DEEP}"/>
  <use xlink:href="#dots" href="#dots" fill="{AMBER}" filter="url(#glow)" opacity=".9"/>
  <use xlink:href="#dots" href="#dots" fill="{LED}"/>
  <rect x="19" y="48" width="62" height="17" rx="8" fill="#cfe9ff"/>
  <path d="M27 48 L41 48 L32 65 L19 65 Z" fill="#fff" opacity=".45"/>
  <path d="M45 48 L51 48 L42 65 L36 65 Z" fill="#fff" opacity=".28"/>
  <circle cx="33" cy="76" r="8" fill="#fff"/><circle cx="67" cy="76" r="8" fill="#fff"/>
  <circle cx="35" cy="75.5" r="4" fill="{NAVY}"/><circle cx="69" cy="75.5" r="4" fill="{NAVY}"/>
  <circle cx="36.6" cy="73.6" r="1.4" fill="#fff"/><circle cx="70.6" cy="73.6" r="1.4" fill="#fff"/>
  <path d="M43 79 Q50 86 57 79" fill="none" stroke="{NAVY}" stroke-width="2.8" stroke-linecap="round"/>
  <circle cx="21.5" cy="82.5" r="3.2" fill="#ff7a5c" opacity=".55"/><circle cx="78.5" cy="82.5" r="3.2" fill="#ff7a5c" opacity=".55"/>
</svg>
'''
(ROOT / "icon.svg").write_text(svg)
print(f"icon.svg written ({len(svg) // 1024} KB, {dots.count('<circle')} dots)")

chrome = next((c for c in (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chrome")) if c and pathlib.Path(c).exists()), None)
if not chrome:
    sys.exit("Chrome not found: icon.svg was written, but the PNG icons were not rendered.")

(ROOT / "icons").mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    page = pathlib.Path(tmp) / "icon.html"
    page.write_text(f'<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:{NAVY}}}'
                    f'img{{display:block;width:100vw;height:100vh}}</style><img src="file://{ROOT / "icon.svg"}">')
    # Chrome clamps small windows and small screenshots, so it renders only the 512 px master.
    master = ROOT / "icons/icon-512.png"
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=512,512", f"--screenshot={master}", f"file://{page}"],
                   check=True, capture_output=True, timeout=60)

def size_of(path):
    head = path.read_bytes()[16:24]
    return int.from_bytes(head[:4], "big"), int.from_bytes(head[4:], "big")

magick = shutil.which("magick") or shutil.which("convert")
for n in (180, 192):
    out = ROOT / f"icons/icon-{n}.png"
    if not magick:
        sys.exit("ImageMagick not found: icon-512.png was rendered, but the smaller icons were not.")
    subprocess.run([magick, str(master), "-filter", "Lanczos", "-resize", f"{n}x{n}", f"PNG32:{out}"], check=True, timeout=60)

for n in (180, 192, 512):
    path = ROOT / f"icons/icon-{n}.png"
    print(f"icons/icon-{n}.png  {size_of(path)[0]}x{size_of(path)[1]}")
    if size_of(path) != (n, n):
        sys.exit(f"unexpected size for icon-{n}.png")
