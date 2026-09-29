/**
 * Closed-loop scenario simulation (docs/MODEL.md §9).
 *
 * plant = "reference": the reference plant is the simulated physical plant;
 *   AquaTwin sees only noisy telemetry, calibrates itself, and decides.
 *   Used for validation experiments (ground truth is known).
 * plant = "twin": the hybrid twin is run forward as its own plant model.
 *   Used for Scenario Lab forecasts (what AquaTwin predicts will happen).
 *
 * strategy = "fixed": setpoints held at their initial values (no action).
 * strategy = "aquatwin": hourly re-optimisation with AquaGuard screening.
 */

import { INITIAL_TRAIN_FOULING, LIMITS, PLANT } from "./config";
import { evaluateGuard, trueViolations, type Verdict } from "./aquaguard";
import { fitTrend, forecastThreshold } from "./forecast";
import type { MlBundle } from "./ml";
import { optimize, type Candidate, type FocusMode, type ObjectiveWeights, type Objectives } from "./optimizer";
import { planProduction, type ProductionPlan } from "./planner";
import { aggregate, demandAt } from "./plant";
import { makeTrainState, measureTrain, solveTrainRef, stepFouling } from "./referencePlant";
import { Rng } from "./rng";
import { gridCarbonIntensity, type ScenarioSpec } from "./scenarios";
import {
  cleanBaseline,
  contextFromFouling,
  DESIGN_SETPOINT,
  estimateHealth,
  predictPlant,
  stepTwinFouling,
  TrainEstimator,
  trainPowerRating,
  phiFromHealth,
  trueHealth,
  twinHealth,
  type DegradationParams,
  type ModelKind,
  type TrainContext,
} from "./twin";
import type { Environment, PlantSnapshot, PlantTotals, TrainOutputs, TrainSetpoint, TrainTrueState } from "./types";

export type Strategy = "fixed" | "aquatwin";
export type PlantMode = "reference" | "twin";

export interface RunOptions {
  scenario: ScenarioSpec;
  strategy: Strategy;
  model: ModelKind;
  plant: PlantMode;
  bundle: MlBundle | null;
  degradation: DegradationParams;
  seed?: number;
  horizon_h?: number;
  dt_h?: number;
  decisionInterval_h?: number;
  startClock_h?: number;
  initialReservoirFraction?: number;
  initialFouling?: readonly number[];
  /** Twin mode: normalised permeate flow of each train at t = 0 (e.g. from the live estimator). */
  initialHealth?: number[];
  keepCandidates?: boolean;
  weights?: ObjectiveWeights;
  /** Monitoring model used for warnings (defaults to the control model). */
  monitorModel?: ModelKind;
}

export interface StepRecord {
  t: number;
  clock: number;
  env: Environment;
  setpoints: TrainSetpoint[];
  trains: TrainOutputs[];
  totals: PlantTotals;
  demand_m3h: number;
  reservoir_m3: number;
  reservoirFraction: number;
  /** True normalised permeability (reference) or twin state (twin mode). */
  health: number[];
  /** The twin's estimate (reference mode; equals `health` in twin mode). */
  healthEstimate: number[];
  pumpEfficiency: number[];
  powerCap_kW: number | null;
  carbon_kg_h: number;
  violations: string[];
  /** Prediction of this step's totals made at the last decision (controller's model). */
  predicted?: { production_m3h: number; tds_mgL: number; sec_kWh_m3: number };
  warnings: string[];
  alarms: string[];
  confidence: number;
}

export interface DecisionRecord {
  t: number;
  verdict: Verdict | "HOLD";
  message: string;
  reasons: string[];
  plan: ProductionPlan;
  confidence: number;
  focusTrain: number | null;
  chosen: { P: number; Qv: number; focusMode: FocusMode; objectives: Objectives } | null;
  current: Objectives;
  candidates?: Candidate[];
}

export interface RunMetrics {
  energy_MWh: number;
  production_m3: number;
  sec_kWh_m3: number;
  meanRecovery: number;
  meanTds_mgL: number;
  maxTds_mgL: number;
  tdsViolation_h: number;
  anyViolation_h: number;
  violationHoursBy: Record<string, number>;
  minReservoirFraction: number;
  shortfall_m3: number;
  carbon_t: number;
  firstViolation_h: number | null;
  lastViolation_h: number | null;
  firstWarning_h: number | null;
  firstAlarm_h: number | null;
  withheldDecisions: number;
  rejectedDecisions: number;
  decisions: number;
  predMAE: { production_m3h: number; tds_mgL: number; sec_kWh_m3: number } | null;
  predRMSE: { production_m3h: number; tds_mgL: number; sec_kWh_m3: number } | null;
  finalHealth: number[];
  cipCrossing_h: (number | null)[];
}

