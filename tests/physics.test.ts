/**
 * Physics sanity tests: seawater properties against published values, mass
 * and salt balances of the reference plant, and the 0D model's
 * self-calibration round trip.
 */
import { describe, expect, it } from "vitest";
import { osmoticPressureRef, pureWaterDensity, seawaterDensity, tcfWater } from "../src/sim/seawater";
import { calibrate0D, solveTrain0D } from "../src/sim/physics0d";
import { makeTrainState, solveTrainRef } from "../src/sim/referencePlant";
import { DESIGN_ENV, DESIGN_SETPOINT, cleanBaseline } from "../src/sim/twin";
import { LIMITS, PLANT } from "../src/sim/config";

describe("seawater properties (Sharqawy et al. 2010 via WaterTAP)", () => {
  it("pure water density at 25 °C ≈ 997 kg/m³", () => {
    expect(pureWaterDensity(25)).toBeCloseTo(997.0, 0);
  });

  it("seawater density at 35 g/kg, 25 °C ≈ 1023 kg/m³", () => {
    expect(seawaterDensity(0.035, 25)).toBeGreaterThan(1022);
    expect(seawaterDensity(0.035, 25)).toBeLessThan(1025);
  });

  it("osmotic pressure of standard seawater (35 g/kg, 25 °C) ≈ 25.9 bar, not the NaCl value of ~28 bar", () => {
    // research-notes §1c: WaterTAP seawater formulation 25.9 bar; TEOS-10 agrees within ±0.4 %.
    const pi = osmoticPressureRef(35 * 1.0233, 25); // g/kg → g/L at ρ ≈ 1023 kg/m³
    expect(pi).toBeGreaterThan(25.3);
    expect(pi).toBeLessThan(26.5);
  });

  it("osmotic pressure rises with salinity and temperature", () => {
    expect(osmoticPressureRef(45, 25)).toBeGreaterThan(osmoticPressureRef(40, 25));
    expect(osmoticPressureRef(40, 35)).toBeGreaterThan(osmoticPressureRef(40, 15));
  });

  it("temperature correction factor is 1 at 25 °C and increases with temperature", () => {
    expect(tcfWater(25)).toBeCloseTo(1, 6);
    expect(tcfWater(30)).toBeGreaterThan(1);
    expect(tcfWater(20)).toBeLessThan(1);
  });
});

describe("reference plant (element-level solution–diffusion)", () => {
  const out = solveTrainRef(DESIGN_ENV, DESIGN_SETPOINT, makeTrainState(0.03));

  it("conserves water: feed = permeate + concentrate", () => {
    expect(out.feedFlow_m3h).toBeCloseTo(out.permeateFlow_m3h + out.brineFlow_m3h, 6);
  });

  it("conserves salt across the membranes within 0.5 %", () => {
    // Membrane feed is seawater after pressure-exchanger mixing (slightly saltier than the intake).
    const saltIn = out.feedFlow_m3h * out.membraneFeedTDS_gL; // kg/h = m³/h × g/L
    const saltOut = out.permeateFlow_m3h * (out.permeateTDS_mgL / 1000) + out.brineFlow_m3h * out.brineTDS_gL;
    expect(Math.abs(saltOut - saltIn) / saltIn).toBeLessThan(0.005);
  });

  it("operates inside the design envelope at the design point", () => {
    expect(out.recovery).toBeGreaterThan(0.35);
    expect(out.recovery).toBeLessThan(LIMITS.maxRecovery);
    expect(out.permeateTDS_mgL).toBeLessThan(LIMITS.maxPermeateTDS_mgL);
    expect(out.vesselDP_bar).toBeLessThan(LIMITS.maxVesselDP_bar);
    expect(out.avgFlux_LMH).toBeLessThan(LIMITS.maxAvgFlux_LMH);
  });

  it("fouling reduces permeate flow at fixed setpoints", () => {
    const fouled = solveTrainRef(DESIGN_ENV, DESIGN_SETPOINT, makeTrainState(0.2));
    expect(fouled.permeateFlow_m3h).toBeLessThan(out.permeateFlow_m3h);
    expect(fouled.vesselDP_bar).toBeGreaterThan(out.vesselDP_bar);
  });

  it("higher feed salinity raises permeate TDS and lowers production", () => {
    const salty = solveTrainRef({ ...DESIGN_ENV, salinity_gL: DESIGN_ENV.salinity_gL * 1.15 }, DESIGN_SETPOINT, makeTrainState(0.03));
    expect(salty.permeateTDS_mgL).toBeGreaterThan(out.permeateTDS_mgL);
    expect(salty.permeateFlow_m3h).toBeLessThan(out.permeateFlow_m3h);
  });
});

describe("0D twin self-calibration", () => {
  it("recovers its own parameters from noise-free outputs (round trip)", () => {
    const { theta } = cleanBaseline();
    const env = { salinity_gL: 43, temperature_C: 31 };
    const sp = { online: true, feedPressure_bar: 66, feedFlowPerVessel_m3h: 10.5 };
    const o = solveTrain0D(env, sp, theta);
    const est = calibrate0D(env, o, PLANT.vesselsPerTrain)!;
    expect(est).not.toBeNull();
    expect(est.A25 / theta.A25).toBeCloseTo(1, 3);
    expect(est.B25 / theta.B25).toBeCloseTo(1, 3);
    expect(est.kdp / theta.kdp).toBeCloseTo(1, 3);
  });
});
