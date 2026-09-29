/**
 * Intro timeline (seconds from the moment the dry, dark plant is on screen).
 * All intro modules read their timing from here so the sequence can be tuned
 * in one place.
 */
export const INTRO = {
  pourStart: 0.55,
  impact: 1.0,
  pourStop: 1.1,
  /** Pipe fill schedule offset: pipe.fillAt is relative to this. */
  activation: 1.05,
  rippleSpeed: 24,
  lightUp: [0.95, 2.1] as const,
  sea: [1.05, 1.75] as const,
  pretreatTanks: [1.5, 2.2] as const,
  pumpsSpin: [1.95, 2.55] as const,
  product: [2.55, 3.35] as const,
  outfall: 3.05,
  wetFade: [2.4, 3.6] as const,
  camera: [0, 3.4] as const,
  dof: [0, 2.3] as const,
  ui: {
    sidebar: 1.35,
    header: 1.85,
    telemetry: 2.0,
    panel1: 2.2,
    panel2: 2.35,
    panel3: 2.5,
    panel4: 2.65,
  },
  stages: {
    initializing: 0.55,
    synchronizing: 1.65,
    synchronized: 3.0,
    live: 3.4,
  },
  end: 3.85,
} as const;

export type IntroStage = "offline" | "initializing" | "synchronizing" | "synchronized" | "live" | "done";

export const STAGE_TEXT: Record<IntroStage, string> = {
  offline: "Digital twin offline",
  initializing: "Initializing digital twin",
  synchronizing: "Synchronizing plant model",
  synchronized: "Digital twin synchronized",
  live: "Live",
  done: "Live",
};

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
export const easeInOutCubic = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const window01 = (t: number, a: number, b: number) => Math.min(Math.max((t - a) / (b - a), 0), 1);
