/**
 * Closed loop: between hourly decisions AquaTwin re-plans as soon as the
 * measured feed trend would take its current setpoints past a hard limit.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runScenario } from "../src/sim/closedLoop";
import { SCENARIOS } from "../src/sim/scenarios";
import { loadDegradation, loadMlBundle, ROOT } from "../scripts/lib/artifacts";

const haveModels = existsSync(join(ROOT, "public", "data", "models", "aquatwin-ml.json"));

describe.skipIf(!haveModels)("closed loop re-planning", () => {
  const bundle = haveModels ? loadMlBundle() : null!;
  const degradation = haveModels ? loadDegradation() : null!;
  // Night start with full storage: low demand keeps flux low and permeate TDS
  // close to its limit when the salinity ramp begins, just after a decision.
  const opts = {
    scenario: SCENARIOS.salinity,
    model: "hybrid" as const,
    plant: "twin" as const,
    bundle,
    degradation,
    seed: 1,
    startClock_h: 0,
    initialHealth: [0.991, 0.932, 0.977],
    initialReservoirFraction: 0.65,
  };

  it("re-plans between hourly decisions when the feed trend threatens a limit", { timeout: 30_000 }, () => {
    const r = runScenario({ ...opts, strategy: "aquatwin" });
    expect(r.metrics.replans).toBeGreaterThan(0);
    expect(r.decisions.some((d) => d.trigger === "outlook" && Math.abs(d.t - Math.round(d.t)) > 1e-6)).toBe(true);
    expect(r.metrics.tdsViolation_h).toBe(0);
  });

  it("makes no decisions when setpoints are held", { timeout: 30_000 }, () => {
    const r = runScenario({ ...opts, strategy: "fixed" });
    expect(r.decisions).toHaveLength(0);
    expect(r.metrics.tdsViolation_h).toBeGreaterThan(0);
  });
});
