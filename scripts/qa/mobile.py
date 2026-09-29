"""
Mobile / tablet QA: emulates a touch phone and a tablet, checks every page for
horizontal overflow and console errors, and saves full-length screenshots
(the app scrolls inside #page-scroll, so the layout is expanded for capture).

Usage:
  python scripts/qa/mobile.py --base http://localhost:3200 --out qa-output/mobile
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

PAGES = ["/", "/twin", "/scenarios?s=salinity", "/optimization", "/membranes", "/water-quality", "/energy", "/intelligence", "/validation", "/reports", "/about"]
DEVICES = {
    "phone": {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 3, "is_mobile": True, "has_touch": True},
    "tablet": {"viewport": {"width": 820, "height": 1180}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True},
}

OVERFLOW_JS = """() => {
  const sc = document.getElementById('page-scroll');
  const doc = document.documentElement;
  const wide = [...document.querySelectorAll('#page-scroll *')].filter(e => {
    const r = e.getBoundingClientRect();
    if (r.width === 0) return false;
    // ignore content inside horizontally scrollable containers
    let p = e.parentElement;
    while (p && p !== sc) { const s = getComputedStyle(p); if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return false; p = p.parentElement; }
    return r.right > window.innerWidth + 1;
  }).slice(0, 5).map(e => (e.tagName + '.' + String(e.className).slice(0, 60)));
  return { docOverflow: doc.scrollWidth > doc.clientWidth + 1, scrollOverflow: sc ? sc.scrollWidth > sc.clientWidth + 1 : null, offenders: wide };
}"""

EXPAND_JS = """() => {
  const root = document.getElementById('app-root'); const sc = document.getElementById('page-scroll');
  if (root) { root.style.height = 'auto'; root.style.overflow = 'visible'; }
  if (sc) { sc.style.overflow = 'visible'; }
  document.documentElement.style.height = 'auto'; document.body.style.height = 'auto';
}"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3200")
    ap.add_argument("--out", default="qa-output/mobile")
    ap.add_argument("--devices", nargs="+", default=list(DEVICES))
    ap.add_argument("--pages", nargs="+", default=PAGES)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    report: dict = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        for dev in a.devices:
            ctx = b.new_context(**DEVICES[dev])
            page = ctx.new_page()
            errs: list[str] = []
            page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            for path in a.pages:
                errs.clear()
                sep = "&" if "?" in path else "?"
                page.goto(f"{a.base}{path}{sep}intro=0", wait_until="domcontentloaded", timeout=120_000)
                page.wait_for_timeout(7000)
                ov = page.evaluate(OVERFLOW_JS)
                name = f"{dev}_{(path.strip('/').split('?')[0] or 'overview')}"
                page.screenshot(path=str(out / f"{name}_top.png"))
                page.evaluate(EXPAND_JS)
                page.wait_for_timeout(600)
                page.screenshot(path=str(out / f"{name}_full.png"), full_page=True)
                report[name] = {"overflow": ov, "errors": list(errs)}
                flag = "OVERFLOW" if (ov["docOverflow"] or ov["scrollOverflow"] or ov["offenders"]) else "ok"
                print(f"{name}: {flag} errors={len(errs)} {ov['offenders'][:3] if ov['offenders'] else ''}")
            ctx.close()
        b.close()
    (out / "mobile.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
