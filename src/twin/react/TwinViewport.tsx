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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    useViewport.getState().register(el, preset);
    return () => useViewport.getState().unregister(el);
  }, [preset]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {failed && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-ink-900 p-8">
          <ProcessSchematic />
        </div>
      )}
      {children}
    </div>
  );
}
