/**
 * Ocean surface.
 *  Vertex: four Gerstner waves (swell and wind sea running onshore), damped in
 *    very shallow water so the waterline stays on the beach.
 *  Fragment: a dispersive sum of short waves (ω² = g·k) filtered by the pixel
 *    footprint; what is filtered out becomes surface roughness, so distant
 *    water turns into a soft sheen instead of aliasing. Fresnel reflection of
 *    the scene (planar reflection) or of the sky cube; GGX sun glitter; foam
 *    where the water column is thin (beach, rocks, quay wall), surface boils
 *    over the brine diffuser, patchy algal-bloom discolouration, and the
 *    intro's activation ripple.
 *  The water body itself (turquoise shallows → deep blue) comes from the
 *  seabed shading underneath (Terrain.ts): the surface is blended on top with
 *  premultiplied alpha = Fresnel + foam + turbidity.
 */
import * as THREE from "three";
import { DIFFUSER, SEA_LEVEL } from "./layout";
import { BED_RECT, diffuserPorts, warp, WATER_STRUCTURES } from "./site";
import { PlanarReflection } from "./Water";
import type { WaterOptics } from "./Terrain";
import { fogGlsl, FOG_DENSITY } from "../render/Atmosphere";

const G = 9.81;

interface Gerstner {
  dir: THREE.Vector2;
  amp: number;
  k: number;
  omega: number;
  q: number;
  phase: number;
}

function gerstner(angleDeg: number, lambda: number, amp: number, q: number, phase: number): Gerstner {
  const a = THREE.MathUtils.degToRad(angleDeg);
  const k = (2 * Math.PI) / lambda;
  return { dir: new THREE.Vector2(Math.sin(a), -Math.cos(a)), amp, k, omega: Math.sqrt(G * k), q, phase };
}

/** Onshore swell and wind sea (propagating toward -z, the coast). */
const WAVES: Gerstner[] = [gerstner(12, 17, 0.08, 0.5, 0.0), gerstner(-24, 10.5, 0.05, 0.5, 1.7), gerstner(33, 6.6, 0.03, 0.45, 4.1), gerstner(-8, 4.1, 0.016, 0.4, 2.6)];

/** Short waves for the fragment stage: geometric wavelengths, directions spread around the wind. */
function shortWaves(n: number) {
  const out: THREE.Vector4[] = [];
  let s = 11;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < n; i++) {
    const lambda = 3.4 * Math.pow(0.79, i);
    const k = (2 * Math.PI) / lambda;
    const ang = THREE.MathUtils.degToRad(18) + (r() - 0.5) * 2.2;
    out.push(new THREE.Vector4(Math.sin(ang), -Math.cos(ang), k, Math.sqrt(G * k)));
  }
  return out;
}

