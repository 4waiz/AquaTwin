"use client";
import { create } from "zustand";
import type { HistoryPoint, LiveSnapshot } from "@/runtime/protocol";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

interface LiveState {
  status: LoadStatus;
  error: string | null;
  snapshot: LiveSnapshot | null;
  history: HistoryPoint[];
  modelMeta: Record<string, unknown> | null;
  loadMs: number | null;
  speed: number;
  setStatus: (s: LoadStatus, error?: string) => void;
  setReady: (meta: unknown, loadMs: number) => void;
  pushSnapshot: (s: LiveSnapshot, append?: HistoryPoint) => void;
  setHistory: (h: HistoryPoint[]) => void;
  setSpeedLocal: (s: number) => void;
}

export const useLive = create<LiveState>((set) => ({
  status: "idle",
  error: null,
  snapshot: null,
  history: [],
  modelMeta: null,
  loadMs: null,
  speed: 1,
  setStatus: (status, error) => set({ status, error: error ?? null }),
  setReady: (meta, loadMs) => set({ status: "ready", modelMeta: meta as Record<string, unknown>, loadMs }),
  pushSnapshot: (snapshot, append) =>
    set((st) => {
      if (!append) return { snapshot };
      const cutoff = append.t - 24 * 3_600_000;
      const history = st.history.filter((h) => h.t >= cutoff);
      history.push(append);
      return { snapshot, history };
    }),
  setHistory: (history) => set({ history }),
  setSpeedLocal: (speed) => set({ speed }),
}));
