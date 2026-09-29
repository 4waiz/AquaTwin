/**
 * Materials and procedural textures. Simple geometry earns its quality from
 * physically based materials: roughness variation, subtle normal detail,
 * clearcoat only where real equipment has it, and restrained colour.
 */
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Procedural textures (canvas; no external assets)
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

function canvasTexture(size: number, draw: (img: ImageData) => void, srgb: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  draw(img);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Height field for concrete: broad mottling + fine grain + sparse pits. */
function concreteHeight(size: number) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8;
      const v = (y / size) * 8;
      let n = 0.55 * fbm(u, v, 3, 4, 8) + 0.45 * fbm(u * 6, v * 6, 11, 2, 48);
      if (hash(x, y, 91) > 0.9975) n -= 0.35;
      h[y * size + x] = n;
    }
  }
  return h;
}

export interface ConcreteSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/**
 * Concrete deck textures. One tile covers `tileWorld` world units; expansion
 * joints are drawn every 4 world units (tile / 4).
 */
export function makeConcrete(size = 512, jointsPerTile = 4): ConcreteSet {
  const h = concreteHeight(size);
  const jointAt = (p: number) => {
    const f = (p / size) * jointsPerTile;
    const d = Math.abs(f - Math.round(f)) * (size / jointsPerTile);
    return d < 1.1 ? 1 : d < 2.2 ? 0.45 : 0;
  };
  const map = canvasTexture(
    size,
    (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = h[y * size + x];
          const j = Math.max(jointAt(x), jointAt(y));
          const base = 58 + n * 26 - j * 16;
          const i = (y * size + x) * 4;
          img.data[i] = base * 0.96;
          img.data[i + 1] = base * 0.99;
          img.data[i + 2] = base * 1.06;
          img.data[i + 3] = 255;
        }
      }
    },
    true,
  );
  const roughnessMap = canvasTexture(
    size,
    (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = h[y * size + x];
          const j = Math.max(jointAt(x), jointAt(y));
          const r = 205 + n * 40 - j * 30;
          const i = (y * size + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, r);
          img.data[i + 3] = 255;
        }
      }
    },
    false,
  );
  const normalMap = canvasTexture(
    size,
    (img) => {
      const s = 2.2;
      const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)] - Math.max(jointAt(x), jointAt(y)) * 0.25;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * s;
          const dy = (at(x, y + 1) - at(x, y - 1)) * s;
          const len = Math.hypot(dx, dy, 1);
          const i = (y * size + x) * 4;
          img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
          img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
          img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
          img.data[i + 3] = 255;
        }
      }
    },
    false,
  );
  return { map, roughnessMap, normalMap };
}

/** Subtle roughness variation for painted steel (reused across equipment). */
export function makePaintRoughness(size = 256): THREE.CanvasTexture {
  return canvasTexture(
    size,
    (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = fbm((x / size) * 6, (y / size) * 6, 5, 4, 6);
          const r = 150 + n * 60;
          const i = (y * size + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = r;
          img.data[i + 3] = 255;
        }
      }
    },
    false,
  );
}

/** Tileable water normal map (used by tank water surfaces). */
export function makeWaterNormal(size = 256): THREE.CanvasTexture {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm((x / size) * 4, (y / size) * 4, 23, 4, 4);
  return canvasTexture(
    size,
    (img) => {
      const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * 3.5;
          const dy = (at(x, y + 1) - at(x, y - 1)) * 3.5;
          const len = Math.hypot(dx, dy, 1);
          const i = (y * size + x) * 4;
          img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
          img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
          img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
          img.data[i + 3] = 255;
        }
      }
    },
    false,
  );
}

// ---------------------------------------------------------------------------
// Shader injections
// ---------------------------------------------------------------------------

export interface HighlightUniforms {
  uHighlight: { value: number };
  uHighlightColor: { value: THREE.Color };
  uStateMix: { value: number };
  uStateColor: { value: THREE.Color };
}

export function makeHighlightUniforms(): HighlightUniforms {
  return {
    uHighlight: { value: 0 },
    uHighlightColor: { value: new THREE.Color("#5b9dff") },
    uStateMix: { value: 0 },
    uStateColor: { value: new THREE.Color("#f2a93b") },
  };
}

/**
 * Adds a view-dependent rim (selection) and a subtle state tint (warning) to a
 * standard/physical material. Uniform objects are shared per asset so one
 * write updates every material of that asset.
 */
