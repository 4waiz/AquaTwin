/**
 * ML layer: inference for gradient-boosted tree ensembles trained in Python
 * (scikit-learn HistGradientBoostingRegressor, exported to JSON by
 * ml/train.py), split-conformal prediction intervals, and a Mahalanobis
 * out-of-distribution detector (docs/MODEL.md §5).
 *
 * The feature lists below are the single source of truth: the dataset
 * generator writes them into data/ml/feature_spec.json and the Python training
 * script refuses to run if its columns differ.
 */

/** Hybrid residual model inputs. */
export const HYBRID_FEATURES = [
  "P1_bar",
  "Qv1_m3h",
  "Cf_gL",
  "T_C",
  "P0_bar",
  "Qv0_m3h",
  "Cf0_gL",
  "T0_C",
  "A25",
  "B25",
  "kdp",
  "eta",
  "r_phys",
  "J_phys",
  "Cp_phys_mgL",
  "dP_phys_bar",
] as const;

/** ML-only model inputs: the same information, but raw measurements instead of physics. */
export const MLONLY_FEATURES = ["P1_bar", "Qv1_m3h", "Cf_gL", "T_C", "P0_bar", "Qv0_m3h", "Cf0_gL", "T0_C", "Qp0_m3h", "Cp0_mgL", "dP0_bar", "Pow0_kW"] as const;

/** Inputs monitored by the OOD detector (physically meaningful, non-redundant). */
export const OOD_FEATURES = ["Cf_gL", "T_C", "Cf0_gL", "T0_C", "P1_bar", "Qv1_m3h", "A25", "B25", "kdp", "eta"] as const;

export const TARGETS = ["Q", "C", "D", "W"] as const;
export type Target = (typeof TARGETS)[number];

export const TARGET_LABELS: Record<Target, string> = {
  Q: "Permeate flow",
  C: "Permeate TDS",
  D: "Vessel ΔP",
  W: "RO power",
};

interface TreeJson {
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  v: number[];
  m: number[];
}

export interface EnsembleJson {
  format: "aquatwin-hgb-v1";
  features: string[];
  baseline: number;
  trees: TreeJson[];
}

interface Tree {
  f: Int16Array;
  t: Float64Array;
  l: Int32Array;
  r: Int32Array;
  v: Float64Array;
  m: Uint8Array;
}

export class TreeEnsemble {
  readonly features: string[];
  private readonly baseline: number;
  private readonly trees: Tree[];

  constructor(json: EnsembleJson) {
    if (json.format !== "aquatwin-hgb-v1") throw new Error(`Unsupported model format ${json.format}`);
    this.features = json.features;
    this.baseline = json.baseline;
    this.trees = json.trees.map((t) => ({
      f: Int16Array.from(t.f),
      t: Float64Array.from(t.t),
      l: Int32Array.from(t.l),
      r: Int32Array.from(t.r),
      v: Float64Array.from(t.v),
      m: Uint8Array.from(t.m),
    }));
  }

  get size(): number {
    return this.trees.length;
  }

  predict(x: ArrayLike<number>): number {
    let s = this.baseline;
    for (let k = 0; k < this.trees.length; k++) {
      const tr = this.trees[k];
      let n = 0;
      while (tr.f[n] >= 0) {
        const v = x[tr.f[n]];
        const goLeft = v !== v ? tr.m[n] === 1 : v <= tr.t[n];
        n = goLeft ? tr.l[n] : tr.r[n];
      }
      s += tr.v[n];
    }
    return s;
  }
}

export interface OodJson {
  features: string[];
  mean: number[];
  std: number[];
  /** Inverse covariance of standardised features. */
  precision: number[][];
  d50: number;
  d95: number;
  d99: number;
  min: number[];
  max: number[];
}

export interface OodResult {
  distance: number;
  /** distance / d99 */
  ratio: number;
  outOfRange: string[];
  confidence: number;
}

export function mahalanobis(ood: OodJson, x: ArrayLike<number>): number {
  const n = ood.features.length;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = (x[i] - ood.mean[i]) / ood.std[i];
  let s = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) row += ood.precision[i][j] * z[j];
    s += z[i] * row;
  }
  return Math.sqrt(Math.max(s, 0));
}

