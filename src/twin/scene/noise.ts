/**
 * Small, fast, deterministic noise utilities for procedural geometry and
 * textures (no external assets). Value noise on an integer lattice with a
 * hashed permutation; fbm and ridged variants; a seeded PRNG.
 */
import * as THREE from "three";

const PERM = new Uint8Array(512);
{
  let s = 1337;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function lat(ix: number, iy: number, seed: number) {
  return PERM[(PERM[((ix + seed * 31) & 255)] + (iy & 255)) & 511] / 255;
}

/** 2D value noise in [0, 1] (smooth, lattice spacing 1). */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = lat(xi, yi, seed);
  const b = lat(xi + 1, yi, seed);
  const c = lat(xi, yi + 1, seed);
  const d = lat(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1). */
export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += amp * vnoise(x * f, y * f, seed + o * 7);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

/** Ridged fractal noise in [0, 1] (sharp crests, as on wind-formed dunes). */
export function ridged2(x: number, y: number, octaves = 3, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, seed + o * 13) * 2 - 1);
    s += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return s / norm;
}

/** Seeded PRNG (Park–Miller), returns [0, 1). */
export function rng(seed: number) {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let sharedNoise: THREE.DataTexture | null = null;

/**
 * Shared tileable RGBA noise texture for shaders (256², four independent
 * channels: R/G broad fbm at two scales, B fine grain, A ridged). Built once.
 */
export function noiseTexture(): THREE.DataTexture {
  if (sharedNoise) return sharedNoise;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  // Tileable value noise: lattice wraps with the given period.
  const tile = (x: number, y: number, period: number, seed: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = (i: number) => ((i % period) + period) % period;
    const a = lat(w(xi), w(yi), seed);
    const b = lat(w(xi + 1), w(yi), seed);
    const c = lat(w(xi), w(yi + 1), seed);
    const d = lat(w(xi + 1), w(yi + 1), seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const tfbm = (x: number, y: number, base: number, oct: number, seed: number) => {
    let s = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      const p = base << o;
      s += amp * tile((x / N) * p, (y / N) * p, p, seed + o * 5);
      norm += amp;
      amp *= 0.5;
    }
    return s / norm;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      data[i] = Math.round(tfbm(x, y, 4, 5, 3) * 255);
      data[i + 1] = Math.round(tfbm(x, y, 16, 4, 11) * 255);
      data[i + 2] = Math.round(tfbm(x, y, 64, 2, 19) * 255);
      const r = 1 - Math.abs(tfbm(x, y, 8, 4, 29) * 2 - 1);
      data[i + 3] = Math.round(r * r * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  sharedNoise = tex;
  return tex;
}

/** GLSL helpers that pair with noiseTexture(). */
export const NOISE_GLSL = /* glsl */ `
  float n2(sampler2D t, vec2 p) { return texture2D(t, p).r; }
  vec4 n4(sampler2D t, vec2 p) { return texture2D(t, p); }
`;
