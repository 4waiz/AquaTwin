"use client";
import { create } from "zustand";
import type { CameraPreset } from "../CameraRig";
import type { AnchorScreen, TwinEngine } from "../TwinEngine";

interface ViewportState {
  slot: HTMLElement | null;
  preset: CameraPreset;
  register: (el: HTMLElement, preset: CameraPreset) => void;
  unregister: (el: HTMLElement) => void;
}

/** The page-level element the persistent twin canvas should cover. */
export const useViewport = create<ViewportState>((set, get) => ({
  slot: null,
  preset: "overview",
  register: (slot, preset) => set({ slot, preset }),
  unregister: (el) => {
    if (get().slot === el) set({ slot: null });
  },
}));

type AnchorListener = (a: AnchorScreen[]) => void;
const listeners = new Set<AnchorListener>();

/** Lightweight per-frame bus for callout anchors (bypasses React state). */
export const anchorBus = {
  emit(a: AnchorScreen[]) {
    listeners.forEach((l) => l(a));
  },
  subscribe(l: AnchorListener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** The live engine instance (for the developer performance panel). */
export const engineHandle: { current: TwinEngine | null } = { current: null };
