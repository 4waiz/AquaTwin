/**
 * Reference ("virtual") SWRO plant: the stand-in for a physical plant.
 *
 * AquaTwin has no access to industrial data, so this higher-fidelity model
 * generates the "measured" telemetry that the twin sees, the training data for
 * the ML residual model, and the ground truth for validation experiments.
 * It deliberately includes physically real effects that the reduced-order
 * model omits (docs/MODEL.md §2.5):
 *   - axial discretisation: 7 elements × 2 segments per pressure vessel
 *   - film-theory concentration polarisation with flow-dependent mass transfer
 *   - non-ideal osmotic pressure (osmotic coefficient varies with salinity)
 *   - separate temperature dependence for water and salt permeability
 *   - pressure-dependent membrane compaction
 *   - element-resolved fouling (lead-element biofouling, ΔP growth, CECP)
 *   - HP pump efficiency curve, wear and motor power limit
 *   - isobaric ERD pressure loss, lubrication leakage and brine mixing
 * Results produced with this model are SIMULATED, not measured.
 */

import { ELEMENT, ENERGY, MEMBRANE, PLANT, SENSOR_NOISE } from "./config";
import { offlineTrain } from "./physics0d";
import { arrhenius, osmoticPressureRef, tcfWater } from "./seawater";
import type { Rng } from "./rng";
import type { Environment, TrainMeasurement, TrainOutputs, TrainSetpoint, TrainTrueState } from "./types";

export const REF = {
  segmentsPerElement: 2,
  /** Mass-transfer coefficient at the reference vessel flow, L m⁻² h⁻¹ [assumed; spiral-wound SWRO range]. */
  kmtRef_LMH: 150,
  kmtRefFlow_m3h: 10,
  kmtExponent: 0.6,
  /** Per-segment pressure-drop coefficient, bar/(m³/h)^1.75 → ≈1.3 bar per vessel at design. */
  kdpSegment: 0.0031,
  /** Membrane compaction: fractional A loss per 10 bar above 50 bar [assumed]. */
  compactionPer10bar: 0.006,
  /** Fouling → pressure-drop multiplier (spacer clogging) [assumed; ≈ +20 % NDP at the 10 % NPF cleaning point]. */
  foulDpFactor: 0.7,
  /** Fouling → salt-permeability multiplier (cake-enhanced polarisation) [assumed]. */
  foulSaltFactor: 0.35,
  /** Relative fouling distribution along the vessel (lead → tail) [assumed biofouling profile]. */
  foulingProfile: [1.9, 1.4, 1.1, 0.85, 0.7, 0.55, 0.5],
  /** Base fouling rate constant, h⁻¹ at J = J_ref and potential 1 [assumed; ≈ 0.6 %/week NPF decline at design]. */
  foulingRate_h: 1.0e-4,
  foulingRefFlux_LMH: 14,
  foulingMax: 0.6,
  /** HP pump best-efficiency flow per train, m³/h (≈ design permeate flow). */
  hpBEPFlow_m3h: 830,
  pxLeakageFraction: 0.015,
} as const;

const SEGMENTS = ELEMENT.elementsPerVessel * REF.segmentsPerElement;
const SEG_AREA = ELEMENT.area_m2 / REF.segmentsPerElement;

export interface RefTrainResult extends TrainOutputs {
  elementFlux_LMH: number[];
}

/** Initial element-level fouling state for a train with mean fouling φ̄. */
export function makeTrainState(meanFouling: number): TrainTrueState {
  const prof = REF.foulingProfile;
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  return {
    fouling: prof.map((w) => Math.min(REF.foulingMax, (meanFouling * w) / mean)),
    saltAgeing: 1,
    pumpWear: 0,
    pumpHeadLoss: 0,
  };
}

export function meanFouling(s: TrainTrueState): number {
  return s.fouling.reduce((a, b) => a + b, 0) / s.fouling.length;
}

function viscosityFactor(T_C: number): number {
  // Pressure drop scales weakly with viscosity; μ(T)/μ(25) ≈ exp(−0.0235 (T−25)).
  return Math.pow(Math.exp(-0.0235 * (T_C - 25)), 0.25);
}

interface VesselSolution {
  permeate_m3h: number; // per vessel
  permeateSalt_g_h: number;
  brine_m3h: number;
  brineTDS_gL: number;
  outletPressure_bar: number;
  elementFlux: number[];
  wallToBulk: number;
  ndpAvg: number;
  osmAvg: number;
}

