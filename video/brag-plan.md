# Brag Plan: AquaTwin

## What is this app?
A physics-informed, self-calibrating digital twin for seawater reverse-osmosis desalination that keeps a physical model of each RO train calibrated to live telemetry, corrects it with machine learning, rehearses disturbances 24 hours ahead, recommends operating strategies screened by a deterministic safety layer (AquaGuard) — and withholds its advice when conditions leave what it has learned.

## Step-1 rubric (answers)
1. **App:** a decision-support digital twin for SWRO plants — predict, simulate, adapt, with hard safety limits.
2. **Strongest claim:** "When conditions leave what the model has learned, it says so — and withholds its advice." Also the product's own line: *"Stress-test the plant before the plant is stressed."*
3. **Visual hook:** the real 3D twin coming alive — water poured onto a dark, dry plant, pipes and trains activating in sequence.
4. **Real UI to show:** Digital Twin inspector (*Cleaning due · pressure drop +25 %*; Physics + ML residual = AquaTwin estimate), Scenario Lab salinity shock (*No action* → CONSTRAINT VIOLATED; *AquaTwin response* holds), Optimization scatter with *RECOMMENDATION APPROVED*, Model Intelligence probe → *LOW MODEL CONFIDENCE · RECOMMENDATION WITHHELD*, Validation tables.
5. **Length:** 60 s — the hackathon's one-minute video (explicit `--duration` override of the 15–25 s default; the storyline has six product beats).
6. **Tone:** preset `polished`; direction "calm engineering film — the real software, no hype".
7. **Audio:** low, steady music bed ducked under a calm voiceover; three or four restrained accents on real UI changes; a soft bell on the end card.
8. **Share caption:** see below.
9. **User flow:** open the living twin → inspect Train 2 → rehearse a salinity shock (no action vs AquaTwin) → see the recommended strategy approved by AquaGuard → push inputs beyond the envelope → recommendation withheld.

## The angle
Most "AI for water" demos promise answers. AquaTwin's story is the opposite discipline: physics first, machine learning only where the physics is wrong, hard limits that are never traded off, and the honesty to say "I don't know". The video shows the working product doing exactly that, in order, with a calm voice — the confidence comes from restraint, not adjectives. Every number on screen is labelled simulated; the video says so.

## Hook (first 3–5 seconds)
Near-black frame; the dark, dry 3D plant barely visible behind type. One line: **"Gulf desalination runs on fixed setpoints and fixed alarms."** A second line lands under it: **"By the time an alarm fires, the plant is already reacting."** Then water starts to pour — the twin comes alive.

## Key moments
- The plant filling with water and activating stage by stage (the real intro).
- Train 2 in the inspector: *Cleaning due · pressure drop +25 %*, and the equation **Physics · 0D + ML residual = AquaTwin**.
- Scenario Lab, salinity shock: timeline plays on *No action*, permeate TDS crosses 400 mg/L, the RO racks turn red, **CONSTRAINT VIOLATED**; switch to *AquaTwin response* — the racks calm down, every constraint held.
- 676 candidate strategies in the SEC-vs-stress plane; **RECOMMENDATION APPROVED** with its AquaGuard checklist.
- One click on *Compound extreme* (53 g/L, 37.5 °C): confidence falls to 35 %, **LOW MODEL CONFIDENCE · RECOMMENDATION WITHHELD**.
- Validation: switching accuracy from *inside* to *outside envelope* — the honest part.

## Outro / punchline
End card on the product's dark navy: **AquaTwin.** / **Predict. Simulate. Adapt.** / *Before the plant is forced to react.* / Built by Team Kanban — kanbanstudios.ae/team-kanban / "Research prototype · all results simulated".

## User flow worth showing
Living twin (Overview / Digital Twin) → Scenario Lab rehearsal (no action vs AquaTwin) → Optimization (approved) → Model Intelligence (withheld). This is the centerpiece; title cards frame it only at the start and the end.

## Tone
- Preset: `polished`
- Creative direction: calm engineering film showing the real software; no hype
- Interpretation: fewer, longer holds; soft cross-dissolves and slow push-ins toward the UI detail that matters; sentence-case type; no exclamation marks; captions that read like subtitles, not slogans.

## Format: landscape — 1920x1080
## Duration: 60 s (voice-led; scenes flex to the generated narration)

