"use client";
/**
 * What-if probe: move seawater conditions and setpoints; see the physics,
 * ML-only and hybrid predictions against the reference plant (ground truth
 * in this simulation), the out-of-distribution distance and the AquaGuard
 * verdict. Pushing inputs outside the training envelope makes AquaTwin
 * withhold its recommendation.
 */
import { useEffect, useRef, useState } from "react";
import { twinClient } from "@/runtime/client";
import type { ProbeInput, ProbeResult } from "@/runtime/protocol";
import { fmt, fmtInt } from "@/lib/format";
import { VerdictBanner } from "@/components/guard/GuardChecklist";
import { Panel } from "@/components/ui/primitives";

const OOD_FEATURE_LABEL: Record<string, string> = {
  Cf_gL: "feed salinity",
  T_C: "temperature",
  Cf0_gL: "salinity at calibration",
  T0_C: "temperature at calibration",
  P1_bar: "feed pressure",
  Qv1_m3h: "feed flow",
  A25: "calibrated permeability",
  B25: "calibrated salt passage",
  kdp: "calibrated ΔP coefficient",
  eta: "calibrated pump efficiency",
};

const DESIGN_POINT: ProbeInput = { salinity_gL: 41.5, temperature_C: 28.4, feedPressure_bar: 63.5, feedFlowPerVessel_m3h: 9.6, health: 0.97 };
const COMPOUND_EXTREME: ProbeInput = { salinity_gL: 53, temperature_C: 37.5, feedPressure_bar: 69, feedFlowPerVessel_m3h: 9.6, health: 0.95 };

const SLIDERS: { key: keyof ProbeInput; label: string; min: number; max: number; step: number; unit: string; envelope: [number, number] }[] = [
  { key: "salinity_gL", label: "Feed salinity", min: 34, max: 56, step: 0.5, unit: "g/L", envelope: [36, 48] },
  { key: "temperature_C", label: "Temperature", min: 15, max: 41, step: 0.5, unit: "°C", envelope: [18, 36] },
  { key: "feedPressure_bar", label: "Feed pressure", min: 52, max: 74, step: 0.5, unit: "bar", envelope: [52, 73] },
  { key: "feedFlowPerVessel_m3h", label: "Feed flow / vessel", min: 6.5, max: 14, step: 0.1, unit: "m³/h", envelope: [6.5, 14] },
  { key: "health", label: "Membrane NPF", min: 0.8, max: 1, step: 0.005, unit: "", envelope: [0.87, 1] },
];

