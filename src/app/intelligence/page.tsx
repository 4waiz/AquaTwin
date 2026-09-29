"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Panel, Provenance } from "@/components/ui/primitives";
import { OodProbe } from "@/components/intelligence/OodProbe";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { useStaticJson } from "@/lib/useStaticJson";
import { fmt, fmtInt, fmtSigned } from "@/lib/format";
import { LIMITS } from "@/sim/config";
import type { LiveSnapshot } from "@/runtime/protocol";

interface Metrics {
  meta: {
    seed: number;
    nTrain: number;
    nCal: number;
    nTestId: number;
    nTestOod: number;
    sklearn: string;
    created: string;
    hyperparameters: Record<string, string | number>;
  };
  evaluation: Record<string, Record<string, Record<string, { vs_truth: { mae: number } }> | number>>;
  importance: Record<string, { feature: string; mean: number; std: number }[]>;
  ood: { d99: number; withhold_rule?: { test_id_flag_rate: number; test_ood_flag_rate: number } };
  conformal: { alpha: number };
}

type LayerId = "data" | "physics" | "ml" | "degradation" | "forecast" | "optimizer" | "guard" | "operator";

interface Layer {
  id: LayerId;
  n: string;
  title: string;
  what: string;
  inputs: string;
  outputs: string;
  method: string;
  live: (s: LiveSnapshot) => ReactNode;
}

const LAYERS: Layer[] = [
  {
    id: "data",
    n: "01",
    title: "Sensor / simulation data",
    what: "Telemetry of the simulated plant: 1 Hz live, noisy sensors.",
    inputs: "Seawater: salinity, temperature, turbidity, pH. Per train: feed pressure and flow, permeate flow and conductivity, vessel ΔP, motor power.",
    outputs: "Measurement vector per train (6 signals) + seawater state.",
    method: "Reference plant (7-element × 2-segment solution–diffusion model) plus Gaussian sensor noise. Stands in for SCADA/historian data.",
    live: (s) => `Train 2: ${fmt(s.trains[1].feedPressure_bar, 1)} bar · ${fmtInt(s.trains[1].permeateFlow_m3h)} m³/h · ${fmtInt(s.trains[1].permeateTDS_mgL)} mg/L`,
  },
  {
    id: "physics",
    n: "02",
    title: "Physics model (self-calibrating)",
    what: "Reduced-order 0D solution–diffusion model of each RO train, re-identified continuously.",
    inputs: "Pressure, flow, salinity, temperature; parameters θ̂ = {A₂₅, B₂₅, k_dp, η}.",
    outputs: "Permeate flow, TDS, recovery, ΔP, RO power; calibrated θ̂.",
    method: "Jw = A(T)(P − ΔP/2 − Pp − Δπ); Cp = B·βC̄/(Jw+B); log-mean concentration; β = 1.1. θ̂ from inverting the model on each sample, EWMA τ = 24 min.",
    live: (s) => `θ̂ (T2): A₂₅ ${fmt(s.theta[1].A25, 3)} · B₂₅ ${fmt(s.theta[1].B25, 4)} · k_dp ${fmt(s.theta[1].kdp, 4)} · η ${fmt(s.theta[1].pumpEff, 3)}`,
  },
  {
    id: "ml",
    n: "03",
    title: "Residual ML",
    what: "Learns what the lumped physics cannot represent; corrects its predictions.",
    inputs: "16 features: what-if point, calibration point and conditions, θ̂, physics outputs.",
    outputs: "Residuals for permeate flow (relative), TDS (log-ratio), ΔP (bar), power (relative).",
    method:
      "scikit-learn HistGradientBoosting, 350 trees × 4 targets, trained on 40 000 synthetic samples; exported to JSON and evaluated in the browser; browser and scikit-learn predictions agree to within 1e-9.",
    live: (s) =>
      s.hybrid[1].residual
        ? `T2 residuals: Q ${fmtSigned(s.hybrid[1].residual.Q * 100, 2, "%")} · C ${fmtSigned(s.hybrid[1].residual.C * 100, 2, "%")} · ΔP ${fmtSigned(s.hybrid[1].residual.D, 3, " bar")}`
        : "—",
  },
  {
    id: "degradation",
    n: "04",
    title: "Degradation model",
    what: "Health as normalised permeate flow at standard conditions; lumped fouling dynamics.",
    inputs: "Calibrated θ̂, hybrid predictions at standard conditions, flux history.",
    outputs: "NPF, NDP, NSP per train; fouling rate.",
    method: "dφ/dt = κ̂·F·m·(J/J_ref)²·(1 − φ/φmax); κ̂, ΔP and salt-passage gains fitted on synthetic operating history.",
    live: (s) => s.health.map((h, i) => `T${i + 1} ${fmt(h.npf * 100, 1)}%`).join(" · "),
  },
  {
    id: "forecast",
    n: "05",
    title: "Forecasting",
    what: "Where health and plant state are heading.",
    inputs: "NPF history (24 h); scenario disturbances for what-if horizons.",
    outputs: "Time-to-cleaning-threshold with 90 % band; 24 h scenario trajectories.",
    method: "OLS trend with confidence band and slope-sampling probability; forward simulation of the calibrated hybrid twin (10-min steps).",
    live: (s) => {
      const t = s.healthTrend[1];
      return t.hours !== null
        ? `T2 threshold in ${fmt(t.lo, 0)}–${fmt(t.hi ?? t.hours, 0)} h (P ≤ 24 h: ${fmt(t.probWithin * 100, 0)}%)`
        : "No threshold crossing projected";
    },
  },
  {
    id: "optimizer",
    n: "06",
    title: "Optimiser",
    what: "Searches operating strategies against competing objectives.",
    inputs: "Candidate pressure × flow × train allocation (676), production plan, weights.",
    outputs: "Admissible set, Pareto set, recommended strategy.",
    method: "Exhaustive grid with cached per-train predictions; weighted objectives (SEC, TDS, production, stress, fouling) + move suppression.",
    live: () => "Hourly in the Scenario Lab; on demand on the Optimization page.",
  },
  {
    id: "guard",
    n: "07",
    title: "AquaGuard",
    what: "Deterministic safety layer. Nothing is recommended without passing it.",
    inputs: "Predicted plant state + 90 % conformal half-widths + model confidence.",
    outputs: "APPROVED / REJECTED (with reasons) / WITHHELD.",
    method: `Hard limits checked at the interval edge: TDS ≤ ${LIMITS.maxPermeateTDS_mgL} mg/L, P ≤ ${LIMITS.maxFeedPressure_bar} bar, recovery, flux, ΔP, brine flow, motor rating, storage, power cap, ramp; confidence ≥ ${LIMITS.minConfidence * 100}%.`,
    live: (s) => `${s.guard.verdict} · ${s.guard.rules.filter((r) => r.status !== "fail").length}/${s.guard.rules.length} rules pass`,
  },
  {
    id: "operator",
    n: "08",
    title: "Operator recommendation",
    what: "Advisory output (shadow mode). Operators decide; AquaTwin explains.",
    inputs: "Recommended strategy, verdict, reasons, forecasts.",
    outputs: "Recommendation with predicted impact and constraint margins.",
    method: "Template explanations generated from model outputs. No language model is used in the decision path.",
    live: (s) => (s.alerts.length ? s.alerts[0].text : "No active alerts."),
  },
];

