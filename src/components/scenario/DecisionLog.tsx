"use client";
/** AquaTwin's decisions for the forecast: hourly, plus re-plans triggered by the feed trend (verdict + chosen setpoints). */
import type { ScenarioBranch } from "@/runtime/protocol";
import { FOCUS_LABEL } from "@/sim/optimizer";
import { fmt, fmtInt, fmtOffset } from "@/lib/format";

const VERDICT_CLS: Record<string, string> = {
  APPROVED: "text-ok border-ok/30",
  REJECTED: "text-crit border-crit/40",
  WITHHELD: "text-warn border-warn/40",
  HOLD: "text-fg-subtle border-line",
};

export function DecisionLog({ branch, cursor, onSeek }: { branch: ScenarioBranch; cursor: number; onSeek: (t: number) => void }) {
  const decisions = branch.decisions;
  return (
    <div className="scroll-quiet max-h-full overflow-y-auto pr-1">
      <table className="w-full text-[11.5px]">
        <thead className="sticky top-0 bg-ink-850">
          <tr className="text-left text-fg-subtle">
            <th className="pb-1.5 font-normal">Time</th>
            <th className="pb-1.5 font-normal">AquaGuard</th>
            <th className="pb-1.5 text-right font-normal">Pressure</th>
            <th className="pb-1.5 text-right font-normal">Feed / vessel</th>
            <th className="pb-1.5 pl-3 font-normal">Allocation</th>
            <th className="pb-1.5 text-right font-normal">Target</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d, i) => {
            const next = decisions[i + 1]?.t ?? d.t + 1;
            const active = cursor >= d.t && cursor < next;
            return (
              <tr
                key={d.t}
                onClick={() => onSeek(d.t)}
                className={`cursor-pointer border-t border-line transition-colors ${active ? "bg-accent-soft/40" : "hover:bg-ink-800"}`}
              >
                <td className="num py-1.5 font-mono whitespace-nowrap text-fg-muted">
                  {fmtOffset(d.t)}
                  {d.trigger === "outlook" && (
                    <span className="ml-1 font-sans text-[9.5px] text-accent" title="Unscheduled re-plan: the current setpoints would break a limit if the feed trend continued">
                      re-plan
                    </span>
                  )}
                </td>
                <td className="py-1.5">
                  <span className={`rounded border px-1.5 py-px font-mono text-[9.5px] ${VERDICT_CLS[d.verdict] ?? VERDICT_CLS.HOLD}`}>{d.verdict}</span>
                </td>
                <td className="num py-1.5 text-right text-fg">{d.chosen ? `${fmt(d.chosen.P, 1)} bar` : "hold"}</td>
                <td className="num py-1.5 text-right text-fg">{d.chosen ? `${fmt(d.chosen.Qv, 1)} m³/h` : "—"}</td>
                <td className="py-1.5 pl-3 text-fg-muted">
                  {d.chosen
                    ? d.chosen.focusMode === "normal"
                      ? "All trains equal"
                      : `${FOCUS_LABEL[d.chosen.focusMode].replace("Focus train", `T${(d.focusTrain ?? 0) + 1}`)}`
                    : "—"}
                </td>
                <td className="num py-1.5 text-right text-fg-subtle">{fmtInt(d.plan.target_m3h)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
