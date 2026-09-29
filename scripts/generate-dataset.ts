/**
 * Synthetic dataset generation for the ML residual models (docs/MODEL.md §5.1).
 *
 * Each sample reproduces the task AquaTwin performs in operation:
 *   1. the reference plant runs at an operating point u0 in some (hidden) state;
 *   2. AquaTwin averages 6 noisy telemetry samples at u0 and self-calibrates θ̂;
 *   3. it must predict the plant response at a what-if operating point u1.
 * Labels are single noisy measurements at u1 (what a historian would hold);
 * noise-free truth is stored separately for evaluation.
 *
 * Splits: train / cal (conformal calibration) / test_id (same envelope) /
 * test_ood (outside the training envelope). Fully deterministic (seeded).
 *
 * Usage: npx tsx scripts/generate-dataset.ts [--small]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { ELEMENT, ENERGY, MEMBRANE, PLANT } from "../src/sim/config";
import { calibrate0D, solveTrain0D } from "../src/sim/physics0d";
import { measureTrain, meanFouling, REF, solveTrainRef, stepFouling } from "../src/sim/referencePlant";
import { Rng } from "../src/sim/rng";
import { HYBRID_FEATURES, MLONLY_FEATURES, OOD_FEATURES } from "../src/sim/ml";
import { DEFAULT_DEGRADATION, cleanBaseline } from "../src/sim/twin";
import type { Environment, TrainOutputs, TrainTrueState } from "../src/sim/types";

export const DATASET_SEED = 20261101;
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "data", "ml");

const small = process.argv.includes("--small");
const SPLITS = small ? { train: 4000, cal: 1000, test_id: 1000, test_ood: 800 } : { train: 40000, cal: 8000, test_id: 8000, test_ood: 6000 };

type Split = keyof typeof SPLITS;
type OodType = "none" | "salinity" | "temperature" | "both" | "fouling";

interface Row {
  split: Split;
  ood_type: OodType;
  profile: string;
  fouling_mean: number;
  salt_ageing: number;
  pump_wear: number;
  P1_bar: number;
  Qv1_m3h: number;
  Cf_gL: number;
  T_C: number;
  P0_bar: number;
  Qv0_m3h: number;
  Cf0_gL: number;
  T0_C: number;
  query: string;
  A25: number;
  B25: number;
  kdp: number;
  eta: number;
  r_phys: number;
  J_phys: number;
  Cp_phys_mgL: number;
  dP_phys_bar: number;
  Qp_phys: number;
  Pow_phys: number;
  Qp_nom: number;
  Cp_nom: number;
  dP_nom: number;
  Pow_nom: number;
  Qp0_m3h: number;
  Cp0_mgL: number;
  dP0_bar: number;
  Pow0_kW: number;
  Qp_true: number;
  Cp_true: number;
  dP_true: number;
  Pow_true: number;
  Qp_meas: number;
  Cp_meas: number;
  dP_meas: number;
  Pow_meas: number;
  motor_limited: number;
}

function makeState(rng: Rng, meanFoul: number, profile: string, saltAgeing: number, wear: number): TrainTrueState {
  const base = REF.foulingProfile as readonly number[];
  const prof = profile === "bio" ? [...base] : profile === "uniform" ? base.map(() => 1) : [...base].reverse().map((w) => w * 0.9 + 0.1);
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  const fouling = prof.map((w) => Math.min(REF.foulingMax, (meanFoul * w * (1 + rng.normal(0, 0.05))) / mean));
  return { fouling, saltAgeing, pumpWear: wear, pumpHeadLoss: wear * rng.uniform(0.3, 0.6) };
}

function envOf(Cf: number, T: number): Environment {
  return { salinity_gL: Cf, temperature_C: T, turbidity_NTU: 2, pH: 8.1, foulingPotential: 1, intakeCapacity: 1 };
}

function averageMeasurement(out: TrainOutputs, rng: Rng, n: number) {
  const acc = { feedPressure_bar: 0, feedFlow_m3h: 0, permeateFlow_m3h: 0, permeateTDS_mgL: 0, vesselDP_bar: 0, roPower_kW: 0 };
  for (let i = 0; i < n; i++) {
    const m = measureTrain(out, rng);
    acc.feedPressure_bar += m.feedPressure_bar / n;
    acc.feedFlow_m3h += m.feedFlow_m3h / n;
    acc.permeateFlow_m3h += m.permeateFlow_m3h / n;
    acc.permeateTDS_mgL += m.permeateTDS_mgL / n;
    acc.vesselDP_bar += m.vesselDP_bar / n;
    acc.roPower_kW += m.roPower_kW / n;
  }
  return acc;
}

const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const NOMINAL_THETA = () => {
  const b = cleanBaseline().theta;
  return { A25: b.A25, B25: b.B25, kdp: b.kdp, pumpEff: ENERGY.twinLumpedPumpEfficiency };
};

function sampleRow(rng: Rng, split: Split): Row | null {
  let ood: OodType = "none";
  let Cf0 = rng.uniform(36, 48);
  let T0 = rng.uniform(18, 36);
  let meanFoul = rng.uniform(0, 0.3);
  if (split === "test_ood") {
    ood = rng.pick(["salinity", "temperature", "both", "fouling"] as const);
    if (ood === "salinity" || ood === "both") Cf0 = rng.uniform(48.5, 54);
    if (ood === "temperature" || ood === "both") T0 = rng.uniform(36.5, 40);
    if (ood === "fouling") meanFoul = rng.uniform(0.32, 0.45);
  }
  const profile = rng.random() < 0.5 ? "bio" : rng.random() < 0.6 ? "uniform" : "scaling";
  const saltAgeing = rng.uniform(1, 1.25);
  const wear = rng.random() < 0.3 ? rng.uniform(0, 0.15) : 0;
  const state = makeState(rng, meanFoul, profile, saltAgeing, wear);
  const env0 = envOf(Cf0, T0);

  const P0 = rng.uniform(54, 72);
  const Qv0 = rng.uniform(7, 13.5);

  // Query type: what-if at the same conditions, normalisation to standard
  // conditions (ASTM D4516-style), or a general change of seawater conditions.
  const q = rng.random();
  let query: "whatif" | "normalise" | "envshift" = "whatif";
  let Cf = Cf0;
  let T = T0;
  let P1: number;
  let Qv1: number;
  if (q < 0.3) {
    query = "normalise";
    Cf = PLANT.design.salinity_gL;
    T = PLANT.design.temperature_C;
    P1 = PLANT.design.feedPressure_bar;
    Qv1 = PLANT.design.feedFlowPerVessel_m3h;
  } else {
    if (q < 0.45) {
      query = "envshift";
      Cf = split === "test_ood" && (ood === "salinity" || ood === "both") ? rng.uniform(48.5, 54) : rng.uniform(36, 48);
      T = split === "test_ood" && (ood === "temperature" || ood === "both") ? rng.uniform(36.5, 40) : rng.uniform(18, 36);
    }
    if (rng.random() < 0.5) {
      P1 = clip(P0 + rng.normal(0, 3), 52, 73);
      Qv1 = clip(Qv0 + rng.normal(0, 1), 6.5, 14);
    } else {
      P1 = rng.uniform(52, 73);
      Qv1 = rng.uniform(6.5, 14);
    }
  }
  const env = envOf(Cf, T);

  const sp0 = { online: true, feedPressure_bar: P0, feedFlowPerVessel_m3h: Qv0 };
  const out0 = solveTrainRef(env0, sp0, state);
  if (out0.permeateFlow_m3h <= 1 || out0.motorLimited) return null;
  const m0 = averageMeasurement(out0, rng, 6);
  const theta = calibrate0D(env0, m0);
  if (!theta) return null;

  const sp1 = { online: true, feedPressure_bar: P1, feedFlowPerVessel_m3h: Qv1 };
  const truth = solveTrainRef(env, sp1, state);
  if (truth.permeateFlow_m3h <= 1) return null;
  const meas = measureTrain(truth, rng);
  const phys = solveTrain0D(env, sp1, theta);
  if (phys.permeateFlow_m3h <= 1) return null;
  const nom = solveTrain0D(env, sp1, NOMINAL_THETA());

  return {
    split,
    ood_type: ood,
    profile,
    fouling_mean: meanFouling(state),
    salt_ageing: saltAgeing,
    pump_wear: wear,
    P1_bar: P1,
    Qv1_m3h: Qv1,
    Cf_gL: Cf,
    T_C: T,
    P0_bar: P0,
    Qv0_m3h: Qv0,
    Cf0_gL: Cf0,
    T0_C: T0,
    query,
    A25: theta.A25,
    B25: theta.B25,
    kdp: theta.kdp,
    eta: theta.pumpEff,
    r_phys: phys.recovery,
    J_phys: phys.avgFlux_LMH,
    Cp_phys_mgL: phys.permeateTDS_mgL,
    dP_phys_bar: phys.vesselDP_bar,
    Qp_phys: phys.permeateFlow_m3h,
    Pow_phys: phys.roPower_kW,
    Qp_nom: nom.permeateFlow_m3h,
    Cp_nom: nom.permeateTDS_mgL,
    dP_nom: nom.vesselDP_bar,
    Pow_nom: nom.roPower_kW,
    Qp0_m3h: m0.permeateFlow_m3h,
    Cp0_mgL: m0.permeateTDS_mgL,
    dP0_bar: m0.vesselDP_bar,
    Pow0_kW: m0.roPower_kW,
    Qp_true: truth.permeateFlow_m3h,
    Cp_true: truth.permeateTDS_mgL,
    dP_true: truth.vesselDP_bar,
    Pow_true: truth.roPower_kW,
    Qp_meas: meas.permeateFlow_m3h,
    Cp_meas: meas.permeateTDS_mgL,
    dP_meas: meas.vesselDP_bar,
    Pow_meas: meas.roPower_kW,
    motor_limited: truth.motorLimited ? 1 : 0,
  };
}

/**
 * Fit the twin's lumped degradation model (docs/MODEL.md §6.2) on synthetic
 * operating history. The reference plant is run for 72 h at a grid of
 * constant operating points with elevated fouling; at every hour the lumped
 * effective fouling seen by the twin, φ_eff = 1 − Â25/Â25,clean (noise-free 0D
 * calibration at the same point), is recorded. Least squares then gives
 *   κ̂        from  Δφ_eff/Δt = κ̂ · m · (J/J_ref)² · (1 − φ_eff/φ_max)
 *   dpGain   from  k̂_dp/k̂_dp,clean − 1 = dpGain · φ_eff
 *   saltGain from  B̂/B̂_clean − 1     = saltGain · φ_eff
 */
