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
      right={<span className="text-[11px] text-fg-subtle">Stress-test before it happens</span>}
      reveal="panel3"
      bodyClassName="flex flex-col p-3"
    >
      <div className="grid flex-1 grid-cols-2 gap-2">
        {LAB_SCENARIOS.map((id) => {
          const s = SCENARIOS[id];
          const active = sel === id;
          return (
            <button
              key={id}
              onClick={() => setSel(id)}
              aria-pressed={active}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                active ? "border-accent/60 bg-accent-soft/40" : "border-line bg-ink-900 hover:border-line-strong"
              }`}
            >
              <div className={`text-[12.5px] font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{s.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-fg-subtle">{s.tag}</div>
            </button>
          );
        })}
      </div>
      <Button variant="primary" size="lg" className="mt-3 w-full" onClick={run}>
        Run scenario
        <IconArrowRight size={14} />
      </Button>
    </Panel>
  );
}
