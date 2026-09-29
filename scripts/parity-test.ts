/**
 * Parity test: the TypeScript tree-ensemble runtime must reproduce the
 * scikit-learn predictions stored by ml/train.py (ml/artifacts/parity.json).
 * Writes ml/artifacts/parity_report.json and exits non-zero on failure.
 *
 * Usage: npx tsx scripts/parity-test.ts [--small]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TARGETS } from "../src/sim/ml";
import { loadMlBundle, ROOT } from "./lib/artifacts";

const small = process.argv.includes("--small");
const bundle = loadMlBundle(small);
const par = JSON.parse(readFileSync(join(ROOT, "ml", "artifacts", small ? "parity-small.json" : "parity.json"), "utf8"));
const TOL = 1e-9;
const report: Record<string, { n: number; maxAbsDiff: number }> = {};
let ok = true;
for (const kind of ["hybrid", "mlonly"] as const) {
  const X: number[][] = par[`${kind}_X`];
  for (const t of TARGETS) {
    let maxd = 0;
    X.forEach((x, i) => {
      maxd = Math.max(maxd, Math.abs(bundle[kind][t].predict(x) - par[kind][t][i]));
    });
    report[`${kind}.${t}`] = { n: X.length, maxAbsDiff: maxd };
    if (!(maxd <= TOL)) ok = false;
  }
}
writeFileSync(
  join(ROOT, "ml", "artifacts", small ? "parity_report-small.json" : "parity_report.json"),
  JSON.stringify({ tolerance: TOL, passed: ok, results: report }, null, 2),
);
console.table(report);
console.log(ok ? "PARITY OK" : "PARITY FAILED");
process.exit(ok ? 0 : 1);
