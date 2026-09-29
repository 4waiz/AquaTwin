<!--
  AquaTwin final report — editable source.
  Build the HTML and PDF with:  python scripts/report/build.py
  Figures are generated from the experiment files by scripts/report/figures.py;
  screenshots come from scripts/qa/screenshots.py (the running application).
-->

<section class="cover">
<div class="cover-top">Khalifa University–UNESCO Global Water Hackathon 2026 · Theme 3: Smart, Digital, and AI-Enabled Water Systems</div>
<h1>AquaTwin</h1>
<p class="cover-sub">A physics-informed, self-calibrating digital twin for resilient and safe seawater desalination</p>
<img class="cover-img" src="../docs/screenshots/01-overview.png" alt="AquaTwin overview page with the 3D plant twin">
<div class="glance">
<div><b>4.9 m³/h</b><span>permeate-flow prediction error per train (physics 48.0, ML only 9.7)</span></div>
<div><b>21.3 h → 0 h</b><span>constraint violations under a +15 % salinity shock (fixed operation → AquaTwin)</span></div>
<div><b>12.5 h</b><span>warning before a train reaches the flow cleaning criterion; conventional alarms: none</span></div>
<div><b>77 %</b><span>of out-of-envelope conditions detected; recommendation withheld</span></div>
</div>
<p class="glance-note">Simulated results on the reference plant (5 seeds), see Section 8.</p>
<div class="cover-meta">
<p><strong>Final report</strong> · {{DATE}}</p>
<p>Team: <a href="https://kanbanstudios.ae/team-kanban">Team Kanban</a></p>
<p class="cover-note">Research prototype evaluated on a simulated seawater reverse-osmosis plant. All performance figures are simulation results or model estimates and are labelled as such. No organisation named in this report has reviewed or endorsed AquaTwin.</p>
</div>
</section>

## Executive summary

Seawater reverse osmosis (SWRO) supplies a large and growing share of drinking water in the UAE and the wider Gulf, where seawater is saltier, warmer and more variable than in most of the world. Plants are operated largely on fixed setpoints and fixed alarm thresholds: operators learn that permeate quality is drifting, that a membrane train needs cleaning or that storage is running low when a threshold is crossed. Machine learning could anticipate these events, but black-box models extrapolate silently when conditions leave what they were trained on — exactly when a plant is under stress.

**AquaTwin** is a digital twin designed around that tension. It keeps a reduced-order physical model of each RO train calibrated to noisy plant telemetry in real time, corrects the model's systematic errors with a machine-learning residual (*physics prediction + ML residual = AquaTwin prediction*), attaches calibrated uncertainty to every prediction, forecasts membrane fouling, and simulates disturbances 24 hours ahead. An optimiser proposes operating strategies, and a deterministic safety layer, **AquaGuard**, approves only those that satisfy every hard limit at the edge of the model's uncertainty. When the plant leaves the conditions the model has seen, AquaTwin reports low confidence and **withholds** its recommendation instead of guessing.

We built a complete working prototype — an 11-page web application with a live 3D twin of a three-train SWRO plant, a Scenario Lab, strategy optimisation, membrane-health analytics, a model-intelligence view and reproducible validation experiments — and evaluated it against a hidden, higher-fidelity plant simulator whose true state is known. Key results (all simulated):

- **Prediction:** permeate-flow error of 4.9 m³/h per train (mean absolute error) inside the training envelope, against 48.0 for the self-calibrated physics model and 9.7 for a pure ML model with the same data; outside the envelope 12.1 against 35.1 for ML alone.
- **Knowing its limits:** the withhold rule flags 77 % of out-of-envelope conditions and 0.01 % of in-envelope ones.
- **Closed loop:** under a +15 % salinity shock, fixed operation violates the permeate-quality or storage limits for 21.3 of 24 hours; AquaTwin keeps every constraint. Under a grid power cap and a +20 % demand surge, violations fall from 6.0 h and 15.3 h to zero. The hybrid is the only model variant with no violation in all three, and it stays at zero when the same disturbances start at six different times of day. The energy cost ranges from 0 to +2.9 % in specific energy — lower energy is not claimed.
- **Early warning:** a membrane train reaching the flow cleaning criterion is flagged about 12.5 hours ahead, where conventional fixed-threshold alarms give no warning; storage depletion 6.8 h ahead versus 1.3 h.
- **Honest failure:** in a compound extreme outside the model's envelope every method fails; AquaTwin withholds 19 of 24 recommendations, as designed.

