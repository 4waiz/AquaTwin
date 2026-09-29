/**
 * Operating-strategy optimisation (docs/MODEL.md §7.2).
 *
 * At each decision epoch AquaTwin enumerates candidate strategies
 *   (common feed pressure P, common feed flow per vessel Q_v, allocation of the
 *    "focus" train: normal / −3 bar / −6 bar / offline),
 * predicts the plant response of each with its model, screens every candidate
 * through AquaGuard, and ranks the admissible ones by a weighted sum of
 * objectives with fixed reference scales:
 *   energy (SEC), water quality (permeate TDS), production tracking,
 *   membrane stress (envelope utilisation), fouling / CIP impact.
 * The Pareto set in the (SEC, stress) plane is reported for visualisation.
 */

import { LIMITS, PLANT } from "./config";
import { evaluateGuard, type GuardDecision } from "./aquaguard";
import type { MlBundle } from "./ml";
import { aggregate } from "./plant";
import {
  predictTrain,
  stepTwinFouling,
  trainPowerRating,
  type DegradationParams,
  type ModelKind,
  type PlantPrediction,
  type TrainContext,
  type TrainPrediction,
} from "./twin";
import type { Environment, TrainOutputs, TrainSetpoint } from "./types";

export type FocusMode = "normal" | "derate3" | "derate6" | "offline";

export const FOCUS_LABEL: Record<FocusMode, string> = {
  normal: "All trains equal",
  derate3: "Focus train −3 bar",
  derate6: "Focus train −6 bar",
  offline: "Focus train offline",
};

export interface Objectives {
  sec_kWh_m3: number;
  tds_mgL: number;
  production_m3h: number;
  productionGap: number;
  stress: number;
  fouling_pct_h: number;
  power_kW: number;
  recovery: number;
  maxPressure_bar: number;
}

export interface Candidate {
  id: number;
  P: number;
  Qv: number;
  focusTrain: number | null;
  focusMode: FocusMode;
  setpoints: TrainSetpoint[];
  prediction: PlantPrediction;
  guard: GuardDecision;
  objectives: Objectives;
  score: number;
  feasible: boolean;
  pareto: boolean;
  isCurrent: boolean;
}

export interface ObjectiveWeights {
  energy: number;
  quality: number;
  production: number;
  stress: number;
  fouling: number;
}

/**
 * Default operator preference: energy first; production tracking; membrane
 * protection mainly through the fouling term (which only becomes large during
 * fouling events). Weights are editable on the Optimization page.
 */
export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  energy: 0.35,
  quality: 0.1,
  production: 0.25,
  stress: 0.1,
  fouling: 0.2,
};

/** Reference scales: what counts as a "unit" of each objective in the score. */
export const OBJECTIVE_SCALES = {
  sec: 0.1, // kWh/m³
  tds: 100, // mg/L
  gap: 0.03, // fractional production error
  stress: 0.1,
  fouling: 0.05, // % permeability per hour
} as const;

export interface OptimizationInput {
  kind: ModelKind;
  env: Environment;
  ctxs: TrainContext[];
  bundle: MlBundle | null;
  prevSetpoints: TrainSetpoint[];
  productionTarget_m3h: number;
  minProduction_m3h: number;
  maxProduction_m3h: number;
  powerCap_kW: number | null;
  foulingMultipliers: number[];
  degradation: DegradationParams;
  /** Current lumped fouling estimate per train, used for the fouling objective. */
  foulingState: number[];
  focusTrain: number | null;
  weights?: ObjectiveWeights;
  /**
   * Feed conditions extrapolated to the end of the decision interval from the
   * measured trend. When given, the chosen strategy must also satisfy every
   * hard limit there (look-ahead), not only under present conditions.
   */
  envAhead?: Environment | null;
  /** Grid resolution (for tests / UI). */
  grid?: { P: number[]; Qv: number[] };
}

export interface OptimizationResult {
  candidates: Candidate[];
  best: Candidate | null;
  current: Candidate;
  verdict: GuardDecision["verdict"];
  message: string;
  /** True when the minimum-production service target had to be relaxed. */
  relaxed?: boolean;
}

export const DEFAULT_GRID = {
  P: range(54, 72, 1.5),
  Qv: range(7, 13, 0.5),
};

function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let x = a; x <= b + 1e-9; x += step) out.push(Math.round(x * 100) / 100);
  return out;
}

/** Envelope-utilisation stress index of one train (0 = idle, 1 = every limit reached). */
export function trainStress(t: TrainOutputs): number {
  if (!t.online) return 0;
  return (
    0.35 * (t.avgFlux_LMH / LIMITS.maxAvgFlux_LMH) +
    0.25 * (t.feedPressure_bar / LIMITS.maxFeedPressure_bar) +
    0.2 * (t.recovery / LIMITS.maxRecovery) +
    0.2 * (t.vesselDP_bar / LIMITS.maxVesselDP_bar)
  );
}

