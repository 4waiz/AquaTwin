/**
 * TwinEngine — the persistent 3D digital twin.
 *
 * One WebGL2 renderer for the whole application; pages position its canvas
 * over their viewport slot. Each frame the engine composes:
 *   visual state (live telemetry or scenario step, smoothed)
 *   × intro activation (plant coming online)
 * and renders through the post-processing stack.
 */
import * as THREE from "three";
import type { AssetId } from "@/sim/scenarios";
import { CameraRig, type CameraPreset } from "./CameraRig";
import { IntroController, type IntroCallbacks, type IntroFrame } from "./intro/IntroController";
import { WaterPour } from "./intro/WaterPour";
import { PerfMonitor, type PerfStats } from "./render/PerfMonitor";
import { PostFX } from "./render/PostFX";
import { buildStudioEnvironment } from "./render/StudioEnvironment";
import { FlowParticles } from "./scene/FlowParticles";
import { ASSETS, ASSET_BY_ID, OUTFALL, pipeDefs, POUR_TARGET, SEA_LEVEL } from "./scene/layout";
import { makePalette, makeWetUniforms, type WetUniforms } from "./scene/materials";
import { Pipes, WATER_COLORS } from "./scene/Pipes";
import { buildPlant, type PlantBuild } from "./scene/PlantModel";
import { SeaSurface } from "./scene/Water";
import { DEFAULT_VISUAL, type Tone, type TwinVisualState } from "./visualState";

export interface AnchorScreen {
  id: AssetId;
  x: number;
  y: number;
  visible: boolean;
}

export interface EngineCallbacks extends IntroCallbacks {
  onAnchors?: (a: AnchorScreen[]) => void;
  onPick?: (id: AssetId | null) => void;
  onHover?: (id: AssetId | null) => void;
  onContextLost?: () => void;
}

const TONE_COLOR: Record<Tone, THREE.Color> = {
  ok: new THREE.Color("#3ecf8e"),
  warn: new THREE.Color("#f2a93b"),
  crit: new THREE.Color("#f0564d"),
  off: new THREE.Color("#1b2129"),
};

const BASE_EXPOSURE = 1.02;
const BASE_KEY = 2.4;
const BASE_ENV = 0.85;

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

/** Rendering quality tiers: 2 = full (default), 1 = no GTAO / smaller shadows, 0 = minimal. */
export type QualityTier = 0 | 1 | 2;
const TIER_NAME = ["low", "medium", "high"] as const;

