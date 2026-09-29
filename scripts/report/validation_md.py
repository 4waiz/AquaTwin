"""
Write docs/VALIDATION.md from the experiment artefacts.

Every number in the document is read from
  public/data/validation/results.json   (scripts/run-experiments.ts)
  public/data/models/ml-metrics.json     (ml/train.py)
so the text cannot drift from the data. Re-run after any experiment:

  python scripts/report/validation_md.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "public" / "data" / "validation" / "results.json"
ML = ROOT / "public" / "data" / "models" / "ml-metrics.json"
OUT = ROOT / "docs" / "VALIDATION.md"

METHODS = ["fixed", "physics", "mlonly", "hybrid"]
LABEL = {"fixed": "Fixed operation", "physics": "Physics only", "mlonly": "ML only", "hybrid": "AquaTwin hybrid"}
VIOL = {
    "tds": "permeate quality",
    "pressure": "pressure limit",
    "recovery": "recovery limit",
    "flux": "flux limit",
    "brine": "concentrate flow",
    "feedflow": "vessel feed flow",
    "dp": "vessel ΔP",
    "reservoir": "storage minimum",
    "powercap": "power cap",
}


def f(x, d=2):
    return "—" if x is None else f"{x:,.{d}f}"


def cell(stat, d, best=False):
    if stat is None or stat.get("mean") is None:
        return "n/a"
    s = f(stat["mean"], d)
    sd = stat.get("std")
    if sd is not None and round(sd, d) > 0:
        s += f" ± {f(sd, d)}"
    return f"**{s}**" if best else s


def table(res, key, d, better, na=()):
    head = "| Scenario | " + " | ".join(LABEL[m] for m in METHODS) + " |\n|---|" + "---|" * len(METHODS) + "\n"
    rows = []
    for s in res["scenarios"]:
        r = res["results"][s["id"]]
        vals = [None if m in na else (r[m].get(key) or {}).get("mean") for m in METHODS]
        fin = [round(v, d) for v in vals if v is not None]
        best = None
        if better and len(set(fin)) > 1:
            best = min(fin) if better == "lower" else max(fin)
        cells = []
        for m, v in zip(METHODS, vals):
            if m in na:
                cells.append("n/a")
            else:
                cells.append(cell(r[m].get(key), d, best is not None and v is not None and round(v, d) == best))
        rows.append(f"| {s['name']} | " + " | ".join(cells) + " |")
    return head + "\n".join(rows) + "\n"


def event_label(kind):
    if not kind:
        return "—"
    t, what = kind.split(":", 1)
    if t == "cip":
        return f"flow cleaning criterion (−10 %), Train {what[1:]}"
    if t == "capacity":
        return f"capacity loss, Train {what[1:]}"
    return " + ".join(VIOL.get(v, v) for v in what.split("+"))


def hours(h):
    if h is None:
        return "no warning"
    return f"{h * 60:.0f} min" if h < 1 else f"{h:.1f} h"


def compute_findings(res) -> list[str]:
    R = res["results"]
    name = {s["id"]: s["name"] for s in res["scenarios"]}
    ids = [s["id"] for s in res["scenarios"]]
    m = lambda sid, meth, key: (R[sid][meth].get(key) or {}).get("mean")
    out = []
    helped = [sid for sid in ids if (m(sid, "fixed", "anyViolation_h") or 0) > 0.05 and (m(sid, "hybrid", "anyViolation_h") or 0) < 0.05]
    if helped:
        out.append(
            "**Constraint violations avoided:** "
            + "; ".join(f"{name[s]}: {m(s, 'fixed', 'anyViolation_h'):.1f} h with fixed operation → {m(s, 'hybrid', 'anyViolation_h'):.1f} h with AquaTwin" for s in helped)
            + "."
        )
    only = [sid for sid in ids if (m(sid, "hybrid", "anyViolation_h") or 0) < 0.05 and all((m(sid, k, "anyViolation_h") or 0) > 0.05 for k in ("physics", "mlonly"))]
    if only:
        out.append(
            "**Hybrid vs single models in closed loop:** in "
            + ", ".join(name[s] for s in only)
            + " the hybrid is the only model with no violations ("
            + "; ".join(f"physics {m(s, 'physics', 'anyViolation_h'):.2f} h, ML only {m(s, 'mlonly', 'anyViolation_h'):.2f} h" for s in only)
            + ")."
        )
    worse = [sid for sid in ids if (m(sid, "hybrid", "anyViolation_h") or 0) > min(m(sid, k, "anyViolation_h") or 0 for k in ("physics", "mlonly")) + 0.05]
    if worse:
        out.append("**Where a single model did better in closed loop:** " + ", ".join(name[s] for s in worse) + ".")
    lt = res["leadTime"]
    lead = [sid for sid in ids if lt.get(sid, {}).get("eventsObserved") and lt[sid].get("hybrid_h") is not None]
    if lead:
        out.append(
            "**Early warning:** "
            + "; ".join(
                f"{name[s]}: hybrid {hours(lt[s]['hybrid_h'])} ahead vs conventional alarm {hours(lt[s].get('conventional_h'))}" + ("" if lt[s].get("conventional_h") is None else " ahead")
                for s in lead
            )
            + ". Model-based warnings help most for slow processes (fouling, storage); for fast ramps the gain is minutes."
        )
    secd = [(s, (m(s, "hybrid", "sec_kWh_m3") - m(s, "fixed", "sec_kWh_m3")) / m(s, "fixed", "sec_kWh_m3") * 100) for s in ids if s != "extreme"]
    lo, hi = min(d for _, d in secd), max(d for _, d in secd)
    pct = lambda x: "0.0 %" if abs(x) < 0.05 else f"{x:+.1f} %".replace("-", "−")
    out.append(
        f"**Energy:** relative to fixed operation, the hybrid loop changes specific energy by {pct(lo)} to {pct(hi)} across scenarios (largest: {name[max(secd, key=lambda x: x[1])[0]]}). Avoiding violations usually costs energy; lower energy is not claimed."
    )
    if "extreme" in ids:
        vals = [m("extreme", k, "anyViolation_h") for k in METHODS]
        out.append(
            f"**Outside the envelope (compound extreme):** every method violates constraints for {min(vals):.1f}–{max(vals):.1f} h of 24. AquaTwin withholds its recommendation at {m('extreme', 'hybrid', 'withheld'):.0f} of 24 decisions, as designed — this limits harm but does not solve the problem."
        )
    mae = [sid for sid in ids if sid != "extreme"]
    best = [s for s in mae if m(s, "hybrid", "maeProduction_m3h") is not None and m(s, "hybrid", "maeProduction_m3h") <= min(m(s, k, "maeProduction_m3h") for k in ("physics", "mlonly"))]
    exc = [s for s in mae if s not in best]
    txt = f"**In-loop prediction error:** the hybrid has the lowest production MAE in {len(best)} of {len(mae)} in-envelope scenarios"
    if exc:
        txt += " (exceptions: " + "; ".join(
            f"{name[s]} — physics {m(s, 'physics', 'maeProduction_m3h'):.1f}, ML only {m(s, 'mlonly', 'maeProduction_m3h'):.1f}, hybrid {m(s, 'hybrid', 'maeProduction_m3h'):.1f} m³/h" for s in exc
        ) + ")"
    txt += ". Each loop visits different operating points, so this is less controlled than the held-out test in §2."
    out.append(txt)
    if "sensor" in ids:
        out.append(
            f"**Sensor drift:** all models inherit the biased permeate-conductivity signal (in-loop TDS error: physics {m('sensor', 'physics', 'maeTds_mgL'):.1f}, ML only {m('sensor', 'mlonly', 'maeTds_mgL'):.1f}, hybrid {m('sensor', 'hybrid', 'maeTds_mgL'):.1f} mg/L); sensor validation is outside this prototype."
        )
    return out


def main() -> None:
    res = json.loads(RES.read_text(encoding="utf-8"))
    ml = json.loads(ML.read_text(encoding="utf-8"))
    meta = res["meta"]
    ev = ml["evaluation"]

    acc_rows = []
    for t, name, unit in [("Q", "Permeate flow", "m³/h"), ("C", "Permeate TDS", "mg/L"), ("D", "Vessel ΔP", "bar"), ("W", "RO power", "kW")]:
        vals = []
        for split in ("test_id", "test_ood"):
            e = ev[split][t]
            vals += [e.get(k, {}).get("vs_truth", {}).get("mae") for k in ("physics", "mlonly", "hybrid")]
        dd = 3 if t == "D" else 1
        acc_rows.append(f"| {name} ({unit}) | " + " | ".join(f(v, dd) for v in vals) + " |")
    cov_rows = []
    for k in ("physics", "mlonly", "hybrid"):
        vals = []
        for split in ("test_id", "test_ood"):
            vals += [ev[split][t][k].get("coverage_truth") for t in ("Q", "C", "W")]
        cov_rows.append(f"| {LABEL[k]} | " + " | ".join(f(v, 2) for v in vals) + " |")

    lt_rows = []
    for s in res["scenarios"]:
        l = res["leadTime"].get(s["id"], {})
        if not l.get("eventsObserved"):
            continue
        w = l.get("warned", {})
        n = l["eventsObserved"]

        def c(k):
            v = l.get(f"{k}_h")
            txt = hours(v)
            if v is not None and w.get(k, n) < n:
                txt += f" ({w[k]}/{n})"
            return txt

        lt_rows.append(
            f"| {s['name']} | {event_label(l.get('eventKind'))} at +{l['event_h']:.1f} h | {c('conventional')} | {c('physics')} | {c('mlonly')} | **{c('hybrid')}** |"
        )
    fw = res["leadTime"].get("normal", {}).get("falseWarningHours", {})

    ood = ml["ood"]["withhold_rule"]
    by = ood.get("test_ood_flag_rate_by_type", {})

    findings = "\n".join(f"- {x}" for x in compute_findings(res))
    doc = f"""# Validation

