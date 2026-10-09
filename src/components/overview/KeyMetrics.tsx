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
    <div className="min-w-0 rounded-md border border-line bg-ink-900/60 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-[11px] text-fg-subtle">{label}</div>
        <div className="num shrink-0 text-[10.5px] text-fg-muted" title="Change vs 24 h ago">
          {deltaPct === null || !isNum(deltaPct) ? "–" : `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct).toFixed(1)}%`}
        </div>
      </div>
      <div className="num text-[16px] font-medium leading-tight tracking-tight text-fg">
        {value}
        <span className="ml-1 text-[11px] font-normal text-fg-subtle">{unit}</span>
      </div>
      <div className="mt-0.5"><Sparkline values={series} width={128} height={16} threshold={threshold} /></div>
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
    <Panel title="Key metrics" dense className="shrink-0" right={<Provenance kind="simulated" />} reveal="panel1" bodyClassName="grid grid-cols-2 gap-2 p-2.5">
      <Row
        label="Production"
        value={fmtInt(t ? t.production_m3h * 24 : null)}
        unit="m³/d"
        series={series.prod}
        deltaPct={delta(series.prod, t ? t.production_m3h * 24 : undefined)}
      />
      <Row label="Specific energy" value={fmt(t?.sec_kWh_m3, 2)} unit="kWh/m³" series={series.sec} deltaPct={delta(series.sec, t?.sec_kWh_m3)} />
      <Row label="Permeate TDS" value={fmtInt(t?.permeateTDS_mgL)} unit="mg/L" series={series.tds} deltaPct={delta(series.tds, t?.permeateTDS_mgL)} />
      <Row
        label="Recovery"
        value={fmt(t ? t.recovery * 100 : null, 1)}
        unit="%"
        series={series.rec}
        deltaPct={delta(series.rec, t ? t.recovery * 100 : undefined)}
      />
    </Panel>
  );
}