export interface RunResult {
  options: Omit<RunOptions, "bundle" | "scenario"> & { scenario: string };
  steps: StepRecord[];
  decisions: DecisionRecord[];
  metrics: RunMetrics;
  baselinePower_kW: number;
}

const HIST_WINDOW_h = 6;
/** Trains whose normalised permeate flow falls below this become the optimiser's "focus" train. */
const FOCUS_HEALTH = 0.95;
/** Quality outlook: the last hour's feed-condition trend is extrapolated this far ahead. */
const QUALITY_HORIZON_h = 2;
const ENV_TREND_WINDOW_h = 1;

/** Power of the plant at its initial fixed operating point, used to express caps. */
function baselinePower(env: Environment, states: TrainTrueState[]): number {
  const trains = states.map((s) => solveTrainRef(env, DESIGN_SETPOINT, s));
  return aggregate(trains, env).power_kW;
}

function hoursToCap(sc: ScenarioSpec, t: number, horizon: number): { inWindow: boolean; hours: number } {
  if (sc.powerCapFraction(t) !== null) return { inWindow: true, hours: 0 };
  for (let h = 0.25; h <= horizon; h += 0.25) if (sc.powerCapFraction(t + h) !== null) return { inWindow: false, hours: h };
  return { inWindow: false, hours: Infinity };
}

function meanDemand(sc: ScenarioSpec, clock0: number, t: number, span: number): number {
  let s = 0;
  const n = 6;
  for (let k = 0; k < n; k++) {
    const tt = t + (span * (k + 0.5)) / n;
    s += demandAt(clock0 + tt, sc.demandMultiplier(tt));
  }
  return s / n;
}

/**
 * Feed conditions extrapolated `horizon` hours ahead from a recent history of
 * measured feed salinity and temperature (linear trend, bounded), or null if
 * the trend is flat. Used for look-ahead decisions and the quality outlook.
 */
export function extrapolateFeed(env: Environment, hist: { t: number; s: number; T: number }[], horizon: number): Environment | null {
  if (hist.length < 4) return null;
  const ts = hist.map((e) => e.t);
  const sFit = fitTrend(
    ts,
    hist.map((e) => e.s),
  );
  const tFit = fitTrend(
    ts,
    hist.map((e) => e.T),
  );
  const dS = Math.max(-3, Math.min(6, (sFit?.slope ?? 0) * horizon));
  const dT = Math.max(-2, Math.min(3, (tFit?.slope ?? 0) * horizon));
  if (Math.abs(dS) <= 0.05 && Math.abs(dT) <= 0.05) return null;
  return { ...env, salinity_gL: env.salinity_gL + dS, temperature_C: env.temperature_C + dT };
}

