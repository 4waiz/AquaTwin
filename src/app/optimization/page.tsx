"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, Segmented, Button, Spinner, Provenance, Chip } from "@/components/ui/primitives";
import { CandidateScatter } from "@/components/optimization/CandidateScatter";
import { GuardChecklist, VerdictBanner } from "@/components/guard/GuardChecklist";
import { twinClient } from "@/runtime/client";
import type { CandidateLite, OptimizationSnapshot } from "@/runtime/protocol";
import { DEFAULT_WEIGHTS, FOCUS_LABEL, type ObjectiveWeights } from "@/sim/optimizer";
import { LAB_SCENARIOS, SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { LIMITS } from "@/sim/config";
import { fmt, fmtInt, fmtSigned } from "@/lib/format";

const WEIGHT_LABEL: Record<keyof ObjectiveWeights, string> = {
  energy: "Energy (SEC)",
  quality: "Water quality",
  production: "Production tracking",
  stress: "Membrane stress",
  fouling: "Fouling / CIP impact",
};

function describe(c: CandidateLite) {
  const alloc = c.focusMode === "normal" ? "All trains equal" : FOCUS_LABEL[c.focusMode].replace("Focus train", `Train ${(c.focusTrain ?? 0) + 1}`);
  return `${fmt(c.P, 1)} bar · ${fmt(c.Qv, 1)} m³/h per vessel · ${alloc}`;
}

function Compare({ cur, rec }: { cur: CandidateLite; rec: CandidateLite | null }) {
  const rows: { k: string; unit: string; get: (c: CandidateLite) => number; d: number; better: "lower" | "higher" | null }[] = [
    { k: "Max feed pressure", unit: "bar", get: (c) => c.objectives.maxPressure_bar, d: 1, better: null },
    { k: "Plant recovery", unit: "%", get: (c) => c.objectives.recovery * 100, d: 1, better: null },
    { k: "Production", unit: "m³/h", get: (c) => c.objectives.production_m3h, d: 0, better: null },
    { k: "Specific energy", unit: "kWh/m³", get: (c) => c.objectives.sec_kWh_m3, d: 3, better: "lower" },
    { k: "Permeate TDS", unit: "mg/L", get: (c) => c.objectives.tds_mgL, d: 0, better: "lower" },
    { k: "Membrane stress", unit: "index", get: (c) => c.objectives.stress, d: 3, better: "lower" },
    { k: "Fouling rate", unit: "%/h", get: (c) => c.objectives.fouling_pct_h, d: 4, better: "lower" },
    { k: "Plant power", unit: "kW", get: (c) => c.objectives.power_kW, d: 0, better: "lower" },
  ];
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10.5px] text-fg-subtle">
          <th className="pb-1.5 font-normal" />
          <th className="pb-1.5 text-right font-normal">Current</th>
          <th className="pb-1.5 text-right font-normal text-accent">Recommended</th>
          <th className="pb-1.5 text-right font-normal">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const a = r.get(cur);
          const b = rec ? r.get(rec) : NaN;
          const diff = b - a;
          const good = r.better === "lower" ? diff < 0 : r.better === "higher" ? diff > 0 : null;
          return (
            <tr key={r.k} className="border-t border-line">
              <td className="py-1.5 text-fg-muted">
                {r.k} <span className="text-[10.5px] text-fg-faint">{r.unit}</span>
              </td>
              <td className="num py-1.5 text-right text-fg">{r.d === 0 ? fmtInt(a) : fmt(a, r.d)}</td>
              <td className="num py-1.5 text-right text-fg">{rec ? (r.d === 0 ? fmtInt(b) : fmt(b, r.d)) : "–"}</td>
              <td className={`num py-1.5 text-right ${good === null || Math.abs(diff) < 1e-9 ? "text-fg-subtle" : good ? "text-ok" : "text-fg-muted"}`}>
                {rec ? fmtSigned(diff, r.d) : "–"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function OptimizationPage() {
  const liveReady = useLive((s) => s.snapshot !== null);
  const [source, setSource] = useState<"live" | "scenario">("live");
  const [scenario, setScenario] = useState<ScenarioId>(useScenario.getState().selected);
  const [t, setT] = useState(4);
  const [weights, setWeights] = useState<ObjectiveWeights>(DEFAULT_WEIGHTS);
  const [snap, setSnap] = useState<OptimizationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => useScenario.getState().setActive(false), []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await twinClient.optimize(source === "live" ? "live" : scenario, source === "live" ? 0 : t, weights);
      setSnap(s);
      setSelId(s.bestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [source, scenario, t, weights]);

  // Re-optimise when the inputs change (debounced; also coalesces slider drags).
  useEffect(() => {
    if (!liveReady) return;
    const id = setTimeout(() => void run(), 120);
    return () => clearTimeout(id);
  }, [liveReady, run]);

  const selected = useMemo(() => {
    if (!snap) return null;
    if (selId === -1) return snap.current;
    return snap.candidates.find((c) => c.id === selId) ?? (snap.bestId !== null ? (snap.candidates.find((c) => c.id === snap.bestId) ?? null) : null);
  }, [snap, selId]);
  const best = snap && snap.bestId !== null ? (snap.candidates.find((c) => c.id === snap.bestId) ?? (snap.bestId === -1 ? snap.current : null)) : null;
  const counts = snap
    ? {
        total: snap.candidates.length,
        feasible: snap.candidates.filter((c) => c.feasible).length,
        pareto: snap.candidates.filter((c) => c.pareto).length,
        rejected: snap.candidates.filter((c) => c.verdict === "REJECTED").length,
        withheld: snap.candidates.filter((c) => c.verdict === "WITHHELD").length,
      }
    : null;

  return (
    <div className="grid h-full min-h-[880px] grid-cols-[minmax(0,1fr)_460px] grid-rows-[auto_minmax(0,1fr)_300px] gap-4 p-5 pt-4 max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col max-lg:p-4">
      <div data-reveal="header" className="col-span-2 flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-3">
        <div>
          <div className="label">Optimization</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">How AquaTwin searches for an operating strategy</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Every candidate is predicted with the hybrid twin, screened by AquaGuard at its 90 % interval edge, then ranked. Nothing below is pre-computed.
          </p>
        </div>
        <div className="flex items-center gap-3 max-lg:flex-wrap">
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: "live", label: "Live plant" },
              { value: "scenario", label: "Scenario moment" },
            ]}
          />
          {source === "scenario" && (
            <>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as ScenarioId)}
                className="h-8 rounded-md border border-line-strong bg-ink-900 px-2 text-[12.5px] text-fg"
                aria-label="Scenario"
              >
                {LAB_SCENARIOS.map((id) => (
                  <option key={id} value={id}>
                    {SCENARIOS[id].name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[12px] text-fg-muted">
                +
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={t}
                  onChange={(e) => setT(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                  className="h-8 w-14 rounded-md border border-line-strong bg-ink-900 px-2 text-fg"
                />
                h
              </label>
            </>
          )}
          <Button variant="secondary" onClick={() => void run()} disabled={busy}>
            {busy && <Spinner />} {busy ? "Searching…" : "Re-optimise"}
          </Button>
        </div>
      </div>

      <Panel
        title={snap ? snap.context.label : "Candidate strategies"}
        right={
          counts && (
            <div className="flex items-center gap-2 text-[11px] text-fg-subtle max-md:hidden">
              <span>{counts.total} candidates</span>
              <Chip tone="accent">{counts.feasible} admissible</Chip>
              <Chip>{counts.pareto} Pareto</Chip>
              <Chip tone={counts.rejected ? "crit" : "default"}>{counts.rejected} rejected</Chip>
              {counts.withheld > 0 && <Chip tone="warn">{counts.withheld} withheld</Chip>}
            </div>
          )
        }
        reveal="panel1"
        className="max-lg:h-[420px]"
        bodyClassName="flex min-h-0 flex-col gap-1 p-3"
      >
        {counts && (
          <div className="px-1 text-[11px] text-fg-muted md:hidden">
            {counts.total} candidates · <span className="text-accent">{counts.feasible} admissible</span> · {counts.rejected} rejected
            {counts.withheld > 0 ? ` · ${counts.withheld} withheld` : ""}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10.5px] text-fg-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> Pareto-optimal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--c-accent-dim)]" /> Admissible
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-fg-faint" /> Rejected by AquaGuard
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-warn/70" /> Withheld (low confidence)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45 bg-fg" /> Current
          </span>
        </div>
        {snap ? (
          <div className="min-h-0 flex-1">
            <CandidateScatter candidates={snap.candidates} current={snap.current} bestId={snap.bestId} selectedId={selId} onSelect={(c) => setSelId(c.id)} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-fg-subtle">
            {error ? (
              <span className="text-crit">{error}</span>
            ) : (
              <>
                <Spinner /> Evaluating candidate strategies…
              </>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title={selected ? (selected.id === snap?.bestId ? "Recommended strategy" : selected.id === -1 ? "Current strategy" : "Candidate strategy") : "Strategy"}
        right={<Provenance kind="modeled" />}
        reveal="panel2"
        bodyClassName="scroll-quiet flex min-h-0 flex-col gap-3 overflow-y-auto p-4"
      >
        {selected && snap ? (
          <>
            <div className="text-[13px] text-fg">{describe(selected)}</div>
            <VerdictBanner verdict={selected.verdict} reasons={selected.guard.reasons} relaxed={selected.id === snap.bestId && snap.relaxed} />
            <GuardChecklist guard={selected.guard} />
            {source === "live" && selected.id === snap.bestId && selected.verdict === "APPROVED" && selected.id !== -1 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink-900 px-3 py-2">
                <span className="text-[11.5px] text-fg-subtle">Shadow mode: recommendations are advisory. Operators decide.</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await twinClient.apply(selected.setpoints);
                    setApplied(new Date().toLocaleTimeString());
                  }}
                >
                  Apply in simulation
                </Button>
              </div>
            )}
            {applied && <div className="text-[11px] text-ok">Applied to the simulated plant at {applied}.</div>}
          </>
        ) : (
          <div className="text-[12px] text-fg-subtle">Select a candidate in the chart.</div>
        )}
      </Panel>

      <div className="col-span-2 grid min-h-0 grid-cols-[1fr_1.15fr_0.9fr] gap-4 max-lg:grid-cols-1">
        <Panel title="Search space and constraints" reveal="panel3" bodyClassName="grid grid-cols-2 gap-x-6 gap-y-1 p-4 text-[12px]">
          <div>
            <div className="label mb-1.5">Decision variables</div>
            <ul className="space-y-1 text-fg-muted">
              <li>
                Feed pressure <span className="num text-fg-subtle">54–72 bar</span>
              </li>
              <li>
                Feed flow per vessel <span className="num text-fg-subtle">7–13 m³/h</span>
              </li>
              <li>
                Recovery <span className="text-fg-subtle">(follows from both)</span>
              </li>
              <li>
                Train allocation <span className="text-fg-subtle">equal / −3 / −6 bar / offline</span>
              </li>
              <li>
                Production &amp; storage draw <span className="text-fg-subtle">(planner)</span>
              </li>
            </ul>
          </div>
          <div>
            <div className="label mb-1.5">AquaGuard hard limits</div>
            <ul className="num space-y-1 text-fg-muted">
              <li>Permeate TDS ≤ {LIMITS.maxPermeateTDS_mgL} mg/L</li>
              <li>Feed pressure ≤ {LIMITS.maxFeedPressure_bar} bar</li>
              <li>
                Recovery ≤ {LIMITS.maxRecovery * 100}% · flux ≤ {LIMITS.maxAvgFlux_LMH} LMH
              </li>
              <li>
                Vessel ΔP ≤ {LIMITS.maxVesselDP_bar} bar · brine ≥ {LIMITS.minConcentratePerVessel_m3h} m³/h
              </li>
              <li>
                Storage ≥ {LIMITS.minReservoirFraction * 100}% · confidence ≥ {LIMITS.minConfidence * 100}%
              </li>
            </ul>
          </div>
        </Panel>
        <Panel
          title="Current vs recommended"
          right={<span className="text-[11px] text-fg-subtle">values from the hybrid model</span>}
          reveal="panel3"
          bodyClassName="px-4 py-2"
        >
          {snap ? <Compare cur={snap.current} rec={best} /> : null}
        </Panel>
        <Panel
          title="Objective weights"
          right={
            <button className="text-[11px] text-fg-subtle hover:text-fg" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
              Reset
            </button>
          }
          reveal="panel3"
          bodyClassName="space-y-2.5 p-4"
        >
          {(Object.keys(WEIGHT_LABEL) as (keyof ObjectiveWeights)[]).map((k) => (
            <label key={k} className="grid grid-cols-[1fr_120px_34px] items-center gap-3 text-[12px]">
              <span className="text-fg-muted">{WEIGHT_LABEL[k]}</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.05}
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                className="accent-[var(--color-accent)]"
                aria-label={WEIGHT_LABEL[k]}
              />
              <span className="num text-right text-fg">{weights[k].toFixed(2)}</span>
            </label>
          ))}
          <p className="text-[11px] text-fg-subtle">Constraints are never traded off: weights only rank admissible strategies.</p>
        </Panel>
      </div>
    </div>
  );
}
