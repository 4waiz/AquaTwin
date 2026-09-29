/**
 * Machine-learning layer: the browser tree-ensemble runtime must reproduce
 * scikit-learn exactly, and the out-of-distribution rule must separate the
 * training envelope from compound extremes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TARGETS, assessOod } from "../src/sim/ml";
import { loadMlBundle, ROOT } from "../scripts/lib/artifacts";
import { LIMITS } from "../src/sim/config";

const parityFile = join(ROOT, "ml", "artifacts", "parity.json");
const haveArtifacts = existsSync(parityFile) && existsSync(join(ROOT, "public", "data", "models", "aquatwin-ml.json"));

describe.skipIf(!haveArtifacts)("ML runtime", () => {
  const bundle = haveArtifacts ? loadMlBundle() : null!;

  it("matches scikit-learn predictions to 1e-9 (hybrid and ML-only, all targets)", () => {
    const par = JSON.parse(readFileSync(parityFile, "utf8"));
    for (const kind of ["hybrid", "mlonly"] as const) {
      const X: number[][] = par[`${kind}_X`];
      for (const t of TARGETS) {
        let maxd = 0;
        X.forEach((x, i) => (maxd = Math.max(maxd, Math.abs(bundle[kind][t].predict(x) - par[kind][t][i]))));
        expect(maxd).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("flags inputs far outside the training envelope", () => {
    const f = bundle.ood.features as string[];
    const mid = (k: string) => (bundle.ood.min[f.indexOf(k)] + bundle.ood.max[f.indexOf(k)]) / 2;
    const inside = f.map((k) => mid(k));
    const outside = f.map((k) => (k === "Cf_gL" || k === "Cf0_gL" ? 55 : k === "T_C" || k === "T0_C" ? 40 : mid(k)));
    // AquaGuard withholds below LIMITS.minConfidence (distance > 1.4 · d99 or a feature out of range).
    expect(assessOod(bundle.ood, inside).confidence).toBeGreaterThanOrEqual(LIMITS.minConfidence);
    const far = assessOod(bundle.ood, outside);
    expect(far.confidence).toBeLessThan(LIMITS.minConfidence);
    expect(far.outOfRange).toContain("Cf_gL");
  });
});
