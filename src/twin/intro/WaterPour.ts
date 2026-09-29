/**
 * The pour: a stylised but physically motivated stream of water entering from
 * above the viewport, accelerating under gravity (thinning as it speeds up),
 * then an impact with a restrained splash, secondary droplets and a faint
 * mist. Stream, droplets and mist are all evaluated on the GPU from a handful
 * of uniforms — the CPU only advances time.
 */
import * as THREE from "three";
import { INTRO } from "./timeline";

const STREAM_TOP = 44;
const G_STREAM = (2 * STREAM_TOP) / Math.pow(INTRO.impact - INTRO.pourStart, 2);
const G_SPLASH = 26;

const streamVertex = /* glsl */ `
  uniform float uTime;
  varying float vY;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 p = position;
    float y = p.y; // 0..STREAM_TOP
    float k = clamp(y / ${STREAM_TOP.toFixed(1)}, 0.0, 1.0);
    // Continuity: the stream narrows as it accelerates downward.
    float r = mix(0.15, 0.32, pow(k, 0.55));
    float wob = sin(y * 0.9 + uTime * 9.0) * 0.018 + sin(y * 2.3 - uTime * 13.0) * 0.01;
    p.xz = p.xz * r + vec2(wob, wob * 0.6);
    vY = y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * vec3(normal.x, 0.0, normal.z));
    gl_Position = projectionMatrix * mv;
  }`;

const streamFragment = /* glsl */ `
  uniform float uTime;
  uniform float uHead;
  uniform float uTail;
  uniform float uOpacity;
  varying float vY;
  varying vec3 vN;
  varying vec3 vV;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    if (vY < uHead || vY > uTail) discard;
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float fres = pow(1.0 - abs(dot(n, v)), 2.2);
    // Long, soft streaks travelling down the column (no dotted look).
    float streak = noise(vY * 0.35 + uTime * 14.0 + n.x * 3.0) * noise(vY * 0.9 + uTime * 22.0 - n.z * 2.0);
    streak = smoothstep(0.25, 0.9, streak);
    vec3 body = vec3(0.025, 0.1, 0.22);
    vec3 col = body + vec3(0.42, 0.68, 0.95) * fres * 0.75 + vec3(0.5, 0.75, 1.0) * streak * 0.18;
    float headFade = smoothstep(uHead, uHead + 0.8, vY);
    float a = (0.5 + 0.42 * fres + 0.08 * streak) * uOpacity * headFade;
    gl_FragColor = vec4(col, a);
  }`;