/** March along one pressure vessel (identical vessels are assumed within a train). */
function solveVessel(P0: number, Qv: number, Cmf: number, T: number, state: TrainTrueState): VesselSolution {
  const tcfA = tcfWater(T, MEMBRANE.tcfHigh_K, MEMBRANE.tcfLow_K);
  const tcfB = arrhenius(T, MEMBRANE.tcfSalt_K);
  const visc = viscosityFactor(T);
  const kT = 1 + 0.02 * (T - 25); // diffusivity increases with temperature
  const Pp = PLANT.permeatePressure_bar;

  let Q = Qv;
  let C = Cmf;
  let P = P0;
  let permeate = 0;
  let salt = 0;
  let cmRatioSum = 0;
  let ndpSum = 0;
  let osmSum = 0;
  const elementFlux = new Array(ELEMENT.elementsPerVessel).fill(0);

  for (let s = 0; s < SEGMENTS; s++) {
    const el = Math.floor(s / REF.segmentsPerElement);
    const phi = state.fouling[el];
    const compaction = 1 - (REF.compactionPer10bar * Math.max(0, P - 50)) / 10;
    const A = MEMBRANE.A25_clean * tcfA * (1 - phi) * compaction;
    const B = MEMBRANE.B25_clean * tcfB * state.saltAgeing * (1 + REF.foulSaltFactor * phi);
    const kdp = REF.kdpSegment * (1 + REF.foulDpFactor * phi) * visc;

    const evalJ = (J: number) => {
      const qp = (J * SEG_AREA) / 1000;
      const qOut = Math.max(Q - qp, 1e-6);
      const cOut = (Q * C) / qOut; // bulk outlet (permeate salt negligible for bulk)
      const cb = 0.5 * (C + cOut);
      const qMid = 0.5 * (Q + qOut);
      const kmt = REF.kmtRef_LMH * Math.pow(qMid / REF.kmtRefFlow_m3h, REF.kmtExponent) * kT;
      const e = Math.exp(J / kmt);
      const cp = (B * cb * e) / (J + B * e);
      const cm = cp + (cb - cp) * e;
      const dp = kdp * Math.pow(qMid, 1.75);
      const osm = osmoticPressureRef(cm, T) - osmoticPressureRef(cp, T);
      const ndp = P - dp / 2 - Pp - osm;
      return { qp, qOut, cp, cm, cb, dp, ndp, osm, h: J - A * ndp };
    };

    // h(J) = J − A·NDP(J) is monotone increasing; solve with the Illinois
    // variant of regula falsi on a guaranteed bracket [0, hi].
    let J = 0;
    const at0 = evalJ(0);
    if (at0.ndp > 0) {
      const jCap = (0.6 * Q * 1000) / SEG_AREA; // cannot remove > 60 % of segment inflow
      let a = 0;
      let fa = at0.h;
      let b = Math.min(A * at0.ndp, jCap);
      let fb = evalJ(b).h;
      if (fb < 0) {
        b = jCap;
        fb = evalJ(b).h;
      }
      if (fb <= 0) {
        J = b;
      } else {
        let side = 0;
        for (let i = 0; i < 40; i++) {
          const c = (a * fb - b * fa) / (fb - fa);
          const fc = evalJ(c).h;
          if (Math.abs(fc) < 1e-9 || Math.abs(b - a) < 1e-10) {
            a = b = c;
            break;
          }
          if (fc > 0) {
            b = c;
            fb = fc;
            if (side === -1) fa /= 2;
            side = -1;
          } else {
            a = c;
            fa = fc;
            if (side === 1) fb /= 2;
            side = 1;
          }
        }
        J = 0.5 * (a + b);
      }
    }
    const r = evalJ(J);
    permeate += r.qp;
    salt += r.qp * r.cp;
    elementFlux[el] += J / REF.segmentsPerElement;
    cmRatioSum += r.cm / Math.max(r.cb, 1e-9);
    ndpSum += r.ndp;
    osmSum += r.osm;
    const cOut = (Q * C - r.qp * r.cp) / r.qOut;
    Q = r.qOut;
    C = cOut;
    P = P - r.dp;
  }

  return {
    permeate_m3h: permeate,
    permeateSalt_g_h: salt,
    brine_m3h: Q,
    brineTDS_gL: C,
    outletPressure_bar: P,
    elementFlux,
    wallToBulk: cmRatioSum / SEGMENTS,
    ndpAvg: ndpSum / SEGMENTS,
    osmAvg: osmSum / SEGMENTS,
  };
}

