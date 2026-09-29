/**
 * TwinRuntime — everything the interface needs from the simulation layer.
 * Runs inside a Web Worker in the browser (src/runtime/twin.worker.ts) and
 * directly in Node for tests. It owns:
 *   - the simulated plant (reference model + sensors) producing live telemetry,
 *   - AquaTwin's self-calibration, health normalisation and AquaGuard status,
 *   - Scenario Lab forecasts, optimisation snapshots, what-if probes and the
 *     safe-operating-envelope grid.
 */

import { evaluateGuard, type GuardDecision } from "@/sim/aquaguard";
import { extrapolateFeed, runScenario, type RunResult, type StepRecord } from "@/sim/closedLoop";
import { INITIAL_TRAIN_FOULING, LIMITS, PLANT } from "@/sim/config";
import { cleaningStatus } from "@/sim/cleaning";
import { fitTrend, forecastThreshold } from "@/sim/forecast";
import type { MlBundle } from "@/sim/ml";
import { buildSetpoints, DEFAULT_WEIGHTS, optimize, type Candidate, type ObjectiveWeights } from "@/sim/optimizer";
import { planProduction } from "@/sim/planner";
import { aggregate, demandAt } from "@/sim/plant";
import { makeTrainState, measureTrain, solveTrainRef, stepFouling, meanFouling } from "@/sim/referencePlant";
import { Rng } from "@/sim/rng";
import { baseEnvironment, gridCarbonIntensity, SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import {
  cleanBaseline,
  contextFromFouling,
  DESIGN_SETPOINT,
  estimateHealth,
  phiFromHealth,
  predictPlant,
  predictTrain,
  TrainEstimator,
  trainPowerRating,
  trueHealth,
  type DegradationParams,
  type TrainContext,
} from "@/sim/twin";
import type { Environment, TrainOutputs, TrainSetpoint, TrainTrueState } from "@/sim/types";
import type {
  CandidateLite,
  EnvelopeGrid,
  HistoryPoint,
  HybridBreakdown,
  LiveSnapshot,
  OptimizationSnapshot,
  ProbeInput,
  ProbeResult,
  ScenarioBranch,
  ScenarioPoint,
  ScenarioResult,
  TrainHealth,
} from "./protocol";

const HOUR_MS = 3_600_000;
const HISTORY_STEP_MS = 5 * 60_000;
const HISTORY_SPAN_MS = 24 * HOUR_MS;
/** Time constant of the self-calibration filter, hours. */
const CALIBRATION_TAU_h = 0.4;
/**
 * Live simulated plant condition (documented in docs/MODEL.md §10): Train 2
 * carries a developing biofilm, fouling ~20× faster than the other trains, so
 * the live twin has a real degradation trend to detect and forecast.
 */
export const LIVE_FOULING_MULTIPLIER = [1, 20, 1] as const;
/** Window used for the live health-trend fit, hours. */
const TREND_WINDOW_h = 24;

function clockHours(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export class TwinRuntime {
  bundle: MlBundle;
  degradation: DegradationParams;
  simTime: number;
  speed = 1;
  private rng: Rng;
  private states: TrainTrueState[];
  private setpoints: TrainSetpoint[];
  private reservoir: number;
  private estimators: TrainEstimator[];
  history: HistoryPoint[] = [];
  private bucketStart = 0;

  constructor(bundle: MlBundle, degradation: DegradationParams, now = Date.now(), seed = 20261101) {
    this.bundle = bundle;
    this.degradation = degradation;
    this.rng = new Rng(seed);
    this.states = INITIAL_TRAIN_FOULING.map((phi) => makeTrainState(phi));
    this.setpoints = Array.from({ length: PLANT.nTrains }, () => ({ ...DESIGN_SETPOINT }));
    this.reservoir = 0.55 * PLANT.reservoirCapacity_m3;
    this.estimators = Array.from({ length: PLANT.nTrains }, () => new TrainEstimator(0.3));
    this.simTime = now - HISTORY_SPAN_MS;
    this.backfill(now);
  }

  // -------------------------------------------------------------------------
  // Simulated plant
  // -------------------------------------------------------------------------

  private stepPlant(dtMs: number) {
    const dt_h = dtMs / HOUR_MS;
    const clock = clockHours(this.simTime);
    const env = baseEnvironment(clock);
    const outs = this.states.map((s, i) => solveTrainRef(env, this.setpoints[i], s));
    const meas = outs.map((o) => measureTrain(o, this.rng));
    const alpha = 1 - Math.exp(-dt_h / CALIBRATION_TAU_h);
    meas.forEach((m, i) => this.estimators[i].update(env, m, this.setpoints[i], Math.min(Math.max(alpha, 0.002), 0.6)));
    const totals = aggregate(outs, env);
    const demand = demandAt(clock);
    this.reservoir = Math.min(PLANT.reservoirCapacity_m3 * 0.97, Math.max(0, this.reservoir + (totals.production_m3h - demand) * dt_h));
    this.states = this.states.map((s, i) =>
      this.setpoints[i].online ? stepFouling(s, outs[i].elementFlux_LMH, env.foulingPotential, LIVE_FOULING_MULTIPLIER[i], dt_h) : s,
    );
    this.simTime += dtMs;
    return { env, outs, meas, totals, demand, clock };
  }

  private contexts(): TrainContext[] {
    return this.estimators.map((e) => e.context()!);
  }

  private healthNow(): TrainHealth[] {
    return this.contexts().map((c) => {
      const h = estimateHealth(c, "hybrid", this.bundle);
      return { npf: h.health, nsp: h.nsp, ndp: h.ndp, qpStd: h.qpStd, qpClean: h.qpClean };
    });
  }

  private record(step: ReturnType<TwinRuntime["stepPlant"]>, health: TrainHealth[]): HistoryPoint {
    const mTot = aggregate(
      step.meas.map((m, i) => ({ ...step.outs[i], permeateFlow_m3h: m.permeateFlow_m3h, permeateTDS_mgL: m.permeateTDS_mgL })),
      step.env,
    );
    const feedTds = step.env.salinity_gL * 1000;
    return {
      t: this.simTime,
      production: mTot.production_m3h,
      sec: step.totals.sec_kWh_m3,
      tds: mTot.permeateTDS_mgL,
      recovery: mTot.recovery * 100,
      reservoir: (this.reservoir / PLANT.reservoirCapacity_m3) * 100,
      power: step.totals.power_kW,
      salinity: step.env.salinity_gL,
      temperature: step.env.temperature_C,
      turbidity: step.env.turbidity_NTU,
      pH: step.env.pH,
      feedTds,
      rejection: (1 - mTot.permeateTDS_mgL / feedTds) * 100,
      pressure: Math.max(...step.meas.map((m) => m.feedPressure_bar)),
      health: health.map((h) => h.npf),
      nsp: health.map((h) => h.nsp),
      ndp: health.map((h) => h.ndp),
      measuredQp: step.meas.map((m) => m.permeateFlow_m3h),
      expectedQp: health.map((h) => h.qpClean),
      carbon: gridCarbonIntensity(step.clock),
    };
  }

  /** Simulate the last 24 h at 5-minute resolution so charts have history at start-up. */
  private backfill(now: number) {
    // Converge calibration before the recorded window.
    for (let k = 0; k < 12; k++) this.stepPlant(HISTORY_STEP_MS);
    this.simTime = now - HISTORY_SPAN_MS;
    while (this.simTime < now) {
      const step = this.stepPlant(HISTORY_STEP_MS);
      this.history.push(this.record(step, this.healthNow()));
    }
    this.simTime = now;
    this.bucketStart = now;
  }

  /** Advance the live plant by wall-clock `realMs` × speed. Returns a snapshot and possibly a new history point. */
  tick(realMs: number): { snapshot: LiveSnapshot; append?: HistoryPoint } {
    const dtMs = Math.max(1, realMs * this.speed);
    // Integrate in sub-steps of at most 60 s of plant time.
    let remaining = dtMs;
    let step = this.stepPlant(Math.min(remaining, 60_000));
    remaining -= Math.min(remaining, 60_000);
    while (remaining > 0) {
      step = this.stepPlant(Math.min(remaining, 60_000));
      remaining -= Math.min(remaining, 60_000);
    }
    const health = this.healthNow();
    let append: HistoryPoint | undefined;
    if (this.simTime - this.bucketStart >= HISTORY_STEP_MS) {
      append = this.record(step, health);
      this.history.push(append);
      while (this.history.length && this.history[0].t < this.simTime - HISTORY_SPAN_MS) this.history.shift();
      this.bucketStart = this.simTime;
    }
    const snapshot = this.snapshot(step, health);
    return { snapshot, append };
  }

  private snapshot(step: ReturnType<TwinRuntime["stepPlant"]>, healthIn: TrainHealth[]): LiveSnapshot {
    const ctxs = this.contexts();
    // Clean-membrane expectation at the current conditions (for the Membrane Health explanation).
    const cleanCtx = contextFromFouling(0, 0, this.degradation);
    const health = healthIn.map((h, i) => ({
      ...h,
      qpCleanNow: predictTrain("hybrid", step.env, this.setpoints[i], cleanCtx, this.bundle).out.permeateFlow_m3h,
    }));
    const measuredTrains: TrainOutputs[] = step.outs.map((o, i) => ({
      ...o,
      feedPressure_bar: step.meas[i].feedPressure_bar,
      feedFlow_m3h: step.meas[i].feedFlow_m3h,
      permeateFlow_m3h: step.meas[i].permeateFlow_m3h,
      permeateTDS_mgL: step.meas[i].permeateTDS_mgL,
      vesselDP_bar: step.meas[i].vesselDP_bar,
      roPower_kW: step.meas[i].roPower_kW,
      recovery: step.meas[i].feedFlow_m3h > 0 ? step.meas[i].permeateFlow_m3h / step.meas[i].feedFlow_m3h : 0,
    }));
    const mTotals = aggregate(measuredTrains, step.env);

    const hybrid: HybridBreakdown[] = ctxs.map((c, i) => {
      const p = predictTrain("hybrid", step.env, this.setpoints[i], c, this.bundle);
      return {
        physics: { Qp: p.physics.permeateFlow_m3h, Cp: p.physics.permeateTDS_mgL, dP: p.physics.vesselDP_bar, W: p.physics.roPower_kW },
        residual: p.residual,
        hybrid: { Qp: p.out.permeateFlow_m3h, Cp: p.out.permeateTDS_mgL, dP: p.out.vesselDP_bar, W: p.out.roPower_kW },
        measured: {
          Qp: step.meas[i].permeateFlow_m3h,
          Cp: step.meas[i].permeateTDS_mgL,
          dP: step.meas[i].vesselDP_bar,
          W: step.meas[i].roPower_kW,
        },
        margins: p.margins,
        ood: p.ood,
      };
    });
    const confidence = Math.min(1, ...hybrid.map((h) => h.ood?.confidence ?? 1));

    // Health trend over the recent history window.
    const recent = this.history.filter((h) => h.t >= this.simTime - TREND_WINDOW_h * HOUR_MS);
    const healthTrend = health.map((h, i) => {
      const fit = fitTrend(
        recent.map((r) => (r.t - this.simTime) / HOUR_MS),
        recent.map((r) => r.health[i]),
      );
      const fc = forecastThreshold(fit, 0, h.npf, LIMITS.cipHealthThreshold, 24, 24 * 14);
      return { slopePctPerHour: fc.slopePctPerHour, hours: fc.hours, lo: fc.lo, hi: fc.hi, probWithin: fc.probWithin, r2: fc.r2 };
    });

    const clock = clockHours(this.simTime);
    const demandNext = demandAt(clock + 0.5);
    const plan = planProduction({
      reservoir_m3: this.reservoir,
      demandNext_m3h: demandNext,
      hoursToCap: Infinity,
      inCapWindow: false,
      interval_h: 1,
    });
    const guard = evaluateGuard({
      snapshot: { trains: measuredTrains, totals: mTotals },
      setpoints: this.setpoints,
      minProduction_m3h: plan.min_m3h,
      powerCap_kW: null,
      confidence,
      trainPowerRating_kW: trainPowerRating(),
    });

    const alerts: LiveSnapshot["alerts"] = [];
    health.forEach((h, i) => {
      const tr = healthTrend[i];
      if (h.npf < LIMITS.cipHealthThreshold) alerts.push({ level: "warning", text: `Train ${i + 1} below cleaning threshold (NPF ${(h.npf * 100).toFixed(1)}%).` });
      else if (tr.hours !== null && tr.hours < 24)
        alerts.push({ level: "warning", text: `Train ${i + 1} projected to reach cleaning threshold in ${tr.hours.toFixed(0)} h.` });
      // Maintenance advisory: manufacturer cleaning criteria met (does not change the process status).
      const c = cleaningStatus(h.npf, h.nsp, h.ndp, tr.hours);
      if (c.due && h.npf >= LIMITS.cipHealthThreshold) alerts.push({ level: "info", text: `Train ${i + 1}: cleaning criteria met (${c.reasons.join(", ")}).` });
    });
    for (const r of guard.rules) if (r.status === "fail") alerts.push({ level: "critical", text: `${r.label} outside limit (${r.scope}).` });
    if (confidence < LIMITS.minConfidence) alerts.push({ level: "warning", text: "Model confidence low — recommendations withheld." });

    const anyFail = guard.rules.some((r) => r.status === "fail");
    const anyWarn = guard.rules.some((r) => r.status === "warn");
    const status: LiveSnapshot["status"] = anyFail ? "critical" : alerts.some((a) => a.level === "warning") ? "warning" : anyWarn ? "watch" : "stable";

    return {
      simTime: this.simTime,
      speed: this.speed,
      env: step.env,
      setpoints: this.setpoints.map((s) => ({ ...s })),
      trains: measuredTrains,
      totals: mTotals,
      demand_m3h: step.demand,
      reservoirFraction: this.reservoir / PLANT.reservoirCapacity_m3,
      health,
      healthTrend,
      theta: ctxs.map((c) => c.theta),
      hybrid,
      guard,
      confidence,
      status,
      alerts,
      carbonIntensity: gridCarbonIntensity(clock),
      contexts: ctxs,
    };
  }

  setSpeed(speed: number) {
    this.speed = Math.min(Math.max(speed, 1), 3600);
  }

  applySetpoints(sps: TrainSetpoint[]) {
    this.setpoints = sps.map((s) => ({ ...s }));
  }

  reset(now = Date.now()) {
    this.states = INITIAL_TRAIN_FOULING.map((phi) => makeTrainState(phi));
    this.setpoints = Array.from({ length: PLANT.nTrains }, () => ({ ...DESIGN_SETPOINT }));
    this.reservoir = 0.55 * PLANT.reservoirCapacity_m3;
    this.estimators = Array.from({ length: PLANT.nTrains }, () => new TrainEstimator(0.3));
    this.history = [];
    this.simTime = now - HISTORY_SPAN_MS;
    this.backfill(now);
  }

  /** Diagnostics used by tests. */
  trueMeanFouling(): number[] {
    return this.states.map(meanFouling);
  }
}

// ===========================================================================
// Compute side (runs in the compute worker, seeded with the latest live state)
// ===========================================================================

/** The part of the live plant state that scenario forecasts and optimisation start from. */
export interface LiveState {
  simTime: number;
  setpoints: TrainSetpoint[];
  reservoirFraction: number;
  health: number[];
  contexts: TrainContext[];
}

export function liveStateOf(s: LiveSnapshot): LiveState {
  return {
    simTime: s.simTime,
    setpoints: s.setpoints,
    reservoirFraction: s.reservoirFraction,
    health: s.health.map((h) => h.npf),
    contexts: s.contexts,
  };
}

export class ComputeRuntime {
  private scenarioCache = new Map<string, { result: ScenarioResult; aquatwinRun: RunResult; stamp: number }>();
  constructor(
    public bundle: MlBundle,
    public degradation: DegradationParams,
  ) {}

  private key(id: ScenarioId, weights: ObjectiveWeights | undefined) {
    return `${id}:${JSON.stringify(weights ?? DEFAULT_WEIGHTS)}`;
  }

  runScenarioLab(live: LiveState, id: ScenarioId, weights?: ObjectiveWeights, force = false): ScenarioResult {
    const key = this.key(id, weights);
    const cached = this.scenarioCache.get(key);
    // Forecasts start from the live plant; reuse them for 10 simulated minutes.
    if (cached && !force && Math.abs(live.simTime - cached.stamp) < 10 * 60_000) return cached.result;
    const t0 = performance.now();
    const startClock = Math.floor(clockHours(live.simTime));
    const common = {
      plant: "twin" as const,
      bundle: this.bundle,
      degradation: this.degradation,
      startClock_h: startClock,
      initialHealth: live.health,
      initialReservoirFraction: live.reservoirFraction,
      weights,
      seed: 1,
    };
    const baseline = runScenario({ ...common, scenario: SCENARIOS.normal, strategy: "fixed", model: "hybrid" });
    const noAction = runScenario({ ...common, scenario: SCENARIOS[id], strategy: "fixed", model: "hybrid" });
    const aquatwin = runScenario({ ...common, scenario: SCENARIOS[id], strategy: "aquatwin", model: "hybrid" });
    const result: ScenarioResult = {
      scenario: id,
      startClock_h: startClock,
      createdAt: Date.now(),
      computeMs: Math.round(performance.now() - t0),
      baseline: toBranch(baseline),
      noAction: toBranch(noAction),
      aquatwin: toBranch(aquatwin),
    };
    this.scenarioCache.set(key, { result, aquatwinRun: aquatwin, stamp: live.simTime });
    return result;
  }

  optimizeAt(live: LiveState, source: ScenarioId | "live", t: number, weights: ObjectiveWeights = DEFAULT_WEIGHTS): OptimizationSnapshot {
    const t0 = performance.now();
    let env: Environment;
    let ctxs: TrainContext[];
    let prev: TrainSetpoint[];
    let reservoir: number;
    let demandNext: number;
    let health: number[];
    let foulMult: number[] = [1, 1, 1];
    let cap: number | null = null;
    let hoursToCap = Infinity;
    let inCap = false;
    let label: string;
    let feedHist: { t: number; s: number; T: number }[] = [];
    const clockNow = clockHours(live.simTime);

    if (source === "live") {
      env = baseEnvironment(clockNow);
      ctxs = live.contexts;
      prev = live.setpoints;
      reservoir = live.reservoirFraction * PLANT.reservoirCapacity_m3;
      demandNext = demandAt(clockNow + 0.5);
      health = live.health;
      label = "Live plant — now";
      feedHist = Array.from({ length: 7 }, (_, k) => {
        const e = baseEnvironment(clockNow - 1 + k / 6);
        return { t: -1 + k / 6, s: e.salinity_gL, T: e.temperature_C };
      });
    } else {
      const res = this.runScenarioLab(live, source, weights);
      const run = this.scenarioCache.get(this.key(source, weights))?.aquatwinRun;
      const steps = run?.steps ?? [];
      const idx = Math.min(steps.length - 1, Math.max(0, Math.round(t * 6)));
      const s: StepRecord | undefined = steps[idx];
      const sc = SCENARIOS[source];
      env = s ? s.env : sc.env(t, res.startClock_h + t);
      health = s ? s.health : live.health;
      const wear = sc.pumpWear(t);
      ctxs = health.map((h, i) => contextFromFouling(phiFromHealth(h, this.degradation, this.bundle), wear[i], this.degradation));
      prev = s ? s.setpoints : live.setpoints;
      reservoir = s ? s.reservoirFraction * PLANT.reservoirCapacity_m3 : live.reservoirFraction * PLANT.reservoirCapacity_m3;
      demandNext = demandAt(res.startClock_h + t + 0.5, sc.demandMultiplier(t + 0.5));
      foulMult = sc.trainFoulingMultiplier(t);
      const capFrac = sc.powerCapFraction(t) ?? sc.powerCapFraction(t + 0.5);
      const basePower = run?.baselinePower_kW ?? 7100;
      cap = capFrac === null ? null : capFrac * basePower;
      inCap = sc.powerCapFraction(t) !== null;
      for (let h = 0.25; h <= 12; h += 0.25) {
        if (sc.powerCapFraction(t + h) !== null) {
          hoursToCap = h;
          break;
        }
      }
      label = `${sc.name} · +${t.toFixed(0)} h`;
      feedHist = steps.slice(Math.max(0, idx - 6), idx + 1).map((x) => ({ t: x.t, s: x.env.salinity_gL, T: x.env.temperature_C }));
    }

    const plan = planProduction({ reservoir_m3: reservoir, demandNext_m3h: demandNext, hoursToCap, inCapWindow: inCap, interval_h: 1 });
    const pumpEff0 = cleanBaseline().theta.pumpEff;
    let focus: number | null = null;
    let worst = Infinity;
    health.forEach((h, i) => {
      const sc = Math.min(h / 0.95, ctxs[i].theta.pumpEff / pumpEff0 / 0.95);
      if (sc < worst) {
        worst = sc;
        focus = i;
      }
    });
    const cleanA = cleanBaseline().theta.A25;
    const res = optimize({
      kind: "hybrid",
      env,
      ctxs,
      bundle: this.bundle,
      prevSetpoints: prev,
      productionTarget_m3h: plan.target_m3h,
      minProduction_m3h: plan.min_m3h,
      maxProduction_m3h: plan.max_m3h,
      powerCap_kW: cap,
      foulingMultipliers: foulMult,
      degradation: this.degradation,
      foulingState: ctxs.map((c) => Math.max(0, 1 - c.theta.A25 / cleanA)),
      focusTrain: focus,
      weights,
      envAhead: extrapolateFeed(env, feedHist, 1),
    });
    return {
      context: { scenario: source, t, label },
      env,
      plan: { target_m3h: plan.target_m3h, min_m3h: plan.min_m3h, max_m3h: plan.max_m3h },
      powerCap_kW: cap,
      focusTrain: focus,
      candidates: res.candidates.map(lite),
      bestId: res.best ? res.best.id : null,
      current: lite(res.current),
      verdict: res.verdict,
      message: res.message,
      relaxed: !!res.relaxed,
      computeMs: Math.round(performance.now() - t0),
      weights,
    };
  }

  probe(input: ProbeInput): ProbeResult {
    const env: Environment = {
      salinity_gL: input.salinity_gL,
      temperature_C: input.temperature_C,
      turbidity_NTU: 2,
      pH: 8.1,
      foulingPotential: 1,
      intakeCapacity: 1,
    };
    const sp: TrainSetpoint = { online: true, feedPressure_bar: input.feedPressure_bar, feedFlowPerVessel_m3h: input.feedFlowPerVessel_m3h };
    const phi = phiFromHealth(input.health, this.degradation, this.bundle);
    const ctx = contextFromFouling(phi, 0, this.degradation);
    // Calibrated at the probe's seawater conditions, as the live twin would be.
    const ctxHere: TrainContext = { ...ctx, env0: { Cf: env.salinity_gL, T: env.temperature_C } };
    const pick = (o: TrainOutputs) => ({ Qp: o.permeateFlow_m3h, Cp: o.permeateTDS_mgL, dP: o.vesselDP_bar, W: o.roPower_kW });
    const ph = predictTrain("physics", env, sp, ctxHere, this.bundle);
    const ml = predictTrain("mlonly", env, sp, ctxHere, this.bundle);
    const hy = predictTrain("hybrid", env, sp, ctxHere, this.bundle);
    // Reference plant state with the same normalised permeate flow (ground truth for the probe).
    let lo = 0;
    let hi = 0.6;
    for (let i = 0; i < 24; i++) {
      const mid = 0.5 * (lo + hi);
      if (trueHealth(makeTrainState(mid)).health > input.health) lo = mid;
      else hi = mid;
    }
    const ref = solveTrainRef(env, sp, makeTrainState(0.5 * (lo + hi)));
    const plant = predictPlant("hybrid", env, [sp, sp, sp], [ctxHere, ctxHere, ctxHere], this.bundle);
    const guard = evaluateGuard({
      snapshot: plant.snapshot,
      setpoints: [sp, sp, sp],
      minProduction_m3h: 0,
      powerCap_kW: null,
      confidence: plant.confidence,
      trainPowerRating_kW: trainPowerRating(),
      trainMargins: plant.trains.map((t) => t.margins),
    });
    return {
      physics: pick(ph.out),
      mlonly: pick(ml.out),
      hybrid: pick(hy.out),
      reference: pick(ref),
      ood: hy.ood,
      confidence: plant.confidence,
      verdict: guard.verdict,
      guard,
      margins: hy.margins,
    };
  }

  envelope(live: LiveState, resolution = 36): EnvelopeGrid {
    const env = baseEnvironment(clockHours(live.simTime));
    const ctxs = live.contexts;
    const P: number[] = [];
    const Qv: number[] = [];
    for (let i = 0; i < resolution; i++) P.push(50 + (26 * i) / (resolution - 1));
    for (let j = 0; j < resolution; j++) Qv.push(6 + (10 * j) / (resolution - 1));
    const code: number[][] = [];
    const tds: number[][] = [];
    const recovery: number[][] = [];
    const production: number[][] = [];
    const sec: number[][] = [];
    const bits: Record<string, number> = { pressure: 1, tds: 2, recovery: 4, flux: 8, brine: 16, feedflow: 32, dp: 64, motor: 128 };
    for (let j = 0; j < Qv.length; j++) {
      const rc: number[] = [];
      const rt: number[] = [];
      const rr: number[] = [];
      const rp: number[] = [];
      const rs: number[] = [];
      for (let i = 0; i < P.length; i++) {
        const sps = buildSetpoints(P[i], Qv[j], null, "normal");
        const pred = predictPlant("hybrid", env, sps, ctxs, this.bundle);
        const g = evaluateGuard({
          snapshot: pred.snapshot,
          setpoints: sps,
          minProduction_m3h: 0,
          powerCap_kW: null,
          confidence: pred.confidence,
          trainPowerRating_kW: trainPowerRating(),
          trainMargins: pred.trains.map((t) => t.margins),
        });
        let c = 0;
        for (const r of g.rules) if (r.status === "fail" && bits[r.id]) c |= bits[r.id];
        if (pred.snapshot.totals.production_m3h <= 1) c |= 256;
        rc.push(c);
        rt.push(pred.snapshot.totals.permeateTDS_mgL);
        rr.push(pred.snapshot.totals.recovery * 100);
        rp.push(pred.snapshot.totals.production_m3h);
        rs.push(pred.snapshot.totals.sec_kWh_m3);
      }
      code.push(rc);
      tds.push(rt);
      recovery.push(rr);
      production.push(rp);
      sec.push(rs);
    }
    const online = live.setpoints.find((s) => s.online) ?? live.setpoints[0];
    return { P, Qv, code, tds, recovery, production, sec, operating: { P: online.feedPressure_bar, Qv: online.feedFlowPerVessel_m3h } };
  }
}

function lite(c: Candidate): CandidateLite {
  return {
    id: c.id,
    P: c.P,
    Qv: c.Qv,
    focusMode: c.focusMode,
    focusTrain: c.focusTrain,
    setpoints: c.setpoints,
    objectives: c.objectives,
    score: c.score,
    feasible: c.feasible,
    pareto: c.pareto,
    verdict: c.guard.verdict,
    guard: c.guard as GuardDecision,
    trains: c.prediction.snapshot.trains.map((t) => ({
      P: t.feedPressure_bar,
      Qp: t.permeateFlow_m3h,
      recovery: t.recovery,
      flux: t.avgFlux_LMH,
      tds: t.permeateTDS_mgL,
      dp: t.vesselDP_bar,
      power: t.roPower_kW,
      online: t.online,
    })),
  };
}

function toBranch(r: RunResult): ScenarioBranch {
  const points: ScenarioPoint[] = r.steps.map((s) => ({
    t: s.t,
    production: s.totals.production_m3h,
    demand: s.demand_m3h,
    tds: s.totals.permeateTDS_mgL,
    sec: s.totals.sec_kWh_m3,
    power: s.totals.power_kW,
    reservoir: s.reservoirFraction * 100,
    recovery: s.totals.recovery * 100,
    pressure: s.trains.map((t) => t.feedPressure_bar),
    feedFlow: s.trains.map((t) => t.feedFlow_m3h),
    trainProduction: s.trains.map((t) => t.permeateFlow_m3h),
    trainTds: s.trains.map((t) => t.permeateTDS_mgL),
    health: s.health,
    dp: s.trains.map((t) => t.vesselDP_bar),
    pumpSpeed: s.trains.map((t) => t.pumpSpeedRel),
    pumpEff: s.pumpEfficiency,
    motorLimited: s.trains.map((t) => t.motorLimited),
    online: s.trains.map((t) => t.online),
    salinity: s.env.salinity_gL,
    temperature: s.env.temperature_C,
    turbidity: s.env.turbidity_NTU,
    pH: s.env.pH,
    cap: s.powerCap_kW,
    carbon: s.carbon_kg_h,
    violations: s.violations,
    confidence: s.confidence,
    energy: s.totals.energyBreakdown_kWh_m3,
  }));
  const m = r.metrics;
  return {
    points,
    metrics: {
      production_m3: m.production_m3,
      energy_MWh: m.energy_MWh,
      sec: m.sec_kWh_m3,
      maxTds: m.maxTds_mgL,
      violationHours: m.anyViolation_h,
      violationBy: m.violationHoursBy,
      minReservoir: m.minReservoirFraction * 100,
      carbon_t: m.carbon_t,
      firstViolation: m.firstViolation_h,
      cipCrossing: m.cipCrossing_h,
    },
    decisions: r.decisions.map((d) => ({ ...d, candidates: undefined })),
  };
}
