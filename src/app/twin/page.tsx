"use client";
import { useEffect, useState } from "react";
import { TwinViewport } from "@/twin/react/TwinViewport";
import { Callouts } from "@/twin/react/Callouts";
import { Panel, Segmented, Provenance, Chip } from "@/components/ui/primitives";
import { ProcessSchematic } from "@/components/twin/ProcessSchematic";
import { HybridEquation, HYBRID_TARGETS, HYBRID_META } from "@/components/twin/HybridEquation";
import { calloutItems, inspectorFromLive } from "@/components/twin/assetData";
import { ResetViewButton, FlowLegend } from "@/components/twin/TwinChrome";
import { useLive } from "@/state/live";
import { useUi } from "@/state/ui";
import { useScenario } from "@/state/scenario";
import { fmt, fmtInt } from "@/lib/format";
import type { AssetId } from "@/sim/scenarios";

const TRAIN_OF: Partial<Record<AssetId, number>> = { ro1: 0, ro2: 1, ro3: 2 };

function Row({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[12px] last:border-b-0">
      <span className="text-fg-muted">{k}</span>
      <span className="num text-fg">
        {v}
        {unit && <span className="ml-1 text-[10.5px] text-fg-subtle">{unit}</span>}
      </span>
    </div>
  );
}

export default function DigitalTwinPage() {
  const snap = useLive((s) => s.snapshot);
  const selected = useUi((s) => s.selected);
  const [target, setTarget] = useState<"Q" | "C" | "D" | "W">("Q");

  useEffect(() => {
    useScenario.getState().setActive(false);
    if (!useUi.getState().selected) useUi.getState().select("ro2");
  }, []);

  const ti = selected ? (TRAIN_OF[selected] ?? null) : null;
  const trainIdx = ti ?? 1;
  const h = snap?.hybrid[trainIdx];
  const tr = snap?.trains[trainIdx];
  const th = snap?.theta[trainIdx];
  const ctx = snap?.contexts[trainIdx];
  const inspector = selected && snap ? inspectorFromLive(selected, snap) : null;

  return (
    <div className="grid h-full min-h-[520px] grid-cols-[minmax(0,1fr)_400px] grid-rows-[auto_minmax(0,1fr)_128px] gap-3 p-4 pt-3 min-[1800px]:grid-cols-[minmax(0,1fr)_440px] [@media(min-height:900px)]:grid-rows-[auto_minmax(0,1fr)_160px] max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col">
      <div data-reveal="header" className="col-span-2 flex items-center justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-2">
        <div className="min-w-0">
          <div className="label">Digital Twin</div>
          <div className="mt-1 flex min-w-0 items-baseline gap-3 max-sm:flex-col max-sm:gap-0.5">
            <h1 className="shrink-0 text-[20px] font-semibold tracking-tight text-fg">Hybrid digital twin</h1>
            <p
              className="truncate text-[12.5px] text-fg-muted"
              title="Reduced-order physics, self-calibrated from telemetry, corrected by a learned residual. Select a subsystem in 3D or in the flow below."
            >
              Physics self-calibrated from telemetry, corrected by a learned residual. Select a subsystem in 3D or in the flow below.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-lg:justify-start">
          <Chip tone="ok" dot>
            Physics 0D · calibrated
          </Chip>
          <Chip tone="ok" dot>
            Residual ML · 4 × 350 trees
          </Chip>
          <span className="hidden min-[1600px]:contents">
            <Chip tone="ok" dot>
              Self-calibration τ = 24 min
            </Chip>
          </span>
        </div>
      </div>

      <TwinViewport preset="twin" className="min-h-0 rounded-[10px] border border-line max-lg:h-[62vw] max-lg:max-h-[460px] max-lg:min-h-[240px] max-lg:shrink-0">
        <Callouts items={calloutItems(snap)} compact />
        <div data-reveal="panel4" className="absolute left-3 top-3 z-[2] max-sm:hidden">
          <FlowLegend />
        </div>
        <div data-reveal="panel4" className="absolute right-3 top-3 z-[2]">
          <ResetViewButton />
        </div>
      </TwinViewport>

      <div className="scroll-quiet row-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto max-lg:overflow-visible">
        <Panel
          dense
          className="shrink-0"
          title={inspector ? inspector.title : "Select a subsystem"}
          right={
            inspector && (
              <span className={`text-[11px] ${inspector.tone === "ok" ? "text-ok" : inspector.tone === "warn" ? "text-warn" : "text-crit"}`}>{inspector.state}</span>
            )
          }
          reveal="panel1"
          bodyClassName="px-4 py-2"
        >
          {inspector ? (
            inspector.rows.slice(0, 6).map((r) => <Row key={r.k} k={r.k} v={r.v} unit={r.unit} />)
          ) : (
            <div className="py-6 text-center text-[12px] text-fg-subtle">Click equipment in the model.</div>
          )}
        </Panel>

        <Panel
          dense
          className="shrink-0"
          title={`Hybrid estimate · RO train ${trainIdx + 1}`}
          right={<Provenance kind="modeled" />}
          reveal="panel2"
          bodyClassName="flex flex-col gap-3 p-3.5"
        >
          <Segmented size="sm" value={target} onChange={setTarget} options={HYBRID_TARGETS.map((k) => ({ value: k, label: HYBRID_META[k].label }))} />
          {h ? <HybridEquation h={h} target={target} /> : <div className="text-[12px] text-fg-subtle">Waiting for telemetry…</div>}
          <div className="grid grid-cols-2 gap-x-6 max-sm:grid-cols-1">
            <div>
              <div className="label mb-1">Inputs (now)</div>
              <Row k="Feed pressure" v={fmt(tr?.feedPressure_bar, 1)} unit="bar" />
              <Row k="Feed flow" v={fmtInt(tr?.feedFlow_m3h)} unit="m³/h" />
              <Row k="Salinity" v={fmt(snap?.env.salinity_gL, 2)} unit="g/L" />
              <Row k="Temperature" v={fmt(snap?.env.temperature_C, 1)} unit="°C" />
            </div>
            <div>
              <div className="label mb-1">Self-calibrated θ̂</div>
              <Row k="A₂₅ (water perm.)" v={fmt(th?.A25, 3)} unit="LMH/bar" />
              <Row k="B₂₅ (salt perm.)" v={fmt(th?.B25, 4)} unit="LMH" />
              <Row k="k_dp (hydraulic)" v={fmt(th?.kdp, 4)} />
              <Row k="η (lumped pump)" v={fmt(th?.pumpEff, 3)} />
            </div>
          </div>
          <details className="group text-[11.5px] leading-relaxed text-fg-subtle">
            <summary className="cursor-pointer list-none text-fg-muted hover:text-fg">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>How the twin calibrates itself
            </summary>
            <p className="mt-1.5">
              θ̂ is re-identified every sample by inverting the 0D model on telemetry (EWMA, calibrated at {fmt(ctx?.u0.P, 1)} bar, {fmt(ctx?.u0.Qv, 2)} m³/h per vessel).
              The residual model corrects what the lumped physics cannot represent: axial polarisation, non-ideal osmotic pressure, ERD mixing, pump curves.
            </p>
          </details>
        </Panel>
      </div>

      <Panel
        dense
        title="Process flow"
        right={<span className="text-[11px] text-fg-subtle max-sm:hidden">Click a step to inspect it</span>}
        reveal="panel3"
        bodyClassName="px-3 py-1.5 max-lg:overflow-x-auto"
      >
        <ProcessSchematic
          values={
            snap
              ? {
                  intake: `${fmtInt(snap.trains.reduce((a, t) => a + t.feedFlow_m3h, 0))} m³/h`,
                  pretreatment: `${fmt(snap.env.turbidity_NTU, 1)} NTU`,
                  pumps: `${fmt(Math.max(...snap.trains.map((t) => t.feedPressure_bar)), 1)} bar`,
                  ro2: `${fmt(snap.totals.recovery * 100, 1)}% recovery`,
                  product: `${fmtInt(snap.totals.production_m3h)} m³/h`,
                  brine: `${fmt(snap.totals.brineTDS_gL, 1)} g/L`,
                }
              : undefined
          }
        />
      </Panel>
    </div>
  );
}
