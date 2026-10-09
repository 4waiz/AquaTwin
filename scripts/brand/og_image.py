"""
Social-share card (Open Graph / X), 1200 x 630, rendered from HTML in Chrome so it uses
the product's own fonts, colours, logo and a real screenshot of the 3D twin.

  python scripts/brand/og_image.py      # after scripts/qa/screenshots.py

Writes src/app/opengraph-image.png and src/app/opengraph-image.alt.txt (Next.js file
conventions; the build adds the og:image tags).
"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1].parent
APP = ROOT / "src" / "app"
SHOT = ROOT / "docs" / "screenshots" / "01-overview.png"
ICON = ROOT / "public" / "brand" / "aquatwin-icon-512.png"
FONT = ROOT / "video" / "composition" / "assets" / "fonts" / "Geist-Latin.woff2"
MONO = ROOT / "video" / "composition" / "assets" / "fonts" / "GeistMono-Latin.woff2"

HTML = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Geist; src: url('{FONT.as_uri()}') format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: 'Geist Mono'; src: url('{MONO.as_uri()}') format('woff2'); font-weight: 100 900; }}
html, body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; }}
body {{ font-family: Geist, sans-serif; color: #e8edf4; -webkit-font-smoothing: antialiased;
  background: radial-gradient(900px 500px at 0% 0%, #0b2c57 0%, #05142a 45%, #03070d 100%); position: relative; }}
.grid {{ position: absolute; inset: 0; background-image: linear-gradient(rgba(64,180,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(64,180,255,.06) 1px, transparent 1px);
  background-size: 60px 60px; mask-image: radial-gradient(70% 80% at 30% 40%, #000 30%, transparent 100%); }}
.left {{ position: absolute; left: 64px; top: 70px; width: 470px; }}
.logo {{ width: 92px; height: 92px; border-radius: 20px; box-shadow: 0 0 60px rgba(34,181,251,.35); }}
h1 {{ margin: 28px 0 0; font-size: 84px; line-height: 1; letter-spacing: -0.045em; font-weight: 700; color: #fff; }}
h1 span {{ color: #2bb7fb; }}
p {{ margin: 18px 0 0; font-size: 25px; line-height: 1.3; color: #c8d1dd; letter-spacing: -0.01em; }}
.meta {{ position: absolute; left: 64px; bottom: 54px; font: 500 15px 'Geist Mono', monospace; letter-spacing: .1em; text-transform: uppercase; color: #6d7787; }}
.meta b {{ color: #5ec8ff; font-weight: 500; }}
.shot {{ position: absolute; left: 590px; top: 92px; width: 760px; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 30px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(64,180,255,.1); transform: perspective(1600px) rotateY(-14deg) rotateX(4deg); transform-origin: 0 50%; }}
.shot img {{ display: block; width: 100%; }}
</style></head><body><div class="grid"></div>
<div class="left"><img class="logo" src="{ICON.as_uri()}"><h1>Aqua<span>Twin</span></h1>
<p>Physics-informed, self-calibrating digital twin for seawater desalination that knows when not to answer.</p></div>
<div class="shot"><img src="{SHOT.as_uri()}"></div>
<div class="meta"><b>Team Kanban</b> · KU–UNESCO Global Water Hackathon 2026</div>
</body></html>"""


def main() -> None:
    tmp = ROOT / "scripts" / "brand" / "_og.html"
    tmp.write_text(HTML, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        pg.goto(tmp.as_uri(), wait_until="networkidle")
        pg.evaluate("() => document.fonts.ready")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(APP / "opengraph-image.png"))
        b.close()
    tmp.unlink(missing_ok=True)
    (APP / "opengraph-image.alt.txt").write_text(
        "AquaTwin, a physics-informed digital twin of a seawater desalination plant, by Team Kanban", encoding="utf-8"
    )
    print("wrote src/app/opengraph-image.png")


if __name__ == "__main__":
    main()
