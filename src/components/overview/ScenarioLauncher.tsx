"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Panel } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/icons";
import { LAB_SCENARIOS, SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import { useScenario } from "@/state/scenario";

export function ScenarioLauncher() {
  const router = useRouter();
  const selectedStore = useScenario((s) => s.selected);
  const [sel, setSel] = useState<ScenarioId>(selectedStore);
  const run = () => {
    useScenario.getState().select(sel);
    router.push(`/scenarios?s=${sel}&run=1`);
  };
  return (
    <Panel
      title="Scenario simulation"
      dense
      className="shrink-0 grow"
      right={<span className="text-[11px] text-fg-subtle">Stress-test before it happens</span>}
      reveal="panel3"
      bodyClassName="flex flex-col gap-2 p-2.5"
    >
      <div className="grid auto-rows-min grid-cols-3 content-start gap-1.5 max-lg:grid-cols-2">
        {LAB_SCENARIOS.map((id) => {
          const s = SCENARIOS[id];
          const active = sel === id;
          return (
            <button
              key={id}
              onClick={() => setSel(id)}
              aria-pressed={active}
              title={`${s.name}: ${s.tag}`}
              className={`min-w-0 rounded-md border px-2 py-1 text-left transition-colors ${
                active ? "border-accent/60 bg-accent-soft/40" : "border-line bg-ink-900 hover:border-line-strong"
              }`}
            >
              <div className={`truncate text-[12px] font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{s.name}</div>
              <div className="mt-0.5 truncate text-[10.5px] text-fg-subtle">{s.tag}</div>
            </button>
          );
        })}
      </div>
      <Button variant="primary" size="md" className="mt-auto w-full" onClick={run}>
        Run scenario
        <IconArrowRight size={14} />
      </Button>
    </Panel>
  );
}
