/* One-seed summary of every scenario for one method (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import type { ModelKind } from "../../src/sim/twin";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const degradation = loadDegradation();
const model = (process.argv[2] ?? "hybrid") as ModelKind;
const seed = Number(process.argv[3] ?? 1);
for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
  const r = runScenario({ scenario: SCENARIOS[id], strategy: "aquatwin", model, plant: "reference", bundle, degradation, seed });
  const m = r.metrics;
  console.log(
    `${id.padEnd(12)} viol ${m.anyViolation_h.toFixed(2)} h  SEC ${m.sec_kWh_m3.toFixed(3)}  prod ${m.production_m3.toFixed(0)}  decisions ${m.decisions} (replans ${m.replans}, withheld ${m.withheldDecisions}, rejected ${m.rejectedDecisions})`,
  );
}
