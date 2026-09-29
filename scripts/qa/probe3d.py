"""
3D debugging helper: loads a page, runs a list of JS snippets against the
dev-exposed engine (window.__twin) and captures a screenshot after each.

Usage: python scripts/qa/probe3d.py --out <dir> --steps '[{"name":"base","js":""}]'
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3100")
    ap.add_argument("--path", default="/?intro=0")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", required=True)
    ap.add_argument("--wait", type=float, default=6)
    ap.add_argument("--clip", default="", help="x,y,w,h clip for screenshots")
    ap.add_argument("--nvidia", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    w, h = (int(x) for x in a.size.split("x"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    steps = json.loads(Path(a.steps[1:]).read_text(encoding='utf-8-sig') if a.steps.startswith('@') else a.steps)
    clip = None
    if a.clip:
        x, y, cw, ch = (float(v) for v in a.clip.split(","))
        clip = {"x": x, "y": y, "width": cw, "height": ch}
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", f"--window-size={w},{h}"]
    if a.nvidia:
        flags.append("--force_high_performance_gpu")
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=flags)
        page = b.new_context(viewport={"width": w, "height": h}).new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text[:300]}"))
        page.goto(a.base + a.path, wait_until="domcontentloaded", timeout=120000)
        page.wait_for_timeout(int(a.wait * 1000))
        for s in steps:
            before = sum(1 for l in logs if "GL_INVALID" in l)
            if s.get("js"):
                r = page.evaluate(f"() => {{ const t = window.__twin; {s['js']} }}")
                if r is not None:
                    print(s["name"], "→", json.dumps(r)[:1500])
            page.wait_for_timeout(int(s.get("wait", 0.6) * 1000))
            if not s.get("noshot"):
                page.screenshot(path=str(out / f"{s['name']}.png"), clip=clip)
            after = sum(1 for l in logs if "GL_INVALID" in l)
            print(f"{s['name']}: GL errors during step = {after - before}")
        if a.verbose:
            for l in logs:
                if l.startswith(("error", "warning")):
                    print(l)
        b.close()


if __name__ == "__main__":
    main()
