/**
 * AquaTwin reduced-order ("0D", lumped) SWRO train model.
 *
 * Solution–diffusion transport with lumped approximations (docs/MODEL.md §2):
 *   (E1) Jw = A(T) · NDP,  NDP = P_f − ΔP/2 − P_p − [π(β·C̄) − π(C_p)]
 *   (E2) C_p = B(T) · β·C̄ / (Jw + B(T))
 *   (E3) C̄  = C_f · ln(1/(1−r)) / r             (log-mean feed-side concentration)
 *   (E4) ΔP  = k_dp · Q̄^1.75,  Q̄ = Q_f,v (1 − r/2)
 *   (E5) Jw  = r · Q_f,v / A_v                    (mass balance)
 *   (E6) W_RO = [Q_f P_f − η_ERD Q_b (P_f − ΔP)] / (36 η_pump)   [kW; Q in m³/h, P in bar]
 * with constant concentration-polarisation factor β, linear osmotic pressure
 * and one temperature factor for both A and B. The recovery r is found by
 * bisection on (E1) = (E5), which is monotone in r.
 */

import { ELEMENT, ENERGY, MEMBRANE, PLANT } from "./config";
import { arrhenius, osmoticPressureLinear } from "./seawater";
import type { TrainOutputs, TrainSetpoint, TwinParams } from "./types";

export const CP_FACTOR_0D = 1.1;
export const VESSEL_AREA_m2 = ELEMENT.area_m2 * ELEMENT.elementsPerVessel;

export interface Env0D {
  salinity_gL: number;
  temperature_C: number;
}

export function offlineTrain(): TrainOutputs {
  return {
    online: false,
    feedPressure_bar: 0,
    feedFlow_m3h: 0,
    permeateFlow_m3h: 0,
    brineFlow_m3h: 0,
    recovery: 0,
    permeateTDS_mgL: 0,
    membraneFeedTDS_gL: 0,
    brineTDS_gL: 0,
    avgFlux_LMH: 0,
    vesselDP_bar: 0,
    ndp_bar: 0,
    osmoticAvg_bar: 0,
    cpFactor: 1,
    roPower_kW: 0,
    hpPumpPower_kW: 0,
    boosterPower_kW: 0,
    erdRecovered_kW: 0,
    hpPumpEfficiency: 0,
    pumpSpeedRel: 0,
    motorLimited: false,
  };
}

/** Log-mean concentration factor ln(1/(1−r))/r with the r → 0 limit. */
export function logMeanFactor(r: number): number {
  if (r < 1e-6) return 1 + r / 2;
  return Math.log(1 / (1 - r)) / r;
}

