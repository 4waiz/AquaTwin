"""
Caption sidecars (SRT and WebVTT) for the film, from the aligned word timings.

  python video/motion/tools/captions.py

Reads video/motion/reel/data/words.json and writes video/motion/out/captions.srt and
captions.vtt. Chunks follow the film's burned-in subtitles: break at sentence ends,
at commas after ~30 characters, and before 52 characters; numbers and acronyms are
shown in their written form (the script spells them as spoken).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
WORDS = HERE / "reel" / "data" / "words.json"
OUT = HERE / "out"
MAX = 52


def written(words: list[dict]) -> list[dict]:
    out, i = [], 0
    while i < len(words):
        w = words[i]
        if w["w"] == "S" and i + 2 < len(words) and words[i + 1]["w"] == "D" and words[i + 2]["w"] == "G":
            six = i + 3 < len(words) and re.match(r"(?i)six", words[i + 3]["w"])
            end = words[i + 3] if six else words[i + 2]
            out.append({**w, "w": "SDG " + re.sub(r"(?i)six", "6", words[i + 3]["w"]) if six else "SDG", "e": end["e"]})
            i += 4 if six else 3
            continue
        out.append({**w, "w": re.sub(r"(?i)^twenty-one", "21", w["w"])})
        i += 1
    return out


def chunks(words: list[dict]) -> list[list[dict]]:
    res, cur, n, line = [], [], 0, None
    for w in words:
        prev = cur[-1]["w"] if cur else ""
        if cur and (w.get("line") != line or (re.search(r"[.:;?!]$", prev) and n >= 10) or (prev.endswith(",") and n > 30) or n + len(w["w"]) + 1 > MAX):
            res.append(cur)
            cur, n = [], 0
        line = w.get("line")
        cur.append(w)
        n += len(w["w"]) + 1
    if cur:
        res.append(cur)
    return res


def stamp(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def main() -> None:
    words = written(json.loads(WORDS.read_text(encoding="utf-8")))
    cs = chunks(words)
    cues = []
    for i, c in enumerate(cs):
        start = max(0.0, c[0]["s"] - 0.1)
        end = c[-1]["e"] + 0.5
        if i + 1 < len(cs):
            end = min(end, cs[i + 1][0]["s"] - 0.12)
        cues.append((start, end, " ".join(w["w"] for w in c)))
    OUT.mkdir(parents=True, exist_ok=True)
    srt = "\n".join(f"{k}\n{stamp(a, ',')} --> {stamp(b, ',')}\n{text}\n" for k, (a, b, text) in enumerate(cues, 1))
    vtt = "WEBVTT\n\n" + "\n".join(f"{stamp(a, '.')} --> {stamp(b, '.')}\n{text}\n" for a, b, text in cues)
    (OUT / "captions.srt").write_text(srt, encoding="utf-8")
    (OUT / "captions.vtt").write_text(vtt, encoding="utf-8")
    print(f"wrote {len(cues)} cues")


if __name__ == "__main__":
    main()
