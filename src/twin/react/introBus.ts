"use client";
import { create } from "zustand";
import type { IntroStage } from "../intro/timeline";

interface IntroState {
  stage: IntroStage;
  mode: "full" | "skip" | "unknown";
  showSkip: boolean;
  skipRequested: number;
  setStage: (s: IntroStage) => void;
  setMode: (m: "full" | "skip") => void;
  setShowSkip: (v: boolean) => void;
  requestSkip: () => void;
}

export const useIntro = create<IntroState>((set) => ({
  stage: "offline",
  mode: "unknown",
  showSkip: false,
  skipRequested: 0,
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  setShowSkip: (showSkip) => set({ showSkip }),
  requestSkip: () => set((s) => ({ skipRequested: s.skipRequested + 1 })),
}));

const REVEAL_KEYS = ["sidebar", "header", "telemetry", "panel1", "panel2", "panel3", "panel4"] as const;

/** Reveal one staggered group of interface elements. */
export function revealGroup(key: string) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`[data-reveal="${key}"]`).forEach((el) => el.classList.add("is-revealed"));
}

/** End of intro: everything visible, no further gating. */
export function revealAll() {
  if (typeof document === "undefined") return;
  REVEAL_KEYS.forEach(revealGroup);
  document.documentElement.dataset.intro = "done";
}

export const INTRO_SESSION_KEY = "aquatwin.intro.v1";
