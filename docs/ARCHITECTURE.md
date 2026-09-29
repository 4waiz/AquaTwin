# AquaTwin — architecture

## 1. System overview

```
┌──────────────────────────── Browser (single-page app, no backend) ─────────────────────────────┐
│                                                                                                  │
│  Next.js 16 App Router (React 19, Tailwind 4) — 11 statically prerendered pages                  │
│   ├─ AppShell: sidebar, top bar, TwinHost (one persistent WebGL canvas), intro overlay            │
│   ├─ zustand stores: live · scenario · runs · ui          (src/state)                            │
│   └─ twinClient (typed message protocol)                  (src/runtime/client.ts, protocol.ts)   │
│             │                                   │                                                 │
│             ▼                                   ▼                                                 │
│  ┌─ live.worker ───────────────────┐   ┌─ compute.worker ─────────────────────────────┐         │
│  │ TwinRuntime (1 Hz tick)         │   │ ComputeRuntime                                 │         │
│  │  reference plant (hidden truth) │   │  Scenario Lab: twin forward, no action vs      │         │
│  │  → noisy telemetry              │   │   AquaTwin (24 h, hourly decisions)            │         │
│  │  → self-calibration θ̂           │   │  optimisation (676 candidates + AquaGuard)     │         │
│  │  → hybrid prediction, health,   │   │  OOD probe (reference vs physics/ML/hybrid)    │         │
│  │    trends, AquaGuard, alerts    │   │  safe-operating envelope (40 × 40 grid)        │         │
│  └─────────────────────────────────┘   └───────────────────────────────────────────────┘         │
│             ▲  model bundle + degradation fit (JSON, fetched once)  ▲                            │
└─────────────┼─────────────────────────────────────────────────────┼──────────────────────────────┘
              │                                                     │
   public/data/models/aquatwin-ml.json (trees, conformal, OOD)   public/data/validation/results.json
              ▲                                                     ▲
   ml/train.py (scikit-learn) ◄── data/ml/dataset.csv.gz ◄── scripts/generate-dataset.ts
                                                     scripts/run-experiments.ts (closed loop, 5 seeds)
```

- **No server-side computation.** Every page is prerendered static HTML; all modelling runs in the browser in two Web Workers so the interface and the 3D view never block. Nothing leaves the browser; run records are kept in `localStorage` only.
- **One simulation core** (`src/sim/`, framework-free TypeScript) is shared by the workers, the experiment scripts (Node via `tsx`), the tests (vitest) and the dataset generator. The numbers on screen, in the validation experiments and in the report come from the same code.
- **The ML model is trained offline in Python** and exported as JSON trees. A small TypeScript runtime (`TreeEnsemble` in `src/sim/ml.ts`) evaluates them in the browser; parity with scikit-learn is verified to 1·10⁻⁹ (`npm run ml:parity`, `tests/ml.test.ts`).

## 2. Source layout

```
src/
  app/                  pages (Overview, Digital Twin, Scenario Lab, Optimization, Membrane Health,
                        Water Quality, Energy & Carbon, Model Intelligence, Validation, Reports, About)
  components/           UI primitives, charts (SVG + d3-scale), page components
  sim/                  simulation core — see docs/MODEL.md
    seawater.ts         Sharqawy/WaterTAP properties
    referencePlant.ts   element-level "true" plant, fouling, sensors
    physics0d.ts        AquaTwin 0D model + self-calibration
    ml.ts               tree runtime, conformal intervals, OOD
    twin.ts             hybrid predictor, estimator, health, degradation
    forecast.ts         trend + threshold forecast
    planner.ts          production planning
    optimizer.ts        candidate search, scoring, Pareto
    aquaguard.ts        deterministic safety layer
    closedLoop.ts       closed-loop simulation (Scenario Lab, validation)
    scenarios.ts        disturbance definitions
  runtime/              workers, protocol, client
  state/                zustand stores
  twin/                 3D digital twin (three.js)
    TwinEngine.ts       renderer, frame loop, visual state, picking, quality governor
    CameraRig.ts        framing presets, focus, limits
    scene/              procedural plant, pipes, flow particles, water surfaces, materials
    render/             post-processing, studio environment, performance monitor
    intro/              intro sequence (IntroController, WaterPour, PlantActivation, FlowAnimator, IntroOverlay)
    react/              TwinHost (canvas owner), viewport slots, callouts, perf panel
scripts/                dataset, experiments, parity, QA (Python/Playwright), report
ml/                     training script, artefacts, requirements
tests/                  vitest unit tests (physics, safety, ML parity)
docs/                   MODEL, VALIDATION, ARCHITECTURE, REFERENCES, QA, screenshots
report/                 final report source and PDF
```

## 3. Runtime

### 3.1 Live plant (live.worker)

`TwinRuntime` back-fills 24 h of history at 5-minute resolution, then advances the reference plant in sub-steps of ≤ 60 s (simulation speed 1× to 600× from the top bar). Each tick produces noisy measurements, updates the per-train self-calibration, evaluates the hybrid model and AquaGuard at the current setpoints, computes normalised health (NPF/NSP/NDP) and 24-h trends, and posts a `LiveSnapshot` (≈ 1 Hz) to the UI. The live plant is dispatched at the design point unless the operator applies a recommendation in shadow mode ("Apply in simulation").

### 3.2 Compute (compute.worker)

`ComputeRuntime` answers requests from pages: scenario forecasts (cached for 10 simulated minutes), optimisation of the live state or of a Scenario Lab moment, the out-of-distribution probe, and the safe-operating envelope. After the intro, the six Scenario Lab forecasts are pre-computed in the background so every page has them; a user request for a scenario already running joins that job.

