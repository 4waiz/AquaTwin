# AquaTwin — model description

This document describes every model in AquaTwin: what it computes, the equations, the parameters and where each value comes from. Section numbers are referenced from code comments (`docs/MODEL.md §n`).

**Provenance labels** used throughout the product and this document:

| Label | Meaning |
|---|---|
| **Simulated** | Produced by the reference plant simulator (§2), which stands in for a real plant. All "live" telemetry is simulated. |
| **Modeled** | Output of AquaTwin's own hybrid model (§3–§5): predictions, expectations, forecasts. |
| **Estimated** | Derived with material outside uncertainty (e.g. carbon from an average grid factor). |
| **Assumed** | A design choice without a specific source; tagged `[assumed]` in `src/sim/config.ts`. |
| **External ref.** | Taken from a published source; tagged `[ref:KEY]`, see [REFERENCES.md](REFERENCES.md). |
| **Measured** | Not used. AquaTwin has not been connected to a real plant. |

---

## 1. Overview: two models, one of them hidden

AquaTwin is evaluated the way a digital twin would be evaluated on a real plant, except that the "plant" is a second, higher-fidelity simulator whose internal state AquaTwin never sees:

```
 Reference plant (§2)            AquaTwin (what would run at a real site)
 element-level physics,   ──►    noisy telemetry ─► self-calibrated 0D physics (§3)
 hidden fouling state,           ─► ML residual correction (§4) ─► uncertainty & OOD (§4.4)
 pump wear, PX mixing            ─► health, degradation, forecasts (§5)
        ▲                        ─► optimiser (§7) ─► AquaGuard (§8) ─► operator
        └─────── setpoints (only in closed-loop experiments, §9) ◄──────┘
```

The two models differ deliberately in structure (element marching vs lumped, non-linear vs linearised osmotic pressure, salt-transport temperature dependence, pump curves, energy-recovery mixing, compaction, fouling distribution). That model-form gap is what the machine-learning residual must learn, and it is what makes the validation experiments meaningful: ground truth is known exactly, but AquaTwin only sees what a SCADA historian would record.

**Reference configuration** (not any real facility; `src/sim/config.ts`): three RO trains, 200 pressure vessels per train, 7 × 8-inch SWRO elements per vessel (40.9 m² each) [ref:FILMTEC-SW30]; isobaric pressure exchangers with booster pumps [ref:ERI-PX]; design point 63.5 bar feed pressure, 9.6 m³/h feed per vessel, on Arabian-Gulf-like seawater of 41.5 g/L at 28.4 °C [ref:GULF-CONDITIONS]; ≈ 57,000 m³/day product water into a 14,000 m³ storage reservoir [assumed].

---

## 2. Reference plant (the simulated "real" plant)

`src/sim/referencePlant.ts`, `src/sim/seawater.ts`, `src/sim/plant.ts`.

### 2.1 Seawater properties

Seawater properties follow the WaterTAP seawater property package [ref:WATERTAP-RO], which implements Sharqawy, Lienhard & Zubair (2010) [ref:SHARQAWY-2010]:

- pure-water density ρ_w(t) and seawater density ρ_sw(S, t) (Sharqawy eqs. 6 and 8);
- osmotic coefficient φ(S, t) (Sharqawy eq. 49, 0–200 °C, 0–120 g/kg);
- osmotic pressure, non-ideal:

  π = φ(S, t) · m · ρ_w(t) · R · T,  with molality m = S / (M_TDS · (1 − S)) and M_TDS = 31.4038 g/mol (reference-composition sea salt, Millero et al. 2008).

Check: standard seawater (35 g/kg, 25 °C) gives π ≈ 25.9 bar, which agrees with TEOS-10 within ±0.4 % (research notes §1c). The often-quoted 27–28 bar is the value for a 35 g/kg **NaCl** solution and is not used. The unit test `tests/physics.test.ts` asserts this value.

### 2.2 Membrane transport (solution–diffusion) with concentration polarisation

Each vessel is marched in 14 segments (2 per element). In each segment the water flux J (L m⁻² h⁻¹, "LMH") solves

  J = A · (P − ΔP_seg/2 − P_p − (π(C_m) − π(C_p))),

  C_m = C_p + (C_b − C_p) · exp(J / k),  C_p = B · C_b · e^{J/k} / (J + B · e^{J/k}),

