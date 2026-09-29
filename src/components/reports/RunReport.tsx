"use client";
/**
 * One Scenario Lab run as a self-contained report: scenario, initial state,
 * predicted impact (no action vs AquaTwin), recommended response, AquaGuard
 * checks, confidence and final state. Rendered in the dark interface and,
 * with tone="light", as the printable A4 document behind "Export PDF".
 */
import type { ReactNode } from "react";
import type { RunRecord, BranchSummary } from "@/state/runs";
import { fmt, fmtHours, fmtInt, fmtOffset, fmtSigned, hourOfDay } from "@/lib/format";
import { HACKATHON, TEAM_NAME, TEAM_URL } from "@/lib/brand";

type Tone = "dark" | "light";

const T = {
  dark: {
    h2: "text-[12px] font-medium uppercase tracking-[0.08em] text-fg-subtle",
    body: "text-fg-muted",
    strong: "text-fg",
    faint: "text-fg-subtle",
    rule: "border-line",
    head: "text-fg-subtle",
    ok: "text-ok",
    warn: "text-warn",
    crit: "text-crit",
    accent: "text-accent",
    box: "rounded-md border border-line bg-ink-900",
  },
  light: {
    h2: "text-[10.5pt] font-semibold uppercase tracking-[0.06em] text-[#3a4658]",
    body: "text-[#2a3444]",
    strong: "text-[#0b1220]",
    faint: "text-[#5b6677]",
    rule: "border-[#d5dbe4]",
    head: "text-[#5b6677]",
    ok: "text-[#127a4f]",
    warn: "text-[#9a5d00]",
    crit: "text-[#b3261e]",
    accent: "text-[#1f5fbf]",
    box: "rounded border border-[#d5dbe4] bg-[#f6f8fb]",
  },
} as const;

