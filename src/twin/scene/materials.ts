/**
 * Materials and procedural textures (no external assets). Physically based
 * materials with realistic, restrained colours; composable shader patches add
 *  - the per-asset selection rim and state tint (highlight),
 *  - the intro's wet-deck activation (wetness),
 *  - procedural weathering: dust and splash grime near the ground, faint
 *    vertical streaks, mottling and roughness variation (world-space noise),
 *  - a tidal band (biofilm, wet darkening, salt crust) on anything standing
 *    in the sea.
 * Each patch extends the material's program cache key, so materials with
 * different patches never share a compiled program.
 */
import * as THREE from "three";
import { SEA_LEVEL } from "./layout";
import { noiseTexture } from "./noise";
import type { WaterOptics } from "./Terrain";

// ---------------------------------------------------------------------------
// Procedural canvas textures
// ---------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number, period: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (i: number) => ((i % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, octaves: number, period: number) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    s += amp * valueNoise(x * f, y * f, seed + o * 17, period * f);
    amp *= 0.5;
    f *= 2;
  }
  return s;
}

export function canvasTexture(w: number, h: number, draw: (img: ImageData) => void, srgb: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  draw(img);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function normalFromHeight(size: number, at: (x: number, y: number) => number, strength: number) {
  return canvasTexture(
    size,
    size,
    (img) => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
          const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
          const len = Math.hypot(dx, dy, 1);
          const i = (y * size + x) * 4;
          img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
          img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
          img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
          img.data[i + 3] = 255;
        }
    },
    false,
  );
}

export interface ConcreteSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/**
 * Concrete slab textures. One tile is 16 world units; expansion joints every
 * 16 / jointsPerTile units, broad mottling, aggregate speckle, sparse pits and
 * a few rust / oil stains.
 */
export function makeConcrete(size = 512, jointsPerTile = 4): ConcreteSet {
  const h = new Float32Array(size * size);
  const stain = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8;
      const v = (y / size) * 8;
      let n = 0.55 * fbm(u, v, 3, 4, 8) + 0.45 * fbm(u * 6, v * 6, 11, 2, 48);
      if (hash(x, y, 91) > 0.9972) n -= 0.4;
      h[y * size + x] = n;
      const s = fbm(u * 0.5, v * 0.5, 77, 3, 4);
      stain[y * size + x] = Math.max(0, s - 0.58) * 3.2;
    }
  const jointAt = (p: number) => {
    const f = (p / size) * jointsPerTile;
    const d = Math.abs(f - Math.round(f)) * (size / jointsPerTile);
    return d < 1.1 ? 1 : d < 2.2 ? 0.4 : 0;
  };
  const map = canvasTexture(
    size,
    size,
    (img) => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const n = h[y * size + x];
          const j = Math.max(jointAt(x), jointAt(y));
          const speck = (hash(x, y, 7) - 0.5) * 14;
          const base = 150 + (n - 0.5) * 42 + speck - j * 48;
          const st = stain[y * size + x];
          const i = (y * size + x) * 4;
          img.data[i] = base * (1 - st * 0.12);
          img.data[i + 1] = base * (0.985 - st * 0.16);
          img.data[i + 2] = base * (0.955 - st * 0.22);
          img.data[i + 3] = 255;
        }
    },
    true,
  );
  const roughnessMap = canvasTexture(
    size,
    size,
    (img) => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const n = h[y * size + x];
          const j = Math.max(jointAt(x), jointAt(y));
          const r = 212 + (n - 0.5) * 50 - j * 20 - stain[y * size + x] * 30;
          const i = (y * size + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, r);
          img.data[i + 3] = 255;
        }
    },
    false,
  );
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)] - Math.max(jointAt(x), jointAt(y)) * 0.3;
  const normalMap = normalFromHeight(size, at, 2.4);
  return { map, roughnessMap, normalMap };
}