The prototype runs entirely in the browser, is fully reproducible from fixed seeds, and is designed to be connected read-only to a plant historian and run in shadow mode — the next step toward industrial validation.

## 1. The problem

### 1.1 Desalination is critical infrastructure in the Gulf

Desalination is a key source of water in the UAE, particularly for drinking and domestic use; the country's installed desalination capacity was about 7.8 million m³ per day in 2023 [1]. New capacity is predominantly SWRO: the Taweelah plant in Abu Dhabi alone is rated at about 909,000 m³/day [2]. The UAE Water Security Strategy 2036 targets lower demand, higher water productivity and up to two days of national storage capacity [3]. Every hour a large SWRO plant runs off-specification, below demand or towards an unplanned cleaning is a real cost to supply security.

### 1.2 Gulf seawater makes operation hard

Gulf seawater typically exceeds 39 g/kg salinity [4] and ranges from about 14 °C to above 36 °C at the coast [4, 5]. Higher salinity raises osmotic pressure and energy use; higher temperature raises water flux but also salt passage. SWRO needs about 3.5–4.5 kWh/m³, and about 4 kWh/m³ in the Arabian Gulf including pre- and post-treatment [6, 7]. Disturbances are frequent: brine recirculation, heat events, and harmful algal blooms. During the 2008–2009 bloom in the Gulf of Oman, clogging of granular media filters was identified as a cause of SWRO plant shutdown, and one SWRO plant in the UAE was shut down for more than a week [8].

### 1.3 Operations run on thresholds

Plants monitor normalised membrane performance [9, 10] and act when fixed thresholds are crossed: a membrane manufacturer recommends cleaning when normalised permeate flow drops 10 %, salt passage rises 5–10 % or pressure drop rises 10–15 % [10]; a high-conductivity alarm triggers intervention. Thresholds are reactive by construction. Physical models of RO are well established [11] but drift from the real plant as membranes age and foul; purely data-driven models capture plant-specific behaviour but are unreliable outside their training data and give no signal when they are wrong.

### 1.4 The gap AquaTwin addresses

Operators need a model that (i) stays true to the specific plant, (ii) sees problems coming, (iii) evaluates responses before they are applied, and (iv) is trustworthy — it must respect hard limits and say when it does not know. AquaTwin is built around these four requirements.

## 2. Solution overview

AquaTwin is a decision-support digital twin for SWRO operators. It uses only signals SWRO plants already record — feed pressure and flow, permeate flow and conductivity, pressure drop across the vessels, pump power, seawater salinity, temperature and turbidity — and turns them into five capabilities:

| Capability | What the operator sees |
|---|---|
| **Living twin** | The plant in 3D and as a process flow; for every train: inputs, physics estimate, measured value, ML residual and final estimate, with a 90 % prediction interval. |
| **Membrane health** | Normalised permeate flow, salt passage and pressure drop per train; *why* a train is flagged (observed vs clean expectation vs unexplained loss); time to the cleaning threshold with a confidence band. |
| **Scenario Lab** | "Stress-test the plant before the plant is stressed": six disturbances simulated 24 h ahead from the live state — *no action* vs *AquaTwin response*, hour by hour. |
| **Optimisation** | 676 candidate operating strategies scored on energy, quality, production, membrane stress and fouling, each screened by AquaGuard; the recommended strategy against the current one. |
| **AquaGuard** | Every recommendation is APPROVED, REJECTED (with the violated limits) or WITHHELD (low model confidence, operator review required). |

<figure class="wide"><img src="../docs/screenshots/03a-scenario-lab-no-action.png" alt="Scenario Lab, salinity shock, no-action branch at +6 h"><figcaption>Figure 1. Scenario Lab, salinity shock at +6 h on the <em>no action</em> branch: permeate quality violates the 400 mg/L specification (red trains); AquaTwin's response (right table) holds every constraint. Simulated forecast.</figcaption></figure>

## 3. System architecture

