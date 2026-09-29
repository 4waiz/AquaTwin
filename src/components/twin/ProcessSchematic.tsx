"use client";
/**
 * 2D process flow: SEAWATER → PRETREATMENT → HIGH PRESSURE → RO → PERMEATE,
 * with RO → BRINE. Clickable; mirrors the 3D selection. Also the fallback
 * view when WebGL is unavailable.
 */
import type { AssetId } from "@/sim/scenarios";
import { useUi } from "@/state/ui";

interface Node {
  id: AssetId;
  label: string;
  sub: string;
  x: number;
  y: number;
}

const NODES: Node[] = [
  { id: "intake", label: "Seawater", sub: "Intake", x: 40, y: 60 },
  { id: "pretreatment", label: "Pretreatment", sub: "DAF + filtration", x: 210, y: 60 },
  { id: "pumps", label: "High pressure", sub: "HP pumps + ERD", x: 380, y: 60 },
  { id: "ro2", label: "Reverse osmosis", sub: "3 trains", x: 550, y: 60 },
  { id: "product", label: "Permeate", sub: "Product water", x: 720, y: 30 },
  { id: "brine", label: "Brine", sub: "Outfall", x: 720, y: 100 },
];

export function ProcessSchematic({ values, compact = false }: { values?: Partial<Record<AssetId, string>>; compact?: boolean }) {
  const selected = useUi((s) => s.selected);
  const select = useUi((s) => s.select);
  const isSel = (id: AssetId) => selected === id || (id === "ro2" && (selected === "ro1" || selected === "ro3"));
  const W = 150;
  const H = compact ? 44 : 50;
  return (
    <svg viewBox="0 0 880 150" className="h-full w-full" role="img" aria-label="Process flow diagram">
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 8 4 0 8z" fill="#3a9be0" />
        </marker>
      </defs>
      {/* flow lines */}
      {[
        [40 + W, 60, 210, 60],
        [210 + W, 60, 380, 60],
        [380 + W, 60, 550, 60],
      ].map(([x1, y1, x2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2 - 4} y2={y1} stroke="#3a9be0" strokeWidth="1.5" markerEnd="url(#arrow)" />
      ))}
      <path d={`M${550 + W} 60 H ${700} V 30 H 716`} fill="none" stroke="#6ec9ff" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <path d={`M${550 + W} 60 H ${700} V 100 H 716`} fill="none" stroke="#2c5f86" strokeWidth="1.5" markerEnd="url(#arrow)" />
      {NODES.map((n) => {
        const sel = isSel(n.id);
        const y = n.y - H / 2;
        return (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => select(n.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(n.id)}
            className="cursor-pointer outline-none"
          >
            <rect x={n.x} y={y} width={W} height={H} rx="7" fill={sel ? "#0f1a2b" : "#0b0f15"} stroke={sel ? "#5b9dff" : "#263041"} strokeWidth={sel ? 1.4 : 1} />
            <text x={n.x + 12} y={y + 20} fill="#e8edf4" fontSize="12.5" fontWeight={500} fontFamily="var(--font-sans)">
              {n.label}
            </text>
            <text x={n.x + 12} y={y + 36} fill="#8a94a4" fontSize="10.5" fontFamily="var(--font-mono)">
              {values?.[n.id] ?? n.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
