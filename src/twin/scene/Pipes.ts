/**
 * Process piping. Each pipe is a clear acrylic-like shell with a water core
 * inside. The core shader animates directional flow bands along the pipe's
 * arc length and supports an intro "fill front" (water advancing from the
 * upstream end), so the same geometry shows both the plant coming online and
 * its live flow state.
 */
import * as THREE from "three";
import type { PipeDef } from "./layout";

export const WATER_COLORS = {
  feed: new THREE.Color(0.022, 0.12, 0.33),
  hp: new THREE.Color(0.03, 0.16, 0.42),
  permeate: new THREE.Color(0.09, 0.3, 0.56),
  brine: new THREE.Color(0.02, 0.075, 0.17),
};

export interface PipeRuntime {
  def: PipeDef;
  curve: THREE.CurvePath<THREE.Vector3>;
  length: number;
  core: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
  shell: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
  uniforms: {
    uTime: { value: number };
    uSpeed: { value: number };
    uLength: { value: number };
    uFill: { value: number };
    uActive: { value: number };
    uWarn: { value: number };
    uOpacity: { value: number };
    uColor: { value: THREE.Color };
    uWarnColor: { value: THREE.Color };
    uPulse: { value: number };
  };
}

/** Polyline with rounded corners, as used for industrial pipe runs. */
export function roundedPath(points: THREE.Vector3[], radius: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const dIn = cur.clone().sub(prev);
    const dOut = next.clone().sub(cur);
    const r = Math.min(radius, dIn.length() * 0.45, dOut.length() * 0.45);
    dIn.normalize();
    dOut.normalize();
    const a = cur.clone().addScaledVector(dIn, -r);
    const b = cur.clone().addScaledVector(dOut, r);
    if (a.distanceTo(cursor) > 1e-4) path.add(new THREE.LineCurve3(cursor.clone(), a));
    path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
    cursor = b;
  }
  path.add(new THREE.LineCurve3(cursor, points[points.length - 1].clone()));
  return path;
}

const coreVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;

const coreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLength;
  uniform float uFill;
  uniform float uActive;
  uniform float uWarn;
  uniform float uOpacity;
  uniform float uPulse;
  uniform vec3 uColor;
  uniform vec3 uWarnColor;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float s = vUv.x * uLength;
    float fillEnd = uFill * uLength;
    if (s > fillEnd) discard;
    float filling = 1.0 - step(0.999, uFill);
    float front = smoothstep(fillEnd - 1.1, fillEnd, s) * filling;
    float phase = s * 0.55 - uTime * uSpeed * 0.55;
    float bands = pow(0.5 + 0.5 * sin(phase * 6.2831853), 8.0);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 col = uColor * (0.55 + 0.6 * fres);
    col += uColor * bands * (0.45 + 0.5 * uPulse) * uActive;
    col += vec3(0.55, 0.8, 1.0) * front * 0.85;
    vec3 warm = uWarnColor * (0.45 + 0.55 * bands + 0.35 * fres);
    col = mix(col, warm, uWarn * 0.7);
    float a = uOpacity * (0.7 + 0.22 * fres + 0.12 * bands * uActive + 0.3 * front);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

