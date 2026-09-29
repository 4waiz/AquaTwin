/**
 * Twin visual state: what the 3D model shows, derived from either live
 * telemetry or a Scenario Lab time step. This is the only bridge between the
 * simulation and the renderer; intro animation lives elsewhere and only
 * multiplies these values while the plant is coming online.
 */
import { LIMITS, PLANT } from "@/sim/config";
import type { LiveSnapshot, ScenarioPoint } from "@/runtime/protocol";

export type Tone = "ok" | "warn" | "crit" | "off";

export interface TwinVisualState {
  intakeFlow: number;
  hpFlow: number[];
  permeateFlow: number[];
  brineFlow: number[];
  pressureRel: number[];
  pumpSpeed: number[];
  pumpTone: Tone[];
  pumpRing: number[];
  trainTone: Tone[];
  trainOnline: boolean[];
  intakeTone: Tone;
  pretreatTone: Tone;
  productTone: Tone;
  brineTone: Tone;
  salinityRel: number;
  turbidity: number;
  productLevel: number;
  pretreatLevel: number;
  constrained: boolean;
}

const DESIGN_FEED = PLANT.vesselsPerTrain * PLANT.design.feedFlowPerVessel_m3h;
const DESIGN_PERM = 800;
const DESIGN_BRINE = DESIGN_FEED - DESIGN_PERM;
const NOMINAL_EFF = 0.8;

export const DEFAULT_VISUAL: TwinVisualState = {
  intakeFlow: 1,
  hpFlow: [1, 1, 1],
  permeateFlow: [1, 1, 1],
  brineFlow: [1, 1, 1],
  pressureRel: [1, 1, 1],
  pumpSpeed: [1, 1, 1],
  pumpTone: ["ok", "ok", "ok"],
  pumpRing: [0, 0, 0],
  trainTone: ["ok", "ok", "ok"],
  trainOnline: [true, true, true],
  intakeTone: "ok",
  pretreatTone: "ok",
  productTone: "ok",
  brineTone: "ok",
  salinityRel: 1,
  turbidity: 2,
  productLevel: 0.6,
  pretreatLevel: 0.85,
  constrained: false,
};

function envTones(salinity: number, turbidity: number) {
  const salRel = salinity / PLANT.design.salinity_gL;
  const intake: Tone = turbidity > 20 ? "crit" : turbidity > 6 || salRel > 1.07 ? "warn" : "ok";
  const pretreat: Tone = turbidity > 20 ? "crit" : turbidity > 6 ? "warn" : "ok";
  return { salRel, intake, pretreat };
}

function reservoirTone(frac: number): Tone {
  return frac < LIMITS.minReservoirFraction ? "crit" : frac < LIMITS.minReservoirFraction + 0.1 ? "warn" : "ok";
}

export function fromLive(s: LiveSnapshot, pumpEffBaseline: number[] = [0.838, 0.838, 0.838]): TwinVisualState {
  const e = envTones(s.env.salinity_gL, s.env.turbidity_NTU);
  const feedTotal = s.trains.reduce((a, t) => a + (t.online ? t.feedFlow_m3h : 0), 0);
  const failTrain = new Set(s.guard.rules.filter((r) => r.status === "fail" && r.scope.startsWith("Train")).map((r) => Number(r.scope.slice(6)) - 1));
  return {
    intakeFlow: feedTotal / (3 * DESIGN_FEED),
    hpFlow: s.trains.map((t) => (t.online ? t.feedFlow_m3h / DESIGN_FEED : 0)),
    permeateFlow: s.trains.map((t) => (t.online ? t.permeateFlow_m3h / DESIGN_PERM : 0)),
    brineFlow: s.trains.map((t) => (t.online ? t.brineFlow_m3h / DESIGN_BRINE : 0)),
    pressureRel: s.trains.map((t) => (t.online ? t.feedPressure_bar / PLANT.design.feedPressure_bar : 0)),
    pumpSpeed: s.trains.map((t) => (t.online ? t.pumpSpeedRel : 0)),
    pumpTone: s.trains.map((t, i) => (!t.online ? "off" : t.motorLimited || s.theta[i].pumpEff < 0.95 * pumpEffBaseline[i] ? "warn" : "ok")),
    pumpRing: s.trains.map((t, i) => (t.online && (t.motorLimited || s.theta[i].pumpEff < 0.95 * pumpEffBaseline[i]) ? 1 : 0)),
    trainTone: s.trains.map((t, i) => {
      if (!t.online) return "off";
      if (failTrain.has(i)) return "crit";
      const h = s.health[i].npf;
      const tr = s.healthTrend[i];
      if (h < 0.93 || (tr.hours !== null && tr.hours < 24)) return "warn";
      return "ok";
    }),
    trainOnline: s.trains.map((t) => t.online),
    intakeTone: e.intake,
    pretreatTone: e.pretreat,
    productTone: reservoirTone(s.reservoirFraction),
    brineTone: "ok",
    salinityRel: e.salRel,
    turbidity: s.env.turbidity_NTU,
    productLevel: s.reservoirFraction,
    pretreatLevel: 0.86,
    constrained: false,
  };
}

