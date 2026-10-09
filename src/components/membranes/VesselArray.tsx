"use client";
/**
 * Schematic of one RO train: 3 × 4 pressure vessels, 7 elements each.
 * Element shading shows the INFERRED location of fouling from the symptom
 * pattern (lead-end ΔP rise → biofouling/particulate at the feed end;
 * salt-passage rise without ΔP → scaling at the tail). It is an inference
 * from normalised indicators, not an element-level measurement.
 */
export function VesselArray({ health, ndp, nsp, tone }: { health: number; ndp: number; nsp: number; tone: "ok" | "warn" | "crit" }) {
  const cols = 3;
  const rows = 4;
  const loss = Math.max(0, 1 - health);
  const leadWeight = Math.min(1, Math.max(0, (ndp - 1) / 0.35));
  const tailWeight = Math.min(1, Math.max(0, (nsp - 1) / 0.12 - leadWeight * 0.5));
  // Inferred fouling is never drawn in the "healthy" colour.
  const accent = tone === "crit" ? "var(--color-crit)" : "var(--color-warn)";
  const W = 300;
  const H = 128;
  const vw = W - 36;
  const vh = 16;
  const shade = (e: number) => {
    // e: element index 0 (lead) … 6 (tail)
    const lead = Math.exp(-e / 1.8) * leadWeight;
    const tail = Math.exp(-(6 - e) / 1.8) * tailWeight;
    return Math.min(1, (lead + tail) * loss * 9);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Pressure vessel array with inferred fouling location">
      <text x={0} y={9} fontSize={8.5} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
        FEED
      </text>
      <text x={W - 36} y={9} fontSize={8.5} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
        BRINE / PERMEATE
      </text>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const y = 16 + r * (vh + 12) + c * 3;
          const x = 14 + c * 4;
          return (
            <g key={`${r}-${c}`} transform={`translate(${x},${y})`} opacity={1 - c * 0.22}>
              <rect width={vw} height={vh} rx={vh / 2} fill="var(--color-ink-700)" stroke="var(--color-line-strong)" strokeWidth={0.8} />
              {Array.from({ length: 7 }).map((___, e) => {
                const ew = (vw - 10) / 7;
                const s = shade(e);
                return (
                  <rect
                    key={e}
                    x={5 + e * ew + 0.8}
                    y={3}
                    width={ew - 1.6}
                    height={vh - 6}
                    rx={2}
                    fill={s > 0.04 ? accent : "var(--color-fg-faint)"}
                    opacity={s > 0.04 ? 0.25 + 0.65 * s : 0.35}
                  />
                );
              })}
              <rect x={-3} y={2} width={4} height={vh - 4} rx={1} fill="var(--color-line-bright)" />
              <rect x={vw - 1} y={2} width={4} height={vh - 4} rx={1} fill="var(--color-line-bright)" />
            </g>
          );
        }),
      )}
    </svg>
  );
}
