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
let latest: AnchorScreen[] | null = null;

/**
 * Lightweight bus for callout anchors (bypasses React state). The engine emits only
 * when the positions move, so a new subscriber is handed the latest positions at once.
 */
export const anchorBus = {
  emit(a: AnchorScreen[]) {
    latest = a;
    listeners.forEach((l) => l(a));
  },
  subscribe(l: AnchorListener) {
    listeners.add(l);
    if (latest) l(latest);
    return () => {
      listeners.delete(l);
    };
  },
};

/** The live engine instance (for the developer performance panel). */
export const engineHandle: { current: TwinEngine | null } = { current: null };
