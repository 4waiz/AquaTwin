"use client";
/**
 * Intro overlay: minimal branding and stage text while the plant comes online,
 * plus a Skip control (button, Esc, Space). Purely presentational — the
 * sequence itself is driven by IntroController inside the engine. The
 * branding is anchored to the lower part of the 3D viewport.
 */
import { useEffect, useRef } from "react";
import { useIntro } from "../react/introBus";
import { useViewport } from "../react/viewportStore";
import { useUi } from "@/state/ui";
import { STAGE_TEXT } from "./timeline";
import { AquaTwinMark } from "@/components/icons";

export function IntroOverlay() {
  const stage = useIntro((s) => s.stage);
  const mode = useIntro((s) => s.mode);
  const showSkip = useIntro((s) => s.showSkip);
  const requestSkip = useIntro((s) => s.requestSkip);
  const phase = useUi((s) => s.introPhase);
  const brandRef = useRef<HTMLDivElement>(null);
  const visible = mode !== "skip" && phase !== "done" && stage !== "done" && stage !== "live";

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        requestSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, requestSkip]);

  // Keep the branding centred in the lower part of the twin viewport.
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const slot = useViewport.getState().slot;
      const el = brandRef.current;
      if (!el) return;
      if (!slot) {
        el.style.left = "50%";
        el.style.top = "50%";
        return;
      }
      const r = slot.getBoundingClientRect();
      el.style.left = `${r.left + r.width / 2}px`;
      el.style.top = `${r.top + r.height * 0.8}px`;
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const text = STAGE_TEXT[stage];
  return (
    <div aria-live="polite" className={`no-print pointer-events-none fixed inset-0 z-40 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
      <div ref={brandRef} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 text-center" style={{ left: "50%", top: "50%" }}>
        <div className="flex items-center gap-2.5">
          <AquaTwinMark size={22} />
          <span className="text-[17px] font-semibold tracking-tight text-fg">AquaTwin</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
              stage === "offline" ? "bg-fg-faint" : stage === "synchronized" ? "bg-ok" : "bg-accent"
            }`}
          />
          <span key={text} className="animate-[fadein_400ms_ease-out]">
            {text}
          </span>
        </div>
        {/* Skip sits with the branding, inside the hero, so it never covers controls revealed during the intro. */}
        <button
          type="button"
          onClick={requestSkip}
          tabIndex={showSkip && visible ? 0 : -1}
          aria-hidden={!(showSkip && visible)}
          className={`mt-1 rounded-md px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase transition-[opacity,color] duration-500 hover:text-fg-muted ${
            showSkip && visible ? "pointer-events-auto opacity-100" : "opacity-0"
          }`}
        >
          Skip intro · Esc
        </button>
      </div>
    </div>
  );
}
