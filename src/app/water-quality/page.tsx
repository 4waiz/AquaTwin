"use client";
import { useEffect, useMemo, useState } from "react";
import { Panel, Provenance, Spinner, Button } from "@/components/ui/primitives";
import { Sparkline } from "@/components/charts/Sparkline";
import { LineChart } from "@/components/charts/LineChart";
import { EnvelopeMap, type EnvelopePath } from "@/components/quality/EnvelopeMap";
import { GuardChecklist } from "@/components/guard/GuardChecklist";
import { twinClient } from "@/runtime/client";
import type { EnvelopeGrid } from "@/runtime/protocol";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { LIMITS, PLANT } from "@/sim/config";
import { SCENARIOS } from "@/sim/scenarios";
import { fmt, fmtInt } from "@/lib/format";

const HOUR = 3_600_000;

function Tile({ label, value, unit, series, spec }: { label: string; value: string; unit: string; series: number[]; spec?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="label">{label}</div>
      <div className="num mt-1 text-[22px] font-medium tracking-tight text-fg">
        {value}
        <span className="ml-1 text-[11.5px] font-normal text-fg-subtle">{unit}</span>
      </div>
      <div className="mt-1.5">
        <Sparkline values={series} width={150} height={26} />
      </div>
      {spec && <div className="mt-1 text-[10.5px] text-fg-subtle">{spec}</div>}
    </div>
  );
}

export default function WaterQualityPage() {
  const snap = useLive((s) => s.snapshot);
  const history = useLive((s) => s.history);
  const liveReady = useLive((s) => s.snapshot !== null);
  const scenarioResults = useScenario((s) => s.results);
  const selectedScenario = useScenario((s) => s.selected);
  const [grid, setGrid] = useState<EnvelopeGrid | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => useScenario.getState().setActive(false), []);

  const load = async () => {
    setBusy(true);
    try {
      setGrid(await twinClient.envelope(40));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!liveReady || grid) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReady]);

  const smooth = (xs: number[], w = 6) => xs.map((_, i) => xs.slice(Math.max(0, i - w + 1), i + 1).reduce((a, b) => a + b, 0) / Math.min(w, i + 1));
  const h = useMemo(() => history.slice(-288), [history]);
  const s = useMemo(
    () => ({
      feed: smooth(h.map((p) => p.feedTds)),
      perm: smooth(h.map((p) => p.tds)),
      rej: smooth(h.map((p) => p.rejection)),
      ph: smooth(h.map((p) => p.pH)),
      turb: smooth(h.map((p) => p.turbidity)),
      rec: smooth(h.map((p) => p.recovery)),
      temp: smooth(h.map((p) => p.temperature)),
    }),
    [h],
  );

  // Scenario trajectories in (P, Qv) space, if the selected scenario has been run.
  const res = scenarioResults[selectedScenario];
  const paths: EnvelopePath[] = res
    ? [
        {
          label: "AquaTwin",
          color: "#5b9dff",
          points: res.aquatwin.points
            .filter((_, i) => i % 3 === 0)
            .map((p) => {
              const i = p.online.findIndex((o) => o);
              return { P: p.pressure[i], Qv: p.feedFlow[i] / PLANT.vesselsPerTrain, violated: p.violations.length > 0 };
            }),
        },
      ]
    : [];

  const t = snap?.totals;
  const tdsChart = useMemo(() => {
    if (!snap) return null;
    return { x: h.map((p) => (p.t - snap.simTime) / HOUR), y: s.perm };
  }, [h, s.perm, snap]);

  return (
    <div className="grid h-full min-h-[940px] grid-rows-[auto_auto_minmax(600px,1fr)] gap-4 p-5 pt-4">
      <div data-reveal="header" className="flex items-end justify-between gap-6">
        <div>
          <div className="label">Water Quality</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Water quality and safe operating envelope</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Feed and permeate chemistry from the simulated plant, and the region of operation AquaGuard allows under today&apos;s seawater.
          </p>
        </div>
        <Provenance kind="simulated" />
      </div>

      <div data-reveal="panel1" className="grid grid-cols-7 gap-3">
        <Tile label="Feed TDS" value={fmtInt(snap ? snap.env.salinity_gL * 1000 : null)} unit="mg/L" series={s.feed} />
        <Tile label="Permeate TDS" value={fmtInt(t?.permeateTDS_mgL)} unit="mg/L" series={s.perm} spec={`Spec ≤ ${LIMITS.maxPermeateTDS_mgL} mg/L`} />
        <Tile label="Salt rejection" value={fmt(snap && t ? 100 * (1 - t.permeateTDS_mgL / (snap.env.salinity_gL * 1000)) : null, 2)} unit="%" series={s.rej} />
        <Tile label="Feed pH" value={fmt(snap?.env.pH, 2)} unit="" series={s.ph} />
        <Tile label="Turbidity" value={fmt(snap?.env.turbidity_NTU, 2)} unit="NTU" series={s.turb} />
        <Tile label="Recovery" value={fmt(t ? t.recovery * 100 : null, 1)} unit="%" series={s.rec} spec={`Limit ≤ ${LIMITS.maxRecovery * 100}%`} />
        <Tile label="Temperature" value={fmt(snap?.env.temperature_C, 2)} unit="°C" series={s.temp} />
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4">
        <Panel
          title="Safe operating envelope"
          right={
            <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
              {res && <span>trajectory: {SCENARIOS[selectedScenario].name} (AquaTwin)</span>}
              <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
                {busy ? <Spinner size={11} /> : null} Recompute
              </Button>
            </div>
          }
          reveal="panel2"
          bodyClassName="flex min-h-0 flex-col p-4"
        >
          {grid ? (
            <EnvelopeMap grid={grid} paths={paths} />
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-fg-subtle">
              <Spinner /> Evaluating 1,600 operating points…
            </div>
          )}
          <p className="mt-2 text-[11px] text-fg-subtle">
            Each cell: all three trains at that pressure and flow, predicted by the hybrid twin at current salinity and temperature; constraints checked at the edge of
            the 90 % prediction interval. Blue = every AquaGuard constraint satisfied.
          </p>
        </Panel>
        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Permeate TDS · last 24 h" reveal="panel3" className="shrink-0" bodyClassName="p-3 pt-2">
            <div className="h-[210px]">
              {tdsChart ? (
                <LineChart
                  x={tdsChart.x}
                  series={[{ id: "tds", label: "Blended permeate (30-min mean)", color: "#5b9dff", values: tdsChart.y, fill: true }]}
                  limits={[{ value: LIMITS.maxPermeateTDS_mgL, label: "Specification", tone: "crit", violates: "above" }]}
                  xFormat={(v) => (Math.abs(v) < 0.5 ? "now" : `${Math.round(v)}h`)}
                  xTicks={[-24, -18, -12, -6, 0]}
                  unit="mg/L"
                />
              ) : null}
            </div>
          </Panel>
          <Panel
            title="Hard constraints · live plant"
            right={<span className="text-[11px] text-fg-subtle">AquaGuard</span>}
            reveal="panel3"
            className="flex-1"
            bodyClassName="scroll-quiet min-h-0 overflow-y-auto px-4 py-2"
          >
            {snap ? <GuardChecklist guard={snap.guard} /> : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