## Visual identity (from the project)
- Background: `#04060a` (ink-950), panels `#0b1017`–`#111722`
- Accent: `#5b9dff` (restrained cool blue); ok `#3ecf8e`; warn `#f2a93b`; critical `#f0564d` (only where the app itself uses them)
- Text: `#e8edf4` (fg), muted `#a2acba`
- Display / body font: Geist (the app's font) — fall back to Inter/system sans in the composition if Geist is unavailable
- Mono: Geist Mono (labels such as SIMULATED, APPROVED)
- Strongest visual element: the procedural 3D plant with flowing water; the AquaGuard verdict banners

## Share copy (draft)
AquaTwin: a physics-informed digital twin for seawater desalination that rehearses disturbances before they happen, screens every recommendation against hard limits — and withholds its advice when it's outside what it knows. Built by Team Kanban for the KU–UNESCO Global Water Hackathon 2026.

## Audio direction
- Role: warm bed under narration, sparse professional accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, clean; ~110 BPM)
- Music treatment: fade in over 1.5 s; bed at ~0.30 before the voice starts, ducked to ~0.13 while the voice speaks; lift slightly on the end card; 2.5 s fade-out
- Music cue guidance: bundled preset `cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (109.96 BPM). Strong cues in the first 25 s: 8.74, 13.11, 17.47 s — candidates for the twin reveal and the first scenario switch; beyond 25 s use the beat grid (~0.545 s spacing). Readability and the voice come first.
- Audio-reactive treatment: subtle — the end-card title glow may breathe with music RMS; nothing on the product footage.
- SFX posture: sparse (3–4), motion-matched, soft: a gentle drop when the violation chip appears, a soft switch on the branch change, a quiet bell on WITHHELD, a soft bell on the end card.
- Audio-coupled moments: branch switch click; violation chip; withheld banner; end-card title.
- Restraint rule: no whooshes, no risers, no cue louder than the voice; nothing on every beat.

## Voiceover script (Kokoro, af_heart, calm)
Separate lines so each scene can be timed to its line:

1. "Gulf desalination plants run on fixed setpoints and fixed alarms. By the time an alarm fires, the plant is already reacting."
2. "AquaTwin keeps a physical model of every reverse-osmosis train calibrated to live data, and corrects it with machine learning. Right now it's telling us Train 2 is due for cleaning."
3. "Before a salinity shock arrives, it simulates the next day. Doing nothing breaks the water-quality limit within three hours. AquaTwin's plan holds every constraint."
4. "It searches six hundred and seventy-six operating strategies, and a safety layer, AquaGuard, checks every limit at the edge of the model's uncertainty."
5. "And when conditions go beyond what the model has learned, it says so — and withholds its advice."
6. "Every result is simulated, tested against a hidden plant, and reproducible — including where it doesn't help."
7. "AquaTwin. Predict, simulate, adapt — before the plant is forced to react."

Facts checked against the app and `docs/VALIDATION.md`: 676 candidates; no-action first violation at +2.7 h; Train 2 pressure-drop criterion met; compound extreme withheld at 35 % confidence.

## Storyboard

### Scene 1 — The problem — ~6.5 s (VO 1)
Near-black frame; the first frame of the real intro (dark, dry plant) sits behind, dimmed. Line 1 fades up, then line 2 beneath it. Small top label: "SWRO desalination · Arabian Gulf".
Sequential/interaction: two lines, one after the other, each held ≥ 2 s.
Audio intent: music fades in, calm and patient.
Audio-coupled idea: none.
Transition mood: soft → the same plant, now coming alive.

### Scene 2 — The living twin — ~11 s (VO 2)
Real footage: water poured onto the plant, splash and ripple, pipes filling intake → pretreatment → pumps → RO → product, then LIVE. Cut to the Digital Twin page: slow push-in to the RO train 2 inspector (*Cleaning due · pressure drop +25 %*), then to the **Physics · 0D + ML residual = AquaTwin** row.
Sequential/interaction: slow camera orbit in the 3D view (real drag), then the push-ins.
Audio intent: first real movement of the video; the bed can breathe.
Audio-coupled idea: none — let the water carry it.
Transition mood: clean → Scenario Lab.

### Scene 3 — Rehearse the disturbance — ~12 s (VO 3)
Real footage, Scenario Lab, salinity shock. *No action* selected, timeline plays from NOW; at +2.7 h the racks turn red and **CONSTRAINT VIOLATED** appears; the permeate-TDS chart crosses the 400 mg/L line. Then the *AquaTwin response* tab is clicked — racks return to normal, the outcome table shows 12.2 h vs 0.
Sequential/interaction: tab click → play → violation → tab click.
Audio intent: tension without drama.
Audio-coupled idea: soft drop when the violation chip appears; soft switch on the branch change.
Transition mood: clean → Optimization.

### Scene 4 — Search and screen — ~10 s (VO 4)
Real footage, Optimization: 676 candidates (blue admissible, hollow rejected, amber withheld), the ringed AQUATWIN RECOMMENDED point, then push-in to **RECOMMENDATION APPROVED** and the constraint checklist at the 90 % bound.
Sequential/interaction: cursor hovers along the Pareto front (tooltips).
Audio intent: steady, confident.
Audio-coupled idea: none, or one very soft click on hover.
Transition mood: clean → Model Intelligence.

### Scene 5 — Knowing when not to answer — ~8 s (VO 5)
Real footage, Model Intelligence probe: the *Compound extreme* button is clicked; sliders jump beyond the training envelope; confidence falls to 35 %; banner **LOW MODEL CONFIDENCE · RECOMMENDATION WITHHELD** — push-in on the banner.
Sequential/interaction: button click.
Audio intent: the quiet centre of the film.
Audio-coupled idea: quiet bell as the banner lands.
Transition mood: soft → Validation.

### Scene 6 — Honest evidence — ~7 s (VO 6)
Real footage, Validation page: accuracy bars; the *Outside envelope* toggle is clicked — ML-only error jumps, the hybrid degrades less; the closed-loop table stays in view. Label: "Simulated · 5 seeds".
Sequential/interaction: toggle click.
Audio intent: settle.
Transition mood: soft → end card.

### Scene 7 — End card — ~6 s (VO 7)
Dark navy card: AquaTwin mark + **AquaTwin.** / **Predict. Simulate. Adapt.** / *Before the plant is forced to react.* / Built by Team Kanban — kanbanstudios.ae/team-kanban / "Research prototype · all results simulated".
Sequential/interaction: title, then tagline, then credit (each held).
Audio intent: resolve; soft bell on the title; music fades out.
Audio-coupled idea: subtle audio-reactive glow on the title.

**Music mood for this video:** calm, steady, premium.
**Audio summary:** a quiet bed that makes room for a calm voice, three soft accents on real UI state changes, and a gentle bell to close.

## Notes
- Captions are burned in (bottom-centre, subtitle style) and also exported as `captions.srt`.
- No personal data appears in the app; the only names are the product, Team Kanban and cited public sources.
- No endorsement is implied; the end card states that results are simulated.