function fitDegradation() {
  const env = envOf(PLANT.design.salinity_gL, PLANT.design.temperature_C);
  const M = 40; // fouling-rate multiplier used to generate a measurable history
  let num = 0;
  let den = 0;
  let dpNum = 0;
  let saltNum = 0;
  let phiDen = 0;
  const points: { P: number; Qv: number; flux: number; phiEff: number }[] = [];
  for (const P of [58, 61, 64, 67, 70]) {
    for (const Qv of [8, 9.6, 11.5]) {
      const sp = { online: true, feedPressure_bar: P, feedFlowPerVessel_m3h: Qv };
      const clean = calibrate0D(env, solveTrainRef(env, sp, makeState(new Rng(1), 0, "bio", 1, 0)));
      if (!clean) continue;
      let state = makeState(new Rng(1), 0.02, "bio", 1, 0);
      const effOf = (st: TrainTrueState) => {
        const o = solveTrainRef(env, sp, st);
        const th = calibrate0D(env, o)!;
        return { o, th, phi: 1 - th.A25 / clean.A25 };
      };
      let cur = effOf(state);
      for (let h = 0; h < 72; h++) {
        state = stepFouling(state, cur.o.elementFlux_LMH, 1, M, 1);
        const next = effOf(state);
        const x = M * Math.pow(cur.o.avgFlux_LMH / REF.foulingRefFlux_LMH, 2) * (1 - cur.phi / REF.foulingMax);
        num += x * (next.phi - cur.phi);
        den += x * x;
        dpNum += next.phi * (next.th.kdp / clean.kdp - 1);
        saltNum += next.phi * (next.th.B25 / clean.B25 - 1);
        phiDen += next.phi * next.phi;
        cur = next;
      }
      points.push({ P, Qv, flux: +cur.o.avgFlux_LMH.toFixed(2), phiEff: +cur.phi.toFixed(4) });
    }
  }
  return { kappa_h: num / den, dpGain: dpNum / phiDen, saltGain: saltNum / phiDen, points };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rng = new Rng(DATASET_SEED);
  const rows: Row[] = [];
  const t0 = Date.now();
  let rejected = 0;
  for (const split of Object.keys(SPLITS) as Split[]) {
    const n = SPLITS[split];
    const sr = rng.fork(split.length * 7919 + split.charCodeAt(0));
    let made = 0;
    while (made < n) {
      const r = sampleRow(sr, split);
      if (!r) {
        rejected++;
        continue;
      }
      rows.push(r);
      made++;
    }
    console.log(`${split}: ${n} rows (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  const cols = Object.keys(rows[0]) as (keyof Row)[];
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => (typeof r[c] === "number" ? (r[c] as number).toPrecision(10) : r[c])).join(","));
  const csv = lines.join("\n") + "\n";
  const file = join(OUT_DIR, small ? "dataset_small.csv.gz" : "dataset.csv.gz");
  writeFileSync(file, gzipSync(Buffer.from(csv)));

  const deg = fitDegradation();
  const degradation = {
    ...DEFAULT_DEGRADATION,
    kappa_h: deg.kappa_h,
    dpGain: deg.dpGain,
    saltGain: deg.saltGain,
    fitted_on: "reference-plant history, 15 operating points × 72 h, biofouling profile, noise-free 0D calibration",
    points: deg.points,
  };
  const spec = {
    seed: DATASET_SEED,
    created: new Date().toISOString(),
    splits: SPLITS,
    rejectedSamples: rejected,
    hybrid_features: HYBRID_FEATURES,
    mlonly_features: MLONLY_FEATURES,
    ood_features: OOD_FEATURES,
    envelope: { Cf_gL: [36, 48], T_C: [18, 36], fouling_mean: [0, 0.3], P_bar: [52, 73], Qv_m3h: [6.5, 14] },
    ood_envelope: { Cf_gL: [48.5, 54], T_C: [36.5, 40], fouling_mean: [0.32, 0.45] },
    plant: { vesselsPerTrain: PLANT.vesselsPerTrain, elementsPerVessel: ELEMENT.elementsPerVessel, A25_clean: MEMBRANE.A25_clean },
    degradation,
  };
  writeFileSync(join(OUT_DIR, "feature_spec.json"), JSON.stringify(spec, null, 2));
  mkdirSync(join(ROOT, "public", "data", "models"), { recursive: true });
  writeFileSync(join(ROOT, "public", "data", "models", "degradation.json"), JSON.stringify(degradation, null, 2));
  console.log(
    `wrote ${rows.length} rows → ${file} (${rejected} infeasible samples resampled); κ̂ = ${deg.kappa_h.toExponential(3)} h⁻¹, dpGain = ${deg.dpGain.toFixed(3)}, saltGain = ${deg.saltGain.toFixed(3)}`,
  );
  void dirname;
}

main();