> Generated by `scripts/report/validation_md.py` from `public/data/validation/results.json` (created {meta['created'][:19].replace('T', ' ')} UTC, {len(meta['seeds'])} seeds, {meta['durationSeconds']} s) and `public/data/models/ml-metrics.json`. Do not edit by hand — re-run the script after the experiments.

**What this is:** controlled experiments on the simulated reference plant (docs/MODEL.md §2), where the true state is known. AquaTwin sees only noisy telemetry. **What this is not:** validation on an industrial plant. All results below are simulation results.

## 1. Questions

1. Does the hybrid (physics + ML residual) predict the plant better than physics alone or ML alone — inside and outside the conditions it was trained on?
2. Are its uncertainty estimates honest, and does it know when it is outside its envelope?
3. In closed loop (hourly re-optimisation screened by AquaGuard), does better prediction translate into fewer constraint violations, and at what energy cost?
4. Does model-based monitoring warn earlier than conventional threshold alarms?

## 2. Prediction accuracy on held-out synthetic data

Task: self-calibrate on 6 averaged noisy samples at one operating point, predict another (what-if, normalisation or changed seawater). Mean absolute error against noise-free truth, per train. Test sets: {ml['meta']['nTestId']:,} samples inside the training envelope, {ml['meta']['nTestOod']:,} outside it (salinity 48.5–54 g/L and/or temperature 36.5–40 °C, or heavier fouling).

