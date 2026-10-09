"use client";
import { TwinViewport } from "@/twin/react/TwinViewport";
import { Callouts } from "@/twin/react/Callouts";
import { KeyMetrics } from "@/components/overview/KeyMetrics";
import { MembraneHealthMini } from "@/components/overview/MembraneHealthMini";
import { ScenarioLauncher } from "@/components/overview/ScenarioLauncher";
import { AssetInspector } from "@/components/twin/AssetInspector";
import { calloutItems, inspectorFromLive } from "@/components/twin/assetData";
import { FlowLegend, GuardStrip, ResetViewButton } from "@/components/twin/TwinChrome";
import { useLive } from "@/state/live";
import { useUi } from "@/state/ui";
import { useEffect } from "react";
import { useScenario } from "@/state/scenario";

export default function OverviewPage() {
  const snap = useLive((s) => s.snapshot);
  const selected = useUi((s) => s.selected);
  const select = useUi((s) => s.select);

  // The overview always shows the live plant.
  useEffect(() => {
    useScenario.getState().setActive(false);
  }, []);

  return (
    <div className="grid h-full min-h-[520px] grid-cols-[minmax(0,1fr)_340px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4 pt-3 min-[1800px]:grid-cols-[minmax(0,1fr)_380px] max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col">
      <div data-reveal="header" className="col-span-2 flex items-center justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-2">
        <div className="min-w-0">
          <div className="label truncate">Overview · Reference SWRO plant · 3 trains · 57,500 m³/d</div>
          <div className="mt-1 flex min-w-0 items-baseline gap-3 max-sm:flex-col max-sm:gap-0.5">
            <h1 className="shrink-0 text-[20px] font-semibold tracking-tight text-fg">Desalination plant</h1>
            <p className="truncate text-[12.5px] text-fg-muted">
              Real-time simulated operation <span className="text-fg-faint">·</span> predictive insight <span className="text-fg-faint">·</span> safe recommendations
            </p>
          </div>
        </div>
        <div data-reveal="telemetry" className="shrink-0">
          <GuardStrip />
        </div>
      </div>

      <TwinViewport preset="overview" className="min-h-0 rounded-[10px] border border-line max-lg:h-[62vw] max-lg:max-h-[460px] max-lg:min-h-[240px] max-lg:shrink-0">
        <Callouts items={calloutItems(snap)} />
        <div data-reveal="panel4" className="absolute left-3 top-3 z-[2] max-sm:hidden">
          <FlowLegend />
        </div>
        <div data-reveal="panel4" className="absolute right-3 top-3 z-[2]">
          <ResetViewButton />
        </div>
        {selected && snap && (
          <div className="scroll-quiet absolute bottom-3 right-3 z-[3] max-h-[calc(100%-3.75rem)] overflow-y-auto rounded-[10px] max-lg:hidden">
            <AssetInspector data={inspectorFromLive(selected, snap)} onClose={() => select(null)} />
          </div>
        )}
        <div data-reveal="panel4" className="pointer-events-none absolute bottom-3 left-3 z-[2] text-[10.5px] text-fg-faint max-sm:hidden pointer-coarse:hidden">
          Drag to orbit · scroll to zoom · click equipment to inspect
        </div>
      </TwinViewport>

      {selected && snap && (
        <div className="lg:hidden">
          <AssetInspector data={inspectorFromLive(selected, snap)} onClose={() => select(null)} />
        </div>
      )}

      <div className="scroll-quiet flex min-h-0 flex-col gap-2.5 overflow-y-auto max-lg:overflow-visible">
        <KeyMetrics />
        <MembraneHealthMini />
        <ScenarioLauncher />
      </div>
    </div>
  );
}
