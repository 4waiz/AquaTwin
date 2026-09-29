"""
Capture the intro sequence at precise intro times (reads the dev-exposed
engine clock, window.__twin.intro.t) and report timing / console health.

Usage: python scripts/qa/intro_frames.py --out <dir> [--times 0.2,0.7,...] [--size 1920x1080]
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3100")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", required=True)
    ap.add_argument("--times", default="0.3,0.75,0.95,1.1,1.35,1.7,2.1,2.5,2.9,3.3,3.9")
    ap.add_argument("--reduced", action="store_true")
    ap.add_argument("--nvidia", action="store_true")
    a = ap.parse_args()
    w, h = (int(x) for x in a.size.split("x"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", f"--window-size={w},{h}"]
    if a.nvidia:
        flags.append("--force_high_performance_gpu")
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=flags)
        ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce" if a.reduced else "no-preference")
        page = ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text[:200]}"))
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        t0 = time.time()
        page.goto(a.base + "/?intro=1", wait_until="domcontentloaded", timeout=120000)
        page.screenshot(path=str(out / "00_dom.png"))
        # Wait until the intro clock starts.
        page.wait_for_function("() => window.__twin && (window.__twin.intro.running || window.__twin.intro.finished)", timeout=60000)
        started = time.time()
        print(f"intro clock started {started - t0:.2f}s after navigation")
        for s in [float(x) for x in a.times.split(",")]:
            # Freeze the intro clock at s, let a few frames render, capture.
            page.evaluate(f"() => {{ window.__twin.intro.hold = {s}; }}")
            page.wait_for_timeout(350)
            t = page.evaluate("() => window.__twin.intro.t")
            page.screenshot(path=str(out / f"t{s:04.2f}.png"))
            print(f"frame t={t:.2f}s")
        page.evaluate("() => { window.__twin.intro.hold = null; }")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(out / "final.png"))
        html_intro = page.evaluate("() => document.documentElement.dataset.intro")
        stage = page.evaluate("() => document.body.innerText.includes('Live')")
        print("data-intro =", html_intro, "| LIVE visible:", stage)
        errs = [l for l in logs if l.startswith(("error", "pageerror")) or "GL_INVALID" in l]
        print("errors:", len(errs))
        for e in errs[:10]:
            print("  ", e)
        b.close()


if __name__ == "__main__":
    main()
