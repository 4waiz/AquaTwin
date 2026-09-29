/**
 * Plant activation: after impact, a single restrained ripple travels across
 * the deck. Behind it the concrete briefly reads as wet (glossier, darker);
 * as the front reaches each piece of equipment its status light switches on.
 * Scene exposure and image-based lighting ramp up from "dark and dry" to the
 * operating look. Pure function of intro time.
 */
import * as THREE from "three";
import type { AssetId } from "@/sim/scenarios";
import { ASSETS, POUR_TARGET } from "../scene/layout";
import { easeInOutCubic, easeOutCubic, INTRO, window01 } from "./timeline";

export interface ActivationState {
  exposure: number;
  keyLight: number;
  envIntensity: number;
  rippleRadius: number;
  wetness: number;
  wetRadius: number;
  beacons: Record<AssetId, number>;
  windows: number;
  lamps: number;
  shellOpacity: number;
}

const BEACON_DIST = Object.fromEntries(ASSETS.map((a) => [a.id, new THREE.Vector2(a.lightAt.x - POUR_TARGET.x, a.lightAt.z - POUR_TARGET.z).length()])) as Record<
  AssetId,
  number
>;
const WINDOW_DIST = new THREE.Vector2(-17.6 - POUR_TARGET.x, -6.6 - POUR_TARGET.z).length();

export const FULL_ACTIVATION: ActivationState = {
  exposure: 1,
  keyLight: 1,
  envIntensity: 1,
  rippleRadius: -1,
  wetness: 0,
  wetRadius: -1,
  beacons: Object.fromEntries(ASSETS.map((a) => [a.id, 1])) as Record<AssetId, number>,
  windows: 1,
  lamps: 1,
  shellOpacity: 1,
};

export function activationAt(t: number): ActivationState {
  const light = easeInOutCubic(window01(t, INTRO.lightUp[0], INTRO.lightUp[1]));
  const sinceImpact = t - INTRO.impact;
  const radius = sinceImpact > 0 ? sinceImpact * INTRO.rippleSpeed : -1;
  const wetIn = sinceImpact > 0 ? 1 : 0;
  const wetOut = 1 - easeOutCubic(window01(t, INTRO.wetFade[0], INTRO.wetFade[1]));
  const on = (d: number) => (radius < 0 ? 0 : easeOutCubic(Math.min(1, Math.max(0, (radius - d) / 4))));
  const beacons = {} as Record<AssetId, number>;
  for (const a of ASSETS) beacons[a.id] = on(BEACON_DIST[a.id]);
  return {
    // The plant is visible but in low light before activation.
    exposure: 0.34 + 0.66 * light,
    keyLight: 0.22 + 0.78 * light,
    envIntensity: 0.25 + 0.75 * light,
    rippleRadius: radius > 60 ? -1 : radius,
    wetness: wetIn * wetOut,
    wetRadius: radius,
    beacons,
    windows: on(WINDOW_DIST),
    lamps: easeOutCubic(window01(t, INTRO.lightUp[0] + 0.3, INTRO.lightUp[1])),
    shellOpacity: 0.55 + 0.45 * light,
  };
}