export function buildSetpoints(P: number, Qv: number, focusTrain: number | null, mode: FocusMode): TrainSetpoint[] {
  return Array.from({ length: PLANT.nTrains }, (_, i) => {
    if (focusTrain === i) {
      if (mode === "offline") return { online: false, feedPressure_bar: 0, feedFlowPerVessel_m3h: 0 };
      const d = mode === "derate3" ? 3 : mode === "derate6" ? 6 : 0;
      return { online: true, feedPressure_bar: P - d, feedFlowPerVessel_m3h: Qv };
    }
    return { online: true, feedPressure_bar: P, feedFlowPerVessel_m3h: Qv };
  });
}

function objectivesOf(pred: PlantPrediction, input: OptimizationInput): Objectives {
  const tot = pred.snapshot.totals;
  let stress = 0;
  let foul = 0;
  let maxP = 0;
  pred.snapshot.trains.forEach((t, i) => {
    stress = Math.max(stress, trainStress(t));
    if (t.online) {
      maxP = Math.max(maxP, t.feedPressure_bar);
      const phi = input.foulingState[i] ?? 0;
      const next = stepTwinFouling(phi, t.avgFlux_LMH, input.env.foulingPotential, input.foulingMultipliers[i] ?? 1, 1, input.degradation);
      foul += (next - phi) * 100;
    }
  });
  const target = Math.max(input.productionTarget_m3h, 1);
  return {
    sec_kWh_m3: tot.sec_kWh_m3,
    tds_mgL: tot.permeateTDS_mgL,
    production_m3h: tot.production_m3h,
    productionGap: Math.abs(tot.production_m3h - target) / target,
    stress,
    fouling_pct_h: foul,
    power_kW: tot.power_kW,
    recovery: tot.recovery,
    maxPressure_bar: maxP,
  };
}

function scoreOf(o: Objectives, w: ObjectiveWeights): number {
  const s = OBJECTIVE_SCALES;
  return (
    (w.energy * o.sec_kWh_m3) / s.sec +
    (w.quality * o.tds_mgL) / s.tds +
    (w.production * o.productionGap) / s.gap +
    (w.stress * o.stress) / s.stress +
    (w.fouling * o.fouling_pct_h) / s.fouling
  );
}

/**
 * Move suppression (standard MPC practice): a small cost for changing
 * setpoints and a larger one for switching trains on/offline, so near-equal
 * candidates do not make the plant chatter between operating points.
 */
export const MOVE_COST = { perBar: 0.012, perVesselFlow: 0.03, perSwitch: 0.15 } as const;

function moveCost(sps: TrainSetpoint[], prev: TrainSetpoint[]): number {
  let dP = 0;
  let dQ = 0;
  let switches = 0;
  sps.forEach((sp, i) => {
    const p = prev[i];
    if (!p) return;
    if (sp.online !== p.online) switches++;
    else if (sp.online) {
      dP = Math.max(dP, Math.abs(sp.feedPressure_bar - p.feedPressure_bar));
      dQ = Math.max(dQ, Math.abs(sp.feedFlowPerVessel_m3h - p.feedFlowPerVessel_m3h));
    }
  });
  return MOVE_COST.perBar * dP + (MOVE_COST.perVesselFlow * dQ) / 0.5 + MOVE_COST.perSwitch * switches;
}

/** Per-train prediction cache: focus-train variants change one train only. */
type TrainCache = Map<string, TrainPrediction>;

function predictCached(input: OptimizationInput, setpoints: TrainSetpoint[], cache: TrainCache): PlantPrediction {
  const trains = setpoints.map((sp, i) => {
    const key = `${i}|${sp.online ? 1 : 0}|${sp.feedPressure_bar}|${sp.feedFlowPerVessel_m3h}`;
    let p = cache.get(key);
    if (!p) {
      p = predictTrain(input.kind, input.env, sp, input.ctxs[i], input.bundle);
      cache.set(key, p);
    }
    return p;
  });
  let confidence = 1;
  let worst: PlantPrediction["worstOod"] = null;
  if (input.kind !== "physics") {
    for (const t of trains) {
      if (t.ood && t.ood.confidence < confidence) {
        confidence = t.ood.confidence;
        worst = t.ood;
      }
    }
  }
  const outs = trains.map((t) => t.out);
  return { trains, snapshot: { trains: outs, totals: aggregate(outs, input.env) }, confidence, worstOod: worst };
}

function evaluate(
  id: number,
  P: number,
  Qv: number,
  focusTrain: number | null,
  mode: FocusMode,
  setpoints: TrainSetpoint[],
  input: OptimizationInput,
  isCurrent: boolean,
  cache: TrainCache,
): Candidate {
  const pred = predictCached(input, setpoints, cache);
  const guard = evaluateGuard({
    snapshot: pred.snapshot,
    setpoints,
    prevSetpoints: input.prevSetpoints,
    minProduction_m3h: input.minProduction_m3h,
    powerCap_kW: input.powerCap_kW,
    confidence: pred.confidence,
    trainPowerRating_kW: trainPowerRating(),
    isRecommendation: !isCurrent,
    trainMargins: pred.trains.map((t) => t.margins),
  });
  const objectives = objectivesOf(pred, input);
  const overMax = objectives.production_m3h > input.maxProduction_m3h * 1.001;
  const feasible = guard.verdict === "APPROVED" && !overMax;
  return {
    id,
    P,
    Qv,
    focusTrain,
    focusMode: mode,
    setpoints,
    prediction: pred,
    guard,
    objectives,
    score: scoreOf(objectives, input.weights ?? DEFAULT_WEIGHTS) + (isCurrent ? 0 : moveCost(setpoints, input.prevSetpoints)),
    feasible,
    pareto: false,
    isCurrent,
  };
}

