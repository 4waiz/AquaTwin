"""
Curated screenshots of the running app for the README, report and QA
(docs/screenshots). Drives real interactions — scenario branch and timeline,
the out-of-distribution probe, a recorded run — so every image shows the
actual product, not a mock-up.

Usage:
  python scripts/qa/screenshots.py --base http://localhost:3200 --out docs/screenshots [--nvidia]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

FORBIDDEN = re.compile(r"\bNaN\b|\bundefined\b|\bInfinity\b")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3200")
    ap.add_argument("--out", default="docs/screenshots")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--nvidia", action="store_true")
    a = ap.parse_args()
    w, h = (int(x) for x in a.size.split("x"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", f"--window-size={w},{h}"]
    if a.nvidia:
        flags.append("--force_high_performance_gpu")
    log: dict = {"shots": [], "errors": []}

    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=flags)
        page = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1).new_page()
        page.on("pageerror", lambda e: log["errors"].append(f"pageerror: {str(e)[:300]}"))
        page.on("console", lambda m: log["errors"].append(f"console: {m.text[:300]}") if m.type == "error" else None)

        def go(path: str, wait: float = 8.0):
            sep = "&" if "?" in path else "?"
            page.goto(f"{a.base}{path}{sep}intro=0&quality=high", wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_timeout(int(wait * 1000))

        def shot(name: str, pg: Page = page):
            path = out / f"{name}.png"
            pg.screenshot(path=str(path))
            bad = sorted(set(FORBIDDEN.findall(pg.evaluate("() => document.body.innerText"))))
            log["shots"].append({"name": name, "forbidden": bad})
            print(f"{name}: forbidden={bad}")

        # Intro frames (first visit): dry plant, pour, activation.
        page.goto(f"{a.base}/?intro=1&quality=high", wait_until="domcontentloaded", timeout=120_000)
        page.wait_for_function("() => document.documentElement.dataset.intro === 'pending'", timeout=20_000)
        page.wait_for_selector("text=Initializing", timeout=30_000)
        page.wait_for_timeout(700)
        shot("00a-intro-initializing")
        page.wait_for_timeout(1100)
        shot("00b-intro-synchronizing")
        page.wait_for_timeout(1300)
        shot("00c-intro-activation")
        page.wait_for_timeout(4000)

        go("/", 9)
        shot("01-overview")

        go("/twin", 8)
        shot("02-digital-twin")

        go("/scenarios?s=salinity&run=1", 12)
        page.get_by_role("tab", name="No action").click()
        page.get_by_role("button", name="+6h").click()
        page.wait_for_timeout(2500)
        shot("03a-scenario-lab-no-action")
        page.get_by_role("tab", name="AquaTwin response").click()
        page.wait_for_timeout(2500)
        shot("03b-scenario-lab-aquatwin")

        go("/optimization", 9)
        shot("04-optimization")

        go("/membranes", 8)
        shot("05-membrane-health")

        go("/water-quality", 10)
        shot("06-water-quality")

        go("/energy", 12)
        shot("07-energy-carbon")

        go("/intelligence", 8)
        shot("08a-model-intelligence")
        page.get_by_role("button", name="Compound extreme").click()
        page.wait_for_timeout(2500)
        shot("08b-model-intelligence-withheld")

        go("/validation", 6)
        shot("09-validation")

        go("/reports", 5)
        shot("10-reports")

        go("/about", 4)
        shot("11-about")

        b.close()
    (out / "screenshots.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
    print("errors:", len(log["errors"]))
    for e in log["errors"][:10]:
        print("  ", e)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