<div class="arch">
<div class="arch-row"><div class="arch-box src"><b>01 Sensor data</b><span>telemetry (simulated plant)</span></div><div class="arch-arrow">→</div><div class="arch-box"><b>02 Physics</b><span>0D solution–diffusion, self-calibrated θ̂</span></div><div class="arch-arrow">→</div><div class="arch-box"><b>03 Residual ML</b><span>gradient-boosted trees + conformal intervals + OOD</span></div><div class="arch-arrow">→</div><div class="arch-box"><b>04 Degradation</b><span>normalised health, fitted fouling model</span></div></div>
<div class="arch-row"><div class="arch-box"><b>05 Forecasting</b><span>threshold forecasts, 24-h scenarios</span></div><div class="arch-arrow">→</div><div class="arch-box"><b>06 Optimiser</b><span>676 candidates, weighted objectives</span></div><div class="arch-arrow">→</div><div class="arch-box guard"><b>07 AquaGuard</b><span>hard limits at the interval edge; approve / reject / withhold</span></div><div class="arch-arrow">→</div><div class="arch-box op"><b>08 Operator</b><span>advisory, shadow mode</span></div></div>
</div>

The application is a single-page web app (Next.js, React, TypeScript) with no server-side computation. Two Web Workers run the models: one advances the live plant and the twin once per second, the other computes scenario forecasts, optimisations and diagnostics on demand. The 3D twin is rendered with three.js (WebGL2). The machine-learning models are trained offline in Python (scikit-learn), exported as JSON and evaluated in the browser by a small TypeScript runtime whose predictions match scikit-learn's to within 10⁻⁹. One simulation core is shared by the application, the experiments, the unit tests and the dataset generator, so the numbers on screen, in the experiments and in this report come from the same code.

## 4. Methodology

### 4.1 Evaluation principle: a hidden plant

A digital twin cannot be validated against itself. We therefore built two models of different fidelity:

- a **reference plant** that stands in for the real facility — element-by-element solution–diffusion transport with film-theory concentration polarisation, the non-ideal seawater osmotic pressure of Sharqawy et al. as implemented in WaterTAP [11, 12], pump curves, pressure-exchanger mixing and leakage [13], membrane compaction, and a hidden, element-level fouling state that evolves with flux and feed conditions;
- **AquaTwin's own model**, which sees only noisy telemetry of that plant.

The two differ deliberately in structure (lumped vs element-level, linear vs non-linear osmotic pressure, salt-transport temperature dependence, energy recovery). That model-form gap is realistic — every engineering model of a real plant has one — and it is what the ML residual must learn. Because the reference plant's true state is known, every claim can be tested exactly.

### 4.2 Physics layer and self-calibration

Each RO train is described by a reduced-order (0D) solution–diffusion model: water flux J = A·TCF(T)·(P − ΔP/2 − P_p − Δπ), log-mean bulk concentration with a constant polarisation factor, salt flux from B, a pressure-drop law and a lumped energy balance with energy recovery. Temperature correction follows the membrane manufacturer [10]. At every sample the model is inverted on the measurements to identify the lumped parameters — water permeability A, salt permeability B, the pressure-drop coefficient and pump efficiency — and these are smoothed with an exponential filter. This mirrors the normalisation practice of ASTM D4516 [9], with the calibrated model replacing empirical correction factors.

### 4.3 Machine-learning residual

A gradient-boosted tree ensemble (scikit-learn HistGradientBoosting, fixed seed, no early stopping) learns the residual between the calibrated physics prediction and the plant for four targets: permeate flow, permeate TDS, vessel pressure drop and RO power. Inputs are the what-if operating point, the calibration point and seawater conditions, the calibrated parameters and the physics outputs. The training data reproduce the operational task: calibrate on six noisy samples at one operating point, predict the plant at another (what-if, normalisation or changed seawater); labels are single noisy measurements. The dataset has 40,000 training, 8,000 calibration and 8,000 test samples inside the envelope (36–48 g/L, 18–36 °C, fouling up to 30 %) and 6,000 test samples outside it. An ML-only model with the same learner, data and budget is the comparison baseline.

### 4.4 Uncertainty and knowing when not to answer

Every prediction carries a 90 % interval from split conformal prediction [14], computed separately for near and far what-if extrapolations (Mondrian conformal). The Mahalanobis distance of the current inputs from the training data [15], relative to its 99th percentile, gives a confidence score; if any input leaves its training range, confidence is capped. Below 50 % confidence AquaGuard withholds every recommendation.

### 4.5 Health, degradation and forecasting

Normalised permeate flow, salt passage and pressure drop are computed by querying the calibrated hybrid model at fixed standard conditions and dividing by the post-clean baseline. A lumped fouling model, dφ/dt = κ̂·F·(J/J_ref)²·(1 − φ/φ_max), is fitted on synthetic operating history and used to forecast beyond the data. All three manufacturer cleaning criteria (flow −10 %, salt passage +5–10 %, pressure drop +10–15 % [10]) are checked continuously; the time to the flow criterion is forecast from the recent trend with a 90 % band and a probability of crossing within a horizon. In lead-end biofouling the pressure-drop criterion is typically met first, and AquaTwin reports it as soon as it is.