/** Wall cladding: vertical panel seams every 1 m (texture tile = 4 m), subtle panel-to-panel tone. */
export function makeCladding(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 256;
  const panels = 4;
  const seam = (x: number) => {
    const f = (x / S) * panels;
    const d = Math.abs(f - Math.round(f)) * (S / panels);
    return d < 1.2 ? 1 : 0;
  };
  const rib = (x: number) => 0.5 + 0.5 * Math.cos(((x / S) * panels * 6) * Math.PI * 2);
  const map = canvasTexture(
    S,
    S,
    (img) => {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const p = Math.floor((x / S) * panels);
          const tone = 232 + (hash(p, 0, 5) - 0.5) * 10 + (fbm((x / S) * 4, (y / S) * 4, 9, 3, 4) - 0.5) * 12 - seam(x) * 70;
          const i = (y * S + x) * 4;
          img.data[i] = tone;
          img.data[i + 1] = tone * 0.985;
          img.data[i + 2] = tone * 0.96;
          img.data[i + 3] = 255;
        }
    },
    true,
  );
  const normalMap = normalFromHeight(S, (x) => rib(((x % S) + S) % S) * 0.25 - seam(((x % S) + S) % S) * 0.6, 3);
  return { map, normalMap };
}

/** Photovoltaic module: 6 × 10 cells with busbars and an aluminium frame (one texture = one module). */
export function makePV(): THREE.CanvasTexture {
  const W = 192;
  const H = 320;
  return canvasTexture(
    W,
    H,
    (img) => {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const frame = x < 4 || y < 4 || x >= W - 4 || y >= H - 4;
          const cx = (x - 4) % 30.7;
          const cy = (y - 4) % 31.2;
          const gap = cx < 1.6 || cy < 1.6;
          const bus = Math.abs(cx - 10) < 0.7 || Math.abs(cx - 20.5) < 0.7;
          let r = 18;
          let g = 30;
          let b = 58;
          if (gap) [r, g, b] = [190, 196, 205];
          else if (bus) [r, g, b] = [120, 128, 140];
          if (frame) [r, g, b] = [170, 175, 182];
          const n = (hash(x >> 2, y >> 2, 3) - 0.5) * 6;
          img.data[i] = r + n;
          img.data[i + 1] = g + n;
          img.data[i + 2] = b + n;
          img.data[i + 3] = 255;
        }
    },
    true,
  );
}

/** Tileable water normal map (used by tank water surfaces). */
export function makeWaterNormal(size = 256): THREE.CanvasTexture {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm((x / size) * 4, (y / size) * 4, 23, 4, 4);
  return normalFromHeight(size, (x, y) => h[((y + size) % size) * size + ((x + size) % size)], 3.5);
}

// ---------------------------------------------------------------------------
// Composable shader patches
// ---------------------------------------------------------------------------

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Chain an onBeforeCompile patch and extend the program cache key. */
export function patch<T extends THREE.Material>(mat: T, key: string, fn: (shader: Shader) => void): T {
  const prev = mat.onBeforeCompile;
  const prevKey = (mat.userData.patchKey as string | undefined) ?? mat.type;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    fn(shader);
  };
  mat.userData.patchKey = `${prevKey}|${key}`;
  mat.customProgramCacheKey = () => mat.userData.patchKey as string;
  return mat;
}

/** World position / normal varyings shared by the patches (added once). */
function ensureWorld(shader: Shader) {
  if (shader.vertexShader.includes("vAqW")) return;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vAqW;\nvarying vec3 vAqN;").replace(
    "#include <worldpos_vertex>",
    `#include <worldpos_vertex>
  {
    vec4 aqW = vec4(transformed, 1.0);
    vec3 aqN = objectNormal;
    #ifdef USE_INSTANCING
      aqW = instanceMatrix * aqW;
      aqN = mat3(instanceMatrix) * aqN;
    #endif
    vAqW = (modelMatrix * aqW).xyz;
    vAqN = normalize(mat3(modelMatrix) * aqN);
  }`,
  );
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vAqW;\nvarying vec3 vAqN;\nfloat aqRough = 0.0;");
}

export interface HighlightUniforms {
  uHighlight: { value: number };
  uHighlightColor: { value: THREE.Color };
  uStateMix: { value: number };
  uStateColor: { value: THREE.Color };
}

export function makeHighlightUniforms(): HighlightUniforms {
  return {
    uHighlight: { value: 0 },
    uHighlightColor: { value: new THREE.Color("#40b4ff") },
    uStateMix: { value: 0 },
    uStateColor: { value: new THREE.Color("#f2a93b") },
  };
}

/**
 * Adds a view-dependent rim (selection) and a state tint (warning / violated
 * constraint) to a standard/physical material. Uniform objects are shared per
 * asset, so one write updates every material of that asset.
 */
