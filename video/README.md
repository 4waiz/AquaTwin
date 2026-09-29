# AquaTwin — one-minute video

| File | What it is |
|---|---|
| `brag.mp4` | The video: 1920×1080, 30 fps, 59.5 s, voice-over, music, burned-in captions |
| `brag.jpg` | Poster frame (also baked in as frame 0 of `brag.mp4`) |
| `captions.srt` | Caption sidecar for players and platforms that take one |
| `voiceover.md` | Narration script with its timing in the video |
| `share-copy.txt` | One-paragraph caption for posting |
| `brag-plan.md` | Plan and storyboard |
| `composition-brief.md` | The brief the composition was built from, with the timings as built |
| `composition/` | Hyperframes project (editable source) |
| `tools/` | Footage recorder and composition generator |

Everything in the film is the real application running on the simulated plant; all numbers on screen are simulation results.

## Rebuild

Requirements: Node.js 22+, FFmpeg, Python 3.12 with Playwright (`pip install playwright`) and Google Chrome.

1. Build and serve the app (`npm run build`, then `npm run start` → http://localhost:3200).
2. Record footage. Each clip is captured from Chrome's DevTools screencast with real frame timestamps and re-timed to constant 30 fps; the time of every on-screen event is written to `composition/assets/footage/footage.json`.

   ```bash
   python video/tools/record_footage.py --base http://localhost:3200
   ```

3. Copy the music track into `composition/assets/music/` (see the README there; it is not redistributed here).
4. Generate the composition. Cuts, camera moves, captions and sound effects are placed from the recorded event times and from the pauses measured in the narration.

   ```bash
   python video/tools/build_composition.py
   ```

5. Check, render and set the poster:

   ```bash
   cd video/composition
   npx hyperframes@0.8.91 check
   npx hyperframes@0.8.91 render --quality delivery --video-frame-format png --fps 30 --output ../brag.mp4
   cd ..
   ffmpeg -ss 57.6 -i brag.mp4 -frames:v 1 -q:v 2 brag.jpg
   ffmpeg -y -i brag.mp4 -i brag.jpg -filter_complex "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]" -map "[v]" -map 0:a? -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart brag.poster.mp4
   mv brag.poster.mp4 brag.mp4
   ```

The Scenario Lab forecast starts from the live plant state and the time of day at which it is recorded, so re-recorded footage can differ in detail from this cut.

## Credits

Built by [Team Kanban](https://kanbanstudios.ae/team-kanban). Voice: Kokoro-82M (`af_heart`). Music: "Happy Beats / Business Moves Vol. 12" by ende.app. Sound effects: Kenney (CC0). Fonts: Geist and Geist Mono (SIL OFL 1.1). Rendered with Hyperframes.
