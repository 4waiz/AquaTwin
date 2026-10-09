/**
 * Terrain: one warped grid from the plant out to the horizon (about 0.8 m
 * spacing at the site, tens of metres at the edge), heights from site.ts.
 * The material is MeshStandardMaterial with injected shading:
 *  - dry sand with tone variation and wind-blown relief, gravel inside the
 *    fenced site, dark rubble under the rock armour;
 *  - a wet band at the waterline;
 *  - below sea level: seagrass patches, animated caustics and Beer–Lambert
 *    attenuation along the light and view paths through the water, blended
 *    with the water's in-scattered colour. The sea surface on top only adds
 *    reflection, sun glitter and foam, so shallow water shows a real seabed.
 */
import * as THREE from "three";
import { noiseTexture } from "./noise";
import { DECK, SEA_LEVEL } from "./layout";
import { groundHeight, revetmentMask, SITE, warp } from "./site";

export interface WaterOptics {
  uTime: { value: number };
  uSeaLevel: { value: number };
  /** Attenuation coefficients per metre (r, g, b). */
  uAbsorb: { value: THREE.Vector3 };
  /** In-scattered radiance of a deep water column. */
  uScatter: { value: THREE.Color };
  /** Algal-bloom water colour and amount (0..1). */
  uTurbid: { value: THREE.Color };
  uTurbidity: { value: number };
  uSunDir: { value: THREE.Vector3 };
  /** Sun colour × intensity (follows the intro light ramp). */
  uSunColor: { value: THREE.Color };
  /** Scales the water's in-scattered light with the scene light (intro). */
  uLight: { value: number };
  uNoise: { value: THREE.Texture };
  /** 1 = full detail; 0 = cheap path (low quality tier). */
  uDetail: { value: number };
}

export function makeWaterOptics(sunDir: THREE.Vector3): WaterOptics {
  return {
    uTime: { value: 0 },
    uSeaLevel: { value: SEA_LEVEL },
    uAbsorb: { value: new THREE.Vector3(0.38, 0.075, 0.055) },
    uScatter: { value: new THREE.Color(0.004, 0.03, 0.058) },
    uTurbid: { value: new THREE.Color(0.03, 0.045, 0.022) },
    uTurbidity: { value: 0 },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(3, 2.5, 2) },
    uLight: { value: 1 },
    uNoise: { value: noiseTexture() },
    uDetail: { value: 1 },
  };
}

/** Caustics: bright borders of two drifting cellular patterns (own implementation). */
export const CAUSTICS_GLSL = /* glsl */ `
  vec2 aqHash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float aqCellEdge(vec2 p, float t) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = aqHash22(g + o);
        vec2 r = o + 0.5 + 0.42 * sin(t * (0.55 + 0.6 * h) + 6.2831853 * h) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
  float aqCaustics(vec2 p, float t) {
    float a = aqCellEdge(p * 0.62, t * 0.85);
    float b = aqCellEdge(p * 0.95 + 3.7, -t * 0.7 + 1.3);
    float e = min(a, b);
    return pow(1.0 - smoothstep(0.0, 0.3, e), 3.0);
  }
`;

const terrainCommon = /* glsl */ `
  varying vec3 vTW;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uSeaLevel;
  uniform vec3 uAbsorb;
  uniform vec3 uScatter;
  uniform vec3 uTurbid;
  uniform float uTurbidity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uLight;
  uniform float uDetail;
  uniform vec4 uSite;
  uniform vec4 uDeck;
  varying float vRev;
  ${CAUSTICS_GLSL}
  float aqRect(vec2 p, vec4 r, float soft) {
    vec2 q = max(r.xy - p, p - r.zw);
    return 1.0 - smoothstep(-soft, soft, max(q.x, q.y));
  }
`;

