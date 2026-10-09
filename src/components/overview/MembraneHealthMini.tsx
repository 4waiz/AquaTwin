"use client";
import Link from "next/link";
import { Panel, Provenance } from "@/components/ui/primitives";
import { useLive } from "@/state/live";
import { LIMITS } from "@/sim/config";
import { cleaningStatus } from "@/sim/cleaning";
import { fmt, fmtHours } from "@/lib/format";
import { IconChevron } from "@/components/icons";

/** Normalised permeate flow bar: 80–100 % scale with the cleaning threshold marked. */
export function HealthBar({ value, tone }: { value: number; tone: "ok" | "warn" | "crit" }) {
  const lo = 0.8;
  const pct = Math.min(1, Math.max(0, (value - lo) / (1 - lo)));
  const thr = (LIMITS.cipHealthThreshold - lo) / (1 - lo);
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-crit";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-ink-700">
      <div className={`absolute left-0 top-0 h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${pct * 100}%` }} />
      <div className="absolute -top-1 h-3.5 w-px bg-fg-subtle" style={{ left: `${thr * 100}%` }} title="Cleaning threshold (NPF −10 %)" />
    </div>
  );
}

/** Amber when any cleaning criterion is met or approaching, or the flow criterion is projected within 3 days. */
export function trainToneOf(npf: number, hours: number | null, nsp = 1, ndp = 1): "ok" | "warn" | "crit" {
  const c = cleaningStatus(npf, nsp, ndp, hours);
  return c.due || c.approaching || npf < 0.93 ? "warn" : "ok";
}

export function MembraneHealthMini() {
  const snap = useLive((s) => s.snapshot);
  const rows = snap?.health.map((h, i) => {
    const tr = snap.healthTrend[i];
    const tone = trainToneOf(h.npf, tr.hours, h.nsp, h.ndp);
    const c = cleaningStatus(h.npf, h.nsp, h.ndp, tr.hours);
    const flow = tr.hours !== null && tr.hours <= 24 * 14 ? `flow criterion in ${fmtHours(tr.hours)}` : null;
    const outlook = c.due
      ? [`cleaning due (${c.reasons[0]})`, flow].filter(Boolean).join(" · ")
      : (flow ?? (tr.slopePctPerHour < -0.005 ? "declining slowly" : "stable"));
    return { i, npf: h.npf, tone, outlook, slope: tr.slopePctPerHour, due: c.due };
  });
  const anyWarn = rows?.some((r) => r.tone !== "ok");
  const dueTrains = (rows ?? []).filter((r) => r.due).map((r) => r.i + 1);
  return (
    <Panel title="Membrane health" dense className="shrink-0" right={<Provenance kind="estimated" />} reveal="panel2" bodyClassName="flex flex-col px-3 py-2">
      <div className="flex-1 space-y-1.5">
        {(rows ?? [0, 1, 2].map((i) => ({ i, npf: NaN, tone: "ok" as const, outlook: "–", slope: 0, due: false }))).map((r) => (
          <div key={r.i} className="grid grid-cols-[52px_50px_1fr] items-center gap-2.5" title={r.outlook}>
            <span className="text-[12px] text-fg-muted">Train {r.i + 1}</span>
            <span className={`num text-[13.5px] font-medium ${r.tone === "ok" ? "text-ok" : "text-warn"}`}>{fmt(r.npf * 100, 1)}%</span>
            <div className="min-w-0">
              <HealthBar value={Number.isFinite(r.npf) ? r.npf : 0.8} tone={r.tone} />
              <div className="mt-0.5 truncate text-[10px] text-fg-subtle">{r.outlook}</div>
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/membranes"
        className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-line bg-ink-900 px-2.5 py-1 text-[11.5px] transition-colors hover:border-line-strong"
        title="Normalised permeate flow vs the post-clean baseline"
      >
        <span className="truncate text-fg-muted">
          {dueTrains.length
            ? `Train ${dueTrains.join(", ")}: cleaning criteria met`
            : anyWarn
              ? `Train ${(rows ?? [])
                  .filter((r) => r.tone !== "ok")
                  .map((r) => r.i + 1)
                  .join(", ")}: fouling trend under watch`
              : "All trains within normal range"}
        </span>
        <IconChevron size={13} className="shrink-0 text-fg-subtle" />
      </Link>
    </Panel>
  );
}
