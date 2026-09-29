/**
 * AquaGuard — deterministic safety layer (docs/MODEL.md §8).
 *
 * Every candidate operating strategy is checked against hard constraints
 * before it can be recommended. The rules are plain comparisons against
 * documented limits; nothing here is learned.
 *   WITHHELD  model confidence below threshold (inputs outside the validated envelope)
 *   REJECTED  at least one hard constraint violated
 *   APPROVED  all constraints satisfied
 */

import { LIMITS, PLANT } from "./config";
import type { PlantSnapshot, TrainSetpoint } from "./types";

export type RuleStatus = "pass" | "warn" | "fail";
export type Verdict = "APPROVED" | "REJECTED" | "WITHHELD";

export interface RuleResult {
  id: string;
  label: string;
  value: number;
  limit: number;
  unit: string;
  cmp: "≤" | "≥";
  status: RuleStatus;
  /** Positive = inside the limit, in the rule's unit. */
  margin: number;
  scope: string;
}

export interface GuardDecision {
  verdict: Verdict;
  rules: RuleResult[];
  reasons: string[];
  confidence: number;
  /** True when rules were checked at the edge of the 90 % prediction interval. */
  uncertaintyAware: boolean;
}

export interface GuardInput {
  snapshot: PlantSnapshot;
  setpoints: TrainSetpoint[];
  prevSetpoints?: TrainSetpoint[];
  minProduction_m3h: number;
  powerCap_kW: number | null;
  confidence: number;
  trainPowerRating_kW: number;
  /** Checks that only make sense for a recommendation (ramp). */
  isRecommendation?: boolean;
  /**
   * Per-train 90 % conformal half-widths. When present, every model-predicted
   * quantity is checked at the conservative edge of its interval
   * (uncertainty-aware constraint satisfaction).
   */
  trainMargins?: (Record<"Q" | "C" | "D" | "W", number> | null)[];
}

const WARN_FRACTION = 0.03;

function rule(id: string, label: string, value: number, limit: number, cmp: "≤" | "≥", unit: string, scope: string): RuleResult {
  const margin = cmp === "≤" ? limit - value : value - limit;
  const tol = Math.abs(limit) * WARN_FRACTION;
  const status: RuleStatus = margin < -1e-9 ? "fail" : margin < tol ? "warn" : "pass";
  return { id, label, value, limit, unit, cmp, status, margin, scope };
}