export function makeTerrainMaterial(optics: WaterOptics): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const uniforms = {
    ...optics,
    uSite: { value: new THREE.Vector4(SITE.minX + 0.5, SITE.minZ + 0.5, SITE.maxX - 0.5, DECK.maxZ - 1.0) },
    uDeck: { value: new THREE.Vector4(DECK.minX, DECK.minZ, DECK.maxX, DECK.maxZ) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTW;\nattribute float aRev;\nvarying float vRev;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRev = aRev;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${terrainCommon}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
  vec2 wp = vTW.xz;
  float camD = distance(cameraPosition, vTW);
  vec4 nA = texture2D(uNoise, wp * 0.0035);
  vec4 nB = texture2D(uNoise, wp * 0.021);
  vec4 nC = texture2D(uNoise, wp * 0.19);
  vec4 nD = texture2D(uNoise, wp * 1.3);
  float grainFade = 1.0 - smoothstep(25.0, 140.0, camD);
  // Dry sand: pale dune sand with darker, coarser patches.
  vec3 sandA = vec3(0.62, 0.50, 0.34);
  vec3 sandB = vec3(0.50, 0.38, 0.24);
  vec3 sand = mix(sandA, sandB, smoothstep(0.35, 0.75, nA.r * 0.65 + nB.g * 0.35));
  sand *= 0.9 + 0.2 * nC.b + (nD.b - 0.5) * 0.18 * grainFade;
  // Sparse dark debris / shrub spots.
  sand *= 1.0 - 0.22 * smoothstep(0.9, 0.96, nC.a) * (1.0 - smoothstep(0.0, 0.5, uSeaLevel - vTW.y + 0.6));
  // Gravel hardstanding inside the fenced site.
  float site = aqRect(wp, uSite, 0.8 + nB.r * 1.2);
  vec3 gravel = mix(vec3(0.36, 0.34, 0.31), vec3(0.47, 0.45, 0.41), nC.r) * (0.88 + 0.24 * nD.g * grainFade + 0.1 * nB.b);
  gravel = mix(gravel, gravel * vec3(0.92, 0.86, 0.78), smoothstep(0.55, 0.8, nA.g)); // dust
  vec3 alb = mix(sand, gravel, site);
  // Dark rubble beneath the armour rocks.
  alb = mix(alb, vec3(0.16, 0.15, 0.14) * (0.8 + 0.4 * nC.g), vRev);
  // Wet band at the waterline.
  float wetTop = uSeaLevel + 0.38 + (nB.r - 0.5) * 0.22;
  float wet = 1.0 - smoothstep(uSeaLevel - 0.05, wetTop, vTW.y);
  alb *= mix(1.0, 0.58, wet);
  // Seabed: seagrass meadows in a few metres of water, finer sand further out.
  float depthB = uSeaLevel - vTW.y;
  float grass = smoothstep(0.55, 0.72, nA.b * 0.7 + nB.a * 0.3) * smoothstep(0.8, 2.0, depthB) * (1.0 - smoothstep(6.0, 10.0, depthB));
  alb = mix(alb, vec3(0.06, 0.09, 0.04) * (0.7 + 0.6 * nC.g), grass * (1.0 - vRev));
  diffuseColor.rgb *= alb;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.96, 0.9, site);
  roughnessFactor = mix(roughnessFactor, 0.32, wet);
  roughnessFactor = mix(roughnessFactor, 0.85, vRev);
  if (vTW.y < uSeaLevel) roughnessFactor = 0.9;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
  {
    // Wind-blown relief on the sand (2–8 m) and sand ripples on the seabed.
    float e = 0.6;
    float h0 = texture2D(uNoise, wp * 0.06).g;
    float hx = texture2D(uNoise, (wp + vec2(e, 0.0)) * 0.06).g;
    float hz = texture2D(uNoise, (wp + vec2(0.0, e)) * 0.06).g;
    vec2 g = vec2(hx - h0, hz - h0) / e * 0.45 * (1.0 - site) * (1.0 - vRev);
    // Ripples (wavelength ≈ 0.6 m), faded with distance to avoid aliasing.
    vec2 rd = normalize(vec2(0.35, 1.0));
    float ph = dot(wp, rd) * 10.5 + nB.r * 9.0;
    float rip = cos(ph) * 0.22 * (1.0 - site) * (1.0 - vRev) * (1.0 - smoothstep(18.0, 60.0, camD)) * uDetail;
    g += rd * rip;
    vec3 pw = vec3(-g.x, 0.0, -g.y);
    normal = normalize(normal + mat3(viewMatrix) * pw);
  }`,
      )
      .replace(
        "#include <tonemapping_fragment>",
        /* glsl */ `{
    float depth = uSeaLevel - vTW.y;
    if (depth > 0.0) {
      vec3 V = normalize(cameraPosition - vTW);
      vec3 sigma = uAbsorb * (1.0 + uTurbidity * 5.0);
      float down = depth / max(uSunDir.y, 0.2);
      float up = depth / max(V.y, 0.05);
      vec3 tDown = exp(-sigma * down);
      vec3 tUp = exp(-sigma * up);
      vec3 bed = gl_FragColor.rgb * tDown;
      if (uDetail > 0.5) {
        float c = aqCaustics(vTW.xz * 1.35, uTime * 1.1) * smoothstep(0.0, 0.5, depth) * exp(-depth * 0.45) * (1.0 - uTurbidity);
        bed += c * uSunColor * diffuseColor.rgb * tDown * 0.16 * max(uSunDir.y, 0.0) * (1.0 - smoothstep(30.0, 90.0, distance(cameraPosition, vTW)));
      }
      vec3 scatter = mix(uScatter, uTurbid, uTurbidity) * uLight;
      gl_FragColor.rgb = bed * tUp + scatter * (1.0 - tUp);
    }
  }
  #include <tonemapping_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => "aquatwin-terrain";
  return mat;
}

/** Terrain mesh (land and seabed) from the plant to the horizon. */
export function buildTerrain(optics: WaterOptics): THREE.Mesh {
  const NX = 360;
  const NZ = 300;
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const rev = new Float32Array((NX + 1) * (NZ + 1));
  let k = 0;
  for (let j = 0; j <= NZ; j++) {
    const z = warp(-1 + (2 * j) / NZ, -8, 128, 4600);
    for (let i = 0; i <= NX; i++) {
      const x = warp(-1 + (2 * i) / NX, 0, 150, 4600);
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundHeight(x, z);
      pos[k * 3 + 2] = z;
      rev[k] = revetmentMask(x, z);
      k++;
    }
  }
  const idx = new Uint32Array(NX * NZ * 6);
  let q = 0;
  for (let j = 0; j < NZ; j++) {
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
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRev", new THREE.BufferAttribute(rev, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, makeTerrainMaterial(optics));
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}