where C_b is the segment bulk concentration, C_m the membrane-wall concentration (film theory), C_p the local permeate concentration and k the mass-transfer coefficient, k = 150 LMH · (Q/10 m³ h⁻¹)^0.6 · (1 + 0.02 (T − 25)) [assumed; spiral-wound SWRO range]. The implicit equation h(J) = J − A·NDP(J) is monotone; it is solved per segment with the Illinois variant of regula falsi on a guaranteed bracket.

- **Water permeability** A = A₂₅ · TCF(T) · (1 − φ_k) · (1 − 0.006 · max(0, P − 50)/10): A₂₅ = 1.05 LMH/bar for the as-operated (aged) membranes [assumed within datasheet-derived 1.16–1.44 for new elements, ref:FILMTEC-SW30]; TCF = exp(K·(1/298.15 − 1/(273.15+T))) with K = 2640 K above 25 °C and 3020 K below [ref:DUPONT-MANUAL]; φ_k is the element fouling state (§2.4); the last factor is membrane compaction [assumed].
- **Salt permeability** B = B₂₅ · exp(3400·(1/298.15 − 1/(273.15+T))) · (1 + 0.35 φ_k): B₂₅ = 0.06 LMH [ref:FILMTEC-SW30]. The stronger salt activation (3400 K instead of the water TCF) and the fouling term (cake-enhanced polarisation) are deliberate differences from the twin [assumed].
- **Pressure drop** ΔP_seg = k_dp · (1 + 0.7 φ_k) · μ-factor(T) · Q^1.75, calibrated to ≈ 1.3 bar per vessel at design [assumed; limit 3.5 bar per vessel, ref:FILMTEC-SW30].

### 2.3 Energy

- HP pump: efficiency η(Q) = 0.86 · (1 − 0.35 (Q/Q_BEP − 1)²) · (1 − wear), motor × VFD 0.93 [assumed; pump × motor ≈ 0.80 as in WaterTAP, ref:WATERTAP-RO]. The HP pump supplies the permeate-equivalent flow plus PX lubrication leakage (1.5 % of brine).
- Pressure exchanger: 96 % efficiency, 4 % volumetric mixing that raises the membrane feed salinity [ref:ERI-PX]; booster pump 0.78.
- Motor rating: each train's HP + booster motors are rated at 1.2 × design electrical power; if a setpoint would overload them (e.g. a worn pump), the achievable pressure is reduced until the motor runs at its rating ("motor-limited").
- Plant auxiliaries per m³ (`plant.ts`): intake pumping, pretreatment (with backwash increasing with turbidity), post-treatment and transfer 0.30 kWh/m³, plant base load 250 kW [assumed]. The resulting specific energy consumption (SEC) of ≈ 3.2–3.3 kWh/m³ is at or below the low end of published SWRO ranges — typically 3.5–4.5 kWh/m³ [ref:VOUTCHKOV-2018], and about 4 kWh/m³ for the Arabian Gulf including pre- and post-treatment [ref:GUDE-2020]. Absolute energy values therefore depend on the assumed auxiliary loads and should not be read as plant-specific; comparisons between strategies on the same plant are the meaningful quantity.

### 2.4 Fouling dynamics (hidden state)

Each of the 7 element positions carries a fouling state φ_k ∈ [0, 0.6] that evolves as

  dφ_k/dt = κ · F · m · w_k · (J_k / 14 LMH)² · (1 − φ_k / 0.6),

with base rate κ = 1.0·10⁻⁴ h⁻¹ (≈ 0.6 %/week normalised-flow decline at design), feed fouling potential F (scenario-driven, e.g. algal bloom), a train-specific multiplier m (scenario-driven, e.g. biofilm on Train 2) and a lead-heavy biofouling profile w = [1.9, 1.4, 1.1, 0.85, 0.7, 0.55, 0.5] [all assumed]. The live plant runs Train 2 with m = 20 so that a fouling trend is visible within hours (`LIVE_FOULING_MULTIPLIER` in `src/runtime/engine.ts`); this is a demonstration setting, not a claim about real fouling rates.

### 2.5 Sensors

Telemetry is the true state plus Gaussian noise (1σ): flows 0.5 %, pressures 0.12 bar, permeate TDS 1.5 %, temperature 0.05 °C, power 0.6 %, vessel ΔP 0.03 bar [assumed]. The sensor-degradation scenario triples the noise and adds a permeate-conductivity drift.

---

