/**
 * AquaTwin: the hybrid digital twin of one plant (docs/MODEL.md §4–5).
 *
 *  physics   – reduced-order 0D model with self-calibrated parameters θ̂
 *  mlonly    – gradient-boosted trees mapping inputs + recent measurements to outputs
 *  hybrid    – physics prediction corrected by an ML residual model
 *
 * The estimator continuously re-identifies θ̂ = {A25, B25, k_dp, η} for each
 * train from telemetry (self-calibration). Health is normalised permeability:
 * the calibrated A25 divided by the A25 expected for a clean membrane at the
 * same operating conditions.
 */

import { ELEMENT, INITIAL_TRAIN_FOULING, LIMITS, PLANT, TRAIN_AREA_m2 } from "./config";
import { calibrate0D, solveTrain0D, VESSEL_AREA_m2 } from "./physics0d";
import { assessOod, conformalHalfWidth, extrapolationDistance, HYBRID_FEATURES, MLONLY_FEATURES, OOD_FEATURES, type MlBundle, type OodResult, type Target } from "./ml";
import { aggregate } from "./plant";
import { makeTrainState, solveTrainRef, REF, trainPowerRatingRef } from "./referencePlant";
import type { Environment, PlantSnapshot, TrainMeasurement, TrainOutputs, TrainSetpoint, TrainTrueState, TwinParams } from "./types";

export type ModelKind = "physics" | "mlonly" | "hybrid";

export const MODEL_LABEL: Record<ModelKind, string> = {
  physics: "Physics only",
  mlonly: "ML only",
  hybrid: "AquaTwin hybrid",
};

/** What the twin knows about one train at decision time. */
export interface TrainContext {
  theta: TwinParams;
  /** Operating point at which θ̂ was identified. */
  u0: { P: number; Qv: number };
  /** Seawater conditions at which θ̂ was identified. */
  env0: { Cf: number; T: number };
  /** Smoothed measurements at u0 (used by the ML-only model). */
  meas0: { Qp: number; Cp: number; dP: number; Pow: number };
}

export interface TrainPrediction {
  out: TrainOutputs;
  physics: TrainOutputs;
  residual: Record<Target, number> | null;
  ood: OodResult | null;
  /** 90 % conformal half-widths for this prediction (residual space), or null without a model bundle. */
  margins: Record<Target, number> | null;
}

export interface PlantPrediction {
  trains: TrainPrediction[];
  snapshot: PlantSnapshot;
  confidence: number;
  worstOod: OodResult | null;
}

// ---------------------------------------------------------------------------
// Commissioning baseline: θ identified on a clean membrane at the design point.
// ---------------------------------------------------------------------------

export const DESIGN_ENV: Environment = {
  salinity_gL: PLANT.design.salinity_gL,
  temperature_C: PLANT.design.temperature_C,
  turbidity_NTU: 2,
  pH: 8.1,
  foulingPotential: 1,
  intakeCapacity: 1,
};

export const DESIGN_SETPOINT: TrainSetpoint = {
  online: true,
  feedPressure_bar: PLANT.design.feedPressure_bar,
  feedFlowPerVessel_m3h: PLANT.design.feedFlowPerVessel_m3h,
};

let CLEAN_BASELINE: { theta: TwinParams; out: TrainOutputs } | null = null;

/** Parameters of a clean train identified at the design point (noise-free commissioning data). */
export function cleanBaseline(): { theta: TwinParams; out: TrainOutputs } {
  if (!CLEAN_BASELINE) {
    const out = solveTrainRef(DESIGN_ENV, DESIGN_SETPOINT, makeTrainState(0));
    const theta = calibrate0D(DESIGN_ENV, out);
    if (!theta) throw new Error("Commissioning calibration failed");
    CLEAN_BASELINE = { theta, out };
  }
  return CLEAN_BASELINE;
}

/** Rated electrical power of one RO train (HP pump + booster motors), kW. */
export function trainPowerRating(): number {
  return trainPowerRatingRef();
}

// ---------------------------------------------------------------------------
// Predictors
// ---------------------------------------------------------------------------