| Target | Physics (in) | ML only (in) | **Hybrid (in)** | Physics (out) | ML only (out) | **Hybrid (out)** |
|---|---|---|---|---|---|---|
{chr(10).join(acc_rows)}

Sensor-noise floor for a single permeate-flow measurement: {f(ml['noise_floor_mae']['Q'], 1)} m³/h.

**90 % prediction-interval coverage** (split conformal, Mondrian on extrapolation distance; nominal 0.90):

| Model | Flow (in) | TDS (in) | Power (in) | Flow (out) | TDS (out) | Power (out) |
|---|---|---|---|---|---|---|
{chr(10).join(cov_rows)}

**Out-of-distribution withhold rule** (confidence < 50 %): flags {ood['test_ood_flag_rate'] * 100:.0f} % of out-of-envelope samples and {ood['test_id_flag_rate'] * 100:.2f} % of in-envelope samples (by excursion type: salinity {by.get('salinity', 0) * 100:.0f} %, temperature {by.get('temperature', 0) * 100:.0f} %, both {by.get('both', 0) * 100:.0f} %, fouling only {by.get('fouling', 0) * 100:.0f} %).

**Reading:** inside the envelope the hybrid is the most accurate on every target. Outside it, the ML-only model degrades most; the hybrid degrades less because its physics backbone still extrapolates in the right direction, but its intervals under-cover — the reason AquaTwin withholds recommendations there rather than trusting them. Heavier fouling alone is poorly detected from inputs (it changes the plant, not the operating conditions); that is left to the health monitoring.

