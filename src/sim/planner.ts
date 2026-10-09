/**
 * Supervisory production planning (docs/MODEL.md §7.1).
 *
 * Converts the demand forecast, reservoir level and any upcoming power-cap
 * window into (a) a hard minimum production that keeps the reservoir above its
 * reserve level for the next decision interval, (b) a hard maximum that avoids
 * overflow, and (c) a soft production target that steers the reservoir towards
 * its set level, raised in advance of a known power-cap window so storage can
 * carry the plant through it.
 */

import { LIMITS, PLANT } from "./config";

export interface PlanInput {
  reservoir_m3: number;
  /** Mean forecast demand over the next decision interval, m³/h. */
  demandNext_m3h: number;
  /** Hours until a power-cap window starts (0 if inside one, Infinity if none ahead). */
  hoursToCap: number;
  inCapWindow: boolean;
  interval_h: number;
}

export interface ProductionPlan {
  target_m3h: number;
  min_m3h: number;
  max_m3h: number;
  levelTarget: number;
}

export const RESERVOIR_SET_LEVEL = 0.6;
export const RESERVOIR_PREFILL_LEVEL = 0.9;
const RESERVE_MARGIN = 0.03;
const TAU_h = 5;

export function planProduction(p: PlanInput): ProductionPlan {
  const cap = PLANT.reservoirCapacity_m3;
  const floor = (LIMITS.minReservoirFraction + RESERVE_MARGIN) * cap;
  const ceiling = (LIMITS.maxReservoirFraction - 0.01) * cap;
  const min = Math.max(0, p.demandNext_m3h - (p.reservoir_m3 - floor) / p.interval_h);
  const max = Math.max(min, p.demandNext_m3h + (ceiling - p.reservoir_m3) / p.interval_h);
  let levelTarget = RESERVOIR_SET_LEVEL;
  if (!p.inCapWindow && p.hoursToCap <= 8) levelTarget = RESERVOIR_PREFILL_LEVEL;
  let target = p.demandNext_m3h + (levelTarget * cap - p.reservoir_m3) / TAU_h;
  target = Math.min(Math.max(target, min), max);
  return { target_m3h: target, min_m3h: min, max_m3h: max, levelTarget };
}