/** Does a strategy still satisfy every hard limit if the measured feed trend continues to the end of the interval? */
function holdsAhead(c: Candidate, input: OptimizationInput): boolean {
  const env = input.envAhead;
  if (!env) return true;
  const trains = c.setpoints.map((sp, i) => predictTrain(input.kind, env, sp, input.ctxs[i], input.bundle));
  const outs = trains.map((t) => t.out);
  const guard = evaluateGuard({
    snapshot: { trains: outs, totals: aggregate(outs, env) },
    setpoints: c.setpoints,
    minProduction_m3h: 0, // the service target is re-planned at the next decision
    powerCap_kW: input.powerCap_kW,
    confidence: 1, // model confidence is judged on present inputs
    trainPowerRating_kW: trainPowerRating(),
    trainMargins: trains.map((t) => t.margins),
  });
  return guard.rules.every((r) => r.status !== "fail");
}

export function optimize(input: OptimizationInput): OptimizationResult {
  const grid = input.grid ?? DEFAULT_GRID;
  const modes: FocusMode[] = input.focusTrain === null ? ["normal"] : ["normal", "derate3", "derate6", "offline"];
  const candidates: Candidate[] = [];
  const cache: TrainCache = new Map();
  let id = 0;
  for (const mode of modes) {
    for (const P of grid.P) {
      for (const Qv of grid.Qv) {
        const sps = buildSetpoints(P, Qv, input.focusTrain, mode);
        candidates.push(evaluate(id++, P, Qv, input.focusTrain, mode, sps, input, false, cache));
      }
    }
  }
  const prev = input.prevSetpoints;
  const refOnline = prev.find((s) => s.online) ?? prev[0];
  const current = evaluate(-1, refOnline.feedPressure_bar, refOnline.feedFlowPerVessel_m3h, null, "normal", prev, input, true, cache);

  // Pareto set over (SEC, stress) among admissible candidates.
  const feasible = candidates.filter((c) => c.feasible);
  for (const c of feasible) {
    c.pareto = !feasible.some(
      (d) =>
        d !== c &&
        d.objectives.sec_kWh_m3 <= c.objectives.sec_kWh_m3 &&
        d.objectives.stress <= c.objectives.stress &&
        (d.objectives.sec_kWh_m3 < c.objectives.sec_kWh_m3 || d.objectives.stress < c.objectives.stress),
    );
  }

  const confidence = current.prediction.confidence;
  if (confidence < LIMITS.minConfidence) {
    return {
      candidates,
      best: null,
      current,
      verdict: "WITHHELD",
      message: "Low model confidence — recommendation withheld. Operator review required.",
    };
  }
  if (!feasible.length) {
    // Minimum production is a service target, not a safety limit. If no
    // candidate can meet it, take the highest production that satisfies every
    // safety rule (equipment, quality, power cap, confidence).
    const safe = candidates.filter(
      (c) =>
        c.guard.verdict !== "WITHHELD" &&
        c.objectives.production_m3h <= input.maxProduction_m3h * 1.001 &&
        c.guard.rules.every((r) => r.status !== "fail" || r.id === "production"),
    );
    if (safe.length) {
      const best = safe.reduce((a, b) => (b.objectives.production_m3h > a.objectives.production_m3h ? b : a));
      return {
        candidates,
        best,
        current,
        verdict: "APPROVED",
        message: "Minimum production cannot be met safely — AquaTwin maximises production within every safety limit.",
        relaxed: true,
      };
    }
    return {
      candidates,
      best: null,
      current,
      verdict: "REJECTED",
      message: "No candidate strategy satisfies every AquaGuard constraint. Operator review required.",
    };
  }
  // Holding the current setpoints is always an option when it is admissible.
  const pool = current.feasible ? [...feasible, current] : feasible;
  const ranked = [...pool].sort((a, b) => a.score - b.score);
  // Look-ahead: take the best-scoring strategy that also holds if the measured
  // feed trend continues through the decision interval.
  const ahead = input.envAhead ? ranked.find((c) => holdsAhead(c, input)) : ranked[0];
  const best = ahead ?? ranked[0];
  return {
    candidates,
    best,
    current,
    verdict: "APPROVED",
    message: !ahead
      ? "Recommended strategy passes every AquaGuard constraint now, but none holds if the current feed trend continues for the full interval. Operator attention advised."
      : best === current
        ? "Current strategy remains the best admissible option."
        : "Recommended strategy passes every AquaGuard constraint.",
  };
}