function hpEfficiency(Qhp: number, wear: number): number {
  const x = Qhp / REF.hpBEPFlow_m3h - 1;
  return Math.max(0.35, ENERGY.hpPumpBEPEfficiency * (1 - ENERGY.hpPumpCurvature * x * x) * (1 - wear));
}

/** Electrical rating of one RO train (HP pump + booster motors), kW (computed once at the design point). */
let TRAIN_RATING_kW = 0;

function trainAtPressure(P: number, Qv: number, env: Environment, state: TrainTrueState, vessels: number): RefTrainResult {
  const Cf = env.salinity_gL;
  const T = env.temperature_C;
  // ERD mixing raises the membrane feed salinity (fixed-point on brine salinity).
  let Cmf = Cf;
  let sol = solveVessel(P, Qv, Cmf, T, state);
  for (let i = 0; i < 2; i++) {
    const Qb = sol.brine_m3h;
    Cmf = Cf + ENERGY.pxMixing * (Qb / Qv) * (sol.brineTDS_gL - Cf);
    sol = solveVessel(P, Qv, Cmf, T, state);
  }
  const Qf = Qv * vessels;
  const Qp = sol.permeate_m3h * vessels;
  const Qb = sol.brine_m3h * vessels;
  const Cp = sol.permeate_m3h > 0 ? sol.permeateSalt_g_h / sol.permeate_m3h : 0;
  const Pb = sol.outletPressure_bar;

  // Energy: HP pump supplies permeate-equivalent flow + PX lubrication leakage.
  const leak = REF.pxLeakageFraction * Qb;
  const Qhp = Qp + leak;
  const etaHp = hpEfficiency(Qhp, state.pumpWear);
  const hpHydraulic = (Qhp * (P - PLANT.lpSupplyPressure_bar)) / 36;
  const hpElec = hpHydraulic / (etaHp * ENERGY.motorVfdEfficiency);
  const qbRel = Qb / (REF.hpBEPFlow_m3h * 1.2);
  const pxOut = Pb - ENERGY.pxPressureLoss_bar * qbRel * qbRel - (1 - ENERGY.pxEfficiency) * (Pb - PLANT.lpSupplyPressure_bar) * 0.5;
  const boosterElec = (Math.max(Qb - leak, 0) * Math.max(P - pxOut, 0)) / (36 * ENERGY.boosterEfficiency);
  const erdRecovered = ((Qb - leak) * (pxOut - PLANT.lpSupplyPressure_bar)) / 36;

  const headRel = (P - PLANT.lpSupplyPressure_bar) / (PLANT.design.feedPressure_bar - PLANT.lpSupplyPressure_bar);
  const speed = Math.sqrt(Math.max(headRel, 0) / Math.max(1 - state.pumpHeadLoss, 0.3));

  return {
    online: true,
    feedPressure_bar: P,
    feedFlow_m3h: Qf,
    permeateFlow_m3h: Qp,
    brineFlow_m3h: Qb,
    recovery: Qf > 0 ? Qp / Qf : 0,
    permeateTDS_mgL: Cp * 1000,
    membraneFeedTDS_gL: Cmf,
    brineTDS_gL: sol.brineTDS_gL,
    avgFlux_LMH: (Qp * 1000) / (vessels * ELEMENT.area_m2 * ELEMENT.elementsPerVessel),
    vesselDP_bar: P - Pb,
    ndp_bar: sol.ndpAvg,
    osmoticAvg_bar: sol.osmAvg,
    cpFactor: sol.wallToBulk,
    roPower_kW: hpElec + boosterElec,
    hpPumpPower_kW: hpElec,
    boosterPower_kW: boosterElec,
    erdRecovered_kW: erdRecovered,
    hpPumpEfficiency: etaHp * ENERGY.motorVfdEfficiency,
    pumpSpeedRel: speed,
    motorLimited: false,
    elementFlux_LMH: sol.elementFlux,
  };
}

/** Rated electrical power of one RO train: design RO power × rating factor. Known to both models. */
export function trainPowerRatingRef(): number {
  if (TRAIN_RATING_kW === 0) {
    const env: Environment = {
      salinity_gL: PLANT.design.salinity_gL,
      temperature_C: PLANT.design.temperature_C,
      turbidity_NTU: 2,
      pH: 8.1,
      foulingPotential: 1,
      intakeCapacity: 1,
    };
    const clean = makeTrainState(0);
    const r = trainAtPressure(PLANT.design.feedPressure_bar, PLANT.design.feedFlowPerVessel_m3h, env, clean, PLANT.vesselsPerTrain);
    TRAIN_RATING_kW = r.roPower_kW * ENERGY.hpMotorRating;
  }
  return TRAIN_RATING_kW;
}