### 3.3 State and pages

Pages subscribe to stores with selectors; the 3D view is fed a `TwinVisualState` derived either from live telemetry or from the Scenario Lab cursor (no action / AquaTwin branch). The 3D canvas is owned by a single `TwinHost` for the whole session; pages register a viewport *slot*, and the canvas is positioned over the slot each frame, so navigating never recreates the WebGL context.

## 4. 3D digital twin

- **Renderer: three.js r186, WebGL2.** Physically based materials, procedural studio environment (PMREM), key/fill/rim lights with 4096² PCF soft shadows, MSAA 4× half-float HDR target, GTAO ambient occlusion, very subtle bloom (only emissive indicators), ACES tone mapping and a grade pass (near-imperceptible vignette, dither). Depth of field is used only during the intro.
- **Procedural plant** (no downloaded models): intake, two pretreatment tanks, three HP pump skids with rotors, three RO racks of instanced pressure vessels, energy-recovery skids, product tank, post-treatment, brine outfall, buildings. Static meshes are merged by material (≈ 520 draw calls, 340 k triangles).
- **Flow**: acrylic pipe shells with animated water cores and GPU particles that follow the pipe paths (paths stored in data textures, evaluated in the vertex shader); density, speed and colour follow the simulated flows and the scenario state.
- **Water**: sea surface with planar reflection (oblique clipping), ripples and brine plume; tank levels animated from storage and flows.
- **Scenario visual states**: salinity (brine plume, pump load), fouling (amber train, restricted flow), algal bloom (turbid intake, suspended particles), pump degradation (rotor slows), energy cap (reduced power), demand surge (product tank drains).
- **Intro** (first visit per session only; skippable; reduced-motion → short fade; never blocks the app — a watchdog reveals the interface if WebGL is slow or fails): dark dry plant → water poured from above (instanced droplets, shader streaks, mist) → impact ripple and wet-surface mask → sequential activation intake → pretreatment → HP pumps → RO → product, brine last → staggered interface reveal → LIVE.

### 4.1 WebGL2 rather than WebGPU — decision record

The brief asked for WebGPU *if it materially improves the effect*, without sacrificing stability. We stayed on WebGL2:

1. **No material visual gain for this scene.** Measured on the target class of hardware (RTX 5080 Laptop GPU, Chrome, production build, 1920×1080, headless without vsync): Overview ≈ 235 fps, Digital Twin ≈ 238 fps, Scenario Lab during playback ≈ 132 fps with the full effect stack (`scripts/qa/perf.py`, 30 September 2026). The frame budget at 60 fps is not the constraint, so WebGPU's lower driver overhead and compute shaders would not change what judges see.
2. **Stability.** The post-processing we rely on (GTAO, bloom, bokeh) is mature on WebGL2; its WebGPU/TSL equivalents in three.js are newer. On Windows laptops with hybrid graphics, WebGPU adapter selection and driver maturity vary more than WebGL2/ANGLE.
3. **Reach.** Judges may open the prototype on integrated graphics. WebGL2 plus an adaptive quality governor (below) keeps it usable there.

The hidden performance panel (Ctrl+Shift+P) reports whether a WebGPU adapter is available, so the migration can be revisited.

### 4.2 Adaptive quality

`TwinEngine.governQuality`: after the intro, if the smoothed frame time stays above 22 ms (< 45 fps) for 2.5 s, the renderer steps down one tier (never up automatically): **high** (default) → **medium** (no GTAO, 2048² shadows, reflection ⅓ resolution, pixel ratio ≤ 1.5) → **low** (no bloom, 1024² shadows, reflection ¼, pixel ratio 0.85). `?quality=high|medium|low` pins a tier for demos and QA. On the integrated GPU of the development laptop (Intel Graphics, 1920×1080) the current build holds the high tier: Overview ≈ 55 fps, Digital Twin ≈ 59 fps, Scenario Lab ≈ 79 fps. An earlier build measured 30–41 fps at the high tier on this GPU, and the governor stepped it down to reach 42–62 fps. The RTX GPU never leaves the high tier. Phones (coarse pointer, narrow screen) start at the medium tier.

### 4.3 Developer performance panel

Ctrl+Shift+P toggles a small panel (not part of the judge-facing interface): FPS, CPU frame time, GPU time (timer query, where available), draw calls, triangles, points, textures, geometries, shader programs, JS heap, particle count, backend, WebGPU availability, canvas size and pixel ratio, quality tier.

## 5. Path to a real plant

AquaTwin's inputs are the signals every SWRO plant already records (feed pressure and flow, permeate flow and conductivity, vessel ΔP, pump power, feed salinity/conductivity and temperature, turbidity). A deployment would replace `live.worker`'s reference plant with a historian or OPC UA/SCADA adapter and keep everything else:

1. **Read-only connection** to the historian (e.g. OPC UA or the historian's REST API) through the plant's DMZ; no write path.
2. **Shadow mode** (as in the prototype): recommendations are advisory, AquaGuard limits are set from the plant's own operating envelope, and every recommendation and outcome is logged for review.
3. **Re-training** of the residual on historian data with the same pipeline (`scripts/generate-dataset.ts` is replaced by a data extractor; `ml/train.py` is unchanged), re-validated on held-out months before any operator use.
4. **Only after sustained shadow-mode evidence** could selected recommendations be offered as operator-confirmed setpoint changes.
