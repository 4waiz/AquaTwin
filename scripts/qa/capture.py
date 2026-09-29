"""
Visual QA capture: opens AquaTwin pages in Chrome with GPU acceleration,
waits for the twin and data to settle, saves full-resolution screenshots and
collects console errors, failed requests and forbidden strings (NaN,
undefined, Infinity).

Usage:
  python scripts/qa/capture.py --base http://localhost:3100 --size 1920x1080 --pages / /twin --out docs/screenshots/qa
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

FORBIDDEN = re.compile(r"\bNaN\b|\bundefined\b|\bInfinity\b")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3100")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--pages", nargs="+", default=["/"])
    ap.add_argument("--out", default="docs/screenshots/qa")
    ap.add_argument("--wait", type=float, default=6.0)
    ap.add_argument("--intro", action="store_true", help="capture the intro sequence on the first page")
    ap.add_argument("--frames", type=str, default="", help="comma separated seconds for intro frames")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--actions", type=str, default="", help="JSON list of {page, click|eval, wait, shot}")
    args = ap.parse_args()

    w, h = (int(x) for x in args.size.split("x"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report: dict = {"size": args.size, "pages": {}}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=not args.headed,
            args=[
                "--use-angle=d3d11",
                "--enable-gpu",
                "--ignore-gpu-blocklist",
                "--enable-gpu-rasterization",
                f"--window-size={w},{h}",
            ],
        )
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        page = ctx.new_page()
        console: list[dict] = []
        failed: list[str] = []
        page.on("console", lambda m: console.append({"type": m.type, "text": m.text[:500]}))
        page.on("pageerror", lambda e: console.append({"type": "pageerror", "text": str(e)[:500]}))
        page.on("requestfailed", lambda r: failed.append(f"{r.method} {r.url} {r.failure}"))

        gpu = None
        for i, path in enumerate(args.pages):
            console.clear()
            failed.clear()
            url = args.base.rstrip("/") + path
            if args.intro and i == 0:
                url += ("&" if "?" in url else "?") + "intro=1"
            elif "intro=" not in url:
                url += ("&" if "?" in url else "?") + "intro=0"
            t0 = time.time()
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            name = path.strip("/").replace("/", "_").replace("?", "_").replace("=", "-").replace("&", "_") or "overview"
            if args.intro and i == 0 and args.frames:
                for s in [float(x) for x in args.frames.split(",")]:
                    # intro time is measured from DOM ready; allow for warm-up
                    target = t0 + s
                    now = time.time()
                    if target > now:
                        time.sleep(target - now)
                    page.screenshot(path=str(out / f"{name}_intro_{s:04.1f}s.png"))
            page.wait_for_timeout(int(args.wait * 1000))
            if gpu is None:
                gpu = page.evaluate(
                    """() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2');
                    if (!g) return 'no webgl2'; const e = g.getExtension('WEBGL_debug_renderer_info');
                    return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }"""
                )
            shot = out / f"{name}.png"
            page.screenshot(path=str(shot))
            text = page.evaluate("() => document.body.innerText")
            bad = sorted(set(FORBIDDEN.findall(text)))
            report["pages"][path] = {
                "screenshot": str(shot),
                "console_errors": [c for c in console if c["type"] in ("error", "pageerror")],
                "console_warnings": [c for c in console if c["type"] == "warning"][:20],
                "failed_requests": list(failed),
                "forbidden_strings": bad,
                "load_seconds": round(time.time() - t0, 1),
            }
            print(f"{path}: errors={len(report['pages'][path]['console_errors'])} failed={len(failed)} forbidden={bad}")
        report["gpu"] = gpu
        print("GPU:", gpu)
        browser.close()

    (out / "report.json").write_text(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