export function runScenario(opts: RunOptions): RunResult {
  const sc = opts.scenario;
  const horizon = opts.horizon_h ?? sc.horizon_h;
  const dt = opts.dt_h ?? 1 / 6;
  const decisionEvery = opts.decisionInterval_h ?? 1;
  const clock0 = opts.startClock_h ?? 14;
  const seed = opts.seed ?? 1;
  const rng = new Rng(seed);
  const initFoul = opts.initialFouling ?? INITIAL_TRAIN_FOULING;
  const nT = PLANT.nTrains;
  const monitorKind = opts.monitorModel ?? opts.model;

  // --- state -------------------------------------------------------------
  let trueStates = initFoul.map((phi) => makeTrainState(phi));
  // Twin-mode lumped fouling: initialised from the normalised permeate flow the
  // twin estimates for each train (given, or taken from the reference state).
  let twinPhi =
    opts.plant === "twin"
      ? (opts.initialHealth ?? trueStates.map((s) => trueHealth(s).health)).map((h) => phiFromHealth(h, opts.degradation, opts.bundle))
      : initFoul.map(() => 0);
  let reservoir = (opts.initialReservoirFraction ?? 0.55) * PLANT.reservoirCapacity_m3;
  let setpoints: TrainSetpoint[] = Array.from({ length: nT }, () => ({ ...DESIGN_SETPOINT }));
  const estimators = Array.from({ length: nT }, () => new TrainEstimator(0.3));
  const baseEnv = sc.env(0, clock0);
  const basePower = baselinePower(baseEnv, trueStates);
  const pumpEff0 = cleanBaseline().theta.pumpEff;

  const steps: StepRecord[] = [];
  const decisions: DecisionRecord[] = [];
  const healthHist: { t: number; h: number[] }[] = [];
  const envHist: { t: number; s: number; T: number }[] = [];
  const extrapolateEnv = (env: Environment, horizon: number) => extrapolateFeed(env, envHist, horizon);
  let lastPrediction: PlantSnapshot | null = null;
  let firstWarning: number | null = null;
  let firstAlarm: number | null = null;
  const initialMeasuredQp: number[] = [];
  const foulingLatched = new Array<boolean>(nT).fill(false);

  const nSteps = Math.round(horizon / dt);
  // Warm up the estimators on the initial state so calibration is converged at t = 0.
  if (opts.plant === "reference") {
    const env0 = sc.env(0, clock0);
    for (let k = 0; k < 12; k++) {
      trueStates.forEach((s, i) => {
        const out = solveTrainRef(env0, setpoints[i], s);
        estimators[i].update(env0, measureTrain(out, rng), setpoints[i]);
      });
    }
  }

  for (let k = 0; k <= nSteps; k++) {
    const t = k * dt;
    const clock = clock0 + t;
    const env = sc.env(t, clock);
    const wear = sc.pumpWear(t);
    const headLoss = sc.pumpHeadLoss(t);
    const capFrac = sc.powerCapFraction(t);
    const powerCap = capFrac === null ? null : capFrac * basePower;
    const demand = demandAt(clock, sc.demandMultiplier(t));
    const sensor = sc.sensor(t);
    const foulMult = sc.trainFoulingMultiplier(t);
    envHist.push({ t, s: env.salinity_gL, T: env.temperature_C });
    while (envHist.length && envHist[0].t < t - ENV_TREND_WINDOW_h - 1e-9) envHist.shift();

    // --- decision -----------------------------------------------------------
    const ctxNow: TrainContext[] =
      opts.plant === "twin" ? twinPhi.map((phi, i) => contextFromFouling(phi, wear[i], opts.degradation)) : estimators.map((e) => e.context()!);

    const isDecision = opts.strategy === "aquatwin" && k < nSteps && Math.abs(t / decisionEvery - Math.round(t / decisionEvery)) < 1e-6;
    let confidence = 1;
    if (isDecision) {
      const cap = hoursToCap(sc, t, 12);
      const plan = planProduction({
        reservoir_m3: reservoir,
        demandNext_m3h: meanDemand(sc, clock0, t, decisionEvery),
        hoursToCap: cap.hours,
        inCapWindow: cap.inWindow,
        interval_h: decisionEvery,
      });
      // Health estimates (normalised permeate flow) drive the choice of focus train.
      const healthEst =
        opts.plant === "twin" ? twinPhi.map((p) => twinHealth(p, opts.degradation, opts.bundle)) : ctxNow.map((c) => estimateHealth(c, opts.model, opts.bundle).health);
      const pumpRel = ctxNow.map((c) => c.theta.pumpEff / pumpEff0);
      // Train allocation is always a decision variable: the "focus" train (the
      // one derated or taken offline in allocation candidates) is the weakest.
      let focus: number | null = null;
      let worst = Infinity;
      for (let i = 0; i < nT; i++) {
        const score = Math.min(healthEst[i] / FOCUS_HEALTH, pumpRel[i] / 0.95);
        if (score < worst) {
          worst = score;
          focus = i;
        }
      }
      // Lumped fouling state for the fouling objective (twin degradation model variable).
      const cleanA = cleanBaseline().theta.A25;
      const foulingState = opts.plant === "twin" ? twinPhi.slice() : ctxNow.map((c) => Math.max(0, 1 - c.theta.A25 / cleanA));
      const capNext = sc.powerCapFraction(t + 0.5);
      const res = optimize({
        kind: opts.model,
        env,
        ctxs: ctxNow,
        bundle: opts.bundle,
        prevSetpoints: setpoints,
        productionTarget_m3h: plan.target_m3h,
        minProduction_m3h: plan.min_m3h,
        maxProduction_m3h: plan.max_m3h,
        powerCap_kW: capFrac !== null || capNext !== null ? (capFrac ?? capNext!) * basePower : null,
        foulingMultipliers: foulMult,
        degradation: opts.degradation,
        foulingState,
        focusTrain: focus,
        weights: opts.weights,
        envAhead: extrapolateEnv(env, decisionEvery),
      });
      confidence = res.current.prediction.confidence;
      if (res.best) {
        setpoints = res.best.setpoints.map((s) => ({ ...s }));
        lastPrediction = res.best.prediction.snapshot;
      } else {
        lastPrediction = res.current.prediction.snapshot;
      }
      decisions.push({
        t,
        verdict: res.verdict,
        message: res.message,
        reasons: res.best ? [] : summariseReasons(res.candidates, res.current),
        plan,
        confidence,
        focusTrain: focus,
        chosen: res.best ? { P: res.best.P, Qv: res.best.Qv, focusMode: res.best.focusMode, objectives: res.best.objectives } : null,
        current: res.current.objectives,
        candidates: opts.keepCandidates ? res.candidates : undefined,
      });
    }

    // --- plant response -----------------------------------------------------
    // Physical intake limit: total feed cannot exceed the available intake capacity.
    const intakeMax = 1.2 * PLANT.nTrains * PLANT.vesselsPerTrain * DESIGN_SETPOINT.feedFlowPerVessel_m3h * env.intakeCapacity;
    const feedDemand = setpoints.reduce((a, s) => a + (s.online ? s.feedFlowPerVessel_m3h * PLANT.vesselsPerTrain : 0), 0);
    const intakeScale = feedDemand > intakeMax ? intakeMax / feedDemand : 1;
    const applied = setpoints.map((s) => ({ ...s, feedFlowPerVessel_m3h: s.feedFlowPerVessel_m3h * intakeScale }));

    let trains: TrainOutputs[];
    let health: number[];
    let healthEstimate: number[];
    let pumpEfficiency: number[];
    if (opts.plant === "reference") {
      trueStates = trueStates.map((s, i) => ({ ...s, pumpWear: wear[i], pumpHeadLoss: headLoss[i] }));
      const outs = trueStates.map((s, i) => solveTrainRef(env, applied[i], s));
      trains = outs;
      // Telemetry → self-calibration
      outs.forEach((o, i) => {
        const m = measureTrain(o, rng, sensor.noiseScale, sensor.tdsBias);
        if (k === 0) initialMeasuredQp[i] = m.permeateFlow_m3h;
        estimators[i].update(env, m, applied[i]);
      });
      health = trueStates.map((s) => trueHealth(s).health);
      const ctxAfter = estimators.map((e) => e.context()!);
      healthEstimate = ctxAfter.map((c) => estimateHealth(c, monitorKind, opts.bundle).health);
      pumpEfficiency = outs.map((o) => o.hpPumpEfficiency);
      // Fouling dynamics
      trueStates = trueStates.map((s, i) => (applied[i].online ? stepFouling(s, outs[i].elementFlux_LMH, env.foulingPotential, foulMult[i], dt) : s));
    } else {
      const ctx = twinPhi.map((phi, i) => contextFromFouling(phi, wear[i], opts.degradation));
      const pred = predictPlant("hybrid", env, applied, ctx, opts.bundle, true);
      trains = pred.snapshot.trains;
      confidence = Math.min(confidence, pred.confidence);
      health = twinPhi.map((p) => twinHealth(p, opts.degradation, opts.bundle));
      healthEstimate = health;
      pumpEfficiency = trains.map((o) => o.hpPumpEfficiency);
      twinPhi = twinPhi.map((phi, i) => (applied[i].online ? stepTwinFouling(phi, trains[i].avgFlux_LMH, env.foulingPotential, foulMult[i], dt, opts.degradation) : phi));
    }
    const totals = aggregate(trains, env);
    const snapshot: PlantSnapshot = { trains, totals };

    // Reservoir mass balance (overflow is prevented by level control).
    const reservoirStart = reservoir;
    reservoir = Math.min(PLANT.reservoirCapacity_m3, Math.max(0, reservoir + (totals.production_m3h - demand) * dt));
    const reservoirFraction = reservoirStart / PLANT.reservoirCapacity_m3;

    // --- monitoring: AquaTwin warnings vs conventional alarms -----------------
    healthHist.push({ t, h: healthEstimate });
    while (healthHist.length && healthHist[0].t < t - HIST_WINDOW_h) healthHist.shift();
    const warnings: string[] = [];
    if (healthHist.length >= 12) {
      for (let i = 0; i < nT; i++) {
        if (!applied[i].online) continue;
        const fit = fitTrend(
          healthHist.map((x) => x.t),
          healthHist.map((x) => x.h[i]),
        );
        const fc = forecastThreshold(fit, t, healthEstimate[i], LIMITS.cipHealthThreshold, 12);
        // Alarm deadband: raise at P > 0.5; clear only once the decline has
        // stopped (slope > −0.01 %/h), P < 0.1 and health has margin.
        if (fc.status === "crossed" || fc.probWithin > 0.5) foulingLatched[i] = true;
        else if (fc.probWithin < 0.1 && (!fit || fit.slope > -1e-4) && healthEstimate[i] > LIMITS.cipHealthThreshold + 0.02) foulingLatched[i] = false;
        if (foulingLatched[i]) warnings.push(`fouling:T${i + 1}`);
      }
    }
    if (opts.plant === "reference") {
      estimators.forEach((e, i) => {
        if (e.state && e.state.theta.pumpEff < 0.95 * pumpEff0 && applied[i].online) warnings.push(`pump:T${i + 1}`);
      });
      // Model-based quality / production outlook at current setpoints and conditions.
      const ctxs = estimators.map((e) => e.context()!);
      const outlook = predictPlant(monitorKind, env, applied, ctxs, opts.bundle, true);
      // Quality outlook: extrapolate the last hour's feed salinity / temperature
      // trend QUALITY_HORIZON_h ahead (bounded) and predict permeate TDS there.
      const envAhead = extrapolateEnv(env, QUALITY_HORIZON_h);
      const tdsAhead = envAhead
        ? predictPlant(monitorKind, envAhead, applied, ctxs, opts.bundle, true).snapshot.totals.permeateTDS_mgL
        : outlook.snapshot.totals.permeateTDS_mgL;
      if (outlook.snapshot.totals.permeateTDS_mgL > 0.97 * LIMITS.maxPermeateTDS_mgL || tdsAhead > LIMITS.maxPermeateTDS_mgL) warnings.push("quality");
      const deficit = demand - outlook.snapshot.totals.production_m3h;
      const hoursLeft = deficit > 0 ? (reservoir - LIMITS.minReservoirFraction * PLANT.reservoirCapacity_m3) / deficit : Infinity;
      if (hoursLeft < 8) warnings.push("reservoir");
      if (powerCap !== null && outlook.snapshot.totals.power_kW > powerCap) warnings.push("powercap");
    }
    const alarms: string[] = [];
    trains.forEach((o, i) => {
      if (!o.online) return;
      if (initialMeasuredQp[i] && o.permeateFlow_m3h < 0.9 * initialMeasuredQp[i] && applied[i].feedPressure_bar === DESIGN_SETPOINT.feedPressure_bar)
        alarms.push(`flow:T${i + 1}`);
      if (o.vesselDP_bar > 0.9 * LIMITS.maxVesselDP_bar) alarms.push(`dp:T${i + 1}`);
      if (o.motorLimited) alarms.push(`motor:T${i + 1}`);
    });
    if (totals.permeateTDS_mgL > 0.95 * LIMITS.maxPermeateTDS_mgL) alarms.push("tds");
    if (reservoirFraction < LIMITS.minReservoirFraction + 0.05) alarms.push("reservoir");
    if (powerCap !== null && totals.power_kW > powerCap) alarms.push("powercap");
    if (firstWarning === null && warnings.length) firstWarning = t;
    if (firstAlarm === null && alarms.length) firstAlarm = t;

    const violations = trueViolations(snapshot, reservoirFraction, powerCap);

    steps.push({
      t,
      clock,
      env,
      setpoints: applied,
      trains,
      totals,
      demand_m3h: demand,
      reservoir_m3: reservoirStart,
      reservoirFraction,
      health,
      healthEstimate,
      pumpEfficiency,
      powerCap_kW: powerCap,
      carbon_kg_h: totals.power_kW * gridCarbonIntensity(clock, sc.carbonMultiplier(t)),
      violations,
      predicted: lastPrediction
        ? {
            production_m3h: lastPrediction.totals.production_m3h,
            tds_mgL: lastPrediction.totals.permeateTDS_mgL,
            sec_kWh_m3: lastPrediction.totals.sec_kWh_m3,
          }
        : undefined,
      warnings,
      alarms,
      confidence,
    });
  }

  return {
    options: {
      strategy: opts.strategy,
      model: opts.model,
      plant: opts.plant,
      degradation: opts.degradation,
      seed,
      horizon_h: horizon,
      dt_h: dt,
      decisionInterval_h: decisionEvery,
      startClock_h: clock0,
      scenario: sc.id,
    },
    steps,
    decisions,
    metrics: computeMetrics(steps, decisions, dt, firstWarning, firstAlarm),
    baselinePower_kW: basePower,
  };
}

