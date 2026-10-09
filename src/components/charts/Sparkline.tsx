"use client";
import { useId, useMemo } from "react";
import { line, area, curveMonotoneX } from "d3-shape";
import { isNum } from "@/lib/format";

/** Compact trend line with a soft area fill and a live end marker. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "#40b4ff",
  domain,
  threshold,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  domain?: [number, number];
  threshold?: number;
}) {
  const id = useId();
  const clean = values.filter(isNum);
  const { d, a, last, ty } = useMemo(() => {
    if (clean.length < 2) return { d: "", a: "", last: null as null | [number, number], ty: null as number | null };
    let lo = domain ? domain[0] : Math.min(...clean);
    let hi = domain ? domain[1] : Math.max(...clean);
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const x = (i: number) => (i / (clean.length - 1)) * (width - 4) + 1;
    const y = (v: number) => height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
    const pts = clean.map((v, i) => [x(i), y(v)] as [number, number]);
    const ln = line().curve(curveMonotoneX)(pts) ?? "";
    const ar = area().curve(curveMonotoneX).y0(height)(pts) ?? "";
    return { d: ln, a: ar, last: pts[pts.length - 1], ty: threshold !== undefined ? y(threshold) : null };
  }, [clean, width, height, domain, threshold]);

  if (!d) return <svg width={width} height={height} aria-hidden />;
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ty !== null && ty >= 0 && ty <= height && <line x1={0} x2={width} y1={ty} y2={ty} stroke="#f2a93b" strokeOpacity="0.5" strokeDasharray="2 3" />}
      <path d={a} fill={`url(#g${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />}
    </svg>
  );
}
