import { DEFAULT_DEGRADATION, type DegradationParams } from "@/sim/twin";

/** Parse public/data/models/degradation.json (fitted by scripts/generate-dataset.ts). */
export function degradationFromJson(j: Partial<DegradationParams> | null | undefined): DegradationParams {
  if (!j || typeof j.kappa_h !== "number") return DEFAULT_DEGRADATION;
  return {
    kappa_h: j.kappa_h,
    refFlux_LMH: j.refFlux_LMH ?? DEFAULT_DEGRADATION.refFlux_LMH,
    phiMax: j.phiMax ?? DEFAULT_DEGRADATION.phiMax,
    dpGain: j.dpGain ?? DEFAULT_DEGRADATION.dpGain,
    saltGain: j.saltGain ?? DEFAULT_DEGRADATION.saltGain,
  };
}
