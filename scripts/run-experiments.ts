/**
 * Validation experiments (docs/VALIDATION.md).
 *
 * For every scenario × method × seed, a 24 h closed-loop simulation is run on
 * the REFERENCE plant (ground truth known, telemetry noisy):
 *   fixed    setpoints held at their initial values (no action)
 *   physics  AquaTwin optimiser + AquaGuard using the calibrated 0D model
 *   mlonly   same optimiser + AquaGuard using the ML-only model
 *   hybrid   same optimiser + AquaGuard using physics + ML residual (AquaTwin)
 * Warning lead time is measured in monitoring mode on the no-action run:
 * when would each model have warned, when would a conventional threshold
 * alarm have fired, and when did the true critical event occur.
 *
 * Output: public/data/validation/results.json (read by the dashboard) and CSV
 * tables in data/experiments/. Deterministic for a given model bundle.
 *
 * Usage: npx tsx scripts/run-experiments.ts [--quick]
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIMITS } from "../src/sim/config";
import { runScenario, type RunMetrics, type RunResult } from "../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../src/sim/scenarios";
import type { ModelKind } from "../src/sim/twin";
import { loadDegradation, loadMlBundle, ROOT } from "./lib/artifacts";

const quick = process.argv.includes("--quick");
const SEEDS = quick ? [1, 2] : [1, 2, 3, 4, 5];
const SCENARIO_IDS: ScenarioId[] = ["normal", "salinity", "temperature", "fouling", "pump", "sensor", "algal", "energy", "demand", "extreme"];
const METHODS = ["fixed", "physics", "mlonly", "hybrid"] as const;
type Method = (typeof METHODS)[number];

const bundle = loadMlBundle();
const degradation = loadDegradation();
const t0 = Date.now();

function run(id: ScenarioId, method: Method, seed: number, monitor?: ModelKind, startClock_h?: number): RunResult {
  return runScenario({
    startClock_h,
    scenario: SCENARIOS[id],
    strategy: method === "fixed" ? "fixed" : "aquatwin",
    model: method === "fixed" ? "hybrid" : method,
    monitorModel: monitor,
    plant: "reference",
    bundle,
    degradation,
    seed,
  });
}

type Num = number | null;
const mean = (xs: Num[]) => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const std = (xs: Num[]) => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
};

interface Summary {
  [k: string]: { mean: Num; std: Num };
}

function summarise(ms: RunMetrics[]): Summary {
  const pick: Record<string, (m: RunMetrics) => Num> = {
    sec_kWh_m3: (m) => m.sec_kWh_m3,
    energy_MWh: (m) => m.energy_MWh,
    production_m3: (m) => m.production_m3,
    meanRecovery_pct: (m) => m.meanRecovery * 100,
    meanTds_mgL: (m) => m.meanTds_mgL,
    maxTds_mgL: (m) => m.maxTds_mgL,
    tdsViolation_h: (m) => m.tdsViolation_h,
    anyViolation_h: (m) => m.anyViolation_h,
    minReservoir_pct: (m) => m.minReservoirFraction * 100,
    carbon_t: (m) => m.carbon_t,
    restore_h: (m) => (m.lastViolation_h === null ? 0 : Math.max(0, m.lastViolation_h - 1)),
    withheld: (m) => m.withheldDecisions,
    rejected: (m) => m.rejectedDecisions,
    maeProduction_m3h: (m) => m.predMAE?.production_m3h ?? null,
    maeTds_mgL: (m) => m.predMAE?.tds_mgL ?? null,
    maeSec_kWh_m3: (m) => m.predMAE?.sec_kWh_m3 ?? null,
    rmseProduction_m3h: (m) => m.predRMSE?.production_m3h ?? null,
    rmseTds_mgL: (m) => m.predRMSE?.tds_mgL ?? null,
    rmseSec_kWh_m3: (m) => m.predRMSE?.sec_kWh_m3 ?? null,
  };
  const out: Summary = {};
  for (const [k, f] of Object.entries(pick)) {
    const xs = ms.map(f);
    out[k] = { mean: mean(xs), std: std(xs) };
  }
  // Violation hours by constraint
  const keys = new Set(ms.flatMap((m) => Object.keys(m.violationHoursBy)));
  for (const k of keys) {
    const xs = ms.map((m) => m.violationHoursBy[k] ?? 0);
    out[`viol_${k}_h`] = { mean: mean(xs), std: std(xs) };
  }
  return out;
}

/**
 * Time of the first unscheduled critical event on the true plant (constraint
 * violation, cleaning threshold, capacity loss). Power-cap violations are
 * excluded: the curtailment window is announced in advance, so warning lead
 * time is not a property of the model.
 */
