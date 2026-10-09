/**
 * Site plan around the plant: coastline, terrain and seabed heights, roads,
 * fence, rock armour and the offshore pipelines. Everything here is a pure
 * function of world position derived from layout.ts, shared by the terrain
 * mesh, the sea (water depth for colour, transparency and foam) and the
 * context geometry, so shoreline, foam line and rocks always agree.
 *
 * Axes as in layout.ts: +x follows the process, +z points to the sea, +y up,
 * units are metres.
 */
import * as THREE from "three";
import { DECK, DIFFUSER, INTAKE, INTAKE_HEAD, OUTFALL, SEA_LEVEL } from "./layout";
import { fbm2, ridged2, rng, smoothstep, vnoise } from "./noise";

/** Level of the hardstanding (gravel, roads) around the platform; the deck top is 0. */
export const GROUND_Y = -0.06;
/** Fenced plant site. */
export const SITE = { minX: -44, maxX: 44, minZ: -44, maxZ: DECK.maxZ };
/** Rock revetment (|x| range) continuing the quay line on both sides. */
export const REVETMENT = { from: DECK.maxX, to: 48 };

const REV_CREST = -0.7;
const REV_TOE = 6.4;
const BED_AT_WALL = SEA_LEVEL - 3.2;

/** Coastline: z of the waterline as a function of x (straight along the site, a gentle bay beyond). */
export function shoreZ(x: number): number {
  const ax = Math.abs(x);
  let z = DECK.maxZ;
  if (ax > 54) {
    const e = ax - 54;
    z += e * e * 0.00065;
    z += (vnoise(x * 0.011, 3.7, 5) - 0.5) * 12 * smoothstep(54, 170, ax);
  }
  // A headland far to the east carries the distant city.
  if (x > 650) z += (x - 650) * (x - 650) * 0.0012;
  return z;
}

function revetProfile(d: number) {
  if (d <= REV_CREST) return GROUND_Y;
  if (d <= REV_TOE) return GROUND_Y + (BED_AT_WALL + 0.2 - GROUND_Y) * ((d - REV_CREST) / (REV_TOE - REV_CREST));
  return BED_AT_WALL + 0.2 - (d - REV_TOE) * 0.03;
}

function quayProfile(d: number) {
  return d <= 0 ? GROUND_Y : BED_AT_WALL - d * 0.03;
}

const BERM_D = -26;
const BERM_Y = GROUND_Y + 0.22;

function beachProfile(d: number) {
  if (d < BERM_D) return BERM_Y;
  if (d < 0) {
    const t = (d - BERM_D) / -BERM_D; // 0 at the berm, 1 at the waterline
    return BERM_Y + (SEA_LEVEL + 0.02 - BERM_Y) * (0.55 * t + 0.45 * t * t);
  }
  if (d < 38) return SEA_LEVEL + 0.02 - d * 0.042;
  return SEA_LEVEL + 0.02 - 38 * 0.042 - (d - 38) * 0.026;
}

/** Sand relief inland of the site: low undulations near the fence, dunes and a slow rise further away. */
function inlandRelief(x: number, z: number) {
  const ox = Math.max(SITE.minX - x, 0, x - SITE.maxX);
  const oz = Math.max(SITE.minZ - z, 0);
  const out = Math.hypot(ox, oz);
  if (out <= 0) return 0;
  const near = smoothstep(2, 26, out);
  // Wind from the north-west: dune crests run across it.
  const u = x * 0.8 + z * 0.6;
  const w = -x * 0.6 + z * 0.8;
  const warp = fbm2(x * 0.004, z * 0.004, 2, 41) * 60;
  const dunes = ridged2((u + warp) * 0.016, w * 0.034, 3, 7) * 2.6 + fbm2(x * 0.007, z * 0.007, 3, 11) * 1.4;
  const ripple = fbm2(x * 0.05, z * 0.05, 2, 17) * 0.35;
  const dunesMask = smoothstep(18, 70, out);
  // The coastal highway corridor (z ≈ -72) is graded flat.
  const road = 1 - smoothstep(7, 16, Math.abs(z + 72));
  const relief = (ripple * near + dunes * dunesMask) * (1 - road * 0.9);
  const far = Math.max(0, -z - 220) * 0.004 + smoothstep(500, 2600, -z) * 22 * fbm2(x * 0.0012, z * 0.0012, 3, 23);
  return relief + far;
}