/** Shared single-train 0D solve. Returns null when the feed pressure cannot overcome osmotic pressure. */
export function solveTrain0D(env: Env0D, sp: TrainSetpoint, p: TwinParams, vessels: number = PLANT.vesselsPerTrain): TrainOutputs {
  if (!sp.online || sp.feedFlowPerVessel_m3h <= 0) return offlineTrain();

  const T = env.temperature_C;
  const Cf = env.salinity_gL;
  const P = sp.feedPressure_bar;
  const Qv = sp.feedFlowPerVessel_m3h;
  const Pp = PLANT.permeatePressure_bar;
  const beta = CP_FACTOR_0D;
  const tcf = arrhenius(T, MEMBRANE.tcfHigh_K);
  const A = p.A25 * tcf;
  const B = p.B25 * tcf;

  const evalAt = (r: number) => {
    const J = (r * Qv * 1000) / VESSEL_AREA_m2; // LMH
    const Cbar = Cf * logMeanFactor(r);
    const Cm = beta * Cbar;
    const Cp = (B * Cm) / (J + B); // g/L
    const Qbar = Qv * (1 - r / 2);
    const dp = p.kdp * Math.pow(Qbar, 1.75);
    const dPi = osmoticPressureLinear(Cm, T) - osmoticPressureLinear(Cp, T);
    const ndp = P - dp / 2 - Pp - dPi;
    return { J, Cbar, Cm, Cp, dp, dPi, ndp, g: A * ndp - J };
  };

  let r = 0;
  let s = evalAt(0);
  if (s.g > 0) {
    let lo = 0;
    let hi = 0.95;
    for (let i = 0; i < 48; i++) {
      const mid = 0.5 * (lo + hi);
      if (evalAt(mid).g > 0) lo = mid;
      else hi = mid;
    }
    r = 0.5 * (lo + hi);
    s = evalAt(r);
  } else {
    r = 0;
  }

  const Qf = Qv * vessels;
  const Qp = r * Qf;
  const Qb = Qf - Qp;
  const Cb = Qb > 0 ? (Qf * Cf - Qp * s.Cp) / Qb : Cf;
  const Pb = P - s.dp;
  const eta = p.pumpEff;
  const recovered = ENERGY.twinErdEfficiency * Qb * Pb;
  const roPower = (Qf * P - recovered) / (36 * eta);

  return {
    online: true,
    feedPressure_bar: P,
    feedFlow_m3h: Qf,
    permeateFlow_m3h: Qp,
    brineFlow_m3h: Qb,
    recovery: r,
    permeateTDS_mgL: s.Cp * 1000,
    membraneFeedTDS_gL: Cf,
    brineTDS_gL: Cb,
    avgFlux_LMH: s.J,
    vesselDP_bar: s.dp,
    ndp_bar: s.ndp,
    osmoticAvg_bar: s.dPi,
    cpFactor: beta,
    roPower_kW: roPower,
    hpPumpPower_kW: (Qp * (P - PLANT.lpSupplyPressure_bar)) / (36 * eta),
    boosterPower_kW: Math.max(0, roPower - (Qp * (P - PLANT.lpSupplyPressure_bar)) / (36 * eta)),
    erdRecovered_kW: recovered / 36,
    hpPumpEfficiency: eta,
    pumpSpeedRel: Math.sqrt(Math.max(P - PLANT.lpSupplyPressure_bar, 0) / (PLANT.design.feedPressure_bar - PLANT.lpSupplyPressure_bar)),
    motorLimited: false,
  };
}

/**
 * Inverse of the 0D model: estimate the lumped parameters of a train from one
 * set of (possibly noisy) measurements. This is AquaTwin's self-calibration
 * step (docs/MODEL.md §4) and mirrors ASTM D4516-style normalisation.
 */
export function calibrate0D(
  env: Env0D,
  m: {
    feedPressure_bar: number;
    feedFlow_m3h: number;
    permeateFlow_m3h: number;
    permeateTDS_mgL: number;
    vesselDP_bar: number;
    roPower_kW: number;
  },
  vessels: number = PLANT.vesselsPerTrain,
): TwinParams | null {
  const Qf = m.feedFlow_m3h;
  const Qp = m.permeateFlow_m3h;
  if (Qf <= 0 || Qp <= 0 || Qp >= Qf) return null;
  const T = env.temperature_C;
  const r = Qp / Qf;
  const Qv = Qf / vessels;
  const J = (Qp * 1000) / (vessels * VESSEL_AREA_m2);
  const Cm = CP_FACTOR_0D * env.salinity_gL * logMeanFactor(r);
  const Cp = m.permeateTDS_mgL / 1000;
  const dPi = osmoticPressureLinear(Cm, T) - osmoticPressureLinear(Cp, T);
  const ndp = m.feedPressure_bar - m.vesselDP_bar / 2 - PLANT.permeatePressure_bar - dPi;
  if (ndp <= 0.5) return null;
  const tcf = arrhenius(T, MEMBRANE.tcfHigh_K);
  const A25 = J / ndp / tcf;
  const B25 = (J * Cp) / Math.max(Cm - Cp, 1e-6) / tcf;
  const Qbar = Qv * (1 - r / 2);
  const kdp = m.vesselDP_bar / Math.pow(Qbar, 1.75);
  const Qb = Qf - Qp;
  const Pb = m.feedPressure_bar - m.vesselDP_bar;
  const hydraulicNet = (Qf * m.feedPressure_bar - ENERGY.twinErdEfficiency * Qb * Pb) / 36;
  const pumpEff = m.roPower_kW > 0 ? Math.min(Math.max(hydraulicNet / m.roPower_kW, 0.3), 0.99) : ENERGY.twinLumpedPumpEfficiency;
  return { A25, B25, kdp, pumpEff };
}
