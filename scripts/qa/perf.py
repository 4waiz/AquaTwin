"""
Rendering performance probe. Loads pages in Chrome (GPU-accelerated), measures
frame rate with requestAnimationFrame over a fixed window, opens the hidden
developer performance panel (Ctrl+Shift+P) and records its readout.

Usage:
  python scripts/qa/perf.py --base http://localhost:3200 --size 1920x1080 --nvidia --out docs/qa/perf
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

PAGES = ["/", "/twin", "/scenarios?s=salinity&run=1"]

MEASURE = """async (seconds) => {
  const times = [];
  let last = performance.now();
  const end = last + seconds * 1000;
  await new Promise((resolve) => {
    const tick = (t) => {
      times.push(t - last);
      last = t;
      if (t < end) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  times.shift();
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { frames: times.length, fps: 1000 / mean, meanMs: mean, p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99), maxMs: sorted[sorted.length - 1] };
}"""

GPU = """() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2');
  if (!g) return 'no webgl2'; const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3200")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", default="docs/qa/perf")
    ap.add_argument("--nvidia", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--seconds", type=float, default=6)
    ap.add_argument("--pages", nargs="+", default=PAGES)
    ap.add_argument("--settle", type=float, default=8, help="seconds to wait after load before measuring")
    ap.add_argument("--quality", default="", help="force a tier: high | medium | low")
    a = ap.parse_args()
    w, h = (int(x) for x in a.size.split("x"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", f"--window-size={w},{h}"]
    if a.nvidia:
        flags.append("--force_high_performance_gpu")
    report: dict = {"size": a.size, "nvidia_flag": a.nvidia, "pages": {}}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=not a.headed, args=flags)
        page = b.new_context(viewport={"width": w, "height": h}).new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
        for i, path in enumerate(a.pages):
            url = a.base.rstrip("/") + path + ("&" if "?" in path else "?") + "intro=0" + (f"&quality={a.quality}" if a.quality else "")
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_timeout(int(a.settle * 1000))
            if i == 0:
                report["gpu"] = page.evaluate(GPU)
            page.keyboard.press("Control+Shift+P")
            stats = page.evaluate(MEASURE, a.seconds)
            page.wait_for_timeout(1200)
            panel = page.evaluate(
                "() => { const el = [...document.querySelectorAll('div')].find(d => d.className && String(d.className).includes('bottom-4 right-4 z-50')); return el ? el.innerText : null; }"
            )
            name = path.strip("/").split("?")[0] or "overview"
            page.screenshot(path=str(out / f"{name}.png"))
            report["pages"][path] = {"raf": stats, "panel": panel}
            print(f"{path}: {stats['fps']:.1f} fps (p95 {stats['p95Ms']:.1f} ms, max {stats['maxMs']:.1f} ms)")
        report["errors"] = errors
        b.close()
    print("GPU:", report.get("gpu"))
    (out / "perf.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