function fromPrimary(physics: TrainOutputs, env: Environment, sp: TrainSetpoint, Qp: number, CpMgL: number, dP: number, roPower: number): TrainOutputs {
  const Qf = physics.feedFlow_m3h || sp.feedFlowPerVessel_m3h * PLANT.vesselsPerTrain;
  const qp = Math.min(Math.max(Qp, 0), 0.95 * Qf);
  const Qb = Qf - qp;
  const Cp = Math.max(CpMgL, 1) / 1000;
  const Cb = Qb > 0 ? (Qf * env.salinity_gL - qp * Cp) / Qb : env.salinity_gL;
  const scale = physics.roPower_kW > 0 ? roPower / physics.roPower_kW : 1;
  return {
    ...physics,
    permeateFlow_m3h: qp,
    brineFlow_m3h: Qb,
    recovery: Qf > 0 ? qp / Qf : 0,
    permeateTDS_mgL: Math.max(CpMgL, 1),
    brineTDS_gL: Cb,
    avgFlux_LMH: (qp * 1000) / TRAIN_AREA_m2,
    vesselDP_bar: Math.max(dP, 0.05),
    roPower_kW: roPower,
    hpPumpPower_kW: physics.hpPumpPower_kW * scale,
    boosterPower_kW: physics.boosterPower_kW * scale,
    hpPumpEfficiency: physics.hpPumpEfficiency / Math.max(scale, 1e-6),
  };
}

export function hybridFeatureVector(env: Environment, sp: TrainSetpoint, ctx: TrainContext, phys: TrainOutputs): number[] {
  const v = [
    sp.feedPressure_bar,
    sp.feedFlowPerVessel_m3h,
    env.salinity_gL,
    env.temperature_C,
    ctx.u0.P,
    ctx.u0.Qv,
    ctx.env0.Cf,
    ctx.env0.T,
    ctx.theta.A25,
    ctx.theta.B25,
    ctx.theta.kdp,
    ctx.theta.pumpEff,
    phys.recovery,
    phys.avgFlux_LMH,
    phys.permeateTDS_mgL,
    phys.vesselDP_bar,
  ];
  if (v.length !== HYBRID_FEATURES.length) throw new Error("hybrid feature length");
  return v;
}

export function mlonlyFeatureVector(env: Environment, sp: TrainSetpoint, ctx: TrainContext): number[] {
  const v = [
    sp.feedPressure_bar,
    sp.feedFlowPerVessel_m3h,
    env.salinity_gL,
    env.temperature_C,
    ctx.u0.P,
    ctx.u0.Qv,
    ctx.env0.Cf,
    ctx.env0.T,
    ctx.meas0.Qp,
    ctx.meas0.Cp,
    ctx.meas0.dP,
    ctx.meas0.Pow,
  ];
  if (v.length !== MLONLY_FEATURES.length) throw new Error("mlonly feature length");
  return v;
}

export function oodFeatureVector(env: Environment, sp: TrainSetpoint, ctx: TrainContext): number[] {
  const v = [
    env.salinity_gL,
    env.temperature_C,
    ctx.env0.Cf,
    ctx.env0.T,
    sp.feedPressure_bar,
    sp.feedFlowPerVessel_m3h,
    ctx.theta.A25,
    ctx.theta.B25,
    ctx.theta.kdp,
    ctx.theta.pumpEff,
  ];
  if (v.length !== OOD_FEATURES.length) throw new Error("ood feature length");
  return v;
}

