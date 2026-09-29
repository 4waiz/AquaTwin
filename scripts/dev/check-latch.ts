/* Inspect warning latch around a gap (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const r = runScenario({
  scenario: SCENARIOS.fouling,
  strategy: "fixed",
  model: "hybrid",
  plant: "reference",
  bundle: loadMlBundle(),
  degradation: loadDegradation(),
  seed: 1,
});
for (const s of r.steps.filter((x) => x.t >= 7.5 && x.t <= 13)) {
  console.log(`t=${s.t.toFixed(2)} est2=${s.healthEstimate[1].toFixed(4)} warn=[${s.warnings.join(",")}]`);
}
