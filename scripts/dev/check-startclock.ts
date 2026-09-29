/* Sensitivity of scenario outcomes to the start time of day (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const ids = (process.argv[2] ?? "salinity").split(",") as ScenarioId[];
const plant = (process.argv[3] ?? "twin") as "twin" | "reference";
for (const id of ids) {
  const row: string[] = [];
  for (const clock of [0, 4, 8, 12, 14, 16, 20]) {
    const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model: "hybrid", plant, bundle, degradation, seed: 1, startClock_h: clock });
    const f = runScenario({ scenario: SCENARIOS[id], strategy: "fixed", model: "hybrid", plant, bundle, degradation, seed: 1, startClock_h: clock });
    row.push(`${String(clock).padStart(2)}h: fixed ${f.metrics.anyViolation_h.toFixed(1)} / aquatwin ${r.metrics.anyViolation_h.toFixed(1)} (maxTDS ${r.metrics.maxTds_mgL.toFixed(0)})`);
  }
  console.log(id, plant, "\n  " + row.join("\n  "));
}