export function withHighlight<T extends THREE.MeshStandardMaterial>(mat: T, u: HighlightUniforms): T {
  mat.userData.highlight = u;
  return patch(mat, "hl", (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uHighlight;
uniform vec3 uHighlightColor;
uniform float uStateMix;
uniform vec3 uStateColor;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
  totalEmissiveRadiance += uHighlightColor * uHighlight * (0.05 + 0.75 * fres);
  totalEmissiveRadiance += uStateColor * uStateMix * (0.05 + 0.45 * fres);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uStateColor * 1.6, uStateMix * 0.45);
}`,
      );
  });
}

export interface WetUniforms {
  uRippleOrigin: { value: THREE.Vector3 };
  uRippleRadius: { value: number };
  uRippleWidth: { value: number };
  uWetness: { value: number };
  uWetRadius: { value: number };
}

export function makeWetUniforms(): WetUniforms {
  return {
    uRippleOrigin: { value: new THREE.Vector3() },
    uRippleRadius: { value: -1 },
    uRippleWidth: { value: 1.2 },
    uWetness: { value: 0 },
    uWetRadius: { value: -1 },
  };
}

/**
 * Wet-activation effect for the deck (intro): behind an expanding front the
 * surface darkens slightly and becomes glossier; a thin ring marks the front.
 */
export function withWetness<T extends THREE.MeshStandardMaterial>(mat: T, u: WetUniforms): T {
  return patch(mat, "wet", (shader) => {
    ensureWorld(shader);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uRippleOrigin;
uniform float uRippleRadius;
uniform float uRippleWidth;
uniform float uWetness;
uniform float uWetRadius;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
{
  float dWet = distance(vAqW.xz, uRippleOrigin.xz);
  float wetMask = uWetness * (1.0 - smoothstep(uWetRadius - 3.0, uWetRadius, dWet));
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3, wetMask);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float dW = distance(vAqW.xz, uRippleOrigin.xz);
  float wm = uWetness * (1.0 - smoothstep(uWetRadius - 3.0, uWetRadius, dW));
  diffuseColor.rgb *= mix(1.0, 0.68, wm);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float dR = distance(vAqW.xz, uRippleOrigin.xz);
  float ring = uRippleRadius > 0.0 ? exp(-pow((dR - uRippleRadius) / uRippleWidth, 2.0)) : 0.0;
  float fade = uRippleRadius > 0.0 ? clamp(1.0 - uRippleRadius / 46.0, 0.0, 1.0) : 0.0;
  totalEmissiveRadiance += vec3(0.25, 0.6, 1.0) * ring * fade * 0.55;
}`,
      );
  });
}

const sharedWeather = { uAqNoise: { value: null as THREE.Texture | null } };

/**
 * Procedural weathering: mottling, dust and splash grime within a metre of
 * the ground, faint vertical streaks on walls and roughness variation.
 * `amount` 0..1; `ground` is the world height of the surface below.
 */
export function withWeathering<T extends THREE.MeshStandardMaterial>(mat: T, amount = 0.6, ground = 0): T {
  sharedWeather.uAqNoise.value ??= noiseTexture();
  const u = { uAqWeather: { value: amount }, uAqGround: { value: ground } };
  return patch(mat, "weather", (shader) => {
    ensureWorld(shader);
    Object.assign(shader.uniforms, sharedWeather, u);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uAqNoise;
uniform float uAqWeather;
uniform float uAqGround;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec3 an = abs(vAqN);
  vec2 uvA = an.y > 0.65 ? vAqW.xz : (an.x > an.z ? vAqW.zy : vAqW.xy);
  vec4 wn = texture2D(uAqNoise, uvA * 0.31);
  vec4 wf = texture2D(uAqNoise, uvA * 2.1);
  float base = 1.0 - smoothstep(0.0, 0.95, vAqW.y - uAqGround);
  float st = texture2D(uAqNoise, vec2((vAqW.x + vAqW.z) * 0.6, vAqW.y * 0.045)).b;
  float streak = smoothstep(0.56, 0.86, st) * (1.0 - an.y);
  float w = uAqWeather;
  diffuseColor.rgb *= 1.0 + ((wn.r - 0.5) * 0.18 + (wf.b - 0.5) * 0.08) * w;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.74, 0.64), base * 0.6 * w);
  diffuseColor.rgb *= 1.0 - streak * 0.13 * w;
  aqRough += (wn.g - 0.5) * 0.24 * w + base * 0.12 * w;
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + aqRough, 0.04, 1.0);`,
      );
  });
}

/** Tidal band on structures in the sea: wet darkening below, biofilm at the waterline, salt above. */
export function withWaterline<T extends THREE.MeshStandardMaterial>(mat: T): T {
  sharedWeather.uAqNoise.value ??= noiseTexture();
  return patch(mat, "waterline", (shader) => {
    ensureWorld(shader);
    Object.assign(shader.uniforms, sharedWeather, { uAqSea: { value: SEA_LEVEL } });
    if (!shader.fragmentShader.includes("uniform sampler2D uAqNoise;")) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uAqNoise;");
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uAqSea;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float h = vAqW.y - uAqSea;
  float nz = texture2D(uAqNoise, vec2(vAqW.x + vAqW.z, vAqW.y * 4.0) * 0.21).r;
  float band = smoothstep(-0.7, -0.25, h) * (1.0 - smoothstep(0.3, 0.75 + nz * 0.35, h));
  float below = 1.0 - smoothstep(-0.35, 0.05, h);
  // Biofouled below the waterline: dark olive growth.
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.04) * (0.7 + 0.6 * nz), below * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.055, 0.035), band * 0.8);
  float salt = smoothstep(0.7, 0.95, h) * (1.0 - smoothstep(1.0, 1.9, h)) * smoothstep(0.4, 0.8, nz);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.71, 0.67), salt * 0.3);
  aqRough -= band * 0.45;
}`,
      );
  });
}

