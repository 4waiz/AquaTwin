/* Print a compact table of validation results (developer utility). */
import { readFileSync } from "node:fs";
const file = process.argv[2] ?? "public/data/validation/results.json";
const r = JSON.parse(readFileSync(file, "utf8"));
const f = (x: { mean: number | null } | undefined, d = 2) => (x && x.mean !== null ? x.mean.toFixed(d) : "—");
for (const s of r.scenarios) {
  console.log(`\n== ${s.id} (${s.tag})  lead: ${JSON.stringify(r.leadTime[s.id])}`);
  for (const m of r.methods) {
    const x = r.results[s.id][m];
    console.log(
      `  ${m.padEnd(8)} SEC=${f(x.sec_kWh_m3, 3)} prod=${f(x.production_m3, 0)} rec=${f(x.meanRecovery_pct, 1)} TDSmax=${f(x.maxTds_mgL, 0)} viol=${f(x.anyViolation_h)}h tds=${f(x.tdsViolation_h)}h minRes=${f(x.minReservoir_pct, 1)} W/R=${f(x.withheld, 0)}/${f(x.rejected, 0)} MAE(p/tds/sec)=${f(x.maeProduction_m3h, 1)}/${f(x.maeTds_mgL, 1)}/${f(x.maeSec_kWh_m3, 3)} ` +
        Object.keys(x)
          .filter((k) => k.startsWith("viol_"))
          .map((k) => `${k}=${f(x[k])}`)
          .join(" "),
    );
  }
}