function criticalEvent(r: RunResult): { t: number | null; kind: string | null } {
  for (const s of r.steps) {
    const v = s.violations.filter((x) => x !== "powercap");
    if (v.length) return { t: s.t, kind: `violation:${v.join("+")}` };
    const cip = s.health.findIndex((h, i) => h < LIMITS.cipHealthThreshold && r.steps[0].health[i] >= LIMITS.cipHealthThreshold);
    if (cip >= 0) return { t: s.t, kind: `cip:T${cip + 1}` };
    const motor = s.trains.findIndex((t) => t.motorLimited);
    if (motor >= 0) return { t: s.t, kind: `capacity:T${motor + 1}` };
  }
  return { t: null, kind: null };
}

/** Warning / alarm tags that count as advance notice of a given event. */
function relatedTo(kind: string | null): (tag: string) => boolean {
  if (!kind) return () => false;
  const [type, what] = kind.split(":");
  if (type === "cip") return (tag) => tag === `fouling:${what}` || tag === `flow:${what}` || tag === `dp:${what}`;
  if (type === "capacity") return (tag) => tag === `pump:${what}` || tag === `motor:${what}`;
  const v = new Set(what.split("+"));
  return (tag) => v.has(tag) || (v.has("tds") && tag === "quality") || (v.has("dp") && tag.startsWith("dp:")) || (v.has("reservoir") && tag === "reservoir");
}

function firstBefore(r: RunResult, key: "warnings" | "alarms", ev: { t: number | null; kind: string | null }): number | null {
  if (ev.t === null) return null;
  const match = relatedTo(ev.kind);
  const s = r.steps.find((x) => x.t <= ev.t! && x[key].some(match));
  return s ? s.t : null;
}

function downsample(r: RunResult) {
  return r.steps
    .filter((_, i) => i % 3 === 0)
    .map((s) => ({
      t: +s.t.toFixed(3),
      production: +s.totals.production_m3h.toFixed(1),
      demand: +s.demand_m3h.toFixed(1),
      tds: +s.totals.permeateTDS_mgL.toFixed(1),
      sec: +s.totals.sec_kWh_m3.toFixed(4),
      power: +s.totals.power_kW.toFixed(0),
      reservoir: +(s.reservoirFraction * 100).toFixed(2),
      recovery: +(s.totals.recovery * 100).toFixed(2),
      pmax: +Math.max(...s.trains.map((t) => (t.online ? t.feedPressure_bar : 0))).toFixed(2),
      health: s.health.map((h) => +h.toFixed(4)),
      healthEst: s.healthEstimate.map((h) => +h.toFixed(4)),
      violations: s.violations,
      cap: s.powerCap_kW === null ? null : +s.powerCap_kW.toFixed(0),
    }));
}

const results: Record<string, Record<Method, Summary>> = {};
const leadTime: Record<string, Record<string, unknown>> = {};
const trajectories: Record<string, Record<string, ReturnType<typeof downsample>>> = {};
const decisionLog: Record<string, unknown[]> = {};
const csvRows: string[] = [
  "scenario,method,seed,sec_kWh_m3,energy_MWh,production_m3,mean_recovery_pct,mean_tds,max_tds,tds_violation_h,any_violation_h,min_reservoir_pct,withheld,rejected,mae_prod,mae_tds,mae_sec",
];

