"use client";
import { useMemo } from "react";
import { Panel, Provenance } from "@/components/ui/primitives";
import { Sparkline } from "@/components/charts/Sparkline";
import { useLive } from "@/state/live";
import { fmt, fmtInt, isNum } from "@/lib/format";

function Row({
  label,
  value,
  unit,
  series,
  deltaPct,
  threshold,
}: {
  label: string;
  value: string;
  unit: string;
  series: number[];
  deltaPct: number | null;
  threshold?: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_64px] items-center gap-4 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-[11.5px] text-fg-subtle">{label}</div>
        <div className="num mt-0.5 text-[19px] font-medium tracking-tight text-fg">
          {value}
          <span className="ml-1 text-[11.5px] font-normal text-fg-subtle">{unit}</span>
        </div>
      </div>
      <Sparkline values={series} width={112} height={30} threshold={threshold} />
      <div className="num text-right text-[11.5px] text-fg-muted">
        {deltaPct === null || !isNum(deltaPct) ? "—" : `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct).toFixed(1)}%`}
        <div className="text-[10px] text-fg-faint">vs 24 h</div>
      </div>
    </div>
  );
}

export function KeyMetrics() {
  const snap = useLive((s) => s.snapshot);
  const history = useLive((s) => s.history);
  // 24 h of telemetry, shown as a 30-minute rolling mean (sensor noise hidden, trend kept).
  const series = useMemo(() => {
    const h = history.slice(-288);
    const smooth = (xs: number[], w = 6) =>
      xs.map((_, i) => {
        const a = xs.slice(Math.max(0, i - w + 1), i + 1);
        return a.reduce((s, x) => s + x, 0) / a.length;
      });
    return {
      prod: smooth(h.map((p) => p.production * 24)),
      sec: smooth(h.map((p) => p.sec)),
      tds: smooth(h.map((p) => p.tds)),
      rec: smooth(h.map((p) => p.recovery)),
    };
  }, [history]);
  const delta = (arr: number[], now: number | undefined) => {
    if (!arr.length || !isNum(now) || !isNum(arr[0]) || arr[0] === 0) return null;
    return ((now - arr[0]) / arr[0]) * 100;
  };
  const t = snap?.totals;
  return (
    <Panel title="Key metrics" right={<Provenance kind="simulated" />} reveal="panel1" bodyClassName="px-4 py-1">
      <Row
        label="Water production"
        value={fmtInt(t ? t.production_m3h * 24 : null)}
        unit="m³/d"
        series={series.prod}
        deltaPct={delta(series.prod, t ? t.production_m3h * 24 : undefined)}
      />
      <Row label="Specific energy consumption" value={fmt(t?.sec_kWh_m3, 2)} unit="kWh/m³" series={series.sec} deltaPct={delta(series.sec, t?.sec_kWh_m3)} />
      <Row label="Permeate TDS" value={fmtInt(t?.permeateTDS_mgL)} unit="mg/L" series={series.tds} deltaPct={delta(series.tds, t?.permeateTDS_mgL)} />
      <Row
        label="Plant recovery"
        value={fmt(t ? t.recovery * 100 : null, 1)}
        unit="%"
        series={series.rec}
        deltaPct={delta(series.rec, t ? t.recovery * 100 : undefined)}
      />
    </Panel>
  );
}
