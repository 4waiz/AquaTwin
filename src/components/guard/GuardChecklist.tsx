"use client";
/** AquaGuard rule-by-rule result for one strategy. */
import type { GuardDecision } from "@/sim/aquaguard";
import { fmt } from "@/lib/format";
import { IconShield } from "@/components/icons";

const STATUS = {
  pass: { dot: "bg-ok", text: "text-fg-muted" },
  warn: { dot: "bg-warn", text: "text-warn" },
  fail: { dot: "bg-crit", text: "text-crit" },
} as const;

export function VerdictBanner({ verdict, reasons, relaxed }: { verdict: GuardDecision["verdict"]; reasons?: string[]; relaxed?: boolean }) {
  const cfg =
    verdict === "APPROVED"
      ? {
          cls: "border-ok/30 bg-ok-soft/50 text-ok",
          title: "RECOMMENDATION APPROVED",
          sub: "Every AquaGuard constraint is satisfied at the edge of the 90 % prediction interval.",
        }
      : verdict === "WITHHELD"
        ? {
            cls: "border-warn/40 bg-warn-soft/60 text-warn",
            title: "LOW MODEL CONFIDENCE · RECOMMENDATION WITHHELD",
            sub: "Inputs are outside the validated envelope. Operator review required.",
          }
        : { cls: "border-crit/40 bg-crit-soft/60 text-crit", title: "RECOMMENDATION REJECTED", sub: "At least one hard constraint is violated." };
  return (
    <div className={`rounded-md border px-3 py-2.5 ${cfg.cls}`}>
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em]">
        <IconShield size={14} />
        {cfg.title}
      </div>
      <div className="mt-1 text-[12px] text-fg-muted">{relaxed ? "Minimum production cannot be met safely — maximum safe production selected." : cfg.sub}</div>
      {reasons && reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[12px] text-fg">
          {reasons.slice(0, 4).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GuardChecklist({ guard }: { guard: GuardDecision }) {
  return (
    <div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] text-fg-subtle">
            <th className="pb-1.5 font-normal">Constraint</th>
            <th className="pb-1.5 text-right font-normal">{guard.uncertaintyAware ? "Value at 90% bound" : "Value"}</th>
            <th className="pb-1.5 text-right font-normal">Limit</th>
            <th className="pb-1.5 pl-2 font-normal">Scope</th>
          </tr>
        </thead>
        <tbody>
          {guard.rules.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1.5">
                <span className="inline-flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS[r.status].dot}`} />
                  <span className={r.status === "pass" ? "text-fg-muted" : STATUS[r.status].text}>{r.label}</span>
                </span>
              </td>
              <td className={`num py-1.5 text-right ${r.status === "fail" ? "text-crit" : "text-fg"}`}>
                {fmt(r.value, Math.abs(r.limit) >= 100 ? 0 : 1)} <span className="text-[10.5px] text-fg-subtle">{r.unit}</span>
              </td>
              <td className="num py-1.5 text-right text-fg-subtle">
                {r.cmp} {fmt(r.limit, Math.abs(r.limit) >= 100 ? 0 : 1)}
              </td>
              <td className="py-1.5 pl-2 text-[11px] text-fg-subtle">{r.scope}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
