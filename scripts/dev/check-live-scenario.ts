/* Reproduce a Scenario Lab forecast from a given live state (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const id = (process.argv[2] ?? "salinity") as ScenarioId;
const health = (process.argv[3] ?? "0.991,0.932,0.977").split(",").map(Number);
const reservoirs = (process.argv[4] ?? "0.45,0.55,0.65,0.75").split(",").map(Number);
const clocks = (process.argv[5] ?? "0,1,2,3,22,23").split(",").map(Number);
for (const res of reservoirs) {
  const row: string[] = [];
  for (const clock of clocks) {
    const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model: "hybrid", plant: "twin", bundle, degradation, seed: 1, startClock_h: clock, initialHealth: health, initialReservoirFraction: res });
    const first = r.steps.find((s) => s.violations.length > 0);
    row.push(`${clock}h ${r.metrics.anyViolation_h.toFixed(2)}${first ? "@+" + first.t.toFixed(2) : ""}`);
  }
  console.log(`reservoir ${res}: ` + row.join(" | "));
}