export function predictTrain(kind: ModelKind, env: Environment, sp: TrainSetpoint, ctx: TrainContext, bundle: MlBundle | null): TrainPrediction {
  const physics = solveTrain0D(env, sp, ctx.theta);
  if (!sp.online) return { out: physics, physics, residual: null, ood: null, margins: null };
  const ood = bundle ? assessOod(bundle.ood, oodFeatureVector(env, sp, ctx)) : null;
  let margins: Record<Target, number> | null = null;
  if (bundle) {
    const d = extrapolationDistance(sp.feedPressure_bar, sp.feedFlowPerVessel_m3h, ctx.u0.P, ctx.u0.Qv, env.salinity_gL, ctx.env0.Cf, env.temperature_C, ctx.env0.T);
    const c = bundle.conformal;
    margins = {
      Q: conformalHalfWidth(c, kind, "Q", d),
      C: conformalHalfWidth(c, kind, "C", d),
      D: conformalHalfWidth(c, kind, "D", d),
      W: conformalHalfWidth(c, kind, "W", d),
    };
  }

  if (kind === "physics" || !bundle) {
    return { out: physics, physics, residual: null, ood, margins };
  }
  if (kind === "hybrid") {
    if (physics.permeateFlow_m3h <= 0) return { out: physics, physics, residual: null, ood, margins };
    const x = hybridFeatureVector(env, sp, ctx, physics);
    const res = {
      Q: bundle.hybrid.Q.predict(x),
      C: bundle.hybrid.C.predict(x),
      D: bundle.hybrid.D.predict(x),
      W: bundle.hybrid.W.predict(x),
    };
    const out = fromPrimary(
      physics,
      env,
      sp,
      physics.permeateFlow_m3h * (1 + res.Q),
      physics.permeateTDS_mgL * Math.exp(res.C),
      physics.vesselDP_bar + res.D,
      physics.roPower_kW * (1 + res.W),
    );
    return { out, physics, residual: res, ood, margins };
  }
  const x = mlonlyFeatureVector(env, sp, ctx);
  const out = fromPrimary(physics, env, sp, bundle.mlonly.Q.predict(x), bundle.mlonly.C.predict(x), bundle.mlonly.D.predict(x), bundle.mlonly.W.predict(x));
  return { out, physics, residual: null, ood, margins };
}

/**
 * Enforce the train motor rating on a prediction: if the requested pressure
 * needs more power than the motors can deliver, find the highest feasible
 * pressure (what the plant would actually do).
 */
export function predictTrainLimited(kind: ModelKind, env: Environment, sp: TrainSetpoint, ctx: TrainContext, bundle: MlBundle | null): TrainPrediction {
  const rating = trainPowerRating();
  let p = predictTrain(kind, env, sp, ctx, bundle);
  if (!sp.online || p.out.roPower_kW <= rating) return p;
  let lo = PLANT.lpSupplyPressure_bar + 20;
  let hi = sp.feedPressure_bar;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    const q = predictTrain(kind, env, { ...sp, feedPressure_bar: mid }, ctx, bundle);
    if (q.out.roPower_kW > rating) hi = mid;
    else lo = mid;
  }
  p = predictTrain(kind, env, { ...sp, feedPressure_bar: lo }, ctx, bundle);
  p.out = { ...p.out, motorLimited: true };
  return p;
}

export function predictPlant(
  kind: ModelKind,
  env: Environment,
  setpoints: TrainSetpoint[],
  ctxs: TrainContext[],
  bundle: MlBundle | null,
  limitMotors = false,
): PlantPrediction {
  const trains = setpoints.map((sp, i) => (limitMotors ? predictTrainLimited(kind, env, sp, ctxs[i], bundle) : predictTrain(kind, env, sp, ctxs[i], bundle)));
  let confidence = 1;
  let worst: OodResult | null = null;
  if (kind !== "physics") {
    for (const t of trains) {
      if (t.ood && t.ood.confidence < confidence) {
        confidence = t.ood.confidence;
        worst = t.ood;
      }
    }
  }
  const outs = trains.map((t) => t.out);
  return { trains, snapshot: { trains: outs, totals: aggregate(outs, env) }, confidence, worstOod: worst };
}

// ---------------------------------------------------------------------------
// Self-calibration (online estimator)
// ---------------------------------------------------------------------------

export interface EstimatorState {
  theta: TwinParams;
  u0: { P: number; Qv: number };
  env0: { Cf: number; T: number };
  meas0: { Qp: number; Cp: number; dP: number; Pow: number };
  samples: number;
}

/**
 * Exponentially weighted self-calibration of one train. Each new measurement
 * is inverted through the 0D model; parameters, measurements and the
 * calibration conditions are smoothed with factor α (memory ≈ (2−α)/α samples).
 */
