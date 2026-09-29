"use client";
import { create } from "zustand";
import type { AssetId } from "@/sim/scenarios";

export type IntroPhase = "pending" | "playing" | "done";

interface UiState {
  /** Asset selected in the 3D twin (drives the inspector). */
  selected: AssetId | null;
  hovered: AssetId | null;
  /** Incremented to request a camera reset. */
  cameraReset: number;
  introPhase: IntroPhase;
  /** Twin rendering failed (WebGL unavailable) — pages show the 2D schematic instead. */
  twinFailed: boolean;
  perfOpen: boolean;
  select: (a: AssetId | null) => void;
  hover: (a: AssetId | null) => void;
  resetCamera: () => void;
  setIntroPhase: (p: IntroPhase) => void;
  setTwinFailed: (f: boolean) => void;
  togglePerf: () => void;
}

export const useUi = create<UiState>((set) => ({
  selected: null,
  hovered: null,
  cameraReset: 0,
  introPhase: "pending",
  twinFailed: false,
  perfOpen: false,
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
  resetCamera: () => set((s) => ({ cameraReset: s.cameraReset + 1, selected: null })),
  setIntroPhase: (introPhase) => set({ introPhase }),
  setTwinFailed: (twinFailed) => set({ twinFailed }),
  togglePerf: () => set((s) => ({ perfOpen: !s.perfOpen })),
}));
