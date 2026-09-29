/**
 * Frame statistics for the hidden developer panel (Ctrl+Shift+P): FPS, CPU
 * frame time, GPU time (EXT_disjoint_timer_query_webgl2 where the browser
 * exposes it), draw calls, triangles, textures, geometries and JS heap.
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
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  webgpuAvailable: boolean | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }) : null;
    if (nav?.gpu) {
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

  endGpu() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    // Collect finished queries.
    while (this.pending.length) {
      const q = this.pending[0];
      const available = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE);
      const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      if (!available) break;
      if (!disjoint) {
        this.gpuAcc += this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) / 1e6;
        this.gpuN++;
      }
      this.gl.deleteQuery(q);
      this.pending.shift();
    }
  }

  frame(dtSeconds: number, cpuMs: number) {
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