export class TrainEstimator {
  state: EstimatorState | null = null;
  constructor(public alpha = 0.3) {}

  /** `alphaOverride` lets callers with a different sample period keep the same time constant. */
  update(env: Environment, m: TrainMeasurement, sp: TrainSetpoint, alphaOverride?: number): EstimatorState | null {
    if (!m.online) return this.state;
    const th = calibrate0D(env, m);
    if (!th) return this.state;
    const Qv = m.feedFlow_m3h / PLANT.vesselsPerTrain;
    const meas = { Qp: m.permeateFlow_m3h, Cp: m.permeateTDS_mgL, dP: m.vesselDP_bar, Pow: m.roPower_kW };
    // A setpoint change re-anchors the calibration operating point faster.
    const moved = this.state && (Math.abs(this.state.u0.P - sp.feedPressure_bar) > 0.3 || Math.abs(this.state.u0.Qv - sp.feedFlowPerVessel_m3h) > 0.1);
    if (!this.state) {
      this.state = {
        theta: th,
        u0: { P: m.feedPressure_bar, Qv },
        env0: { Cf: env.salinity_gL, T: env.temperature_C },
        meas0: meas,
        samples: 1,
      };
      return this.state;
    }
    const base = alphaOverride ?? this.alpha;
    const a = moved ? Math.max(base, 0.6) : base;
    const s = this.state;
    const mix = (o: number, n: number) => o + a * (n - o);
    this.state = {
      theta: {
        A25: mix(s.theta.A25, th.A25),
        B25: mix(s.theta.B25, th.B25),
        kdp: mix(s.theta.kdp, th.kdp),
        pumpEff: mix(s.theta.pumpEff, th.pumpEff),
      },
      u0: { P: mix(s.u0.P, m.feedPressure_bar), Qv: mix(s.u0.Qv, Qv) },
      env0: { Cf: mix(s.env0.Cf, env.salinity_gL), T: mix(s.env0.T, env.temperature_C) },
      meas0: {
        Qp: mix(s.meas0.Qp, meas.Qp),
        Cp: mix(s.meas0.Cp, meas.Cp),
        dP: mix(s.meas0.dP, meas.dP),
        Pow: mix(s.meas0.Pow, meas.Pow),
      },
      samples: s.samples + 1,
    };
    return this.state;
  }

  context(): TrainContext | null {
    const s = this.state;
    return s ? { theta: s.theta, u0: s.u0, env0: s.env0, meas0: s.meas0 } : null;
  }
}

// ---------------------------------------------------------------------------
// Health: normalised performance at standard reference conditions
// ---------------------------------------------------------------------------

/**
 * Normalised performance indicators in the sense of ASTM D4516: the train's
 * performance is re-expressed at fixed standard conditions (design seawater,
 * design pressure and flow) and divided by its post-clean baseline.
 *   NPF  normalised permeate flow        (health; 1 = post-clean baseline)
 *   NSP  normalised salt passage         (> 1 = salt passage increased)
 *   NDP  normalised differential pressure (> 1 = hydraulic resistance increased)
 * Where conventional practice uses empirical correction factors, AquaTwin
 * uses its model: the calibrated twin is queried at the standard conditions.
 */
export interface HealthEstimate {
  health: number;
  nsp: number;
  ndp: number;
  /** Permeate flow the train would deliver at standard conditions, m³/h. */
  qpStd: number;
  /** Clean-baseline permeate flow at standard conditions, m³/h. */
  qpClean: number;
}

export function estimateHealth(ctx: TrainContext, kind: ModelKind, bundle: MlBundle | null): HealthEstimate {
  const base = cleanBaseline().out;
  const std = predictTrain(bundle ? kind : "physics", DESIGN_ENV, DESIGN_SETPOINT, ctx, bundle).out;
  return {
    health: std.permeateFlow_m3h / base.permeateFlow_m3h,
    nsp: std.permeateTDS_mgL / base.permeateTDS_mgL,
    ndp: std.vesselDP_bar / base.vesselDP_bar,
    qpStd: std.permeateFlow_m3h,
    qpClean: base.permeateFlow_m3h,
  };
}

