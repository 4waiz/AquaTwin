/* Quick physics sanity check at the design point (developer utility). */
import { INITIAL_TRAIN_FOULING, PLANT, ENERGY, MEMBRANE } from "../../src/sim/config";
import { solveTrain0D, calibrate0D } from "../../src/sim/physics0d";
import { makeTrainState, solveTrainRef } from "../../src/sim/referencePlant";
import { aggregate } from "../../src/sim/plant";
import { osmoticPressureRef, osmoticPressureLinear, osmoticCoefficient, massFraction } from "../../src/sim/seawater";
import type { Environment } from "../../src/sim/types";

const env: Environment = {
  salinity_gL: PLANT.design.salinity_gL,
  temperature_C: PLANT.design.temperature_C,
  turbidity_NTU: 2.1,
  pH: 8.1,
  foulingPotential: 1,
  intakeCapacity: 1,
};
const sp = { online: true, feedPressure_bar: PLANT.design.feedPressure_bar, feedFlowPerVessel_m3h: PLANT.design.feedFlowPerVessel_m3h };

console.log("π_ref(35,25) =", osmoticPressureRef(35, 25).toFixed(2), "bar; φ =", osmoticCoefficient(massFraction(35, 25), 25).toFixed(4));
console.log("π_ref(41.5,28.4) =", osmoticPressureRef(41.5, 28.4).toFixed(2), " π_lin =", osmoticPressureLinear(41.5, 28.4).toFixed(2));
console.log("π_ref(75,28.4) =", osmoticPressureRef(75, 28.4).toFixed(2), " π_lin =", osmoticPressureLinear(75, 28.4).toFixed(2));

const f = (x: number, d = 2) => x.toFixed(d);
const trainsRef = INITIAL_TRAIN_FOULING.map((phi) => solveTrainRef(env, sp, makeTrainState(phi)));
for (const [i, t] of trainsRef.entries()) {
  console.log(
    `REF T${i + 1}: r=${f(t.recovery, 3)} J=${f(t.avgFlux_LMH)} Qp=${f(t.permeateFlow_m3h, 0)} TDS=${f(t.permeateTDS_mgL, 0)} dP=${f(t.vesselDP_bar)} CP=${f(t.cpFactor, 3)} Cmf=${f(t.membraneFeedTDS_gL)} Cb=${f(t.brineTDS_gL)} HP=${f(t.hpPumpPower_kW, 0)} boost=${f(t.boosterPower_kW, 0)} RO=${f(t.roPower_kW, 0)} eta=${f(t.hpPumpEfficiency, 3)} elemJ=${t.elementFlux_LMH.map((x) => f(x, 1)).join(",")}`,
  );
  const cal = calibrate0D(env, t);
  console.log(`   calib: A25=${f(cal!.A25, 3)} B25=${f(cal!.B25, 4)} kdp=${f(cal!.kdp, 4)} eta=${f(cal!.pumpEff, 3)}`);
  const tw = solveTrain0D(env, sp, cal!);
  console.log(`   0D(calib) r=${f(tw.recovery, 3)} Qp=${f(tw.permeateFlow_m3h, 0)} TDS=${f(tw.permeateTDS_mgL, 0)} dP=${f(tw.vesselDP_bar)} RO=${f(tw.roPower_kW, 0)}`);
  const sp2 = { ...sp, feedPressure_bar: 68, feedFlowPerVessel_m3h: 8.0 };
  const r2 = solveTrainRef(env, sp2, makeTrainState(INITIAL_TRAIN_FOULING[i]));
  const t2 = solveTrain0D(env, sp2, cal!);
  console.log(
    `   @68bar/8.0: REF r=${f(r2.recovery, 3)} Qp=${f(r2.permeateFlow_m3h, 0)} TDS=${f(r2.permeateTDS_mgL, 0)} RO=${f(r2.roPower_kW, 0)} | 0D r=${f(t2.recovery, 3)} Qp=${f(t2.permeateFlow_m3h, 0)} TDS=${f(t2.permeateTDS_mgL, 0)} RO=${f(t2.roPower_kW, 0)}`,
  );
}
const tot = aggregate(trainsRef, env);
console.log(
  `PLANT: prod=${f(tot.production_m3h, 0)} m3/h (${f(tot.production_m3h * 24, 0)} m3/d) rec=${f(tot.recovery, 3)} TDS=${f(tot.permeateTDS_mgL, 0)} power=${f(tot.power_kW, 0)} kW SEC=${f(tot.sec_kWh_m3, 3)}`,
);
console.log("breakdown", Object.fromEntries(Object.entries(tot.energyBreakdown_kWh_m3).map(([k, v]) => [k, f(v, 3)])));
const nominal = { A25: MEMBRANE.A25_clean, B25: MEMBRANE.B25_clean, kdp: 0.0418, pumpEff: ENERGY.twinLumpedPumpEfficiency };
const tn = solveTrain0D(env, sp, nominal);
console.log(`0D nominal: r=${f(tn.recovery, 3)} Qp=${f(tn.permeateFlow_m3h, 0)} TDS=${f(tn.permeateTDS_mgL, 0)} dP=${f(tn.vesselDP_bar)} RO=${f(tn.roPower_kW, 0)}`);
