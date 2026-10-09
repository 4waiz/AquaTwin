"""
Full-bleed "hero" renders of the 3D twin with the interface hidden, for the film, the
report and social cards. The page's 3D slot is stretched over the whole window, so the
renderer draws the plant edge to edge; optional drags orbit the camera between shots.

  python scripts/qa/hero_shot.py --base http://127.0.0.1:3300 --out video/motion/work/hero --scale 2 [--nvidia]

Writes hero-0.png (the page's own camera) and hero-1..N.png (after each orbit drag).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

HIDE = """
#app-root > aside, #app-root header, [data-reveal="header"], [data-reveal="panel4"], [data-reveal="telemetry"],
#app-root main > div:first-child.lg\\:hidden, .lg\\:hidden, [aria-live="polite"] { display: none !important; }
#page-scroll { overflow: hidden !important; }
#app-root main { position: fixed !important; inset: 0 !important; }
#page-scroll > div > div:nth-child(2) { position: fixed !important; inset: 0 !important; border: 0 !important; border-radius: 0 !important; z-index: 1 !important; }
#page-scroll > div > div:nth-child(2) > * { display: none !important; }
#page-scroll > div > div:nth-child(n+3) { display: none !important; }
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:3300")
    ap.add_argument("--out", default="video/motion/work/hero")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--nvidia", action="store_true")
    ap.add_argument("--path", default="/")
    ap.add_argument("--drags", default="-260:0,220:-60", help="orbit drags in CSS px, dx:dy pairs separated by commas")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-size=1920,1080"]
    if a.nvidia:
        flags.append("--force_high_performance_gpu")
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=flags)
        page = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=a.scale).new_page()
        sep = "&" if "?" in a.path else "?"
        page.goto(f"{a.base}{a.path}{sep}intro=0&quality=high", wait_until="domcontentloaded", timeout=120_000)
        page.wait_for_timeout(9000)
        page.add_style_tag(content=HIDE)
        page.evaluate("() => window.dispatchEvent(new Event('resize'))")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(out / "hero-0.png"))
        print("hero-0")
        for i, d in enumerate([x for x in a.drags.split(",") if x.strip()], 1):
            dx, dy = (float(v) for v in d.split(":"))
            page.mouse.move(960, 540)
            page.mouse.down()
            steps = 24
            for k in range(1, steps + 1):
                page.mouse.move(960 + dx * k / steps, 540 + dy * k / steps)
                page.wait_for_timeout(16)
            page.mouse.up()
            page.wait_for_timeout(2200)
            page.screenshot(path=str(out / f"hero-{i}.png"))
            print(f"hero-{i}")
        b.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