/** Normalised permeate flow implied by a lumped twin fouling state φ̂ (forward mode). */
export function twinHealth(phi: number, p: DegradationParams, bundle: MlBundle | null): number {
  return estimateHealth(contextFromFouling(phi, 0, p), "hybrid", bundle).health;
}

/** Inverse of `twinHealth`: the lumped fouling state that reproduces a given normalised permeate flow. */
export function phiFromHealth(npf: number, p: DegradationParams, bundle: MlBundle | null): number {
  let lo = 0;
  let hi = p.phiMax;
  if (twinHealth(lo, p, bundle) <= npf) return 0;
  for (let i = 0; i < 30; i++) {
    const mid = 0.5 * (lo + hi);
    if (twinHealth(mid, p, bundle) > npf) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Ground-truth normalised indicators of the reference plant (noise-free, at standard conditions). */
export function trueHealth(state: TrainTrueState): { health: number; nsp: number; ndp: number } {
  const base = cleanBaseline().out;
  const o = solveTrainRef(DESIGN_ENV, DESIGN_SETPOINT, { ...state, pumpWear: 0, pumpHeadLoss: 0 });
  return {
    health: o.permeateFlow_m3h / base.permeateFlow_m3h,
    nsp: o.permeateTDS_mgL / base.permeateTDS_mgL,
    ndp: o.vesselDP_bar / base.vesselDP_bar,
  };
}
/**
 * Twin degradation model (lumped):  dφ̂/dt = κ̂ · F · m · (J/J_ref)² · (1 − φ̂/φ_max)
 * κ̂ is fitted on synthetic operating history from the reference plant
 * (scripts/generate-dataset.ts) and shipped with the model bundle.
 */
export interface DegradationParams {
  kappa_h: number;
  refFlux_LMH: number;
  phiMax: number;
  /** ΔP growth per unit fouling in the lumped model. */
  dpGain: number;
  /** Salt-passage growth per unit fouling in the lumped model. */
  saltGain: number;
}

export const DEFAULT_DEGRADATION: DegradationParams = {
  kappa_h: REF.foulingRate_h * 1.9,
  refFlux_LMH: REF.foulingRefFlux_LMH,
  phiMax: REF.foulingMax,
  dpGain: 3.6,
  saltGain: 0.8,
};

export function stepTwinFouling(phi: number, flux_LMH: number, potential: number, multiplier: number, dt_h: number, p: DegradationParams): number {
  const j = flux_LMH / p.refFlux_LMH;
  const rate = p.kappa_h * potential * multiplier * j * j * (1 - phi / p.phiMax);
  return Math.min(p.phiMax, Math.max(0, phi + rate * dt_h));
}

/** θ̂ implied by a lumped fouling state φ̂ (twin forward model). */
export function thetaFromFouling(phi: number, pumpWear: number, p: DegradationParams): TwinParams {
  const b = cleanBaseline().theta;
  return {
    A25: b.A25 * (1 - phi),
    B25: b.B25 * (1 + p.saltGain * phi),
    kdp: b.kdp * (1 + p.dpGain * phi),
    pumpEff: b.pumpEff * (1 - pumpWear),
  };
}

export function contextFromFouling(phi: number, pumpWear: number, p: DegradationParams): TrainContext {
  const base = cleanBaseline();
  return {
    theta: thetaFromFouling(phi, pumpWear, p),
    u0: { P: DESIGN_SETPOINT.feedPressure_bar, Qv: DESIGN_SETPOINT.feedFlowPerVessel_m3h },
    env0: { Cf: DESIGN_ENV.salinity_gL, T: DESIGN_ENV.temperature_C },
    meas0: {
      Qp: base.out.permeateFlow_m3h * (1 - phi),
      Cp: base.out.permeateTDS_mgL * (1 + p.saltGain * phi),
      dP: base.out.vesselDP_bar * (1 + p.dpGain * phi),
      Pow: base.out.roPower_kW,
    },
  };
}

export const INITIAL_FOULING = INITIAL_TRAIN_FOULING;
export const ELEMENTS = ELEMENT;
export const VESSEL_AREA = VESSEL_AREA_m2;
export { LIMITS };
