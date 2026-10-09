"use client";
/**
 * TwinHost: mounts the single persistent WebGL canvas for the application
 * and keeps it aligned with whichever page viewport slot is registered.
 * Also owns the intro decision (full / skip), wires simulation state into the
 * engine and falls back gracefully if WebGL is unavailable.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { TwinEngine } from "../TwinEngine";
import { useViewport, anchorBus, engineHandle } from "./viewportStore";
import { useIntro, revealAll, revealGroup, INTRO_SESSION_KEY } from "./introBus";
import { fromLive, fromScenario, pointAt } from "../visualState";
import { useLive } from "@/state/live";
import { useScenario } from "@/state/scenario";
import { useUi } from "@/state/ui";

function decideIntro(pathname: string): "full" | "skip" {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "0") return "skip";
    const force = params.get("intro") === "1";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return "skip";
    if (force) return "full";
    const played = window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    return !played && pathname === "/" ? "full" : "skip";
  } catch {
    return "skip";
  }
}

function markPlayed() {
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function TwinHost() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TwinEngine | null>(null);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // ------------------------------------------------------------------ mount
  useEffect(() => {
    let cancelled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const intro = useIntro.getState();
    const fail = () => {
      useUi.getState().setTwinFailed(true);
      useUi.getState().setIntroPhase("done");
      useIntro.getState().setStage("done");
      revealAll();
      markPlayed();
    };
    (async () => {
      try {
        const { TwinEngine } = await import("../TwinEngine");
        if (cancelled || !canvasRef.current) return;
        const mode = decideIntro(pathRef.current);
        intro.setMode(mode);
        // Never let a slow start block the interface: if the engine is not
        // rendering within 12 s, reveal everything and skip the intro.
        watchdog = setTimeout(() => {
          if (useUi.getState().introPhase === "pending") {
            engineRef.current?.skipIntro();
            useUi.getState().setIntroPhase("done");
            useIntro.getState().setStage("done");
            revealAll();
            markPlayed();
          }
        }, 12000);
        const engine = new TwinEngine(canvasRef.current, {
          onStage: (s) => useIntro.getState().setStage(s),
          onReveal: (k) => revealGroup(k),
          onDone: () => {
            useUi.getState().setIntroPhase("done");
            useIntro.getState().setShowSkip(false);
            revealAll();
            markPlayed();
          },
          onAnchors: (a) => anchorBus.emit(a),
          onPick: (id) => useUi.getState().select(id),
          onHover: (id) => useUi.getState().hover(id),
          onContextLost: fail,
        });
        engineRef.current = engine;
        engineHandle.current = engine;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __twin: TwinEngine }).__twin = engine;
        // ?quality=high|medium|low pins the rendering tier (demos, QA); otherwise it adapts.
        const q = new URLSearchParams(window.location.search).get("quality");
        const forced = q === "high" ? 2 : q === "medium" ? 1 : q === "low" ? 0 : null;
        if (forced !== null) engine.setQuality(forced, true);
        // Otherwise start from the GPU class (built-in graphics, phones and tablets one tier down).
        else engine.autoQuality(window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024);
        await engine.warmup();
        if (cancelled) return;
        // The page's slot may have registered before the engine existed.
        engine.setPreset(useViewport.getState().preset, false);
        useUi.getState().setIntroPhase(mode === "full" ? "playing" : "done");
        if (watchdog) clearTimeout(watchdog);
        if (mode === "full" && useUi.getState().introPhase === "playing") {
          useIntro.getState().setShowSkip(true);
          engine.startIntro("full");
          // Bound the intro itself (e.g. if rendering stalls in a background tab).
          watchdog = setTimeout(() => {
            if (useUi.getState().introPhase !== "done") engineRef.current?.skipIntro();
          }, 15000);
        } else {
          engine.startIntro("skip");
          useIntro.getState().setStage("done");
          revealAll();
        }
        engine.setActive(true);
      } catch (e) {
        console.error("AquaTwin 3D twin unavailable:", e);
        fail();
      }
    })();
    return () => {
      cancelled = true;
      if (watchdog) clearTimeout(watchdog);
      engineRef.current?.dispose();
      engineRef.current = null;
      engineHandle.current = null;
    };
  }, []);

  // ------------------------------------------------------------------ skip requests
  useEffect(
    () =>
      useIntro.subscribe((s, prev) => {
        if (s.skipRequested !== prev.skipRequested) engineRef.current?.skipIntro();
      }),
    [],
  );

  // ------------------------------------------------------------------ keep canvas over the slot
  useEffect(() => {
    let raf = 0;
    let last = "";
    let sizedEngine: TwinEngine | null = null;
    let sized = "";
    let pending = "";
    let pendingAt = 0;
    const sync = () => {
      raf = requestAnimationFrame(sync);
      const wrap = wrapRef.current;
      const engine = engineRef.current;
      const slot = useViewport.getState().slot;
      if (!wrap) return;
      if (!slot || document.hidden) {
        if (last !== "hidden") {
          wrap.style.visibility = "hidden";
          engine?.setActive(false);
          last = "hidden";
        }
        return;
      }
      const r = slot.getBoundingClientRect();
      // Clip the fixed canvas to the scrolling page area so it never covers the
      // header or navigation when the page scrolls (clip-path also clips hit-testing).
      const sc = document.getElementById("page-scroll")?.getBoundingClientRect();
      const clipT = sc ? Math.max(0, Math.round(sc.top - r.top)) : 0;
      const clipB = sc ? Math.max(0, Math.round(r.bottom - sc.bottom)) : 0;
      const hiddenByScroll = clipT + clipB >= r.height - 1;
      const key = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}:${clipT}:${clipB}`;
      // Re-apply when the slot moves or resizes.
      if (key !== last) {
        wrap.style.visibility = hiddenByScroll ? "hidden" : "visible";
        wrap.style.transform = `translate3d(${Math.round(r.left)}px, ${Math.round(r.top)}px, 0)`;
        wrap.style.width = `${Math.round(r.width)}px`;
        wrap.style.height = `${Math.round(r.height)}px`;
        wrap.style.clipPath = clipT || clipB ? `inset(${clipT}px 0px ${clipB}px 0px)` : "";
        last = key;
      }
      if (!engine) return;
      // Resizing reallocates every render target, so wait until the slot has settled (the canvas
      // simply stretches for those few frames). A new engine is sized at once.
      const size = `${Math.round(r.width)}:${Math.round(r.height)}`;
      const now = performance.now();
      if (size !== pending) {
        pending = size;
        pendingAt = now;
      }
      if (engine !== sizedEngine || (size !== sized && now - pendingAt > 120)) {
        engine.setSize(r.width, r.height);
        sizedEngine = engine;
        sized = size;
      }
      if (r.width > 2 && r.height > 2) engine.setActive(!hiddenByScroll);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ------------------------------------------------------------------ touch: let pages scroll unless the user opts in
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      const wrap = wrapRef.current;
      if (wrap) wrap.style.pointerEvents = coarse.matches && !useUi.getState().touch3d ? "none" : "auto";
    };
    apply();
    const unsub = useUi.subscribe((s, prev) => s.touch3d !== prev.touch3d && apply());
    coarse.addEventListener("change", apply);
    return () => {
      unsub();
      coarse.removeEventListener("change", apply);
    };
  }, []);

  // ------------------------------------------------------------------ camera preset per page
  useEffect(
    () =>
      useViewport.subscribe((s, prev) => {
        if (s.preset !== prev.preset || s.slot !== prev.slot) engineRef.current?.setPreset(s.preset);
      }),
    [],
  );

  // ------------------------------------------------------------------ visual state
  useEffect(() => {
    const push = () => {
      const engine = engineRef.current;
      if (!engine) return;
      const sc = useScenario.getState();
      const res = sc.results[sc.selected];
      if (sc.active && res) {
        const p = pointAt(res[sc.branch].points, sc.cursor);
        if (p) {
          engine.setVisual(fromScenario(p));
          return;
        }
      }
      const snap = useLive.getState().snapshot;
      if (snap) engine.setVisual(fromLive(snap));
    };
    const u1 = useLive.subscribe(push);
    const u2 = useScenario.subscribe(push);
    const t = setInterval(push, 1000);
    return () => {
      u1();
      u2();
      clearInterval(t);
    };
  }, []);

  // ------------------------------------------------------------------ selection / camera reset
  useEffect(
    () =>
      useUi.subscribe((s, prev) => {
        const e = engineRef.current;
        if (!e) return;
        if (s.cameraReset !== prev.cameraReset) e.resetCamera();
        else if (s.selected !== prev.selected) e.setSelected(s.selected);
      }),
    [],
  );

  return (
    <div
      ref={wrapRef}
      className="no-print pointer-events-auto fixed left-0 top-0 z-[1] overflow-hidden"
      style={{ visibility: "hidden", width: 2, height: 2, willChange: "transform" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" style={{ cursor: "grab" }} aria-label="3D digital twin of the simulated plant" />
    </div>
  );
}