/** Ground / seabed height (world y) at (x, z), without structures. */
export function groundHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  const d = z - shoreZ(x);
  const wQ = 1 - smoothstep(22.6, 24.6, ax);
  const wB = smoothstep(REVETMENT.to - 2, REVETMENT.to + 12, ax);
  const wR = Math.max(0, 1 - wQ - wB);
  let y = quayProfile(d) * wQ + revetProfile(d) * wR + beachProfile(d) * wB;
  // Inland relief fades in behind the coastal edge (further back behind a beach).
  const fadeA = -3 + BERM_D * wB;
  const fade = smoothstep(fadeA, fadeA - 30, d);
  if (fade > 0) y += inlandRelief(x, z) * fade;
  // Seabed texture: sand waves and patches.
  if (d > 0) y += (fbm2(x * 0.06, z * 0.06, 2, 59) - 0.5) * 0.35 * smoothstep(0, 8, d);
  return Math.max(y, SEA_LEVEL - 26);
}

/** Masks used by the terrain shading: 1 on the armour slope. */
export function revetmentMask(x: number, z: number) {
  const ax = Math.abs(x);
  const d = z - shoreZ(x);
  const along = smoothstep(REVETMENT.from - 0.5, REVETMENT.from + 0.5, ax) * (1 - smoothstep(REVETMENT.to, REVETMENT.to + 6, ax));
  return along * smoothstep(REV_CREST - 0.6, REV_CREST + 0.2, d) * (1 - smoothstep(REV_TOE + 0.5, REV_TOE + 2.5, d));
}

// ---------------------------------------------------------------------------
// Rock armour (deterministic placement, shared with the sea's depth map)
// ---------------------------------------------------------------------------

export interface Rock {
  x: number;
  y: number;
  z: number;
  /** Semi-axes. */
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  variant: number;
  shade: number;
}

let rockCache: Rock[] | null = null;

export function armourRocks(): Rock[] {
  if (rockCache) return rockCache;
  const r = rng(4242);
  const rocks: Rock[] = [];
  for (const side of [-1, 1]) {
    for (let ax = REVETMENT.from + 0.45; ax < REVETMENT.to + 7; ax += 1.22) {
      // Thin out into scattered boulders where the beach begins.
      const keep = 1 - smoothstep(REVETMENT.to - 1, REVETMENT.to + 7, ax);
      for (let d = REV_CREST - 0.2; d < REV_TOE + 0.8; d += 1.08) {
        if (r() > keep + 0.08) continue;
        const x = side * (ax + (r() - 0.5) * 0.7);
        const dd = d + (r() - 0.5) * 0.6;
        const z = shoreZ(x) + dd;
        const s = 0.5 + r() * 0.42;
        const y = groundHeight(x, z) + s * 0.32;
        rocks.push({
          x,
          y,
          z,
          sx: s * (0.95 + r() * 0.45),
          sy: s * (0.7 + r() * 0.3),
          sz: s * (0.9 + r() * 0.4),
          rx: (r() - 0.5) * 0.9,
          ry: r() * Math.PI * 2,
          rz: (r() - 0.5) * 0.9,
          variant: Math.floor(r() * 3),
          shade: r(),
        });
      }
    }
  }
  // Scour protection around the intake head and the diffuser.
  for (const [cx, cz, n, rad] of [
    [INTAKE_HEAD.x, INTAKE_HEAD.z, 14, 3.2],
    [DIFFUSER.x, DIFFUSER.z, 10, 2.4],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rr = rad * (0.6 + r() * 0.5);
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const s = 0.35 + r() * 0.3;
      rocks.push({ x, y: groundHeight(x, z) + s * 0.2, z, sx: s, sy: s * 0.7, sz: s * 1.1, rx: r(), ry: r() * 6, rz: r(), variant: Math.floor(r() * 3), shade: r() });
    }
  }
  rockCache = rocks;
  return rocks;
}

