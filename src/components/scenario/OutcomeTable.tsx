"use client";
/** Baseline vs No action vs AquaTwin: computed outcomes of the forecast. */
import type { ScenarioResult } from "@/runtime/protocol";
import { VIOLATION_LABEL } from "@/sim/aquaguard";
import { fmt, fmtHours, fmtInt } from "@/lib/format";

export function OutcomeTable({ res }: { res: ScenarioResult }) {
  const cols = [
    { key: "baseline", label: "Baseline", sub: "no disturbance", b: res.baseline },
    { key: "noAction", label: "No action", sub: "setpoints held", b: res.noAction },
    { key: "aquatwin", label: "AquaTwin", sub: "optimised + AquaGuard", b: res.aquatwin },
  ] as const;
  const rows: { label: string; unit: string; get: (b: ScenarioResult["baseline"]) => string; tone?: (b: ScenarioResult["baseline"]) => "ok" | "crit" | undefined }[] = [
    {
      label: "Constraint violations",
      unit: "h",
      get: (b) => (b.metrics.violationHours > 0 ? fmt(b.metrics.violationHours, 1) : "0"),
      tone: (b) => (b.metrics.violationHours > 0 ? "crit" : "ok"),
    },
    { label: "Production (24 h)", unit: "m³", get: (b) => fmtInt(b.metrics.production_m3) },
    { label: "Lowest storage level", unit: "%", get: (b) => fmt(b.metrics.minReservoir, 0), tone: (b) => (b.metrics.minReservoir < 25 ? "crit" : undefined) },
    { label: "Peak permeate TDS", unit: "mg/L", get: (b) => fmtInt(b.metrics.maxTds), tone: (b) => (b.metrics.maxTds > 400 ? "crit" : undefined) },
    { label: "Specific energy", unit: "kWh/m³", get: (b) => fmt(b.metrics.sec, 3) },
    { label: "Energy", unit: "MWh", get: (b) => fmt(b.metrics.energy_MWh, 1) },
    {
      label: "Cleaning threshold reached",
      unit: "",
      get: (b) => {
        const hits = b.metrics.cipCrossing.map((c, i) => (c === null ? null : `T${i + 1} +${fmtHours(c)}`)).filter(Boolean);
        return hits.length ? hits.join(", ") : "–";
      },
    },
  ];
  const toneCls = (t?: "ok" | "crit") => (t === "crit" ? "text-crit" : t === "ok" ? "text-ok" : "text-fg");
  return (
    <div className="min-w-0">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-normal text-fg-subtle" />
            {cols.map((c) => (
              <th key={c.key} className="pb-2 pl-3 text-right align-bottom font-normal">
                <div className={`font-medium ${c.key === "aquatwin" ? "text-accent" : "text-fg"}`}>{c.label}</div>
                <div className="text-[10.5px] text-fg-subtle">{c.sub}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-2 pr-2 text-fg-muted">
                {r.label}
                {r.unit && <span className="ml-1 text-[10.5px] text-fg-faint">{r.unit}</span>}
              </td>
              {cols.map((c) => (
                <td key={c.key} className={`num py-2 pl-3 text-right ${toneCls(r.tone?.(c.b))}`}>
                  {r.get(c.b)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ViolationSummary res={res} />
    </div>
  );
}

function ViolationSummary({ res }: { res: ScenarioResult }) {
  const na = res.noAction.metrics;
  const at = res.aquatwin.metrics;
  const naV = Object.entries(na.violationBy).map(([k, h]) => `${VIOLATION_LABEL[k] ?? k} ${fmt(h, 1)} h`);
  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-line bg-ink-900 px-3 py-2.5 text-[12px]">
      <div className="flex gap-2">
        <span className="w-[76px] shrink-0 text-fg-subtle">No action</span>
        <span className={naV.length ? "text-crit" : "text-fg-muted"}>
          {naV.length ? `${naV.join(" · ")} (first at +${fmtHours(na.firstViolation)})` : "No constraint violated within 24 h"}
        </span>
      </div>
      <div className="flex gap-2">
        <span className="w-[76px] shrink-0 text-fg-subtle">AquaTwin</span>
        <span className={at.violationHours > 0 ? "text-crit" : "text-ok"}>
          {at.violationHours > 0
            ? Object.entries(at.violationBy)
                .map(([k, h]) => `${VIOLATION_LABEL[k] ?? k} ${fmt(h, 1)} h`)
                .join(" · ")
            : "All AquaGuard constraints held for 24 h"}
        </span>
      </div>
    </div>
  );
}
