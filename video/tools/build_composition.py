"""
Build the Hyperframes composition for the AquaTwin one-minute video.

Every cut is keyed to real event times: the footage recorder logs when each
on-screen event happens (click, violation chip, withheld banner, ...) in
footage.json, and the narration's sentence and clause boundaries are measured
from the voice-over WAVs (ffmpeg silencedetect). This script lays the footage,
camera moves, captions, music and sound effects out on one timeline and writes:

  video/composition/index.html    the Hyperframes composition
  video/captions.srt              caption sidecar (all narration)
  video/composition/timing.json   the computed timeline, for review

Usage:
  python video/tools/build_composition.py
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "video" / "composition"
ASSETS = COMP / "assets"
W, H = 1920, 1080
DURATION = 59.5
XF = 0.3  # cross-dissolve between footage clips

# --------------------------------------------------------------------------- inputs

marks = json.loads((ASSETS / "footage" / "footage.json").read_text(encoding="utf-8"))
M = {k: v["marks"] for k, v in marks.items()}
CLIP_LEN = {k: v["seconds"] for k, v in marks.items()}

VO_TEXT = [(ASSETS / "vo" / f"line{i}.txt").read_text(encoding="utf-8").strip() for i in range(1, 8)]


def wav_len(p: Path) -> float:
    with wave.open(str(p), "rb") as w:
        return w.getnframes() / w.getframerate()


VO_LEN = [wav_len(ASSETS / "vo" / f"line{i}.wav") for i in range(1, 8)]
# Narration start times (s). Chosen with the scene plan below; checked for overlap.
VO_START = [0.55, 9.30, 20.50, 31.15, 39.95, 45.95, 53.10]
for i in range(6):
    assert VO_START[i] + VO_LEN[i] + 0.3 < VO_START[i + 1], f"narration {i + 1} overlaps {i + 2}"
assert VO_START[6] + VO_LEN[6] < DURATION - 1.2, "narration runs into the end"


def pauses(p: Path) -> list[tuple[float, float]]:
    out = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(p), "-af", "silencedetect=noise=-38dB:d=0.09", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    return list(zip(starts, ends))


# Caption chunks per narration line (split at clause boundaries the voice pauses on).
CHUNKS = {
    1: ["Gulf desalination plants run on fixed setpoints and fixed alarms.", "By the time an alarm fires, the plant is already reacting."],
    2: [
        "AquaTwin keeps a physics model of each reverse-osmosis train calibrated to live data,",
        "and corrects it with machine learning.",
        "Train 2, it tells us, is due for cleaning.",
    ],
    3: [
        "Before a salinity shock arrives, it simulates the next day.",
        "Doing nothing breaks the water-quality limit within three hours.",
        "AquaTwin's plan holds every constraint.",
    ],
    4: ["It weighs 676 strategies,", "and a safety layer, AquaGuard,", "checks every limit at the edge of the model's uncertainty."],
    5: ["And when conditions go beyond what the model has learned,", "it says so, and withholds its advice."],
    6: ["Every result is simulated, tested against a hidden plant,", "and reproducible, including where it doesn't help."],
    7: ["AquaTwin. Predict, simulate, adapt,", "before the plant is forced to react."],
}


# Which measured pause (0-based, in order) ends each caption chunk but the last,
# e.g. line 4 pauses after "strategies," / "safety layer," / "AquaGuard,". Read off
# silencedetect for the current voice files; the counts are checked below.
BOUNDARY_PAUSE = {1: [1], 2: [0, 1], 3: [1, 2], 4: [0, 2], 5: [0], 6: [1], 7: [2]}
PAUSE_COUNT = {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 3, 7: 3}


def chunk_times(i: int) -> list[tuple[float, float, str]]:
    """Absolute (start, end, text) of each caption chunk of narration line i (1-based)."""
    text = VO_TEXT[i - 1]
    chunks = CHUNKS[i]
    L = VO_LEN[i - 1]
    ps = [p for p in pauses(ASSETS / "vo" / f"line{i}.wav") if 0.3 < p[0] < L - 0.25]
    assert len(ps) == PAUSE_COUNT[i], f"narration {i}: expected {PAUSE_COUNT[i]} pauses, found {len(ps)} — re-read BOUNDARY_PAUSE"
    bounds = [ps[k] for k in BOUNDARY_PAUSE[i]]
    assert len(bounds) == len(chunks) - 1
    out = []
    t0 = 0.0
    for k, c in enumerate(chunks):
        t1 = bounds[k][0] if k < len(bounds) else L
        out.append((VO_START[i - 1] + t0, VO_START[i - 1] + t1, c))
        if k < len(bounds):
            t0 = bounds[k][1]
    assert " ".join(chunks).replace("676", "six hundred and seventy-six") == text, f"caption text differs from narration {i}"
    return out


CAPS = {i: chunk_times(i) for i in range(1, 8)}

# --------------------------------------------------------------------------- scene plan

T_POUR = 8.742  # beat-locked: strong cue 8.74 s
S2B = 12.84
S2C = 14.74
S3 = 20.20
CUT3 = 27.50
S4 = 30.80
S5 = 39.60
S6 = 45.80
S7 = 52.25  # end card fades in once the sixth narration line has finished


def media_for(event_media: float, event_comp: float, scene_start: float) -> float:
    """Media offset at scene_start so that a recorded event lands at event_comp."""
    return event_media - (event_comp - scene_start)


clips = []  # (id, src, start, end, media_start, fade_in)


def add_clip(cid, src, start, end, media_start, fade=True):
    s = start - (XF / 2 if fade else 0)
    ms = media_start - (XF / 2 if fade else 0)
    assert ms >= 0, f"{cid}: negative media start {ms:.2f}"
    length = CLIP_LEN[src.split("/")[-1].removesuffix(".mp4")]
    assert ms + (end - s) <= length + 0.02, f"{cid}: runs past the recording ({ms + end - s:.2f} > {length:.2f})"
    clips.append({"id": cid, "src": f"assets/footage/{src}", "start": round(s, 3), "end": round(end, 3), "media": round(ms, 3), "fade": fade})


INTRO_STILL_MEDIA = 2.8  # dark, dry plant just before the pour (assets/stills/intro-dark.png)
add_clip("v-intro", "intro.mp4", T_POUR, S2B + XF / 2, INTRO_STILL_MEDIA, fade=False)
add_clip("v-orbit", "twin.mp4", S2B, S2C + XF / 2, M["twin"]["orbit_start"] + 0.75)
# "…and corrects it with machine learning": the equation hover lands just after the clause starts.
eq_at = CAPS[2][1][0] + 0.35
add_clip("v-twin", "twin.mp4", S2C, S3 + XF / 2, media_for(M["twin"]["equation"], eq_at, S2C))
# "Doing nothing breaks the water-quality limit…": the violation chip lands inside that clause.
viol_at = CAPS[3][1][0] + 1.5
add_clip("v-scen-a", "scenario.mp4", S3, CUT3 + XF / 2, media_for(M["scenario"]["violation"], viol_at, S3))
# "AquaTwin's plan holds every constraint": the branch switch lands as the clause starts.
switch_at = CAPS[3][2][0] + 0.15
add_clip("v-scen-b", "scenario.mp4", CUT3, S4 + XF / 2, media_for(M["scenario"]["aquatwin"], switch_at, CUT3))
ring_at = S4 + 1.5
add_clip("v-opt", "optimization.mp4", S4, S5 + XF / 2, media_for(M["optimization"]["ring"], ring_at, S4))
# "…it says so, and withholds its advice": the withheld banner lands as the clause starts.
withheld_at = CAPS[5][1][0] + 0.2
add_clip("v-ood", "withheld.mp4", S5, S6 + XF / 2, media_for(M["withheld"]["withheld"], withheld_at, S5))
add_clip("v-val", "validation.mp4", S6, S7 + 0.55, XF / 2)


def comp_time(clip_id: str, media_t: float) -> float:
    c = next(c for c in clips if c["id"] == clip_id)
    return c["start"] + (media_t - c["media"])


EV = {
    "equation": comp_time("v-twin", M["twin"]["equation"]),
    "cleaning": comp_time("v-twin", M["twin"]["cleaning"]),
    "violation": comp_time("v-scen-a", M["scenario"]["violation"]),
    "switch": comp_time("v-scen-b", M["scenario"]["aquatwin"]),
    "banner_opt": comp_time("v-opt", M["optimization"]["banner"]),
    "extreme_click": comp_time("v-ood", M["withheld"]["extreme"]),
    "withheld": comp_time("v-ood", M["withheld"]["withheld"]),
    "outside_click": comp_time("v-val", M["validation"]["outside"]),
}


# --------------------------------------------------------------------------- camera (seek-safe fromTo keyframes)


def frame(scale: float, anchor=(0.0, 0.0), screen=None):
    """Transform (origin 0 0) that keeps `anchor` at `screen` at the given scale, clamped so the footage covers the frame."""
    sx, sy = screen if screen else anchor
    x = sx - anchor[0] * scale
    y = sy - anchor[1] * scale
    x = max(W - W * scale, min(0.0, x))
    y = max(H - H * scale, min(0.0, y))
    return {"scale": round(scale, 4), "x": round(x, 1), "y": round(y, 1)}


FULL = {"scale": 1, "x": 0, "y": 0}
VIEWPORT = (1076, 445)  # centre of the 3D viewport on the overview page
cams = {
    # id: [(t0, t1, from, to, ease)]
    "still": [(0.0, T_POUR, FULL, frame(1.18, (1076, 400)), "sine.inOut")],
    "v-intro": [(T_POUR, T_POUR + 2.6, frame(1.18, (1076, 400)), FULL, "power2.inOut")],
    "v-orbit": [(S2B - XF / 2, S2C + XF / 2, FULL, frame(1.04, (850, 520)), "none")],
    # right-hand inspector and hybrid-estimate panels
    "v-twin": [(S2C - XF / 2, S3 + XF / 2, frame(1.55, (1920, 200)), frame(1.7, (1920, 200)), "power1.inOut")],
    # page context, then the 3D viewport, the violation chip and the outcome rows
    "v-scen-a": [(S3 + 1.6, S3 + 3.2, FULL, frame(1.3, (252, 280), (40, 70)), "power2.inOut")],
    # detail: the branch tabs and the outcome table
    "v-scen-b": [(CUT3 - XF / 2, S4 + XF / 2, frame(1.3, (1920, 70), (1920, 31)), frame(1.33, (1920, 70), (1920, 31)), "none")],
    # 676 candidates, then the AquaGuard verdict panel
    "v-opt": [
        (S4 + 0.3, S4 + 1.7, FULL, frame(1.3, (252, 180), (40, 60)), "power2.inOut"),
        (S4 + 4.4, S4 + 6.0, frame(1.3, (252, 180), (40, 60)), frame(1.45, (1900, 250), (1880, 100)), "power2.inOut"),
    ],
    # the probe: button, confidence and the withheld banner
    # whole probe width, so the sliders jumping past the training range stay in view
    "v-ood": [(EV["extreme_click"] + 0.35, EV["extreme_click"] + 1.9, FULL, frame(1.16, (252, 650), (0, 480)), "power2.inOut")],
    # prediction accuracy: inside vs outside the envelope
    "v-val": [(S6 + 0.2, S6 + 1.6, FULL, frame(1.4, (252, 120), (60, 40)), "power2.inOut")],
}

# --------------------------------------------------------------------------- audio

SFX = [
    ("sfx-pour", "assets/sfx/impact/impactSoft_medium_001.ogg", T_POUR - 0.02, 0.5),  # beat-locked 8.74
    ("sfx-viol", "assets/sfx/interface/drop_001.ogg", EV["violation"] - 0.02, 0.45),
    ("sfx-switch", "assets/sfx/interface/click_003.ogg", EV["switch"] - 0.02, 0.55),
    ("sfx-withheld", "assets/sfx/interface/bong_001.ogg", EV["withheld"] - 0.02, 0.5),  # beat-grid 43.10
    ("sfx-end", "assets/sfx/impact/impactBell_heavy_000.ogg", 52.90, 0.4),  # beat-grid 52.92
]
MUSIC = "assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3"
END_TITLE = 52.918  # beat
END_TAG = 54.0  # beat 53.998, as the voice says "Predict"
END_LINE = CAPS[7][1][0] - 0.05
END_CREDIT = 56.75  # beat

# --------------------------------------------------------------------------- markup

E = html.escape


def timed(tag, cid, start, end, cls, inner="", extra=""):
    return f'<{tag} id="{cid}" class="clip {cls}" data-start="{start:.3f}" data-duration="{end - start:.3f}"{extra}>{inner}</{tag}>'


layers = []
z = 1
layers.append(
    f'<img id="still" class="clip media" style="z-index:{z}" data-start="0" data-duration="{T_POUR:.3f}" src="assets/stills/intro-dark.png" alt="" />'
)
for c in clips:
    z += 1
    layers.append(
        f'<video id="{c["id"]}" class="clip media" style="z-index:{z}" data-start="{c["start"]:.3f}" data-duration="{c["end"] - c["start"]:.3f}" '
        f'data-media-start="{c["media"]:.3f}" src="{c["src"]}" muted playsinline></video>'
    )

# Hook (scene 1): the narration is on screen as type, so no captions here.
HOOK_END = T_POUR + 0.4
layers.append(timed("div", "hook-kicker", 0, HOOK_END, "txt kicker", "Seawater reverse osmosis · Arabian Gulf"))
layers.append(timed("p", "hook-1", CAPS[1][0][0], HOOK_END, "txt hook-line", E(CHUNKS[1][0])))
layers.append(timed("p", "hook-2", CAPS[1][1][0] - 0.05, HOOK_END, "txt hook-line", E(CHUNKS[1][1])))

# Captions (scenes 2–6): one timed element per clause.
cap_ids = []
for i in range(2, 7):
    for k, (s0, e0, t) in enumerate(CAPS[i]):
        cid = f"cap-{i}-{k}"
        cap_ids.append((cid, s0, e0))
        layers.append(timed("div", cid, s0, e0 + 0.12, "txt capline", f'<span class="pill">{E(t)}</span>'))

# End card (scene 7): background, mark and text lines as separate timed elements.
layers.append(timed("div", "end-bg", S7, DURATION, "end-bg"))
layers.append(timed("div", "end-glow", S7, DURATION, "end-glow"))
layers.append(f'<img id="end-mark" class="clip txt end-mark" data-start="{S7:.3f}" data-duration="{DURATION - S7:.3f}" src="assets/stills/aquatwin-mark.svg" alt="" />')
layers.append(timed("h1", "end-title", END_TITLE, DURATION, "txt end-line-el", "AquaTwin."))
layers.append(timed("p", "end-tag", END_TAG, DURATION, "txt end-line-el", "Predict. Simulate. Adapt."))
layers.append(timed("p", "end-line", END_LINE, DURATION, "txt end-line-el", "Before the plant is forced to react."))
layers.append(timed("p", "end-credit", END_CREDIT, DURATION, "txt end-line-el", "Built by Team Kanban · kanbanstudios.ae/team-kanban"))
layers.append(timed("p", "end-note", END_CREDIT + 0.25, DURATION, "txt end-line-el", "Research prototype · all results simulated"))

audio = []
for i in range(7):
    audio.append(
        f'<audio id="vo-{i + 1}" data-start="{VO_START[i]:.3f}" data-duration="{VO_LEN[i]:.3f}" data-track-index="{3 + i}" data-volume="1" src="assets/vo/line{i + 1}.wav"></audio>'
    )
# Music bed under the voice, then a small lift on the end card (same track position, cross-faded).
audio.append(
    f'<audio id="music-bed" data-start="0" data-duration="57.900" data-media-start="0" data-track-index="20" data-volume="0.14" data-fade-in="1.2" data-fade-out="0.5" src="{MUSIC}"></audio>'
)
audio.append(
    f'<audio id="music-end" data-start="57.600" data-duration="{DURATION - 57.6:.3f}" data-media-start="57.600" data-track-index="21" data-volume="0.22" data-fade-in="0.3" data-fade-out="1.6" src="{MUSIC}"></audio>'
)
def media_len(rel: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(COMP / rel)], capture_output=True, text=True).stdout
    return float(out.strip())


for k, (sid, src, t, vol) in enumerate(SFX):
    d = min(2.5, media_len(src))
    audio.append(f'<audio id="{sid}" data-start="{t:.3f}" data-duration="{d:.3f}" data-track-index="{30 + k}" data-volume="{vol}" src="{src}"></audio>')

# --------------------------------------------------------------------------- timeline script


def js(v) -> str:
    return json.dumps(v)


tw = []  # timeline statements
for cid, keys in cams.items():
    tw.append(f"tl.set('#{cid}', {js({**keys[0][2], 'transformOrigin': '0 0'})}, 0);")
    for t0, t1, a, b, ease in keys:
        tw.append(f"tl.fromTo('#{cid}', {js(a)}, {{...{js(b)}, duration: {t1 - t0:.3f}, ease: {js(ease)}, immediateRender: false}}, {t0:.3f});")
# cross-dissolves: each incoming footage clip fades in over the previous one
for c in clips:
    if c["fade"]:
        tw.append(f"tl.set('#{c['id']}', {{opacity: 0}}, 0);")
        tw.append(f"tl.fromTo('#{c['id']}', {{opacity: 0}}, {{opacity: 1, duration: {XF}, ease: 'none', immediateRender: false}}, {c['start']:.3f});")


def fade_in(sel, t, d=0.5, y=14):
    tw.append(f"tl.set('{sel}', {{opacity: 0, y: {y}}}, 0);")
    tw.append(f"tl.fromTo('{sel}', {{opacity: 0, y: {y}}}, {{opacity: 1, y: 0, duration: {d}, ease: 'power2.out', immediateRender: false}}, {t:.3f});")


def fade_to(sel, t, d, opacity):
    tw.append(f"tl.to('{sel}', {{opacity: {opacity}, duration: {d}, ease: 'power1.inOut'}}, {t:.3f});")


# hook
fade_in("#hook-kicker", 0.25, 0.6, 8)
fade_in("#hook-1", CAPS[1][0][0], 0.6)
fade_in("#hook-2", CAPS[1][1][0] - 0.05, 0.6)
tw.append(f"tl.fromTo('#hook-1', {{color: '#e8edf4'}}, {{color: '#8d97a8', duration: 0.5, ease: 'power1.inOut', immediateRender: false}}, {CAPS[1][1][0] - 0.05:.3f});")
for hid in ("#hook-kicker", "#hook-1", "#hook-2"):
    tw.append(f"tl.to('{hid}', {{opacity: 0, duration: 0.45, ease: 'power1.in'}}, {T_POUR - 0.1:.3f});")
# captions: quick fade in and out inside their windows
for cid, s, e in cap_ids:
    tw.append(f"tl.set('#{cid}', {{opacity: 0}}, 0);")
    tw.append(f"tl.fromTo('#{cid}', {{opacity: 0}}, {{opacity: 1, duration: 0.14, ease: 'none', immediateRender: false}}, {s:.3f});")
    tw.append(f"tl.fromTo('#{cid}', {{opacity: 1}}, {{opacity: 0, duration: 0.12, ease: 'none', immediateRender: false}}, {e:.3f});")
# end card
tw.append(f"tl.set('#end-bg', {{opacity: 0}}, 0);")
tw.append(f"tl.fromTo('#end-bg', {{opacity: 0}}, {{opacity: 1, duration: 0.5, ease: 'power1.out', immediateRender: false}}, {S7:.3f});")
fade_in("#end-mark", S7 + 0.2, 0.6, 10)
fade_in("#end-title", END_TITLE, 0.6, 18)  # beat-locked: 52.92 s
fade_in("#end-tag", END_TAG, 0.55, 12)  # beat-grid: 54.00 s
fade_in("#end-line", END_LINE, 0.55, 10)
fade_in("#end-credit", END_CREDIT, 0.5, 8)  # beat-grid: 56.75 s
fade_in("#end-note", END_CREDIT + 0.25, 0.5, 8)
tw.append(f"tl.set('#end-glow', {{opacity: 0, scale: 0.96}}, 0);")
tw.append(f"tl.fromTo('#end-glow', {{opacity: 0, scale: 0.96}}, {{opacity: 1, scale: 1.04, duration: {DURATION - S7:.3f}, ease: 'sine.inOut', immediateRender: false}}, {S7:.3f});")

CSS = """
@font-face { font-family: 'Geist'; src: url('assets/fonts/Geist-Latin.woff2') format('woff2'); font-weight: 100 900; font-style: normal; }
@font-face { font-family: 'Geist Mono'; src: url('assets/fonts/GeistMono-Latin.woff2') format('woff2'); font-weight: 100 900; font-style: normal; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #04060a; }
#root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #04060a; font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; color: #e8edf4; }
.clip { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
.media { object-fit: cover; transform-origin: 0 0; background: #04060a; }
.txt { pointer-events: none; height: auto; z-index: 50; }
.kicker { top: 640px; left: 150px; width: 1400px; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 17px; letter-spacing: 0.18em; text-transform: uppercase; color: #8d97a8; }
.hook-line { left: 150px; width: 1400px; font-size: 54px; line-height: 1.16; font-weight: 500; letter-spacing: -0.02em; color: #e8edf4; text-wrap: balance; }
#hook-1 { top: 690px; }
#hook-2 { top: 836px; color: #ffffff; }
.capline { top: auto; bottom: 46px; left: 0; width: 1920px; text-align: center; }
.pill { display: inline-block; max-width: 1420px; padding: 10px 24px 12px; border-radius: 12px; background: rgba(4, 6, 10, 0.82); color: #f3f6fa; font-size: 34px; line-height: 1.3; font-weight: 500; letter-spacing: -0.005em; text-wrap: balance; }
.end-bg { background: #04060a; z-index: 60; }
.end-glow { z-index: 61; background: radial-gradient(ellipse 700px 450px at 50% 44%, rgba(91, 157, 255, 0.16), rgba(91, 157, 255, 0.05) 55%, rgba(4, 6, 10, 0) 100%); }
.end-mark { z-index: 62; top: 232px; left: 918px; width: 84px; height: 84px; }
.end-line-el { z-index: 62; left: 0; width: 1920px; text-align: center; }
#end-title { top: 350px; font-size: 132px; line-height: 1; font-weight: 600; letter-spacing: -0.04em; color: #f3f6fa; }
#end-tag { top: 512px; font-size: 50px; line-height: 1.2; font-weight: 500; letter-spacing: -0.02em; color: #9cc3ff; }
#end-line { top: 590px; font-size: 34px; line-height: 1.3; font-weight: 400; color: #b4bdca; }
#end-credit { top: 716px; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 22px; letter-spacing: 0.04em; color: #c4ccd8; }
#end-note { top: 758px; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 17px; letter-spacing: 0.14em; text-transform: uppercase; color: #8d97a8; }
"""

page = f"""<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>AquaTwin — one-minute video</title>
    <!-- Generated by video/tools/build_composition.py; edit the script, not this file. -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>{CSS}</style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{DURATION}" data-width="{W}" data-height="{H}">
      {chr(10).join('      ' + l for l in layers).lstrip()}
      {chr(10).join('      ' + a for a in audio).lstrip()}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join('      ' + s for s in tw).lstrip()}
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""
(COMP / "index.html").write_text(page, encoding="utf-8", newline="\n")


# --------------------------------------------------------------------------- captions sidecar + timing summary


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


cues = [c for i in range(1, 8) for c in CAPS[i]]
srt = "\n".join(f"{n}\n{srt_time(s)} --> {srt_time(e + 0.12)}\n{t}\n" for n, (s, e, t) in enumerate(cues, 1))
(ROOT / "video" / "captions.srt").write_text(srt, encoding="utf-8", newline="\n")

summary = {
    "duration": DURATION,
    "narration": [{"line": i + 1, "start": VO_START[i], "end": round(VO_START[i] + VO_LEN[i], 3)} for i in range(7)],
    "clips": clips,
    "events": {k: round(v, 3) for k, v in EV.items()},
    "captions": [{"start": round(s, 3), "end": round(e, 3), "text": t} for s, e, t in cues],
    "end_card": {"start": round(S7, 3), "title": END_TITLE, "tagline": END_TAG, "line": round(END_LINE, 3), "credit": END_CREDIT},
    "sfx": [{"id": s, "t": round(t, 3), "volume": v} for s, _, t, v in SFX],
}
(COMP / "timing.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps({"events": summary["events"], "clips": [(c["id"], c["start"], c["end"], c["media"]) for c in clips]}, indent=1))