### 4.6 Decisions: planning, optimisation, AquaGuard

A production planner converts demand, storage level and any announced power cap into minimum, maximum and target production. The optimiser enumerates 676 strategies (common feed pressure × feed flow per vessel × allocation of the weakest train) and ranks admissible ones by a weighted sum of specific energy, permeate quality, production tracking, membrane stress and fouling rate; weights are editable, but constraints are never traded off. AquaGuard checks 12 hard limits — feed pressure, permeate TDS, recovery, flux, concentrate and feed flow per vessel, vessel pressure drop, motor rating, minimum production, power cap, setpoint ramp and model confidence — at the conservative edge of each prediction interval. Its rules are plain comparisons; nothing in it is learned.

Because a decision is held for an hour, the optimiser also looks ahead: the feed salinity and temperature trend of the last hour is extrapolated over the decision interval (with bounded steps), and the best-scoring admissible strategy that still satisfies the limits under that extrapolated feed is recommended. If none does, the best-scoring strategy is still proposed, with a note that the operator's attention is needed. The same extrapolation drives a two-hour permeate-quality outlook.

## 5. Implementation

| Component | Implementation |
|---|---|
| Application | Next.js 16, React 19, TypeScript, Tailwind CSS 4; 11 statically prerendered pages; responsive from phone to desktop; runs in the browser with no server-side computation |
| Modelling core | Framework-free TypeScript (`src/sim`), shared by app, experiments, tests and data generation |
| Concurrency | Two Web Workers (live plant at 1 Hz; on-demand compute) with a typed message protocol |
| Machine learning | Python 3.12, scikit-learn 1.9; JSON export; browser runtime verified to 10⁻⁹ |
| 3D twin | three.js r186, WebGL2; procedural plant; GPU flow particles; planar water reflections; ambient occlusion; cinematic first-visit intro; adaptive quality tiers |
| Reproducibility | Fixed seeds throughout; one command regenerates the dataset, models, parity check and all experiments (≈ 10 minutes); rerunning reproduced every artefact bit-for-bit apart from timestamps |
| Quality assurance | 29 unit tests (physics balances, seawater properties, calibration round trip, AquaGuard verdicts, cleaning criteria, forecasting, feed look-ahead, ML parity), type checking, lint, automated browser QA of all pages at 1920×1080 and 1440×900 and on emulated phone (390×844) and tablet (820×1180) screens |

On the target hardware class (RTX 5080 Laptop GPU, Chrome, 1920×1080) the 3D pages render at about 235 frames per second (measured without vsync; about 130 fps on the Scenario Lab during playback) with the full effect stack. On the same laptop's integrated graphics they hold 55–80 fps at full quality, and an adaptive governor steps down ambient occlusion, shadow resolution and pixel ratio if frames become slow. We evaluated WebGPU and kept WebGL2: at this frame budget WebGPU would not materially change what users see, and WebGL2 is more stable across laptop graphics drivers.

## 6. Innovation

1. **Self-calibrating physics with a learned residual, in the loop.** The physics model is re-identified from telemetry every sample, and the ML model corrects only what the physics cannot represent. This keeps extrapolation physically sensible — the hybrid's error grows 2.5× outside the envelope, the pure ML model's 3.6× — while matching the plant closely inside it.
2. **Uncertainty-aware safety that can abstain.** Constraints are checked at the edge of calibrated prediction intervals, and recommendations are withheld when inputs leave the training distribution. The prototype demonstrates the full chain: a compound extreme is detected, confidence drops to 35 %, and AquaGuard withholds with a stated reason.
3. **Model-based normalisation.** Normalised membrane performance, usually computed with empirical correction factors, is computed with the calibrated hybrid model at standard conditions — giving a direct "observed vs clean expectation vs unexplained loss" explanation of why a train is flagged.
4. **"No action vs AquaTwin" for every disturbance.** The Scenario Lab turns the twin into a rehearsal tool: operators see, hour by hour, what happens if they do nothing and what the twin would do instead, with every decision's AquaGuard verdict.
5. **A validation harness with hidden truth.** A higher-fidelity reference plant with hidden state lets us measure prediction accuracy, closed-loop constraint violations, energy and warning lead time against ground truth, reproducibly. Results the method does not win are reported alongside those it does.

## 7. Validation design

