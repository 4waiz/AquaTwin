/* Debug fouling monitoring (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS } from "../../src/sim/scenarios";
import { fitTrend, forecastThreshold } from "../../src/sim/forecast";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const bundle = loadMlBundle();
for (const mon of ["physics", "hybrid"] as const) {
  const r = runScenario({
    scenario: SCENARIOS.fouling,
    strategy: "fixed",
    model: "hybrid",
    monitorModel: mon,
    plant: "reference",
    bundle,
    degradation: loadDegradation(),
    seed: 1,
  });
  console.log(`\n--- monitor ${mon}`);
  for (const s of r.steps.filter((_, i) => i % 6 === 0)) {
    const hist = r.steps.filter((x) => x.t <= s.t && x.t > s.t - 6);
    const fit = fitTrend(
      hist.map((x) => x.t),
      hist.map((x) => x.healthEstimate[1]),
    );
    const fc = forecastThreshold(fit, s.t, s.healthEstimate[1], 0.85, 12);
    console.log(
      `t=${s.t.toFixed(1)} trueH2=${s.health[1].toFixed(4)} estH2=${s.healthEstimate[1].toFixed(4)} estH1=${s.healthEstimate[0].toFixed(4)} slope=${fit ? (fit.slope * 100).toFixed(3) : "-"}%/h se=${fit ? (fit.seSlope * 100).toFixed(3) : "-"} p12=${fc.probWithin.toFixed(2)} hrs=${fc.hours?.toFixed(1) ?? "-"} warn=${s.warnings.join("|")} alarm=${s.alarms.join("|")}`,
    );
  }
}
