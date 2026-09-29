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
    <div className="grid h-full min-h-[720px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-5 pt-4 max-lg:flex max-lg:h-auto max-lg:min-h-0 max-lg:flex-col max-lg:p-4">
      <div data-reveal="header" className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start max-lg:gap-3">
        <div>
          <div className="label">Overview</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Desalination plant</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Real-time simulated operation <span className="text-fg-faint">·</span> predictive insight <span className="text-fg-faint">·</span> safe recommendations
          </p>
        </div>
        <div data-reveal="telemetry">
          <GuardStrip />
        </div>
      </div>

      <TwinViewport preset="overview" className="rounded-[10px] border border-line max-lg:h-[62vw] max-lg:max-h-[460px] max-lg:min-h-[240px] max-lg:shrink-0">
        <Callouts items={calloutItems(snap)} />
        <div data-reveal="panel4" className="absolute left-3 top-3 z-[2] max-sm:hidden">
          <FlowLegend />
        </div>
        <div data-reveal="panel4" className="absolute right-3 top-3 z-[2]">
          <ResetViewButton />
        </div>
        {selected && snap && (
          <div className="absolute bottom-3 right-3 z-[3] max-lg:hidden">
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

      <div className="grid min-h-0 grid-cols-[1.12fr_1fr_1.02fr] gap-4 max-lg:grid-cols-1">
        <KeyMetrics />
        <MembraneHealthMini />
        <ScenarioLauncher />
      </div>
    </div>
  );
}
