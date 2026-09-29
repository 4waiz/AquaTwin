/**
 * Which charts each scenario foregrounds. All values come from the Scenario
 * Lab forecast (AquaTwin hybrid model run forward); nothing is canned.
 */
import type { ScenarioBranch, ScenarioPoint } from "@/runtime/protocol";
import type { ScenarioId } from "@/sim/scenarios";
import { LIMITS } from "@/sim/config";

export interface ChartSpec {
  id: string;
  title: string;
  unit: string;
  get: (p: ScenarioPoint) => number | null;
  limit?: { value: number; label: string; violates: "above" | "below"; tone: "warn" | "crit" };
  yFormat?: (v: number) => string;
  yDomain?: [number, number];
}

export const PRODUCTION: ChartSpec = {
  id: "production",
  title: "Production vs demand",
  unit: "m³/h",
  get: (p) => p.production,
};

export const RESERVOIR: ChartSpec = {
  id: "reservoir",
  title: "Product-water storage",
  unit: "% of capacity",
  get: (p) => p.reservoir,
  limit: { value: LIMITS.minReservoirFraction * 100, label: "Reserve minimum", violates: "below", tone: "crit" },
  yDomain: [0, 100],
};

export const TDS: ChartSpec = {
  id: "tds",
  title: "Permeate TDS",
  unit: "mg/L",
  get: (p) => p.tds,
  limit: { value: LIMITS.maxPermeateTDS_mgL, label: "Permeate spec", violates: "above", tone: "crit" },
};

export const PRESSURE: ChartSpec = {
  id: "pressure",
  title: "Max feed pressure",
  unit: "bar",
  get: (p) => Math.max(...p.pressure.map((x, i) => (p.online[i] ? x : 0))),
  limit: { value: LIMITS.maxFeedPressure_bar, label: "Pressure limit", violates: "above", tone: "crit" },
  yFormat: (v) => v.toFixed(0),
};

export const HEALTH_T2: ChartSpec = {
  id: "health2",
  title: "Train 2 normalised permeate flow",
  unit: "%",
  get: (p) => p.health[1] * 100,
  limit: { value: LIMITS.cipHealthThreshold * 100, label: "Cleaning threshold", violates: "below", tone: "warn" },
  yFormat: (v) => v.toFixed(0),
};

export const POWER: ChartSpec = {
  id: "power",
  title: "Plant power",
  unit: "MW",
  get: (p) => p.power / 1000,
  yFormat: (v) => v.toFixed(1),
};

export const SEC: ChartSpec = {
  id: "sec",
  title: "Specific energy",
  unit: "kWh/m³",
  get: (p) => p.sec,
  yFormat: (v) => v.toFixed(2),
};

export const PUMP_EFF: ChartSpec = {
  id: "pumpEff",
  title: "Train 1 pump-set efficiency",
  unit: "%",
  get: (p) => p.pumpEff[0] * 100,
  yFormat: (v) => v.toFixed(0),
};

export const SCENARIO_CHARTS: Record<ScenarioId, ChartSpec[]> = {
  salinity: [PRODUCTION, RESERVOIR, TDS],
  algal: [PRODUCTION, SEC, TDS],
  fouling: [HEALTH_T2, PRODUCTION, TDS],
  pump: [SEC, PRODUCTION, PRESSURE],
  energy: [POWER, RESERVOIR, PRODUCTION],
  demand: [PRODUCTION, RESERVOIR, PRESSURE],
  normal: [PRODUCTION, RESERVOIR, TDS],
  temperature: [PRODUCTION, TDS, SEC],
  sensor: [PRODUCTION, TDS, SEC],
  extreme: [PRODUCTION, TDS, PRESSURE],
};

/** Power cap series (MW), if the scenario has one. */
export function capSeries(b: ScenarioBranch): (number | null)[] {
  return b.points.map((p) => (p.cap === null ? null : p.cap / 1000));
}