function Section({ n, title, tone, children }: { n: number; title: string; tone: Tone; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className={T[tone].h2}>
        {n}. {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function verdictCounts(r: RunRecord) {
  const c = { APPROVED: 0, REJECTED: 0, WITHHELD: 0 } as Record<string, number>;
  for (const d of r.decisions) c[d.verdict] = (c[d.verdict] ?? 0) + 1;
  return c;
}

export function outcomeLine(r: RunRecord): string {
  const n = r.noAction;
  const a = r.aquatwin;
  if (n.violationHours > 0 && a.violationHours === 0)
    return `No action violates constraints for ${fmt(n.violationHours, 1)} h; AquaTwin's plan keeps every constraint (SEC ${fmtSigned(((a.sec - n.sec) / n.sec) * 100, 1, "%")}).`;
  if (n.violationHours > 0) return `No action: ${fmt(n.violationHours, 1)} h of violations; AquaTwin: ${fmt(a.violationHours, 1)} h.`;
  if (a.violationHours > 0) return `AquaTwin's plan has ${fmt(a.violationHours, 1)} h of violations — see decisions.`;
  return `No constraint violations in either branch; SEC ${fmt(n.sec, 3)} → ${fmt(a.sec, 3)} kWh/m³.`;
}

export function RunReport({ r, tone = "dark" }: { r: RunRecord; tone?: Tone }) {
  const s = T[tone];
  const counts = verdictCounts(r);
  const conf = r.decisions.map((d) => d.confidence);
  const minConf = conf.length ? Math.min(...conf) : null;
  const meanConf = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null;
  const firstAction = r.decisions.find((d) => d.verdict === "APPROVED");

  const rows: { k: string; unit: string; f: (b: BranchSummary) => string; better?: "lower" | "higher"; get?: (b: BranchSummary) => number }[] = [
    { k: "Water produced (24 h)", unit: "m³", f: (b) => fmtInt(b.production_m3), better: "higher", get: (b) => b.production_m3 },
    { k: "Energy (24 h)", unit: "MWh", f: (b) => fmt(b.energy_MWh, 1), better: "lower", get: (b) => b.energy_MWh },
    { k: "Specific energy", unit: "kWh/m³", f: (b) => fmt(b.sec, 3), better: "lower", get: (b) => b.sec },
    { k: "Peak permeate TDS", unit: "mg/L", f: (b) => fmtInt(b.maxTds), better: "lower", get: (b) => b.maxTds },
    { k: "Lowest product storage", unit: "%", f: (b) => fmt(b.minReservoir, 1), better: "higher", get: (b) => b.minReservoir },
    { k: "Constraint violations", unit: "h", f: (b) => fmt(b.violationHours, 1), better: "lower", get: (b) => b.violationHours },
    { k: "First violation", unit: "", f: (b) => (b.firstViolation === null ? "none" : `+${fmtHours(b.firstViolation)}`) },
    {
      k: "Cleaning threshold reached",
      unit: "",
      f: (b) =>
        b.cipCrossing.some((x) => x !== null)
          ? b.cipCrossing
              .map((x, i) => (x === null ? null : `T${i + 1} +${fmtHours(x)}`))
              .filter(Boolean)
              .join(", ")
          : "not within 24 h",
    },
  ];

  return (
    <article className={`space-y-6 text-[12.5px] leading-relaxed ${s.body}`}>
      {tone === "light" && (
        <header className={`border-b pb-4 ${s.rule}`}>
          <div className={`text-[9pt] uppercase tracking-[0.12em] ${s.faint}`}>AquaTwin · scenario run report</div>
          <h1 className={`mt-1 text-[20pt] font-semibold leading-tight ${s.strong}`}>{r.scenarioName}</h1>
          <div className={`mt-1 text-[10pt] ${s.faint}`}>
            Generated {new Date().toLocaleString("en-GB")} · run {new Date(r.createdAt).toLocaleString("en-GB")} · simulated start {hourOfDay(r.startClock_h)}
          </div>
          <p className={`mt-3 text-[9.5pt] ${s.faint}`}>
            All values are simulated with the AquaTwin prototype (hybrid physics + ML twin run forward 24 h). They are model forecasts, not plant measurements, and carry
            the model&apos;s uncertainty. Prepared by{" "}
            <a href={TEAM_URL} className={s.accent}>
              {TEAM_NAME}
            </a>{" "}
            for the {HACKATHON}.
          </p>
        </header>
      )}

      <Section n={1} title="Scenario" tone={tone}>
        <p className={s.strong}>{r.disturbance}</p>
        <p className="mt-1">Represents: {r.represents}</p>
      </Section>

      <Section n={2} title="Initial state" tone={tone}>
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 max-sm:grid-cols-2">
          {[
            ["Production", `${fmtInt(r.initial.production)} m³/h`],
            ["Permeate TDS", `${fmtInt(r.initial.tds)} mg/L`],
            ["Specific energy", `${fmt(r.initial.sec, 2)} kWh/m³`],
            ["Product storage", `${fmt(r.initial.reservoir, 1)}%`],
            ["Feed salinity", `${fmt(r.initial.salinity, 1)} g/L`],
            ["Seawater temperature", `${fmt(r.initial.temperature, 1)} °C`],
            ["Membrane health (NPF)", r.initial.health.map((h, i) => `T${i + 1} ${fmt(h * 100, 1)}%`).join(" · ")],
          ].map(([k, v]) => (
            <div key={k} className={k.startsWith("Membrane") ? "col-span-2" : ""}>
              <div className={`text-[11px] ${s.faint}`}>{k}</div>
              <div className={`num ${s.strong}`}>{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={3} title="Predicted impact · 24 h forecast" tone={tone}>
        <table className="w-full">
          <thead>
            <tr className={`text-left text-[11px] ${s.head}`}>
              <th className="pb-1.5 font-normal">Metric</th>
              <th className="pb-1.5 text-right font-normal">No action</th>
              <th className={`pb-1.5 text-right font-normal ${s.accent}`}>AquaTwin response</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const nv = row.get?.(r.noAction);
              const av = row.get?.(r.aquatwin);
              const better = nv !== undefined && av !== undefined && Math.abs(nv - av) > 1e-6 ? (row.better === "lower" ? av < nv : av > nv) : null;
              return (
                <tr key={row.k} className={`border-t ${s.rule}`}>
                  <td className="py-1.5">
                    {row.k} {row.unit && <span className={`text-[10.5px] ${s.faint}`}>{row.unit}</span>}
                  </td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{row.f(r.noAction)}</td>
                  <td className={`num py-1.5 text-right ${better === null ? s.strong : better ? s.ok : s.warn}`}>{row.f(r.aquatwin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {r.noAction.violations.length > 0 && (
          <p className="mt-2">
            <span className={s.crit}>No action violates:</span> {r.noAction.violations.join(" · ")}
          </p>
        )}
        {r.aquatwin.violations.length > 0 && (
          <p className="mt-1">
            <span className={s.warn}>AquaTwin response still violates:</span> {r.aquatwin.violations.join(" · ")}
          </p>
        )}
      </Section>

      <Section n={4} title="Recommended response" tone={tone}>
        {firstAction ? (
          <p>
            First approved action at {fmtOffset(firstAction.t)}: <span className={`num ${s.strong}`}>{firstAction.action}</span>. AquaTwin re-optimises hourly, and
            re-plans in between when the feed trend would take the current setpoints past a limit; the full decision log follows.
          </p>
        ) : (
          <p className={s.warn}>No action was approved in this run — AquaGuard rejected or withheld every candidate strategy.</p>
        )}
        <table className="mt-2 w-full">
          <thead>
            <tr className={`text-left text-[11px] ${s.head}`}>
              <th className="w-16 pb-1 font-normal">Time</th>
              <th className="w-24 pb-1 font-normal">AquaGuard</th>
              <th className="pb-1 font-normal">Action / reason</th>
              <th className="w-20 pb-1 text-right font-normal">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {r.decisions.map((d) => (
              <tr key={d.t} className={`border-t align-top ${s.rule}`}>
                <td className="num py-1 whitespace-nowrap">
                  {fmtOffset(d.t)}
                  {d.trigger === "outlook" && <span className={`ml-1 text-[10px] ${s.head}`}>re-plan</span>}
                </td>
                <td className={`py-1 font-mono text-[10.5px] tracking-wider ${d.verdict === "APPROVED" ? s.ok : d.verdict === "WITHHELD" ? s.warn : s.crit}`}>
                  {d.verdict}
                </td>
                <td className="py-1">{d.action}</td>
                <td className="num py-1 text-right">{fmt(d.confidence * 100, 0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section n={5} title="Constraint checks and confidence" tone={tone}>
        <div className="grid grid-cols-4 gap-x-6 max-sm:grid-cols-2 max-sm:gap-y-2">
          <div>
            <div className={`text-[11px] ${s.faint}`}>Approved</div>
            <div className={`num ${s.ok}`}>{counts.APPROVED}</div>
          </div>
          <div>
            <div className={`text-[11px] ${s.faint}`}>Rejected</div>
            <div className={`num ${counts.REJECTED ? s.crit : s.strong}`}>{counts.REJECTED}</div>
          </div>
          <div>
            <div className={`text-[11px] ${s.faint}`}>Withheld (low confidence)</div>
            <div className={`num ${counts.WITHHELD ? s.warn : s.strong}`}>{counts.WITHHELD}</div>
          </div>
          <div>
            <div className={`text-[11px] ${s.faint}`}>Model confidence (min / mean)</div>
            <div className={`num ${s.strong}`}>
              {fmt(minConf === null ? null : minConf * 100, 0)}% / {fmt(meanConf === null ? null : meanConf * 100, 0)}%
            </div>
          </div>
        </div>
        <p className={`mt-2 text-[11.5px] ${s.faint}`}>
          Every candidate is checked against hard limits (permeate TDS, feed pressure, recovery, flux, concentrate flow, vessel ΔP, storage, power cap) at the edge of its
          90% prediction interval. Recommendations are withheld when inputs leave the model&apos;s validated envelope.
        </p>
      </Section>

      <Section n={6} title="Final state at +24 h" tone={tone}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className={`text-left text-[11px] ${s.head}`}>
                <th className="pb-1.5 font-normal" />
                <th className="pb-1.5 text-right font-normal">Production</th>
                <th className="pb-1.5 text-right font-normal">Permeate TDS</th>
                <th className="pb-1.5 text-right font-normal">SEC</th>
                <th className="pb-1.5 text-right font-normal">Storage</th>
                <th className="pb-1.5 text-right font-normal">Membrane health</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["No action", r.noAction],
                  ["AquaTwin", r.aquatwin],
                ] as const
              ).map(([k, b]) => (
                <tr key={k} className={`border-t ${s.rule}`}>
                  <td className="py-1.5">{k}</td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{fmtInt(b.final.production)} m³/h</td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{fmtInt(b.final.tds)} mg/L</td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{fmt(b.final.sec, 2)}</td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{fmt(b.final.reservoir, 1)}%</td>
                  <td className={`num py-1.5 text-right ${s.strong}`}>{b.final.health.map((h) => fmt(h * 100, 1)).join(" · ")}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className={`border-t pt-3 text-[11px] ${s.rule} ${s.faint}`}>
        Method: the calibrated hybrid twin (reduced-order solution–diffusion model + gradient-boosted residual) is run forward from the live state, once with setpoints
        held (no action) and once with AquaTwin optimisation screened by AquaGuard (hourly, plus re-plans when the feed trend threatens a limit). Compute time {fmtInt(r.computeMs)} ms. Record id {r.id}.
      </p>
    </article>
  );
}
