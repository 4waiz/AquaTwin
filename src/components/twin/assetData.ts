"use client";
/**
 * Asset-level readouts shared by the callouts, the inspector and the process
 * schematic. Values come from the live snapshot (simulated telemetry) or from
 * a Scenario Lab step, never from constants.
 */
import type { LiveSnapshot, ScenarioPoint } from "@/runtime/protocol";
import type { AssetId } from "@/sim/scenarios";
import { fmt, fmtInt } from "@/lib/format";
import type { CalloutItem } from "@/twin/react/Callouts";
import { trainToneOf } from "@/components/overview/MembraneHealthMini";
import { cleaningStatus } from "@/sim/cleaning";

export interface InspectorRow {
  k: string;
  v: string;
  unit?: string;
  tone?: "ok" | "warn" | "crit";
}

export interface InspectorData {
  title: string;
  index: string;
  state: string;
  tone: "ok" | "warn" | "crit";
  rows: InspectorRow[];
}

const TRAIN_OF: Partial<Record<AssetId, number>> = { ro1: 0, ro2: 1, ro3: 2 };

export function calloutItems(s: LiveSnapshot | null): CalloutItem[] {
  const t = s?.totals;
  const feed = s ? s.trains.reduce((a, x) => a + x.feedFlow_m3h, 0) : NaN;
  const pmax = s ? Math.max(...s.trains.map((x) => x.feedPressure_bar)) : NaN;
  const worstTrain = s ? s.health.reduce((w, h, i) => (h.npf < s.health[w].npf ? i : w), 0) : 0;
  return [
    { id: "intake", index: "01", label: "Intake", value: s ? `${fmtInt(feed)} m³/h · ${fmt(s.env.salinity_gL, 1)} g/L` : undefined },
    { id: "pretreatment", index: "02", label: "Pretreatment", value: s ? `${fmt(s.env.turbidity_NTU, 1)} NTU feed` : undefined },
    { id: "pumps", index: "03", label: "HP pumps", value: s ? `${fmt(pmax, 1)} bar` : undefined },
    {
      id: "ro2",
      index: "04",
      label: "RO trains",
      value: s ? `${fmtInt(t!.production_m3h)} m³/h permeate` : undefined,
      tone: s
        ? trainToneOf(s.health[worstTrain].npf, s.healthTrend[worstTrain].hours, s.health[worstTrain].nsp, s.health[worstTrain].ndp) === "ok"
          ? undefined
          : "warn"
        : undefined,
    },
    { id: "product", index: "05", label: "Product", value: s ? `${fmt(s.reservoirFraction * 100, 0)}% · ${fmtInt(t!.permeateTDS_mgL)} mg/L` : undefined },
    { id: "brine", index: "06", label: "Brine", value: s ? `${fmtInt(t!.brineFlow_m3h)} m³/h · ${fmt(t!.brineTDS_gL, 1)} g/L` : undefined },
  ];
}