## 3. AquaTwin physics layer: reduced-order (0D) model

`src/sim/physics0d.ts`. One equation set per train (all vessels identical):

  J = A₂₅ · TCF(T) · NDP,  NDP = P − ΔP/2 − P_p − (π_L(β·C̄) − π_L(C_p)),

  C̄ = C_f · ln(1/(1−r)) / r (log-mean bulk concentration),  β = 1.1 (constant polarisation factor),

  C_p = B · β C̄ / (J + B),  ΔP = k_dp · (Q_v (1 − r/2))^1.75,

  W_RO = (Q_f P − 0.94 · Q_b P_b) / (36 · η_lumped).

π_L is a linear osmotic-pressure law anchored at the exact value for 35 g/L and 25 °C. The recovery r is found by bisection on A·NDP(r) − J(r) = 0. This is the kind of model an engineer would write from a membrane manual; it is fast (microseconds) and physically consistent, but systematically biased against the reference plant (polarisation, non-linear osmotic pressure, energy-recovery mixing, pump curve, salt temperature dependence, fouling distribution).

### 3.1 Self-calibration

`calibrate0D` inverts the 0D model for one set of measurements (feed pressure and flow, permeate flow and TDS, vessel ΔP, RO power) to give the lumped parameters θ = (A₂₅, B₂₅, k_dp, η). This mirrors ASTM D4516-style normalisation [ref:ASTM-D4516]: performance is re-expressed through the model instead of empirical correction factors. The online estimator (`TrainEstimator`) smooths θ̂, the calibration operating point u₀ and the calibration seawater conditions with an exponential filter (live plant: time constant ≈ 24 min); a setpoint change re-anchors u₀ faster.

---

## 4. Machine-learning residual

`ml/train.py` (training), `src/sim/ml.ts` (browser runtime), `scripts/generate-dataset.ts` (data).

### 4.1 Learning task and data

Each synthetic sample reproduces the operational task: the reference plant runs at operating point u₀ in a hidden state; AquaTwin averages 6 noisy telemetry samples at u₀ and self-calibrates θ̂; it must then predict the plant response at a what-if point u₁ (different pressure / flow, and — for 15 % of samples — changed seawater; 30 % are "normalisation" queries at standard conditions). Labels are single noisy measurements at u₁ (what a historian would hold); noise-free truth is stored for evaluation only.

- Hidden states span fouling 0–0.3 (three fouling profiles), salt-passage ageing, pump wear; seawater 36–48 g/L and 18–36 °C; pressure 52–73 bar; flow 6.5–14 m³/h per vessel.
- Splits (seed 20261101): train 40,000; conformal calibration 8,000; in-envelope test 8,000; **out-of-envelope test 6,000** (salinity 48.5–54 g/L and/or temperature 36.5–40 °C, or fouling 0.32–0.45).

### 4.2 Models

For four targets — permeate flow Q, permeate TDS C, vessel ΔP D, RO power W — two model families are trained with scikit-learn `HistGradientBoostingRegressor` (learning rate 0.06, 350 iterations, 31 leaves, min 40 samples per leaf, L2 1.0, no early stopping, `random_state` 20261101):

- **Hybrid (AquaTwin)**: inputs = what-if point, calibration point and conditions, θ̂, and the physics outputs (r, J, C_p, ΔP) — 16 features. Target = residual of the physics prediction: relative for Q and W (y/ŷ_phys − 1), log-ratio for C, absolute for D. Final prediction = physics × (1 + residual) etc. — "Physics prediction + ML residual = AquaTwin prediction".
- **ML-only baseline**: inputs = what-if point, calibration point and conditions, and the smoothed measurements at u₀ — 12 features, target = the output itself. Same learner and budget.

The fitted trees are exported to JSON and evaluated in the browser by a small TypeScript tree-ensemble runtime. `scripts/parity-test.ts` (and `tests/ml.test.ts`) verify that the browser predictions equal scikit-learn's to within 1·10⁻⁹ on 500 samples per model.

### 4.3 Accuracy (held-out synthetic data)

Mean absolute error against noise-free truth, permeate flow per train (m³/h), from `public/data/models/ml-metrics.json`:

| Model | Inside envelope | Outside envelope |
|---|---|---|
| Physics, uncalibrated | 53.2 | — |
| Physics, self-calibrated | 48.0 | 47.9 |
| ML only | 9.7 | 35.1 |
| **AquaTwin hybrid** | **4.9** | **12.1** |

