/**
 * Message protocol between the UI thread and the twin worker.
 * The worker owns the simulated plant, the model bundle and every heavy
 * computation (scenario runs, optimisation, probes) so the render loop and
 * the interface never stall.
 */

import type { GuardDecision } from "@/sim/aquaguard";
import type { DecisionRecord } from "@/sim/closedLoop";
import type { ObjectiveWeights, Objectives, FocusMode } from "@/sim/optimizer";
import type { ScenarioId } from "@/sim/scenarios";
import type { ModelKind, TrainContext } from "@/sim/twin";
import type { Environment, PlantTotals, TrainOutputs, TrainSetpoint, TwinParams } from "@/sim/types";
import type { OodResult } from "@/sim/ml";

export interface TrainHealth {
  npf: number;
  nsp: number;
  ndp: number;
  qpStd: number;
  qpClean: number;
  /** Hybrid prediction of a clean train's permeate flow at the CURRENT conditions and setpoint, m³/h. */
  qpCleanNow?: number;
}

export interface HybridBreakdown {
  /** Physics (0D) prediction at the current operating point. */
  physics: { Qp: number; Cp: number; dP: number; W: number };
  /** ML residual, applied in each target's space. */
  residual: { Q: number; C: number; D: number; W: number } | null;
  /** Hybrid (final) estimate. */
  hybrid: { Qp: number; Cp: number; dP: number; W: number };
  /** Measured (noisy telemetry) value. */
  measured: { Qp: number; Cp: number; dP: number; W: number };
  /** 90 % half-widths in residual space. */
  margins: { Q: number; C: number; D: number; W: number } | null;
  ood: OodResult | null;
}

export interface LiveSnapshot {
  /** Epoch ms of the simulated plant clock. */
  simTime: number;
  speed: number;
  env: Environment;
  setpoints: TrainSetpoint[];
  /** Telemetry as measured (noisy) by the simulated plant's sensors. */
  trains: TrainOutputs[];
  totals: PlantTotals;
  demand_m3h: number;
  reservoirFraction: number;
  health: TrainHealth[];
  healthTrend: { slopePctPerHour: number; hours: number | null; lo: number | null; hi: number | null; probWithin: number; r2: number }[];
  theta: TwinParams[];
  hybrid: HybridBreakdown[];
  guard: GuardDecision;
  confidence: number;
  status: "stable" | "watch" | "warning" | "critical";
  alerts: { level: "info" | "warning" | "critical"; text: string }[];
  carbonIntensity: number;
  /** What the twin currently knows about each train (self-calibrated). */
  contexts: TrainContext[];
}

export interface HistoryPoint {
  t: number; // epoch ms
  production: number;
  sec: number;
  tds: number;
  recovery: number;
  reservoir: number;
  power: number;
  salinity: number;
  temperature: number;
  turbidity: number;
  pH: number;
  feedTds: number;
  rejection: number;
  pressure: number;
  health: number[];
  nsp: number[];
  ndp: number[];
  measuredQp: number[];
  expectedQp: number[];
  carbon: number;
}

export interface ScenarioPoint {
  t: number;
  production: number;
  demand: number;
  tds: number;
  sec: number;
  power: number;
  reservoir: number;
  recovery: number;
  pressure: number[];
  feedFlow: number[];
  trainProduction: number[];
  trainTds: number[];
  health: number[];
  dp: number[];
  pumpSpeed: number[];
  pumpEff: number[];
  motorLimited: boolean[];
  online: boolean[];
  salinity: number;
  temperature: number;
  turbidity: number;
  pH: number;
  cap: number | null;
  carbon: number;
  violations: string[];
  confidence: number;
  energy: { intake: number; pretreatment: number; hpPump: number; booster: number; erdRecovered: number; postTreatment: number; base: number };
}

export interface ScenarioBranch {
  points: ScenarioPoint[];
  metrics: {
    production_m3: number;
    energy_MWh: number;
    sec: number;
    maxTds: number;
    violationHours: number;
    violationBy: Record<string, number>;
    minReservoir: number;
    carbon_t: number;
    firstViolation: number | null;
    cipCrossing: (number | null)[];
  };
  decisions: DecisionRecord[];
}

