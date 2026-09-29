"use client";
import { create } from "zustand";
import type { ScenarioResult } from "@/runtime/protocol";
import type { ObjectiveWeights } from "@/sim/optimizer";
import { LAB_SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import { twinClient } from "@/runtime/client";
import { useRuns } from "./runs";

export type Branch = "noAction" | "aquatwin";
export const TIMELINE_MARKS = [0, 1, 3, 6, 12, 24] as const;

interface ScenarioState {
  selected: ScenarioId;
  results: Partial<Record<ScenarioId, ScenarioResult>>;
  loading: Partial<Record<ScenarioId, boolean>>;
  errors: Partial<Record<ScenarioId, string>>;
  /** Timeline cursor, hours from now (0–24). */
  cursor: number;
  branch: Branch;
  playing: boolean;
  /** When true the 3D twin shows the scenario state at the cursor instead of live telemetry. */
  active: boolean;
  weights: ObjectiveWeights | undefined;
  select: (id: ScenarioId) => void;
  /** `background` runs (pre-computation) are not added to the Reports run records. */
  run: (id: ScenarioId, force?: boolean, background?: boolean) => Promise<ScenarioResult | undefined>;
  /** Compute every Scenario Lab forecast not yet available, one at a time. */
  precompute: () => Promise<void>;
  setCursor: (h: number) => void;
  setBranch: (b: Branch) => void;
  setPlaying: (p: boolean) => void;
  setActive: (a: boolean) => void;
  setWeights: (w: ObjectiveWeights | undefined) => void;
  reset: () => void;
}

/** In-flight simulations, so a request for a scenario already running joins it. */
const inflight = new Map<ScenarioId, Promise<ScenarioResult | undefined>>();

export const useScenario = create<ScenarioState>((set, get) => ({
  selected: "salinity",
  results: {},
  loading: {},
  errors: {},
  cursor: 0,
  branch: "aquatwin",
  playing: false,
  active: false,
  weights: undefined,
  select: (id) => set({ selected: id, cursor: 0, playing: false }),
  run: async (id, force = false, background = false) => {
    const pending = inflight.get(id);
    if (pending) {
      const r = await pending;
      if (r && !background) useRuns.getState().record(r);
      return r;
    }
    set((s) => ({ loading: { ...s.loading, [id]: true }, errors: { ...s.errors, [id]: undefined } }));
    const job = (async () => {
      try {
        const res = await twinClient.scenario(id, get().weights, force);
        set((s) => ({ results: { ...s.results, [id]: res }, loading: { ...s.loading, [id]: false } }));
        return res;
      } catch (e) {
        set((s) => ({
          loading: { ...s.loading, [id]: false },
          errors: { ...s.errors, [id]: e instanceof Error ? e.message : String(e) },
        }));
        return undefined;
      }
    })();
    inflight.set(id, job);
    try {
      const res = await job;
      if (res && !background) useRuns.getState().record(res);
      return res;
    } finally {
      inflight.delete(id);
    }
  },
  precompute: async () => {
    for (const id of LAB_SCENARIOS) {
      if (get().results[id] || get().loading[id]) continue;
      await get().run(id, false, true);
    }
  },
  setCursor: (h) => set({ cursor: Math.min(24, Math.max(0, h)) }),
  setBranch: (branch) => set({ branch }),
  setPlaying: (playing) => set({ playing }),
  setActive: (active) => set({ active }),
  setWeights: (weights) => set({ weights, results: {} }),
  reset: () => set({ cursor: 0, playing: false, active: false, branch: "aquatwin" }),
}));
