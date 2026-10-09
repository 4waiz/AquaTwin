"use client";
/**
 * Physics prediction + ML residual = AquaTwin estimate, shown for the live
 * values of one train (all numbers come from the running hybrid model).
 */
import type { HybridBreakdown } from "@/runtime/protocol";
import { fmt, fmtInt, fmtSigned } from "@/lib/format";

type Key = "Q" | "C" | "D" | "W";

const META: Record<Key, { label: string; unit: string; phys: "Qp" | "Cp" | "dP" | "W"; digits: number; space: string }> = {
  Q: { label: "Permeate flow", unit: "m³/h", phys: "Qp", digits: 1, space: "relative" },
  C: { label: "Permeate TDS", unit: "mg/L", phys: "Cp", digits: 1, space: "log-ratio" },
  D: { label: "Vessel ΔP", unit: "bar", phys: "dP", digits: 3, space: "absolute" },
  W: { label: "RO power", unit: "kW", phys: "W", digits: 0, space: "relative" },
};

function Box({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: "physics" | "ml" | "hybrid" | "measured" }) {
  const cls = {
    physics: "border-line-strong bg-ink-900",
    ml: "border-accent/40 bg-accent-soft/30",
    hybrid: "border-accent bg-[#0b1d2e]",
    measured: "border-line bg-ink-900",
  }[tone];
  return (
    <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${cls}`}>
      <div className="label truncate">{label}</div>
      <div className={`num mt-1 truncate text-[20px] font-medium tracking-tight ${tone === "hybrid" ? "text-accent" : "text-fg"}`}>
        {value}
        <span className="ml-1 text-[11px] font-normal text-fg-subtle">{unit}</span>
      </div>
    </div>
  );
}

export function HybridEquation({ h, target }: { h: HybridBreakdown; target: Key }) {
  const m = META[target];
  const phys = h.physics[m.phys];
  const hyb = h.hybrid[m.phys];
  const meas = h.measured[m.phys];
  const delta = hyb - phys;
  const f = (v: number) => (m.digits === 0 ? fmtInt(v) : fmt(v, m.digits));
  const hwRel = h.margins ? h.margins[target] : null;
  const hw = hwRel === null ? null : target === "D" ? hwRel : target === "C" ? hyb * (Math.exp(hwRel) - 1) : hyb * hwRel;
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <Box label="Physics · 0D" value={f(phys)} unit={m.unit} tone="physics" />
        <div className="flex items-center text-[18px] text-fg-subtle">+</div>
        <Box label="ML residual" value={fmtSigned(delta, m.digits === 0 ? 0 : m.digits)} unit={m.unit} tone="ml" />
        <div className="flex items-center text-[18px] text-fg-subtle">=</div>
        <Box label="AquaTwin" value={f(hyb)} unit={m.unit} tone="hybrid" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-fg-subtle">
        <span>
          Measured (simulated sensor){" "}
          <span className="num text-fg-muted">
            {f(meas)} {m.unit}
          </span>
        </span>
        {hw !== null && (
          <span>
            90% interval{" "}
            <span className="num text-fg-muted">
              ±{f(Math.abs(hw))} {m.unit}
            </span>
          </span>
        )}
        <span>
          Residual space <span className="text-fg-muted">{m.space}</span>
          {h.residual && (
            <span className="num text-fg-muted">
              {" "}
              ({fmtSigned(h.residual[target] * (target === "D" ? 1 : 100), target === "D" ? 3 : 2, target === "D" ? " bar" : "%")})
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export const HYBRID_TARGETS: Key[] = ["Q", "C", "D", "W"];
export const HYBRID_META = META;
