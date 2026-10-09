"use client";
import { useEffect, useMemo, useState } from "react";
import { Panel, Segmented, Provenance, Chip } from "@/components/ui/primitives";
import { GroupedBars } from "@/components/charts/GroupedBars";
import { useStaticJson } from "@/lib/useStaticJson";
import { useScenario } from "@/state/scenario";
import { VIOLATION_LABEL } from "@/sim/aquaguard";
import { fmt, fmtHours } from "@/lib/format";

type Method = "fixed" | "physics" | "mlonly" | "hybrid";
type Monitor = "conventional" | "physics" | "mlonly" | "hybrid";
interface Stat {
  mean: number | null;
  std: number | null;
}
interface Results {
  meta: {
    created: string;
    gitCommit: string;
    seeds: number[];
    horizon_h: number;
    durationSeconds: number;
    command: string;
    quick?: boolean;
    modelBundle: { seed: number };
  };
  scenarios: { id: string; name: string; tag: string }[];
  methods: Method[];
  results: Record<string, Record<Method, Record<string, Stat>>>;
  leadTime: Record<
    string,
    {
      eventKind: string | null;
      event_h: number | null;
      eventsObserved: number;
      conventional_h: number | null;
      physics_h: number | null;
      mlonly_h: number | null;
      hybrid_h: number | null;
      warned?: Record<Monitor, number>;
      falseWarningHours?: Record<Monitor, number | null>;
    }
  >;
  /** Seed-1 violation hours by start time of day and initial product storage: runs[scenario][storage][clock][method]. */
  robustness?: {
    clocks: number[];
    storage: number[];
    runs: Record<string, Record<string, Record<string, Record<Method, { any: number; by: Record<string, number> }>>>>;
  };
}
interface ErrStats {
  vs_truth: { mae: number };
  coverage_truth?: number;
}
interface Metrics {
  evaluation: Record<"test_id" | "test_ood", Record<string, Record<string, ErrStats>>>;
  noise_floor_mae: Record<string, number>;
}

const METHOD_LABEL: Record<Method, string> = { fixed: "Fixed operation", physics: "Physics only", mlonly: "ML only", hybrid: "AquaTwin hybrid" };
const METHOD_COLOR: Record<Method, string> = { fixed: "var(--color-fg-faint)", physics: "var(--c-series-physics)", mlonly: "var(--c-series-ml)", hybrid: "var(--color-accent)" };

const METRICS: { key: string; label: string; unit: string; digits: number; better: "lower" | "higher" | "none"; na?: Method[] }[] = [
  { key: "anyViolation_h", label: "Constraint violations", unit: "h", digits: 2, better: "lower" },
  { key: "tdsViolation_h", label: "Water-quality violations", unit: "h", digits: 2, better: "lower" },
  { key: "restore_h", label: "Time to restore compliance", unit: "h", digits: 2, better: "lower" },
  { key: "sec_kWh_m3", label: "Specific energy", unit: "kWh/m³", digits: 3, better: "lower" },
  { key: "energy_MWh", label: "Energy", unit: "MWh / 24 h", digits: 1, better: "lower" },
  { key: "production_m3", label: "Water produced", unit: "m³ / 24 h", digits: 0, better: "none" },
  { key: "minReservoir_pct", label: "Lowest product storage", unit: "%", digits: 1, better: "higher" },
  { key: "meanRecovery_pct", label: "Mean recovery", unit: "%", digits: 1, better: "none" },
  { key: "maxTds_mgL", label: "Peak permeate TDS", unit: "mg/L", digits: 0, better: "lower" },
  { key: "carbon_t", label: "Emissions (estimated)", unit: "t CO₂e", digits: 1, better: "lower" },
  { key: "maeProduction_m3h", label: "Prediction MAE · production", unit: "m³/h", digits: 1, better: "lower", na: ["fixed"] },
  { key: "rmseProduction_m3h", label: "Prediction RMSE · production", unit: "m³/h", digits: 1, better: "lower", na: ["fixed"] },
  { key: "maeTds_mgL", label: "Prediction MAE · permeate TDS", unit: "mg/L", digits: 1, better: "lower", na: ["fixed"] },
  { key: "withheld", label: "Recommendations withheld", unit: "per 24 h", digits: 1, better: "none", na: ["fixed"] },
];

