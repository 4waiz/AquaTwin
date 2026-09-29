/* Normalised indicators vs DuPont cleaning criteria along a fouling trajectory (developer utility). */
import { makeTrainState } from "../../src/sim/referencePlant";
import { trueHealth } from "../../src/sim/twin";
for (const phi of [0, 0.03, 0.075, 0.1, 0.155, 0.2, 0.25, 0.3]) {
  const h = trueHealth(makeTrainState(phi));
  console.log(`phi ${phi.toFixed(3)}  NPF ${h.health.toFixed(3)}  NSP ${h.nsp.toFixed(3)}  NDP ${h.ndp.toFixed(3)}`);
}