// ---------------------------------------------------------------------------
// Roads, pads, fence
// ---------------------------------------------------------------------------

export interface RoadDef {
  pts: [number, number][];
  width: number;
  kind: "site" | "highway";
}

export const ROADS: RoadDef[] = [
  // Ring road around the platform.
  {
    pts: [
      [-28, 5.2],
      [-28, -18],
      [28, -18],
      [28, 5.2],
    ],
    width: 6.5,
    kind: "site",
  },
  // Access road: ring road → gate → coastal highway.
  {
    pts: [
      [-28, -18],
      [-28, -44],
      [-28, -72],
    ],
    width: 6.5,
    kind: "site",
  },
  {
    pts: [
      [-2600, -72],
      [2600, -72],
    ],
    width: 11,
    kind: "highway",
  },
];

/** Paved pads (concrete / asphalt) inside the site: [x0, z0, x1, z1, kind]. */
export const PADS: [number, number, number, number, "concrete" | "asphalt"][] = [
  [-24.6, -14.4, 24.6, 8.4, "concrete"], // apron around the platform
  [-22.5, -32.5, -8.5, -22.5, "asphalt"], // car park
  [-42.5, -41.5, -33, -25.5, "concrete"], // workshop yard
  [32.5, -15.5, 42.5, -1.5, "concrete"], // chemical store bund
  [32.5, -36, 42.5, -22.5, "concrete"], // product-water pumping station
  [-3, -41.5, 23, -23.5, "concrete"], // substation (gravel inside its own fence; slab edge)
];

/** Perimeter fence polyline (gate gap on the access road). */
export const FENCE: [number, number][][] = [
  [
    [-44, 7.6],
    [-44, -44],
    [-31.8, -44],
  ],
  [
    [-24.2, -44],
    [44, -44],
    [44, 7.6],
  ],
];

/** Offshore pipelines on the seabed: intake (head → intake well) and brine outfall (chamber → diffuser). */
export function pipelinePaths(): { id: "intake" | "outfall"; pts: THREE.Vector3[]; radius: number }[] {
  const ax = Math.cos(DIFFUSER.angle);
  const az = Math.sin(DIFFUSER.angle);
  const dStart = new THREE.Vector2(DIFFUSER.x - (ax * DIFFUSER.length) / 2, DIFFUSER.z - (az * DIFFUSER.length) / 2);
  const dEnd = new THREE.Vector2(DIFFUSER.x + (ax * DIFFUSER.length) / 2, DIFFUSER.z + (az * DIFFUSER.length) / 2);
  const bed = (x: number, z: number, lift = 0.25) => new THREE.Vector3(x, groundHeight(x, z) + lift, z);
  const run = (a: THREE.Vector2, b: THREE.Vector2, n: number, lift: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push(bed(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, lift));
    }
    return out;
  };
  const intakeStart = new THREE.Vector2(INTAKE.x, DECK.maxZ + 0.6);
  const intakeEnd = new THREE.Vector2(INTAKE_HEAD.x, INTAKE_HEAD.z);
  const outStart = new THREE.Vector2(OUTFALL.x, OUTFALL.z + 1.0);
  return [
    { id: "intake", pts: [new THREE.Vector3(INTAKE.x, BED_AT_WALL + 0.45, DECK.maxZ + 0.1), ...run(intakeStart, intakeEnd, 18, 0.5)], radius: 0.45 },
    { id: "outfall", pts: [new THREE.Vector3(OUTFALL.x, BED_AT_WALL + 0.35, OUTFALL.z + 0.6), ...run(outStart, dStart, 10, 0.32), ...run(dStart, dEnd, 8, 0.32).slice(1)], radius: 0.32 },
  ];
}