Sensor-noise floor for a single permeate-flow measurement: 3.0 m³/h. Outside the training envelope the ML-only model loses most of its advantage while the hybrid degrades gracefully, because its physics backbone still extrapolates correctly in direction. The Validation page shows all targets.

### 4.4 Uncertainty and out-of-distribution detection

- **Prediction intervals**: split conformal prediction [ref:CONFORMAL] at 90 % (α = 0.1) on the calibration split, with non-conformity scores in the same space as the residual. Intervals are Mondrian (group-conditional) on the normalised extrapolation distance between u₁ and u₀ (bins at 1.0 and 2.5), because what-if queries far from the calibration point are harder. Coverage on the in-envelope test set is 0.90–0.98; outside the envelope it drops (e.g. hybrid permeate flow 0.54), which is why AquaTwin withholds recommendations there.
- **Distance to the training distribution**: Mahalanobis distance [ref:MAHALANOBIS-OOD] on 10 features (seawater now and at calibration, operating point, θ̂), relative to the 99th percentile d₉₉ of the training data. Confidence is 1 inside d₉₉, falls linearly to 0 at 1.8·d₉₉, and is capped at 0.35 if any feature lies outside its training range (± 3 % of span).
- **Withhold rule**: AquaGuard withholds any recommendation when confidence < 0.5, i.e. distance > 1.4·d₉₉ or a feature out of range. On held-out data this flags 77 % of out-of-envelope samples and 0.01 % of in-envelope samples (100 % for salinity or combined excursions, 99 % for temperature, 7 % for fouling-only excursions, which are hard to detect from inputs alone).

---

## 5. Health, degradation and forecasting

### 5.1 Normalised performance (health)

`estimateHealth` (`src/sim/twin.ts`). Following the idea of ASTM D4516 [ref:ASTM-D4516], each train's performance is re-expressed at fixed standard conditions (design seawater, pressure and flow) and divided by its post-clean baseline. Where conventional practice uses empirical correction factors, AquaTwin queries its calibrated hybrid model at the standard conditions:

- NPF — normalised permeate flow ("health"; 1 = post-clean baseline);
- NSP — normalised salt passage (> 1 = more salt passes);
- NDP — normalised differential pressure (> 1 = more hydraulic resistance).

Cleaning (CIP) criteria follow the membrane manufacturer [ref:DUPONT-MANUAL]: clean when normalised permeate flow drops 10 %, **or** normalised salt passage rises 5–10 %, **or** normalised pressure drop rises 10–15 % (`src/sim/cleaning.ts`; AquaTwin uses the upper end of each range as "due" and the lower end as "approaching"). Only the flow criterion (`LIMITS.cipHealthThreshold = 0.9`) is forecast in time and used as the "cleaning threshold" event in the experiments. In the reference plant, lead-end biofouling raises normalised pressure drop about four times faster than normalised flow declines (e.g. NPF 0.954 with NDP 1.20), so — as is typical of biofouling — the pressure-drop criterion is met first; the live plant's Train 2 starts in that state and is reported as "cleaning due". The Membrane Health page shows, per train, the observed flow, the flow a clean train would deliver under the same conditions (hybrid model) and the unexplained loss, together with a symptom → cause matrix (biofouling / particulate: lead-end ΔP rise; scaling: tail-end salt passage) from manufacturer troubleshooting practice [ref:DUPONT-MANUAL].

### 5.2 Degradation model (twin forward mode)

For forecasting beyond the telemetry, the twin carries a lumped fouling state φ̂ per train:

  dφ̂/dt = κ̂ · F · m · (J/J_ref)² · (1 − φ̂/φ_max),  θ(φ̂) = (A₂₅,clean (1 − φ̂), B₂₅,clean (1 + g_s φ̂), k_dp,clean (1 + g_d φ̂), η).

κ̂ = 5.60·10⁻⁵ h⁻¹, g_d = 2.21 and g_s = 0.159 are **fitted** on synthetic operating history of the reference plant (15 operating points × 72 h, biofouling profile) by `scripts/generate-dataset.ts` and shipped in `public/data/models/degradation.json`. The lumped model does not know the element distribution; the fit is a least-squares match of the calibrated effective fouling 1 − Â₂₅/Â₂₅,clean.

### 5.3 Threshold forecast