const dropVertex = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute float aStart;
  attribute float aSize;
  attribute float aG;
  attribute float aFloor;
  varying vec3 vN;
  varying vec3 vV;
  varying float vLife;
  void main() {
    float tau = uTime - aStart;
    vec3 c = aOrigin + aVel * tau + vec3(0.0, -0.5 * aG * tau * tau, 0.0);
    float alive = step(0.0, tau) * step(aFloor, c.y);
    float s = aSize * alive;
    // Stretch along velocity for a sense of speed.
    vec3 vel = aVel + vec3(0.0, -aG * tau, 0.0);
    float stretch = 1.0 + clamp(length(vel) * 0.02, 0.0, 1.2);
    vec3 dir = normalize(vel + vec3(1e-4));
    vec3 p = position * s;
    p += dir * dot(position, dir) * s * (stretch - 1.0);
    vec4 mv = modelViewMatrix * vec4(c + p, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    vLife = alive;
    gl_Position = projectionMatrix * mv;
  }`;

const dropFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vLife;
  void main() {
    if (vLife < 0.5) discard;
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float fres = pow(1.0 - abs(dot(n, v)), 2.0);
    vec3 L = normalize(vec3(-0.45, 0.8, 0.35));
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 60.0);
    vec3 col = vec3(0.03, 0.12, 0.25) + vec3(0.5, 0.75, 1.0) * fres * 0.8 + vec3(1.0) * spec * 0.8;
    gl_FragColor = vec4(col, 0.55 + 0.4 * fres);
  }`;

const mistVertex = /* glsl */ `
  uniform float uTime;
  uniform float uStart;
  uniform float uPixelRatio;
  attribute vec3 aDir;
  attribute float aSpeed;
  varying float vA;
  void main() {
    float tau = uTime - uStart;
    float life = clamp(tau / 1.4, 0.0, 1.0);
    vec3 p = position + aDir * aSpeed * (1.0 - pow(1.0 - life, 2.0)) * 2.2 + vec3(0.0, life * 0.8, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (40.0 + 110.0 * life) * uPixelRatio * (30.0 / max(-mv.z, 1.0));
    vA = step(0.0, tau) * (1.0 - life) * smoothstep(0.0, 0.12, tau);
  }`;

const mistFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vA * 0.045;
    gl_FragColor = vec4(0.72, 0.84, 1.0, a);
  }`;

export class WaterPour {
  group = new THREE.Group();
  private stream: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private drops: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private mist: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly particleCount: number;

  constructor(private target: THREE.Vector3) {
    this.group.name = "intro-pour";
    this.group.userData.noAO = true;

    // ---- stream
    const sGeo = new THREE.CylinderGeometry(1, 1, STREAM_TOP, 24, 96, true);
    sGeo.translate(0, STREAM_TOP / 2, 0);
    this.stream = new THREE.Mesh(
      sGeo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHead: { value: STREAM_TOP }, uTail: { value: STREAM_TOP + 1 }, uOpacity: { value: 1 } },
        vertexShader: streamVertex,
        fragmentShader: streamFragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.stream.position.copy(target);
    this.stream.frustumCulled = false;
    this.stream.renderOrder = 6;
    this.stream.userData.noAO = true;

    // ---- droplets (stream shedding + splash + secondary)
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const origin: number[] = [];
    const vel: number[] = [];
    const start: number[] = [];
    const size: number[] = [];
    const g: number[] = [];
    const floor: number[] = [];
    const push = (o: THREE.Vector3, v: THREE.Vector3, t0: number, s: number, gg: number, fl = 0.02) => {
      origin.push(o.x, o.y, o.z);
      vel.push(v.x, v.y, v.z);
      start.push(t0);
      size.push(s);
      g.push(gg);
      floor.push(fl);
    };
    // Shed along the falling stream.
    for (let i = 0; i < 70; i++) {
      const t0 = INTRO.pourStart + 0.05 + rnd() * (INTRO.pourStop - INTRO.pourStart + 0.25);
      const fallT = t0 - INTRO.pourStart;
      const y = Math.max(1, STREAM_TOP - 0.5 * G_STREAM * fallT * fallT * (0.25 + 0.7 * rnd()));
      const a = rnd() * Math.PI * 2;
      const vDown = Math.sqrt(2 * G_STREAM * Math.max(STREAM_TOP - y, 0.1)) * 0.85;
      push(
        new THREE.Vector3(target.x + Math.cos(a) * 0.22, y, target.z + Math.sin(a) * 0.22),
        new THREE.Vector3(Math.cos(a) * (0.4 + rnd()), -vDown, Math.sin(a) * (0.4 + rnd())),
        t0,
        0.035 + rnd() * 0.04,
        G_STREAM,
      );
    }
    // Primary splash crown.
    for (let i = 0; i < 190; i++) {
      const t0 = INTRO.impact + Math.pow(rnd(), 2) * 0.32;
      const a = rnd() * Math.PI * 2;
      const hs = 1.8 + rnd() * 5.2;
      const vs = 2.5 + rnd() * 6.5;
      push(
        new THREE.Vector3(target.x + Math.cos(a) * 0.3, 0.05, target.z + Math.sin(a) * 0.3),
        new THREE.Vector3(Math.cos(a) * hs, vs, Math.sin(a) * hs),
        t0,
        0.028 + rnd() * 0.05,
        G_SPLASH,
      );
    }
    // Secondary droplets.
    for (let i = 0; i < 90; i++) {
      const t0 = INTRO.impact + 0.12 + rnd() * 0.45;
      const a = rnd() * Math.PI * 2;
      const r0 = 0.6 + rnd() * 1.8;
      const hs = 0.6 + rnd() * 2.2;
      push(
        new THREE.Vector3(target.x + Math.cos(a) * r0, 0.05, target.z + Math.sin(a) * r0),
        new THREE.Vector3(Math.cos(a) * hs, 1.2 + rnd() * 2.6, Math.sin(a) * hs),
        t0,
        0.018 + rnd() * 0.025,
        G_SPLASH,
      );
    }
    const base = new THREE.IcosahedronGeometry(1, 1);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = base.index;
    ig.setAttribute("position", base.getAttribute("position"));
    ig.setAttribute("normal", base.getAttribute("normal"));
    ig.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(new Float32Array(origin), 3));
    ig.setAttribute("aVel", new THREE.InstancedBufferAttribute(new Float32Array(vel), 3));
    ig.setAttribute("aStart", new THREE.InstancedBufferAttribute(new Float32Array(start), 1));
    ig.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(size), 1));
    ig.setAttribute("aG", new THREE.InstancedBufferAttribute(new Float32Array(g), 1));
    ig.setAttribute("aFloor", new THREE.InstancedBufferAttribute(new Float32Array(floor), 1));
    ig.instanceCount = start.length;
    this.particleCount = start.length;
    this.drops = new THREE.Mesh(
      ig,
      new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: dropVertex, fragmentShader: dropFragment, transparent: true }),
    );
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 6;
    this.drops.userData.noAO = true;

    // ---- mist
    const mg = new THREE.BufferGeometry();
    const mp: number[] = [];
    const md: number[] = [];
    const ms: number[] = [];
    for (let i = 0; i < 36; i++) {
      const a = rnd() * Math.PI * 2;
      mp.push(target.x + Math.cos(a) * 0.3, 0.3 + rnd() * 0.5, target.z + Math.sin(a) * 0.3);
      md.push(Math.cos(a), 0.15 + rnd() * 0.4, Math.sin(a));
      ms.push(0.5 + rnd() * 1.2);
    }
    mg.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3));
    mg.setAttribute("aDir", new THREE.Float32BufferAttribute(md, 3));
    mg.setAttribute("aSpeed", new THREE.Float32BufferAttribute(ms, 1));
    this.mist = new THREE.Points(
      mg,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uStart: { value: INTRO.impact }, uPixelRatio: { value: 1 } },
        vertexShader: mistVertex,
        fragmentShader: mistFragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 7;

    this.group.add(this.stream, this.drops, this.mist);
    this.group.visible = false;
  }

  setPixelRatio(pr: number) {
    this.mist.material.uniforms.uPixelRatio.value = pr;
  }

  /** t: intro time in seconds. */
  update(t: number) {
    const active = t >= INTRO.pourStart - 0.05 && t < INTRO.impact + 2.2;
    this.group.visible = active;
    if (!active) return;
    const su = this.stream.material.uniforms;
    su.uTime.value = t;
    const fall = Math.max(0, t - INTRO.pourStart);
    su.uHead.value = Math.max(0, STREAM_TOP - 0.5 * G_STREAM * fall * fall);
    const tailFall = Math.max(0, t - INTRO.pourStop);
    su.uTail.value = t < INTRO.pourStop ? STREAM_TOP + 1 : STREAM_TOP - 0.5 * G_STREAM * tailFall * tailFall;
    su.uOpacity.value = t < INTRO.pourStart ? 0 : 1;
    this.stream.visible = su.uTail.value > 0.05;
    this.drops.material.uniforms.uTime.value = t;
    this.mist.material.uniforms.uTime.value = t;
  }
}
