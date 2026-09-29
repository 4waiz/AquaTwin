/** Node-side loaders for trained artifacts (shared by experiment scripts). */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle, type MlBundle, type MlBundleJson } from "../../src/sim/ml";
import { DEFAULT_DEGRADATION, type DegradationParams } from "../../src/sim/twin";

export const ROOT = join(__dirname, "..", "..");
export const MODELS_DIR = join(ROOT, "public", "data", "models");

export function loadMlBundle(small = false): MlBundle {
  const file = join(MODELS_DIR, small ? "aquatwin-ml-small.json" : "aquatwin-ml.json");
  if (!existsSync(file)) throw new Error(`Model bundle not found at ${file}. Run: python ml/train.py`);
  return loadBundle(JSON.parse(readFileSync(file, "utf8")) as MlBundleJson);
}

export function loadDegradation(): DegradationParams {
  const file = join(MODELS_DIR, "degradation.json");
  if (!existsSync(file)) return DEFAULT_DEGRADATION;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return {
    kappa_h: j.kappa_h,
    refFlux_LMH: j.refFlux_LMH,
    phiMax: j.phiMax,
    dpGain: j.dpGain,
    saltGain: j.saltGain,
  };
}
