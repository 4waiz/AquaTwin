/* Scenario Lab (twin plant) vs reference plant, every start hour (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const ids = (process.argv[2] ?? "salinity").split(",") as ScenarioId[];
const plant = (process.argv[3] ?? "twin") as "twin" | "reference";
const reservoir = process.argv[4] ? Number(process.argv[4]) : undefined;
for (const id of ids) {
  const bad: string[] = [];
  let n = 0;
  for (let clock = 0; clock < 24; clock++) {
    const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model: "hybrid", plant, bundle, degradation, seed: 1, startClock_h: clock, initialReservoirFraction: reservoir });
    n++;
    if (r.metrics.anyViolation_h > 0) {
      const first = r.steps.find((s) => s.violations.length > 0);
      bad.push(`${String(clock).padStart(2)}h: ${r.metrics.anyViolation_h.toFixed(2)} h (maxTDS ${r.metrics.maxTds_mgL.toFixed(0)}, first ${first ? "+" + first.t.toFixed(2) + " h " + first.violations.join("+") : "?"})`);
    }
  }
  console.log(`${id} [${plant}${reservoir !== undefined ? ", reservoir " + reservoir : ""}]: ${bad.length} of ${n} start hours with an AquaTwin-branch violation`);
  for (const b of bad) console.log("  " + b);
}
