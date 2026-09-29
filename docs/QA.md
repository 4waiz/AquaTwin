# Quality assurance

Status of the checks run on the release build (30 September 2026). Scripts are in `scripts/qa/` and `tests/`; their raw output goes to `qa-output/` (not committed).

| Area | Check | Result |
|---|---|---|
| Static checks | `npm run typecheck` (TypeScript, strict) | 0 errors |
| | `npm run lint` (ESLint, Next.js rules) | 0 errors, 0 warnings |
| Unit tests | `npm test` (vitest) | 29 / 29 pass |
| ML runtime | Browser tree runtime vs scikit-learn (`npm run ml:parity`, `tests/ml.test.ts`) | equal within 1·10⁻⁹ on 500 samples per model |
| Reproducibility | Closed-loop experiments rerun on the committed code | identical to the previous run apart from provenance fields (creation time, commit, duration) |
| Desktop browser | 11 pages at 1920×1080 and 1440×900, Chrome, production build | 0 console errors, 0 page errors, no `NaN` / `undefined` / `Infinity` rendered |
| Phone and tablet | 11 pages on an emulated touch phone (390×844, 3×) and tablet (820×1180, 2×) | no horizontal overflow, 0 console errors |
| Rendering | Frame rate, production build, 1920×1080 (below) | RTX 5080 Laptop ≈ 235 fps; Intel integrated graphics 55–80 fps |
| Deployment | Live site over HTTPS (below) | all routes 200, valid TLS, 0 console errors |

## 1. Unit tests

`tests/physics.test.ts`, `tests/safety.test.ts` and `tests/ml.test.ts` cover:

- seawater properties: densities, and the osmotic pressure of standard seawater (35 g/kg, 25 °C) ≈ 25.9 bar, which matches TEOS-10 to within ±0.4 % (not the ≈ 28 bar of a NaCl solution); temperature correction;
- reference plant: water balance, salt balance within 0.5 % (on the membrane feed after pressure-exchanger mixing), operation inside the design envelope, and the expected response to fouling and higher feed salinity;
- self-calibration round trip: the 0D model recovers its own parameters from noise-free outputs;
- AquaGuard: approves the design point; rejects a feed-pressure or power-cap breach and says why; withholds at low confidence; checks limits at the edge of the prediction interval;
- forecasting: linear trend recovery, threshold-crossing time, stable-signal behaviour;
- cleaning criteria (FilmTec manual): healthy, flow −10 %, pressure drop +15 % alone, approaching;
- feed look-ahead: needs four samples, ignores a steady feed, projects a ramp over the decision interval, clamps implausible extrapolations;
- ML runtime: parity with scikit-learn on 500 samples per model (both models, all four targets), and the out-of-distribution rule flags a compound extreme but not the centre of the training envelope.

## 2. Browser QA

`scripts/qa/capture.py` loads every page in Chrome with GPU acceleration, waits for the twin and data to settle, saves a screenshot and records console errors, failed requests and forbidden strings.

- **Console:** no errors on any page. One warning is logged by the Direct3D shader compiler under ANGLE (`X4122`, a floating-point precision note inside a three.js shader); it has no visible effect.
- **Failed requests:** the only entries are `HEAD` requests to each route that Next.js's prefetch cache sends and then cancels itself (`net::ERR_ABORTED`). The server answers each of them with 200.
- **Mobile** (`scripts/qa/mobile.py`): checks that no element extends past the viewport outside intentionally scrollable containers (wide tables, the process schematic), on every page and on both devices. Touch devices get a bottom navigation bar, a scrolling status strip and single-column layouts. The 3D viewport ignores touch until the user taps "Explore 3D", so the page can still be scrolled with a finger.

## 3. Rendering performance

`scripts/qa/perf.py`: production build, 1920×1080, Chrome headless (no vsync, so the numbers show rendering headroom and are not capped at a display refresh rate), measured over a fixed window after 8 s of settling.

| Page | RTX 5080 Laptop GPU | Intel integrated graphics |
|---|---|---|
| Overview | 235 fps (p95 4.3 ms) | 55 fps (p95 21 ms) |
| Digital Twin | 238 fps (p95 4.3 ms) | 59 fps (p95 21 ms) |
| Scenario Lab, playback | 132 fps (p95 12 ms) | 79 fps (p95 17 ms) |

Both GPUs stayed at the high quality tier. If frame time stays above 22 ms for 2.5 s, the adaptive governor steps down one tier: *medium* turns ambient occlusion off and reduces shadow-map size, reflection resolution and pixel ratio; *low* also turns bloom off. On phones the renderer starts at the medium tier. The hidden developer panel (Ctrl+Shift+P) shows these readings live.

## 4. Scientific quality control

- **Provenance.** `public/data/validation/results.json` records the commit of the code that produced it and whether that code had uncommitted changes (`codeDirty: false` for the published results). The model bundle records its seed, library versions and hyperparameters.
- **Determinism.** Fixed seeds throughout and no early stopping. Rerunning the experiments reproduced every number.
- **Claims audit.** Every number quoted in `README.md`, `report/AquaTwin-Report.md` and `docs/MODEL.md` was checked against `results.json` and `ml-metrics.json` after the final run. `docs/VALIDATION.md` is generated from those files and not edited by hand.
- **Fair comparison.** All three model variants use the same optimiser, AquaGuard and data; only the prediction model differs. Lead times count only warnings related to the event they precede. False warnings in normal operation are counted (none for any method).
- **Negative results are reported.** Examples: the hybrid's in-loop production error is not the lowest in the demand surge; every method fails in the compound extreme; conventional alarms are only minutes behind for fast quality events.
- **Development disclosure.** The start-time sweep revealed short hybrid violations when a salinity shock began at night. The optimiser's feed look-ahead was added in response, so that sweep is not an independent test of the look-ahead (stated in the report and in `docs/VALIDATION.md` §3.8).
- **Labelling.** Every number in the interface carries a provenance tag: *simulated*, *modeled*, *estimated*, *assumed* or *external reference*. No organisation is presented as endorsing the prototype.

## 5. Deployment

The static export (`out/`) is served by Cloudflare Workers static assets (`wrangler.jsonc`) at https://aquatwin.kanbanstudios.ae. After each deployment:

- every route and data file returns 200 over HTTPS with a valid certificate;
- `/_next/static/*` is served with an immutable cache policy and `/data/*` with a one-hour cache (`public/_headers`);
- `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` headers are set;
- the live pages load with 0 console errors.

## 6. Not covered

- Browsers other than Chrome/Chromium (Safari, Firefox) and physical phones and tablets. Mobile layouts were checked with Chrome's device emulation.
- Screen-reader accessibility beyond semantic HTML, labelled controls and keyboard focus styles.
- Long sessions (hours to days) were not tested systematically.
