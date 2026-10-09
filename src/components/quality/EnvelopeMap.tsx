"use client";
/**
 * Safe operating envelope: feasibility of every (feed pressure, feed flow per
 * vessel) operating point under the current seawater conditions, evaluated by
 * the hybrid twin + AquaGuard at the edge of the 90 % prediction interval.
 * Overlays: current operating point and Scenario Lab trajectories.
 */
import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import type { EnvelopeGrid } from "@/runtime/protocol";
import { useElementSize } from "@/components/charts/useElementSize";
import { fmt, fmtInt } from "@/lib/format";

const BITS: { bit: number; label: string; color: string }[] = [
  { bit: 2, label: "Permeate TDS", color: "var(--color-crit)" },
  { bit: 1, label: "Pressure limit", color: "#c77dff" },
  { bit: 4, label: "Recovery", color: "var(--color-warn)" },
  { bit: 8, label: "Flux", color: "#e6c07b" },
  { bit: 16, label: "Concentrate flow", color: "var(--c-series-physics)" },
  { bit: 32, label: "Vessel feed flow", color: "var(--color-series-base)" },
  { bit: 64, label: "Vessel ΔP", color: "var(--color-fg-muted)" },
  { bit: 128, label: "Motor rating", color: "var(--color-fg-subtle)" },
];

export interface EnvelopePath {
  label: string;
  color: string;
  points: { P: number; Qv: number; violated: boolean }[];
}

export function EnvelopeMap({ grid, paths = [] }: { grid: EnvelopeGrid; paths?: EnvelopePath[] }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const m = { l: 48, r: 12, t: 10, b: 36 };
  const W = size.width;
  const H = size.height;
  const iw = Math.max(10, W - m.l - m.r);
  const ih = Math.max(10, H - m.t - m.b);
  const x = useMemo(
    () =>
      scaleLinear()
        .domain([grid.P[0], grid.P[grid.P.length - 1]])
        .range([0, iw]),
    [grid, iw],
  );
  const y = useMemo(
    () =>
      scaleLinear()
        .domain([grid.Qv[0], grid.Qv[grid.Qv.length - 1]])
        .range([ih, 0]),
    [grid, ih],
  );
  const cw = iw / (grid.P.length - 1);
  const ch = ih / (grid.Qv.length - 1);
  const dominant = (code: number) => BITS.find((b) => code & b.bit);
  const present = BITS.filter((b) => grid.code.some((row) => row.some((c) => c & b.bit)));
  const hv = hover
    ? {
        P: grid.P[hover.i],
        Qv: grid.Qv[hover.j],
        code: grid.code[hover.j][hover.i],
        tds: grid.tds[hover.j][hover.i],
        rec: grid.recovery[hover.j][hover.i],
        prod: grid.production[hover.j][hover.i],
        sec: grid.sec[hover.j][hover.i],
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-fg-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[2px] bg-accent/40" /> Admissible
        </span>
        {present.map((b) => (
          <span key={b.bit} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px]" style={{ background: b.color, opacity: 0.35 }} /> {b.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative min-h-0 flex-1">
        {W > 0 && H > 0 && (
          <svg width={W} height={H} className="block" role="img" aria-label="Safe operating envelope">
            <g transform={`translate(${m.l},${m.t})`}>
              {grid.code.map((row, j) =>
                row.map((code, i) => {
                  const d = dominant(code);
                  return (
                    <rect
                      key={`${i}-${j}`}
                      x={x(grid.P[i]) - cw / 2}
                      y={y(grid.Qv[j]) - ch / 2}
                      width={cw + 0.5}
                      height={ch + 0.5}
                      fill={code === 0 ? "var(--color-accent)" : code & 256 ? "var(--color-ink-900)" : (d?.color ?? "var(--color-line-bright)")}
                      opacity={code === 0 ? 0.28 : code & 256 ? 1 : 0.14}
                      onMouseEnter={() => setHover({ i, j })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                }),
              )}
              {x.ticks(7).map((t) => (
                <text key={`x${t}`} x={x(t)} y={ih + 15} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
                  {t}
                </text>
              ))}
              {y.ticks(6).map((t) => (
                <text key={`y${t}`} x={-8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
                  {t}
                </text>
              ))}
              <text x={iw / 2} y={ih + 31} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-dim)">
                Feed pressure (bar) →
              </text>
              <text transform={`translate(-36,${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-dim)">
                Feed flow per vessel (m³/h) →
              </text>
              {paths.map((p) => (
                <g key={p.label}>
                  <polyline points={p.points.map((q) => `${x(q.P)},${y(q.Qv)}`).join(" ")} fill="none" stroke={p.color} strokeWidth={1.6} strokeOpacity={0.9} />
                  {p.points.map((q, k) =>
                    q.violated ? (
                      <circle key={k} cx={x(q.P)} cy={y(q.Qv)} r={2.6} fill="var(--color-crit)" />
                    ) : k % 4 === 0 ? (
                      <circle key={k} cx={x(q.P)} cy={y(q.Qv)} r={1.8} fill={p.color} />
                    ) : null,
                  )}
                </g>
              ))}
              <g transform={`translate(${x(grid.operating.P)},${y(grid.operating.Qv)})`}>
                <circle r={6} fill="none" stroke="var(--color-fg)" strokeWidth={1.5} />
                <circle r={2} fill="var(--color-fg)" />
                <text x={10} y={-8} fontSize={10.5} fill="var(--color-fg)">
                  Operating point
                </text>
              </g>
            </g>
          </svg>
        )}
        {hv && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-line-strong bg-ink-900/95 px-3 py-2 text-[11px] shadow-lg">
            <div className="font-mono text-[10px] text-fg-subtle">
              {fmt(hv.P, 1)} bar · {fmt(hv.Qv, 2)} m³/h per vessel
            </div>
            <div className="num text-fg-muted">
              TDS {fmtInt(hv.tds)} mg/L · recovery {fmt(hv.rec, 1)}% · {fmtInt(hv.prod)} m³/h · SEC {fmt(hv.sec, 2)}
            </div>
            <div className={hv.code === 0 ? "text-ok" : "text-crit"}>
              {hv.code === 0
                ? "Admissible"
                : BITS.filter((b) => hv.code & b.bit)
                    .map((b) => b.label)
                    .join(", ") || "No permeate"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
