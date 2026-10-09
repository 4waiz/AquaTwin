/**
 * Camera rig: damped orbit with hard limits (the model can never be lost),
 * geometric framing that fits the plant to any viewport aspect, smooth focus
 * transitions to equipment, reset, and the intro's gentle settle from a
 * higher, wider start pose.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type CameraPreset = "overview" | "twin" | "scenario" | "membranes" | "compact";

interface Pose {
  target: THREE.Vector3;
  distance: number;
  polar: number;
  azimuth: number;
}

interface PresetDef {
  /** World-space region that must be fully visible. */
  box: THREE.Box3;
  polar: number;
  azimuth: number;
  /** Fraction of the viewport (NDC) the region may occupy horizontally / vertically. */
  fillX: number;
  fillY: number;
}

const PLANT_BOX = new THREE.Box3(new THREE.Vector3(-23.4, -0.4, -12.6), new THREE.Vector3(23.4, 4.8, 10.6));
const RO_BOX = new THREE.Box3(new THREE.Vector3(-5.6, 0, -6.4), new THREE.Vector3(15.8, 3.4, 4.6));

const PRESETS: Record<CameraPreset, PresetDef> = {
  overview: { box: PLANT_BOX, polar: 0.93, azimuth: -0.5, fillX: 0.95, fillY: 0.9 },
  twin: { box: PLANT_BOX, polar: 0.9, azimuth: -0.46, fillX: 0.95, fillY: 0.9 },
  scenario: { box: PLANT_BOX, polar: 0.95, azimuth: -0.52, fillX: 0.95, fillY: 0.9 },
  membranes: { box: RO_BOX, polar: 0.98, azimuth: -0.62, fillX: 0.9, fillY: 0.84 },
  compact: { box: PLANT_BOX, polar: 0.95, azimuth: -0.5, fillX: 0.92, fillY: 0.88 },
};

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class CameraRig {
  controls: OrbitControls;
  preset: CameraPreset = "overview";
  private aspect = 16 / 9;
  private anim: { from: Pose; to: Pose; t: number; dur: number } | null = null;
  private spherical = new THREE.Spherical();
  private probe = new THREE.PerspectiveCamera();
  private fitCache = new Map<string, Pose>();
  private dragging = false;
  private lastChange = -Infinity;

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.075;
    c.rotateSpeed = 0.45;
    c.zoomSpeed = 0.55;
    c.enablePan = false;
    c.minPolarAngle = 0.55;
    // Low enough to look across the site to the horizon, never under the ground.
    c.maxPolarAngle = 1.36;
    c.addEventListener("start", this.onStart);
    c.addEventListener("end", this.onEnd);
    c.addEventListener("change", this.onChange);
    this.applyPose(this.defaultPose(), true);
  }

  private onStart = () => {
    this.dragging = true;
    this.lastChange = performance.now();
  };
  private onEnd = () => {
    this.dragging = false;
    this.lastChange = performance.now();
  };
  private onChange = () => {
    this.lastChange = performance.now();
  };

  /** True while the user drags or zooms, the view eases to a new pose, or the orbit is still gliding to rest. */
  get moving() {
    return this.dragging || this.anim !== null || performance.now() - this.lastChange < 150;
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.updateLimits();
  }

  /** NDC extent of a box seen from a pose (with the current aspect). */
  private extent(box: THREE.Box3, target: THREE.Vector3, distance: number, polar: number, azimuth: number) {
    const cam = this.probe;
    cam.fov = this.camera.fov;
    cam.aspect = this.aspect;
    cam.near = 0.5;
    cam.far = 500;
    cam.updateProjectionMatrix();
    this.spherical.set(distance, polar, azimuth);
    cam.position.setFromSpherical(this.spherical).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    return { x0, x1, y0, y1 };
  }

  /** Fit the preset's region: solve distance by bisection, then re-centre the target. */
  defaultPose(preset = this.preset): Pose {
    const key = `${preset}:${this.aspect.toFixed(3)}:${this.camera.fov}`;
    const cached = this.fitCache.get(key);
    if (cached) return { ...cached, target: cached.target.clone() };
    const p = PRESETS[preset];
    const target = p.box.getCenter(new THREE.Vector3());
    let distance = 60;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 5;
      let hi = 300;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        const e = this.extent(p.box, target, mid, p.polar, p.azimuth);
        const need = Math.max((e.x1 - e.x0) / (2 * p.fillX), (e.y1 - e.y0) / (2 * p.fillY));
        if (need > 1) lo = mid;
        else hi = mid;
      }
      distance = hi;
      // Re-centre: shift the target along the camera's right/up axes by the NDC offset.
      const e = this.extent(p.box, target, distance, p.polar, p.azimuth);
      const cx = (e.x0 + e.x1) / 2;
      const cy = (e.y0 + e.y1) / 2;
      const cam = this.probe;
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * distance;
      const halfW = halfH * this.aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, cx * halfW).addScaledVector(up, cy * halfH);
    }
    const pose = { target, distance, polar: p.polar, azimuth: p.azimuth };
    this.fitCache.set(key, pose);
    return { ...pose, target: target.clone() };
  }

  setPreset(preset: CameraPreset, animate = true) {
    this.preset = preset;
    this.updateLimits();
    const to = this.defaultPose(preset);
    if (animate) this.animateTo(to, 1.0);
    else this.applyPose(to, true);
  }

  private updateLimits() {
    const d = this.defaultPose();
    this.controls.minDistance = d.distance * 0.32;
    this.controls.maxDistance = d.distance * 1.3;
    this.controls.minAzimuthAngle = d.azimuth - 1.0;
    this.controls.maxAzimuthAngle = d.azimuth + 1.0;
  }

  currentPose(): Pose {
    const off = this.camera.position.clone().sub(this.controls.target);
    this.spherical.setFromVector3(off);
    return { target: this.controls.target.clone(), distance: this.spherical.radius, polar: this.spherical.phi, azimuth: this.spherical.theta };
  }

  private applyPose(p: Pose, updateControls = false) {
    this.spherical.set(p.distance, p.polar, p.azimuth);
    const off = new THREE.Vector3().setFromSpherical(this.spherical);
    this.controls.target.copy(p.target);
    this.camera.position.copy(p.target).add(off);
    this.camera.lookAt(p.target);
    if (updateControls) this.controls.update();
  }

  animateTo(to: Pose, dur = 0.9) {
    const from = this.currentPose();
    let dAz = to.azimuth - from.azimuth;
    while (dAz > Math.PI) dAz -= 2 * Math.PI;
    while (dAz < -Math.PI) dAz += 2 * Math.PI;
    this.anim = { from, to: { ...to, azimuth: from.azimuth + dAz }, t: 0, dur };
  }

  focus(target: THREE.Vector3, distance: number) {
    const cur = this.currentPose();
    const d = this.defaultPose();
    this.animateTo(
      { target: target.clone(), distance: Math.min(distance, d.distance * 0.8), polar: Math.min(Math.max(cur.polar, 0.8), 1.05), azimuth: cur.azimuth },
      0.95,
    );
  }

  reset() {
    this.animateTo(this.defaultPose(), 1.0);
  }

  /** Intro: k = 0 start pose (higher and wider), k = 1 default pose. */
  applyIntro(k: number) {
    const d = this.defaultPose();
    const start: Pose = { target: d.target.clone().add(new THREE.Vector3(0, 0.6, 0)), distance: d.distance * 1.14, polar: d.polar - 0.09, azimuth: d.azimuth - 0.05 };
    const e = easeInOut(k);
    this.applyPose(
      {
        target: start.target.clone().lerp(d.target, e),
        distance: THREE.MathUtils.lerp(start.distance, d.distance, e),
        polar: THREE.MathUtils.lerp(start.polar, d.polar, e),
        azimuth: THREE.MathUtils.lerp(start.azimuth, d.azimuth, e),
      },
      true,
    );
  }

  update(dt: number) {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = easeInOut(a.t);
      this.applyPose({
        target: a.from.target.clone().lerp(a.to.target, e),
        distance: THREE.MathUtils.lerp(a.from.distance, a.to.distance, e),
        polar: THREE.MathUtils.lerp(a.from.polar, a.to.polar, e),
        azimuth: THREE.MathUtils.lerp(a.from.azimuth, a.to.azimuth, e),
      });
      if (a.t >= 1) {
        this.anim = null;
        this.controls.update();
      }
      return;
    }
    this.controls.update();
  }

  get animating() {
    return this.anim !== null;
  }

  dispose() {
    this.controls.removeEventListener("start", this.onStart);
    this.controls.removeEventListener("end", this.onEnd);
    this.controls.removeEventListener("change", this.onChange);
    this.controls.dispose();
  }
}
