/* NPF mapping and fouling-scenario calibration (developer utility). */
import { makeTrainState } from "../../src/sim/referencePlant";
import { trueHealth, twinHealth } from "../../src/sim/twin";
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
const deg = loadDegradation();
for (const phi of [0, 0.035, 0.06, 0.105, 0.15, 0.2, 0.25, 0.3]) {
  const t = trueHealth(makeTrainState(phi));
  console.log(
    `true mean φ=${phi.toFixed(3)} → NPF=${t.health.toFixed(4)} NSP=${t.nsp.toFixed(3)} NDP=${t.ndp.toFixed(3)} | twin φ̂=${phi.toFixed(3)} → NPF=${twinHealth(phi, deg, bundle).toFixed(4)}`,
  );
}
const r = runScenario({ scenario: SCENARIOS.fouling, strategy: "fixed", model: "hybrid", plant: "reference", bundle, degradation: deg, seed: 1 });
for (const s of r.steps.filter((_, i) => i % 12 === 0)) {
  console.log(
    `t=${s.t.toFixed(0)} NPF true=${s.health.map((h) => h.toFixed(3)).join("/")} est=${s.healthEstimate.map((h) => h.toFixed(3)).join("/")} warn=${s.warnings.join("|")}`,
  );
}
const rt = runScenario({ scenario: SCENARIOS.fouling, strategy: "fixed", model: "hybrid", plant: "twin", bundle, degradation: deg, seed: 1 });
console.log(
  "twin forecast NPF T2:",
  rt.steps
    .filter((_, i) => i % 24 === 0)
    .map((s) => `${s.t.toFixed(0)}h:${s.health[1].toFixed(3)}`)
    .join(" "),
);