/**
 * Below sea level, attenuate the lit colour along the light and view paths
 * through the water and add the water's in-scattered light (same optics as
 * the seabed), so pipelines, rocks and walls fade into the sea naturally.
 */
export function withUnderwater<T extends THREE.MeshStandardMaterial>(mat: T, optics: WaterOptics): T {
  if (mat.userData.underwater) return mat;
  mat.userData.underwater = true;
  return patch(mat, "underwater", (shader) => {
    ensureWorld(shader);
    Object.assign(shader.uniforms, {
      uUwSea: optics.uSeaLevel,
      uUwAbsorb: optics.uAbsorb,
      uUwScatter: optics.uScatter,
      uUwTurbid: optics.uTurbid,
      uUwTurbidity: optics.uTurbidity,
      uUwSunDir: optics.uSunDir,
      uUwLight: optics.uLight,
    });
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uUwSea;
uniform vec3 uUwAbsorb;
uniform vec3 uUwScatter;
uniform vec3 uUwTurbid;
uniform float uUwTurbidity;
uniform vec3 uUwSunDir;
uniform float uUwLight;`,
      )
      .replace(
        "#include <tonemapping_fragment>",
        `{
  float uwDepth = uUwSea - vAqW.y;
  if (uwDepth > 0.0) {
    vec3 uwV = normalize(cameraPosition - vAqW);
    vec3 sigma = uUwAbsorb * (1.0 + uUwTurbidity * 5.0);
    vec3 tDown = exp(-sigma * uwDepth / max(uUwSunDir.y, 0.2));
    vec3 tUp = exp(-sigma * uwDepth / max(uwV.y, 0.05));
    gl_FragColor.rgb = gl_FragColor.rgb * tDown * tUp + mix(uUwScatter, uUwTurbid, uUwTurbidity) * uUwLight * (1.0 - tUp);
  }
}
#include <tonemapping_fragment>`,
      );
  });
}

// ---------------------------------------------------------------------------
// Material palette
// ---------------------------------------------------------------------------

type Std = THREE.MeshStandardMaterial;
type Phys = THREE.MeshPhysicalMaterial;

export interface Palette {
  concreteSet: ConcreteSet;
  /** Plant platform (concrete, intro wet effect). */
  deck: Std;
  /** Platform edges, plinths, foundations. */
  deckSide: Std;
  /** Quay wall and structures in the sea (tidal band). */
  quayWall: Std;
  concrete: () => Std;
  base: Std;
  /** Painted steel (colour, roughness, metalness, weathering). */
  paint: (hex: string, rough?: number, metal?: number, weather?: number) => Std;
  paintDark: () => Std;
  paintMid: () => Std;
  /** Equipment blue (RO frames, skids). */
  frameBlue: () => Std;
  galv: () => Std;
  stainless: () => Std;
  steel: () => Std;
  yellow: () => Std;
  rubber: () => Std;
  tankShell: () => Phys;
  tankInner: () => Std;
  /** FRP pressure vessels. */
  vessel: () => Phys;
  endCap: () => Std;
  motor: () => Std;
  pumpCasing: () => Std;
  building: () => Std;
  roof: () => Std;
  /** Window glass with interior light (emissive driven by the intro). */
  glass: Phys;
  pv: () => Phys;
}