function foamTexture(): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const cells = (count: number, seed: number) => {
    const pts: number[] = [];
    let s = seed;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < count * count; i++) pts.push(r(), r());
    return (x: number, y: number) => {
      const fx = x * count;
      const fy = y * count;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      let d1 = 9;
      let d2 = 9;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = (((cx + ox) % count) + count) % count;
          const gy = (((cy + oy) % count) + count) % count;
          const px = cx + ox + pts[(gy * count + gx) * 2];
          const py = cy + oy + pts[(gy * count + gx) * 2 + 1];
          const d = (px - fx) * (px - fx) + (py - fy) * (py - fy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      return Math.sqrt(d2) - Math.sqrt(d1);
    };
  };
  const a = cells(9, 3);
  const b = cells(23, 7);
  const c = cells(5, 13);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const ea = a(u, v);
      const eb = b(u, v);
      const ec = c(u, v);
      const i = (y * N + x) * 4;
      // Foam lace: bright along cell borders, with bubbles inside larger cells.
      data[i] = Math.round(255 * Math.max(0, 1 - ea / 0.16) ** 1.5);
      data[i + 1] = Math.round(255 * Math.max(0, 1 - eb / 0.22) ** 1.2);
      data[i + 2] = Math.round(255 * Math.min(1, ec * 1.6));
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const MAX_SHORT = 16;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  uniform float uSeaLevel;
  uniform vec4 uGW[4];
  uniform vec4 uGW2[4];
  uniform sampler2D uBed;
  uniform vec4 uBedRect;
  uniform mat4 uReflMatrix;
  varying vec3 vWorld;
  varying vec3 vGN;
  varying vec4 vReflUv;
  varying float vCrest;
  varying float vBed;

  float bedAt(vec2 xz) {
    vec2 uv = (xz - uBedRect.xy) * uBedRect.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return uSeaLevel - 30.0;
    return texture2D(uBed, uv).r;
  }

  void main() {
    vec3 p = vec3(position.x, uSeaLevel, position.z);
    float bed = bedAt(p.xz);
    float depth = uSeaLevel - bed;
    float damp = smoothstep(0.05, 2.2, depth) * uActivity;
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < 4; i++) {
      vec4 a = uGW[i];   // dir.x, dir.y, amp, k
      vec4 b = uGW2[i];  // omega, steepness, phase, -
      float th = a.w * dot(a.xy, p.xz) - b.x * uTime + b.z;
      float s = sin(th);
      float c = cos(th);
      float A = a.z * damp;
      disp.x += b.y * A * a.x * c;
      disp.z += b.y * A * a.y * c;
      disp.y += A * s;
      n.x -= a.x * a.w * A * c;
      n.z -= a.y * a.w * A * c;
      n.y -= b.y * a.w * A * s;
    }
    p += disp;
    vWorld = p;
    vGN = normalize(n);
    vCrest = disp.y;
    vBed = bed;
    vReflUv = uReflMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