`src/sim/forecast.ts`. Ordinary least squares on the last 24 h (live) or 6 h (experiments) of NPF estimates gives slope and standard error. The time to the cleaning threshold is reported with a 90 % band from the confidence band of the fitted line; the probability of crossing within a horizon comes from the sampling distribution of the slope (normal approximation). A fouling warning latches when that probability exceeds 0.5 and clears only once the decline has stopped (hysteresis), to avoid flicker.

---

## 6. Disturbance scenarios

`src/sim/scenarios.ts`. Deterministic functions of time; magnitudes are illustrative stress tests chosen to be physically plausible for Gulf SWRO — they are not reconstructions of specific historical events.

| Scenario | Disturbance (onset +1 h) | Represents |
|---|---|---|
| Salinity shock | feed salinity +15 % over 2 h, held 11 h | brine-plume recirculation, regional excursion |
| Algal bloom | turbidity to ≈ 14 NTU, fouling potential × 6, intake capacity −15 % | harmful algal bloom at an open intake [ref:HAB-UNESCO] |
| Membrane fouling | Train 2 fouling rate × 140 (≈ −0.35 %/h NPF) | biofouling after loss of biocide dosing |
| Pump degradation | Train 1 HP pump −12 % efficiency, −5 % head | impeller / wear-ring damage |
| Energy constraint | plant power capped at 80 % from +3 h to +9 h | grid peak / curtailment request |
| Demand surge | demand +20 % for 18 h | heat-wave demand, supply loss elsewhere |
| Temperature shock* | feed temperature +5 °C | marine heat event |
| Sensor degradation* | noise × 3, permeate-TDS drift +0.5 %/h | instrument fouling / drift |
| Compound extreme* | 53 g/L and 37.5 °C | outside the model envelope — tests abstention |

\* validation only (not in the Scenario Lab).

---

## 7. Decision layer

### 7.1 Production planning

`src/sim/planner.ts`. From the demand forecast, the reservoir level and any announced power-cap window, the planner sets a hard minimum production (keeps storage above 25 % + 3 % margin over the next interval), a hard maximum (no overflow) and a soft target that steers storage to 60 % with a 5 h time constant — or to 90 % when a cap window starts within 8 h, so storage can carry the plant through it.

### 7.2 Strategy optimisation

`src/sim/optimizer.ts`. At each decision (hourly in closed loop plus unscheduled re-plans, see below; on demand in the interface) AquaTwin enumerates 676 candidates: common feed pressure P ∈ {54, 55.5, …, 72} bar × feed flow per vessel Q_v ∈ {7, 7.5, …, 13} m³/h × allocation of the weakest ("focus") train ∈ {equal, −3 bar, −6 bar, offline}. Each candidate is predicted with the model (motor limits enforced), screened by AquaGuard at the edge of its 90 % interval, and admissible candidates are ranked by

  score = w_E·SEC/0.1 + w_Q·TDS/100 + w_P·|production gap|/0.03 + w_S·stress/0.1 + w_F·(fouling rate, %/h)/0.05 + move cost,

with default weights energy 0.35, quality 0.10, production 0.25, membrane stress 0.10, fouling 0.20 (editable on the Optimization page). **Look-ahead:** decisions are hourly, so the chosen strategy must satisfy every hard limit not only under present feed conditions but also under the conditions extrapolated to the end of the hour from the last hour's measured salinity and temperature trend (`extrapolateFeed`, bounded); the best-scoring strategy that passes both checks is recommended; if none does, the best-scoring strategy that passes the present check is proposed with a note that the operator's attention is needed. The same extrapolation drives the two-hour permeate-quality outlook. **Unscheduled re-plan:** between hourly decisions, the closed loop checks every 10 minutes whether the current setpoints would still pass the same look-ahead check; if not, AquaTwin re-plans at once (at most every 20 minutes, and not while recommendations are withheld). A ramp that starts just after a decision would otherwise go unanswered for up to an hour: in the Scenario Lab, a night start with 65 % product storage — low demand, so low flux and permeate TDS close to its limit — showed a 20-minute quality violation before this was added. Without the look-ahead, a salinity ramp during a low-demand night could push permeate TDS over its limit before the next decision. The stress index is the envelope utilisation of the most loaded train (flux, pressure, recovery, ΔP relative to their limits). A small move cost (0.012 per bar, 0.03 per 0.5 m³/h, 0.15 per train switch) prevents chattering between near-equal candidates, as in model-predictive control practice; holding the current setpoints is always a candidate. **Constraints are never traded off** — weights only rank strategies that already satisfy every limit. If no candidate satisfies the minimum production, the service constraint is relaxed and AquaTwin maximises production within every safety limit (reported as such). The Pareto set in the (SEC, stress) plane is shown for transparency.