/**
 * Solve one train of the reference plant. If the requested pressure would
 * overload the HP motor (e.g. with a worn pump), the achievable pressure is
 * reduced until the motor runs at its rating.
 */
export function solveTrainRef(env: Environment, sp: TrainSetpoint, state: TrainTrueState, vessels: number = PLANT.vesselsPerTrain): RefTrainResult {
  if (!sp.online || sp.feedFlowPerVessel_m3h <= 0) {
    return { ...offlineTrain(), elementFlux_LMH: new Array(ELEMENT.elementsPerVessel).fill(0) };
  }
  // Wear reduces the head a pump can deliver at a given speed; the VFD speed
  // range caps the achievable head.
  const maxHead = (PLANT.design.feedPressure_bar * 1.2 - PLANT.lpSupplyPressure_bar) * (1 - state.pumpHeadLoss);
  let P = Math.min(sp.feedPressure_bar, PLANT.lpSupplyPressure_bar + maxHead);
  let res = trainAtPressure(P, sp.feedFlowPerVessel_m3h, env, state, vessels);
  const rating = trainPowerRatingRef();
  if (res.roPower_kW > rating) {
    let lo = PLANT.lpSupplyPressure_bar + 5;
    let hi = P;
    for (let i = 0; i < 28; i++) {
      const mid = 0.5 * (lo + hi);
      const r = trainAtPressure(mid, sp.feedFlowPerVessel_m3h, env, state, vessels);
      if (r.roPower_kW > rating) hi = mid;
      else lo = mid;
    }
    P = lo;
    res = trainAtPressure(P, sp.feedFlowPerVessel_m3h, env, state, vessels);
    res.motorLimited = true;
  } else if (P < sp.feedPressure_bar - 1e-9) {
    res.motorLimited = true;
  }
  return res;
}

/**
 * Advance the element-level fouling state by dt hours (docs/MODEL.md §2.6):
 *   dφ_k/dt = κ · F · m · w_k · (J_k / J_ref)² · (1 − φ_k/φ_max)
 * F: feed fouling potential, m: train-specific multiplier (scenario), w_k: profile.
 */
export function stepFouling(state: TrainTrueState, elementFlux: number[], foulingPotential: number, trainMultiplier: number, dt_h: number): TrainTrueState {
  const prof = REF.foulingProfile;
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  const next = state.fouling.map((phi, k) => {
    const j = elementFlux[k] / REF.foulingRefFlux_LMH;
    const rate = REF.foulingRate_h * foulingPotential * trainMultiplier * (prof[k] / mean) * j * j * (1 - phi / REF.foulingMax);
    return Math.min(REF.foulingMax, Math.max(0, phi + rate * dt_h));
  });
  return { ...state, fouling: next };
}

/** Sensor model: turn true outputs into noisy measurements. `noiseScale` > 1 degrades sensors. */
export function measureTrain(out: TrainOutputs, rng: Rng, noiseScale = 1, permeateTdsBias = 0): TrainMeasurement {
  const n = SENSOR_NOISE;
  const k = noiseScale;
  if (!out.online) {
    return {
      online: false,
      feedPressure_bar: 0,
      feedFlow_m3h: 0,
      permeateFlow_m3h: 0,
      permeateTDS_mgL: 0,
      vesselDP_bar: 0,
      roPower_kW: 0,
    };
  }
  return {
    online: true,
    feedPressure_bar: out.feedPressure_bar + rng.normal(0, n.pressure_bar * k),
    feedFlow_m3h: out.feedFlow_m3h * (1 + rng.normal(0, n.flowRel * k)),
    permeateFlow_m3h: out.permeateFlow_m3h * (1 + rng.normal(0, n.flowRel * k)),
    permeateTDS_mgL: out.permeateTDS_mgL * (1 + permeateTdsBias + rng.normal(0, n.tdsRel * k)),
    vesselDP_bar: Math.max(0.05, out.vesselDP_bar + rng.normal(0, n.dp_bar * k)),
    roPower_kW: out.roPower_kW * (1 + rng.normal(0, n.powerRel * k)),
  };
}