function fragment(sunTint: THREE.Color, nShort: number) {
  return /* glsl */ `
  #define NSHORT ${nShort}
  uniform float uTime;
  uniform float uActivity;
  uniform float uSeaLevel;
  uniform sampler2D tReflection;
  uniform samplerCube tSky;
  uniform float uPlanar;
  uniform float uEnv;
  uniform vec4 uSW[${MAX_SHORT}];
  uniform sampler2D uNoise;
  uniform sampler2D uFoam;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyIrr;
  uniform vec3 uScatter;
  uniform vec3 uTurbid;
  uniform float uTurbidity;
  uniform float uLight;
  uniform vec3 uPorts[5];
  uniform vec4 uDiffuser;
  uniform float uPlume;
  uniform vec3 uRippleOrigin;
  uniform float uRippleRadius;
  uniform vec4 uBoxes[2];
  uniform vec3 fogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec3 vGN;
  varying vec4 vReflUv;
  varying float vCrest;
  varying float vBed;
  ${fogGlsl(sunTint)}

  float sdBox(vec2 p, vec4 b) {
    vec2 c = (b.xy + b.zw) * 0.5;
    vec2 h = (b.zw - b.xy) * 0.5;
    vec2 d = abs(p - c) - h;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    vec2 dpx = dFdx(p);
    vec2 dpy = dFdy(p);
    float fp = max(length(dpx), length(dpy));

    // Large-scale domain warp breaks the regularity of the sine sum.
    vec4 nz = texture2D(uNoise, p * 0.012 + vec2(uTime * 0.003, 0.0));
    vec2 pw = p + (nz.rg - 0.5) * 9.0;

    vec2 grad = vec2(0.0);
    float lost = 0.0;
    float act = 0.3 + 0.7 * uActivity;
    for (int i = 0; i < NSHORT; i++) {
      vec4 w = uSW[i];
      float lambda = 6.2831853 / w.z;
      float slope = 0.058 * act;
      float A = slope / w.z;
      float aa = smoothstep(1.8 * fp, 3.6 * fp, lambda);
      float th = w.z * dot(w.xy, pw) - w.w * uTime + float(i) * 2.399;
      grad += w.xy * (w.z * A * cos(th)) * aa;
      lost += (1.0 - aa) * slope * slope * 0.5;
    }
    // Intro activation ripple.
    float dr = distance(p, uRippleOrigin.xz);
    float ring = uRippleRadius > 0.0 ? sin((dr - uRippleRadius) * 3.0) * exp(-pow((dr - uRippleRadius) / 1.8, 2.0)) : 0.0;
    grad += normalize(p - uRippleOrigin.xz + 1e-4) * ring * 0.35;
    // Surface boils over the diffuser ports (brine jets).
    float boil = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 q = p - uPorts[i].xz;
      float r2 = dot(q, q);
      float b = exp(-r2 / 2.2);
      boil += b;
      float r = sqrt(r2) + 1e-4;
      grad += (q / r) * cos(r * 7.0 - uTime * 5.0 + float(i)) * b * 0.22 * uPlume;
    }
    vec3 n = normalize(vec3(vGN.x - grad.x, vGN.y, vGN.z - grad.y));
    float rough = clamp(sqrt(0.0025 + lost + fp * 0.002), 0.05, 0.6);

    // Fresnel (Schlick, water F0 = 0.02), reduced for rough surfaces at grazing angles.
    float NdotV = max(dot(n, V), 0.0);
    float F = 0.02 + (max(1.0 - rough, 0.02) - 0.02) * pow(1.0 - NdotV, 5.0);

    // Reflection: planar (scene) or sky cube.
    vec3 R = reflect(-V, n);
    R.y = abs(R.y);
    vec3 sky = textureLod(tSky, R, rough * 7.0).rgb * uEnv;
    vec3 refl = sky;
    if (uPlanar > 0.5) {
      vec2 ruv = vReflUv.xy / vReflUv.w + n.xz * 0.045;
      vec3 planar = texture2D(tReflection, ruv).rgb;
      refl = mix(planar, sky, smoothstep(0.12, 0.45, rough));
    }

    // Water column under this point.
    float depth = vWorld.y - vBed;

    // Body: algal bloom (patchy, streaky), brine plume (lighter, milky).
    float patchN = texture2D(uNoise, p * 0.0065 + vec2(uTime * 0.0015, 0.0)).r * 0.7 + texture2D(uNoise, p * 0.031).g * 0.3;
    float bloom = uTurbidity * smoothstep(0.32, 0.7, patchN) * 0.9 + uTurbidity * 0.25;
    vec2 cd = vec2(cos(uDiffuser.w), sin(uDiffuser.w));
    vec2 rq = p - uDiffuser.xy;
    float along = dot(rq, vec2(0.86, 0.5));
    float across = dot(rq, vec2(-0.5, 0.86));
    float plumeBody = exp(-across * across / (5.0 + max(along, 0.0) * 1.2) - max(along, 0.0) / 22.0 - pow(max(-along, 0.0), 2.0) / 9.0);
    plumeBody *= uPlume * (0.75 + 0.25 * nz.b);
    vec3 skyAmb = uSkyIrr * uEnv;
    vec3 sunIrr = uSunColor * max(uSunDir.y, 0.0);
    vec3 bodyLight = (sunIrr + skyAmb) * (1.0 / 3.14159);
    vec3 turbidCol = uTurbid * uLight * 1.6;
    vec3 plumeCol = vec3(0.16, 0.30, 0.31) * bodyLight * 1.3;
    float bodyA = clamp(bloom * 0.85, 0.0, 0.92);
    vec3 bodyC = turbidCol;
    float pa = clamp(plumeBody * 0.32, 0.0, 0.4);
    bodyC = mix(bodyC, plumeCol, pa / max(pa + bodyA, 1e-3));
    bodyA = 1.0 - (1.0 - bodyA) * (1.0 - pa);

    // Foam: thin water over the beach and rocks, a lace along the quay wall, flecks on the boils.
    vec4 f1 = texture2D(uFoam, p * 0.24 + vec2(0.011, 0.019) * uTime);
    vec4 f2 = texture2D(uFoam, p * 0.09 - vec2(0.006, 0.010) * uTime);
    float lace = clamp(f1.r * 0.75 + f2.g * 0.55, 0.0, 1.0);
    float shore = 1.0 - smoothstep(0.0, 0.85, depth);
    float surf = 0.5 + 0.5 * sin(depth * 7.5 - uTime * 1.7 + f2.b * 6.0);
    float foam = shore * smoothstep(0.35, 0.9, shore * (0.45 + 0.55 * surf) + lace * 0.55);
    float wall = 1e3;
    for (int i = 0; i < 2; i++) wall = min(wall, sdBox(p, uBoxes[i]));
    foam = max(foam, exp(-max(wall, 0.0) * 4.0) * smoothstep(0.25, 0.8, lace + 0.25 * surf) * 0.85);
    foam = max(foam, smoothstep(0.55, 0.95, boil * 0.35 + lace * 0.7) * min(boil, 1.0) * uPlume * 0.45);
    foam = max(foam, smoothstep(0.62, 0.95, lace) * smoothstep(0.05, 0.16, vCrest) * 0.35);
    foam *= (0.25 + 0.75 * uActivity);
    // Foam is lit like a rough white surface.
    float fNL = max(dot(vGN, uSunDir), 0.0);
    vec3 foamCol = vec3(0.86, 0.88, 0.86) * (uSunColor * fNL + skyAmb) * (1.0 / 3.14159);

    // Sun glitter (GGX).
    vec3 L = uSunDir;
    vec3 H = normalize(L + V);
    float NdotL = max(dot(n, L), 0.0);
    float NdotH = max(dot(n, H), 0.0);
    float a = rough * rough;
    float a2 = a * a;
    float dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * dd * dd);
    float vis = 0.5 / (NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2) + NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2) + 1e-5);
    float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 spec = min(uSunColor * D * vis * Fs * NdotL, vec3(48.0));
    // Light through thin wave crests.
    float sss = pow(max(dot(V, -L), 0.0), 3.0) * smoothstep(0.0, 0.14, vCrest) * 0.25;

    // Composite (premultiplied): reflection, then body, then foam; glitter is additive.
    vec3 col = refl * F;
    float alpha = F;
    col = col + (1.0 - alpha) * bodyC * bodyA;
    alpha = alpha + (1.0 - alpha) * bodyA;
    col += uScatter * uLight * sss * (1.0 - alpha) * 6.0;
    col = col * (1.0 - foam) + foamCol * foam;
    alpha = alpha * (1.0 - foam) + foam;
    col += spec * (1.0 - foam);

    // Aerial perspective (the seabed behind is fogged the same way).
    vec3 fogged = aquaFog(col, vWorld, fogColor * alpha, uFogDensity);
    gl_FragColor = vec4(fogged, alpha);
  }`;
}

