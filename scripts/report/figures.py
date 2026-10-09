"""
Report figures, generated from the experiment artefacts only:
  public/data/models/ml-metrics.json, public/data/validation/results.json
Output: report/figures/*.svg

  python scripts/report/figures.py
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "report" / "figures"
ML = json.loads((ROOT / "public/data/models/ml-metrics.json").read_text(encoding="utf-8"))
RES = json.loads((ROOT / "public/data/validation/results.json").read_text(encoding="utf-8"))

METHODS = ["fixed", "physics", "mlonly", "hybrid"]
LABEL = {"fixed": "Fixed operation", "physics": "Physics only", "mlonly": "ML only", "hybrid": "AquaTwin hybrid", "nominal": "Physics (uncalibrated)"}
COLOR = {"fixed": "#b9c0ca", "nominal": "#d5dae1", "physics": "#86bbe6", "mlonly": "#56627a", "hybrid": "#0a72d6"}
INK = "#1b2432"
MUTED = "#5b6677"
CRIT = "#b3261e"
WARN = "#b86e00"

plt.rcParams.update(
    {
        "font.family": ["Segoe UI", "DejaVu Sans"],
        "font.size": 9,
        "axes.edgecolor": "#c9d0da",
        "axes.labelcolor": INK,
        "axes.titlesize": 10,
        "axes.titleweight": "bold",
        "axes.titlecolor": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#e7ebf0",
        "grid.linewidth": 0.7,
        "legend.frameon": False,
        "svg.fonttype": "none",
        "figure.dpi": 110,
    }
)


def save(fig, name: str):
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / f"{name}.svg", bbox_inches="tight")
    fig.savefig(OUT / f"{name}.png", bbox_inches="tight", dpi=180)
    plt.close(fig)
    print("wrote", name)


def fig_accuracy():
    ev = ML["evaluation"]
    targets = [("Q", "Permeate flow (m³/h)"), ("C", "Permeate TDS (mg/L)"), ("W", "RO power (kW)")]
    kinds = ["physics", "mlonly", "hybrid"]
    fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.4))
    for ax, (t, title) in zip(axes, targets):
        x = np.arange(2)
        for i, k in enumerate(kinds):
            vals = [ev[s][t][k]["vs_truth"]["mae"] for s in ("test_id", "test_ood")]
            ax.bar(x + (i - 1) * 0.26, vals, 0.24, color=COLOR[k], label=LABEL[k])
            for xi, v in zip(x + (i - 1) * 0.26, vals):
                ax.text(xi, v, f"{v:.1f}" if v < 100 else f"{v:.0f}", ha="center", va="bottom", fontsize=6.5, color=MUTED)
        ax.set_xticks(x, ["inside\nenvelope", "outside\nenvelope"])
        ax.set_title(title, loc="left")
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("MAE vs truth")
    h, l = axes[0].get_legend_handles_labels()
    fig.tight_layout(rect=(0, 0.08, 1, 1))
    fig.legend(h, l, loc="lower center", ncol=3, fontsize=7.5, bbox_to_anchor=(0.5, 0.0))
    save(fig, "accuracy")


def fig_coverage():
    ev = ML["evaluation"]
    kinds = ["physics", "mlonly", "hybrid"]
    fig, ax = plt.subplots(figsize=(3.4, 2.4))
    x = np.arange(2)
    for i, k in enumerate(kinds):
        vals = [np.mean([ev[s][t][k]["coverage_truth"] for t in ("Q", "C", "W")]) for s in ("test_id", "test_ood")]
        ax.bar(x + (i - 1) * 0.26, vals, 0.24, color=COLOR[k], label=LABEL[k])
    ax.axhline(0.9, color=INK, lw=0.9, ls="--")
    ax.text(1.45, 0.905, "nominal 0.90", fontsize=7, color=INK, ha="right", va="bottom")
    ax.set_ylim(0, 1.05)
    ax.set_xticks(x, ["inside envelope", "outside envelope"])
    ax.set_title("90 % interval coverage (mean of 3 targets)", loc="left")
    ax.grid(axis="x", visible=False)
    ax.legend(fontsize=7, loc="lower left")
    fig.tight_layout()
    save(fig, "coverage")


def fig_violations():
    sc = [s for s in RES["scenarios"]]
    fig, ax = plt.subplots(figsize=(7.2, 2.7))
    x = np.arange(len(sc))
    for i, k in enumerate(METHODS):
        vals = [RES["results"][s["id"]][k]["anyViolation_h"]["mean"] or 0 for s in sc]
        ax.bar(x + (i - 1.5) * 0.2, vals, 0.19, color=COLOR[k], label=LABEL[k])
    ax.set_xticks(x, [s["name"].replace(" ", "\n", 1) for s in sc], fontsize=7.5)
    ax.set_ylabel("hours with a violation (of 24)")
    ax.set_title("Closed loop on the reference plant: constraint-violation hours (mean of 5 seeds)", loc="left")
    ax.grid(axis="x", visible=False)
    ax.legend(ncol=4, fontsize=7, loc="upper left")
    fig.tight_layout()
    save(fig, "violations")


def fig_sec():
    sc = [s for s in RES["scenarios"]]
    fig, ax = plt.subplots(figsize=(7.2, 2.4))
    x = np.arange(len(sc))
    for i, k in enumerate(["physics", "mlonly", "hybrid"]):
        vals = []
        for s in sc:
            r = RES["results"][s["id"]]
            vals.append((r[k]["sec_kWh_m3"]["mean"] / r["fixed"]["sec_kWh_m3"]["mean"] - 1) * 100)
        ax.bar(x + (i - 1) * 0.26, vals, 0.24, color=COLOR[k], label=LABEL[k])
    ax.axhline(0, color=INK, lw=0.8)
    ax.set_xticks(x, [s["name"].replace(" ", "\n", 1) for s in sc], fontsize=7.5)
    ax.set_ylabel("SEC vs fixed operation (%)")
    ax.set_title("Energy cost of the closed-loop strategies (specific energy relative to fixed operation)", loc="left")
    ax.grid(axis="x", visible=False)
    ax.legend(ncol=3, fontsize=7, loc="upper left")
    fig.tight_layout()
    save(fig, "sec")


def fig_salinity():
    tr = RES["trajectories"]["salinity"]
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.5))
    for k, ls in [("fixed", "-"), ("physics", "-"), ("mlonly", "-"), ("hybrid", "-")]:
        t = [p["t"] for p in tr[k]]
        axes[0].plot(t, [p["tds"] for p in tr[k]], ls, color=COLOR[k] if k != "fixed" else "#8a94a4", lw=1.6 if k in ("hybrid", "fixed") else 1.0, label=LABEL[k])
        axes[1].plot(t, [p["reservoir"] for p in tr[k]], ls, color=COLOR[k] if k != "fixed" else "#8a94a4", lw=1.6 if k in ("hybrid", "fixed") else 1.0)
    axes[0].axhline(400, color=CRIT, lw=0.9, ls="--")
    axes[0].text(23.5, 403, "specification 400 mg/L", color=CRIT, fontsize=7, ha="right", va="bottom")
    axes[1].axhline(25, color=CRIT, lw=0.9, ls="--")
    axes[1].text(23.5, 26, "reserve minimum 25 %", color=CRIT, fontsize=7, ha="right", va="bottom")
    axes[0].set_title("Salinity shock: blended permeate TDS (mg/L)", loc="left")
    axes[1].set_title("Product storage (% of capacity)", loc="left")
    for ax in axes:
        ax.set_xlabel("hours")
        ax.set_xlim(0, 24)
    h, l = axes[0].get_legend_handles_labels()
    fig.tight_layout(rect=(0, 0.08, 1, 1))
    fig.legend(h, l, loc="lower center", ncol=4, fontsize=7.5, bbox_to_anchor=(0.5, 0.0))
    save(fig, "salinity")


def fig_fouling():
    tr = RES["trajectories"]["fouling"]
    fig, ax = plt.subplots(figsize=(3.5, 2.5))
    t = [p["t"] for p in tr["fixed"]]
    ax.plot(t, [p["health"][1] * 100 for p in tr["fixed"]], color="#8a94a4", lw=1.6, label="true NPF, no action")
    ax.plot(t, [p["healthEst"][1] * 100 for p in tr["fixed"]], color=COLOR["hybrid"], lw=0.8, alpha=0.8, label="AquaTwin estimate")
    ax.plot(t, [p["health"][1] * 100 for p in tr["hybrid"]], color=COLOR["hybrid"], lw=1.6, ls="--", label="true NPF, AquaTwin loop")
    ax.axhline(90, color=WARN, lw=0.9, ls="--")
    ax.text(0.5, 89.85, "flow cleaning criterion (−10 %)", color=WARN, fontsize=7, va="top")
    lt = RES["leadTime"]["fouling"]
    if lt.get("hybrid_h") is not None and lt.get("event_h") is not None:
        tw = lt["event_h"] - lt["hybrid_h"]
        ax.axvline(tw, color=COLOR["hybrid"], lw=0.8, ls=":")
        ax.text(tw + 0.3, 94.8, f"AquaTwin warns\n{lt['hybrid_h']:.1f} h ahead", fontsize=6.5, color=COLOR["hybrid"])
    ax.set_title("Train 2 fouling (normalised flow, %)", loc="left")
    ax.set_xlabel("hours")
    ax.set_xlim(0, 24)
    ax.legend(fontsize=6.3, loc="upper right")
    fig.tight_layout()
    save(fig, "fouling")


def fig_leadtime():
    rows = [(s["name"], RES["leadTime"][s["id"]]) for s in RES["scenarios"] if RES["leadTime"].get(s["id"], {}).get("eventsObserved")]
    fig, ax = plt.subplots(figsize=(3.6, 2.5))
    y = np.arange(len(rows))
    for i, (k, lab, col) in enumerate([("conventional", "Conventional alarm", "#b9c0ca"), ("hybrid", "AquaTwin hybrid", COLOR["hybrid"])]):
        vals = [(r.get(f"{k}_h") or 0) for _, r in rows]
        ax.barh(y + (i - 0.5) * 0.36, vals, 0.34, color=col, label=lab)
        for yi, v, (_, r) in zip(y + (i - 0.5) * 0.36, vals, rows):
            ax.text(v + 0.1, yi, "none" if r.get(f"{k}_h") is None else f"{v:.1f} h", va="center", fontsize=6.5, color=MUTED)
    ax.set_yticks(y, [n for n, _ in rows], fontsize=7.5)
    ax.invert_yaxis()
    ax.set_xlabel("warning lead time before the event (h)")
    ax.set_title("Early warning (no-action runs)", loc="left")
    ax.grid(axis="y", visible=False)
    ax.legend(fontsize=7, loc="lower right")
    fig.tight_layout()
    save(fig, "leadtime")


if __name__ == "__main__":
    fig_accuracy()
    fig_coverage()
    fig_violations()
    fig_sec()
    fig_salinity()
    fig_fouling()
    fig_leadtime()
