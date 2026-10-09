/**
 * Starting quality from the GPU the browser reports. Built-in laptop graphics
 * (and phones) start at the medium tier, software rasterisers at low;
 * discrete and unknown GPUs start at high. The frame-time governor in
 * TwinEngine still steps down from there if frames are slow.
 */
import type { QualityTier } from "../TwinEngine";

export type GpuClass = "software" | "mobile" | "integrated" | "discrete" | "unknown";

export function gpuRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}

export function classifyGpu(renderer: string): GpuClass {
  const r = renderer.toLowerCase();
  if (!r) return "unknown";
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(r)) return "software";
  if (/mali|adreno|powervr|videocore|tegra|apple gpu/.test(r)) return "mobile";
  // Apple silicon: the Pro / Max / Ultra parts are discrete-class.
  if (/apple m\d+ (pro|max|ultra)/.test(r)) return "discrete";
  if (/nvidia|geforce|quadro|rtx|radeon (rx|pro|r9|vii)|arc\(tm\) a\d|arc a\d/.test(r)) return "discrete";
  if (/intel|uhd|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega|apple m\d|apple/.test(r)) return "integrated";
  return "unknown";
}

export function startingTier(gpu: GpuClass, coarsePointer: boolean): QualityTier {
  if (gpu === "software") return 0;
  if (gpu === "mobile" || gpu === "integrated" || coarsePointer) return 1;
  return 2;
}