const shellVertex = coreVertex;
const shellFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);
    vec3 L = normalize(vec3(-0.45, 0.8, 0.35));
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 48.0);
    vec3 col = vec3(0.72, 0.84, 1.0) * (0.05 + 0.55 * fres) + vec3(1.0) * spec * 0.55;
    float a = (0.05 + 0.42 * fres + spec * 0.45) * uOpacity;
    gl_FragColor = vec4(col, a);
  }`;

export class Pipes {
  group = new THREE.Group();
  pipes: PipeRuntime[] = [];
  private flanges: THREE.InstancedMesh;
  private supports: THREE.InstancedMesh;

  constructor(defs: PipeDef[], steel: THREE.Material, support: THREE.Material) {
    this.group.name = "pipes";
    const flangeMatrices: THREE.Matrix4[] = [];
    const supportMatrices: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    for (const def of defs) {
      const curve = roundedPath(def.points, Math.max(0.55, def.radius * 2.4));
      const length = curve.getLength();
      const segs = Math.max(32, Math.round(length * 6));
      const coreGeo = new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, segs, def.radius * 0.7, 14, false);
      const shellGeo = new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, segs, def.radius, 18, false);
      const uniforms = {
        uTime: { value: 0 },
        uSpeed: { value: 1.5 },
        uLength: { value: length },
        uFill: { value: 1 },
        uActive: { value: 1 },
        uWarn: { value: 0 },
        uOpacity: { value: 1 },
        uColor: { value: WATER_COLORS[def.kind].clone() },
        uWarnColor: { value: new THREE.Color(0.95, 0.55, 0.12) },
        uPulse: { value: 0 },
      };
      const core = new THREE.Mesh(
        coreGeo,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: coreVertex,
          fragmentShader: coreFragment,
          transparent: true,
          depthWrite: false,
        }),
      );
      core.renderOrder = 2;
      core.userData.noAO = true;
      const shell = new THREE.Mesh(
        shellGeo,
        new THREE.ShaderMaterial({
          uniforms: { uOpacity: { value: 1 } },
          vertexShader: shellVertex,
          fragmentShader: shellFragment,
          transparent: true,
          depthWrite: false,
        }),
      );
      shell.renderOrder = 4;
      shell.castShadow = true;
      shell.userData.noAO = true;
      this.group.add(core, shell);
      this.pipes.push({ def, curve, length, core, shell, uniforms });

      // Flanges at both ends and roughly every 5 units.
      const nFl = Math.max(2, Math.round(length / 5) + 1);
      for (let k = 0; k < nFl; k++) {
        const u = k / (nFl - 1);
        const p = curve.getPointAt(Math.min(0.999, Math.max(0.001, u)));
        const t = curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
        const q = new THREE.Quaternion().setFromUnitVectors(up, t.normalize());
        const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(def.radius * 1.35, 0.11, def.radius * 1.35));
        flangeMatrices.push(m);
      }
      // Supports under elevated, roughly horizontal runs.
      const nSup = Math.floor(length / 3.2);
      for (let k = 1; k < nSup; k++) {
        const u = k / nSup;
        const p = curve.getPointAt(u);
        const t = curve.getTangentAt(u);
        if (Math.abs(t.y) > 0.3 || p.y < 0.45) continue;
        const h = p.y - def.radius;
        supportMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(0.16, h, 0.16)));
        supportMatrices.push(
          new THREE.Matrix4().compose(new THREE.Vector3(p.x, h - 0.03, p.z), new THREE.Quaternion(), new THREE.Vector3(0.7 * def.radius + 0.25, 0.06, 0.34)),
        );
      }
    }

    const flangeGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
    this.flanges = new THREE.InstancedMesh(flangeGeo, steel, flangeMatrices.length);
    flangeMatrices.forEach((m, i) => this.flanges.setMatrixAt(i, m));
    this.flanges.castShadow = true;
    this.flanges.receiveShadow = true;
    this.group.add(this.flanges);

    const supGeo = new THREE.BoxGeometry(1, 1, 1);
    this.supports = new THREE.InstancedMesh(supGeo, support, supportMatrices.length);
    supportMatrices.forEach((m, i) => this.supports.setMatrixAt(i, m));
    this.supports.castShadow = true;
    this.supports.receiveShadow = true;
    this.group.add(this.supports);
  }

  byId(id: string) {
    return this.pipes.find((p) => p.def.id === id);
  }

  update(time: number) {
    for (const p of this.pipes) p.uniforms.uTime.value = time;
  }

  setShellOpacity(o: number) {
    for (const p of this.pipes) p.shell.material.uniforms.uOpacity.value = o;
  }
}