function summariseReasons(cands: Candidate[], current: Candidate): string[] {
  if (current.guard.verdict === "WITHHELD") return current.guard.reasons;
  const counts = new Map<string, number>();
  for (const c of cands) for (const r of c.guard.rules) if (r.status === "fail") counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${label}: violated by ${n} of ${cands.length} candidates`);
}

export function computeMetrics(steps: StepRecord[], decisions: DecisionRecord[], dt: number, firstWarning: number | null, firstAlarm: number | null): RunMetrics {
  // Integrate over intervals (exclude the final instant).
  const body = steps.slice(0, -1);
  let energy = 0;
  let prod = 0;
  let recSum = 0;
  let tdsSum = 0;
  let tdsMax = 0;
  let tdsViol = 0;
  let anyViol = 0;
  let shortfall = 0;
  let carbon = 0;
  let minRes = 1;
  let firstV: number | null = null;
  let lastV: number | null = null;
  const by: Record<string, number> = {};
  const errs = { p: [] as number[], c: [] as number[], s: [] as number[] };
  for (const s of body) {
    energy += s.totals.power_kW * dt;
    prod += s.totals.production_m3h * dt;
    recSum += s.totals.recovery;
    tdsSum += s.totals.permeateTDS_mgL;
    tdsMax = Math.max(tdsMax, s.totals.permeateTDS_mgL);
    carbon += s.carbon_kg_h * dt;
    minRes = Math.min(minRes, s.reservoirFraction);
    shortfall += Math.max(0, s.demand_m3h - s.totals.production_m3h) * dt * (s.reservoirFraction < LIMITS.minReservoirFraction ? 1 : 0);
    if (s.violations.includes("tds")) tdsViol += dt;
    if (s.violations.length) {
      anyViol += dt;
      if (firstV === null) firstV = s.t;
      lastV = s.t + dt;
    }
    for (const v of s.violations) by[v] = (by[v] ?? 0) + dt;
    if (s.predicted) {
      errs.p.push(s.predicted.production_m3h - s.totals.production_m3h);
      errs.c.push(s.predicted.tds_mgL - s.totals.permeateTDS_mgL);
      errs.s.push(s.predicted.sec_kWh_m3 - s.totals.sec_kWh_m3);
    }
  }
  const mae = (a: number[]) => a.reduce((x, y) => x + Math.abs(y), 0) / a.length;
  const rmse = (a: number[]) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
  const last = steps[steps.length - 1];
  const nT = last.health.length;
  const cip: (number | null)[] = [];
  for (let i = 0; i < nT; i++) {
    const hit = steps.find((s) => s.health[i] < LIMITS.cipHealthThreshold);
    cip.push(hit ? hit.t : null);
  }
  return {
    energy_MWh: energy / 1000,
    production_m3: prod,
    sec_kWh_m3: prod > 0 ? energy / prod : 0,
    meanRecovery: recSum / body.length,
    meanTds_mgL: tdsSum / body.length,
    maxTds_mgL: tdsMax,
    tdsViolation_h: tdsViol,
    anyViolation_h: anyViol,
    violationHoursBy: by,
    minReservoirFraction: minRes,
    shortfall_m3: shortfall,
    carbon_t: carbon / 1000,
    firstViolation_h: firstV,
    lastViolation_h: lastV,
    firstWarning_h: firstWarning,
    firstAlarm_h: firstAlarm,
    withheldDecisions: decisions.filter((d) => d.verdict === "WITHHELD").length,
    rejectedDecisions: decisions.filter((d) => d.verdict === "REJECTED").length,
    decisions: decisions.length,
    predMAE: errs.p.length ? { production_m3h: mae(errs.p), tds_mgL: mae(errs.c), sec_kWh_m3: mae(errs.s) } : null,
    predRMSE: errs.p.length ? { production_m3h: rmse(errs.p), tds_mgL: rmse(errs.c), sec_kWh_m3: rmse(errs.s) } : null,
    finalHealth: last.health,
    cipCrossing_h: cip,
  };
}

/** Evaluate AquaGuard on an arbitrary plant state (used by the UI for the current plant). */
export function guardSnapshot(snapshot: PlantSnapshot, setpoints: TrainSetpoint[], minProduction_m3h: number, powerCap_kW: number | null, confidence: number) {
  return evaluateGuard({
    snapshot,
    setpoints,
    minProduction_m3h,
    powerCap_kW,
    confidence,
    trainPowerRating_kW: trainPowerRating(),
  });
}