/**
 * Confidence from distance to the training distribution:
 *  1 inside the 99th-percentile contour, falling linearly to 0 at 1.8 × d99;
 *  capped at 0.35 if any feature lies outside the training range (±3 % of span).
 */
export function assessOod(ood: OodJson, x: ArrayLike<number>): OodResult {
  const d = mahalanobis(ood, x);
  const ratio = d / ood.d99;
  let conf = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) / 0.8);
  const out: string[] = [];
  for (let i = 0; i < ood.features.length; i++) {
    const span = ood.max[i] - ood.min[i];
    if (x[i] < ood.min[i] - 0.03 * span || x[i] > ood.max[i] + 0.03 * span) out.push(ood.features[i]);
  }
  if (out.length) conf = Math.min(conf, 0.35);
  return { distance: d, ratio, outOfRange: out, confidence: conf };
}

export interface ConformalEntry {
  /** Half-width over all calibration samples. */
  all: number;
  /** Half-width per extrapolation-distance bin (Mondrian conformal). */
  bins: number[];
}

export interface ConformalJson {
  alpha: number;
  binEdges: number[];
  /** Half-widths of the (1−α) interval, in residual space: relative for Q/W, log-ratio for C, bar for D. */
  hybrid: Record<Target, ConformalEntry>;
  mlonly: Record<Target, ConformalEntry>;
  physics: Record<Target, ConformalEntry>;
}

/**
 * Normalised distance between the calibration state (u0, env0) and the queried
 * what-if state (u1, env1) — same definition as ml/train.py.
 */
export function extrapolationDistance(P1: number, Qv1: number, P0: number, Qv0: number, Cf1: number, Cf0: number, T1: number, T0: number): number {
  return Math.sqrt(((P1 - P0) / 3) ** 2 + (Qv1 - Qv0) ** 2 + ((Cf1 - Cf0) / 3) ** 2 + ((T1 - T0) / 3) ** 2);
}

export function conformalHalfWidth(c: ConformalJson, kind: "physics" | "mlonly" | "hybrid", t: Target, dist: number): number {
  const e = c[kind][t];
  let b = 0;
  while (b < c.binEdges.length && dist >= c.binEdges[b]) b++;
  return e.bins[b] ?? e.all;
}

export interface MlMeta {
  created: string;
  seed: number;
  sklearn: string;
  nTrain: number;
  nCal: number;
  nTestId: number;
  nTestOod: number;
  hyperparameters: Record<string, number | string>;
}

export interface MlBundleJson {
  meta: MlMeta;
  hybrid: Record<Target, EnsembleJson>;
  mlonly: Record<Target, EnsembleJson>;
  conformal: ConformalJson;
  ood: OodJson;
}

export interface MlBundle {
  meta: MlMeta;
  hybrid: Record<Target, TreeEnsemble>;
  mlonly: Record<Target, TreeEnsemble>;
  conformal: ConformalJson;
  ood: OodJson;
}

export function loadBundle(json: MlBundleJson): MlBundle {
  const mk = (r: Record<Target, EnsembleJson>) => Object.fromEntries(TARGETS.map((k) => [k, new TreeEnsemble(r[k])])) as Record<Target, TreeEnsemble>;
  const bundle: MlBundle = {
    meta: json.meta,
    hybrid: mk(json.hybrid),
    mlonly: mk(json.mlonly),
    conformal: json.conformal,
    ood: json.ood,
  };
  for (const k of TARGETS) {
    assertFeatures(bundle.hybrid[k].features, HYBRID_FEATURES, `hybrid.${k}`);
    assertFeatures(bundle.mlonly[k].features, MLONLY_FEATURES, `mlonly.${k}`);
  }
  assertFeatures(json.ood.features, OOD_FEATURES, "ood");
  return bundle;
}

function assertFeatures(got: readonly string[], want: readonly string[], what: string) {
  if (got.length !== want.length || got.some((g, i) => g !== want[i])) {
    throw new Error(`Feature mismatch in ${what}: model has [${got.join(",")}], code expects [${want.join(",")}]`);
  }
}
