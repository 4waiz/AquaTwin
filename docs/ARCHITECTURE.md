# AquaTwin: architecture

## 1. System overview

```
┌──────────────────────────── Browser (single-page app, no backend) ─────────────────────────────┐
│                                                                                                  │
│  Next.js 16 App Router (React 19, Tailwind 4) · 11 statically prerendered pages                  │
│   ├─ AppShell: sidebar, top bar, TwinHost (one persistent WebGL canvas), intro overlay            │
│   ├─ zustand stores: live · scenario · runs · ui          (src/state)                            │
│   └─ twinClient (typed message protocol)                  (src/runtime/client.ts, protocol.ts)   │
│             │                                   │                                                 │
│             ▼                                   ▼                                                 │
│  ┌─ live.worker ───────────────────┐   ┌─ compute.worker ─────────────────────────────┐         │
│  │ TwinRuntime (1 Hz tick)         │   │ ComputeRuntime                                 │         │
│  │  reference plant (hidden truth) │   │  Scenario Lab: twin forward, no action vs      │         │
│  │  → noisy telemetry              │   │   AquaTwin (24 h, hourly decisions + re-plans) │         │
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
  sim/                  simulation core (see docs/MODEL.md)
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

- **Renderer: three.js r186, WebGL2.** Physically based materials, MSAA 4× half-float HDR target, GTAO ambient occlusion, subtle bloom (emissive indicators and sun glints), AgX tone mapping and a grade pass (vignette, dither, light scrims along the top and bottom edges so page controls stay legible over the scene). Depth of field is used only during the intro.
- **Environment, all procedural** (no downloaded models, textures or HDRIs): a Preetham analytic sky with procedural clouds, rendered once into an HDR cube map (background, and the sea's reflection when planar reflections are off); image-based lighting from a PMREM of that sky over a sunlit-sand ground hemisphere; one low late-afternoon sun (warm, 23° elevation) with a 4096² PCF shadow map fitted tightly around the site; aerial-perspective fog whose colour is read back from the sky's horizon and warms toward the sun (a three.js shader-chunk override, so every material fades into the sky behind it).
- **Site** (`scene/site.ts`, derived from `layout.ts`, is the single source for coastline, terrain and seabed heights, roads, fence, rock armour and offshore pipelines, so shoreline, foam line and rocks always agree): a warped-grid terrain from the plant to the horizon (≈ 0.8 m spacing at the site) with dunes, gravel hardstanding and wet sand at the waterline; a quay wall with a tidal band; instanced rock-armour revetments; roads with markings, car park, perimeter fence, street lights, outbuildings, substation and date palms; offshore, the subsea intake and brine outfall pipelines, the multiport diffuser, the intake head and marker buoys that ride the waves.
- **Sea**: Gerstner swell in the vertex shader (damped in shallow water); a dispersive sum of short waves in the fragment shader, filtered by the pixel footprint (the filtered part becomes roughness, so distant water turns into a soft sheen instead of aliasing); Fresnel reflection of the scene (planar reflection with oblique clipping) or of the sky cube; GGX sun glitter; foam where the water column is thin (beach, rocks, quay wall). The water body is the seabed seen through the surface: the terrain shader attenuates light along the light and view paths (Beer–Lambert, per colour channel), adds the water's in-scattered colour and animated caustics in the shallows, so the sea shades from turquoise shallows to deep blue. The same optics are applied to everything below the waterline (pipelines, rocks, quay wall).
- **Procedural plant**: intake pump house with screened bays in the quay wall, hoist beam and handrails; two clarifiers with rotating bridges; three HP pump skids with spinning couplings behind yellow guards; three RO racks of instanced FRP pressure vessels on blue steel frames; energy-recovery skids; product tank with handrail and caged ladder; post-treatment; outfall chamber; control building with a PV array; electrical building. Materials carry composable shader patches (selection rim and state tint, the intro's wet deck, procedural weathering, tidal band) whose program-cache keys compose, so different patches never share a compiled program. Static meshes are merged by material; repeated parts are instanced.
- **Flow**: acrylic pipe shells with animated water cores and GPU particles that follow the pipe paths (paths stored in data textures, evaluated in the vertex shader); density, speed and colour follow the simulated flows and the scenario state. Tank levels are animated from storage and flows.
- **Scenario visual states**: salinity (brine plume and surface boils over the diffuser, pump load), fouling (amber train, restricted flow), algal bloom (patchy olive-green sea, turbid water hides the seabed, amber intake), pump degradation (coupling slows), energy cap (reduced power), demand surge (product tank drains), and the red "constraint violated" tint on the RO trains in the Scenario Lab.
- **Intro** (first visit per session only; skippable; reduced motion gives a short fade; never blocks the app, because a watchdog reveals the interface if WebGL is slow or fails): dusk-dark, calm, dry plant → water poured from above (instanced droplets, shader streaks, mist) → impact ripple across the deck and the sea → sequential activation intake → pretreatment → HP pumps → RO → product, brine last, while the sun, sky light and sea state ramp up to the late-afternoon look → staggered interface reveal → LIVE.

### 4.1 WebGL2 rather than WebGPU: decision record

The brief asked for WebGPU *if it materially improves the effect*, without sacrificing stability. We stayed on WebGL2:

1. **No material visual gain for this scene.** Measured on the target class of hardware (RTX 5080 Laptop GPU, Chrome, production build, 1920×1080, headless without vsync), with the coastal environment and the full effect stack: Overview ≈ 186 fps, Digital Twin ≈ 194 fps, Scenario Lab during playback ≈ 114 fps; GPU time ≈ 5 ms per frame; ≈ 780 draw calls and 1.44 M triangles per frame across the main, shadow, ambient-occlusion and reflection passes (`scripts/qa/perf.py`, 9 October 2026). The frame budget at 60 fps is not the constraint, so WebGPU's lower driver overhead and compute shaders would not change what judges see.
2. **Stability.** The post-processing we rely on (GTAO, bloom, bokeh) is mature on WebGL2; its WebGPU/TSL equivalents in three.js are newer. On Windows laptops with hybrid graphics, WebGPU adapter selection and driver maturity vary more than WebGL2/ANGLE.
3. **Reach.** Judges may open the prototype on integrated graphics. WebGL2 plus an adaptive quality governor (below) keeps it usable there.

The hidden performance panel (Ctrl+Shift+P) reports whether a WebGPU adapter is available, so the migration can be revisited.

### 4.2 Adaptive quality

`TwinEngine.governQuality`: after the intro, if the smoothed frame time stays above 22 ms (< 45 fps) for 2.5 s, the renderer steps down one tier (never up automatically): **high** (default: GTAO, planar sea reflection at ½ resolution, 14 fragment waves, 4096² shadows, pixel ratio ≤ 2) → **medium** (no GTAO, the sea reflects the sky cube instead of a planar reflection, 9 waves, 2048² shadows, pixel ratio ≤ 1.5) → **low** (also no bloom, 5 waves, no caustics or sand ripples, no fence mesh, 1024² shadows, pixel ratio 0.85). `?quality=high|medium|low` pins a tier for demos and QA. With the coastal environment, the integrated GPU of the development laptop (Intel Graphics, 1920×1080) is stepped down to the medium tier by the governor and then holds Overview ≈ 61 fps, Digital Twin ≈ 64 fps and Scenario Lab ≈ 79 fps (≈ 290 draw calls, 0.58 M triangles per frame). The RTX GPU stays at the high tier (≈ 226 to 239 fps if pinned to medium). Phones (coarse pointer, narrow screen) start at the medium tier.

### 4.3 Developer performance panel

Ctrl+Shift+P toggles a small panel (not part of the judge-facing interface): FPS, CPU frame time, GPU time (timer query, where available), draw calls, triangles, points, textures, geometries, shader programs, JS heap, particle count, backend, WebGPU availability, canvas size and pixel ratio, quality tier.

### Deployment

`npm run build` produces a static export (`out/`). Cloudflare Workers static assets serve it at aquatwin.kanbanstudios.ae (`wrangler.jsonc`). Only `/media/*` is routed through a Worker (`worker/index.ts`, `assets.run_worker_first`), which answers HTTP byte-range requests so the film plays in Safari on iOS; every other request is a plain static-asset response.

## 5. Path to a real plant

AquaTwin's inputs are the signals every SWRO plant already records (feed pressure and flow, permeate flow and conductivity, vessel ΔP, pump power, feed salinity/conductivity and temperature, turbidity). A deployment would replace `live.worker`'s reference plant with a historian or OPC UA/SCADA adapter and keep everything else:

1. **Read-only connection** to the historian (e.g. OPC UA or the historian's REST API) through the plant's DMZ; no write path.
2. **Shadow mode** (as in the prototype): recommendations are advisory, AquaGuard limits are set from the plant's own operating envelope, and every recommendation and outcome is logged for review.
3. **Re-training** of the residual on historian data with the same pipeline (`scripts/generate-dataset.ts` is replaced by a data extractor; `ml/train.py` is unchanged), re-validated on held-out months before any operator use.
4. **Only after sustained shadow-mode evidence** could selected recommendations be offered as operator-confirmed setpoint changes.
