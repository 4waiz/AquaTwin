/**
 * Seawater property correlations (docs/MODEL.md §2.1).
 *
 * Two osmotic-pressure models are provided on purpose:
 *  - `osmoticPressureRef`: non-ideal correlation used by the higher-fidelity
 *    reference plant. It is the formulation of the WaterTAP seawater property
 *    package: π = φ(t,S) · m_TDS · ρ_w(t) · R · T, with the osmotic coefficient
 *    of Sharqawy et al. (2010, eq. 49), pure-water density ρ_w(t) (Sharqawy
 *    eq. 8, A-terms) and m_TDS = S / ((1 − S) · MW_TDS), MW_TDS = 31.4038 g/mol
 *    (weighted mean over dissolved ions, so no van 't Hoff factor is applied).
 *  - `osmoticPressureLinear`: van 't Hoff-type linear approximation anchored
 *    to the reference correlation at 35 g/L and 25 °C, used by the reduced-order
 *    AquaTwin model. Its error grows at brine-side concentrations, one of the
 *    model-form discrepancies the ML residual model learns.
 * Standard seawater (35 g/kg, 25 °C) evaluates to ≈ 25.9 bar with these equations.
 */

const R = 8.314462618; // J mol⁻¹ K⁻¹
const T0 = 273.15;
const MW_TDS = 0.0314038218; // kg/mol

/** Pure-water density, kg/m³ (Sharqawy et al. 2010, eq. 8, A-terms; t in °C). */
export function pureWaterDensity(t: number): number {
  return 9.999e2 + 2.034e-2 * t - 6.162e-3 * t * t + 2.261e-5 * t ** 3 - 4.657e-8 * t ** 4;
}

/** Seawater density, kg/m³ (Sharqawy et al. 2010, eq. 8; S in kg/kg, t in °C). */
export function seawaterDensity(S: number, t: number): number {
  return pureWaterDensity(t) + 8.02e2 * S - 2.001 * S * t + 1.677e-2 * S * t * t - 3.06e-5 * S * t ** 3 - 1.613e-5 * S * S * t * t;
}

/** TDS mass fraction (kg/kg) from a concentration in g/L: solves C = S · ρ_sw(S, t). */
export function massFraction(C_gL: number, T_C: number): number {
  if (C_gL <= 0) return 0;
  let S = C_gL / 1000;
  for (let i = 0; i < 4; i++) S = C_gL / seawaterDensity(S, T_C);
  return S;
}

/** Osmotic coefficient of seawater (Sharqawy et al. 2010, eq. 49; S in kg/kg, t in °C). */
export function osmoticCoefficient(S: number, t: number): number {
  return (
    8.9453e-1 +
    4.1561e-4 * t -
    4.6262e-6 * t * t +
    2.2211e-11 * t ** 4 -
    1.1445e-1 * S -
    1.4783e-3 * S * t -
    1.3526e-8 * S * t ** 3 +
    7.0132 * S * S +
    5.696e-2 * S * S * t -
    2.8624e-4 * S * S * t * t
  );
}

/** Non-ideal osmotic pressure of seawater, bar. */
export function osmoticPressureRef(C_gL: number, T_C: number): number {
  if (C_gL <= 0) return 0;
  const S = massFraction(C_gL, T_C);
  const molality = S / ((1 - S) * MW_TDS);
  const pa = osmoticCoefficient(S, T_C) * molality * pureWaterDensity(T_C) * R * (T_C + T0);
  return pa / 1e5;
}

/** Linear coefficient anchored to the reference correlation at 35 g/L and 25 °C, bar per g/L. */
export const K_PI_LINEAR = osmoticPressureRef(35, 25) / 35;

/** Reduced-order (van 't Hoff-type) osmotic pressure, bar. */
export function osmoticPressureLinear(C_gL: number, T_C: number): number {
  return (K_PI_LINEAR * Math.max(C_gL, 0) * (T_C + T0)) / (25 + T0);
}

/**
 * Membrane temperature-correction factor relative to 25 °C (DuPont FilmTec
 * design practice): TCF = exp[K (1/298.15 − 1/(273.15 + T))] with K = 2640 K
 * for T ≥ 25 °C and 3020 K below.
 */
export function tcfWater(T_C: number, kHigh = 2640, kLow = 3020): number {
  const K = T_C >= 25 ? kHigh : kLow;
  return Math.exp(K * (1 / 298.15 - 1 / (T0 + T_C)));
}

/** Single-constant Arrhenius factor (reduced model; reference-plant salt permeability). */
export function arrhenius(T_C: number, K: number): number {
  return Math.exp(K * (1 / 298.15 - 1 / (T0 + T_C)));
}