export class Ocean {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  reflection: PlanarReflection;
  uniforms: Record<string, THREE.IUniform>;
  /** Reflection target resolution relative to the canvas; 0 disables the planar reflection. */
  reflectionScale = 0.5;
  private width = 2;
  private height = 2;
  private sunTint: THREE.Color;
  private shortCount = 14;

  constructor(optics: WaterOptics, bed: THREE.Texture, skyCube: THREE.Texture, sunTint: THREE.Color, fogColor: THREE.Color, skyIrr: THREE.Color) {
    this.sunTint = sunTint;
    // Warped grid: ≈0.6 m spacing at the quay, coarse toward the horizon.
    const NX = 280;
    const NZ = 210;
    const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
    let k = 0;
    for (let j = 0; j <= NZ; j++) {
      const v = j / NZ;
      const z = -40 + 130 * v + (4600 - 130) * Math.pow(v, 5);
      for (let i = 0; i <= NX; i++) {
        const x = warp(-1 + (2 * i) / NX, 0, 130, 4600);
        pos[k++] = x;
        pos[k++] = 0;
        pos[k++] = z;
      }
    }
    const idx = new Uint32Array(NX * NZ * 6);
    let q = 0;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        const b = a + 1;
        const c = a + NX + 1;
        const d = c + 1;
        idx[q++] = a;
        idx[q++] = c;
        idx[q++] = b;
        idx[q++] = b;
        idx[q++] = c;
        idx[q++] = d;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SEA_LEVEL, 0), 7000);

    this.reflection = new PlanarReflection(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, SEA_LEVEL, 0), 2, 2);

    const ports = diffuserPorts();
    while (ports.length < 5) ports.push(ports[ports.length - 1].clone());
    this.uniforms = {
      ...optics,
      uActivity: { value: 1 },
      uGW: { value: WAVES.map((w) => new THREE.Vector4(w.dir.x, w.dir.y, w.amp, w.k)) },
      uGW2: { value: WAVES.map((w) => new THREE.Vector4(w.omega, w.q, w.phase, 0)) },
      uBed: { value: bed },
      uBedRect: { value: new THREE.Vector4(BED_RECT.x0, BED_RECT.z0, 1 / (BED_RECT.x1 - BED_RECT.x0), 1 / (BED_RECT.z1 - BED_RECT.z0)) },
      uReflMatrix: { value: this.reflection.textureMatrix },
      tReflection: { value: this.reflection.target.texture },
      tSky: { value: skyCube },
      uPlanar: { value: 1 },
      uEnv: { value: 1 },
      uSW: { value: shortWaves(MAX_SHORT) },
      uFoam: { value: foamTexture() },
      uSkyIrr: { value: skyIrr },
      uPorts: { value: ports.slice(0, 5) },
      uDiffuser: { value: new THREE.Vector4(DIFFUSER.x, DIFFUSER.z, 0, DIFFUSER.angle) },
      uPlume: { value: 0 },
      uRippleOrigin: { value: new THREE.Vector3() },
      uRippleRadius: { value: -1 },
      uBoxes: { value: WATER_STRUCTURES.slice(0, 2).map((b) => new THREE.Vector4(b[0], b[1], b[2], b[3])) },
      fogColor: { value: fogColor },
      uFogDensity: { value: FOG_DENSITY },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment(sunTint, this.shortCount),
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = "ocean";
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** Quality: number of fragment waves and whether the planar reflection is rendered. */
  setQuality(tier: 0 | 1 | 2) {
    const n = tier === 2 ? 14 : tier === 1 ? 9 : 5;
    this.reflectionScale = tier === 2 ? 0.5 : 0;
    this.uniforms.uPlanar.value = this.reflectionScale > 0 ? 1 : 0;
    if (n !== this.shortCount) {
      this.shortCount = n;
      this.mesh.material.fragmentShader = fragment(this.sunTint, n);
      this.mesh.material.needsUpdate = true;
    }
    this.setSize(this.width, this.height);
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    const k = Math.max(this.reflectionScale, 0.05);
    this.reflection.setSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
  }

  get planar() {
    return this.reflectionScale > 0;
  }

  /** Surface height at (x, z) (Gerstner, ignoring horizontal drift), for floating objects. */
  heightAt(x: number, z: number, time: number, activity: number, depth = 10): number {
    const damp = Math.min(1, Math.max(0, (depth - 0.05) / 2.15)) * activity;
    let y = 0;
    for (const w of WAVES) y += w.amp * damp * Math.sin(w.k * (w.dir.x * x + w.dir.y * z) - w.omega * time + w.phase);
    return SEA_LEVEL + y;
  }

  dispose() {
    this.reflection.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
