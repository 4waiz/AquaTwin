"use client";
/** Horizontal grouped bars: categories × series, with value labels. */
import { scaleLinear } from "d3-scale";
import { isNum } from "@/lib/format";
import { useElementSize } from "./useElementSize";

export interface BarSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
}

export function GroupedBars({
  categories,
  series,
  format = (v) => v.toFixed(1),
  unit,
  barHeight = 9,
  gap = 14,
  domain,
  highlightMin = false,
}: {
  categories: string[];
  series: BarSeries[];
  format?: (v: number) => string;
  unit?: string;
  barHeight?: number;
  gap?: number;
  domain?: [number, number];
  /** Emphasise the lowest value per category (e.g. error metrics). */
  highlightMin?: boolean;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const labelW = 132;
  const valueW = 56;
  const W = size.width;
  const all = series.flatMap((s) => s.values.filter(isNum)) as number[];
  const max = domain ? domain[1] : Math.max(1e-9, ...all);
  const x = scaleLinear()
    .domain([domain ? domain[0] : 0, max])
    .range([0, Math.max(10, W - labelW - valueW)]);
  const groupH = series.length * (barHeight + 3) + gap;
  const H = categories.length * groupH;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {unit && <span className="ml-auto font-mono text-[10px] text-fg-faint">{unit}</span>}
      </div>
      <div ref={ref} className="w-full">
        {W > 0 && (
          <svg width={W} height={H} role="img">
            {categories.map((c, ci) => {
              const vals = series.map((s) => s.values[ci]);
              const finite = vals.filter(isNum) as number[];
              const minV = finite.length ? Math.min(...finite) : null;
              return (
                <g key={c} transform={`translate(0,${ci * groupH})`}>
                  <text x={0} y={(series.length * (barHeight + 3)) / 2 + 3} fontSize={11.5} fill="var(--color-fg-muted)">
                    {c}
                  </text>
                  {series.map((s, si) => {
                    const v = s.values[ci];
                    const y = si * (barHeight + 3);
                    const best = highlightMin && isNum(v) && v === minV;
                    return (
                      <g key={s.id} transform={`translate(${labelW},${y})`}>
                        <rect width={Math.max(10, W - labelW - valueW)} height={barHeight} rx={2} fill="var(--color-ink-750)" />
                        {isNum(v) ? <rect width={Math.max(1.5, x(v))} height={barHeight} rx={2} fill={s.color} opacity={best || !highlightMin ? 1 : 0.55} /> : null}
                        <text
                          x={Math.max(10, W - labelW - valueW) + 8}
                          y={barHeight - 0.5}
                          fontSize={10.5}
                          fill={best ? "var(--color-fg)" : "var(--color-fg-dim)"}
                          fontFamily="var(--font-mono)"
                        >
                          {isNum(v) ? format(v) : "–"}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