export interface ScenarioResult {
  scenario: ScenarioId;
  startClock_h: number;
  createdAt: number;
  computeMs: number;
  baseline: ScenarioBranch;
  noAction: ScenarioBranch;
  aquatwin: ScenarioBranch;
}

export interface CandidateLite {
  id: number;
  P: number;
  Qv: number;
  focusMode: FocusMode;
  focusTrain: number | null;
  setpoints: TrainSetpoint[];
  objectives: Objectives;
  score: number;
  feasible: boolean;
  pareto: boolean;
  verdict: GuardDecision["verdict"];
  guard: GuardDecision;
  trains: { P: number; Qp: number; recovery: number; flux: number; tds: number; dp: number; power: number; online: boolean }[];
}

export interface OptimizationSnapshot {
  context: { scenario: ScenarioId | "live"; t: number; label: string };
  env: Environment;
  plan: { target_m3h: number; min_m3h: number; max_m3h: number };
  powerCap_kW: number | null;
  focusTrain: number | null;
  candidates: CandidateLite[];
  bestId: number | null;
  current: CandidateLite;
  verdict: GuardDecision["verdict"];
  message: string;
  relaxed: boolean;
  computeMs: number;
  weights: ObjectiveWeights;
}

export interface ProbeInput {
  salinity_gL: number;
  temperature_C: number;
  feedPressure_bar: number;
  feedFlowPerVessel_m3h: number;
  health: number;
}

export interface ProbeResult {
  physics: { Qp: number; Cp: number; dP: number; W: number };
  mlonly: { Qp: number; Cp: number; dP: number; W: number } | null;
  hybrid: { Qp: number; Cp: number; dP: number; W: number };
  reference: { Qp: number; Cp: number; dP: number; W: number };
  ood: OodResult | null;
  confidence: number;
  verdict: GuardDecision["verdict"];
  guard: GuardDecision;
  margins: { Q: number; C: number; D: number; W: number } | null;
}

export interface EnvelopeGrid {
  P: number[];
  Qv: number[];
  /** feasibility code per cell: 0 ok, else bitmask of violated rules */
  code: number[][];
  tds: number[][];
  recovery: number[][];
  production: number[][];
  sec: number[][];
  operating: { P: number; Qv: number };
}

/** Requests to the live worker (simulated plant). */
export type LiveRequest =
  | { id: number; type: "init"; origin: string; speed: number }
  | { id: number; type: "setSpeed"; speed: number }
  | { id: number; type: "apply"; setpoints: TrainSetpoint[] }
  | { id: number; type: "resetPlant" };

/** Live state handed to the compute worker with every request. */
export interface LiveStateMsg {
  simTime: number;
  setpoints: TrainSetpoint[];
  reservoirFraction: number;
  health: number[];
  contexts: TrainContext[];
}

/** Requests to the compute worker (forecasts, optimisation, probes). */
export type ComputeRequest =
  | { id: number; type: "init"; origin: string }
  | { id: number; type: "scenario"; live: LiveStateMsg; scenario: ScenarioId; weights?: ObjectiveWeights; force?: boolean }
  | { id: number; type: "optimize"; live: LiveStateMsg; source: ScenarioId | "live"; t: number; weights?: ObjectiveWeights; kind?: ModelKind }
  | { id: number; type: "probe"; input: ProbeInput }
  | { id: number; type: "envelope"; live: LiveStateMsg; resolution?: number };

export type WorkerMessage =
  | { type: "ready"; modelMeta: unknown; loadMs: number }
  | { type: "live"; snapshot: LiveSnapshot; append?: HistoryPoint }
  | { type: "history"; points: HistoryPoint[] }
  | { type: "response"; id: number; ok: true; data: unknown }
  | { type: "response"; id: number; ok: false; error: string }
  | { type: "fatal"; error: string };
