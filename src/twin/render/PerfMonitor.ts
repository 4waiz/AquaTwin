/**
 * Frame statistics for the hidden developer panel (Ctrl+Shift+P): FPS, CPU
 * frame time, GPU time (EXT_disjoint_timer_query_webgl2 where the browser
 * exposes it), draw calls, triangles, textures, geometries and JS heap.
 * The recent per-frame GPU and CPU costs of busy frames (the view moving)
 * also drive the quality governor.
 */
import type * as THREE from "three";

export interface PerfStats {
  fps: number;
  cpuMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
  points: number;
  textures: number;
  geometries: number;
  programs: number;
  heapMB: number | null;
  particles: number;
  backend: string;
  webgpuAvailable: boolean | null;
  pixelRatio: number;
  size: string;
  quality: string;
}

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

const RECENT = 40;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export class PerfMonitor {
  private frames = 0;
  private acc = 0;
  private cpuAcc = 0;
  private lastFps = 0;
  private lastCpu = 0;
  private gpuMs: number | null = null;
  private gpuAcc = 0;
  private gpuN = 0;
  private gl: WebGL2RenderingContext;
  private ext: TimerExt | null;
  private pending: { q: WebGLQuery; busy: boolean }[] = [];
  private active: WebGLQuery | null = null;
  private probed = false;
  webgpuAvailable: boolean | null = null;
  private gpuRecent: number[] = [];
  private cpuRecent: number[] = [];

  constructor(private renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
  }

  /** Asking for a WebGPU adapter starts a second GPU device, so only do it when someone looks. */
  private probeWebGpu() {
    this.probed = true;
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (nav.gpu) {
      nav.gpu
        .requestAdapter()
        .then((a) => (this.webgpuAvailable = !!a))
        .catch(() => (this.webgpuAvailable = false));
    } else this.webgpuAvailable = false;
  }

  beginGpu() {
    if (!this.ext || this.active) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  /**
   * `busy`: the frame was rendered while the view moves. Only those frames inform the governor:
   * a still view renders 30 frames a second, and a GPU that idles between frames clocks itself
   * down, so its per-frame time reads high without saying anything about capacity.
   */
  endGpu(busy: boolean) {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push({ q: this.active, busy });
    this.active = null;
    // Collect finished queries.
    while (this.pending.length) {
      const { q, busy: wasBusy } = this.pending[0];
      const available = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE);
      const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      if (!available) break;
      if (!disjoint) {
        const ms = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) / 1e6;
        this.gpuAcc += ms;
        this.gpuN++;
        if (wasBusy) {
          this.gpuRecent.push(ms);
          if (this.gpuRecent.length > RECENT) this.gpuRecent.shift();
        }
      }
      this.gl.deleteQuery(q);
      this.pending.shift();
    }
  }

  /**
   * Typical cost of one busy frame (ms): the larger of the median GPU time and the median CPU
   * time of the loop over the last busy frames. Medians ignore one-off spikes (shader compiles,
   * uploads). Null without the timer extension or before enough frames are measured.
   */
  frameCost(): number | null {
    if (!this.ext || this.gpuRecent.length < RECENT / 2) return null;
    return Math.max(median(this.gpuRecent), median(this.cpuRecent));
  }

  /** Forget recent costs (after a quality change they describe the old settings). */
  resetCost() {
    this.gpuRecent.length = 0;
    this.cpuRecent.length = 0;
  }

  frame(dtSeconds: number, cpuMs: number, busy: boolean) {
    if (busy) {
      this.cpuRecent.push(cpuMs);
      if (this.cpuRecent.length > RECENT) this.cpuRecent.shift();
    }
    this.frames++;
    this.acc += dtSeconds;
    this.cpuAcc += cpuMs;
    if (this.acc >= 0.5) {
      this.lastFps = this.frames / this.acc;
      this.lastCpu = this.cpuAcc / this.frames;
      if (this.gpuN) this.gpuMs = this.gpuAcc / this.gpuN;
      this.gpuAcc = 0;
      this.gpuN = 0;
      this.frames = 0;
      this.acc = 0;
      this.cpuAcc = 0;
    }
  }

  stats(particles: number, size: string, quality: string): PerfStats {
    if (!this.probed) this.probeWebGpu();
    const info = this.renderer.info;
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      fps: this.lastFps,
      cpuMs: this.lastCpu,
      gpuMs: this.ext ? this.gpuMs : null,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      heapMB: perf.memory ? perf.memory.usedJSHeapSize / 1048576 : null,
      particles,
      backend: "WebGL2",
      webgpuAvailable: this.webgpuAvailable,
      pixelRatio: this.renderer.getPixelRatio(),
      size,
      quality,
    };
  }
}
