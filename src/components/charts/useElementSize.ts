"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Tracks an element's content box with a ResizeObserver. */
export function useElementSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const raf = useRef(0);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setSize({ width: Math.floor(r.width), height: Math.floor(r.height) }));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [el]);
  return [ref, size] as const;
}
