"use client";
import { IconClose } from "@/components/icons";
import { Provenance } from "@/components/ui/primitives";
import type { InspectorData } from "./assetData";

export function AssetInspector({ data, onClose, provenance = "simulated" }: { data: InspectorData; onClose: () => void; provenance?: "simulated" | "estimated" }) {
  const toneText = data.tone === "ok" ? "text-ok" : data.tone === "warn" ? "text-warn" : "text-crit";
  const toneDot = data.tone === "ok" ? "bg-ok" : data.tone === "warn" ? "bg-warn" : "bg-crit";
  return (
    <div className="w-[272px] rounded-[10px] border border-line-strong bg-ink-900/95 shadow-[0_12px_40px_rgba(0,0,0,0.45)]" role="dialog" aria-label={data.title}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          {data.index && <div className="label">{data.index}</div>}
          <div className="mt-0.5 text-[14px] font-semibold text-fg">{data.title}</div>
          <div className={`mt-1 flex items-center gap-1.5 text-[11.5px] ${toneText}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${toneDot}`} />
            {data.state}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-ink-700 hover:text-fg" aria-label="Close inspector">
          <IconClose size={14} />
        </button>
      </div>
      <div className="px-4 py-2">
        {data.rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-3 py-[5px] text-[12px]">
            <span className="text-fg-muted">{r.k}</span>
            <span className={`num ${r.tone === "warn" ? "text-warn" : r.tone === "crit" ? "text-crit" : "text-fg"}`}>
              {r.v}
              {r.unit && <span className="ml-1 text-[10.5px] text-fg-subtle">{r.unit}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2">
        <span className="text-[10.5px] text-fg-subtle">Simulated plant telemetry</span>
        <Provenance kind={provenance} />
      </div>
    </div>
  );
}
