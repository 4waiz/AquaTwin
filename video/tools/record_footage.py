"""
Record real footage of the running AquaTwin app for the video.

Chrome (GPU-accelerated) is driven by Playwright; frames come from the
DevTools screencast with their real timestamps and are re-timed by ffmpeg into
constant-frame-rate H.264 clips, so motion plays back at true speed. A small
visible cursor is injected into the page (headless Chrome draws none) so
viewers can follow the simulated clicks.

Usage:
  python video/tools/record_footage.py --base http://localhost:3200 --out video/footage [--clips intro twin ...]
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

W, H = 1920, 1080

CURSOR_JS = r"""
(() => {
  if (window.__fakeCursor) return;
  const install = () => {
    const c = document.createElement('div');
    c.id = '__fake_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:opacity .2s';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 17 L7.2 13.2 L10 19.5 L12.6 18.3 L9.9 12.2 L15.5 12 Z" fill="#e8edf4" stroke="#04060a" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(91,157,255,.9);z-index:2147483646;pointer-events:none;opacity:0;transform:scale(.3)';
    document.body.appendChild(r);
    document.body.appendChild(c);
    let x = -100, y = -100;
    window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.transform = `translate(${x - 3}px, ${y - 2}px)`; }, true);
    window.addEventListener('mousedown', (e) => {
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      r.animate([{ opacity: .95, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }, true);
    window.__fakeCursor = true;
  };
  if (document.body) install(); else document.addEventListener('DOMContentLoaded', install);
})();
"""


class Screencast:
    def __init__(self, page: Page, work: Path):
        self.page = page
        self.work = work
        self.cdp = page.context.new_cdp_session(page)
        self.frames: list[tuple[float, str]] = []
        self.t_start = 0.0
        self.t_stop = 0.0
        self.recording = False
        self.marks: dict[str, float] = {}
        self.cdp.on("Page.screencastFrame", self._on_frame)

    def mark(self, name: str):
        """Record the wall-clock time of an on-screen event (aligned to frame timestamps at encode)."""
        self.marks[name] = time.time()

    def _on_frame(self, params):
        if not self.recording:
            return
        ts = params["metadata"]["timestamp"]
        name = f"{len(self.frames):05d}.jpg"
        (self.work / name).write_bytes(base64.b64decode(params["data"]))
        self.frames.append((ts, name))
        try:
            self.cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
        except Exception:
            pass

    def start(self):
        self.work.mkdir(parents=True, exist_ok=True)
        self.t_start = time.time()
        self.recording = True
        self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})

    def stop(self):
        self.page.wait_for_timeout(120)
        self.t_stop = time.time()
        self.recording = False
        self.cdp.send("Page.stopScreencast")

    def encode(self, out: Path, fps: int = 30) -> dict:
        fr = self.frames
        if not fr:
            raise RuntimeError("no frames captured")
        lst = self.work / "list.txt"
        lines = []
        for i, (ts, name) in enumerate(fr):
            nxt = fr[i + 1][0] if i + 1 < len(fr) else ts + max(0.05, self.t_stop - self.t_start - (ts - fr[0][0]))
            dur = max(1 / 240, nxt - ts)
            lines.append(f"file '{name}'\nduration {dur:.5f}")
        lines.append(f"file '{fr[-1][1]}'")  # concat demuxer: repeat last frame
        lst.write_text("\n".join(lines) + "\n", encoding="utf-8")
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                "-vf", f"fps={fps},scale={W}:{H}:flags=lanczos,format=yuv420p",
                "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-movflags", "+faststart", str(out),
            ],
            check=True,
        )
        span = fr[-1][0] - fr[0][0]
        info = {
            "frames": len(fr),
            "seconds": round(span, 2),
            "capture_fps": round((len(fr) - 1) / span, 1) if span > 0 else None,
            "marks": {k: round(v - fr[0][0], 3) for k, v in self.marks.items()},
        }
        shutil.rmtree(self.work, ignore_errors=True)
        return info


def glide(page: Page, to: tuple[float, float], ms: int = 700, start: tuple[float, float] | None = None):
    """Move the (visible) cursor smoothly to a point with ease-in-out."""
    x0, y0 = start or getattr(page, "_cursor", (W * 0.62, H * 0.55))
    x1, y1 = to
    n = max(8, ms // 16)
    for i in range(1, n + 1):
        t = i / n
        e = t * t * (3 - 2 * t)
        page.mouse.move(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e)
        page.wait_for_timeout(ms / n)
    page._cursor = (x1, y1)  # type: ignore[attr-defined]


def center(page: Page, selector: str) -> tuple[float, float]:
    box = page.locator(selector).first.bounding_box()
    if not box:
        raise RuntimeError(f"not visible: {selector}")
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def click_at(page: Page, xy: tuple[float, float], glide_ms: int = 650):
    glide(page, xy, glide_ms)
    page.wait_for_timeout(120)
    page.mouse.down()
    page.wait_for_timeout(70)
    page.mouse.up()


def open_page(page: Page, base: str, path: str, settle_ms: int):
    sep = "&" if "?" in path else "?"
    page.goto(f"{base}{path}{sep}intro=0&quality=high", wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_timeout(settle_ms)
    page.mouse.move(W * 0.62, H * 0.55)
    page._cursor = (W * 0.62, H * 0.55)  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------- clips


def clip_intro(page: Page, base: str, rec: Screencast):
    page.goto(f"{base}/?intro=1&quality=high", wait_until="domcontentloaded", timeout=120_000)
    page.mouse.move(-50, -50)
    rec.start()
    page.wait_for_function("() => /initializing digital twin/i.test(document.body.innerText)", timeout=30_000, polling=16)
    rec.mark("initializing")
    page.wait_for_function("() => document.documentElement.dataset.intro === 'done'", timeout=30_000, polling=16)
    rec.mark("done")
    page.wait_for_timeout(2600)
    rec.stop()


def clip_twin(page: Page, base: str, rec: Screencast):
    open_page(page, base, "/twin", 7000)
    page.mouse.move(-50, -50)
    page._cursor = (1000, 600)  # type: ignore[attr-defined]
    rec.start()
    page.wait_for_timeout(700)
    glide(page, (900, 560), 700, start=(1180, 700))
    rec.mark("orbit_start")
    page.mouse.down()
    for i in range(1, 71):  # slow orbit: 210 px over ~2.8 s
        page.mouse.move(900 - i * 3, 560 + i * 0.35)
        page.wait_for_timeout(40)
    page.mouse.up()
    rec.mark("orbit_end")
    page._cursor = (690, 585)  # type: ignore[attr-defined]
    page.wait_for_timeout(900)
    glide(page, center(page, "text=RO train 2"), 800)
    rec.mark("inspector")
    page.wait_for_timeout(1400)
    glide(page, center(page, "text=ML residual"), 800)
    rec.mark("equation")
    page.wait_for_timeout(2200)
    rec.stop()


def clip_scenario(page: Page, base: str, rec: Screencast):
    open_page(page, base, "/scenarios?s=salinity", 6000)
    page.wait_for_selector("text=Constraint violations", timeout=60_000)
    page.wait_for_timeout(1500)
    rec.start()
    page.wait_for_timeout(700)
    click_at(page, center(page, "role=tab[name='No action']"), 800)
    rec.mark("noaction")
    page.wait_for_timeout(700)
    click_at(page, center(page, "role=button[name='Play timeline']"), 750)
    rec.mark("play")
    page.wait_for_selector("text=Constraint violated", timeout=15_000)
    rec.mark("violation")
    page.wait_for_timeout(1600)
    click_at(page, center(page, "role=button[name='+6h']"), 450)
    rec.mark("pause")
    page.wait_for_timeout(2200)
    click_at(page, center(page, "role=tab[name='AquaTwin response']"), 900)
    rec.mark("aquatwin")
    try:
        page.wait_for_selector("text=Constraint violated", state="detached", timeout=4000)
        rec.mark("resolved")
    except Exception:
        pass
    page.wait_for_timeout(3000)
    rec.stop()


def clip_optimization(page: Page, base: str, rec: Screencast):
    open_page(page, base, "/optimization", 9000)
    page.wait_for_selector("text=RECOMMENDATION APPROVED", timeout=60_000)
    ring = page.evaluate(
        """() => { const c = [...document.querySelectorAll('svg circle')].find(e => e.getAttribute('r') === '9');
        if (!c) return null; const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }"""
    )
    pareto = page.evaluate(
        """() => [...document.querySelectorAll('svg circle')].filter(e => e.getAttribute('r') === '4.2')
          .map(e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })
          .sort((a, b) => a[0] - b[0])"""
    )
    rec.start()
    page.wait_for_timeout(800)
    if ring:
        glide(page, (ring[0] + 1, ring[1] + 1), 900)
        rec.mark("ring")
        page.wait_for_timeout(1300)
    for p in pareto[:: max(1, len(pareto) // 3)][:3]:
        glide(page, (p[0], p[1]), 500)
        page.wait_for_timeout(450)
    glide(page, center(page, "text=RECOMMENDATION APPROVED"), 900)
    rec.mark("banner")
    page.wait_for_timeout(2400)
    rec.stop()


def clip_withheld(page: Page, base: str, rec: Screencast):
    open_page(page, base, "/intelligence", 7000)
    rec.start()
    page.wait_for_timeout(900)
    click_at(page, center(page, "role=button[name='Compound extreme']"), 900)
    rec.mark("extreme")
    page.wait_for_selector("text=LOW MODEL CONFIDENCE", timeout=15_000)
    rec.mark("withheld")
    page.wait_for_timeout(1400)
    glide(page, center(page, "text=LOW MODEL CONFIDENCE"), 900)
    page.wait_for_timeout(2600)
    rec.stop()


def clip_validation(page: Page, base: str, rec: Screencast):
    open_page(page, base, "/validation", 4500)
    rec.start()
    page.wait_for_timeout(1000)
    click_at(page, center(page, "role=tab[name='Outside envelope']"), 900)
    rec.mark("outside")
    page.wait_for_timeout(3200)
    rec.stop()


CLIPS = {
    "intro": clip_intro,
    "twin": clip_twin,
    "scenario": clip_scenario,
    "optimization": clip_optimization,
    "withheld": clip_withheld,
    "validation": clip_validation,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3200")
    ap.add_argument("--out", default="video/footage")
    ap.add_argument("--clips", nargs="+", default=list(CLIPS))
    ap.add_argument("--integrated-gpu", action="store_true", help="do not request the high-performance GPU")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    flags = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", f"--window-size={W},{H}", "--hide-scrollbars"]
    if not a.integrated_gpu:
        flags.append("--force_high_performance_gpu")
    report = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=flags)
        for name in a.clips:
            ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            ctx.add_init_script(CURSOR_JS)
            page = ctx.new_page()
            if name != "intro":
                # A first visit per session plays the intro; mark it as played so pages open live.
                page.goto(f"{a.base}/about?intro=0", wait_until="domcontentloaded")
                page.evaluate("() => sessionStorage.setItem('aquatwin.intro.v1', '1')")
            rec = Screencast(page, out / f"_work_{name}")
            CLIPS[name](page, a.base, rec)
            info = rec.encode(out / f"{name}.mp4")
            report[name] = info
            print(f"{name}: {info}")
            ctx.close()
        b.close()
    (out / "footage.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
