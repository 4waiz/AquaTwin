/* Exercise the TwinRuntime in Node and report timings (developer utility). */
import { ComputeRuntime, liveStateOf, TwinRuntime } from "../../src/runtime/engine";
import { loadDegradation, loadMlBundle } from "../lib/artifacts";

const t0 = performance.now();
const bundle = loadMlBundle();
const t1 = performance.now();
const rt = new TwinRuntime(bundle, loadDegradation());
const t2 = performance.now();
console.log(`bundle ${(t1 - t0).toFixed(0)} ms, backfill ${(t2 - t1).toFixed(0)} ms, history=${rt.history.length}`);
let snap = rt.tick(1000).snapshot;
const t3 = performance.now();
for (let i = 0; i < 20; i++) snap = rt.tick(1000).snapshot;
console.log(
  `tick ${((performance.now() - t3) / 20).toFixed(1)} ms; status=${snap.status}; prod=${snap.totals.production_m3h.toFixed(0)} TDS=${snap.totals.permeateTDS_mgL.toFixed(0)} SEC=${snap.totals.sec_kWh_m3.toFixed(3)} res=${(snap.reservoirFraction * 100).toFixed(1)}% conf=${snap.confidence.toFixed(2)}`,
);
console.log("health", snap.health.map((h) => `${(h.npf * 100).toFixed(1)}/${h.nsp.toFixed(3)}/${h.ndp.toFixed(3)}`).join("  "));
console.log("trend", snap.healthTrend.map((t) => `${t.slopePctPerHour.toFixed(3)}%/h hrs=${t.hours?.toFixed(0) ?? "-"}`).join("  "));
console.log(
  "hybrid T2",
  JSON.stringify(snap.hybrid[1].physics),
  JSON.stringify(snap.hybrid[1].residual),
  JSON.stringify(snap.hybrid[1].hybrid),
  JSON.stringify(snap.hybrid[1].measured),
);
console.log("guard", snap.guard.verdict, snap.guard.rules.map((r) => `${r.id}:${r.status}`).join(" "));
console.log("alerts", snap.alerts);
const cr = new ComputeRuntime(bundle, loadDegradation());
const live = liveStateOf(snap);
for (const id of ["salinity", "fouling", "energy", "demand", "pump", "algal"] as const) {
  const t = performance.now();
  const r = cr.runScenarioLab(live, id);
  const m = (b: typeof r.noAction) =>
    `prod=${b.metrics.production_m3.toFixed(0)} SEC=${b.metrics.sec.toFixed(3)} TDSmax=${b.metrics.maxTds.toFixed(0)} viol=${b.metrics.violationHours.toFixed(1)}h ${JSON.stringify(b.metrics.violationBy)} minRes=${b.metrics.minReservoir.toFixed(1)} cip=${JSON.stringify(b.metrics.cipCrossing)}`;
  console.log(`\n${id} (${(performance.now() - t).toFixed(0)} ms)\n  base:   ${m(r.baseline)}\n  noact:  ${m(r.noAction)}\n  aqua:   ${m(r.aquatwin)}`);
  console.log(
    "  decisions:",
    r.aquatwin.decisions
      .slice(0, 8)
      .map((d) => `${d.t}:${d.verdict}${d.chosen ? `(${d.chosen.P}/${d.chosen.Qv}/${d.chosen.focusMode})` : ""}`)
      .join(" "),
  );
}
let t = performance.now();
const o = cr.optimizeAt(live, "salinity", 6);
console.log(
  `\noptimize ${(performance.now() - t).toFixed(0)} ms: ${o.candidates.length} candidates, feasible=${o.candidates.filter((c) => c.feasible).length}, pareto=${o.candidates.filter((c) => c.pareto).length}, verdict=${o.verdict}, best=${o.bestId}`,
);
t = performance.now();
const p = cr.probe({ salinity_gL: 52, temperature_C: 37.5, feedPressure_bar: 66, feedFlowPerVessel_m3h: 9.6, health: 0.95 });
console.log(`probe ${(performance.now() - t).toFixed(0)} ms: conf=${p.confidence.toFixed(2)} verdict=${p.verdict} ood=${JSON.stringify(p.ood)}`);
t = performance.now();
const e = cr.envelope(live, 36);
console.log(`envelope ${(performance.now() - t).toFixed(0)} ms: feasible cells=${e.code.flat().filter((c) => c === 0).length}/${e.code.flat().length}`);