const FEATURE_LABEL: Record<string, string> = {
  r_phys: "Physics recovery",
  J_phys: "Physics flux",
  A25: "Calibrated permeability",
  B25: "Calibrated salt passage",
  kdp: "Calibrated ΔP coefficient",
  eta: "Calibrated pump efficiency",
  Qv0_m3h: "Calibration feed flow",
  P0_bar: "Calibration pressure",
  Qv1_m3h: "What-if feed flow",
  P1_bar: "What-if pressure",
  Cf_gL: "Feed salinity",
  T_C: "Temperature",
  Cf0_gL: "Calibration salinity",
  T0_C: "Calibration temperature",
  Cp_phys_mgL: "Physics permeate TDS",
  dP_phys_bar: "Physics ΔP",
};

export default function IntelligencePage() {
  const snap = useLive((s) => s.snapshot);
  const { data: metrics } = useStaticJson<Metrics>("/data/models/ml-metrics.json");
  const [sel, setSel] = useState<LayerId>("ml");
  useEffect(() => useScenario.getState().setActive(false), []);
  const layer = LAYERS.find((l) => l.id === sel)!;
  const imp = metrics?.importance?.Q?.slice(0, 5) ?? [];
  const maxImp = Math.max(1e-9, ...imp.map((i) => i.mean));
  const qId = metrics?.evaluation?.test_id?.Q as Record<string, { vs_truth: { mae: number } }> | undefined;
  const qOod = metrics?.evaluation?.test_ood?.Q as Record<string, { vs_truth: { mae: number } }> | undefined;

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_420px] grid-rows-[auto_minmax(420px,1fr)_auto] gap-4 p-5 pt-4">
      <div data-reveal="header" className="col-span-2 flex items-end justify-between gap-6">
        <div>
          <div className="label">Model Intelligence</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Physics + machine learning + forecasting + optimisation + safety</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">No black box: every layer, its inputs, outputs and method. Select a layer to inspect it.</p>
        </div>
        <Provenance kind="modeled" />
      </div>

      <Panel title="Architecture" reveal="panel1" bodyClassName="grid min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-5 p-4">
        <ol className="flex flex-col">
          {LAYERS.map((l, i) => (
            <li key={l.id} className="relative">
              <button
                onClick={() => setSel(l.id)}
                aria-pressed={sel === l.id}
                className={`flex h-[34px] w-full items-center gap-3 rounded-md border px-3 text-left transition-colors ${
                  sel === l.id ? "border-accent/60 bg-accent-soft/40" : "border-line bg-ink-900 hover:border-line-strong"
                }`}
              >
                <span className="font-mono text-[10px] text-accent">{l.n}</span>
                <span className={`text-[12.5px] ${sel === l.id ? "text-fg" : "text-fg-muted"}`}>{l.title}</span>
              </button>
              {i < LAYERS.length - 1 && <span className="ml-[22px] block h-2 w-px bg-line-bright" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] text-accent">LAYER {layer.n}</div>
          <h2 className="mt-1 text-[17px] font-semibold text-fg">{layer.title}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">{layer.what}</p>
          <dl className="mt-4 space-y-3 text-[12.5px]">
            <div>
              <dt className="label">Inputs</dt>
              <dd className="mt-0.5 text-fg">{layer.inputs}</dd>
            </div>
            <div>
              <dt className="label">Outputs</dt>
              <dd className="mt-0.5 text-fg">{layer.outputs}</dd>
            </div>
            <div>
              <dt className="label">Method</dt>
              <dd className="mt-0.5 leading-relaxed text-fg">{layer.method}</dd>
            </div>
            <div>
              <dt className="label">Live</dt>
              <dd className="num mt-0.5 rounded-md border border-line bg-ink-900 px-3 py-2 text-fg-muted">{snap ? layer.live(snap) : "Waiting for telemetry…"}</dd>
            </div>
          </dl>
        </div>
      </Panel>

      <Panel
        title="Model card"
        right={<span className="text-[11px] text-fg-subtle">ml/train.py</span>}
        reveal="panel2"
        bodyClassName="scroll-quiet space-y-3.5 overflow-y-auto p-4 text-[12px]"
      >
        {metrics ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
              <span className="text-fg-subtle">Samples · train / calibration</span>
              <span className="num text-right text-fg">
                {fmtInt(metrics.meta.nTrain)} / {fmtInt(metrics.meta.nCal)}
              </span>
              <span className="text-fg-subtle">Test · in / out of envelope</span>
              <span className="num text-right text-fg">
                {fmtInt(metrics.meta.nTestId)} / {fmtInt(metrics.meta.nTestOod)}
              </span>
              <span className="text-fg-subtle">Seed · scikit-learn</span>
              <span className="num text-right text-fg">
                {metrics.meta.seed} · {metrics.meta.sklearn}
              </span>
            </div>
            <div>
              <div className="label mb-1.5">Permeate-flow MAE vs truth (m³/h)</div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[10.5px] text-fg-subtle">
                    <th className="font-normal" />
                    <th className="text-right font-normal">In envelope</th>
                    <th className="text-right font-normal">Outside</th>
                  </tr>
                </thead>
                <tbody>
                  {(["physics", "mlonly", "hybrid"] as const).map((k) => (
                    <tr key={k} className="border-t border-line">
                      <td className={`py-1 ${k === "hybrid" ? "text-accent" : "text-fg-muted"}`}>
                        {k === "physics" ? "Physics (calibrated)" : k === "mlonly" ? "ML only" : "AquaTwin hybrid"}
                      </td>
                      <td className="num py-1 text-right text-fg">{fmt(qId?.[k]?.vs_truth.mae, 1)}</td>
                      <td className="num py-1 text-right text-fg">{fmt(qOod?.[k]?.vs_truth.mae, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {metrics.ood.withhold_rule && (
              <div className="text-fg-muted">
                Withhold rule flags <span className="num text-fg">{fmt(metrics.ood.withhold_rule.test_ood_flag_rate * 100, 0)}%</span> of out-of-envelope samples and{" "}
                <span className="num text-fg">{fmt(metrics.ood.withhold_rule.test_id_flag_rate * 100, 2)}%</span> of in-envelope samples.
              </div>
            )}
            <div>
              <div className="label mb-1.5">Permutation importance · permeate-flow residual</div>
              <div className="space-y-1">
                {imp.map((i) => (
                  <div key={i.feature} className="grid grid-cols-[150px_1fr_44px] items-center gap-2">
                    <span className="truncate text-[11px] text-fg-muted" title={i.feature}>
                      {FEATURE_LABEL[i.feature] ?? i.feature}
                    </span>
                    <div className="h-1.5 rounded-full bg-ink-700">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, (i.mean / maxImp) * 100)}%` }} />
                    </div>
                    <span className="num text-right text-[10.5px] text-fg-subtle">{fmt(i.mean, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-fg-subtle">Loading model metrics…</div>
        )}
      </Panel>

      <OodProbe className="col-span-2" reveal="panel3" />
    </div>
  );
}
