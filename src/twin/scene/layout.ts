/**
 * Plant layout: the single source of truth for every coordinate in the 3D
 * twin. World units are metres-ish at model scale; +x follows the process
 * (intake → product), +z points toward the sea, +y is up.
 */
import * as THREE from "three";
import type { AssetId } from "@/sim/scenarios";

export const DECK = { minX: -23, maxX: 23, minZ: -12.5, maxZ: 8.5, top: 0, bottom: -5.2 };
/** Mean sea level: the plant platform is a quay 1.5 m above the water. */
export const SEA_LEVEL = -1.5;

/** RO train rows (z); train 1 is nearest the sea. */
export const TRAIN_Z = [3.1, -0.9, -4.9] as const;
export const RO = {
  x0: 0.9,
  x1: 10.3,
  columnsZ: [-0.72, 0, 0.72],
  rowsY: [0.75, 1.38, 2.01, 2.64],
  vesselRadius: 0.27,
};

export const PUMP_X = -3.4;
export const ERD_X = 12.6;

export const TANKS = {
  pretreat: [
    { x: -11.8, z: 2.4, r: 2.3, h: 3.0 },
    { x: -11.8, z: -3.6, r: 2.3, h: 3.0 },
  ],
  product: { x: 18.4, z: -4.6, r: 3.7, h: 3.8 },
};

export const INTAKE = { x: -19.2, z: 6.3, w: 4.4, d: 3.4, h: 2.4 };
/** Brine outfall (seal-weir) chamber at the quay; the outfall pipeline continues on the seabed. */
export const OUTFALL = { x: 16.2, z: 9.2 };
/** Multiport brine diffuser offshore (ports along a line on the seabed). */
export const DIFFUSER = { x: 21.5, z: 18.5, length: 7.0, angle: 0.32, ports: 5 };
/** Offshore intake head (velocity cap) at the end of the subsea intake pipeline. */
export const INTAKE_HEAD = { x: -26.5, z: 27 };

