"use client";
/**
 * Run records for the Reports page. Each Scenario Lab simulation produces a
 * compact, self-describing record, persisted per browser in localStorage
 * (a convenience only — records can always be regenerated).
 */
import { create } from "zustand";
import type { ScenarioResult } from "@/runtime/protocol";
import { SCENARIOS, type ScenarioId } from "@/sim/scenarios";
import { VIOLATION_LABEL } from "@/sim/aquaguard";
import { FOCUS_LABEL } from "@/sim/optimizer";

export interface RunRecord {
  id: string;
  scenario: ScenarioId;
  scenarioName: string;
  createdAt: number;
  startClock_h: number;
  computeMs: number;
  initial: { production: number; tds: number; sec: number; reservoir: number; health: number[]; salinity: number; temperature: number };
  disturbance: string;
  represents: string;
  noAction: BranchSummary;
  aquatwin: BranchSummary;
  decisions: { t: number; verdict: string; action: string; confidence: number; trigger?: "schedule" | "outlook" }[];
}

export interface BranchSummary {
  production_m3: number;
  energy_MWh: number;
  sec: number;
  maxTds: number;
  minReservoir: number;
  violationHours: number;
  violations: string[];
  firstViolation: number | null;
  cipCrossing: (number | null)[];
  final: { production: number; tds: number; sec: number; reservoir: number; health: number[] };
}

const KEY = "aquatwin.runs.v2";

function summarise(b: ScenarioResult["noAction"]): BranchSummary {
  const last = b.points[b.points.length - 1];
  return {
    production_m3: b.metrics.production_m3,
    energy_MWh: b.metrics.energy_MWh,
    sec: b.metrics.sec,
    maxTds: b.metrics.maxTds,
    minReservoir: b.metrics.minReservoir,
    violationHours: b.metrics.violationHours,
    violations: Object.keys(b.metrics.violationBy).map((k) => `${VIOLATION_LABEL[k] ?? k}: ${b.metrics.violationBy[k].toFixed(1)} h`),
    firstViolation: b.metrics.firstViolation,
    cipCrossing: b.metrics.cipCrossing,
    final: { production: last.production, tds: last.tds, sec: last.sec, reservoir: last.reservoir, health: last.health },
  };
}

function load(): RunRecord[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}

interface RunsState {
  records: RunRecord[];
  hydrated: boolean;
  hydrate: () => void;
  record: (r: ScenarioResult) => void;
  clear: () => void;
}

export const useRuns = create<RunsState>((set, get) => ({
  records: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ records: load(), hydrated: true });
  },
  record: (r) => {
    const first = r.noAction.points[0];
    const sc = SCENARIOS[r.scenario];
    const rec: RunRecord = {
      id: `${r.scenario}-${r.createdAt}`,
      scenario: r.scenario,
      scenarioName: sc.name,
      createdAt: r.createdAt,
      startClock_h: r.startClock_h,
      computeMs: r.computeMs,
      initial: {
        production: first.production,
        tds: first.tds,
        sec: first.sec,
        reservoir: first.reservoir,
        health: first.health,
        salinity: first.salinity,
        temperature: first.temperature,
      },
      disturbance: `${sc.tag} — ${sc.summary}`,
      represents: sc.represents,
      noAction: summarise(r.noAction),
      aquatwin: summarise(r.aquatwin),
      decisions: r.aquatwin.decisions.map((d) => ({
        t: d.t,
        trigger: d.trigger,
        verdict: d.verdict,
        action: d.chosen
          ? `${d.chosen.P.toFixed(1)} bar · ${d.chosen.Qv.toFixed(1)} m³/h per vessel · ${
              d.chosen.focusMode === "normal" ? "all trains equal" : FOCUS_LABEL[d.chosen.focusMode].replace("Focus train", `Train ${(d.focusTrain ?? 0) + 1}`)
            }`
          : d.message,
        confidence: d.confidence,
      })),
    };
    const records = [rec, ...get().records.filter((x) => x.id !== rec.id)].slice(0, 30);
    set({ records });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  },
  clear: () => {
    set({ records: [] });
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
}));
