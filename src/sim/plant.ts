/**
 * Plant-level aggregation: totals, auxiliary loads and specific energy
 * consumption (docs/MODEL.md §3). Shared by the reference plant and the twin,
 * so the two models differ only in their RO-train and pump physics.
 */

import { ENERGY, LIMITS, PLANT } from "./config";
import type { EnergyBreakdown, Environment, PlantTotals, TrainOutputs } from "./types";

/** Fraction of intake flow used for filter backwash / DAF recycle; rises with turbidity [assumed]. */
export function backwashFraction(turbidity_NTU: number): number {
  return Math.min(0.09, 0.03 + 0.0025 * Math.max(0, turbidity_NTU - 2));
}

export function aggregate(trains: TrainOutputs[], env: Environment): PlantTotals {
  let feed = 0;
  let prod = 0;
  let brine = 0;
  let saltP = 0;
  let saltB = 0;
  let hp = 0;
  let booster = 0;
  let erd = 0;
  let ro = 0;
  for (const t of trains) {
    if (!t.online) continue;
    feed += t.feedFlow_m3h;
    prod += t.permeateFlow_m3h;
    brine += t.brineFlow_m3h;
    saltP += t.permeateFlow_m3h * t.permeateTDS_mgL;
    saltB += t.brineFlow_m3h * t.brineTDS_gL;
    hp += t.hpPumpPower_kW;
    booster += t.boosterPower_kW;
    erd += t.erdRecovered_kW;
    ro += t.roPower_kW;
  }
  const intakeFlow = feed * (1 + backwashFraction(env.turbidity_NTU));
  const intake_kW = (intakeFlow * ENERGY.intakeHead_bar) / (36 * ENERGY.intakeEfficiency);
  const turbFactor = 1 + 0.08 * Math.max(0, env.turbidity_NTU - 2);
  const pretreat_kW = (intakeFlow * ENERGY.pretreatHead_bar) / (36 * ENERGY.pretreatEfficiency) + intakeFlow * ENERGY.pretreatBase_kWh_per_m3feed * turbFactor;
  const post_kW = prod * ENERGY.postTreat_kWh_per_m3;
  const base_kW = feed > 0 ? ENERGY.plantBase_kW : ENERGY.plantBase_kW * 0.5;
  const power = intake_kW + pretreat_kW + ro + post_kW + base_kW;
  const per = (kW: number) => (prod > 0 ? kW / prod : 0);
  // The twin's lumped model does not split HP pump / booster; report RO as HP.
  const breakdown: EnergyBreakdown = {
    intake: per(intake_kW),
    pretreatment: per(pretreat_kW),
    hpPump: per(hp > 0 ? hp : ro),
    booster: per(booster),
    erdRecovered: per(erd),
    postTreatment: per(post_kW),
    base: per(base_kW),
  };
  return {
    production_m3h: prod,
    feedFlow_m3h: feed,
    brineFlow_m3h: brine,
    recovery: feed > 0 ? prod / feed : 0,
    permeateTDS_mgL: prod > 0 ? saltP / prod : 0,
    brineTDS_gL: brine > 0 ? saltB / brine : 0,
    power_kW: power,
    sec_kWh_m3: prod > 0 ? power / prod : 0,
    energyBreakdown_kWh_m3: breakdown,
  };
}

/** Municipal demand profile, m³/h, for sim time t (hours since 00:00 of day 0) [assumed]. */
export function demandAt(t_h: number, multiplier = 1): number {
  const mean = PLANT.meanDemand_m3d / 24;
  const h = ((t_h % 24) + 24) % 24;
  const diurnal = 1 + 0.1 * Math.sin((2 * Math.PI * (h - 10)) / 24) + 0.035 * Math.sin((4 * Math.PI * (h - 7)) / 24);
  return mean * diurnal * multiplier;
}

export function reservoirBounds() {
  return {
    min_m3: LIMITS.minReservoirFraction * PLANT.reservoirCapacity_m3,
    max_m3: LIMITS.maxReservoirFraction * PLANT.reservoirCapacity_m3,
  };
}
