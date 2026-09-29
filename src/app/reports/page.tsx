"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Chip, EmptyState, Panel } from "@/components/ui/primitives";
import { RunReport, outcomeLine } from "@/components/reports/RunReport";
import { useRuns, type RunRecord } from "@/state/runs";
import { useScenario } from "@/state/scenario";
import { fmt, fmtInt, hourOfDay } from "@/lib/format";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function toCsv(records: RunRecord[]) {
  const head = [
    "id",
    "scenario",
    "created",
    "start_clock",
    "noaction_production_m3",
    "noaction_energy_MWh",
    "noaction_sec",
    "noaction_max_tds",
    "noaction_min_storage_pct",
    "noaction_violation_h",
    "aquatwin_production_m3",
    "aquatwin_energy_MWh",
    "aquatwin_sec",
    "aquatwin_max_tds",
    "aquatwin_min_storage_pct",
    "aquatwin_violation_h",
    "approved",
    "rejected",
    "withheld",
  ];
  const rows = records.map((r) => {
    const c = (v: string) => r.decisions.filter((d) => d.verdict === v).length;
    return [
      r.id,
      r.scenario,
      new Date(r.createdAt).toISOString(),
      hourOfDay(r.startClock_h),
      r.noAction.production_m3.toFixed(0),
      r.noAction.energy_MWh.toFixed(2),
      r.noAction.sec.toFixed(4),
      r.noAction.maxTds.toFixed(1),
      r.noAction.minReservoir.toFixed(2),
      r.noAction.violationHours.toFixed(2),
      r.aquatwin.production_m3.toFixed(0),
      r.aquatwin.energy_MWh.toFixed(2),
      r.aquatwin.sec.toFixed(4),
      r.aquatwin.maxTds.toFixed(1),
      r.aquatwin.minReservoir.toFixed(2),
      r.aquatwin.violationHours.toFixed(2),
      c("APPROVED"),
      c("REJECTED"),
      c("WITHHELD"),
    ].join(",");
  });
  return [head.join(","), ...rows].join("\n") + "\n";
}

export default function ReportsPage() {
  const records = useRuns((s) => s.records);
  const hydrated = useRuns((s) => s.hydrated);
  const [sel, setSel] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => useScenario.getState().setActive(false), []);

  const current = useMemo(() => records.find((r) => r.id === sel) ?? records[0] ?? null, [records, sel]);

  const exportPdf = () => {
    if (!current) return;
    const prev = document.title;
    document.title = `AquaTwin-run-${current.scenario}-${stamp(current.createdAt)}`;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <>
      <div className="no-print flex h-full min-h-[760px] flex-col gap-4 p-5 pt-4">
        <div data-reveal="header" className="flex items-end justify-between gap-6">
          <div>
            <div className="label">Reports</div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Run records</h1>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Every Scenario Lab simulation is recorded here with its inputs, forecast, AquaGuard decisions and outcome. Records are stored in this browser only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                current && download(`aquatwin-run-${current.scenario}-${stamp(current.createdAt)}.json`, JSON.stringify(current, null, 2), "application/json")
              }
              disabled={!current}
            >
              Export JSON
            </Button>
            <Button size="sm" onClick={() => download(`aquatwin-runs-${stamp(Date.now())}.csv`, toCsv(records), "text/csv")} disabled={!records.length}>
              Export CSV
            </Button>
            <Button size="sm" variant="primary" onClick={exportPdf} disabled={!current}>
              Export PDF
            </Button>
          </div>
        </div>

        {!hydrated ? null : !records.length ? (
          <Panel reveal="panel1" className="flex-1">
            <EmptyState
              title="No runs recorded yet"
              detail="Run a scenario in the Scenario Lab. Each run is recorded here with its initial state, disturbance, predicted impact, recommended response, constraint checks and confidence."
              action={
                <Link
                  href="/scenarios"
                  className="mt-2 inline-flex h-8 items-center rounded-md bg-accent-strong px-3 text-[12.5px] font-medium text-white hover:bg-[#4b8ff7]"
                >
                  Open Scenario Lab
                </Link>
              }
            />
          </Panel>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-4">
            <Panel
              title={`${records.length} run${records.length === 1 ? "" : "s"}`}
              right={
                confirmClear ? (
                  <span className="flex items-center gap-1.5 text-[11.5px]">
                    <span className="text-fg-subtle">Delete all?</span>
                    <button
                      className="rounded px-1.5 py-0.5 text-crit hover:bg-crit-soft/50"
                      onClick={() => {
                        useRuns.getState().clear();
                        setConfirmClear(false);
                        setSel(null);
                      }}
                    >
                      Delete
                    </button>
                    <button className="rounded px-1.5 py-0.5 text-fg-muted hover:text-fg" onClick={() => setConfirmClear(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="text-[11.5px] text-fg-subtle hover:text-fg-muted" onClick={() => setConfirmClear(true)}>
                    Clear
                  </button>
                )
              }
              reveal="panel1"
              bodyClassName="scroll-quiet overflow-y-auto p-2"
            >
              <ul className="space-y-1">
                {records.map((r) => {
                  const active = current?.id === r.id;
                  const viol = r.noAction.violationHours > 0;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setSel(r.id)}
                        className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                          active ? "border-line-strong bg-ink-750" : "border-transparent hover:bg-ink-800"
                        }`}
                        aria-current={active}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-fg">{r.scenarioName}</span>
                          <span className="font-mono text-[10.5px] text-fg-subtle">
                            {new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11.5px]">
                          <span className={viol ? "text-warn" : "text-fg-subtle"}>No action {fmt(r.noAction.violationHours, 1)} h viol.</span>
                          <span className="text-fg-faint">·</span>
                          <span className={r.aquatwin.violationHours > 0 ? "text-warn" : "text-fg-muted"}>AquaTwin {fmt(r.aquatwin.violationHours, 1)} h</span>
                          <span className="ml-auto num text-fg-subtle">{fmtInt(r.aquatwin.production_m3)} m³</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {current && (
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    {current.scenarioName}
                    <span className="font-normal text-fg-subtle">· {new Date(current.createdAt).toLocaleString("en-GB")}</span>
                  </span>
                }
                right={<Chip>Simulated forecast</Chip>}
                reveal="panel2"
                bodyClassName="scroll-quiet overflow-y-auto px-6 py-5"
              >
                <p className="mb-5 rounded-md border border-line bg-ink-900 px-3 py-2 text-[12.5px] text-fg">{outcomeLine(current)}</p>
                <RunReport r={current} />
              </Panel>
            )}
          </div>
        )}
      </div>

      {current && (
        <div className="print-only print-doc">
          <RunReport r={current} tone="light" />
        </div>
      )}
    </>
  );
}
