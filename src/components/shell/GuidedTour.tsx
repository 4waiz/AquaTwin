"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconClose, IconPlay } from "@/components/icons";
import { useTour } from "@/state/tour";

/**
 * A short walk through the evidence, one view at a time. Each step opens a view and
 * says what to look at; it never clicks for the visitor, so what they see is the real app.
 */
export const TOUR = [
  {
    href: "/",
    title: "A live twin of the plant",
    body: "Three reverse-osmosis trains, simulated and self-calibrating. Drag to orbit, click equipment to inspect. Every number is labelled simulated, modeled or estimated.",
  },
  {
    href: "/scenarios?s=salinity&run=1",
    title: "Rehearse a salinity shock",
    body: "24 hours ahead, from the live state. Switch between No action and AquaTwin response and scrub the timeline: doing nothing breaks the quality limit; AquaTwin's plan holds every limit.",
  },
  {
    href: "/optimization",
    title: "676 strategies, one safety layer",
    body: "Every candidate is predicted with the hybrid twin and checked by AquaGuard at the edge of its 90 % interval. Constraints are never traded off.",
  },
  {
    href: "/intelligence",
    title: "Push it outside what it knows",
    body: "In the out-of-distribution probe, press Compound extreme. Confidence collapses and AquaGuard withholds its advice instead of guessing.",
  },
  {
    href: "/validation",
    title: "Does it actually help?",
    body: "200 closed-loop runs against a hidden plant. Every number is read from the result files, including the cases where AquaTwin does not help.",
  },
  {
    href: "/about",
    title: "Why it matters",
    body: "How AquaTwin serves the hackathon's six themes and SDG 6, where every number comes from, and who built it.",
  },
] as const;

export function GuidedTour() {
  const { active, step, go, stop, hydrate } = useTour();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop]);

  if (!active) return null;
  const s = TOUR[Math.min(step, TOUR.length - 1)];
  const here = s.href.split("?")[0] === path;
  const to = (i: number) => {
    go(i);
    router.push(TOUR[i].href);
  };

  return (
    <aside
      role="dialog"
      aria-label="Guided tour"
      className="no-print fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-24px)] animate-[fadein_300ms_ease-out] rounded-xl border border-accent/35 bg-ink-850/95 p-4 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(64,180,255,0.08)] max-sm:bottom-3 max-sm:right-3"
    >
      <div className="flex items-center gap-2">
        <span className="label text-accent">
          Guided tour · {step + 1} / {TOUR.length}
        </span>
        <button type="button" onClick={stop} aria-label="End the tour" className="ml-auto rounded p-1 text-fg-subtle hover:bg-ink-750 hover:text-fg">
          <IconClose size={14} />
        </button>
      </div>
      <h2 className="mt-2 text-[15px] font-semibold tracking-tight text-fg">{s.title}</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{s.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1" aria-hidden>
          {TOUR.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-accent" : "w-1.5 bg-line-bright"}`} />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {!here && (
            <button type="button" onClick={() => router.push(s.href)} className="h-8 rounded-md border border-line-strong px-3 text-[12px] font-medium text-fg hover:bg-ink-750">
              Open view
            </button>
          )}
          {step > 0 && (
            <button type="button" onClick={() => to(step - 1)} className="h-8 rounded-md px-3 text-[12px] font-medium text-fg-muted hover:bg-ink-750 hover:text-fg">
              Back
            </button>
          )}
          {step < TOUR.length - 1 ? (
            <button type="button" onClick={() => to(step + 1)} className="btn-brand inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-white">
              Next
              <IconPlay size={11} />
            </button>
          ) : (
            <button type="button" onClick={stop} className="btn-brand h-8 rounded-md px-3 text-[12px] font-medium text-white">
              Finish
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Entry point used in the top bar and the mobile menu. */
export function TourButton({ className = "", onStart }: { className?: string; onStart?: () => void }) {
  const start = useTour((t) => t.start);
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        start();
        onStart?.();
        router.push(TOUR[0].href);
      }}
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft/40 px-2 font-mono text-[10.5px] tracking-wider text-accent uppercase transition-colors hover:border-accent/70 hover:text-fg ${className}`}
    >
      <IconPlay size={10} />
      Guided tour
    </button>
  );
}
