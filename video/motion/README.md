# AquaTwin: the one-minute film (motion graphics as code)

A 57.5-second narrated motion-graphics pitch, written as code and locked to the voice: every scene ("plate") draws each frame as a pure function of time, and its animation is timed from the word-level timings of the voiceover. Built with the Kanban Motion starter kit (the Motion as Code workflow).

| Path | What it is |
|---|---|
| `script.txt` | The narration, one line per beat (numbers and acronyms written as spoken) |
| `reel/reel.js` | The timeline: which plate plays when; cuts come from the voice (`cut('Meet AquaTwin')`) |
| `reel/plates/aq-*.js` | The AquaTwin plates (hook, alarm, reveal, hybrid, shock, fouling, guard, proof, pillars, outro, subtitles) and their helpers (`aq.js`) |
| `reel/plates/screen.js`, `aq-hero.js` | The running app: a Scenario Lab screenshot with camera moves and callouts, and a full-bleed render of the 3D twin (`scripts/qa/hero_shot.py`) |
| `reel/style.css` | Palette and type, taken from the app and the logo |
| `reel/data/aq-results.json` | The real simulation results the charts draw (exported from `public/data/validation/results.json`) |
| `reel/data/words.json`, `lines.json`, `audio.json` | Word timings, line bounds and the voice envelope |
| `reel/audio/voiceover.wav` | Kokoro-82M, voice `af_heart` |
| `reel/cues.json` | Sound-effect cue sheet (Kenney, CC0), anchored to words |
| `tools/captions.py` | SRT / WebVTT captions from the word timings |

Everything on screen is the real product or its real simulation results: the alarm, salinity-shock and fouling charts plot the closed-loop trajectories from the validation experiments, the AquaGuard values are the app's own, and the 3D and Scenario Lab shots come from the running application.

## Rebuild

Requirements: Node 18+, Chrome or Edge, ffmpeg (libx264), uv; the Kanban Motion skill (`<skill-dir>` below) for the renderer, voice, alignment, music and mix scripts (`npm install --prefix <skill-dir>/scripts` once).

```bash
cd video/motion
# 1. voice and word timings
uv run <skill-dir>/scripts/voiceover.py script.txt -o reel/audio/voiceover.wav --lines reel/data/lines.json --voice af_heart --speed 1.0 --lead 0.5 --gap 0.38
uv run <skill-dir>/scripts/align.py reel/audio/voiceover.wav --script script.txt --lines reel/data/lines.json -o reel/data/words.json --model small.en
# 2. original music bed (C minor, 96 bpm) and the mix (-14 LUFS)
uv run <skill-dir>/scripts/bed.py -o reel/audio/music.wav --duration 57.5 --bpm 96 --key C --mode minor --style pulse --brightness 1.05 --seed 7
uv run <skill-dir>/scripts/mix.py reel/cues.json -o out/mix.wav
# 3. app screenshots for the screen plates (app served at http://127.0.0.1:3300)
python ../../scripts/qa/screenshots.py --base http://127.0.0.1:3300 --out work/screens2x --nvidia --scale 2 --only 03a-scenario-lab-no-action
cp work/screens2x/03a-scenario-lab-no-action.png reel/assets/screens/
python ../../scripts/qa/hero_shot.py --base http://127.0.0.1:3300 --out work/hero --scale 2 --nvidia
cp work/hero/hero-0.png reel/assets/hero.png
# 4. preview, stills, render
node <skill-dir>/scripts/render.mjs preview --dir reel
node <skill-dir>/scripts/render.mjs stills --dir reel --plates --out out/wip
node <skill-dir>/scripts/render.mjs video --dir reel --samples 8 --shutter 0.5 --crf 17 --audio out/mix.wav --out out/aquatwin-film.mp4
python tools/captions.py
```

Credits: Team Kanban. Voice: Kokoro-82M (Apache-2.0). Music: original, generated for the film. Sound effects: Kenney (CC0). Fonts: Geist and Geist Mono (SIL OFL 1.1). Motion engine: Kanban Motion starter kit.