function eventLabel(kind: string | null): string {
  if (!kind) return "–";
  const [type, what] = kind.split(":");
  if (type === "cip") return `Flow cleaning criterion · Train ${what.slice(1)}`;
  if (type === "capacity") return `Capacity loss · Train ${what.slice(1)}`;
  return what
    .split("+")
    .map((v) => VIOLATION_LABEL[v] ?? v)
    .join(" + ");
}

function Pending({ what }: { what: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-center">
      <Chip>Pending experiment</Chip>
      <div className="mt-1 max-w-sm text-[12px] text-fg-subtle">{what}</div>
    </div>
  );
}

export default function ValidationPage() {
  const { data: res, missing } = useStaticJson<Results>("/data/validation/results.json");
  const { data: ml, missing: mlMissing } = useStaticJson<Metrics>("/data/models/ml-metrics.json");
  const [metric, setMetric] = useState(METRICS[0].key);
  const [split, setSplit] = useState<"test_id" | "test_ood">("test_id");
  const [storage, setStorage] = useState("0.55");
  useEffect(() => useScenario.getState().setActive(false), []);
  const m = METRICS.find((x) => x.key === metric)!;

  const acc = useMemo(() => {
    if (!ml) return null;
    const ev = ml.evaluation[split];
    const targets = [
      { k: "Q", label: "Permeate flow (m³/h)" },
      { k: "C", label: "Permeate TDS (mg/L)" },
      { k: "W", label: "RO power (kW)" },
    ];
    const kinds = [
      { k: "nominal", label: "Physics (uncalibrated)", color: "var(--color-line-strong)" },
      { k: "physics", label: "Physics (calibrated)", color: METHOD_COLOR.physics },
      { k: "mlonly", label: "ML only", color: METHOD_COLOR.mlonly },
      { k: "hybrid", label: "AquaTwin hybrid", color: METHOD_COLOR.hybrid },
    ];
    return {
      targets,
      series: kinds.map((kd) => ({ id: kd.k, label: kd.label, color: kd.color, values: targets.map((t) => ev?.[t.k]?.[kd.k]?.vs_truth?.mae ?? null) })),
    };
  }, [ml, split]);

  return (
    <div className="flex min-h-full flex-col gap-4 p-5 pt-4 max-lg:p-4">
      <div data-reveal="header" className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-3">
        <div>
          <div className="label">Validation</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Does the hybrid twin actually help?</h1>
          <p className="mt-0.5 max-w-4xl text-[13px] text-fg-muted">
            Controlled experiments on the reference plant simulator, where ground truth is known. Every number below is read from files written by the experiment scripts;
            nothing is typed in by hand. These are simulation results, not industrial validation.
          </p>
        </div>
        {res && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{res.meta.seeds.length} seeds</Chip>
            {res.meta.gitCommit !== "unknown" && <Chip>commit {res.meta.gitCommit}</Chip>}
            <Chip>{new Date(res.meta.created).toLocaleDateString("en-GB")}</Chip>
            {res.meta.quick && <Chip tone="warn">quick run</Chip>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 max-lg:grid-cols-1">
        <Panel
          title="Prediction accuracy · held-out data"
          right={
            <Segmented
              size="sm"
              value={split}
              onChange={setSplit}
              ariaLabel="Test set"
              options={[
                { value: "test_id", label: "Inside envelope" },
                { value: "test_ood", label: "Outside envelope" },
              ]}
            />
          }
          reveal="panel1"
          bodyClassName="flex flex-col gap-4 p-4"
        >
          {acc && ml ? (
            <>
              <GroupedBars categories={acc.targets.map((t) => t.label)} series={acc.series} format={(v) => v.toFixed(1)} unit="MAE vs noise-free truth" highlightMin />
              <div>
                <div className="label mb-1.5">90% prediction-interval coverage (nominal 0.90)</div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[11px] text-fg-subtle">
                      <th className="pb-1 font-normal" />
                      {["Permeate flow", "Permeate TDS", "RO power"].map((h) => (
                        <th key={h} className="pb-1 text-right font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(["physics", "mlonly", "hybrid"] as const).map((k) => (
                      <tr key={k} className="border-t border-line">
                        <td className="py-1 text-fg-muted">{METHOD_LABEL[k]}</td>
                        {(["Q", "C", "W"] as const).map((t) => {
                          const c = ml.evaluation[split]?.[t]?.[k]?.coverage_truth;
                          return (
                            <td key={t} className={`num py-1 text-right ${c !== undefined && c < 0.85 ? "text-warn" : "text-fg"}`}>
                              {fmt(c, 2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                Task: calibrate on noisy telemetry at one operating point, predict another (what-if, normalisation or changed seawater). Sensor-noise floor for permeate
                flow: {fmt(ml.noise_floor_mae.Q, 1)} m³/h. Outside the envelope the learned models lose accuracy and their intervals under-cover, which is why AquaTwin
                withholds recommendations there instead of trusting them.
              </p>
            </>
          ) : mlMissing ? (
            <Pending what="Run: python ml/train.py" />
          ) : (
            <div className="text-[12px] text-fg-subtle">Loading…</div>
          )}
        </Panel>

        <Panel
          title="Closed-loop experiments · 24 h on the reference plant"
          right={
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="h-7 rounded-md border border-line-strong bg-ink-900 px-2 text-[12px] text-fg outline-none focus-visible:border-accent"
              aria-label="Metric"
            >
              {METRICS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          }
          reveal="panel2"
          bodyClassName="scroll-quiet overflow-x-auto p-4"
        >
          {res ? (
            <>
              <table className="w-full text-[12px] max-lg:min-w-[620px]">
                <thead>
                  <tr className="text-left text-[11px] text-fg-subtle">
                    <th className="pb-2 font-normal">
                      Scenario <span className="text-fg-faint">· {m.unit}</span>
                    </th>
                    {res.methods.map((k) => (
                      <th key={k} className="pb-2 text-right font-normal">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: METHOD_COLOR[k] }} />
                          {METHOD_LABEL[k]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.scenarios.map((s) => {
                    const row = res.results[s.id];
                    const vals = res.methods.map((k) => (m.na?.includes(k) ? null : (row?.[k]?.[m.key]?.mean ?? null)));
                    const finite = vals.filter((v): v is number => v !== null && Number.isFinite(v));
                    const rounded = finite.map((v) => Number(v.toFixed(m.digits)));
                    const distinct = new Set(rounded).size > 1;
                    const bestV = distinct && m.better !== "none" ? (m.better === "lower" ? Math.min(...rounded) : Math.max(...rounded)) : null;
                    return (
                      <tr key={s.id} className="border-t border-line">
                        <td className="py-[7px] pr-3">
                          <span className="text-fg">{s.name}</span>
                          <span className="ml-2 text-[11px] text-fg-subtle">{s.tag}</span>
                        </td>
                        {res.methods.map((k, i) => {
                          const v = vals[i];
                          const sd = row?.[k]?.[m.key]?.std;
                          const isBest = v !== null && bestV !== null && Number(v.toFixed(m.digits)) === bestV;
                          const showSd = v !== null && sd !== null && sd !== undefined && Number(sd.toFixed(m.digits)) > 0;
                          return (
                            <td key={k} className={`num py-[7px] text-right ${v === null ? "text-fg-faint" : isBest ? "font-medium text-fg" : "text-fg-muted"}`}>
                              {v === null ? (m.na?.includes(k) ? "n/a" : "–") : fmt(v, m.digits)}
                              {showSd && <span className="ml-1 text-[10px] font-normal text-fg-faint">±{fmt(sd, m.digits)}</span>}
                              <span className={`ml-1 inline-block w-1.5 ${isBest ? "text-accent" : "text-transparent"}`}>•</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-fg-subtle">
                Mean ± standard deviation over {res.meta.seeds.length} sensor-noise seeds.{" "}
                {m.better === "none" ? "No preferred direction for this metric." : `• marks the best value where methods differ (${m.better} is better).`} All AquaTwin
                variants use the same optimiser and AquaGuard; only the prediction model differs. Fixed operation holds its initial setpoints.
              </p>
            </>
          ) : missing ? (
            <Pending what="Run: npx tsx scripts/run-experiments.ts" />
          ) : (
            <div className="text-[12px] text-fg-subtle">Loading…</div>
          )}
        </Panel>
      </div>

      {res?.robustness && (
        <Panel
          title={
            <>
              <span className="max-sm:hidden">Robustness to start time and storage</span>
              <span className="sm:hidden">Robustness</span>
            </>
          }
          right={
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                ariaLabel="Initial product storage"
                value={storage}
                onChange={setStorage}
                options={res.robustness.storage.map((x) => ({ value: String(x), label: `${Math.round(x * 100)} %` }))}
              />
              <span className="max-sm:hidden">
                <Provenance kind="simulated" />
              </span>
            </div>
          }
          reveal="panel3"
          bodyClassName="p-4"
        >
          <div className="grid grid-cols-3 gap-6 max-xl:grid-cols-1">
            {Object.entries(res.robustness.runs).map(([id, byStorage]) => {
              const byClock = byStorage[storage] ?? {};
              const clocks = res.robustness!.clocks.map(String);
              const name = res.scenarios.find((x) => x.id === id)?.name ?? id;
              return (
                <div key={id} className="scroll-quiet overflow-x-auto">
                  <div className="mb-1.5 text-[12px] text-fg">{name}</div>
                  <table className="w-full min-w-[420px] text-[12px]">
                    <thead>
                      <tr className="text-[11px] text-fg-subtle">
                        <th className="pb-1.5 text-left font-normal">Starts at</th>
                        {clocks.map((c) => (
                          <th key={c} className="num pb-1.5 text-right font-normal">
                            {c.padStart(2, "0")}:00
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {res.methods.map((k) => (
                        <tr key={k} className="border-t border-line">
                          <td className="py-[5px] pr-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-fg-muted">
                              <span className="h-2 w-2 rounded-[2px]" style={{ background: METHOD_COLOR[k] }} />
                              {METHOD_LABEL[k]}
                            </span>
                          </td>
                          {clocks.map((c) => {
                            const cell = byClock[c]?.[k];
                            const v = cell?.any;
                            const why = cell
                              ? Object.entries(cell.by)
                                  .filter(([, h]) => h > 0)
                                  .map(([t, h]) => `${VIOLATION_LABEL[t] ?? t} ${fmt(h, 1)} h`)
                                  .join(" · ")
                              : "";
                            return (
                              <td
                                key={c}
                                title={why || undefined}
                                className={`num py-[5px] text-right ${v === undefined ? "text-fg-faint" : v > 0 ? "text-warn" : k === "hybrid" ? "text-fg" : "text-fg-subtle"}`}
                              >
                                {v === undefined ? "–" : fmt(v, v > 0 ? 1 : 0)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
            The three in-envelope scenarios in which fixed operation breaks a limit, started at six times of day (demand and seawater temperature follow a daily cycle)
            and from three product-storage levels; the main experiments start at 14:00 with 55 %. Values are hours with any constraint violation on the true plant (seed
            1); amber marks a violation, and hovering a value shows which limit.{" "}
            {(() => {
              const cells = Object.values(res.robustness.runs).flatMap((byStorage) => Object.values(byStorage[storage] ?? {}));
              const typeHours = (k: Method) => {
                const acc: Record<string, number> = {};
                for (const row of cells) for (const [t, h] of Object.entries(row[k]?.by ?? {})) acc[t] = (acc[t] ?? 0) + h;
                return Object.entries(acc)
                  .filter(([, h]) => h > 0)
                  .map(([t, h]) => `${(VIOLATION_LABEL[t] ?? t).toLowerCase()} ${fmt(h, 1)} h`)
                  .join(", ");
              };
              return (
                <>
                  At {Math.round(Number(storage) * 100)} % storage, runs with a violation:{" "}
                  {res.methods
                    .map((k) => {
                      const n = cells.filter((row) => (row[k]?.any ?? 0) > 0).length;
                      const types = typeHours(k);
                      return `${METHOD_LABEL[k]} ${n} of ${cells.length}${types ? ` (${types})` : ""}`;
                    })
                    .join("; ")}
                  .
                </>
              );
            })()}
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <Panel title="Early-warning lead time · no-action runs" right={<Provenance kind="simulated" />} reveal="panel3" bodyClassName="p-4 max-lg:overflow-x-auto">
          {res ? (
            <>
              <table className="w-full text-[12px] max-lg:min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] text-fg-subtle">
                    <th className="pb-2 font-normal">Scenario</th>
                    <th className="pb-2 font-normal">First critical event on the true plant</th>
                    <th className="pb-2 pl-3 text-right font-normal">Conventional alarm</th>
                    <th className="pb-2 pl-3 text-right font-normal">Physics</th>
                    <th className="pb-2 pl-3 text-right font-normal">ML only</th>
                    <th className="pb-2 pl-3 text-right font-normal text-accent">Hybrid</th>
                  </tr>
                </thead>
                <tbody>
                  {res.scenarios
                    .filter((s) => (res.leadTime[s.id]?.eventsObserved ?? 0) > 0)
                    .map((s) => {
                      const l = res.leadTime[s.id];
                      const cell = (v: number | null, k: Monitor) => {
                        if (v === null) return <span className="text-fg-faint">no warning</span>;
                        const n = l.warned?.[k];
                        return (
                          <>
                            {fmtHours(v)} ahead
                            {n !== undefined && n < l.eventsObserved && (
                              <span className="ml-1 text-[10px] text-fg-faint">
                                ({n}/{l.eventsObserved})
                              </span>
                            )}
                          </>
                        );
                      };
                      return (
                        <tr key={s.id} className="border-t border-line">
                          <td className="py-1.5 text-fg">{s.name}</td>
                          <td className="py-1.5 text-fg-muted">
                            {eventLabel(l.eventKind)} <span className="text-fg-subtle">at +{fmtHours(l.event_h)}</span>
                          </td>
                          <td className="num py-1.5 pl-3 text-right whitespace-nowrap text-fg-muted">{cell(l.conventional_h, "conventional")}</td>
                          <td className="num py-1.5 pl-3 text-right whitespace-nowrap text-fg-muted">{cell(l.physics_h, "physics")}</td>
                          <td className="num py-1.5 pl-3 text-right whitespace-nowrap text-fg-muted">{cell(l.mlonly_h, "mlonly")}</td>
                          <td className="num py-1.5 pl-3 text-right whitespace-nowrap text-fg">{cell(l.hybrid_h, "hybrid")}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
                Conventional alarm: fixed thresholds on measured values (permeate TDS &gt; 95% of limit, storage &lt; minimum + 5%, flow −10%, ΔP 90% of limit). AquaTwin
                warnings: model forecasts (fouling trend, 2 h quality outlook, storage depletion). The energy-cap scenario is excluded because curtailment is announced in
                advance.
                {res.leadTime.normal?.falseWarningHours &&
                  ` False warnings in normal operation (hours flagged in 24 h): conventional ${fmt(res.leadTime.normal.falseWarningHours.conventional, 1)}, physics ${fmt(
                    res.leadTime.normal.falseWarningHours.physics,
                    1,
                  )}, ML only ${fmt(res.leadTime.normal.falseWarningHours.mlonly, 1)}, hybrid ${fmt(res.leadTime.normal.falseWarningHours.hybrid, 1)}.`}
              </p>
            </>
          ) : (
            <Pending what="Run: npx tsx scripts/run-experiments.ts" />
          )}
        </Panel>
        <Panel title="Reproduce these results" reveal="panel4" bodyClassName="space-y-2 p-4 text-[12px]">
          {[
            ["Generate synthetic data (seeded)", "npx tsx scripts/generate-dataset.ts"],
            ["Train and evaluate the models", "python ml/train.py"],
            ["Check TypeScript ↔ scikit-learn parity", "npx tsx scripts/parity-test.ts"],
            ["Run the closed-loop experiments", "npx tsx scripts/run-experiments.ts"],
          ].map(([k, c]) => (
            <div key={c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-sm:grid-cols-1 max-sm:gap-1">
              <div className="text-fg-muted">{k}</div>
              <code className="rounded-md border border-line bg-ink-900 px-2.5 py-1 font-mono text-[11.5px] text-fg">{c}</code>
            </div>
          ))}
          {res && (
            <p className="pt-1 text-[11px] text-fg-subtle">
              Last run {new Date(res.meta.created).toLocaleString("en-GB")} · {res.meta.durationSeconds} s · {res.scenarios.length} scenarios × {res.methods.length}{" "}
              methods × {res.meta.seeds.length} seeds · model seed {res.meta.modelBundle.seed}. Raw per-run table: data/experiments/runs.csv.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
