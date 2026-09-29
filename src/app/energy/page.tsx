"use client";
import { useEffect, useMemo } from "react";
import { Panel, Provenance, Spinner } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts/LineChart";
import { GroupedBars } from "@/components/charts/GroupedBars";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { GRID_CARBON_BASE } from "@/sim/config";
import { LAB_SCENARIOS, SCENARIOS } from "@/sim/scenarios";
import { fmt, fmtSigned } from "@/lib/format";

const HOUR = 3_600_000;

const STAGES = [
  { key: "intake", label: "Seawater intake", color: "#2f5f9e" },
  { key: "pretreatment", label: "Pretreatment", color: "#3a78c2" },
  { key: "hpPump", label: "High-pressure pumps", color: "#5b9dff" },
  { key: "booster", label: "ERD booster", color: "#8fb4e6" },
  { key: "postTreatment", label: "Post-treatment & transfer", color: "#7c8799" },
  { key: "base", label: "Buildings & controls", color: "#475163" },
] as const;

function Breakdown({ b, total }: { b: Record<string, number>; total: number }) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-md">
        {STAGES.map((s) => (
          <div key={s.key} title={`${s.label}: ${fmt(b[s.key], 3)} kWh/m³`} style={{ width: `${(b[s.key] / total) * 100}%`, background: s.color }} className="h-full" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {STAGES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="inline-flex items-center gap-2 text-fg-muted">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="num text-fg">
              {fmt(b[s.key], 3)} <span className="text-[10.5px] text-fg-subtle">kWh/m³</span>
              <span className="ml-2 text-[10.5px] text-fg-subtle">{fmt((b[s.key] / total) * 100, 0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EnergyPage() {
  const snap = useLive((s) => s.snapshot);
  const history = useLive((s) => s.history);
  const results = useScenario((s) => s.results);
  const loading = useScenario((s) => s.loading);
  const selected = useScenario((s) => s.selected);
  useEffect(() => useScenario.getState().setActive(false), []);

  const t = snap?.totals;
  const b = t?.energyBreakdown_kWh_m3 as unknown as Record<string, number> | undefined;
  const total = b ? STAGES.reduce((a, s) => a + b[s.key], 0) : 0;
  const hpHydraulic = b ? b.hpPump + b.erdRecovered : 0;

  const chart = useMemo(() => {
    if (!snap || !history.length) return null;
    const h = history.slice(-288);
    return {
      x: h.map((p) => (p.t - snap.simTime) / HOUR),
      power: h.map((p) => p.power / 1000),
      carbon: h.map((p) => p.carbon),
      emissions: h.map((p) => (p.power * p.carbon) / 1000),
    };
  }, [snap, history]);

  const daily = chart ? chart.emissions.reduce((a, v) => a + v, 0) * (5 / 60) : null;
  const perM3 = t ? (t.power_kW * (snap?.carbonIntensity ?? GRID_CARBON_BASE)) / t.production_m3h : null;

  const scen = LAB_SCENARIOS.filter((id) => results[id]);
  const res = results[selected];

  return (
    <div className="grid h-full min-h-[880px] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-4 p-5 pt-4">
      <div data-reveal="header" className="flex items-end justify-between gap-6">
        <div>
          <div className="label">Energy &amp; Carbon</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Energy and carbon</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Where the plant&apos;s energy goes, and what AquaTwin&apos;s strategies change. Energy is modelled; carbon is an estimate.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="label">Specific energy</div>
            <div className="num text-[26px] font-medium tracking-tight text-fg">
              {fmt(t?.sec_kWh_m3, 2)} <span className="text-[12px] font-normal text-fg-subtle">kWh/m³</span>
            </div>
          </div>
          <div className="h-10 w-px bg-line" />
          <div className="text-right">
            <div className="label">Plant power</div>
            <div className="num text-[26px] font-medium tracking-tight text-fg">
              {fmt(t ? t.power_kW / 1000 : null, 2)} <span className="text-[12px] font-normal text-fg-subtle">MW</span>
            </div>
          </div>
          <div className="h-10 w-px bg-line" />
          <div className="text-right">
            <div className="label">Carbon intensity of water</div>
            <div className="num text-[26px] font-medium tracking-tight text-fg">
              {fmt(perM3, 2)} <span className="text-[12px] font-normal text-fg-subtle">kg CO₂e/m³</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
        <Panel title="Energy by process stage · live" right={<Provenance kind="modeled" />} reveal="panel1" bodyClassName="p-4">
          {b ? (
            <>
              <Breakdown b={b} total={total} />
              <div className="mt-4 rounded-md border border-line bg-ink-900 px-3 py-2.5 text-[12px] leading-relaxed text-fg-muted">
                The isobaric pressure exchanger returns <span className="num text-fg">{fmt(b.erdRecovered, 2)} kWh/m³</span> of brine pressure energy to the feed. Without
                it the high-pressure stage would need roughly <span className="num text-fg">{fmt(hpHydraulic, 2)} kWh/m³</span> instead of {fmt(b.hpPump, 2)} (hydraulic
                equivalent, before pump losses).
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">Waiting for telemetry…</div>
          )}
        </Panel>

        <Panel
          title="Baseline vs disturbance vs AquaTwin"
          right={<span className="text-[11px] text-fg-subtle">24 h Scenario Lab forecasts</span>}
          reveal="panel2"
          bodyClassName="scroll-quiet overflow-y-auto p-4"
        >
          {scen.length ? (
            <GroupedBars
              categories={scen.map((id) => SCENARIOS[id].name)}
              series={[
                { id: "b", label: "Baseline (no disturbance)", color: "#7c8799", values: scen.map((id) => results[id]!.baseline.metrics.sec) },
                { id: "n", label: "Disturbance, no action", color: "#d4dae3", values: scen.map((id) => results[id]!.noAction.metrics.sec) },
                { id: "a", label: "Disturbance, AquaTwin", color: "#5b9dff", values: scen.map((id) => results[id]!.aquatwin.metrics.sec) },
              ]}
              format={(v) => v.toFixed(3)}
              unit="kWh/m³ (24 h mean)"
              domain={[2.8, Math.max(3.6, ...scen.flatMap((id) => [results[id]!.noAction.metrics.sec, results[id]!.aquatwin.metrics.sec]))]}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[12px] text-fg-subtle">
              {Object.values(loading).some(Boolean) ? <Spinner /> : null}
              Run scenarios in the Scenario Lab to compare energy outcomes here.
            </div>
          )}
          {res && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-fg-subtle">
              Lower SEC is not always the goal. In {SCENARIOS[selected].name.toLowerCase()}, AquaTwin&apos;s plan changes SEC by{" "}
              {fmtSigned(((res.aquatwin.metrics.sec - res.noAction.metrics.sec) / res.noAction.metrics.sec) * 100, 1, "%")} relative to no action, with{" "}
              {fmt(res.aquatwin.metrics.violationHours, 1)} h of constraint violations against {fmt(res.noAction.metrics.violationHours, 1)} h without action.
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Power and grid carbon · last 24 h"
        right={
          <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
            <span>
              Estimated emissions <span className="num text-fg">{fmt(daily, 1)} t CO₂e</span> / 24 h
            </span>
            <Provenance kind="estimated" />
          </div>
        }
        reveal="panel3"
        bodyClassName="grid min-h-0 grid-cols-2 gap-6 p-4"
      >
        {chart ? (
          <>
            <LineChart
              x={chart.x}
              series={[{ id: "p", label: "Plant power (modelled)", color: "#5b9dff", values: chart.power, fill: true }]}
              xFormat={(v) => (Math.abs(v) < 0.5 ? "now" : `${Math.round(v)}h`)}
              xTicks={[-24, -18, -12, -6, 0]}
              yFormat={(v) => v.toFixed(1)}
              unit="MW"
            />
            <LineChart
              x={chart.x}
              series={[{ id: "c", label: "Grid carbon intensity (illustrative profile)", color: "#a2acba", values: chart.carbon }]}
              xFormat={(v) => (Math.abs(v) < 0.5 ? "now" : `${Math.round(v)}h`)}
              xTicks={[-24, -18, -12, -6, 0]}
              yFormat={(v) => v.toFixed(3)}
              unit="kg CO₂e/kWh"
            />
          </>
        ) : null}
        <p className="col-span-2 -mt-2 text-[11px] text-fg-subtle">
          Carbon is an estimate: an illustrative diurnal profile around {GRID_CARBON_BASE} kg CO₂e/kWh (UAE, 2024, lifecycle basis — Ember). It is not metered data and is
          not specific to any plant or supplier.
        </p>
      </Panel>
    </div>
  );
}
