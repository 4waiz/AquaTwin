/** Shared types for the simulation core. All units are stated in field names. */

export interface Environment {
  salinity_gL: number; // seawater TDS at the intake
  temperature_C: number;
  turbidity_NTU: number;
  pH: number;
  /** Relative biofouling / organic-load potential of the pretreated feed (1 = normal). */
  foulingPotential: number;
  /** Fraction of nominal intake capacity available (1 = unrestricted). */
  intakeCapacity: number;
}

export interface TrainSetpoint {
  online: boolean;
  feedPressure_bar: number;
  feedFlowPerVessel_m3h: number;
}

/** Steady-state outputs of one RO train (either model). */
export interface TrainOutputs {
  online: boolean;
  feedPressure_bar: number;
  feedFlow_m3h: number;
  permeateFlow_m3h: number;
  brineFlow_m3h: number;
  recovery: number;
  permeateTDS_mgL: number;
  membraneFeedTDS_gL: number;
  brineTDS_gL: number;
  avgFlux_LMH: number;
  vesselDP_bar: number;
  ndp_bar: number;
  osmoticAvg_bar: number;
  cpFactor: number;
  /** Electrical power of the RO stage for this train (HP pump + booster − recovered), kW. */
  roPower_kW: number;
  hpPumpPower_kW: number;
  boosterPower_kW: number;
  erdRecovered_kW: number;
  hpPumpEfficiency: number;
  /** HP pump speed relative to design (affinity-law estimate), 0..1.2. */
  pumpSpeedRel: number;
  /** True if the HP motor power limit capped the achievable pressure. */
  motorLimited: boolean;
}

export interface PlantTotals {
  production_m3h: number;
  feedFlow_m3h: number;
  brineFlow_m3h: number;
  recovery: number;
  permeateTDS_mgL: number;
  brineTDS_gL: number;
  power_kW: number;
  sec_kWh_m3: number;
  energyBreakdown_kWh_m3: EnergyBreakdown;
}

export interface EnergyBreakdown {
  intake: number;
  pretreatment: number;
  hpPump: number;
  booster: number;
  erdRecovered: number; // reported as positive recovered energy
  postTreatment: number;
  base: number;
}

export interface PlantSnapshot {
  trains: TrainOutputs[];
  totals: PlantTotals;
}

/** Per-train latent state of the reference ("true") plant. */
export interface TrainTrueState {
  /** Per-element fouling fraction φ (0 = clean). Length = elements per vessel. */
  fouling: number[];
  /** Relative salt-permeability ageing multiplier (1 = post-clean). */
  saltAgeing: number;
  /** HP pump wear: relative loss of hydraulic efficiency (0 = new). */
  pumpWear: number;
  /** Relative loss of HP pump head at a given speed from wear (0 = new). */
  pumpHeadLoss: number;
}

/** Parameters of the reduced-order twin model for one train (estimated online). */
export interface TwinParams {
  A25: number; // L m⁻² h⁻¹ bar⁻¹
  B25: number; // L m⁻² h⁻¹
  kdp: number; // bar / (m³/h)^1.75
  pumpEff: number; // lumped
}

/** Noisy sensor readings for one train. */
export interface TrainMeasurement {
  online: boolean;
  feedPressure_bar: number;
  feedFlow_m3h: number;
  permeateFlow_m3h: number;
  permeateTDS_mgL: number;
  vesselDP_bar: number;
  roPower_kW: number;
}

export interface Measurement {
  t_h: number;
  salinity_gL: number;
  temperature_C: number;
  turbidity_NTU: number;
  pH: number;
  trains: TrainMeasurement[];
}