We asked four questions: (1) does the hybrid predict better than physics or ML alone, inside and outside its training envelope; (2) are its uncertainty estimates honest and does it recognise out-of-envelope conditions; (3) in closed loop, does better prediction reduce constraint violations and at what energy cost; (4) does model-based monitoring warn earlier than conventional alarms?

For (1)–(2) we use the held-out test sets. For (3)–(4) we run 24-hour closed-loop simulations on the reference plant for ten scenarios — normal operation, salinity shock, temperature shock, membrane fouling, pump degradation, sensor degradation, algal bloom, energy constraint, demand surge and a compound extreme outside the envelope — with four methods: fixed operation (setpoints held), and AquaTwin's optimiser and AquaGuard driven by the physics-only, ML-only or hybrid model. Each combination is run with five sensor-noise seeds (200 runs). Decisions are hourly; the plant is simulated in 10-minute steps; each run starts at 14:00. Warnings are counted only if they relate to the event they precede. Because demand and seawater temperature follow a daily cycle, the salinity, power-cap and demand scenarios are also repeated at six start times across the day (00:00 to 20:00, seed 1). The complete tables are in `docs/VALIDATION.md`, generated directly from the result files.

## 8. Results

### 8.1 Prediction accuracy and uncertainty

<figure class="wide"><img src="figures/accuracy.svg" alt="Prediction accuracy"><figcaption>Figure 2. Mean absolute error against noise-free truth, per train, on 8,000 held-out samples inside and 6,000 outside the training envelope. Simulated data.</figcaption></figure>

The hybrid is the most accurate model on every target inside the envelope — for permeate flow 4.9 m³/h, close to the 3.0 m³/h noise floor of a single measurement, against 48.0 for calibrated physics and 9.7 for ML alone. Outside the envelope the ML-only model loses most of its advantage (35.1 m³/h), while the hybrid degrades less (12.1 m³/h) because its physics backbone still extrapolates in the right direction.

<div class="two" markdown="1"><figure><img src="figures/coverage.svg" alt="Interval coverage"><figcaption>Figure 3. Coverage of the 90 % prediction intervals.</figcaption></figure><div markdown="1">

Inside the envelope the intervals cover 90–98 % of outcomes, as designed. Outside it, coverage of the learned models drops sharply (hybrid permeate flow 54 %): the intervals are no longer trustworthy. This is precisely why AquaTwin does not rely on them there. The withhold rule flags 77 % of out-of-envelope samples overall — all salinity and combined excursions and 99 % of temperature excursions — against 0.01 % of in-envelope samples. Heavier-than-seen fouling alone is flagged in only 7 % of cases, because it changes the plant rather than its operating conditions; the health monitoring covers that case.

</div></div>

### 8.2 Closed-loop control

<figure class="wide"><img src="figures/violations.svg" alt="Constraint violations"><figcaption>Figure 4. Hours with any constraint violation on the true plant, mean of five seeds. Simulated.</figcaption></figure>

In six of ten scenarios no method violates a constraint — the plant is operated inside a comfortable envelope. Where the disturbance matters, the difference is large: under the salinity shock fixed operation violates the permeate-quality specification for 12.0 h and the storage minimum for 13.2 h (21.3 h in total); the physics-only closed loop still incurs 1.07 h, the ML-only and hybrid loops none. Under the power cap and the demand surge, fixed operation violates for 6.0 h and 15.3 h; the hybrid for zero hours (ML-only 1.5 h and 2.5 h, physics-only zero).

**Start time.** Across the 18 start-time runs (three scenarios × six start times), the hybrid closed loop has no violation hour in any; the physics-only loop violates in 6 (up to 8.3 h), the ML-only loop in 8 (up to 12.2 h) and fixed operation in all 18. One caveat: this sweep is not an independent test of the optimiser's look-ahead (Section 4.6). An earlier version without it showed short hybrid violations (0.2–0.5 h) when the salinity shock began at night; the look-ahead was added in response, and the sweep was then rerun.

<figure class="wide"><img src="figures/salinity.svg" alt="Salinity shock trajectories"><figcaption>Figure 5. Salinity shock, seed 1: permeate TDS and product storage for the four methods. AquaTwin raises pressure and production early, keeping quality below 400 mg/L and storage well above the 25 % reserve. Simulated.</figcaption></figure>

<figure class="wide"><img src="figures/sec.svg" alt="Specific energy"><figcaption>Figure 6. Specific energy consumption relative to fixed operation. Simulated.</figcaption></figure>