export interface PipeDef {
  id: string;
  kind: "feed" | "hp" | "permeate" | "brine";
  radius: number;
  points: THREE.Vector3[];
  /** Asset whose state tints this pipe. */
  asset: AssetId;
  /** Train index for per-train flows (hp / permeate / brine). */
  train?: number;
  /** Intro fill order (seconds after activation starts). */
  fillAt: number;
  fillDuration: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RACK_Y = 1.1; // main pipe-rack elevation

export function pipeDefs(): PipeDef[] {
  const pipes: PipeDef[] = [];
  // Sea → intake → pretreatment tank A (top inlet) → tank B.
  pipes.push({
    id: "intake",
    kind: "feed",
    radius: 0.34,
    asset: "intake",
    fillAt: 0.1,
    fillDuration: 0.42,
    points: [v(-19.2, 2.35, 6.9), v(-19.2, 2.9, 6.9), v(-19.2, 2.9, 2.4), v(-14.6, 2.9, 2.4), v(-13.3, 3.3, 2.4)],
  });
  pipes.push({
    id: "intake-b",
    kind: "feed",
    radius: 0.26,
    asset: "intake",
    fillAt: 0.3,
    fillDuration: 0.3,
    points: [v(-16.4, 2.9, 2.4), v(-16.4, 2.9, -3.6), v(-13.3, 3.3, -3.6)],
  });
  // Pretreatment tanks → filtered-water header → HP pump suction manifold.
  pipes.push({
    id: "pretreat-out",
    kind: "feed",
    radius: 0.3,
    asset: "pretreatment",
    fillAt: 0.75,
    fillDuration: 0.4,
    points: [v(-9.4, 0.55, 2.4), v(-7.6, 0.55, 2.4), v(-7.6, 0.55, -3.6), v(-9.4, 0.55, -3.6)],
  });
  pipes.push({
    id: "suction",
    kind: "feed",
    radius: 0.3,
    asset: "pretreatment",
    fillAt: 0.95,
    fillDuration: 0.3,
    points: [v(-7.6, 0.55, -0.6), v(-6.2, 0.55, -0.6), v(-6.2, 0.55, TRAIN_Z[0]), v(-6.2, 0.55, TRAIN_Z[2])],
  });
  // Per-train: pump discharge → RO feed header; permeate → product; brine → ERD → outfall.
  TRAIN_Z.forEach((z, i) => {
    pipes.push({
      id: `hp-${i}`,
      kind: "hp",
      radius: 0.22,
      asset: "pumps",
      train: i,
      fillAt: 1.25 + i * 0.06,
      fillDuration: 0.3,
      points: [v(-6.2, 0.55, z), v(-4.9, 0.55, z), v(-1.7, 0.62, z), v(-0.2, 0.62, z), v(0.3, 1.7, z)],
    });
    pipes.push({
      id: `perm-${i}`,
      kind: "permeate",
      radius: 0.2,
      asset: (["ro1", "ro2", "ro3"] as const)[i],
      train: i,
      fillAt: 1.7 + i * 0.07,
      fillDuration: 0.42,
      points: [v(10.9, 2.3, z + 0.35), v(11.6, RACK_Y + 2.1, z + 0.35), v(14.8, RACK_Y + 2.1, z + 0.35), v(14.8, RACK_Y + 2.1, -4.6), v(15.2, RACK_Y + 2.1, -4.6)],
    });
    pipes.push({
      id: `brine-${i}`,
      kind: "brine",
      radius: 0.2,
      asset: "brine",
      train: i,
      fillAt: 1.8 + i * 0.07,
      fillDuration: 0.38,
      points: [v(10.9, 1.1, z - 0.3), v(11.8, 0.55, z - 0.3), v(ERD_X + 1.6, 0.55, z - 0.3), v(ERD_X + 2.4, 0.55, z - 0.3), v(ERD_X + 2.4, 0.55, 6.6)],
    });
  });
  // Brine header → outfall into the sea.
  pipes.push({
    id: "outfall",
    kind: "brine",
    radius: 0.32,
    asset: "brine",
    fillAt: 2.15,
    fillDuration: 0.35,
    points: [v(ERD_X + 2.4, 0.55, 6.6), v(ERD_X + 2.4, 0.55, 7.7), v(OUTFALL.x, 0.55, 8.6), v(OUTFALL.x, -0.6, OUTFALL.z)],
  });
  return pipes;
}

export interface AssetDef {
  id: AssetId;
  index: string;
  label: string;
  /** Callout anchor (world). */
  anchor: THREE.Vector3;
  /** Camera focus: look-at target and preferred distance. */
  focus: { target: THREE.Vector3; distance: number };
  /** Footprint rectangle for the selection decal (x0, z0, x1, z1). */
  footprint: [number, number, number, number];
  /** Intro: time when the status light switches on is set by the ripple distance. */
  lightAt: THREE.Vector3;
}

export const ASSETS: AssetDef[] = [
  {
    id: "intake",
    index: "01",
    label: "Seawater intake",
    anchor: v(INTAKE.x, INTAKE.h + 0.9, INTAKE.z),
    focus: { target: v(INTAKE.x + 1, 0.8, INTAKE.z), distance: 24 },
    footprint: [INTAKE.x - 2.8, INTAKE.z - 2.2, INTAKE.x + 2.8, INTAKE.z + 2.2],
    lightAt: v(INTAKE.x + 1.6, INTAKE.h + 0.25, INTAKE.z - 1.2),
  },
  {
    id: "pretreatment",
    index: "02",
    label: "Pretreatment",
    anchor: v(-11.8, 3.9, -0.6),
    focus: { target: v(-11.2, 1.4, -0.6), distance: 26 },
    footprint: [-14.6, -6.4, -7.0, 5.2],
    lightAt: v(-9.6, 3.25, -0.6),
  },
  {
    id: "pumps",
    index: "03",
    label: "High-pressure pumps",
    anchor: v(PUMP_X, 2.0, -0.9),
    focus: { target: v(PUMP_X, 0.6, -0.9), distance: 22 },
    footprint: [PUMP_X - 2.3, TRAIN_Z[2] - 1.4, PUMP_X + 2.3, TRAIN_Z[0] + 1.4],
    lightAt: v(PUMP_X + 1.4, 1.5, -0.9),
  },
  {
    id: "ro1",
    index: "04",
    label: "RO train 1",
    anchor: v(5.6, 3.5, TRAIN_Z[0]),
    focus: { target: v(5.6, 1.4, TRAIN_Z[0]), distance: 20 },
    footprint: [RO.x0 - 0.5, TRAIN_Z[0] - 1.35, RO.x1 + 0.6, TRAIN_Z[0] + 1.35],
    lightAt: v(RO.x1 + 0.4, 3.2, TRAIN_Z[0] + 1.0),
  },
  {
    id: "ro2",
    index: "04",
    label: "RO train 2",
    anchor: v(5.6, 3.5, TRAIN_Z[1]),
    focus: { target: v(5.6, 1.4, TRAIN_Z[1]), distance: 20 },
    footprint: [RO.x0 - 0.5, TRAIN_Z[1] - 1.35, RO.x1 + 0.6, TRAIN_Z[1] + 1.35],
    lightAt: v(RO.x1 + 0.4, 3.2, TRAIN_Z[1] + 1.0),
  },
  {
    id: "ro3",
    index: "04",
    label: "RO train 3",
    anchor: v(5.6, 3.5, TRAIN_Z[2]),
    focus: { target: v(5.6, 1.4, TRAIN_Z[2]), distance: 20 },
    footprint: [RO.x0 - 0.5, TRAIN_Z[2] - 1.35, RO.x1 + 0.6, TRAIN_Z[2] + 1.35],
    lightAt: v(RO.x1 + 0.4, 3.2, TRAIN_Z[2] + 1.0),
  },
  {
    id: "product",
    index: "05",
    label: "Product water",
    anchor: v(TANKS.product.x, TANKS.product.h + 1.0, TANKS.product.z),
    focus: { target: v(TANKS.product.x, 1.6, TANKS.product.z), distance: 22 },
    footprint: [TANKS.product.x - 4.4, TANKS.product.z - 4.4, TANKS.product.x + 4.4, TANKS.product.z + 4.4],
    lightAt: v(TANKS.product.x + 2.6, TANKS.product.h + 0.2, TANKS.product.z + 2.6),
  },
  {
    id: "brine",
    index: "06",
    label: "Brine outfall",
    anchor: v(OUTFALL.x + 0.6, 1.6, 8.0),
    focus: { target: v(14.6, 0.2, 5.0), distance: 22 },
    footprint: [ERD_X - 1.4, TRAIN_Z[2] - 1.2, ERD_X + 3.4, 8.6],
    lightAt: v(ERD_X + 1.0, 1.35, TRAIN_Z[0] + 1.1),
  },
];

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, AssetDef>;

/** Where the intro stream lands (world). */
export const POUR_TARGET = new THREE.Vector3(-8.6, DECK.top, -0.6);

/** Default framing target and bounding sphere of the plant. */
export const PLANT_CENTER = new THREE.Vector3(0.4, 0.8, -1.4);
export const PLANT_RADIUS = 26;
