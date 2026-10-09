"use client";
import { useEffect, useMemo, useState } from "react";
import { Panel, Provenance, Button, Spinner, Chip } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts/LineChart";
import { VesselArray } from "@/components/membranes/VesselArray";
import { HealthBar, trainToneOf } from "@/components/overview/MembraneHealthMini";
import { CLEANING, cleaningStatus } from "@/sim/cleaning";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { LIMITS } from "@/sim/config";
import { fmt, fmtHours, fmtInt, fmtPct, fmtSigned } from "@/lib/format";
import { useRouter } from "next/navigation";

const HOUR = 3_600_000;

/** Manufacturer cleaning criteria against the current normalised indicators. */
function CriteriaRow({ npf, nsp, ndp }: { npf: number; nsp: number; ndp: number }) {
  const items = [
    { k: "Flow", v: npf - 1, due: npf <= CLEANING.npfDue, watch: false, crit: "−10 %" },
    { k: "Salt passage", v: nsp - 1, due: nsp >= CLEANING.nspDue, watch: nsp >= CLEANING.nspWatch, crit: "+5–10 %" },
    { k: "Pressure drop", v: ndp - 1, due: ndp >= CLEANING.ndpDue, watch: ndp >= CLEANING.ndpWatch, crit: "+10–15 %" },
  ];
  return (
    <div>
      <div className="label mb-1.5">Cleaning criteria · FilmTec manual</div>
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        {items.map((c) => (
          <div key={c.k} className={`rounded-md border px-2.5 py-1.5 ${c.due ? "border-warn/50 bg-warn-soft/30" : "border-line bg-ink-900"}`}>
            <div className="text-[10.5px] text-fg-subtle">{c.k}</div>
            <div className={`num text-[13px] ${c.due ? "text-warn" : c.watch ? "text-fg" : "text-fg-muted"}`}>
              {fmtSigned(c.v * 100, 1, " %")}
              <span className="ml-1.5 text-[10px] text-fg-faint">clean at {c.crit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function stateOf(npf: number, ndp: number, nsp: number, hours: number | null) {
  return cleaningStatus(npf, nsp, ndp, hours).label;
}

/** Symptom → cause matrix (manufacturer troubleshooting practice; see REFERENCES: DUPONT-MANUAL). */
function Diagnosis({ npf, ndp, nsp }: { npf: number; ndp: number; nsp: number }) {
  const sym = { flow: npf < 0.97, dp: ndp > 1.1, salt: nsp > 1.05 };
  const causes = [
    { name: "Biofouling", flow: 2, dp: 2, salt: 1, where: "lead elements" },
    { name: "Particulate / colloidal", flow: 2, dp: 2, salt: 1, where: "lead elements" },
    { name: "Mineral scaling", flow: 2, dp: 1, salt: 2, where: "tail elements" },
    { name: "Membrane damage / O-ring", flow: 0, dp: 0, salt: 2, where: "any" },
  ];
  const match = (c: (typeof causes)[number]) => (sym.flow ? c.flow : 2 - c.flow) + (sym.dp ? c.dp : 2 - c.dp) + (sym.salt ? c.salt : 2 - c.salt);
  const best = Math.max(...causes.map(match));
  const dot = (v: number) => (v === 2 ? "●" : v === 1 ? "◐" : "○");
  return (
    <table className="w-full text-[11.5px]">
      <thead>
        <tr className="text-left text-fg-subtle">
          <th className="pb-1.5 font-normal">Typical cause</th>
          <th className={`pb-1.5 text-center font-normal ${sym.flow ? "text-warn" : ""}`}>NPF ↓</th>
          <th className={`pb-1.5 text-center font-normal ${sym.dp ? "text-warn" : ""}`}>NDP ↑</th>
          <th className={`pb-1.5 text-center font-normal ${sym.salt ? "text-warn" : ""}`}>NSP ↑</th>
          <th className="pb-1.5 font-normal">Location</th>
        </tr>
      </thead>
      <tbody>
        {causes.map((c) => {
          const top = match(c) === best && (sym.flow || sym.dp || sym.salt);
          return (
            <tr key={c.name} className={`border-t border-line ${top ? "text-fg" : "text-fg-muted"}`}>
              <td className="py-1.5">
                {c.name}
                {top && <span className="ml-2 rounded border border-accent/40 px-1 font-mono text-[9px] text-accent">MOST CONSISTENT</span>}
              </td>
              <td className="py-1.5 text-center">{dot(c.flow)}</td>
              <td className="py-1.5 text-center">{dot(c.dp)}</td>
              <td className="py-1.5 text-center">{dot(c.salt)}</td>
              <td className="py-1.5 text-fg-subtle">{c.where}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function MembraneHealthPage() {
  const snap = useLive((s) => s.snapshot);
  const history = useLive((s) => s.history);
  const results = useScenario((s) => s.results);
  const loadingFouling = useScenario((s) => !!s.loading.fouling);
  const [sel, setSel] = useState(1);
  const router = useRouter();
  useEffect(() => useScenario.getState().setActive(false), []);

  const trains = snap?.health.map((h, i) => {
    const tr = snap.healthTrend[i];
    return { i, h, tr, tone: trainToneOf(h.npf, tr.hours, h.nsp, h.ndp) };
  });
  const cur = trains?.[sel];

  // Chart: last 24 h of NPF estimates + trend projection with 90 % band.
  const chart = useMemo(() => {
    if (!snap || !history.length) return null;
    const now = snap.simTime;
    const past = history.map((p) => ({ t: (p.t - now) / HOUR, v: p.health[sel] * 100 }));
    const tr = snap.healthTrend[sel];
    const x: number[] = past.map((p) => p.t);
    const obs: (number | null)[] = past.map((p) => p.v);
    const proj: (number | null)[] = past.map(() => null);
    const lo: (number | null)[] = past.map(() => null);
    const hi: (number | null)[] = past.map(() => null);
    const h0 = snap.health[sel].npf * 100;
    const slope = tr.slopePctPerHour;
    for (let h = 0; h <= 72; h += 1) {
      x.push(h);
      obs.push(null);
      const v = h0 + slope * h;
      proj.push(v);
      // Widening band from the slope uncertainty implied by the 90 % crossing band.
      const spread =
        tr.lo !== null && tr.hi !== null && tr.hours
          ? Math.abs(slope) * h * ((tr.hi - tr.lo) / 2 / Math.max(tr.hours, 1))
          : Math.abs(slope) * h * 0.25 + 0.05 * Math.sqrt(h);
      lo.push(v - spread);
      hi.push(v + spread);
    }
    return { x, obs, proj, lo, hi };
  }, [snap, history, sel]);

  const fouling = results.fouling;

  return (
    <div className="grid h-full min-h-[960px] grid-rows-[auto_auto_minmax(560px,1fr)] gap-4 p-5 pt-4 max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col max-lg:p-4">
      <div data-reveal="header" className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-3">
        <div>
          <div className="label">Membrane Health</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Membrane health and degradation outlook</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Normalised performance (ASTM D4516 concept) computed with the hybrid twin at standard conditions: NPF, NDP, NSP relative to the post-clean baseline.
          </p>
        </div>
        <Provenance kind="estimated" />
      </div>

      <div data-reveal="panel1" className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {(trains ?? []).map((t) => {
          const active = t.i === sel;
          return (
            <button
              key={t.i}
              onClick={() => setSel(t.i)}
              aria-pressed={active}
              className={`rounded-[10px] border p-4 text-left transition-colors ${active ? "border-accent/60 bg-accent-soft/60" : "border-line bg-ink-850 hover:border-line-strong"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[14px] font-medium text-fg">Train {t.i + 1}</div>
                  <div className={`mt-0.5 text-[11.5px] ${t.tone === "ok" ? "text-ok" : "text-warn"}`}>{stateOf(t.h.npf, t.h.ndp, t.h.nsp, t.tr.hours)}</div>
                </div>
                <div className="text-right">
                  <div className={`num text-[26px] font-medium tracking-tight ${t.tone === "ok" ? "text-fg" : "text-warn"}`}>{fmt(t.h.npf * 100, 1)}%</div>
                  <div className="text-[10.5px] text-fg-subtle">normalised permeate flow</div>
                </div>
              </div>
              <div className="mt-3">
                <HealthBar value={t.h.npf} tone={t.tone} />
              </div>
              <div className="mt-3">
                <VesselArray health={t.h.npf} ndp={t.h.ndp} nsp={t.h.nsp} tone={t.tone} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <div className="text-fg-subtle">NDP</div>
                  <div className="num text-fg">{fmt(t.h.ndp, 2)}×</div>
                </div>
                <div>
                  <div className="text-fg-subtle">NSP</div>
                  <div className="num text-fg">{fmt(t.h.nsp, 2)}×</div>
                </div>
                <div>
                  <div className="text-fg-subtle">Rejection</div>
                  <div className="num text-fg">{snap ? fmtPct(100 * (1 - snap.trains[t.i].permeateTDS_mgL / (snap.env.salinity_gL * 1000)), 2) : "–"}</div>
                </div>
                <div>
                  <div className="text-fg-subtle">Trend</div>
                  <div className="num text-fg">{fmt(t.tr.slopePctPerHour, 3)}%/h</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <Panel
          title={`Train ${sel + 1} · NPF and projection`}
          right={
            cur && (
              <div className="flex items-center gap-2 max-md:hidden">
                {cur.tr.hours !== null ? (
                  <Chip tone="warn">
                    Flow criterion in {fmtHours(cur.tr.lo)}–{fmtHours(cur.tr.hi ?? cur.tr.hours)} (90%)
                  </Chip>
                ) : (
                  <Chip>No flow-criterion crossing projected</Chip>
                )}
                <Chip>P(cross ≤ 24 h) {fmt(cur.tr.probWithin * 100, 0)}%</Chip>
              </div>
            )
          }
          reveal="panel2"
          className="max-lg:h-[420px]"
          bodyClassName="flex min-h-0 flex-col p-4"
        >
          {cur && (
            <div className="mb-2 text-[11.5px] md:hidden">
              <span className={cur.tr.hours !== null ? "text-warn" : "text-fg-muted"}>
                {cur.tr.hours !== null ? `Flow criterion in ${fmtHours(cur.tr.lo)}–${fmtHours(cur.tr.hi ?? cur.tr.hours)} (90%)` : "No flow-criterion crossing projected"}
              </span>
              <span className="text-fg-subtle"> · P(cross ≤ 24 h) {fmt(cur.tr.probWithin * 100, 0)}%</span>
            </div>
          )}
          {chart ? (
            <LineChart
              x={chart.x}
              series={[
                { id: "obs", label: "Estimated NPF (last 24 h)", color: "var(--color-series-noact)", values: chart.obs, width: 1.4 },
                {
                  id: "proj",
                  label: "Projection (trend, 90% band)",
                  color: "var(--color-accent)",
                  values: chart.proj,
                  dashed: true,
                  width: 1.6,
                  band: { lo: chart.lo, hi: chart.hi },
                },
              ]}
              limits={[{ value: LIMITS.cipHealthThreshold * 100, label: "Flow cleaning criterion (−10 %)", tone: "warn", violates: "below" }]}
              xFormat={(v) => (Math.abs(v) < 0.5 ? "now" : v > 0 ? `+${Math.round(v)}h` : `${Math.round(v)}h`)}
              yFormat={(v) => v.toFixed(1)}
              xTicks={[-24, -12, 0, 12, 24, 48, 72]}
              markers={[{ x: 0, label: "NOW" }]}
              unit="% of post-clean baseline"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">Waiting for telemetry…</div>
          )}
          <div className="mt-2 text-[11px] text-fg-subtle">
            Projection: OLS trend on the last 24 h of NPF estimates; band from the confidence band of the fitted line; probability from the slope&apos;s sampling
            distribution. {cur && cur.tr.r2 ? `Fit R² ${fmt(cur.tr.r2, 2)}.` : ""}
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Why AquaTwin flags this train" reveal="panel3" className="shrink-0" bodyClassName="space-y-3 p-4">
            {snap && cur ? (
              <>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  <div className="rounded-md border border-line bg-ink-900 px-3 py-2">
                    <div className="label">Observed</div>
                    <div className="num mt-1 text-[17px] text-fg">{fmtInt(snap.hybrid[sel].measured.Qp)}</div>
                    <div className="text-[10.5px] text-fg-subtle">m³/h permeate (sensor)</div>
                  </div>
                  <div className="rounded-md border border-line bg-ink-900 px-3 py-2">
                    <div className="label">Clean expectation</div>
                    <div className="num mt-1 text-[17px] text-fg">{fmtInt(cur.h.qpCleanNow)}</div>
                    <div className="text-[10.5px] text-fg-subtle">clean train, same conditions (hybrid)</div>
                  </div>
                  <div className="rounded-md border border-accent/40 bg-accent-soft/30 px-3 py-2">
                    <div className="label">Unexplained loss</div>
                    <div className="num mt-1 text-[17px] text-accent">{fmt((1 - cur.h.npf) * 100, 1)}%</div>
                    <div className="text-[10.5px] text-fg-subtle">after normalising P, flow, salinity, T</div>
                  </div>
                </div>
                <p className="text-[12px] leading-relaxed text-fg-muted">
                  Permeate flow is re-expressed at standard conditions with the calibrated hybrid model. The remaining {fmt((1 - cur.h.npf) * 100, 1)}% loss cannot be
                  explained by pressure, flow, salinity or temperature, and it is accompanied by a {fmt((cur.h.ndp - 1) * 100, 0)}% rise in normalised ΔP and a{" "}
                  {fmt((cur.h.nsp - 1) * 100, 0)}% rise in salt passage.
                </p>
                <CriteriaRow npf={cur.h.npf} nsp={cur.h.nsp} ndp={cur.h.ndp} />
                <Diagnosis npf={cur.h.npf} ndp={cur.h.ndp} nsp={cur.h.nsp} />
              </>
            ) : (
              <div className="text-[12px] text-fg-subtle">Waiting for telemetry…</div>
            )}
          </Panel>
          <Panel title="Accelerated-fouling stress test" right={<Provenance kind="simulated" />} reveal="panel3" className="flex-1" bodyClassName="p-4 text-[12px]">
            {fouling ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-fg-muted">No action: Train 2 reaches threshold</span>
                  <span className="num text-warn">
                    {fouling.noAction.metrics.cipCrossing[1] === null ? "not within 24 h" : `+${fmtHours(fouling.noAction.metrics.cipCrossing[1])}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">AquaTwin (derates Train 2)</span>
                  <span className="num text-accent">
                    {fouling.aquatwin.metrics.cipCrossing[1] === null ? "not within 24 h" : `+${fmtHours(fouling.aquatwin.metrics.cipCrossing[1])}`}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    useScenario.getState().select("fouling");
                    router.push("/scenarios?s=fouling");
                  }}
                >
                  Open in Scenario Lab →
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-muted">Forecast Train 2 under a severe biofouling event, with and without AquaTwin.</span>
                <Button size="sm" variant="secondary" disabled={loadingFouling} onClick={() => void useScenario.getState().run("fouling")}>
                  {loadingFouling ? <Spinner /> : null} Run
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