---

## 8. AquaGuard (deterministic safety layer)

`src/sim/aquaguard.ts`. Plain comparisons against documented limits — nothing is learned:

| Constraint | Limit | Source |
|---|---|---|
| Feed pressure | ≤ 70 bar | plant design limit [assumed]; element rating 83 bar [ref:FILMTEC-SW30] |
| Blended permeate TDS | ≤ 400 mg/L | plant specification [assumed]; WHO palatability context [ref:WHO-GDWQ] |
| Train recovery | ≤ 50 % | [assumed] scaling / brine limit |
| Average flux | ≤ 17 LMH | seawater design range 12–19 LMH [ref:DUPONT-MANUAL] |
| Concentrate flow per vessel | ≥ 3.6 m³/h | [assumed] 8-inch element guidance |
| Feed flow per vessel | ≤ 16 m³/h | [assumed] 8-inch element guidance |
| Vessel ΔP | ≤ 3.5 bar | [ref:FILMTEC-SW30] |
| Train power | ≤ motor rating | §2.3 |
| Production | ≥ planner minimum | §7.1 |
| Plant power | ≤ cap (if any) | scenario |
| Setpoint ramp | ≤ 8 bar per hour | [assumed] operational stability |
| Model confidence | ≥ 50 % | §4.4 |

Model-predicted quantities are checked at the conservative edge of their 90 % conformal interval (uncertainty-aware constraint satisfaction). Verdicts: **WITHHELD** if confidence < 50 % (the recommendation is not shown; "operator review required"), **REJECTED** if any constraint fails (with the reasons), otherwise **APPROVED**. AquaTwin operates in shadow mode: approved recommendations are advisory; the "Apply in simulation" button only changes the simulated plant.

---

## 9. Closed-loop simulation and experiments

`src/sim/closedLoop.ts`, `scripts/run-experiments.ts`, see [VALIDATION.md](VALIDATION.md).

- **Scenario Lab forecasts** run the calibrated hybrid twin forward from the live state for 24 h (10-minute steps), once with setpoints held (no action) and once with AquaTwin decisions (hourly, plus re-plans when the feed trend threatens a limit). These are what AquaTwin *predicts*; they are labelled "simulated forecast".
- **Validation experiments** run the reference plant as the plant, with AquaTwin seeing only noisy telemetry and re-calibrating itself every step, for 10 scenarios × 4 methods × 5 sensor-noise seeds; a robustness sweep repeats three scenarios at six start times and three initial storage levels.
- **Warnings vs alarms** (monitoring mode): conventional alarms are fixed thresholds on measured values (TDS > 95 % of limit, storage < minimum + 5 %, permeate flow −10 % at design pressure, ΔP > 90 % of limit, motor limit, power above cap). AquaTwin warnings are model forecasts: the fouling trend forecast (§5.3), a 2-hour quality outlook that extrapolates the last hour's feed-salinity and temperature trend through the model, and a storage-depletion forecast.

---

## 10. Limitations

- The plant is simulated. Real plants have phenomena neither model contains (scaling chemistry, fouling heterogeneity between vessels, control-loop dynamics, instrument failures).
- Only total dissolved solids are modelled. Boron — poorly rejected by single-pass SWRO and subject to a WHO guideline value of 2.4 mg/L [ref:WHO-GDWQ] — is not, so the permeate-quality constraint does not cover it. The hybrid approach is designed to absorb such model-form error through the residual, but that has only been shown against a simulator.
- The ML residual is trained on synthetic data from the same reference plant it is evaluated against; the out-of-envelope test and the model-form differences mitigate, but do not remove, this optimism. On a real plant the residual would be trained on historian data and re-validated.
- Steady-state models: hydraulic and control transients (minutes) are not modelled; decisions are hourly, with re-plans at most every 20 minutes.
- The degradation model is lumped and fitted to one fouling profile; scaling and chemical degradation are not modelled.
- Scenario magnitudes are illustrative; carbon factors are an average-grid estimate, not marginal emissions of a specific supplier.
- Energy figures are modelled; the absolute SEC depends on assumed auxiliary loads.
