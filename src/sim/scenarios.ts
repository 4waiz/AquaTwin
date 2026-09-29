/**
 * Disturbance scenarios (docs/MODEL.md §6). Every scenario is a set of
 * deterministic functions of time t (hours from "now"). Magnitudes are
 * illustrative stress tests chosen to be physically plausible for Gulf SWRO;
 * they are not reconstructions of specific historical events.
 */

import { BASE_ENV, GRID_CARBON_BASE } from "./config";
import type { Environment } from "./types";

export type ScenarioId = "normal" | "salinity" | "algal" | "fouling" | "pump" | "energy" | "demand" | "temperature" | "sensor" | "extreme";

export type AssetId = "intake" | "pretreatment" | "pumps" | "ro1" | "ro2" | "ro3" | "product" | "brine";

export interface SensorCondition {
  noiseScale: number;
  tdsBias: number;
}

export interface ScenarioSpec {
  id: ScenarioId;
  name: string;
  tag: string;
  summary: string;
  /** What real-world situation the stress test represents. */
  represents: string;
  onset_h: number;
  horizon_h: number;
  env: (t: number, clock_h: number) => Environment;
  demandMultiplier: (t: number) => number;
  /** Plant power cap in kW, or null when unconstrained. Relative to baseline power (set at run time). */
  powerCapFraction: (t: number) => number | null;
  trainFoulingMultiplier: (t: number) => [number, number, number];
  pumpWear: (t: number) => [number, number, number];
  pumpHeadLoss: (t: number) => [number, number, number];
  sensor: (t: number) => SensorCondition;
  /** Illustrative grid-carbon intensity multiplier over time (1 = typical). */
  carbonMultiplier: (t: number) => number;
  affected: AssetId[];
  /** Shown in the Scenario Lab; validation-only scenarios are hidden there. */
  inLab: boolean;
}

/** Smooth 0→1 transition between t0 and t1 (cubic smoothstep). */
export function ramp(t: number, t0: number, t1: number): number {
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  const x = (t - t0) / (t1 - t0);
  return x * x * (3 - 2 * x);
}

/** Rise over [start, start+rise], hold until `end`, decay over `fall`. */
export function pulse(t: number, start: number, rise: number, end: number, fall: number): number {
  return ramp(t, start, start + rise) * (1 - ramp(t, end, end + fall));
}

/** Baseline seawater: small diurnal temperature cycle, quasi-constant salinity. */
export function baseEnvironment(clock_h: number): Environment {
  const h = ((clock_h % 24) + 24) % 24;
  return {
    salinity_gL: BASE_ENV.salinity_gL + 0.12 * Math.sin((2 * Math.PI * (h - 4)) / 24),
    temperature_C: BASE_ENV.temperature_C + 0.35 * Math.sin((2 * Math.PI * (h - 9)) / 24),
    turbidity_NTU: BASE_ENV.turbidity_NTU + 0.15 * Math.sin((2 * Math.PI * (h - 13)) / 24),
    pH: BASE_ENV.pH,
    foulingPotential: 1,
    intakeCapacity: 1,
  };
}

const ONE = () => 1;
const NONE = () => null;
const NO_TRAIN: () => [number, number, number] = () => [1, 1, 1];
const ZERO_TRAIN: () => [number, number, number] = () => [0, 0, 0];
const CLEAN_SENSORS = (): SensorCondition => ({ noiseScale: 1, tdsBias: 0 });

function base(id: ScenarioId, over: Partial<ScenarioSpec>): ScenarioSpec {
  return {
    id,
    name: "",
    tag: "",
    summary: "",
    represents: "",
    onset_h: 1,
    horizon_h: 24,
    env: (_t, clock) => baseEnvironment(clock),
    demandMultiplier: ONE,
    powerCapFraction: NONE,
    trainFoulingMultiplier: NO_TRAIN,
    pumpWear: ZERO_TRAIN,
    pumpHeadLoss: ZERO_TRAIN,
    sensor: CLEAN_SENSORS,
    carbonMultiplier: ONE,
    affected: [],
    inLab: true,
    ...over,
  };
}