export class TwinEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 400);
  private rig: CameraRig;
  private post: PostFX;
  private perf: PerfMonitor;
  private plant: PlantBuild;
  private pipes: Pipes;
  private particles: FlowParticles;
  private sea: SeaSurface;
  private pour: WaterPour;
  private intro: IntroController;
  private wet: WetUniforms;
  private key: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private lastFrame = 0;
  private time = 0;
  private raf = 0;
  private active = false;
  private width = 2;
  private height = 2;
  private target: TwinVisualState = DEFAULT_VISUAL;
  private cur: TwinVisualState = structuredClone(DEFAULT_VISUAL);
  private selected: AssetId | null = null;
  private hovered: AssetId | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt: { x: number; y: number } | null = null;
  private anchorTmp = new THREE.Vector3();
  private disposed = false;
  private introMode: "full" | "skip" = "skip";
  private fadeIn = 1;
  private pipeColors = new Map<string, THREE.Color>();
  // Quality governor: steps down (never up) when frames are persistently slow.
  private tier: QualityTier = 2;
  private tierForced = false;
  private settle = 0;
  private emaDt = 1 / 60;
  private slowFor = 0;
  private cooldown = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EngineCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = BASE_EXPOSURE;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    // r186: PCF samples a Vogel disk scaled by shadow.radius (soft). PCFSoft was removed;
    // it must be set explicitly *before* programs are compiled.
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    r.setClearColor(new THREE.Color("#070a0f"), 1);

    canvas.addEventListener("webglcontextlost", this.onContextLost, false);

    // --- scene basics
    this.scene.background = new THREE.Color("#070a0f");
    this.scene.fog = new THREE.Fog(new THREE.Color("#070a0f"), 70, 150);
    this.scene.environment = buildStudioEnvironment(r);
    this.scene.environmentIntensity = BASE_ENV;

    // --- lights
    this.key = new THREE.DirectionalLight(new THREE.Color("#f4f1ea"), BASE_KEY);
    this.key.position.set(-26, 42, 22);
    this.key.target.position.set(0, 0, -1);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 5;
    sc.far = 110;
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.00025;
    this.key.shadow.normalBias = 0.035;
    this.key.shadow.radius = 3;
    this.fill = new THREE.DirectionalLight(new THREE.Color("#9fb8e6"), 0.35);
    this.fill.position.set(30, 18, -10);
    const rim = new THREE.DirectionalLight(new THREE.Color("#c9d8f2"), 0.45);
    rim.position.set(6, 16, -40);
    this.scene.add(this.key, this.key.target, this.fill, rim);

    // --- content
    this.wet = makeWetUniforms();
    this.wet.uRippleOrigin.value.copy(POUR_TARGET);
    const pal = makePalette(this.wet);
    this.plant = buildPlant(pal);
    this.scene.add(this.plant.root);
    this.pipes = new Pipes(pipeDefs(), pal.steel(), pal.paintDark());
    this.scene.add(this.pipes.group);
    for (const p of this.pipes.pipes) this.pipeColors.set(p.def.id, WATER_COLORS[p.def.kind].clone());
    this.particles = new FlowParticles(this.pipes.pipes);
    this.scene.add(this.particles.points);
    this.sea = new SeaSurface(2, 2, SEA_LEVEL);
    this.sea.uniforms.uRippleOrigin.value.copy(POUR_TARGET);
    this.sea.uniforms.uPlumeOrigin.value.set(OUTFALL.x, SEA_LEVEL, OUTFALL.z);
    this.scene.add(this.sea.mesh);
    this.pour = new WaterPour(POUR_TARGET);
    this.scene.add(this.pour.group);

    this.rig = new CameraRig(this.camera, canvas);
    this.post = new PostFX(r, this.scene, this.camera, 2, 2);
    this.perf = new PerfMonitor(r);
    this.intro = new IntroController(cb);

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  /** Compile shaders ahead of time so the intro starts without hitches. */
  async warmup() {
    this.rig.applyIntro(0);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.applyFrame(this.intro.frame(), 0);
    this.post.render(0, 0);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  startIntro(mode: "full" | "skip") {
    this.introMode = mode;
    if (mode === "full") {
      this.intro.start();
      this.fadeIn = 1;
    } else {
      this.intro.finish();
      this.fadeIn = 0;
    }
  }

  skipIntro() {
    if (this.intro.running) {
      this.intro.finish();
      this.fadeIn = 0.35;
      this.rig.setPreset(this.rig.preset, false);
    }
  }

  get introRunning() {
    return this.intro.running;
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.settle = 0;
    this.applySize();
  }

  private applySize() {
    const w = this.width;
    const h = this.height;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w * pr, h * pr);
    this.sea.setSize(w * pr, h * pr);
    this.particles.setPixelRatio(pr);
    this.pour.setPixelRatio(pr);
    this.rig.setAspect(w / h);
    if (!this.rig.animating && !this.intro.running) this.rig.setPreset(this.rig.preset, false);
  }

  setPreset(p: CameraPreset, animate = true) {
    this.rig.setPreset(p, animate && !this.intro.running);
  }

  setVisual(v: TwinVisualState) {
    this.target = v;
  }

  setSelected(id: AssetId | null, focus = true) {
    this.selected = id;
    if (id && focus && !this.intro.running) {
      const a = ASSET_BY_ID[id];
      this.rig.focus(a.focus.target, a.focus.distance);
    }
  }

  resetCamera() {
    this.selected = null;
    this.rig.reset();
  }

  setActive(active: boolean) {
    if (active === this.active || this.disposed) return;
    this.active = active;
    if (active) {
      this.lastFrame = performance.now();
      this.settle = 0;
      this.raf = requestAnimationFrame(this.loop);
    } else {
      cancelAnimationFrame(this.raf);
    }
  }

  stats(): PerfStats {
    return this.perf.stats(this.particles.count + this.pour.particleCount, `${this.width}×${this.height}`, `${TIER_NAME[this.tier]} (${this.tierForced ? "forced" : "auto"})`);
  }

  /** Set the rendering quality tier; `forced` disables the automatic governor. */
  setQuality(tier: QualityTier, forced = true) {
    this.tierForced = forced;
    if (tier === this.tier) return;
    this.tier = tier;
    const dpr = window.devicePixelRatio || 1;
    this.post.gtao.enabled = tier === 2;
    this.post.bloom.enabled = tier > 0;
    const shadow = tier === 2 ? 4096 : tier === 1 ? 2048 : 1024;
    if (this.key.shadow.mapSize.x !== shadow) {
      this.key.shadow.mapSize.set(shadow, shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.sea.reflectionScale = tier === 2 ? 0.5 : tier === 1 ? 0.35 : 0.25;
    this.renderer.setPixelRatio(tier === 2 ? Math.min(dpr, 2) : tier === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.85);
    this.applySize();
  }

  private governQuality(dt: number) {
    if (this.tierForced || this.tier === 0 || this.intro.running || dt >= 0.1) return;
    this.settle += dt;
    if (this.settle < 2) return;
    this.emaDt += (dt - this.emaDt) * 0.05;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    this.slowFor = this.emaDt > 1 / 45 ? this.slowFor + dt : Math.max(0, this.slowFor - dt);
    if (this.slowFor > 2.5) {
      this.setQuality((this.tier - 1) as QualityTier, false);
      this.slowFor = 0;
      this.cooldown = 3;
      this.emaDt = 1 / 60;
    }
  }

  dispose() {
    this.disposed = true;
    this.setActive(false);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.rig.dispose();
    this.post.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private pick(ev: PointerEvent): AssetId | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.plant.proxies, false)[0];
    return hit ? (hit.object.userData.assetId as AssetId) : null;
  }

  private onPointerMove = (ev: PointerEvent) => {
    if (this.intro.running || ev.buttons) return;
    const id = this.pick(ev);
    if (id !== this.hovered) {
      this.hovered = id;
      this.canvas.style.cursor = id ? "pointer" : "grab";
      this.cb.onHover?.(id);
    }
  };

  private onPointerDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
    this.canvas.style.cursor = "grabbing";
  };

  private onPointerUp = (ev: PointerEvent) => {
    this.canvas.style.cursor = this.hovered ? "pointer" : "grab";
    if (!this.downAt || this.intro.running) return;
    const moved = Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 5) return;
    const id = this.pick(ev);
    this.cb.onPick?.(id);
  };

  private onPointerLeave = () => {
    if (this.hovered) {
      this.hovered = null;
      this.cb.onHover?.(null);
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.setActive(false);
    this.cb.onContextLost?.();
  };

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private loop = () => {
    if (!this.active || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const t0 = performance.now();
    const dt = Math.min((t0 - this.lastFrame) / 1000, 0.1);
    this.lastFrame = t0;
    this.time += dt;
    const frame = this.intro.update(dt);
    if (this.intro.running) this.rig.applyIntro(frame.camera);
    else this.rig.update(dt);
    this.applyFrame(frame, dt);
    this.renderer.info.reset();
    this.perf.beginGpu();
    if (this.sea.mesh.visible && this.sea.uniforms.uLevelFade.value > 0.01) {
      this.sea.reflection.update(this.renderer, this.scene, this.camera, [this.sea.mesh, this.particles.points, this.pour.group]);
    }
    this.post.render(dt, this.time);
    this.perf.endGpu();
    this.perf.frame(dt, performance.now() - t0);
    this.governQuality(dt);
    this.emitAnchors();
  };

  private applyFrame(frame: IntroFrame, dt: number) {
    const act = frame.activation;
    const flow = frame.flow;
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
    const c = this.cur;
    const tg = this.target;

    // Smooth the visual state so simulation updates never pop.
    c.intakeFlow = lerp(c.intakeFlow, tg.intakeFlow, k);
    for (let i = 0; i < 3; i++) {
      c.hpFlow[i] = lerp(c.hpFlow[i], tg.hpFlow[i], k);
      c.permeateFlow[i] = lerp(c.permeateFlow[i], tg.permeateFlow[i], k);
      c.brineFlow[i] = lerp(c.brineFlow[i], tg.brineFlow[i], k);
      c.pressureRel[i] = lerp(c.pressureRel[i], tg.pressureRel[i], k);
      c.pumpSpeed[i] = lerp(c.pumpSpeed[i], tg.pumpSpeed[i], k);
      c.pumpRing[i] = lerp(c.pumpRing[i], tg.pumpRing[i], k * 1.5);
    }
    c.salinityRel = lerp(c.salinityRel, tg.salinityRel, k);
    c.turbidity = lerp(c.turbidity, tg.turbidity, k);
    c.productLevel = lerp(c.productLevel, tg.productLevel, k);
    c.pretreatLevel = lerp(c.pretreatLevel, tg.pretreatLevel, k);
    c.pumpTone = tg.pumpTone;
    c.trainTone = tg.trainTone;
    c.trainOnline = tg.trainOnline;
    c.intakeTone = tg.intakeTone;
    c.pretreatTone = tg.pretreatTone;
    c.productTone = tg.productTone;
    c.brineTone = tg.brineTone;
    c.constrained = tg.constrained;

    // Lighting ramps (intro) and final fade-in after skip / reduced motion.
    this.fadeIn = Math.min(1, this.fadeIn + dt * 2.8);
    this.renderer.toneMappingExposure = BASE_EXPOSURE * act.exposure;
    this.key.intensity = BASE_KEY * act.keyLight;
    this.scene.environmentIntensity = BASE_ENV * act.envIntensity;
    this.post.grade.uniforms.uFade.value = this.introMode === "full" && this.intro.running ? 1 : 0.35 + 0.65 * this.fadeIn;

    // Wet activation + ripple.
    this.wet.uRippleRadius.value = act.rippleRadius;
    this.wet.uWetness.value = act.wetness;
    this.wet.uWetRadius.value = act.wetRadius;
    this.sea.uniforms.uRippleRadius.value = act.rippleRadius;
    this.plant.windows.emissiveIntensity = 0.55 * act.windows;
    this.plant.lamps.emissiveIntensity = 0.55 * act.lamps;
    this.pipes.setShellOpacity(act.shellOpacity);

    // Pipes and particles.
    const salDark = 1 - Math.min(0.35, Math.max(0, (c.salinityRel - 1) * 2.2));
    const avgBrine = (c.brineFlow[0] + c.brineFlow[1] + c.brineFlow[2]) / 3;
    this.pipes.pipes.forEach((p, row) => {
      const d = p.def;
      let rel = 1;
      let warn = 0;
      let pulse = 0;
      if (d.id.startsWith("intake") || d.id === "pretreat-out" || d.id === "suction") {
        rel = c.intakeFlow;
        warn = d.id.startsWith("intake") ? toneWarn(c.intakeTone) : toneWarn(c.pretreatTone);
      } else if (d.kind === "hp") {
        rel = c.hpFlow[d.train!];
        warn = toneWarn(c.pumpTone[d.train!]);
        pulse = Math.min(1, Math.max(0, (c.pressureRel[d.train!] - 1) * 6));
      } else if (d.kind === "permeate") {
        rel = c.permeateFlow[d.train!];
        warn = toneWarn(c.trainTone[d.train!]) * 0.6;
      } else if (d.kind === "brine") {
        rel = d.id === "outfall" ? avgBrine : c.brineFlow[d.train!];
      }
      const fill = flow.pipeFill[d.id] ?? 1;
      const speed = 2.1 * Math.max(0, rel) * (0.4 + 0.6 * flow.flowActive);
      const base = WATER_COLORS[d.kind];
      const col = this.pipeColors.get(d.id)!;
      col.copy(base);
      if (d.kind === "feed" || d.kind === "hp") col.multiplyScalar(salDark);
      const u = p.uniforms;
      u.uFill.value = fill;
      u.uSpeed.value = speed;
      u.uActive.value = flow.flowActive * Math.min(1, rel * 1.2);
      u.uWarn.value = lerp(u.uWarn.value, warn, k * 1.2);
      u.uPulse.value = pulse;
      u.uColor.value.copy(col);
      this.particles.set(row, {
        speed: speed * 1.35,
        density: Math.min(1, Math.max(0, rel)) * 0.55 * flow.flowActive,
        fill,
        color: col,
        warn: u.uWarn.value,
      });
    });
    this.pipes.update(this.time);
    this.particles.update(this.time);

    // Pumps.
    this.plant.pumps.forEach((pu, i) => {
      pu.angle += dt * 16 * c.pumpSpeed[i] * flow.pumps;
      pu.rotor.rotation.x = pu.angle;
      const ringOn = c.pumpRing[i];
      pu.ring.material.opacity = ringOn * (0.45 + 0.25 * Math.sin(this.time * 2.4)) * flow.pumps;
    });

    // Water surfaces.
    this.plant.pretreatWater.forEach((w) => {
      w.setLevel(c.pretreatLevel * flow.pretreatTanks, flow.pretreatTanks);
      w.update(this.time);
    });
    this.plant.productWater.setLevel(c.productLevel * flow.product, flow.product);
    this.plant.productWater.update(this.time);
    const su = this.sea.uniforms;
    su.uTime.value = this.time;
    su.uLevelFade.value = flow.sea;
    su.uTurbidity.value = Math.min(0.75, Math.max(0, (c.turbidity - 2.5) / 14));
    su.uPlume.value = flow.outfall * Math.min(1.2, avgBrine);
    this.sea.mesh.position.y = SEA_LEVEL - (1 - flow.sea) * 0.9;
    this.sea.mesh.visible = flow.sea > 0.001;

    // Assets: beacons, state tint, hover / selection.
    const tone: Record<AssetId, Tone> = {
      intake: c.intakeTone,
      pretreatment: c.pretreatTone,
      pumps: worstTone(c.pumpTone),
      ro1: c.trainTone[0],
      ro2: c.trainTone[1],
      ro3: c.trainTone[2],
      product: c.productTone,
      brine: c.brineTone,
    };
    for (const def of ASSETS) {
      const a = this.plant.assets[def.id];
      const tn = tone[def.id];
      const on = act.beacons[def.id];
      for (const b of a.beacons) {
        b.material.emissive.copy(TONE_COLOR[tn]);
        b.material.emissiveIntensity = (tn === "off" ? 0 : tn === "ok" ? 2.2 : 3.2) * on;
      }
      const hTarget = this.selected === def.id ? 1 : this.hovered === def.id ? 0.5 : 0;
      a.select = lerp(a.select, hTarget, dt > 0 ? 1 - Math.exp(-dt * 10) : 1);
      a.highlight.uHighlight.value = a.select * 0.55;
      const stateMix = tn === "warn" ? 0.55 : tn === "crit" ? 0.8 : 0;
      a.highlight.uStateMix.value = lerp(a.highlight.uStateMix.value, stateMix * on, k);
      a.highlight.uStateColor.value.copy(tn === "crit" ? TONE_COLOR.crit : TONE_COLOR.warn);
      a.footprint.material.uniforms.uOpacity.value = a.select;
    }

    // Intro stream + depth of field.
    this.pour.update(frame.t);
    if (!this.intro.running) this.pour.group.visible = false;
    const dof = this.intro.running ? frame.dof : 0;
    this.post.bokeh.enabled = dof > 0.01;
    if (this.post.bokeh.enabled) {
      const u = this.post.bokeh.uniforms as Record<string, THREE.IUniform>;
      u.focus.value = this.camera.position.distanceTo(POUR_TARGET);
      u.aperture.value = 0.00016 * dof;
      u.maxblur.value = 0.006 * dof;
    }
  }

  private emitAnchors() {
    if (!this.cb.onAnchors) return;
    const out: AnchorScreen[] = [];
    for (const def of ASSETS) {
      this.anchorTmp.copy(def.anchor).project(this.camera);
      const visible = this.anchorTmp.z < 1 && Math.abs(this.anchorTmp.x) < 1.05 && Math.abs(this.anchorTmp.y) < 1.05;
      out.push({ id: def.id, x: (this.anchorTmp.x * 0.5 + 0.5) * this.width, y: (-this.anchorTmp.y * 0.5 + 0.5) * this.height, visible });
    }
    this.cb.onAnchors(out);
  }
}

function toneWarn(t: Tone) {
  return t === "warn" ? 0.75 : t === "crit" ? 1 : 0;
}

function worstTone(ts: Tone[]): Tone {
  if (ts.includes("crit")) return "crit";
  if (ts.includes("warn")) return "warn";
  if (ts.every((t) => t === "off")) return "off";
  return "ok";
}
