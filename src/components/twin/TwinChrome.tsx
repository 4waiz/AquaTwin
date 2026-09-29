"use client";
/** Small overlay controls shared by pages that show the 3D twin. */
import { IconReset, IconShield } from "@/components/icons";
import { useUi } from "@/state/ui";
import { useLive } from "@/state/live";
import { fmt } from "@/lib/format";

export function ResetViewButton() {
  const reset = useUi((s) => s.resetCamera);
  return (
    <button
      onClick={reset}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-ink-900/90 px-2.5 text-[11.5px] text-fg-muted transition-colors hover:border-line-bright hover:text-fg"
      title="Reset camera"
    >
      <IconReset size={13} />
      Reset view
    </button>
  );
}

export function FlowLegend() {
  const item = (color: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-ink-900/90 px-2.5 py-1.5 text-[10.5px] text-fg-subtle">
      {item("#1f5bb0", "Seawater / HP feed")}
      {item("#4aa0e6", "Permeate")}
      {item("#173c63", "Brine")}
    </div>
  );
}

export function GuardStrip() {
  const snap = useLive((s) => s.snapshot);
  if (!snap) return null;
  const rules = snap.guard.rules.filter((r) => r.id !== "confidence");
  const pass = rules.filter((r) => r.status !== "fail").length;
  const warn = rules.filter((r) => r.status === "warn").length;
  const allOk = pass === rules.length;
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-ink-900/90 px-3 py-1.5 text-[11.5px] max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
      <IconShield size={14} className={allOk ? "text-ok" : "text-crit"} />
      <span className="text-fg-muted">
        AquaGuard{" "}
        <span className="num text-fg">
          {pass}/{rules.length}
        </span>{" "}
        constraints satisfied
        {warn > 0 && <span className="text-warn"> · {warn} near limit</span>}
      </span>
      <span className="h-3 w-px bg-line max-lg:hidden" />
      <ConfidenceText />
    </div>
  );
}

/**
 * Honest model-confidence readout: whether current inputs sit inside the
 * validated training envelope (OOD check) and the width of the 90 %
 * prediction interval on production (split conformal).
 */
export function ConfidenceText() {
  const snap = useLive((s) => s.snapshot);
  if (!snap) return null;
  const inEnvelope = snap.confidence >= 0.999;
  const low = snap.confidence < 0.5;
  const q = snap.hybrid.find((h) => h.margins)?.margins?.Q;
  return (
    <span className="text-fg-muted" title="Out-of-distribution check on model inputs; interval = split-conformal 90 % half-width for permeate flow.">
      {low ? (
        <span className="text-warn">Outside validated envelope</span>
      ) : inEnvelope ? (
        "Inputs within validated envelope"
      ) : (
        <span className="text-warn">Near envelope edge</span>
      )}
      {q !== undefined && <span className="num text-fg-subtle"> · 90% PI ±{fmt(q * 100, 1)}%</span>}
    </span>
  );
}
