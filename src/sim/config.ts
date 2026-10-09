/**
 * Configuration of the simulated reference SWRO plant.
 *
 * This is NOT a model of any real facility. It is a generic three-train
 * seawater reverse-osmosis plant operating on Arabian Gulf-like seawater,
 * sized so that its operating point sits inside the published ranges cited in
 * docs/MODEL.md. Each value is tagged with its provenance:
 *   [ref:KEY]  source listed under KEY in docs/REFERENCES.md
 *   [assumed]  a design choice for this simulated plant
 */

export const ELEMENT = {
  /** Active area of one 8-inch, 440 ft² SWRO element (41 m²) [ref:FILMTEC-SW30]. */
  area_m2: 40.9,
  elementsPerVessel: 7, // [assumed] common SWRO vessel configuration
} as const;

export const PLANT = {
  name: "Reference SWRO plant (simulated)",
  nTrains: 3,
  vesselsPerTrain: 200, // [assumed]
  /** Permeate-side pressure, bar(g) [assumed]. */
  permeatePressure_bar: 1.0,
  /** Suction pressure delivered to the HP pump and PX low-pressure inlet, bar [assumed]. */
  lpSupplyPressure_bar: 2.5,
  /** Product water storage (reservoir) volume, m³ [assumed ≈ 6 h of demand]. */
  reservoirCapacity_m3: 14_000,
  /** Mean municipal demand, m³/day [assumed; plant dispatched to demand]. */
  meanDemand_m3d: 56_000,
  /** Design operating point, used for normalisation baselines. */
  design: {
    feedPressure_bar: 63.5,
    feedFlowPerVessel_m3h: 9.6,
    salinity_gL: 41.5,
    temperature_C: 28.4,
  },
} as const;

export const TRAIN_AREA_m2 = PLANT.vesselsPerTrain * ELEMENT.elementsPerVessel * ELEMENT.area_m2;

/** Membrane transport parameters at 25 °C for the as-operated (aged) membranes. */
export const MEMBRANE = {
  /**
   * Water permeability A at 25 °C after the last clean, L m⁻² h⁻¹ bar⁻¹.
   * Datasheet-derived values for new SW30 elements are ≈1.16–1.44 [ref:FILMTEC-SW30];
   * WaterTAP SWRO examples use 1.51 [ref:WATERTAP-RO]. Lower value = aged membranes [assumed].
   */
  A25_clean: 1.05,
  /** Salt permeability B at 25 °C, L m⁻² h⁻¹; datasheet-derived ≈0.06–0.07 [ref:FILMTEC-SW30]. */
  B25_clean: 0.06,
  /** Temperature-correction constants, K [ref:DUPONT-MANUAL]. */
  tcfHigh_K: 2640, // T ≥ 25 °C
  tcfLow_K: 3020, // T < 25 °C
  /**
   * Salt-permeability activation constant used only by the reference plant, K.
   * DuPont applies the water TCF to salt passage [ref:DUPONT-MANUAL]; the reference
   * plant assumes a stronger temperature dependence for salt [assumed], a
   * deliberate model-form difference from the reduced-order twin.
   */
  tcfSalt_K: 3400,
} as const;

/** Energy system parameters. */
export const ENERGY = {
  hpPumpBEPEfficiency: 0.86, // hydraulic efficiency at best-efficiency point [assumed]
  hpPumpCurvature: 0.35, // efficiency loss coefficient away from BEP [assumed]
  motorVfdEfficiency: 0.93, // motor × VFD [assumed]; pump × motor ≈ 0.80 as in WaterTAP [ref:WATERTAP-RO]
  boosterEfficiency: 0.78, // booster pump × motor [assumed]
  pxEfficiency: 0.96, // isobaric pressure exchanger, up to 0.98 [ref:ERI-PX]
  pxMixing: 0.04, // volumetric mixing 3–5 % [ref:ERI-PX]
  pxPressureLoss_bar: 0.8, // [assumed]
  /** Lumped efficiency assumed by the reduced-order twin model [assumed]. */
  twinLumpedPumpEfficiency: 0.8,
  twinErdEfficiency: 0.94,
  /** Auxiliary loads (see MODEL.md §3) [assumed; total SEC checked against ref:VOUTCHKOV-2018 ranges]. */
  intakeHead_bar: 2.5,
  intakeEfficiency: 0.78,
  pretreatHead_bar: 1.6,
  pretreatEfficiency: 0.76,
  pretreatBase_kWh_per_m3feed: 0.06, // DAF air/recycle, backwash, dosing [assumed]
  postTreat_kWh_per_m3: 0.3, // remineralisation + product transfer pumping [assumed]
  plantBase_kW: 250, // HVAC, lighting, instrumentation [assumed]
  /** RO-train motor rating (HP + booster) relative to design electrical power [assumed]. */
  hpMotorRating: 1.2,
} as const;

/**
 * AquaGuard hard constraints. These are the operating limits the safety
 * layer enforces on every recommendation.
 */
export const LIMITS = {
  maxFeedPressure_bar: 70.0, // plant design limit [assumed]; element rating 83 bar [ref:FILMTEC-SW30]
  maxPermeateTDS_mgL: 400, // plant permeate specification [assumed]; WHO: < ~600 mg/L generally good [ref:WHO-GDWQ]
  maxRecovery: 0.5, // [assumed] scaling / brine-concentration limit
  maxAvgFlux_LMH: 17.0, // within the 12–19 LMH seawater design range [ref:DUPONT-MANUAL]
  minConcentratePerVessel_m3h: 3.6, // [assumed; typical 8-inch element guidance]
  maxFeedPerVessel_m3h: 16.0, // [assumed; typical 8-inch element guidance]
  maxVesselDP_bar: 3.5, // per multi-element vessel [ref:FILMTEC-SW30]
  minReservoirFraction: 0.25, // service-reliability reserve [assumed]
  maxReservoirFraction: 0.97,
  maxPressureRamp_bar_per_h: 8.0, // [assumed] operational-stability limit on hourly setpoint changes
  minConfidence: 0.5, // below this AquaTwin withholds recommendations [assumed]
  cipHealthThreshold: 0.9, // clean when normalised permeate flow has declined 10 % [ref:DUPONT-MANUAL]
} as const;

/** Sensor noise (1σ) used by the measurement model of the simulated plant [assumed]. */
export const SENSOR_NOISE = {
  flowRel: 0.005,
  pressure_bar: 0.12,
  tdsRel: 0.015,
  temperature_C: 0.05,
  powerRel: 0.006,
  dp_bar: 0.03,
} as const;

/** Baseline seawater conditions of the live plant [assumed; Gulf-typical, see ref:GULF-CONDITIONS]. */
export const BASE_ENV = {
  salinity_gL: 41.5,
  temperature_C: 28.4,
  turbidity_NTU: 2.1,
  pH: 8.1,
} as const;

/**
 * Mean element fouling of each train at the start of every simulation
 * [assumed initial state]; ≈ post-clean normalised permeate flow 0.99 / 0.955 / 0.975.
 */
export const INITIAL_TRAIN_FOULING = [0.03, 0.155, 0.075] as const;

/** Illustrative UAE grid carbon intensity, kg CO₂e/kWh (2024, lifecycle basis) [ref:EMBER-UAE]. */
export const GRID_CARBON_BASE = 0.468;

export const TRAIN_IDS = [0, 1, 2] as const;
export type TrainId = (typeof TRAIN_IDS)[number];