Avoiding violations is not free: the hybrid closed loop uses between 0 % and 2.9 % more energy per cubic metre than fixed operation, most in the demand surge (where it also produces 12 % more water). We do not claim energy savings. In the compound extreme outside the envelope, every method violates constraints for about 22 of 24 hours; AquaTwin withholds its recommendation at 19 of 24 decisions. Abstention limits harm — it prevents confident but wrong recommendations — but it does not solve the problem; a human decision is required.

### 8.3 Early warning

<div class="two"><figure><img src="figures/fouling.svg" alt="Fouling forecast"><figcaption>Figure 7. Train 2 biofouling event: true normalised flow, AquaTwin's estimate from noisy data, and the warning. Simulated.</figcaption></figure><figure><img src="figures/leadtime.svg" alt="Warning lead time"><figcaption>Figure 8. Warning lead time before the first critical event (no-action runs, mean of seeds). Simulated.</figcaption></figure></div>

For slow processes the gain is substantial: AquaTwin warns 12.5 h before Train 2 reaches the flow cleaning criterion (−10 %), while conventional alarms (−10 % flow at design pressure, pressure-drop limits) give no warning within the day; it forecasts storage depletion 6.8 h ahead against 1.3 h for a low-level alarm. For fast quality events the gain is minutes (50 min vs 20 min for the salinity shock; the physics-only and ML-only monitors warn at 60 min), because the disturbance ramps within two hours. No false warnings were raised in normal operation by any method. One caveat: in this experiment Train 2 starts with a normalised pressure drop about 20 % above its clean baseline, which already meets the manufacturer's pressure-drop cleaning criterion at t = 0 — AquaTwin reports that immediately, and a plant that tracks normalised pressure drop would already have scheduled cleaning. The lead time above concerns the flow criterion, which fixed alarms on absolute values miss.

### 8.4 What the results do and do not show

The results show that, on a realistic simulated plant with a deliberate model-form gap, a self-calibrating hybrid twin predicts better than either physics or ML alone, recognises most out-of-envelope conditions, prevents constraint violations under several disturbances at a modest energy cost, and gives useful warning of slow degradation. They do not show performance on a real plant: the reference plant is itself a model, the ML residual is trained on data from it, and real plants have phenomena neither model contains. Section 12 lists the limitations.

## 9. Impact

**SDG 6 — clean water and sanitation.** AquaTwin targets the reliability and quality of desalinated drinking water (target 6.1) and efficient use of water infrastructure (6.4): fewer hours off-specification or below demand, cleaning planned hours earlier instead of triggered by thresholds, and disturbances rehearsed before they happen. **SDG 7 and SDG 13.** Energy is a first-class objective, and the Energy & Carbon page makes the trade-off between resilience and energy visible; carbon is shown as an estimate from the UAE average grid intensity [16]. **SDG 9.** The approach is software-only and uses existing instrumentation, which suits retrofitting existing plants.

**UN Water pillars.** Under the theme's pillars — *Prosperity* (reliable supply for cities and economies), *Planet* (energy-aware operation, earlier and fewer chemical cleanings) and *Cooperation* (a transparent, auditable tool that operators, engineers and regulators can inspect: every number is labelled by provenance and every recommendation explains its constraints).

**UAE context.** The Water Security Strategy 2036 emphasises supply security and storage [3]. AquaTwin's planner manages product storage explicitly, pre-filling ahead of announced power-cap windows, and its scenarios cover the Gulf-specific stresses — high salinity, heat and algal blooms — that threaten continuity. Because it is advisory and conservative by design, it is compatible with how critical infrastructure is operated.

## 10. Feasibility

- **Data.** Every model input is a standard SWRO measurement already stored in plant historians; no new sensors are needed. Model training uses the same pipeline with historian data in place of synthetic data.
- **Integration.** A read-only connector to the historian or SCADA (e.g. OPC UA) replaces the simulated plant; everything else is unchanged. The compute footprint is small — the entire twin, optimiser and 24-hour scenarios run in a browser tab.
- **Safety and adoption.** Deployment starts in **shadow mode**: recommendations are logged and compared with operator decisions and outcomes, AquaGuard limits are set from the plant's own operating envelope, and nothing writes to the control system. Only after sustained evidence would recommendations be offered as operator-confirmed setpoint changes.
- **Cybersecurity.** Read-only data flow through the plant's DMZ; no cloud dependency is required.
- **Cost.** Open-source software stack; the main cost is plant-specific model commissioning and validation.

## 11. Scalability

