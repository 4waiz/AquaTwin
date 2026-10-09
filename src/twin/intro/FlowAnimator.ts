/**
 * Flow activation: water moves physically through the process:
 * sea → intake → pretreatment → HP pumps → RO trains, then RO splits into
 * product (tank fills) and brine (outfall starts last). Returns, for intro
 * time t, how far each pipe is filled and how "on" each subsystem is.
 * Pure function of time; the simulation state is untouched.
 */
import { pipeDefs } from "../scene/layout";
import { easeInOutCubic, easeOutCubic, INTRO, window01 } from "./timeline";

export interface FlowActivation {
  pipeFill: Record<string, number>;
  flowActive: number;
  sea: number;
  pretreatTanks: number;
  pumps: number;
  product: number;
  outfall: number;
}

const DEFS = pipeDefs();

export const FULL_FLOW: FlowActivation = {
  pipeFill: Object.fromEntries(DEFS.map((d) => [d.id, 1])),
  flowActive: 1,
  sea: 1,
  pretreatTanks: 1,
  pumps: 1,
  product: 1,
  outfall: 1,
};

export function flowAt(t: number): FlowActivation {
  const pipeFill: Record<string, number> = {};
  for (const d of DEFS) {
    const start = INTRO.activation + d.fillAt;
    pipeFill[d.id] = easeInOutCubic(window01(t, start, start + d.fillDuration));
  }
  return {
    pipeFill,
    flowActive: easeOutCubic(window01(t, INTRO.activation + 0.2, INTRO.end - 0.4)),
    sea: easeOutCubic(window01(t, INTRO.sea[0], INTRO.sea[1])),
    pretreatTanks: easeInOutCubic(window01(t, INTRO.pretreatTanks[0], INTRO.pretreatTanks[1])),
    pumps: easeInOutCubic(window01(t, INTRO.pumpsSpin[0], INTRO.pumpsSpin[1])),
    product: easeInOutCubic(window01(t, INTRO.product[0], INTRO.product[1])),
    outfall: easeOutCubic(window01(t, INTRO.outfall, INTRO.outfall + 0.6)),
  };
}
