/* Robustness sweep: start time × initial storage, AquaTwin branch (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import type { ModelKind } from "../../src/sim/twin";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const ids = (process.argv[2] ?? "salinity,energy,demand").split(",") as ScenarioId[];
const plant = (process.argv[3] ?? "reference") as "twin" | "reference";
const model = (process.argv[4] ?? "hybrid") as ModelKind;
const storages = (process.argv[5] ?? "0.35,0.55,0.75,0.9").split(",").map(Number);
const clocks = Array.from({ length: 12 }, (_, i) => i * 2);
for (const id of ids) {
  for (const st of storages) {
    const bad: string[] = [];
    let replans = 0;
    for (const clock of clocks) {
      const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model, plant, bundle, degradation, seed: 1, startClock_h: clock, initialReservoirFraction: st });
      replans += r.metrics.replans;
      if (r.metrics.anyViolation_h > 0) bad.push(`${clock}h:${r.metrics.anyViolation_h.toFixed(2)}(${Object.keys(r.metrics.violationHoursBy).join("+")})`);
    }
    console.log(`${id.padEnd(9)} ${plant} ${model} storage ${st}: ${bad.length}/${clocks.length} with violations, replans ${replans}  ${bad.join(" ")}`);
  }
}