export function OodProbe({ className = "", reveal }: { className?: string; reveal?: string }) {
  const [input, setInput] = useState<ProbeInput>(DESIGN_POINT);
  const [res, setRes] = useState<ProbeResult | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(() => {
      twinClient
        .probe(input)
        .then((r) => id === seq.current && setRes(r))
        .catch(() => undefined);
    }, 60);
    return () => clearTimeout(t);
  }, [input]);

  const rows: { k: string; unit: string; key: "Qp" | "Cp" | "dP" | "W"; d: number }[] = [
    { k: "Permeate flow", unit: "m³/h", key: "Qp", d: 0 },
    { k: "Permeate TDS", unit: "mg/L", key: "Cp", d: 0 },
    { k: "Vessel ΔP", unit: "bar", key: "dP", d: 2 },
    { k: "RO power", unit: "kW", key: "W", d: 0 },
  ];
  const err = (v: number, ref: number) => (ref ? ((v - ref) / ref) * 100 : 0);
  const ratio = res?.ood?.ratio ?? 0;

  return (
    <Panel
      title="Out-of-distribution probe"
      reveal={reveal}
      className={className}
      bodyClassName="min-h-0 p-4"
      right={
        <>
          <span className="mr-2 hidden items-center gap-3 font-mono text-[9.5px] text-fg-faint xl:inline-flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-4 rounded-full bg-fg-subtle/60" /> training envelope
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-4 rounded-full bg-warn/50" /> extrapolation
            </span>
          </span>
          <button
            className="h-7 rounded-md border border-line px-2.5 text-[11.5px] text-fg-muted hover:border-line-strong hover:text-fg"
            onClick={() => setInput(DESIGN_POINT)}
          >
            Design point
          </button>
          <button className="h-7 rounded-md border border-warn/40 px-2.5 text-[11.5px] text-warn hover:bg-warn-soft/40" onClick={() => setInput(COMPOUND_EXTREME)}>
            Compound extreme
          </button>
        </>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
        <div className="space-y-2.5">
          {SLIDERS.map((s) => {
            const v = input[s.key];
            const outside = v < s.envelope[0] || v > s.envelope[1];
            const pct = (x: number) => ((x - s.min) / (s.max - s.min)) * 100;
            return (
              <label key={s.key} className="block">
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="truncate text-fg-muted">
                    {s.label}
                    <span className="ml-1.5 font-mono text-[9.5px] text-fg-faint">
                      {s.key === "health" ? `${s.envelope[0] * 100}–${s.envelope[1] * 100}%` : `${s.envelope[0]}–${s.envelope[1]}`}
                    </span>
                  </span>
                  <span className={`num shrink-0 ${outside ? "text-warn" : "text-fg"}`}>{s.key === "health" ? `${fmt(v * 100, 1)}%` : `${fmt(v, 1)} ${s.unit}`}</span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={v}
                  onChange={(e) => setInput({ ...input, [s.key]: Number(e.target.value) })}
                  className="mt-0.5 block w-full accent-[#40b4ff]"
                  aria-label={s.label}
                />
                <div className="relative mx-[7px] mt-0.5 h-[2px] rounded-full bg-warn/35" aria-hidden title="Training envelope">
                  <div
                    className="absolute inset-y-0 rounded-full bg-fg-subtle/60"
                    style={{ left: `${pct(s.envelope[0])}%`, width: `${pct(s.envelope[1]) - pct(s.envelope[0])}%` }}
                  />
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-fg-muted">Distance to training distribution (Mahalanobis / d₉₉)</span>
                <span className={`num ${ratio > 1.4 || (res?.ood?.outOfRange.length ?? 0) > 0 ? "text-warn" : "text-fg"}`}>{fmt(ratio, 2)}</span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-ink-700">
                <div className="absolute inset-y-0 left-0 rounded-full bg-ok/70" style={{ width: `${(1 / 2.5) * 100}%` }} />
                <div className="absolute inset-y-0 rounded-full bg-warn/50" style={{ left: `${(1 / 2.5) * 100}%`, width: `${(0.4 / 2.5) * 100}%` }} />
                <div className="absolute -top-1 h-4 w-[3px] rounded bg-fg" style={{ left: `${Math.min(1, ratio / 2.5) * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9.5px] text-fg-faint">
                <span>0</span>
                <span>d₉₉</span>
                <span>1.4 · d₉₉ (withhold)</span>
                <span>2.5</span>
              </div>
            </div>
            <div className="text-right">
              <div className="label">Confidence</div>
              <div className={`num text-[24px] font-medium ${res && res.confidence < 0.5 ? "text-warn" : "text-fg"}`}>
                {res ? `${fmt(res.confidence * 100, 0)}%` : "–"}
              </div>
            </div>
          </div>
          {res && <VerdictBanner verdict={res.verdict} reasons={res.verdict === "WITHHELD" ? res.guard.reasons : res.guard.reasons.slice(0, 2)} />}
          {res?.ood?.outOfRange.length ? (
            <div className="text-[11.5px] text-warn">Outside training range: {res.ood.outOfRange.map((f) => OOD_FEATURE_LABEL[f] ?? f).join(", ")}</div>
          ) : null}
          <div className="max-lg:overflow-x-auto">
            <table className="w-full text-[12px] max-lg:min-w-[540px]">
              <thead>
                <tr className="text-left text-[10.5px] text-fg-subtle">
                  <th className="pb-1.5 font-normal">One train, what-if</th>
                  <th className="pb-1.5 text-right font-normal">Reference plant</th>
                  <th className="pb-1.5 text-right font-normal">Physics</th>
                  <th className="pb-1.5 text-right font-normal">ML only</th>
                  <th className="pb-1.5 text-right font-normal text-accent">Hybrid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  if (!res) return null;
                  const ref = res.reference[r.key];
                  const cell = (v: number | undefined) =>
                    v === undefined ? (
                      "–"
                    ) : (
                      <>
                        {r.d ? fmt(v, r.d) : fmtInt(v)}
                        <span className={`ml-1.5 text-[10px] ${Math.abs(err(v, ref)) > 3 ? "text-warn" : "text-fg-subtle"}`}>
                          {(err(v, ref) >= 0 ? "+" : "") + fmt(err(v, ref), 1)}%
                        </span>
                      </>
                    );
                  return (
                    <tr key={r.k} className="border-t border-line">
                      <td className="py-1.5 text-fg-muted">
                        {r.k} <span className="text-[10.5px] text-fg-faint">{r.unit}</span>
                      </td>
                      <td className="num py-1.5 text-right text-fg">{r.d ? fmt(ref, r.d) : fmtInt(ref)}</td>
                      <td className="num py-1.5 text-right text-fg">{cell(res.physics[r.key])}</td>
                      <td className="num py-1.5 text-right text-fg">{cell(res.mlonly?.[r.key])}</td>
                      <td className="num py-1.5 text-right text-fg">{cell(res.hybrid[r.key])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-fg-subtle">
            Reference plant = the higher-fidelity simulator used as ground truth in this prototype (not a real plant); errors are relative to it.
          </p>
        </div>
      </div>
    </Panel>
  );
}
