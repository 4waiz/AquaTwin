/**
 * GPU flow particles. Every pipe path is baked into a float texture
 * (SAMPLES points per path, uniform arc length). Each particle is a point
 * whose position is evaluated entirely in the vertex shader from its path row,
 * seed and a per-path parameter texture (speed, density, fill, length, colour,
 * warning). The CPU only writes a few floats per path per frame, so thousands
 * of particles cost nothing on the CPU.
 */
import * as THREE from "three";
import type { PipeRuntime } from "./Pipes";

const SAMPLES = 256;

const vertex = /* glsl */ `
  uniform sampler2D uPaths;
  uniform sampler2D uParams;
  uniform float uRows;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aPath;
  attribute float aSeed;
  attribute float aJitter;
  attribute float aKey;
  attribute vec3 aOffset;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vWarn;

  vec3 pathAt(float s, float row) {
    float x = s * ${(SAMPLES - 1).toFixed(1)};
    float i0 = floor(x);
    float f = x - i0;
    vec3 a = texture2D(uPaths, vec2((i0 + 0.5) / ${SAMPLES.toFixed(1)}, row)).xyz;
    vec3 b = texture2D(uPaths, vec2((min(i0 + 1.0, ${(SAMPLES - 1).toFixed(1)}) + 0.5) / ${SAMPLES.toFixed(1)}, row)).xyz;
    return mix(a, b, f);
  }

  void main() {
    float row = (aPath + 0.5) / uRows;
    vec4 prm = texture2D(uParams, vec2(0.25, row));
    vec4 col = texture2D(uParams, vec2(0.75, row));
    float speed = prm.r;
    float density = prm.g;
    float fill = prm.b;
    float len = max(prm.a, 0.001);
    float s = fract(aSeed + uTime * speed * aJitter / len);
    float visible = step(aKey, density) * step(s, fill);
    vec3 p = pathAt(s, row) + aOffset;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = visible * uSize * uPixelRatio * (28.0 / max(-mv.z, 1.0));
    vAlpha = visible * smoothstep(0.0, 0.03, s) * (1.0 - smoothstep(fill - 0.03, fill, s) * (1.0 - step(0.999, fill)));
    vColor = col.rgb;
    vWarn = col.a;
  }`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vWarn;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5 || vAlpha <= 0.001) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    vec3 col = mix(vColor, vec3(1.0, 0.62, 0.2), vWarn * 0.75);
    gl_FragColor = vec4(col, a * 0.62);
  }`;

export interface PathParams {
  speed: number;
  density: number;
  fill: number;
  color: THREE.Color;
  warn: number;
}

export class FlowParticles {
  points: THREE.Points;
  private params: Float32Array;
  private paramTex: THREE.DataTexture;
  private material: THREE.ShaderMaterial;
  private lengths: number[];
  readonly count: number;

  constructor(pipes: PipeRuntime[], perUnit = 16) {
    const rows = pipes.length;
    const pathData = new Float32Array(SAMPLES * rows * 4);
    this.lengths = pipes.map((p) => p.length);
    pipes.forEach((p, r) => {
      const pts = p.curve.getSpacedPoints(SAMPLES - 1);
      pts.forEach((pt, i) => {
        const o = (r * SAMPLES + i) * 4;
        pathData[o] = pt.x;
        pathData[o + 1] = pt.y;
        pathData[o + 2] = pt.z;
        pathData[o + 3] = 1;
      });
    });
    const pathTex = new THREE.DataTexture(pathData, SAMPLES, rows, THREE.RGBAFormat, THREE.FloatType);
    pathTex.minFilter = pathTex.magFilter = THREE.NearestFilter;
    pathTex.needsUpdate = true;

    this.params = new Float32Array(2 * rows * 4);
    this.paramTex = new THREE.DataTexture(this.params, 2, rows, THREE.RGBAFormat, THREE.FloatType);
    this.paramTex.minFilter = this.paramTex.magFilter = THREE.NearestFilter;

    // Particles: count proportional to pipe length.
    const aPath: number[] = [];
    const aSeed: number[] = [];
    const aJitter: number[] = [];
    const aKey: number[] = [];
    const aOffset: number[] = [];
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    pipes.forEach((p, r) => {
      const n = Math.round(p.length * perUnit * (p.def.radius / 0.3));
      const rad = p.def.radius * 0.55;
      for (let k = 0; k < n; k++) {
        aPath.push(r);
        aSeed.push(rnd());
        aJitter.push(0.82 + rnd() * 0.36);
        aKey.push(rnd());
        const ang = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * rad;
        aOffset.push(Math.cos(ang) * rr, (rnd() - 0.5) * rad * 1.2, Math.sin(ang) * rr);
      }
    });
    this.count = aPath.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(this.count * 3), 3));
    geo.setAttribute("aPath", new THREE.Float32BufferAttribute(aPath, 1));
    geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(aSeed, 1));
    geo.setAttribute("aJitter", new THREE.Float32BufferAttribute(aJitter, 1));
    geo.setAttribute("aKey", new THREE.Float32BufferAttribute(aKey, 1));
    geo.setAttribute("aOffset", new THREE.Float32BufferAttribute(aOffset, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPaths: { value: pathTex },
        uParams: { value: this.paramTex },
        uRows: { value: rows },
        uTime: { value: 0 },
        uSize: { value: 2.2 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.userData.noAO = true;
  }

  setPixelRatio(pr: number) {
    this.material.uniforms.uPixelRatio.value = pr;
  }

  set(row: number, p: PathParams) {
    const o = row * 8;
    this.params[o] = p.speed;
    this.params[o + 1] = p.density;
    this.params[o + 2] = p.fill;
    this.params[o + 3] = this.lengths[row];
    this.params[o + 4] = p.color.r * 1.35;
    this.params[o + 5] = p.color.g * 1.35;
    this.params[o + 6] = p.color.b * 1.35;
    this.params[o + 7] = p.warn;
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time;
    this.paramTex.needsUpdate = true;
  }
}
