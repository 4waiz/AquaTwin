/* Diagnose warning lead time on a no-action run (developer utility). */
import { LIMITS } from "../../src/sim/config";
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const id = (process.argv[2] ?? "fouling") as ScenarioId;
const mon = (process.argv[3] ?? "hybrid") as "physics" | "mlonly" | "hybrid";
const r = runScenario({
  scenario: SCENARIOS[id],
  strategy: "fixed",
  model: "hybrid",
  monitorModel: mon,
  plant: "reference",
  bundle: loadMlBundle(),
  degradation: loadDegradation(),
  seed: 1,
});
console.log("cip threshold", LIMITS.cipHealthThreshold);
for (const s of r.steps) {
  if (Math.round(s.t * 6) % 3 !== 0) continue;
  console.log(
    s.t.toFixed(2).padStart(6),
    "true",
    s.health.map((h) => h.toFixed(4)).join(" "),
    "| est",
    s.healthEstimate.map((h) => h.toFixed(4)).join(" "),
    "| tds",
    s.totals.permeateTDS_mgL.toFixed(0),
    "| res",
    (s.reservoirFraction * 100).toFixed(1),
    "| W",
    s.warnings.join(","),
    "| A",
    s.alarms.join(","),
    "| V",
    s.violations.join(","),
  );
}