export function inspectorFromLive(id: AssetId, s: LiveSnapshot): InspectorData {
  const t = s.totals;
  const ti = TRAIN_OF[id];
  if (ti !== undefined) {
    const tr = s.trains[ti];
    const h = s.health[ti];
    const trend = s.healthTrend[ti];
    const tone = trainToneOf(h.npf, trend.hours, h.nsp, h.ndp);
    const state = cleaningStatus(h.npf, h.nsp, h.ndp, trend.hours).label;
    return {
      title: `RO train ${ti + 1}`,
      index: "04",
      state,
      tone,
      rows: [
        { k: "Feed pressure", v: fmt(tr.feedPressure_bar, 1), unit: "bar" },
        { k: "Recovery", v: fmt(tr.recovery * 100, 1), unit: "%" },
        { k: "Permeate flow", v: fmtInt(tr.permeateFlow_m3h), unit: "m³/h" },
        { k: "Permeate TDS", v: fmtInt(tr.permeateTDS_mgL), unit: "mg/L" },
        { k: "Vessel ΔP", v: fmt(tr.vesselDP_bar, 2), unit: "bar" },
        { k: "Normalised permeate flow", v: fmt(h.npf * 100, 1), unit: "%", tone },
        { k: "Normalised ΔP", v: fmt(h.ndp, 2), unit: "×" },
        { k: "Normalised salt passage", v: fmt(h.nsp, 2), unit: "×" },
      ],
    };
  }
  switch (id) {
    case "intake": {
      const feed = s.trains.reduce((a, x) => a + x.feedFlow_m3h, 0);
      const tone = s.env.turbidity_NTU > 6 ? "warn" : "ok";
      return {
        title: "Seawater intake",
        index: "01",
        state: tone === "ok" ? "Normal" : "Elevated turbidity",
        tone,
        rows: [
          { k: "Feed flow", v: fmtInt(feed), unit: "m³/h" },
          { k: "Salinity", v: fmt(s.env.salinity_gL, 2), unit: "g/L" },
          { k: "Temperature", v: fmt(s.env.temperature_C, 1), unit: "°C" },
          { k: "Turbidity", v: fmt(s.env.turbidity_NTU, 1), unit: "NTU" },
          { k: "pH", v: fmt(s.env.pH, 2) },
          { k: "Intake energy", v: fmt(t.energyBreakdown_kWh_m3.intake, 3), unit: "kWh/m³" },
        ],
      };
    }
    case "pretreatment":
      return {
        title: "Pretreatment",
        index: "02",
        state: s.env.turbidity_NTU > 6 ? "High load" : "Normal",
        tone: s.env.turbidity_NTU > 6 ? "warn" : "ok",
        rows: [
          { k: "Treated flow", v: fmtInt(s.trains.reduce((a, x) => a + x.feedFlow_m3h, 0)), unit: "m³/h" },
          { k: "Feed turbidity", v: fmt(s.env.turbidity_NTU, 1), unit: "NTU" },
          { k: "Pretreatment energy", v: fmt(t.energyBreakdown_kWh_m3.pretreatment, 3), unit: "kWh/m³" },
          { k: "Process", v: "DAF + dual-media filtration" },
        ],
      };
    case "pumps": {
      const warn = s.trains.some((x) => x.motorLimited);
      return {
        title: "High-pressure pumps",
        index: "03",
        state: warn ? "Motor at rating" : "Normal",
        tone: warn ? "warn" : "ok",
        rows: [
          ...s.trains.map((x, i) => ({ k: `Pump ${i + 1} discharge`, v: fmt(x.feedPressure_bar, 1), unit: "bar" })),
          ...s.trains.map((x, i) => ({ k: `Pump ${i + 1} speed`, v: fmt(x.pumpSpeedRel * 100, 0), unit: "%" })),
          { k: "HP + booster energy", v: fmt(t.energyBreakdown_kWh_m3.hpPump + t.energyBreakdown_kWh_m3.booster, 2), unit: "kWh/m³" },
        ],
      };
    }
    case "product":
      return {
        title: "Product water",
        index: "05",
        state: s.reservoirFraction < 0.35 ? "Storage low" : "Normal",
        tone: s.reservoirFraction < 0.25 ? "crit" : s.reservoirFraction < 0.35 ? "warn" : "ok",
        rows: [
          { k: "Production", v: fmtInt(t.production_m3h * 24), unit: "m³/d" },
          { k: "Demand", v: fmtInt(s.demand_m3h * 24), unit: "m³/d" },
          { k: "Storage level", v: fmt(s.reservoirFraction * 100, 1), unit: "%" },
          { k: "Permeate TDS", v: fmtInt(t.permeateTDS_mgL), unit: "mg/L" },
          { k: "Post-treatment energy", v: fmt(t.energyBreakdown_kWh_m3.postTreatment, 2), unit: "kWh/m³" },
        ],
      };
    case "brine":
    default:
      return {
        title: "Brine outfall",
        index: "06",
        state: "Normal",
        tone: "ok",
        rows: [
          { k: "Brine flow", v: fmtInt(t.brineFlow_m3h), unit: "m³/h" },
          { k: "Brine salinity", v: fmt(t.brineTDS_gL, 1), unit: "g/L" },
          { k: "Concentration factor", v: fmt(t.brineTDS_gL / s.env.salinity_gL, 2), unit: "×" },
          { k: "Energy recovered (ERD)", v: fmt(t.energyBreakdown_kWh_m3.erdRecovered, 2), unit: "kWh/m³" },
        ],
      };
  }
}

export function inspectorFromScenario(id: AssetId, p: ScenarioPoint): InspectorData {
  const ti = TRAIN_OF[id];
  if (ti !== undefined) {
    const h = p.health[ti];
    const tone: "ok" | "warn" | "crit" = !p.online[ti] ? "ok" : h < 0.9 ? "warn" : h < 0.93 ? "warn" : "ok";
    return {
      title: `RO train ${ti + 1}`,
      index: "04",
      state: !p.online[ti] ? "Offline (cleaning / standby)" : h < 0.9 ? "Below cleaning threshold" : h < 0.93 ? "Fouling trend" : "Healthy",
      tone,
      rows: [
        { k: "Feed pressure", v: fmt(p.pressure[ti], 1), unit: "bar" },
        { k: "Permeate flow", v: fmtInt(p.trainProduction[ti]), unit: "m³/h" },
        { k: "Permeate TDS", v: fmtInt(p.trainTds[ti]), unit: "mg/L" },
        { k: "Vessel ΔP", v: fmt(p.dp[ti], 2), unit: "bar" },
        { k: "Normalised permeate flow", v: fmt(h * 100, 1), unit: "%", tone },
      ],
    };
  }
  return {
    title:
      id === "product"
        ? "Product water"
        : id === "pumps"
          ? "High-pressure pumps"
          : id === "intake"
            ? "Seawater intake"
            : id === "pretreatment"
              ? "Pretreatment"
              : "Brine outfall",
    index: "",
    state: "Scenario forecast",
    tone: "ok",
    rows: [
      { k: "Production", v: fmtInt(p.production), unit: "m³/h" },
      { k: "Salinity", v: fmt(p.salinity, 1), unit: "g/L" },
      { k: "Turbidity", v: fmt(p.turbidity, 1), unit: "NTU" },
      { k: "Storage level", v: fmt(p.reservoir, 1), unit: "%" },
      { k: "Max feed pressure", v: fmt(Math.max(...p.pressure), 1), unit: "bar" },
    ],
  };
}
