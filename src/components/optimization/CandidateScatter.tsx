"use client";
/**
 * Candidate strategies in the (SEC, membrane-stress) plane. Admissible
 * candidates are blue, the Pareto set is connected by the frontier line,
 * rejected candidates are hollow grey, withheld ones amber, the current
 * operating point is a white diamond and the recommendation is ringed.
 */
import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import type { CandidateLite } from "@/runtime/protocol";
import { useElementSize } from "@/components/charts/useElementSize";
import { fmt } from "@/lib/format";
import { FOCUS_LABEL } from "@/sim/optimizer";

export function CandidateScatter({
  candidates,
  current,
  bestId,
  selectedId,
  onSelect,
}: {
  candidates: CandidateLite[];
  current: CandidateLite;
  bestId: number | null;
  selectedId: number | null;
  onSelect: (c: CandidateLite) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<CandidateLite | null>(null);
  const m = { l: 52, r: 16, t: 14, b: 38 };
  const W = size.width;
  const H = size.height;
  const iw = Math.max(10, W - m.l - m.r);
  const ih = Math.max(10, H - m.t - m.b);

  const { xs, ys, frontier } = useMemo(() => {
    const pts = [...candidates, current].filter((c) => Number.isFinite(c.objectives.sec_kWh_m3) && c.objectives.production_m3h > 1);
    const secs = pts.map((c) => c.objectives.sec_kWh_m3);
    const str = pts.map((c) => c.objectives.stress);
    const xs = scaleLinear()
      .domain([Math.min(...secs) - 0.03, Math.max(...secs) + 0.03])
      .range([0, iw])
      .nice();
    const ys = scaleLinear()
      .domain([Math.min(...str) - 0.02, Math.max(...str) + 0.02])
      .range([ih, 0])
      .nice();
    const frontier = candidates
      .filter((c) => c.pareto)
      .sort((a, b) => a.objectives.sec_kWh_m3 - b.objectives.sec_kWh_m3)
      .map((c) => `${xs(c.objectives.sec_kWh_m3)},${ys(c.objectives.stress)}`)
      .join(" ");
    return { xs, ys, frontier };
  }, [candidates, current, iw, ih]);

  const shown = hover ?? null;
  const draw = candidates.filter((c) => c.objectives.production_m3h > 1);
  const order = (c: CandidateLite) => (c.id === bestId ? 3 : c.pareto ? 2 : c.feasible ? 1 : 0);
  return (
    <div ref={ref} className="relative h-full w-full">
      {W > 0 && H > 0 && (
        <svg width={W} height={H} className="block" role="img" aria-label="Candidate strategies: specific energy versus membrane stress">
          <g transform={`translate(${m.l},${m.t})`}>
            {ys.ticks(5).map((t) => (
              <g key={`y${t}`} transform={`translate(0,${ys(t)})`}>
                <line x1={0} x2={iw} stroke="var(--color-line)" />
                <text x={-8} y={3.5} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            {xs.ticks(6).map((t) => (
              <g key={`x${t}`} transform={`translate(${xs(t)},0)`}>
                <line y1={0} y2={ih} stroke="var(--color-line)" />
                <text y={ih + 15} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            <text x={iw / 2} y={ih + 32} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-dim)">
              Specific energy consumption (kWh/m³) →
            </text>
            <text transform={`translate(-40,${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-dim)">
              Membrane stress index →
            </text>
            {frontier && <polyline points={frontier} fill="none" stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="5 4" />}
            {[...draw]
              .sort((a, b) => order(a) - order(b))
              .map((c) => {
                const x = xs(c.objectives.sec_kWh_m3);
                const y = ys(c.objectives.stress);
                const sel = c.id === selectedId;
                if (c.verdict === "WITHHELD")
                  return (
                    <circle
                      key={c.id}
                      cx={x}
                      cy={y}
                      r={3.2}
                      fill="none"
                      stroke="var(--color-warn)"
                      strokeOpacity={0.7}
                      onMouseEnter={() => setHover(c)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => onSelect(c)}
                      className="cursor-pointer"
                    />
                  );
                if (!c.feasible)
                  return (
                    <circle
                      key={c.id}
                      cx={x}
                      cy={y}
                      r={2.8}
                      fill="none"
                      stroke="var(--color-fg-faint)"
                      strokeWidth={1}
                      onMouseEnter={() => setHover(c)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => onSelect(c)}
                      className="cursor-pointer"
                    />
                  );
                return (
                  <circle
                    key={c.id}
                    cx={x}
                    cy={y}
                    r={c.pareto ? 4.2 : 3.2}
                    fill={c.pareto ? "var(--color-accent)" : "var(--c-accent-dim)"}
                    stroke={sel ? "var(--color-fg)" : "none"}
                    strokeWidth={1.5}
                    onMouseEnter={() => setHover(c)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect(c)}
                    className="cursor-pointer"
                  />
                );
              })}
            {/* current operating point */}
            <g transform={`translate(${xs(current.objectives.sec_kWh_m3)},${ys(current.objectives.stress)})`}>
              <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill="var(--color-fg)" stroke="var(--color-ink-900)" strokeWidth={1.5} />
              <text x={10} y={4} fontSize={10.5} fill="var(--color-series-noact)" stroke="var(--color-ink-900)" strokeWidth={3} paintOrder="stroke">
                Current
              </text>
            </g>
            {/* recommended */}
            {bestId !== null &&
              (() => {
                const b = candidates.find((c) => c.id === bestId) ?? (bestId === current.id ? current : null);
                if (!b) return null;
                const x = xs(b.objectives.sec_kWh_m3);
                const y = ys(b.objectives.stress);
                return (
                  <g>
                    <circle cx={x} cy={y} r={9} fill="none" stroke="var(--color-accent)" strokeWidth={1.6} />
                    <line x1={x + 9} y1={y - 9} x2={x + 26} y2={y - 26} stroke="var(--color-accent)" strokeWidth={1} />
                    <text
                      x={x + 29}
                      y={y - 27}
                      fontSize={10}
                      fontFamily="var(--font-mono)"
                      fill="var(--color-accent)"
                      letterSpacing="0.08em"
                      stroke="var(--color-ink-900)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      AQUATWIN RECOMMENDED
                    </text>
                  </g>
                );
              })()}
          </g>
        </svg>
      )}
      {shown && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line-strong bg-ink-900/95 px-3 py-2 text-[11.5px] shadow-lg">
          <div className="mb-1 font-mono text-[10px] text-fg-subtle">
            {shown.verdict} · P {fmt(shown.P, 1)} bar · Q<sub>v</sub> {fmt(shown.Qv, 1)} m³/h ·{" "}
            {shown.focusMode === "normal" ? "all trains equal" : FOCUS_LABEL[shown.focusMode].replace("Focus train", `Train ${(shown.focusTrain ?? 0) + 1}`)}
          </div>
          <div className="num text-fg-muted">
            SEC {fmt(shown.objectives.sec_kWh_m3, 3)} · stress {fmt(shown.objectives.stress, 3)} · TDS {fmt(shown.objectives.tds_mgL, 0)} mg/L · production{" "}
            {fmt(shown.objectives.production_m3h, 0)} m³/h
          </div>
        </div>
      )}
    </div>
  );
}