The plant configuration (trains, vessels, elements, limits) is data, not code, so the same twin applies to other SWRO trains and plants; each plant gets its own calibrated physics and retrained residual. The architecture extends naturally to a fleet view across plants, to brackish-water RO and nanofiltration (same transport physics, different parameters), and to a central deployment on an edge server feeding many operator screens. The modelling core is framework-free TypeScript and can run on a server as easily as in a browser.

## 12. Limitations

- **Simulated plant.** All results are against a simulator. Real plants include scaling chemistry, vessel-to-vessel heterogeneity, control-loop dynamics and instrument faults that neither model contains.
- **Synthetic training data.** The residual is trained on data from the same reference plant it is evaluated on; the out-of-envelope tests and model-form differences mitigate but do not remove this optimism.
- **Steady-state models.** Minute-scale hydraulic and control transients are not modelled; decisions are hourly.
- **Water quality.** Only total dissolved solids are modelled — boron, which single-pass SWRO rejects poorly and which has a WHO guideline value [17], is not.
- **Fouling.** The degradation model is lumped and fitted to one fouling profile; scaling and chemical degradation are not modelled; heavier-than-seen fouling is poorly detected by the out-of-distribution rule.
- **Energy and carbon.** The simulated plant's specific energy (≈ 3.3 kWh/m³) is at the efficient end of published ranges because auxiliary loads are assumptions; comparisons between strategies are meaningful, absolute values are not plant-specific. Carbon uses an average grid factor.
- **Sensor faults.** Sensor drift propagates into all models; sensor validation is not part of the prototype.

## 13. Roadmap

| Phase | Scope | Evidence required to proceed |
|---|---|---|
| 0 — Prototype (done) | Hybrid twin, AquaGuard, Scenario Lab, reproducible validation on a simulator | This report |
| 1 — Historian back-test | Retrain the residual on 12+ months of historian data from a host plant; back-test predictions, health indicators and warnings against recorded events | Accuracy and coverage on held-out months; no missed cleaning events |
| 2 — Shadow mode | Live read-only connection; recommendations logged, not applied; operator feedback loop | Months of agreement analysis; AquaGuard never approving an unsafe strategy |
| 3 — Operator-confirmed advice | Selected recommendations offered for operator confirmation | Measured reduction in off-specification hours or unplanned cleanings |
| 4 — Fleet | Multi-plant deployment, shared model governance | Per-plant validation |

A host utility or plant operator would be needed from Phase 1; no such partnership exists today.

## 14. Conclusion

AquaTwin shows that a digital twin for seawater desalination can be accurate, anticipatory and conservative at the same time. Grounding machine learning in a self-calibrating physical model gives better predictions than either alone and fails more gracefully; wrapping every recommendation in deterministic, uncertainty-aware constraints — and abstaining outside the validated envelope — makes the result suitable for the way critical water infrastructure is operated. On a hidden simulated plant it removed constraint violations under salinity, power and demand stresses and warned of membrane fouling half a day ahead, and it told the truth when it could not help. The next step is the one no simulator can replace: a plant historian and a period of shadow operation.

*Predict. Simulate. Adapt. Before the plant is forced to react.*

## References

