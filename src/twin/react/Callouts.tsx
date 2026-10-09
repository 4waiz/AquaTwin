"use client";
/**
 * Minimal floating callouts (01 Intake … 06 Brine). Positions are written
 * directly to the DOM from the per-frame anchor bus, so tracking the 3D model
 * never triggers React renders. Content (one key value each) updates at the
 * telemetry rate.
 */
import { useEffect, useRef } from "react";
import type { AssetId } from "@/sim/scenarios";
import { anchorBus } from "./viewportStore";
import { useUi } from "@/state/ui";

export interface CalloutItem {
  id: AssetId;
  index: string;
  label: string;
  value?: string;
  tone?: "ok" | "warn" | "crit";
}

/** Label offset from its anchor, in px (keeps labels from colliding). */
const OFFSET: Partial<Record<AssetId, [number, number]>> = {
  intake: [-18, -54],
  pretreatment: [-10, -62],
  pumps: [-24, 58],
  ro2: [20, -70],
  product: [16, -58],
  brine: [26, 44],
};

export function Callouts({ items, compact = false }: { items: CalloutItem[]; compact?: boolean }) {
  const refs = useRef(new Map<AssetId, HTMLDivElement>());
  const hostRef = useRef<HTMLDivElement>(null);
  const select = useUi((s) => s.select);
  const selected = useUi((s) => s.selected);
  const introPhase = useUi((s) => s.introPhase);

  useEffect(
    () =>
      anchorBus.subscribe((anchors) => {
        const host = hostRef.current;
        const W = host?.clientWidth ?? 0;
        const H = host?.clientHeight ?? 0;
        // Small viewports show the label only (the value is one click away in the inspector).
        if (host) host.dataset.small = H < 440 || W < 720 ? "1" : "0";
        const clampX = (x: number, w: number) => Math.min(Math.max(x, 12 + w / 2), W - 12 - w / 2);
        const clampY = (y: number, h: number) => Math.min(Math.max(y, 12 + h / 2), H - 12 - h / 2);
        const boxes = [];
        for (const a of anchors) {
          const el = refs.current.get(a.id);
          if (!el) continue;
          const [dx0, dy0] = OFFSET[a.id] ?? [0, -50];
          const label = el.querySelector<HTMLElement>("[data-label]");
          const line = el.querySelector<SVGLineElement>("line");
          const lw = label?.offsetWidth ?? 150;
          const lh = label?.offsetHeight ?? 40;
          // Keep the label fully inside the viewport (12 px margin); the leader follows it.
          boxes.push({ a, el, label, line, lw, lh, cx: clampX(a.x + dx0, lw), cy: clampY(a.y + dy0, lh) });
        }
        // Separate overlapping labels (a few relaxation passes along the axis of least overlap).
        for (let pass = 0; pass < 6; pass++) {
          let moved = false;
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const p = boxes[i];
              const q = boxes[j];
              if (!p.a.visible || !q.a.visible) continue;
              const ox = (p.lw + q.lw) / 2 + 8 - Math.abs(p.cx - q.cx);
              const oy = (p.lh + q.lh) / 2 + 6 - Math.abs(p.cy - q.cy);
              if (ox <= 0 || oy <= 0) continue;
              moved = true;
              if (oy <= ox) {
                const s = (p.cy <= q.cy ? -1 : 1) * (oy / 2);
                p.cy = clampY(p.cy + s, p.lh);
                q.cy = clampY(q.cy - s, q.lh);
              } else {
                const s = (p.cx <= q.cx ? -1 : 1) * (ox / 2);
                p.cx = clampX(p.cx + s, p.lw);
                q.cx = clampX(q.cx - s, q.lw);
              }
            }
          if (!moved) break;
        }
        for (const { a, el, label, line, lh, cx, cy } of boxes) {
          const dx = cx - a.x;
          const dy = cy - a.y;
          el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
          el.style.opacity = a.visible ? "" : "0";
          if (label) label.style.transform = `translate(calc(${dx}px - 50%), calc(${dy}px - 50%))`;
          if (line) {
            const len = Math.hypot(dx, dy) || 1;
            const stop = Math.max(0, len - Math.min(lh * 0.5, len));
            line.setAttribute("x2", String((dx / len) * stop));
            line.setAttribute("y2", String((dy / len) * stop));
          }
        }
      }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className={`group/callouts pointer-events-none absolute inset-0 z-[2] transition-opacity duration-700 max-md:hidden ${introPhase !== "done" ? "opacity-0" : "opacity-100"}`}
      aria-hidden={false}
    >
      {items.map((it) => {
        const [dx, dy] = OFFSET[it.id] ?? [0, -50];
        const isSel = selected === it.id || (it.id === "ro2" && (selected === "ro1" || selected === "ro3"));
        const toneDot = it.tone === "warn" ? "bg-warn" : it.tone === "crit" ? "bg-crit" : "bg-accent";
        return (
          <div
            key={it.id}
            ref={(el) => {
              if (el) refs.current.set(it.id, el);
              else refs.current.delete(it.id);
            }}
            className="absolute left-0 top-0 will-change-transform"
            style={{ transform: "translate3d(-999px,-999px,0)" }}
          >
            {/* anchor dot + leader */}
            <span className={`absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full ${toneDot} shadow-[0_0_0_3px_rgba(7,10,15,0.8)]`} />
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
              <line x1="0" y1="0" x2={dx} y2={dy + (dy < 0 ? 14 : -14)} stroke="rgba(162,172,186,0.35)" strokeWidth="1" />
            </svg>
            <button
              type="button"
              data-label
              onClick={() => select(it.id)}
              title={it.value ? `${it.label}: ${it.value}` : it.label}
              className={`pointer-events-auto absolute whitespace-nowrap rounded-md border px-2 py-1 text-left backdrop-blur-sm transition-colors ${
                isSel ? "border-accent/60 bg-[#0d1522]" : "border-line-strong bg-ink-900/90 hover:border-line-bright"
              }`}
              style={{ transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%))` }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-accent">{it.index}</span>
                <span className={`font-medium text-fg ${compact ? "text-[11px]" : "text-[11.5px]"}`}>{it.label}</span>
              </div>
              {it.value && <div className="num text-[10.5px] text-fg-muted group-data-[small=1]/callouts:hidden">{it.value}</div>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