export function withHighlight<T extends THREE.MeshStandardMaterial>(mat: T, u: HighlightUniforms): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
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
  totalEmissiveRadiance += uStateColor * uStateMix * (0.03 + 0.35 * fres);
}`,
      );
  };
  mat.customProgramCacheKey = () => `hl-${mat.type}`;
  return mat;
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
export function withWetness(mat: THREE.MeshStandardMaterial, u: WetUniforms) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWorldPosW;").replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWorldPosW;
uniform vec3 uRippleOrigin;
uniform float uRippleRadius;
uniform float uRippleWidth;
uniform float uWetness;
uniform float uWetRadius;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float dWet = distance(vWorldPosW.xz, uRippleOrigin.xz);
float wetMask = uWetness * (1.0 - smoothstep(uWetRadius - 3.0, uWetRadius, dWet));
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.32, wetMask);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float dW = distance(vWorldPosW.xz, uRippleOrigin.xz);
  float wm = uWetness * (1.0 - smoothstep(uWetRadius - 3.0, uWetRadius, dW));
  diffuseColor.rgb *= mix(1.0, 0.72, wm);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float dR = distance(vWorldPosW.xz, uRippleOrigin.xz);
  float ring = uRippleRadius > 0.0 ? exp(-pow((dR - uRippleRadius) / uRippleWidth, 2.0)) : 0.0;
  float fade = uRippleRadius > 0.0 ? clamp(1.0 - uRippleRadius / 46.0, 0.0, 1.0) : 0.0;
  totalEmissiveRadiance += vec3(0.25, 0.55, 0.95) * ring * fade * 0.18;
}`,
      );
  };
  mat.customProgramCacheKey = () => "wet-deck";
  return mat;
}

// ---------------------------------------------------------------------------
// Material palette
// ---------------------------------------------------------------------------

export interface Palette {
  deck: THREE.MeshStandardMaterial;
  deckSide: THREE.MeshStandardMaterial;
  base: THREE.MeshStandardMaterial;
  paintDark: () => THREE.MeshStandardMaterial;
  paintMid: () => THREE.MeshStandardMaterial;
  tankShell: () => THREE.MeshPhysicalMaterial;
  tankInner: () => THREE.MeshStandardMaterial;
  vessel: () => THREE.MeshPhysicalMaterial;
  endCap: () => THREE.MeshStandardMaterial;
  steel: () => THREE.MeshStandardMaterial;
  motor: () => THREE.MeshStandardMaterial;
  building: () => THREE.MeshStandardMaterial;
  roof: () => THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  concreteSet: ConcreteSet;
}

export function makePalette(wet: WetUniforms): Palette {
  const concreteSet = makeConcrete(512, 4);
  const paintR = makePaintRoughness();
  // Deck: one concrete tile per 16 world units → joints every 4 units.
  const deckTex = [concreteSet.map, concreteSet.roughnessMap, concreteSet.normalMap].map((t) => {
    const c = t.clone();
    c.repeat.set(46 / 16, 21 / 16);
    c.needsUpdate = true;
    return c;
  });
  const deck = withWetness(
    new THREE.MeshStandardMaterial({
      map: deckTex[0],
      roughnessMap: deckTex[1],
      normalMap: deckTex[2],
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.92,
      metalness: 0,
      color: new THREE.Color("#b9c0c9"),
      envMapIntensity: 0.55,
    }),
    wet,
  );
  const deckSide = new THREE.MeshStandardMaterial({
    map: concreteSet.map,
    color: new THREE.Color("#8b929b"),
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.35,
  });
  const base = new THREE.MeshStandardMaterial({ color: new THREE.Color("#0b0e13"), roughness: 0.96, metalness: 0, envMapIntensity: 0.2 });
  const painted = (hex: string, rough: number, metal: number) => () =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal, roughnessMap: paintR, envMapIntensity: 0.8 });
  return {
    deck,
    deckSide,
    base,
    paintDark: painted("#2a3039", 0.62, 0.3),
    paintMid: painted("#3c434e", 0.7, 0.2),
    tankShell: () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#b3bac4"),
        roughness: 0.42,
        metalness: 0.12,
        clearcoat: 0.35,
        clearcoatRoughness: 0.35,
        roughnessMap: paintR,
        envMapIntensity: 0.9,
      }),
    tankInner: () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#5b6470"), roughness: 0.85, metalness: 0.05, side: THREE.BackSide }),
    vessel: () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#cfd4db"),
        roughness: 0.34,
        metalness: 0.05,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        envMapIntensity: 1.0,
      }),
    endCap: () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#2e343c"), roughness: 0.3, metalness: 0.85, envMapIntensity: 1.1 }),
    steel: () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#7a828d"), roughness: 0.42, metalness: 0.88, envMapIntensity: 1.0 }),
    motor: () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#2f3d55"), roughness: 0.45, metalness: 0.45, roughnessMap: paintR, envMapIntensity: 0.9 }),
    building: painted("#343a44", 0.82, 0.08),
    roof: painted("#262b33", 0.9, 0.05),
    glass: new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0c1219"),
      emissive: new THREE.Color("#8fb4e6"),
      emissiveIntensity: 0.0,
      roughness: 0.15,
      metalness: 0.2,
    }),
    concreteSet,
  };
}
