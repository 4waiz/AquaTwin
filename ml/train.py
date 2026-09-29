"""
AquaTwin ML training and evaluation (docs/MODEL.md §5).

Trains, on the synthetic dataset produced by scripts/generate-dataset.ts:
  * hybrid residual models   physics prediction -> residual to the plant
  * ML-only models           raw inputs + recent measurements -> plant outputs
for four targets (permeate flow Q, permeate TDS C, vessel dP D, RO power W),
then computes split-conformal interval half-widths, Mahalanobis OOD
statistics, held-out accuracy (in-distribution and out-of-distribution),
and permutation importance. Everything is exported as JSON for the
TypeScript runtime (public/data/models/aquatwin-ml.json).

Deterministic: fixed seed, no early stopping, single-threaded-safe estimator.

Usage:  python ml/train.py [--small]
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import math
import platform
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "ml"
ART = ROOT / "ml" / "artifacts"
PUBLIC = ROOT / "public" / "data" / "models"

SEED = 20261101
ALPHA = 0.10  # conformal miscoverage -> 90 % intervals

HYPER = dict(
    loss="squared_error",
    learning_rate=0.06,
    max_iter=350,
    max_leaf_nodes=31,
    min_samples_leaf=40,
    l2_regularization=1.0,
    max_bins=255,
    early_stopping=False,
    random_state=SEED,
)

TARGETS = ["Q", "C", "D", "W"]
TARGET_NAMES = {"Q": "Permeate flow", "C": "Permeate TDS", "D": "Vessel dP", "W": "RO power"}
UNITS = {"Q": "m3/h", "C": "mg/L", "D": "bar", "W": "kW"}
COLS = {  # (physics, nominal physics, truth, measured) column per target
    "Q": ("Qp_phys", "Qp_nom", "Qp_true", "Qp_meas"),
    "C": ("Cp_phys_mgL", "Cp_nom", "Cp_true", "Cp_meas"),
    "D": ("dP_phys_bar", "dP_nom", "dP_true", "dP_meas"),
    "W": ("Pow_phys", "Pow_nom", "Pow_true", "Pow_meas"),
}


# --------------------------------------------------------------------------
# residual transforms: relative for Q and W, log-ratio for C, absolute for D
# --------------------------------------------------------------------------
def to_residual(t: str, y: np.ndarray, phys: np.ndarray) -> np.ndarray:
    if t in ("Q", "W"):
        return y / phys - 1.0
    if t == "C":
        return np.log(y / phys)
    return y - phys


def from_residual(t: str, r: np.ndarray, phys: np.ndarray) -> np.ndarray:
    if t in ("Q", "W"):
        return phys * (1.0 + r)
    if t == "C":
        return phys * np.exp(r)
    return phys + r


def score(t: str, y: np.ndarray, yhat: np.ndarray) -> np.ndarray:
    """Conformal nonconformity score, in the same space the runtime applies it."""
    if t in ("Q", "W"):
        return np.abs(y / yhat - 1.0)
    if t == "C":
        return np.abs(np.log(y / yhat))
    return np.abs(y - yhat)


def conformal_q(scores: np.ndarray, alpha: float) -> float:
    n = len(scores)
    k = math.ceil((n + 1) * (1 - alpha))
    return float(np.sort(scores)[min(k, n) - 1])


# Mondrian bins on the normalised what-if extrapolation distance between the
# calibration point u0 and the queried point u1 (same definition as ml.ts).
BIN_EDGES = [1.0, 2.5]


def extrapolation_distance(d: pd.DataFrame) -> np.ndarray:
    return np.sqrt(
        ((d["P1_bar"] - d["P0_bar"]) / 3.0) ** 2
        + (d["Qv1_m3h"] - d["Qv0_m3h"]) ** 2
        + ((d["Cf_gL"] - d["Cf0_gL"]) / 3.0) ** 2
        + ((d["T_C"] - d["T0_C"]) / 3.0) ** 2
    ).to_numpy()


def bin_index(dist: np.ndarray) -> np.ndarray:
    return np.searchsorted(np.array(BIN_EDGES), dist, side="right")


# --------------------------------------------------------------------------
# export
# --------------------------------------------------------------------------
def export_hgb(model: HistGradientBoostingRegressor, features: list[str]) -> dict:
    trees = []
    for it in model._predictors:  # noqa: SLF001 - documented, version-pinned export
        nodes = it[0].nodes
        leaf = nodes["is_leaf"].astype(bool)
        trees.append(
            {
                "f": [int(-1 if leaf[i] else nodes["feature_idx"][i]) for i in range(len(nodes))],
                "t": [float(nodes["num_threshold"][i]) for i in range(len(nodes))],
                "l": [int(nodes["left"][i]) for i in range(len(nodes))],
                "r": [int(nodes["right"][i]) for i in range(len(nodes))],
                "v": [float(nodes["value"][i]) for i in range(len(nodes))],
                "m": [int(nodes["missing_go_to_left"][i]) for i in range(len(nodes))],
            }
        )
    return {
        "format": "aquatwin-hgb-v1",
        "features": features,
        "baseline": float(np.ravel(model._baseline_prediction)[0]),  # noqa: SLF001
        "trees": trees,
    }


def metrics(y: np.ndarray, yhat: np.ndarray) -> dict:
    e = yhat - y
    return {
        "mae": float(np.mean(np.abs(e))),
        "rmse": float(np.sqrt(np.mean(e**2))),
        "mape": float(np.mean(np.abs(e) / np.abs(y)) * 100),
        "bias": float(np.mean(e)),
        "p95_abs": float(np.percentile(np.abs(e), 95)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--small", action="store_true")
    args = ap.parse_args()

    t_start = time.time()
    spec = json.loads((DATA / "feature_spec.json").read_text(encoding="utf-8"))
    ds_file = DATA / ("dataset_small.csv.gz" if args.small else "dataset.csv.gz")
    with gzip.open(ds_file, "rt", encoding="utf-8") as fh:
        df = pd.read_csv(fh)
    hyb_f: list[str] = spec["hybrid_features"]
    mlo_f: list[str] = spec["mlonly_features"]
    ood_f: list[str] = spec["ood_features"]
    missing = [c for c in hyb_f + mlo_f + ood_f if c not in df.columns]
    if missing:
        sys.exit(f"dataset is missing feature columns {missing}; regenerate it")

    split = {s: df[df["split"] == s].reset_index(drop=True) for s in ["train", "cal", "test_id", "test_ood"]}
    print({k: len(v) for k, v in split.items()})

    ART.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    models: dict[str, dict[str, HistGradientBoostingRegressor]] = {"hybrid": {}, "mlonly": {}}
    tr = split["train"]
    for t in TARGETS:
        phys_c, _, _, meas_c = COLS[t]
        m_h = HistGradientBoostingRegressor(**HYPER)
        m_h.fit(tr[hyb_f].to_numpy(), to_residual(t, tr[meas_c].to_numpy(), tr[phys_c].to_numpy()))
        models["hybrid"][t] = m_h
        m_m = HistGradientBoostingRegressor(**HYPER)
        m_m.fit(tr[mlo_f].to_numpy(), tr[meas_c].to_numpy())
        models["mlonly"][t] = m_m
        print(f"trained {t} ({time.time() - t_start:.1f}s)")

    def predict(kind: str, t: str, d: pd.DataFrame) -> np.ndarray:
        phys = d[COLS[t][0]].to_numpy()
        if kind == "physics":
            return phys
        if kind == "nominal":
            return d[COLS[t][1]].to_numpy()
        if kind == "hybrid":
            return from_residual(t, models["hybrid"][t].predict(d[hyb_f].to_numpy()), phys)
        return models["mlonly"][t].predict(d[mlo_f].to_numpy())

    kinds = ["nominal", "physics", "mlonly", "hybrid"]

    # ---- conformal calibration (labels = noisy measurements) ----------------
    cal = split["cal"]
    cal_bins = bin_index(extrapolation_distance(cal))
    conformal: dict = {"alpha": ALPHA, "binEdges": BIN_EDGES}
    for kind in ["physics", "mlonly", "hybrid"]:
        conformal[kind] = {}
        for t in TARGETS:
            s = score(t, cal[COLS[t][3]].to_numpy(), predict(kind, t, cal))
            per_bin = [conformal_q(s[cal_bins == b], ALPHA) for b in range(len(BIN_EDGES) + 1)]
            conformal[kind][t] = {"all": conformal_q(s, ALPHA), "bins": per_bin}

    def half_width(kind: str, t: str, d: pd.DataFrame) -> np.ndarray:
        return np.array(conformal[kind][t]["bins"])[bin_index(extrapolation_distance(d))]

    # ---- accuracy on held-out sets ---------------------------------------
    evaluation: dict = {}
    for sname in ["test_id", "test_ood"]:
        d = split[sname]
        evaluation[sname] = {"n": int(len(d))}
        for t in TARGETS:
            truth = d[COLS[t][2]].to_numpy()
            meas = d[COLS[t][3]].to_numpy()
            evaluation[sname][t] = {}
            for kind in kinds:
                yhat = predict(kind, t, d)
                entry = {"vs_truth": metrics(truth, yhat), "vs_measured": metrics(meas, yhat)}
                if kind in ("physics", "mlonly", "hybrid"):
                    hw = half_width(kind, t, d)
                    entry["coverage_measured"] = float(np.mean(score(t, meas, yhat) <= hw))
                    entry["coverage_truth"] = float(np.mean(score(t, truth, yhat) <= hw))
                evaluation[sname][t][kind] = entry
        evaluation[sname]["by_query"] = {}
        for qt, dd in d.groupby("query"):
            evaluation[sname]["by_query"][qt] = {"n": int(len(dd))}
            for t in TARGETS:
                truth = dd[COLS[t][2]].to_numpy()
                evaluation[sname]["by_query"][qt][t] = {k: metrics(truth, predict(k, t, dd))["mae"] for k in kinds}
        if sname == "test_ood":
            evaluation[sname]["by_type"] = {}
            for ot, dd in d.groupby("ood_type"):
                evaluation[sname]["by_type"][ot] = {"n": int(len(dd))}
                for t in TARGETS:
                    truth = dd[COLS[t][2]].to_numpy()
                    evaluation[sname]["by_type"][ot][t] = {
                        k: metrics(truth, predict(k, t, dd))["mae"] for k in kinds
                    }

    # ---- measurement-noise floor (noisy label vs truth) -------------------
    d = split["test_id"]
    noise_floor = {t: metrics(d[COLS[t][2]].to_numpy(), d[COLS[t][3]].to_numpy())["mae"] for t in TARGETS}

    # ---- OOD statistics on training inputs ---------------------------------
    X = tr[ood_f].to_numpy()
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    Z = (X - mu) / sd
    cov = np.cov(Z, rowvar=False)
    prec = np.linalg.inv(cov)
    dist = np.sqrt(np.einsum("ij,jk,ik->i", Z, prec, Z))

    def dists(frame: pd.DataFrame) -> np.ndarray:
        z = (frame[ood_f].to_numpy() - mu) / sd
        return np.sqrt(np.einsum("ij,jk,ik->i", z, prec, z))

    ood = {
        "features": ood_f,
        "mean": mu.tolist(),
        "std": sd.tolist(),
        "precision": prec.tolist(),
        "d50": float(np.percentile(dist, 50)),
        "d95": float(np.percentile(dist, 95)),
        "d99": float(np.percentile(dist, 99)),
        "min": X.min(axis=0).tolist(),
        "max": X.max(axis=0).tolist(),
    }
    d99 = ood["d99"]
    lo = X.min(axis=0)
    hi = X.max(axis=0)
    span = hi - lo

    def flagged(frame: pd.DataFrame) -> np.ndarray:
        """Runtime rule (src/sim/ml.ts assessOod): confidence < 0.5 ⇔ d > 1.4·d99 or any feature out of range."""
        x = frame[ood_f].to_numpy()
        out_of_range = np.any((x < lo - 0.03 * span) | (x > hi + 0.03 * span), axis=1)
        return out_of_range | (dists(frame) > 1.4 * d99)

    ood_eval = {
        "mahalanobis_only": {
            "test_id_flag_rate": float(np.mean(dists(split["test_id"]) > d99)),
            "test_ood_flag_rate": float(np.mean(dists(split["test_ood"]) > d99)),
        },
        "withhold_rule": {
            "test_id_flag_rate": float(np.mean(flagged(split["test_id"]))),
            "test_ood_flag_rate": float(np.mean(flagged(split["test_ood"]))),
            "test_ood_flag_rate_by_type": {
                str(k): float(np.mean(flagged(v))) for k, v in split["test_ood"].groupby("ood_type")
            },
        },
    }

    # ---- permutation importance (hybrid, permeate flow & TDS) --------------
    rs = np.random.RandomState(SEED)
    idx = rs.choice(len(d), size=min(2000, len(d)), replace=False)
    sub = d.iloc[idx]
    importance = {}
    for t in ["Q", "C"]:
        pi = permutation_importance(
            models["hybrid"][t],
            sub[hyb_f].to_numpy(),
            to_residual(t, sub[COLS[t][3]].to_numpy(), sub[COLS[t][0]].to_numpy()),
            n_repeats=5,
            random_state=SEED,
        )
        importance[t] = sorted(
            [{"feature": f, "mean": float(m), "std": float(s)} for f, m, s in zip(hyb_f, pi.importances_mean, pi.importances_std)],
            key=lambda r: -r["mean"],
        )

    # ---- parity sample for the TypeScript runtime -----------------------------
    par = d.iloc[:500]
    parity = {
        "hybrid_X": par[hyb_f].to_numpy().tolist(),
        "mlonly_X": par[mlo_f].to_numpy().tolist(),
        "hybrid": {t: models["hybrid"][t].predict(par[hyb_f].to_numpy()).tolist() for t in TARGETS},
        "mlonly": {t: models["mlonly"][t].predict(par[mlo_f].to_numpy()).tolist() for t in TARGETS},
    }

    meta = {
        "created": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "sklearn": sklearn.__version__,
        "numpy": np.__version__,
        "python": platform.python_version(),
        "dataset": ds_file.name,
        "nTrain": int(len(tr)),
        "nCal": int(len(cal)),
        "nTestId": int(len(split["test_id"])),
        "nTestOod": int(len(split["test_ood"])),
        "hyperparameters": {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in HYPER.items()},
        "trainSeconds": round(time.time() - t_start, 1),
    }
    bundle = {
        "meta": meta,
        "hybrid": {t: export_hgb(models["hybrid"][t], hyb_f) for t in TARGETS},
        "mlonly": {t: export_hgb(models["mlonly"][t], mlo_f) for t in TARGETS},
        "conformal": conformal,
        "ood": ood,
    }
    suffix = "-small" if args.small else ""
    (PUBLIC / f"aquatwin-ml{suffix}.json").write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    report = {
        "meta": meta,
        "targets": {t: {"name": TARGET_NAMES[t], "unit": UNITS[t]} for t in TARGETS},
        "evaluation": evaluation,
        "noise_floor_mae": noise_floor,
        "conformal": conformal,
        "ood": {k: v for k, v in ood.items() if k in ("features", "d50", "d95", "d99", "min", "max")} | ood_eval,
        "importance": importance,
        "spec": {k: spec[k] for k in ("seed", "splits", "envelope", "ood_envelope")},
    }
    (ART / f"metrics{suffix}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (PUBLIC / f"ml-metrics{suffix}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (ART / f"parity{suffix}.json").write_text(json.dumps(parity), encoding="utf-8")

    # ---- console summary ----------------------------------------------------
    for sname in ["test_id", "test_ood"]:
        print(f"\n{sname}: MAE vs truth")
        for t in TARGETS:
            row = "  ".join(f"{k}={evaluation[sname][t][k]['vs_truth']['mae']:.3f}" for k in kinds)
            print(f"  {t} [{UNITS[t]}] {row}")
    print("\ntest_id permeate-flow MAE by query type:")
    for qt, v in evaluation["test_id"]["by_query"].items():
        print(f"  {qt:10s} n={v['n']:5d}  " + "  ".join(f"{k}={v['Q'][k]:.2f}" for k in kinds))
    print("\nnoise floor MAE:", {k: round(v, 3) for k, v in noise_floor.items()})
    print("conformal q (bins):", {k: {t: [round(x, 4) for x in conformal[k][t]["bins"]] for t in TARGETS} for k in ["physics", "mlonly", "hybrid"]})
    for sname in ["test_id", "test_ood"]:
        print(f"coverage {sname}:", {k: {t: round(evaluation[sname][t][k]["coverage_truth"], 3) for t in TARGETS} for k in ["physics", "mlonly", "hybrid"]})
    print("OOD flag rates:", ood_eval)
    print(f"done in {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()