for (const id of SCENARIO_IDS) {
  results[id] = {} as Record<Method, Summary>;
  trajectories[id] = {};
  const leads: Record<string, Num[]> = { event: [], conventional: [], physics: [], mlonly: [], hybrid: [] };
  const falseWarn: Record<string, Num[]> = { conventional: [], physics: [], mlonly: [], hybrid: [] };
  let eventKind: string | null = null;
  for (const method of METHODS) {
    const ms: RunMetrics[] = [];
    for (const seed of SEEDS) {
      const r = run(id, method, seed, method === "fixed" ? "hybrid" : undefined);
      ms.push(r.metrics);
      const m = r.metrics;
      csvRows.push(
        [
          id,
          method,
          seed,
          m.sec_kWh_m3,
          m.energy_MWh,
          m.production_m3,
          m.meanRecovery * 100,
          m.meanTds_mgL,
          m.maxTds_mgL,
          m.tdsViolation_h,
          m.anyViolation_h,
          m.minReservoirFraction * 100,
          m.withheldDecisions,
          m.rejectedDecisions,
          m.predMAE?.production_m3h ?? "",
          m.predMAE?.tds_mgL ?? "",
          m.predMAE?.sec_kWh_m3 ?? "",
        ].join(","),
      );
      if (seed === SEEDS[0]) {
        trajectories[id][method] = downsample(r);
        if (method === "hybrid") {
          decisionLog[id] = r.decisions.map((d) => ({
            t: d.t,
            verdict: d.verdict,
            message: d.message,
            focusTrain: d.focusTrain,
            confidence: +d.confidence.toFixed(3),
            chosen: d.chosen && { P: d.chosen.P, Qv: d.chosen.Qv, focusMode: d.chosen.focusMode },
            reasons: d.reasons,
          }));
        }
      }
      if (method === "fixed") {
        // Monitoring-mode lead time on the no-action trajectory.
        const ev = criticalEvent(r);
        eventKind = ev.kind ?? eventKind;
        leads.event.push(ev.t);
        const conv = firstBefore(r, "alarms", ev);
        leads.conventional.push(ev.t !== null && conv !== null ? ev.t - conv : null);
        for (const mon of ["physics", "mlonly", "hybrid"] as const) {
          const rm = mon === "hybrid" ? r : run(id, "fixed", seed, mon);
          const w = firstBefore(rm, "warnings", ev);
          leads[mon].push(ev.t !== null && w !== null ? ev.t - w : null);
          if (id === "normal") falseWarn[mon].push(rm.steps.filter((s) => s.warnings.length).length * rm.options.dt_h!);
        }
        if (id === "normal") falseWarn.conventional.push(r.steps.filter((s) => s.alarms.length).length * r.options.dt_h!);
      }
    }
    results[id][method] = summarise(ms);
    console.log(`${id.padEnd(11)} ${method.padEnd(8)} done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  leadTime[id] = {
    eventKind,
    event_h: mean(leads.event),
    eventsObserved: leads.event.filter((x) => x !== null).length,
    conventional_h: mean(leads.conventional),
    physics_h: mean(leads.physics),
    mlonly_h: mean(leads.mlonly),
    hybrid_h: mean(leads.hybrid),
    // Number of observed events that each monitor warned about in advance.
    warned: {
      conventional: leads.conventional.filter((x) => x !== null).length,
      physics: leads.physics.filter((x) => x !== null).length,
      mlonly: leads.mlonly.filter((x) => x !== null).length,
      hybrid: leads.hybrid.filter((x) => x !== null).length,
    },
    ...(id === "normal"
      ? {
          falseWarningHours: {
            conventional: mean(falseWarn.conventional),
            physics: mean(falseWarn.physics),
            mlonly: mean(falseWarn.mlonly),
            hybrid: mean(falseWarn.hybrid),
          },
        }
      : {}),
  };
}

// Robustness to the time of day at which the disturbance starts (demand and
// seawater follow daily cycles): scenarios where fixed operation violates a
// limit, 6 start times, seed 1.
const START_CLOCKS = [0, 4, 8, 12, 16, 20];
const startTimes: Record<string, Record<string, Record<Method, number>>> = {};
for (const id of ["salinity", "energy", "demand"] as ScenarioId[]) {
  startTimes[id] = {};
  for (const clock of START_CLOCKS) {
    const row = {} as Record<Method, number>;
    for (const method of METHODS) row[method] = +run(id, method, 1, method === "fixed" ? "hybrid" : undefined, clock).metrics.anyViolation_h.toFixed(2);
    startTimes[id][String(clock)] = row;
  }
  console.log(`start-time sweep ${id} done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

let commit = "unknown";
let codeDirty: boolean | null = null;
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
  // uncommitted changes to the code that produces these numbers (src/, scripts/, ml/)
  codeDirty =
    execSync("git status --porcelain -- src scripts ml", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim().length > 0;
} catch {
  /* repository without commits */
}

const out = {
  meta: {
    created: new Date().toISOString(),
    gitCommit: commit,
    codeDirty,
    seeds: SEEDS,
    horizon_h: 24,
    dt_h: 1 / 6,
    decisionInterval_h: 1,
    plant: "reference (simulated)",
    modelBundle: bundle.meta,
    degradation,
    durationSeconds: Math.round((Date.now() - t0) / 1000),
    command: "npx tsx scripts/run-experiments.ts",
    quick,
  },
  scenarios: SCENARIO_IDS.map((id) => ({ id, name: SCENARIOS[id].name, tag: SCENARIOS[id].tag, represents: SCENARIOS[id].represents })),
  methods: METHODS,
  results,
  leadTime,
  startTimes,
  trajectories,
  decisions: decisionLog,
};

const pub = join(ROOT, "public", "data", "validation");
const expDir = join(ROOT, "data", "experiments");
mkdirSync(pub, { recursive: true });
mkdirSync(expDir, { recursive: true });
writeFileSync(join(pub, quick ? "results-quick.json" : "results.json"), JSON.stringify(out));
writeFileSync(join(expDir, quick ? "runs-quick.csv" : "runs.csv"), csvRows.join("\n") + "\n");
writeFileSync(join(expDir, quick ? "lead-time-quick.json" : "lead-time.json"), JSON.stringify(leadTime, null, 2));
console.log(`\nwrote results for ${SCENARIO_IDS.length} scenarios × ${METHODS.length} methods × ${SEEDS.length} seeds in ${out.meta.durationSeconds} s`);
