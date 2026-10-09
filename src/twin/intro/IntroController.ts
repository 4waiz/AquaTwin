/**
 * IntroController: owns intro time and turns it into:
 *   - activation / flow factors applied on top of the real twin state,
 *   - camera easing and depth-of-field amounts,
 *   - UI stage events (branding text, staggered panel reveal, LIVE).
 * The controller never touches simulation state.
 */
import { activationAt, FULL_ACTIVATION, type ActivationState } from "./PlantActivation";
import { flowAt, FULL_FLOW, type FlowActivation } from "./FlowAnimator";
import { easeInOutCubic, INTRO, window01, type IntroStage } from "./timeline";

export interface IntroFrame {
  t: number;
  activation: ActivationState;
  flow: FlowActivation;
  /** 0 → start pose, 1 → default pose. */
  camera: number;
  /** Depth-of-field amount 0..1. */
  dof: number;
}

export type RevealKey = keyof typeof INTRO.ui;

export interface IntroCallbacks {
  onStage?: (s: IntroStage) => void;
  onReveal?: (key: RevealKey) => void;
  onDone?: () => void;
}

export class IntroController {
  t = 0;
  running = false;
  finished = false;
  private stage: IntroStage = "offline";
  private revealed = new Set<RevealKey>();
  /** Developer QA hook: when set, intro time is held at this value. */
  hold: number | null = null;

  constructor(private cb: IntroCallbacks) {}

  start() {
    this.t = 0;
    this.running = true;
    this.finished = false;
    this.stage = "offline";
    this.revealed.clear();
    this.cb.onStage?.("offline");
  }

  /** Jump to the final state (Skip, reduced motion, or failure). */
  finish() {
    if (this.finished) return;
    this.t = INTRO.end;
    this.running = false;
    this.finished = true;
    for (const k of Object.keys(INTRO.ui) as RevealKey[]) {
      if (!this.revealed.has(k)) {
        this.revealed.add(k);
        this.cb.onReveal?.(k);
      }
    }
    this.cb.onStage?.("done");
    this.cb.onDone?.();
  }

  update(dt: number): IntroFrame {
    if (this.running) {
      if (this.hold !== null) this.t = this.hold;
      else this.t += Math.min(dt, 1 / 20);
      const t = this.t;
      for (const [s, at] of Object.entries(INTRO.stages) as [IntroStage, number][]) {
        if (t >= at && this.stageRank(s) > this.stageRank(this.stage)) {
          this.stage = s;
          this.cb.onStage?.(s);
        }
      }
      for (const [k, at] of Object.entries(INTRO.ui) as [RevealKey, number][]) {
        if (t >= at && !this.revealed.has(k)) {
          this.revealed.add(k);
          this.cb.onReveal?.(k);
        }
      }
      if (t >= INTRO.end) this.finish();
    }
    return this.frame();
  }

  frame(): IntroFrame {
    if (this.finished || !this.running) {
      return { t: this.t, activation: FULL_ACTIVATION, flow: FULL_FLOW, camera: 1, dof: 0 };
    }
    const t = this.t;
    return {
      t,
      activation: activationAt(t),
      flow: flowAt(t),
      camera: easeInOutCubic(window01(t, INTRO.camera[0], INTRO.camera[1])),
      dof: 1 - easeInOutCubic(window01(t, INTRO.dof[0] + 1.0, INTRO.dof[1])),
    };
  }

  private stageRank(s: IntroStage) {
    return ["offline", "initializing", "synchronizing", "synchronized", "live", "done"].indexOf(s);
  }
}
