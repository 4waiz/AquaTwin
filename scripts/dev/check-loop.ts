/* Smoke test of the closed loop without ML (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS, type ScenarioId } from "../../src/sim/scenarios";
import { DEFAULT_DEGRADATION } from "../../src/sim/twin";

const ids = (process.argv[2] ?? "normal,salinity,fouling,pump,energy,demand,algal").split(",") as ScenarioId[];
for (const id of ids) {
  for (const strategy of ["fixed", "aquatwin"] as const) {
    for (const plant of ["reference", "twin"] as const) {
      const t0 = performance.now();
      const r = runScenario({ scenario: SCENARIOS[id], strategy, model: "physics", plant, bundle: null, degradation: DEFAULT_DEGRADATION, seed: 7 });
      const ms = performance.now() - t0;
      const m = r.metrics;
      const f = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "n/a" : x.toFixed(d));
      console.log(
        `${id.padEnd(9)} ${strategy.padEnd(8)} ${plant.padEnd(9)} ${ms.toFixed(0).padStart(5)}ms SEC=${f(m.sec_kWh_m3, 3)} prod=${f(m.production_m3, 0)} TDSmax=${f(m.maxTds_mgL, 0)} viol=${f(m.anyViolation_h)}h ${JSON.stringify(m.violationHoursBy)} minRes=${f(m.minReservoirFraction, 3)} health=${m.finalHealth.map((h) => h.toFixed(3)).join("/")} warn=${f(m.firstWarning_h)} alarm=${f(m.firstAlarm_h)} W/R=${m.withheldDecisions}/${m.rejectedDecisions} MAEprod=${f(m.predMAE?.production_m3h, 1)}`,
      );
      const fw = r.steps.find((s) => s.warnings.length);
      const fa = r.steps.find((s) => s.alarms.length);
      console.log(`   firstWarn=${fw ? fw.t.toFixed(2) + ":" + fw.warnings.join("|") : "-"} firstAlarm=${fa ? fa.t.toFixed(2) + ":" + fa.alarms.join("|") : "-"}`);
      if (strategy === "aquatwin" && plant === "reference") {
        const d = r.decisions.slice(0, 6).map((x) => `${x.t}h:${x.verdict}${x.chosen ? `(${x.chosen.P}/${x.chosen.Qv}/${x.chosen.focusMode})` : ""}`);
        console.log("   decisions:", d.join(" "));
      }
    }
  }
}
