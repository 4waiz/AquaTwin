/* Is a low-storage violation a control failure or a capacity limit? (developer utility) */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";
import { PLANT } from "../../src/sim/config";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const id = (process.argv[2] ?? "demand") as ScenarioId;
const clock = Number(process.argv[3] ?? 8);
const st = Number(process.argv[4] ?? 0.35);
for (const model of ["hybrid", "physics", "mlonly"] as const) {
  const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model, plant: "reference", bundle, degradation, seed: 1, startClock_h: clock, initialReservoirFraction: st });
  const relaxed = r.decisions.filter((d) => /cannot be met safely/.test(d.message)).length;
  console.log(`${model}: viol ${r.metrics.anyViolation_h.toFixed(2)} h, minRes ${(r.metrics.minReservoirFraction * 100).toFixed(1)} %, prod ${r.metrics.production_m3.toFixed(0)} m3, relaxed decisions ${relaxed}/${r.decisions.length}`);
}
const f = runScenario({ scenario: SCENARIOS[id], strategy: "fixed", model: "hybrid", plant: "reference", bundle, degradation, seed: 1, startClock_h: clock, initialReservoirFraction: st });
console.log(`fixed: viol ${f.metrics.anyViolation_h.toFixed(2)} h, minRes ${(f.metrics.minReservoirFraction * 100).toFixed(1)} %, prod ${f.metrics.production_m3.toFixed(0)} m3`);
const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model: "hybrid", plant: "reference", bundle, degradation, seed: 1, startClock_h: clock, initialReservoirFraction: st });
const demand = r.steps.slice(0, -1).reduce((a, s) => a + s.demand_m3h / 6, 0);
const maxHourly = Math.max(...r.steps.map((s) => s.totals.production_m3h));
console.log(`24 h demand ${demand.toFixed(0)} m3; hybrid max production ${maxHourly.toFixed(0)} m3/h; reservoir capacity ${PLANT.reservoirCapacity_m3} m3; reserve margin at start ${(((st - 0.25) * PLANT.reservoirCapacity_m3)).toFixed(0)} m3`);
