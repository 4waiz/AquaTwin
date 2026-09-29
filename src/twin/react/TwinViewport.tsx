"use client";
/**
 * A page-level slot for the persistent 3D twin. The canvas (owned by
 * TwinHost) is positioned exactly over this element; children render on top
 * of the canvas (callouts, controls). If WebGL is unavailable, a 2D process
 * schematic is shown instead so the page still works.
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { CameraPreset } from "../CameraRig";
import { useViewport } from "./viewportStore";
import { useUi } from "@/state/ui";
import { ProcessSchematic } from "@/components/twin/ProcessSchematic";

export function TwinViewport({ preset = "overview", className = "", children }: { preset?: CameraPreset; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const failed = useUi((s) => s.twinFailed);
  const touch3d = useUi((s) => s.touch3d);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    useViewport.getState().register(el, preset);
    return () => {
      useViewport.getState().unregister(el);
      useUi.getState().setTouch3d(false);
    };
  }, [preset]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {failed && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-ink-900 p-8">
          <ProcessSchematic />
        </div>
      )}
      {children}
      {!failed && (
        <button
          type="button"
          onClick={() => useUi.getState().setTouch3d(!touch3d)}
          aria-pressed={touch3d}
          className={`absolute bottom-3 left-3 z-[4] hidden h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] pointer-coarse:inline-flex ${
            touch3d ? "border-accent/60 bg-accent-soft/60 text-fg" : "border-line-strong bg-ink-900/90 text-fg-muted"
          }`}
        >
          {touch3d ? "Done exploring" : "Explore 3D"}
        </button>
      )}
    </div>
  );
}