/** Diffuser port positions (world, on the seabed). */
export function diffuserPorts(): THREE.Vector3[] {
  const ax = Math.cos(DIFFUSER.angle);
  const az = Math.sin(DIFFUSER.angle);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < DIFFUSER.ports; i++) {
    const t = (i / (DIFFUSER.ports - 1) - 0.5) * DIFFUSER.length * 0.86;
    const x = DIFFUSER.x + ax * t;
    const z = DIFFUSER.z + az * t;
    out.push(new THREE.Vector3(x, groundHeight(x, z) + 0.32, z));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bed-height texture for the sea shader (depth, transparency, foam)
// ---------------------------------------------------------------------------

/** World rectangle covered by the bed texture (x0, z0, x1, z1) at 1 m per texel. */
export const BED_RECT = { x0: -512, z0: -48, x1: 512, z1: 208 };

/** Structures standing in the water (top heights), as axis-aligned boxes: [x0, z0, x1, z1, top]. */
export const WATER_STRUCTURES: [number, number, number, number, number][] = [
  [DECK.minX, -100, DECK.maxX, DECK.maxZ, DECK.top], // quay platform
  [OUTFALL.x - 1.2, DECK.maxZ - 0.5, OUTFALL.x + 1.2, OUTFALL.z + 0.9, 0.35], // outfall chamber
];

export function buildBedTexture(): THREE.DataTexture {
  const W = BED_RECT.x1 - BED_RECT.x0;
  const H = BED_RECT.z1 - BED_RECT.z0;
  const h = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = BED_RECT.z0 + j + 0.5;
    for (let i = 0; i < W; i++) {
      const x = BED_RECT.x0 + i + 0.5;
      h[j * W + i] = groundHeight(x, z);
    }
  }
  const stampBox = (x0: number, z0: number, x1: number, z1: number, top: number) => {
    for (let j = Math.max(0, Math.floor(z0 - BED_RECT.z0)); j < Math.min(H, Math.ceil(z1 - BED_RECT.z0)); j++)
      for (let i = Math.max(0, Math.floor(x0 - BED_RECT.x0)); i < Math.min(W, Math.ceil(x1 - BED_RECT.x0)); i++) h[j * W + i] = Math.max(h[j * W + i], top);
  };
  for (const s of WATER_STRUCTURES) stampBox(...s);
  for (const rk of armourRocks()) {
    const rad = Math.max(rk.sx, rk.sz) * 1.05;
    for (let j = Math.floor(rk.z - rad - BED_RECT.z0); j <= Math.ceil(rk.z + rad - BED_RECT.z0); j++) {
      if (j < 0 || j >= H) continue;
      for (let i = Math.floor(rk.x - rad - BED_RECT.x0); i <= Math.ceil(rk.x + rad - BED_RECT.x0); i++) {
        if (i < 0 || i >= W) continue;
        const dx = BED_RECT.x0 + i + 0.5 - rk.x;
        const dz = BED_RECT.z0 + j + 0.5 - rk.z;
        const q = 1 - (dx * dx + dz * dz) / (rad * rad);
        if (q <= 0) continue;
        h[j * W + i] = Math.max(h[j * W + i], rk.y + rk.sy * Math.sqrt(q) * 0.85);
      }
    }
  }
  const data = new Uint16Array(W * H);
  for (let k = 0; k < W * H; k++) data[k] = THREE.DataUtils.toHalfFloat(h[k]);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Warped grid coordinate: dense around the plant, coarse toward the horizon. */
export function warp(u: number, centre: number, inner: number, extent: number, power = 5) {
  const a = Math.abs(u);
  return centre + Math.sign(u) * (inner * a + (extent - inner) * Math.pow(a, power));
}