export const SCENARIOS: Record<ScenarioId, ScenarioSpec> = {
  normal: base("normal", {
    name: "Normal operation",
    tag: "No disturbance",
    summary: "Seawater and demand follow their normal daily cycle.",
    represents: "Reference day used to compare every stress test against.",
    inLab: false,
  }),

  salinity: base("salinity", {
    name: "Salinity shock",
    tag: "+15% feed salinity",
    summary: "Intake salinity rises 15% over 2 h, holds for 11 h, then recovers.",
    represents: "Brine-plume recirculation to the intake or a regional salinity excursion.",
    env: (t, clock) => {
      const e = baseEnvironment(clock);
      return { ...e, salinity_gL: e.salinity_gL * (1 + 0.15 * pulse(t, 1, 2, 14, 4)) };
    },
    affected: ["intake", "pumps", "ro1", "ro2", "ro3"],
  }),

  algal: base("algal", {
    name: "Algal bloom",
    tag: "High intake turbidity",
    summary: "Turbidity climbs to ~14 NTU, organic load and fouling potential rise 6×, intake capacity drops 15%.",
    represents: "Harmful algal bloom reaching the open intake (cf. 2008–09 Gulf of Oman / Arabian Gulf bloom).",
    env: (t, clock) => {
      const e = baseEnvironment(clock);
      const p = pulse(t, 1, 2.5, 16, 6);
      return {
        ...e,
        turbidity_NTU: e.turbidity_NTU + 12 * p,
        pH: e.pH + 0.15 * p,
        foulingPotential: 1 + 5 * p,
        intakeCapacity: 1 - 0.15 * p,
      };
    },
    affected: ["intake", "pretreatment", "ro1", "ro2", "ro3"],
  }),

  fouling: base("fouling", {
    name: "Membrane fouling",
    tag: "Train 2 permeability decline",
    summary: "Train 2 normalised permeate flow starts falling ~0.35%/h (severe biofouling after a biocide-dosing fault).",
    represents: "Rapid biofouling on one train, e.g. after loss of chlorination / biocide control.",
    trainFoulingMultiplier: (t) => [1, 1 + 139 * ramp(t, 1, 2.5), 1],
    affected: ["ro2"],
  }),

  pump: base("pump", {
    name: "Pump degradation",
    tag: "−12% HP pump efficiency",
    summary: "Train 1 HP pump loses 12% hydraulic efficiency and 5% head over 2 h.",
    represents: "Impeller / wear-ring damage or cavitation erosion on a high-pressure pump.",
    pumpWear: (t) => [0.12 * ramp(t, 1, 3), 0, 0],
    pumpHeadLoss: (t) => [0.05 * ramp(t, 1, 3), 0, 0],
    affected: ["pumps", "ro1"],
  }),

  energy: base("energy", {
    name: "Energy constraint",
    tag: "Grid peak: −20% power",
    summary: "Plant power is capped at 80% of normal between +3 h and +9 h.",
    represents: "Grid peak-demand period or curtailment request from the utility.",
    powerCapFraction: (t) => (t >= 3 && t < 9 ? 0.8 : null),
    carbonMultiplier: (t) => 1 + 0.25 * pulse(t, 2.5, 0.5, 9, 0.5),
    affected: ["pumps"],
  }),

  demand: base("demand", {
    name: "Demand surge",
    tag: "+20% product demand",
    summary: "Municipal demand rises 20% for 18 h.",
    represents: "Heat-wave demand peak or supply loss elsewhere in the network.",
    demandMultiplier: (t) => 1 + 0.2 * pulse(t, 1, 1, 19, 3),
    affected: ["product"],
  }),

  temperature: base("temperature", {
    name: "Temperature shock",
    tag: "+5 °C seawater",
    summary: "Feed temperature rises 5 °C over 3 h and holds.",
    represents: "Marine heat event or thermal plume at the intake.",
    env: (t, clock) => {
      const e = baseEnvironment(clock);
      return { ...e, temperature_C: e.temperature_C + 5 * pulse(t, 1, 3, 16, 4) };
    },
    affected: ["intake", "ro1", "ro2", "ro3"],
    inLab: false,
  }),

  sensor: base("sensor", {
    name: "Sensor degradation",
    tag: "3× noise + drift",
    summary: "Sensor noise triples and the permeate conductivity sensor drifts +0.5%/h.",
    represents: "Instrument fouling or calibration drift.",
    sensor: (t) => ({
      noiseScale: 1 + 2 * ramp(t, 1, 1.5),
      tdsBias: 0.005 * Math.max(0, t - 2),
    }),
    affected: [],
    inLab: false,
  }),

  extreme: base("extreme", {
    name: "Compound extreme",
    tag: "Outside model envelope",
    summary: "Salinity reaches 53 g/L and temperature 37.5 °C, beyond the conditions the model was trained on.",
    represents: "Compound event outside the model's validated envelope — tests safe abstention.",
    env: (t, clock) => {
      const e = baseEnvironment(clock);
      const p = pulse(t, 1, 2, 20, 3);
      return { ...e, salinity_gL: e.salinity_gL + 11.5 * p, temperature_C: e.temperature_C + 9 * p };
    },
    affected: ["intake", "ro1", "ro2", "ro3"],
    inLab: false,
  }),
};

export const LAB_SCENARIOS: ScenarioId[] = ["salinity", "algal", "fouling", "pump", "energy", "demand"];
export const VALIDATION_SCENARIOS: ScenarioId[] = ["normal", "salinity", "temperature", "fouling", "pump", "sensor", "algal"];

/** Illustrative grid carbon-intensity profile, kg CO₂/kWh (see Energy & Carbon page caveat). */
export function gridCarbonIntensity(clock_h: number, multiplier = 1, base = GRID_CARBON_BASE): number {
  const h = ((clock_h % 24) + 24) % 24;
  return base * (1 + 0.08 * Math.sin((2 * Math.PI * (h - 13)) / 24)) * multiplier;
}