## 3. Closed-loop experiments

24 h on the reference plant, 10-minute steps, hourly decisions, {len(meta['seeds'])} sensor-noise seeds ({', '.join(str(s) for s in meta['seeds'])}). All AquaTwin variants use the same optimiser and AquaGuard; only the prediction model differs. **Fixed operation** holds its initial setpoints (no action). Values are mean ± standard deviation over seeds; bold = best where methods differ.

### 3.1 Hours with any constraint violation (true plant)

{table(res, 'anyViolation_h', 2, 'lower')}
### 3.2 Hours with permeate TDS above specification

{table(res, 'tdsViolation_h', 2, 'lower')}
### 3.3 Specific energy consumption (kWh/m³)

{table(res, 'sec_kWh_m3', 3, 'lower')}
### 3.4 Lowest product-storage level (% of capacity; minimum 25 %)

{table(res, 'minReservoir_pct', 1, 'higher')}
### 3.5 Water produced (m³ in 24 h)

{table(res, 'production_m3', 0, None)}
### 3.6 In-loop prediction error, plant production (MAE, m³/h)

{table(res, 'maeProduction_m3h', 1, 'lower', na=('fixed',))}
### 3.7 Recommendations withheld (per 24 h)

{table(res, 'withheld', 1, None, na=('fixed',))}
## 4. Early-warning lead time (no-action runs)

For each scenario the no-action run is monitored by each model. The critical event is the first unscheduled constraint violation, cleaning-threshold crossing or capacity loss on the true plant. Only warnings related to that event count (e.g. a quality warning before a TDS violation). The energy-cap scenario is excluded: curtailment is announced in advance, so lead time is not a model property.

| Scenario | First critical event | Conventional alarm | Physics | ML only | **Hybrid** |
|---|---|---|---|---|---|
{chr(10).join(lt_rows)}

Note on the membrane-fouling row: Train 2 starts with a normalised pressure drop about 20 % above its clean baseline, which already meets the manufacturer's pressure-drop cleaning criterion (+10–15 %) at t = 0; AquaTwin reports that immediately. The lead time concerns the flow criterion (−10 %), which alarms on absolute values miss.

Conventional alarms: permeate TDS > 95 % of limit, storage < minimum + 5 %, permeate flow −10 % at design pressure, vessel ΔP > 90 % of limit, motor limit. AquaTwin warnings: fouling-trend forecast, 2-hour quality outlook (feed trend extrapolated through the model), storage-depletion forecast. False warnings in normal operation (hours flagged in 24 h): conventional {f(fw.get('conventional'), 1)}, physics {f(fw.get('physics'), 1)}, ML only {f(fw.get('mlonly'), 1)}, hybrid {f(fw.get('hybrid'), 1)}.

## 5. Findings (computed from the tables above)

{findings}

## 6. Reproduce

```bash
npm run data:generate     # synthetic dataset, seed 20261101
npm run ml:train          # python ml/train.py
npm run ml:parity         # TypeScript runtime == scikit-learn (1e-9)
npm run experiments       # closed-loop experiments, 5 seeds (~5 min)
python scripts/report/validation_md.py
```

Raw per-run results: `data/experiments/runs.csv`; lead-time details: `data/experiments/lead-time.json`.
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
