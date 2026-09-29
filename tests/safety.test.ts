/**
 * AquaGuard and forecasting: deterministic verdicts and trend statistics.
 */
import { describe, expect, it } from "vitest";
import { evaluateGuard } from "../src/sim/aquaguard";
import { fitTrend, forecastThreshold } from "../src/sim/forecast";
import { cleaningStatus } from "../src/sim/cleaning";
import { solveTrain0D } from "../src/sim/physics0d";
import { aggregate } from "../src/sim/plant";
import { DESIGN_ENV, DESIGN_SETPOINT, cleanBaseline, trainPowerRating } from "../src/sim/twin";
import { LIMITS } from "../src/sim/config";
import type { TrainSetpoint } from "../src/sim/types";

function plantAt(sp: TrainSetpoint) {
  const { theta } = cleanBaseline();
  const trains = [0, 1, 2].map(() => solveTrain0D(DESIGN_ENV, sp, theta));
  return { snapshot: { trains, totals: aggregate(trains, DESIGN_ENV) }, setpoints: [sp, sp, sp] };
}

const base = {
  minProduction_m3h: 0,
  powerCap_kW: null,
  trainPowerRating_kW: trainPowerRating(),
};

describe("AquaGuard", () => {
  it("approves the design operating point", () => {
    const d = evaluateGuard({ ...plantAt(DESIGN_SETPOINT), ...base, confidence: 1 });
    expect(d.verdict).toBe("APPROVED");
    expect(d.reasons).toHaveLength(0);
  });

  it("rejects a strategy above the feed-pressure limit and says why", () => {
    const sp = { ...DESIGN_SETPOINT, feedPressure_bar: LIMITS.maxFeedPressure_bar + 2 };
    const d = evaluateGuard({ ...plantAt(sp), ...base, confidence: 1 });
    expect(d.verdict).toBe("REJECTED");
    expect(d.rules.find((r) => r.id === "pressure")?.status).toBe("fail");
    expect(d.reasons.join(" ")).toMatch(/Feed pressure/);
  });

  it("rejects a strategy that breaks a power cap", () => {
    const p = plantAt(DESIGN_SETPOINT);
    const d = evaluateGuard({ ...p, ...base, powerCap_kW: p.snapshot.totals.power_kW * 0.8, confidence: 1 });
    expect(d.verdict).toBe("REJECTED");
    expect(d.rules.find((r) => r.id === "powercap")?.status).toBe("fail");
  });

  it("withholds (does not approve) when model confidence is below the threshold", () => {
    const d = evaluateGuard({ ...plantAt(DESIGN_SETPOINT), ...base, confidence: LIMITS.minConfidence - 0.1 });
    expect(d.verdict).toBe("WITHHELD");
  });

  it("checks constraints at the edge of the prediction interval", () => {
    const p = plantAt(DESIGN_SETPOINT);
    const central = evaluateGuard({ ...p, ...base, confidence: 1 });
    const tds = central.rules.find((r) => r.id === "tds")!;
    // A wide log-ratio interval on permeate TDS pushes the checked value above the limit.
    const c = Math.log(LIMITS.maxPermeateTDS_mgL / tds.value) + 0.05;
    const edge = evaluateGuard({ ...p, ...base, confidence: 1, trainMargins: [0, 1, 2].map(() => ({ Q: 0, C: c, D: 0, W: 0 })) });
    expect(edge.rules.find((r) => r.id === "tds")!.value).toBeGreaterThan(LIMITS.maxPermeateTDS_mgL);
    expect(edge.verdict).toBe("REJECTED");
    expect(edge.uncertaintyAware).toBe(true);
  });
});

describe("degradation forecasting", () => {
  it("recovers a linear trend", () => {
    const ts = Array.from({ length: 48 }, (_, i) => i * 0.5);
    const fit = fitTrend(
      ts,
      ts.map((t) => 0.97 - 0.001 * t),
    )!;
    expect(fit.slope).toBeCloseTo(-0.001, 9);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it("predicts the threshold crossing time of a declining signal", () => {
    const ts = Array.from({ length: 48 }, (_, i) => i * 0.5);
    const ys = ts.map((t) => 0.97 - 0.001 * t);
    const tNow = ts[ts.length - 1];
    const fc = forecastThreshold(fitTrend(ts, ys), tNow, ys[ys.length - 1], 0.9, 24);
    // 0.97 − 0.001 t = 0.9 at t = 70 h → 46.5 h after tNow = 23.5 h.
    expect(fc.status).toBe("declining");
    expect(fc.hours!).toBeGreaterThan(46);
    expect(fc.hours!).toBeLessThan(47);
  });

  it("reports a stable signal as stable", () => {
    const ts = Array.from({ length: 48 }, (_, i) => i * 0.5);
    const fc = forecastThreshold(
      fitTrend(
        ts,
        ts.map(() => 0.97),
      ),
      ts[47],
      0.97,
      0.9,
    );
    expect(fc.status).toBe("stable");
    expect(fc.probWithin).toBe(0);
  });
});

describe("cleaning criteria (FilmTec manual)", () => {
  it("is healthy when every indicator is near baseline", () => {
    const c = cleaningStatus(0.99, 1.01, 1.03, null);
    expect(c.due).toBe(false);
    expect(c.label).toBe("Healthy");
  });

  it("is due when normalised flow has dropped 10 %", () => {
    const c = cleaningStatus(0.895, 1.02, 1.05, 0);
    expect(c.due).toBe(true);
    expect(c.reasons[0]).toMatch(/flow/);
  });

  it("is due on pressure drop alone (+15 %), as in lead-end biofouling", () => {
    const c = cleaningStatus(0.955, 1.05, 1.2, 40);
    expect(c.due).toBe(true);
    expect(c.reasons).toContain("pressure drop +20 %");
  });

  it("flags an approaching criterion or a projected flow crossing", () => {
    expect(cleaningStatus(0.97, 1.06, 1.05, null).approaching).toBe(true);
    expect(cleaningStatus(0.97, 1.01, 1.02, 30).label).toBe("Fouling trend detected");
  });
});
