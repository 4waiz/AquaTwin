/* Debug energy-constraint decisions (developer utility). */
import { runScenario } from "../../src/sim/closedLoop";
import { SCENARIOS } from "../../src/sim/scenarios";
import { DEFAULT_DEGRADATION } from "../../src/sim/twin";

const r = runScenario({
  scenario: SCENARIOS.energy,
  strategy: "aquatwin",
  model: "physics",
  plant: "reference",
  bundle: null,
  degradation: DEFAULT_DEGRADATION,
  seed: 7,
  keepCandidates: true,
});
console.log("basePower", r.baselinePower_kW.toFixed(0));
for (const d of r.decisions.slice(0, 11)) {
  const cands = d.candidates ?? [];
  const fails = new Map<string, number>();
  for (const c of cands) for (const rule of c.guard.rules) if (rule.status === "fail") fails.set(rule.id, (fails.get(rule.id) ?? 0) + 1);
  const minPow = Math.min(...cands.map((c) => c.objectives.power_kW));
  const s = r.steps.find((x) => Math.abs(x.t - d.t) < 1e-6)!;
  console.log(
    `${d.t}h ${d.verdict} plan[min=${d.plan.min_m3h.toFixed(0)} tgt=${d.plan.target_m3h.toFixed(0)} max=${d.plan.max_m3h.toFixed(0)}] res=${s.reservoirFraction.toFixed(3)} cap=${s.powerCap_kW?.toFixed(0) ?? "-"} minCandPow=${minPow.toFixed(0)} fails=${JSON.stringify(Object.fromEntries(fails))} chosen=${d.chosen ? `${d.chosen.P}/${d.chosen.Qv}/${d.chosen.focusMode} prod=${d.chosen.objectives.production_m3h.toFixed(0)} pow=${d.chosen.objectives.power_kW.toFixed(0)}` : "-"}`,
  );
}