1. UAE Government portal (u.ae). *Water* (updated September 2026) — desalination as a key source; installed capacity 7.8 million m³/day (2023, FCSC). https://u.ae/en/information-and-services/environment-and-energy/Natural-resources/water-
2. ACWA Power. *Taweelah RO Desalination IWP* (project page). https://acwapower.com/en/what-we-do/projects/taweelah-ro-desalination-iwp/
3. UAE Government portal (u.ae). *The UAE Water Security Strategy 2036*.
4. Sheppard, C., et al. (2010). The Gulf: a young sea in decline. *Marine Pollution Bulletin* 60(1):13–38. https://doi.org/10.1016/j.marpolbul.2009.10.017
5. Miyakawa, H., et al. (2021). Reliable seawater RO operation with high water recovery and no-chlorine/no-SBS dosing in the Arabian Gulf. *Membranes* 11(2):141. https://doi.org/10.3390/membranes11020141
6. Schunke, A.J., et al. (2020). Energy recovery in SWRO desalination: current status and new possibilities. *Frontiers in Sustainable Cities* 2:9 (citing Kim & Hong 2018; Voutchkov 2018). https://doi.org/10.3389/frsc.2020.00009
7. Gude, V.G., Fthenakis, V. (2020). Energy efficiency and renewable energy utilization in desalination systems. *Progress in Energy* 2(2):022003. https://doi.org/10.1088/2516-1083/ab7bf6
8. Anderson, D.M., Boerlage, S.F.E., Dixon, M.B. (Eds.) (2017). *Harmful Algal Blooms and Desalination: A Guide to Impacts, Monitoring and Management*. IOC Manuals and Guides 78, IOC-UNESCO (Chapter 2, Hess et al.).
9. ASTM International (2019). ASTM D4516-19a, *Standard Practice for Standardizing Reverse Osmosis Performance Data*. https://doi.org/10.1520/D4516-19A
10. DuPont (2026). *FilmTec™ Reverse Osmosis Membranes Technical Manual*, Form 45-D01504-en, Rev. 20; FilmTec™ SW30 product data sheets.
11. WaterTAP (watertap-org). Seawater property package and reverse-osmosis unit models. https://watertap.readthedocs.io
12. Sharqawy, M.H., Lienhard V, J.H., Zubair, S.M. (2010). Thermophysical properties of seawater: a review of existing correlations and data. *Desalination and Water Treatment* 16:354–380. https://doi.org/10.5004/dwt.2010.1079
13. Energy Recovery, Inc. (2025). *PX Q400: Highly Efficient Energy Recovery Device*, white paper.
14. Angelopoulos, A.N., Bates, S. (2023). Conformal prediction: a gentle introduction. *Foundations and Trends in Machine Learning* 16(4):494–591. https://doi.org/10.1561/2200000101
15. Lee, K., Lee, K., Lee, H., Shin, J. (2018). A simple unified framework for detecting out-of-distribution samples and adversarial attacks. *NeurIPS* 31. https://arxiv.org/abs/1807.03888
16. Ember (2026), via Our World in Data. Lifecycle carbon intensity of electricity generation (UAE 2024: 0.468 kg CO₂e/kWh).
17. World Health Organization (2022). *Guidelines for Drinking-water Quality*, 4th edition incorporating the 1st and 2nd addenda; WHO (2011) *Safe drinking-water from desalination*.
18. Pedregosa, F., et al. (2011). Scikit-learn: machine learning in Python. *JMLR* 12:2825–2830.
19. Willard, J., Jia, X., Xu, S., Steinbach, M., Kumar, V. (2023). Integrating scientific knowledge with machine learning for engineering and environmental systems. *ACM Computing Surveys* 55(4). https://doi.org/10.1145/3514228

The complete, annotated reference list is in `docs/REFERENCES.md`; model equations and parameter provenance in `docs/MODEL.md`.

<section class="appendix" markdown="1">

## Appendix A — The prototype

<figure class="wide"><img src="../docs/screenshots/02-digital-twin.png" alt="Digital Twin page"><figcaption>A1. Digital Twin: for the selected train, physics estimate + ML residual = AquaTwin estimate, with the 90 % interval, the inputs and the self-calibrated parameters.</figcaption></figure>

<figure class="wide"><img src="../docs/screenshots/04-optimization.png" alt="Optimization page"><figcaption>A2. Optimization: 676 candidate strategies (SEC vs membrane stress), Pareto set, AquaGuard verdicts and the recommended strategy against the current one.</figcaption></figure>

<figure class="wide"><img src="../docs/screenshots/05-membrane-health.png" alt="Membrane Health page"><figcaption>A3. Membrane Health: normalised performance per train, projection to the cleaning threshold and why Train 2 is flagged.</figcaption></figure>

<figure class="wide"><img src="../docs/screenshots/08b-model-intelligence-withheld.png" alt="Model Intelligence page, withheld recommendation"><figcaption>A4. Model Intelligence: the out-of-distribution probe at a compound extreme (53 g/L, 37.5 °C). Confidence drops to 35 % and AquaGuard withholds the recommendation.</figcaption></figure>

<figure class="wide"><img src="../docs/screenshots/09-validation.png" alt="Validation page"><figcaption>A5. Validation: all experiment results, read directly from the result files.</figcaption></figure>

## Appendix B — Reproducing the results

```
npm install
pip install -r ml/requirements.txt
npm run pipeline                         # dataset → training → parity check → experiments
python scripts/report/validation_md.py   # docs/VALIDATION.md
python scripts/report/figures.py         # report figures
python scripts/report/build.py           # this report (HTML + PDF)
npm test                                 # unit tests
```

All steps use fixed seeds (20261101 for data and models; 1–5 for sensor noise). Rerunning the pipeline reproduced the dataset, models, metrics and all 200 closed-loop runs identically apart from timestamps.

</section>