export function makePalette(wet: WetUniforms): Palette {
  const concreteSet = makeConcrete(512, 4);
  const cladding = makeCladding();
  const pvTex = makePV();
  // Deck: one concrete tile per 16 world units → joints every 4 units.
  const deckTex = [concreteSet.map, concreteSet.roughnessMap, concreteSet.normalMap].map((t) => {
    const c = t.clone();
    c.repeat.set(46 / 16, 21 / 16);
    c.needsUpdate = true;
    return c;
  });
  const deck = withWeathering(
    withWetness(
      new THREE.MeshStandardMaterial({
        map: deckTex[0],
        roughnessMap: deckTex[1],
        normalMap: deckTex[2],
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 1,
        metalness: 0,
        color: new THREE.Color("#e2ded6"),
      }),
      wet,
    ),
    0.35,
    -1,
  );
  const sideTex = [concreteSet.map, concreteSet.normalMap].map((t) => {
    const c = t.clone();
    c.repeat.set(0.25, 0.25);
    c.needsUpdate = true;
    return c;
  });
  const deckSide = withWeathering(
    new THREE.MeshStandardMaterial({ map: sideTex[0], normalMap: sideTex[1], normalScale: new THREE.Vector2(0.4, 0.4), color: new THREE.Color("#d2cec5"), roughness: 0.92, metalness: 0 }),
    0.6,
    0,
  );
  const quayWall = withWaterline(
    withWeathering(
      new THREE.MeshStandardMaterial({ map: sideTex[0], normalMap: sideTex[1], normalScale: new THREE.Vector2(0.6, 0.6), color: new THREE.Color("#c6c1b7"), roughness: 0.9, metalness: 0 }),
      0.45,
      -1.4,
    ),
  );
  const concrete = () =>
    withWeathering(
      new THREE.MeshStandardMaterial({ map: sideTex[0], normalMap: sideTex[1], normalScale: new THREE.Vector2(0.35, 0.35), color: new THREE.Color("#d4d0c8"), roughness: 0.9, metalness: 0 }),
      0.5,
      0,
    );
  const base = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a3a38"), roughness: 0.96, metalness: 0 });
  const paint = (hex: string, rough = 0.55, metal = 0.15, weather = 0.5) =>
    withWeathering(new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal }), weather, 0);
  return {
    concreteSet,
    deck,
    deckSide,
    quayWall,
    concrete,
    base,
    paint,
    paintDark: () => paint("#4a5058", 0.6, 0.25, 0.5),
    paintMid: () => paint("#8a9097", 0.6, 0.2, 0.45),
    frameBlue: () => paint("#2a5a86", 0.5, 0.25, 0.45),
    galv: () => paint("#a9adae", 0.48, 0.85, 0.55),
    stainless: () => paint("#c8ccd0", 0.3, 1.0, 0.2),
    steel: () => paint("#8d949b", 0.42, 0.75, 0.35),
    yellow: () => paint("#e0ad12", 0.5, 0.1, 0.4),
    rubber: () => paint("#1c1d1f", 0.8, 0.0, 0.2),
    tankShell: () =>
      withWeathering(
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#e6e3dc"),
          roughness: 0.42,
          metalness: 0.05,
          clearcoat: 0.25,
          clearcoatRoughness: 0.4,
        }),
        0.55,
        0,
      ),
    tankInner: () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#6f777f"), roughness: 0.85, metalness: 0.05, side: THREE.BackSide }),
    vessel: () =>
      withWeathering(
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#ebe8df"),
          roughness: 0.36,
          metalness: 0.0,
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
        }),
        0.25,
        0,
      ),
    endCap: () => paint("#30353b", 0.4, 0.45, 0.25),
    motor: () => paint("#1f4f7c", 0.42, 0.35, 0.35),
    pumpCasing: () => paint("#9aa2a8", 0.36, 0.85, 0.3),
    building: () =>
      withWeathering(
        new THREE.MeshStandardMaterial({ map: cladding.map, normalMap: cladding.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: new THREE.Color("#ece8df"), roughness: 0.62, metalness: 0.1 }),
        0.55,
        0,
      ),
    roof: () => paint("#b7b6b0", 0.88, 0.02, 0.6),
    glass: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#18262f"),
      emissive: new THREE.Color("#a9cbe8"),
      emissiveIntensity: 0.0,
      roughness: 0.05,
      metalness: 0.1,
      ior: 1.52,
      envMapIntensity: 1.3,
    }),
    pv: () => {
      const t = pvTex.clone();
      t.needsUpdate = true;
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    },
  };
}
