"use client";
/**
 * Multi-series line chart used across the product: optional uncertainty
 * bands, horizontal limit lines (constraints), shaded violation regions, a
 * time cursor, and hover readout. Pure SVG, sized by its container.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { isNum } from "@/lib/format";
import { useElementSize } from "./useElementSize";

export interface Series {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  width?: number;
  band?: { lo: (number | null)[]; hi: (number | null)[] };
  /** Draw an area fill under the line. */
  fill?: boolean;
}

export interface Limit {
  value: number;
  label: string;
  tone?: "warn" | "crit" | "muted";
  /** Which side is the violation side (for shading). */
  violates?: "above" | "below";
}

export function LineChart({
  x,
  series,
  limits = [],
  yDomain,
  xDomain,
  xFormat = (v) => String(v),
  yFormat = (v) => String(Math.round(v)),
  cursor,
  onCursor,
  height,
  unit,
  xTicks,
  yTicks = 4,
  markers = [],
  className = "",
  legend = true,
  emptyLabel,
}: {
  x: number[];
  series: Series[];
  limits?: Limit[];
  yDomain?: [number, number];
  xDomain?: [number, number];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  cursor?: number | null;
  onCursor?: (x: number) => void;
  height?: number;
  unit?: string;
  xTicks?: number[];
  yTicks?: number;
  markers?: { x: number; label: string }[];
  className?: string;
  legend?: boolean;
  emptyLabel?: ReactNode;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = size.width;
  const H = height ?? size.height;
  const m = { l: 44, r: 12, t: 8, b: 22 };
  const iw = Math.max(10, W - m.l - m.r);
  const ih = Math.max(10, H - m.t - m.b);

  const { xs, ys, paths } = useMemo(() => {
    const allY: number[] = [];
    for (const s of series) {
      for (const v of s.values) if (isNum(v)) allY.push(v);
      if (s.band) for (const arr of [s.band.lo, s.band.hi]) for (const v of arr) if (isNum(v)) allY.push(v);
    }
    for (const l of limits) allY.push(l.value);
    let y0 = yDomain ? yDomain[0] : Math.min(...allY);
    let y1 = yDomain ? yDomain[1] : Math.max(...allY);
    if (!isNum(y0) || !isNum(y1)) {
      y0 = 0;
      y1 = 1;
    }
    if (!yDomain) {
      const pad = (y1 - y0 || Math.abs(y1) || 1) * 0.1;
      y0 -= pad;
      y1 += pad;
    }
    const xd = xDomain ?? [x[0] ?? 0, x[x.length - 1] ?? 1];
    const xs = scaleLinear().domain(xd).range([0, iw]);
    const ys = scaleLinear().domain([y0, y1]).range([ih, 0]).nice(yTicks);
    const paths = series.map((s) => {
      const pts = x.map((xv, i) => [xs(xv), s.values[i]] as [number, number | null]);
      const ln = line<[number, number | null]>()
        .defined((d) => isNum(d[1]))
        .x((d) => d[0])
        .y((d) => ys(d[1] as number))
        .curve(curveMonotoneX)(pts);
      let band: string | null = null;
      if (s.band) {
        const bp = x.map((xv, i) => [xs(xv), s.band!.lo[i], s.band!.hi[i]] as [number, number | null, number | null]);
        band =
          area<[number, number | null, number | null]>()
            .defined((d) => isNum(d[1]) && isNum(d[2]))
            .x((d) => d[0])
            .y0((d) => ys(d[1] as number))
            .y1((d) => ys(d[2] as number))
            .curve(curveMonotoneX)(bp) ?? null;
      }
      let fillPath: string | null = null;
      if (s.fill) {
        fillPath =
          area<[number, number | null]>()
            .defined((d) => isNum(d[1]))
            .x((d) => d[0])
            .y0(ih)
            .y1((d) => ys(d[1] as number))
            .curve(curveMonotoneX)(pts) ?? null;
      }
      return { s, d: ln ?? "", band, fillPath };
    });
    return { xs, ys, paths };
  }, [series, limits, x, xDomain, yDomain, iw, ih, yTicks]);

  const hasData = series.some((s) => s.values.some(isNum));
  const ticksX = xTicks ?? xs.ticks(6);
  const ticksY = ys.ticks(yTicks);
  // If the caller's format collapses neighbouring ticks (e.g. 7.74 and 7.76 → "7.7"),
  // fall back to the precision implied by the tick step.
  const yLabels = (() => {
    const labels = ticksY.map((t) => yFormat(t));
    if (new Set(labels).size === labels.length || ticksY.length < 2) return labels;
    const step = Math.abs(ticksY[1] - ticksY[0]);
    const digits = Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
    return ticksY.map((t) => t.toFixed(digits));
  })();

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = e.clientX - r.left - m.l;
    const xv = xs.invert(Math.min(Math.max(px, 0), iw));
    setHover(xv);
    if (onCursor && e.buttons === 1) onCursor(xv);
  };
  const hx = hover ?? null;
  const hi = hx === null ? -1 : x.reduce((best, v, i) => (Math.abs(v - hx) < Math.abs(x[best] - hx) ? i : best), 0);

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${className}`}>
      {legend && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden>
                <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "3 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
          {limits.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke={l.tone === "crit" ? "#f0564d" : l.tone === "warn" ? "#f2a93b" : "#6d7787"}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
              </svg>
              {l.label}
            </span>
          ))}
          {unit && <span className="ml-auto font-mono text-[10px] text-fg-faint">{unit}</span>}
        </div>
      )}
      <div ref={ref} className="relative min-h-0 flex-1" style={height ? { height } : undefined}>
        {W > 0 && H > 0 && (
          <svg
            ref={svgRef}
            width={W}
            height={H}
            className="block select-none"
            onPointerMove={onMove}
            onPointerDown={(e) => {
              onMove(e);
              if (onCursor) {
                const r = svgRef.current!.getBoundingClientRect();
                onCursor(xs.invert(Math.min(Math.max(e.clientX - r.left - m.l, 0), iw)));
              }
            }}
            onPointerLeave={() => setHover(null)}
            role="img"
          >
            <g transform={`translate(${m.l},${m.t})`}>
              {ticksY.map((t, i) => (
                <g key={t} transform={`translate(0,${ys(t)})`}>
                  <line x1={0} x2={iw} stroke="#19202b" />
                  <text x={-8} y={3.5} textAnchor="end" fontSize={10} fill="#6d7787" fontFamily="var(--font-mono)">
                    {yLabels[i]}
                  </text>
                </g>
              ))}
              {ticksX.map((t) => (
                <text key={t} x={xs(t)} y={ih + 15} textAnchor="middle" fontSize={10} fill="#6d7787" fontFamily="var(--font-mono)">
                  {xFormat(t)}
                </text>
              ))}
              {limits.map((l) => {
                const y = ys(l.value);
                const c = l.tone === "crit" ? "#f0564d" : l.tone === "warn" ? "#f2a93b" : "#6d7787";
                return (
                  <g key={l.label}>
                    {l.violates && (
                      <rect
                        x={0}
                        width={iw}
                        y={l.violates === "above" ? 0 : y}
                        height={l.violates === "above" ? Math.max(0, y) : Math.max(0, ih - y)}
                        fill={c}
                        opacity={0.045}
                      />
                    )}
                    <line x1={0} x2={iw} y1={y} y2={y} stroke={c} strokeDasharray="4 3" strokeOpacity={0.8} />
                  </g>
                );
              })}
              {markers.map((mk) => (
                <g key={mk.label} transform={`translate(${xs(mk.x)},0)`}>
                  <line y1={0} y2={ih} stroke="#313c4e" strokeDasharray="2 3" />
                  <text x={4} y={10} fontSize={9.5} fill="#6d7787" fontFamily="var(--font-mono)">
                    {mk.label}
                  </text>
                </g>
              ))}
              {paths.map(({ s, band }) => (band ? <path key={`b-${s.id}`} d={band} fill={s.color} opacity={0.12} /> : null))}
              {paths.map(({ s, fillPath }) => (fillPath ? <path key={`f-${s.id}`} d={fillPath} fill={s.color} opacity={0.08} /> : null))}
              {paths.map(({ s, d }) => (
                <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.6} strokeDasharray={s.dashed ? "4 4" : undefined} strokeLinejoin="round" />
              ))}
              {isNum(cursor) && (
                <g transform={`translate(${xs(cursor as number)},0)`}>
                  <line y1={-4} y2={ih} stroke="#5b9dff" strokeWidth={1.2} />
                  <circle cy={-4} r={3} fill="#5b9dff" />
                </g>
              )}
              {hi >= 0 && hover !== null && (
                <g transform={`translate(${xs(x[hi])},0)`}>
                  <line y1={0} y2={ih} stroke="#a2acba" strokeOpacity={0.35} />
                  {series.map((s) =>
                    isNum(s.values[hi]) ? <circle key={s.id} cy={ys(s.values[hi] as number)} r={3} fill={s.color} stroke="#070a0f" strokeWidth={1.5} /> : null,
                  )}
                </g>
              )}
            </g>
          </svg>
        )}
        {hi >= 0 && hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border border-line-strong bg-ink-900/95 px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{ left: Math.min(Math.max(m.l + xs(x[hi]) + 10, 0), Math.max(0, W - 170)) }}
          >
            <div className="num mb-0.5 font-mono text-[10px] text-fg-subtle">{xFormat(x[hi])}</div>
            {series.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num text-fg">{isNum(s.values[hi]) ? yFormat(s.values[hi] as number) : "—"}</span>
              </div>
            ))}
          </div>
        )}
        {!hasData && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-fg-subtle">{emptyLabel ?? "Waiting for data"}</div>}
      </div>
    </div>
  );
}
