"use client";
import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { TwinHost } from "@/twin/react/TwinHost";
import { IntroOverlay } from "@/twin/intro/IntroOverlay";
import { PerfPanel } from "@/twin/react/PerfPanel";
import { GuidedTour } from "./GuidedTour";
import { twinClient } from "@/runtime/client";
import { useRuns } from "@/state/runs";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { useUi } from "@/state/ui";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    twinClient.start();
    useRuns.getState().hydrate();
  }, []);

  // Once the plant is live and the intro has finished, compute the Scenario Lab
  // forecasts in the background (compute worker) so every page has them.
  useEffect(() => {
    let started = false;
    const t = setInterval(() => {
      if (started || !useLive.getState().snapshot || useUi.getState().introPhase !== "done") return;
      started = true;
      clearInterval(t);
      setTimeout(() => void useScenario.getState().precompute(), 1500);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div id="app-root" className="flex h-screen w-screen overflow-hidden bg-ink-950 max-lg:h-dvh">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <TopBar />
        <div id="page-scroll" className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      <TwinHost />
      <IntroOverlay />
      <PerfPanel />
      <GuidedTour />
    </div>
  );
}
