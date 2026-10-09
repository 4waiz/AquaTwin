"use client";
import { useEffect, useMemo } from "react";
import { TwinViewport } from "@/twin/react/TwinViewport";
import { Panel, Segmented, Button, Spinner, Chip, Provenance } from "@/components/ui/primitives";
import { LineChart, type Series } from "@/components/charts/LineChart";
import { Timeline } from "@/components/scenario/Timeline";
import { OutcomeTable } from "@/components/scenario/OutcomeTable";
import { DecisionLog } from "@/components/scenario/DecisionLog";
import { SCENARIO_CHARTS, capSeries, type ChartSpec } from "@/components/scenario/scenarioViews";
import { AssetInspector } from "@/components/twin/AssetInspector";
import { inspectorFromScenario } from "@/components/twin/assetData";
import { ResetViewButton } from "@/components/twin/TwinChrome";
import { LAB_SCENARIOS, SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import { useScenario, type Branch } from "@/state/scenario";
import { useUi } from "@/state/ui";
import { useLive } from "@/state/live";
import { pointAt } from "@/twin/visualState";
import { fmt, fmtHours, hourOfDay } from "@/lib/format";
import type { ScenarioResult } from "@/runtime/protocol";

const COLORS = { baseline: "var(--color-series-base)", noAction: "var(--color-series-noact)", aquatwin: "var(--color-accent)" };

function ScenarioChart({ spec, res, cursor, onCursor }: { spec: ChartSpec; res: ScenarioResult; cursor: number; onCursor: (x: number) => void }) {
  const x = res.aquatwin.points.map((p) => p.t);
  const series: Series[] = [
    { id: "b", label: "Baseline", color: COLORS.baseline, values: res.baseline.points.map(spec.get), dashed: true, width: 1.2 },
    { id: "n", label: "No action", color: COLORS.noAction, values: res.noAction.points.map(spec.get), width: 1.4 },
    { id: "a", label: "AquaTwin", color: COLORS.aquatwin, values: res.aquatwin.points.map(spec.get), width: 2 },
  ];
  if (spec.id === "production") {
    series.unshift({ id: "d", label: "Demand", color: "var(--color-fg-subtle)", values: res.aquatwin.points.map((p) => p.demand), dashed: true, width: 1 });
  }
  if (spec.id === "power") {
    const cap = capSeries(res.noAction);
    if (cap.some((c) => c !== null)) series.push({ id: "cap", label: "Power cap", color: "var(--color-crit)", values: cap, dashed: true, width: 1.2 });
  }
  return (
    <LineChart
      x={x}
      series={series}
      limits={spec.limit ? [{ ...spec.limit }] : []}
      yDomain={spec.yDomain}
      xDomain={[0, 24]}
      xTicks={[0, 1, 3, 6, 12, 24]}
      xFormat={(v) => (v === 0 ? "NOW" : `+${Math.round(v)}h`)}
      yFormat={spec.yFormat ?? ((v) => Math.round(v).toLocaleString("en-US"))}
      cursor={cursor}
      onCursor={onCursor}
      unit={spec.unit}
    />
  );
}

export default function ScenarioLabPage() {
  const selected = useScenario((s) => s.selected);
  const results = useScenario((s) => s.results);
  const loading = useScenario((s) => s.loading);
  const errors = useScenario((s) => s.errors);
  const cursor = useScenario((s) => s.cursor);
  const branch = useScenario((s) => s.branch);
  const { select, run, setCursor, setBranch, setActive, setPlaying } = useScenario.getState();
  const liveReady = useLive((s) => s.snapshot !== null);
  const selectedAsset = useUi((s) => s.selected);
  const selectAsset = useUi((s) => s.select);
  const res = results[selected];
  const busy = !!loading[selected];

  // Deep link from the Overview launcher: /scenarios?s=salinity&run=1
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("s") as ScenarioId | null;
    if (s && LAB_SCENARIOS.includes(s)) select(s);
    const autorun = q.get("run") === "1";
    setActive(true);
    if (autorun && s) {
      void run(s).then((r) => {
        if (r) {
          setCursor(0);
          setPlaying(true);
        }
      });
    }
    return () => {
      setPlaying(false);
      setActive(false);
    };
  }, [select, run, setActive, setCursor, setPlaying]);

  // Compute the selected scenario once the live plant is available.
  useEffect(() => {
    if (liveReady && !results[selected] && !loading[selected] && !errors[selected]) void run(selected);
  }, [liveReady, selected, results, loading, errors, run]);

  const point = res ? pointAt(res[branch].points, cursor) : null;
  const sc = SCENARIOS[selected];
  const charts = SCENARIO_CHARTS[selected];

  const headline = useMemo(() => {
    if (!res) return null;
    const na = res.noAction.metrics;
    const at = res.aquatwin.metrics;
    return { na, at };
  }, [res]);

  return (
    <div className="grid h-full min-h-[960px] grid-rows-[auto_auto_minmax(400px,1fr)_280px] gap-4 p-5 pt-4 max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col max-lg:p-4">
      {/* Header */}
      <div data-reveal="header" className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-3">
        <div>
          <div className="label">Scenario Lab</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Stress-test the plant before the plant is stressed.</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            24-hour forecasts from the calibrated hybrid twin, starting from the live plant state. <span className="text-fg-subtle">Simulated.</span>
          </p>
        </div>
        <div className="flex items-center gap-3 max-lg:flex-wrap">
          <Segmented<Branch>
            ariaLabel="Branch shown in 3D"
            value={branch}
            onChange={setBranch}
            options={[
              { value: "noAction", label: "No action" },
              { value: "aquatwin", label: "AquaTwin response" },
            ]}
          />
          <Button variant="secondary" onClick={() => void run(selected, true)} disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Simulating…" : "Re-run from now"}
          </Button>
        </div>
      </div>

      {/* Scenario cards */}
      <div data-reveal="panel1" className="grid grid-cols-6 gap-3 max-lg:grid-cols-2 md:max-lg:grid-cols-3">
        {LAB_SCENARIOS.map((id) => {
          const s = SCENARIOS[id];
          const r = results[id];
          const active = id === selected;
          return (
            <button
              key={id}
              onClick={() => {
                select(id);
                setPlaying(false);
              }}
              aria-pressed={active}
              className={`rounded-[10px] border px-3.5 py-3 text-left transition-colors ${
                active ? "border-accent/60 bg-accent-soft/40" : "border-line bg-ink-850 hover:border-line-strong"
              }`}
            >
              <div className="truncate font-mono text-[10px] tracking-wider text-fg-subtle uppercase" title={s.tag}>
                {s.tag}
              </div>
              <div className={`mt-1 truncate text-[14px] font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{s.name}</div>
              <div className="mt-2 h-4 text-[11px]">
                {loading[id] ? (
                  <span className="inline-flex items-center gap-1.5 text-fg-subtle">
                    <Spinner size={11} /> simulating
                  </span>
                ) : r ? (
                  <span className="block truncate text-fg-subtle" title="Constraint-violation hours over 24 h: no action → AquaTwin">
                    Violations{" "}
                    <span className={r.noAction.metrics.violationHours > 0 ? "text-crit" : "text-fg-muted"}>{fmt(r.noAction.metrics.violationHours, 1)} h</span>
                    <span className="text-fg-faint"> → </span>
                    <span className={r.aquatwin.metrics.violationHours > 0 ? "text-crit" : "text-ok"}>{fmt(r.aquatwin.metrics.violationHours, 1)} h</span>
                  </span>
                ) : (
                  <span className="text-fg-faint">not run</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 3D + outcomes */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(420px,1fr)] gap-4 max-lg:grid-cols-1">
        <TwinViewport preset="scenario" className="rounded-[10px] border border-line max-lg:h-[64vw] max-lg:max-h-[480px] max-lg:min-h-[280px]">
          <div data-reveal="panel4" className="absolute left-3 top-3 z-[2] flex items-center gap-2">
            <Chip tone={branch === "aquatwin" ? "accent" : "default"} dot>
              {branch === "aquatwin" ? "AquaTwin response" : "No action"}
            </Chip>
            <Chip className="bg-ink-900/85 backdrop-blur-sm max-sm:hidden">{res ? `+${cursor.toFixed(1)} h · ${hourOfDay(res.startClock_h + cursor)}` : "forecast"}</Chip>
            {point && point.violations.length > 0 && (
              <Chip tone="crit" dot>
                Constraint violated
              </Chip>
            )}
          </div>
          <div data-reveal="panel4" className="absolute right-3 top-3 z-[2]">
            <ResetViewButton />
          </div>
          {selectedAsset && point && (
            <div className="absolute right-3 top-14 z-[3] max-lg:hidden">
              <AssetInspector data={inspectorFromScenario(selectedAsset, point)} onClose={() => selectAsset(null)} provenance="estimated" />
            </div>
          )}
          <div className="absolute bottom-3 left-3 right-3 z-[2]">
            <Timeline startClock={res ? res.startClock_h : null} />
          </div>
          {busy && !res && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-ink-950/40">
              <span className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-ink-900 px-3 py-2 text-[12px] text-fg-muted">
                <Spinner /> Simulating 24 h for baseline, no action and AquaTwin…
              </span>
            </div>
          )}
        </TwinViewport>

        <Panel
          title={
            <span>
              {sc.name}
              <span className="ml-2 font-normal text-fg-subtle">{sc.tag}</span>
            </span>
          }
          right={<Provenance kind="simulated" />}
          reveal="panel2"
          bodyClassName="scroll-quiet flex min-h-0 flex-col gap-3 overflow-y-auto p-4"
        >
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            {sc.summary} <span className="text-fg-subtle">Represents: {sc.represents}</span>
          </p>
          {res ? (
            <>
              <OutcomeTable res={res} />
              {headline && (
                <div className="text-[11px] text-fg-subtle">
                  Forecast computed in {fmt(res.computeMs / 1000, 1)} s · {res.aquatwin.decisions.length} decisions
                  {res.aquatwin.decisions.some((d) => d.trigger === "outlook") &&
                    ` (${res.aquatwin.decisions.filter((d) => d.trigger === "outlook").length} unscheduled re-plans)`}{" "}
                  · first no-action violation{" "}
                  {headline.na.firstViolation === null ? "none" : `at +${fmtHours(headline.na.firstViolation)}`}
                </div>
              )}
            </>
          ) : errors[selected] ? (
            <div className="text-[12px] text-crit">Simulation failed: {errors[selected]}</div>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-fg-subtle">
              <Spinner /> Preparing forecast…
            </div>
          )}
        </Panel>
      </div>

      {/* Charts + decisions */}
      <div className="grid min-h-0 grid-cols-[1fr_1fr_1fr_minmax(380px,1.05fr)] gap-4 max-lg:grid-cols-1 md:max-lg:grid-cols-2">
        {charts.map((c, i) => (
          <Panel key={c.id} title={c.title} reveal={i === 0 ? "panel3" : "panel3"} className="max-lg:h-[260px]" bodyClassName="p-3 pt-2">
            {res ? (
              <ScenarioChart
                spec={c}
                res={res}
                cursor={cursor}
                onCursor={(x) => {
                  setPlaying(false);
                  setCursor(x);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">Waiting for forecast</div>
            )}
          </Panel>
        ))}
        <Panel
          title="AquaTwin decisions"
          right={<span className="text-[11px] text-fg-subtle">hourly and on feed trend · click to jump</span>}
          reveal="panel3"
          className="max-lg:h-[360px]"
          bodyClassName="min-h-0 p-3 pt-2 max-lg:overflow-x-auto"
        >
          {res ? (
            <DecisionLog
              branch={res.aquatwin}
              cursor={cursor}
              onSeek={(t) => {
                setPlaying(false);
                setCursor(t);
              }}
            />
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