export function evaluateGuard(input: GuardInput): GuardDecision {
  const { snapshot, setpoints } = input;
  const rules: RuleResult[] = [];
  const online = snapshot.trains.map((t, i) => ({ t, i })).filter(({ t }) => t.online);

  // Per-train equipment limits: report the worst train for each rule.
  const worst = (id: string, label: string, unit: string, cmp: "≤" | "≥", limit: number, f: (i: number) => number) => {
    if (!online.length) return;
    let best: RuleResult | null = null;
    for (const { i } of online) {
      const r = rule(id, label, f(i), limit, cmp, unit, `Train ${i + 1}`);
      if (!best || r.margin < best.margin) best = r;
    }
    if (best) rules.push(best);
  };

  const vessels = PLANT.vesselsPerTrain;
  const mg = (i: number) => input.trainMargins?.[i] ?? { Q: 0, C: 0, D: 0, W: 0 };
  // Conservative (interval-edge) values per train.
  const qpHi = (i: number) => snapshot.trains[i].permeateFlow_m3h * (1 + mg(i).Q);
  const qpLo = (i: number) => snapshot.trains[i].permeateFlow_m3h * (1 - mg(i).Q);
  let saltHi = 0;
  let prodLo = 0;
  let prodCentral = 0;
  let roExtra = 0;
  for (const { t, i } of online) {
    saltHi += t.permeateFlow_m3h * t.permeateTDS_mgL * Math.exp(mg(i).C);
    prodLo += qpLo(i);
    prodCentral += t.permeateFlow_m3h;
    roExtra += t.roPower_kW * mg(i).W;
  }
  const tdsHi = prodCentral > 0 ? saltHi / prodCentral : 0;

  worst("pressure", "Feed pressure", "bar", "≤", LIMITS.maxFeedPressure_bar, (i) => snapshot.trains[i].feedPressure_bar);
  rules.push(rule("tds", "Permeate TDS", tdsHi, LIMITS.maxPermeateTDS_mgL, "≤", "mg/L", "Blended permeate"));
  worst("recovery", "Recovery", "%", "≤", LIMITS.maxRecovery * 100, (i) => (qpHi(i) / snapshot.trains[i].feedFlow_m3h) * 100);
  worst("flux", "Average flux", "LMH", "≤", LIMITS.maxAvgFlux_LMH, (i) => snapshot.trains[i].avgFlux_LMH * (1 + mg(i).Q));
  worst("brine", "Concentrate flow / vessel", "m³/h", "≥", LIMITS.minConcentratePerVessel_m3h, (i) => (snapshot.trains[i].feedFlow_m3h - qpHi(i)) / vessels);
  worst("feedflow", "Feed flow / vessel", "m³/h", "≤", LIMITS.maxFeedPerVessel_m3h, (i) => snapshot.trains[i].feedFlow_m3h / vessels);
  worst("dp", "Vessel ΔP", "bar", "≤", LIMITS.maxVesselDP_bar, (i) => snapshot.trains[i].vesselDP_bar + mg(i).D);
  worst("motor", "Train power vs rating", "kW", "≤", input.trainPowerRating_kW, (i) => snapshot.trains[i].roPower_kW * (1 + mg(i).W));
  rules.push(rule("production", "Production vs minimum", prodLo, input.minProduction_m3h, "≥", "m³/h", "Plant"));
  if (input.powerCap_kW !== null) {
    rules.push(rule("powercap", "Plant power vs cap", snapshot.totals.power_kW + roExtra, input.powerCap_kW, "≤", "kW", "Plant"));
  }
  if (input.isRecommendation && input.prevSetpoints) {
    let maxRamp = 0;
    setpoints.forEach((sp, i) => {
      const prev = input.prevSetpoints![i];
      if (sp.online && prev?.online) maxRamp = Math.max(maxRamp, Math.abs(sp.feedPressure_bar - prev.feedPressure_bar));
    });
    rules.push(rule("ramp", "Pressure change per hour", maxRamp, LIMITS.maxPressureRamp_bar_per_h, "≤", "bar/h", "Setpoint"));
  }
  rules.push(rule("confidence", "Model confidence", input.confidence * 100, LIMITS.minConfidence * 100, "≥", "%", "Twin"));

  const fails = rules.filter((r) => r.status === "fail");
  const reasons = fails.map((r) => describeFailure(r));
  let verdict: Verdict = "APPROVED";
  if (input.confidence < LIMITS.minConfidence) verdict = "WITHHELD";
  else if (fails.length) verdict = "REJECTED";
  return { verdict, rules, reasons, confidence: input.confidence, uncertaintyAware: !!input.trainMargins?.some((m) => m) };
}

export function describeFailure(r: RuleResult): string {
  const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
  if (r.id === "confidence") {
    return `Model confidence ${fmt(r.value)}% is below ${fmt(r.limit)}% — inputs are outside the validated envelope.`;
  }
  const dir = r.cmp === "≤" ? "exceeds" : "is below";
  return `${r.label} ${fmt(r.value)} ${r.unit} ${dir} the ${fmt(r.limit)} ${r.unit} limit (${r.scope}).`;
}

/** Constraint ids violated by a snapshot of the (true) plant, used for experiment scoring. */
export function trueViolations(snapshot: PlantSnapshot, reservoirFraction: number, powerCap_kW: number | null): string[] {
  const v: string[] = [];
  const vessels = PLANT.vesselsPerTrain;
  if (snapshot.totals.permeateTDS_mgL > LIMITS.maxPermeateTDS_mgL) v.push("tds");
  for (const t of snapshot.trains) {
    if (!t.online) continue;
    if (t.feedPressure_bar > LIMITS.maxFeedPressure_bar + 1e-6) v.push("pressure");
    if (t.recovery > LIMITS.maxRecovery) v.push("recovery");
    if (t.avgFlux_LMH > LIMITS.maxAvgFlux_LMH) v.push("flux");
    if (t.brineFlow_m3h / vessels < LIMITS.minConcentratePerVessel_m3h) v.push("brine");
    if (t.feedFlow_m3h / vessels > LIMITS.maxFeedPerVessel_m3h) v.push("feedflow");
    if (t.vesselDP_bar > LIMITS.maxVesselDP_bar) v.push("dp");
  }
  if (reservoirFraction < LIMITS.minReservoirFraction) v.push("reservoir");
  if (powerCap_kW !== null && snapshot.totals.power_kW > powerCap_kW * 1.001) v.push("powercap");
  return Array.from(new Set(v));
}

export const VIOLATION_LABEL: Record<string, string> = {
  tds: "Permeate quality",
  pressure: "Pressure limit",
  recovery: "Recovery limit",
  flux: "Flux limit",
  brine: "Concentrate flow",
  feedflow: "Vessel feed flow",
  dp: "Vessel ΔP",
  reservoir: "Reservoir minimum",
  powercap: "Power cap",
};
