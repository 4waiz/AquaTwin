"use client";
import { create } from "zustand";

/**
 * Guided tour: a short walk through the evidence for first-time visitors and judges.
 * The current step survives navigation and reloads within the session.
 */
const KEY = "aquatwin.tour.v1";

interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  go: (step: number) => void;
  stop: () => void;
  hydrate: () => void;
}

function save(active: boolean, step: number) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ active, step }));
  } catch {
    // storage unavailable (private mode, blocked): the tour still works for this page view
  }
}

export const useTour = create<TourState>((set) => ({
  active: false,
  step: 0,
  start: () => {
    save(true, 0);
    set({ active: true, step: 0 });
  },
  go: (step) => {
    save(true, step);
    set({ active: true, step });
  },
  stop: () => {
    save(false, 0);
    set({ active: false, step: 0 });
  },
  hydrate: () => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      if (v && typeof v.step === "number") set({ active: !!v.active, step: v.step });
    } catch {
      // ignore unreadable state
    }
  },
}));
