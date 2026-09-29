"use client";
import { useLive } from "@/state/live";
import { useIntro } from "@/twin/react/introBus";
import { twinClient } from "@/runtime/client";
import { clockLabel, dateLabel, fmt } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { IconDroplet, IconThermo, IconWave, IconEye } from "@/components/icons";

function Condition({ icon, value, unit, label }: { icon: React.ReactNode; value: string; unit: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-fg-subtle">{icon}</span>
      <div className="leading-tight">
        <div className="num text-[13px] font-medium text-fg">
          {value}
          <span className="ml-1 text-[11px] font-normal text-fg-subtle">{unit}</span>
        </div>
        <div className="text-[10.5px] text-fg-subtle">{label}</div>
      </div>
    </div>
  );
}

const SPEEDS = [1, 60, 600] as const;

export function TopBar() {
  const snap = useLive((s) => s.snapshot);
  const status = useLive((s) => s.status);
  const speed = useLive((s) => s.speed);
  const stage = useIntro((s) => s.stage);
  const mode = useIntro((s) => s.mode);
  const now = useNow();

  const live = status === "ready" && (mode === "skip" || stage === "live" || stage === "done");
  const env = snap?.env;

  return (
    <header data-reveal="telemetry" className="no-print flex h-[68px] shrink-0 items-center gap-8 border-b border-line px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] tracking-wider uppercase ${
            live ? "border-ok/30 text-ok" : "border-line-strong text-fg-subtle"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-ok" : "bg-fg-faint"}`} aria-hidden />
          {live ? "Live" : status === "error" ? "Offline" : "Initializing"}
        </span>
        <span className="inline-flex h-6 items-center rounded-md border border-line-strong px-2 font-mono text-[10.5px] tracking-wider text-fg-subtle uppercase">
          Simulated plant
        </span>
        <span className="hidden truncate text-[12.5px] text-fg-muted xl:inline">Reference SWRO plant · 3 trains · 57,500 m³/d</span>
      </div>

      <div className="ml-auto flex items-center gap-7">
        <Condition icon={<IconThermo size={15} />} value={fmt(env?.temperature_C, 1)} unit="°C" label="Temperature" />
        <Condition icon={<IconWave size={15} />} value={fmt(env?.salinity_gL, 1)} unit="g/L" label="Salinity" />
        <Condition icon={<IconEye size={15} />} value={fmt(env?.turbidity_NTU, 1)} unit="NTU" label="Turbidity" />
        <Condition icon={<IconDroplet size={15} />} value={fmt(env?.pH, 2)} unit="" label="pH" />
      </div>

      <div className="h-8 w-px bg-line" aria-hidden />

      <div className="flex items-center gap-4">
        <div className="text-right leading-tight">
          <div className="num text-[15px] font-medium text-fg">{now === null ? "--:--:--" : clockLabel(now)}</div>
          <div className="text-[10.5px] text-fg-subtle">{now === null ? "" : dateLabel(now)}</div>
        </div>
        <div className="text-right leading-tight">
          <div className="num font-mono text-[12px] text-fg-muted">SIM {snap ? clockLabel(snap.simTime) : "--:--:--"}</div>
          <div className="mt-0.5 inline-flex rounded border border-line text-[10px]" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => twinClient.setSpeed(s)}
                className={`num px-1.5 py-px font-mono ${speed === s ? "bg-ink-700 text-fg" : "text-fg-subtle hover:text-fg-muted"}`}
                aria-pressed={speed === s}
                title={s === 1 ? "Real time" : `${s}× simulated time`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
