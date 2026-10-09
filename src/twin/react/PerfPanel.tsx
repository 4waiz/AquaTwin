"use client";
/**
 * Hidden developer performance panel: toggle with Ctrl+Shift+P.
 * Not part of the judge-facing interface.
 */
import { useEffect, useState } from "react";
import { engineHandle } from "./viewportStore";
import { useUi } from "@/state/ui";
import type { PerfStats } from "../render/PerfMonitor";

export function PerfPanel() {
  const open = useUi((s) => s.perfOpen);
  const toggle = useUi((s) => s.togglePerf);
  const [stats, setStats] = useState<PerfStats | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setStats(engineHandle.current?.stats() ?? null), 500);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-6">
      <span className="text-fg-subtle">{k}</span>
      <span className="num text-fg">{v}</span>
    </div>
  );
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 w-64 rounded-lg border border-line-strong bg-ink-900/95 p-3 font-mono text-[11px] shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-fg-muted">Renderer · dev</span>
        <span className="text-fg-faint">Ctrl+Shift+P</span>
      </div>
      {stats ? (
        <div className="space-y-0.5">
          {row("FPS", stats.fps.toFixed(0))}
          {row("CPU frame", `${stats.cpuMs.toFixed(2)} ms`)}
          {row("GPU (timer query)", stats.gpuMs === null ? "n/a" : `${stats.gpuMs.toFixed(2)} ms`)}
          {row("Draw calls", stats.drawCalls.toLocaleString())}
          {row("Triangles", stats.triangles.toLocaleString())}
          {row("Points", stats.points.toLocaleString())}
          {row("Textures", String(stats.textures))}
          {row("Geometries", String(stats.geometries))}
          {row("Programs", String(stats.programs))}
          {row("JS heap", stats.heapMB === null ? "n/a" : `${stats.heapMB.toFixed(0)} MB`)}
          {row("Particles", stats.particles.toLocaleString())}
          {row("Backend", stats.backend)}
          {row("WebGPU adapter", stats.webgpuAvailable === null ? "checking" : stats.webgpuAvailable ? "available" : "none")}
          {row("Canvas", `${stats.size} @${stats.pixelRatio}x`)}
          {row("Quality", stats.quality)}
        </div>
      ) : (
        <div className="text-fg-subtle">Twin not rendering on this page.</div>
      )}
    </div>
  );
}