export function fromScenario(p: ScenarioPoint): TwinVisualState {
  const e = envTones(p.salinity, p.turbidity);
  const feedTotal = p.feedFlow.reduce((a, f, i) => a + (p.online[i] ? f : 0), 0);
  const trainViol = p.violations.some((v) => ["pressure", "flux", "dp", "recovery", "brine", "feedflow"].includes(v));
  const tdsViol = p.violations.includes("tds");
  const constrained = p.cap !== null;
  return {
    intakeFlow: feedTotal / (3 * DESIGN_FEED),
    hpFlow: p.feedFlow.map((f, i) => (p.online[i] ? f / DESIGN_FEED : 0)),
    permeateFlow: p.trainProduction.map((q, i) => (p.online[i] ? q / DESIGN_PERM : 0)),
    brineFlow: p.feedFlow.map((f, i) => (p.online[i] ? (f - p.trainProduction[i]) / DESIGN_BRINE : 0)),
    pressureRel: p.pressure.map((x, i) => (p.online[i] ? x / PLANT.design.feedPressure_bar : 0)),
    pumpSpeed: p.pumpSpeed.map((x, i) => (p.online[i] ? x : 0)),
    pumpTone: p.pumpEff.map((eff, i) => (!p.online[i] ? "off" : p.motorLimited[i] || eff < 0.95 * NOMINAL_EFF || constrained ? "warn" : "ok")),
    pumpRing: p.pumpEff.map((eff, i) => (p.online[i] && (p.motorLimited[i] || eff < 0.95 * NOMINAL_EFF || constrained) ? 1 : 0)),
    trainTone: p.health.map((h, i) => {
      if (!p.online[i]) return "off";
      if (trainViol || tdsViol) return "crit";
      if (h < 0.93 || p.motorLimited[i]) return "warn";
      return "ok";
    }),
    trainOnline: [...p.online],
    intakeTone: e.intake,
    pretreatTone: e.pretreat,
    productTone: reservoirTone(p.reservoir / 100),
    brineTone: "ok",
    salinityRel: e.salRel,
    turbidity: p.turbidity,
    productLevel: p.reservoir / 100,
    pretreatLevel: 0.86,
    constrained,
  };
}

/** Interpolate between two scenario points (timeline scrubbing). */
export function lerpPoint(a: ScenarioPoint, b: ScenarioPoint, f: number): ScenarioPoint {
  const L = (x: number, y: number) => x + (y - x) * f;
  const LA = (x: number[], y: number[]) => x.map((v, i) => L(v, y[i]));
  return {
    ...a,
    t: L(a.t, b.t),
    production: L(a.production, b.production),
    demand: L(a.demand, b.demand),
    tds: L(a.tds, b.tds),
    sec: L(a.sec, b.sec),
    power: L(a.power, b.power),
    reservoir: L(a.reservoir, b.reservoir),
    recovery: L(a.recovery, b.recovery),
    pressure: LA(a.pressure, b.pressure),
    feedFlow: LA(a.feedFlow, b.feedFlow),
    trainProduction: LA(a.trainProduction, b.trainProduction),
    trainTds: LA(a.trainTds, b.trainTds),
    health: LA(a.health, b.health),
    dp: LA(a.dp, b.dp),
    pumpSpeed: LA(a.pumpSpeed, b.pumpSpeed),
    pumpEff: LA(a.pumpEff, b.pumpEff),
    salinity: L(a.salinity, b.salinity),
    temperature: L(a.temperature, b.temperature),
    turbidity: L(a.turbidity, b.turbidity),
    pH: L(a.pH, b.pH),
    carbon: L(a.carbon, b.carbon),
  };
}

export function pointAt(points: ScenarioPoint[], t: number): ScenarioPoint | null {
  if (!points.length) return null;
  if (t <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (t >= last.t) return last;
  const dt = points[1].t - points[0].t;
  const i = Math.min(points.length - 2, Math.floor((t - points[0].t) / dt));
  const a = points[i];
  const b = points[i + 1];
  return lerpPoint(a, b, (t - a.t) / (b.t - a.t));
}
