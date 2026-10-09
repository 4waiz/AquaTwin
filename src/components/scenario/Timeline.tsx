"use client";
/** Scenario timeline: NOW → +24 h scrubber with play/pause and fixed marks. */
import { useEffect, useRef } from "react";
import { IconPause, IconPlay, IconReset } from "@/components/icons";
import { TIMELINE_MARKS, useScenario } from "@/state/scenario";
import { hourOfDay } from "@/lib/format";

export function Timeline({ startClock }: { startClock: number | null }) {
  const cursor = useScenario((s) => s.cursor);
  const playing = useScenario((s) => s.playing);
  const setCursor = useScenario((s) => s.setCursor);
  const setPlaying = useScenario((s) => s.setPlaying);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Playback: 24 simulated hours in ~14 s.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const c = useScenario.getState().cursor + dt * (24 / 14);
      if (c >= 24) {
        setCursor(24);
        setPlaying(false);
        return;
      }
      setCursor(c);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, setCursor, setPlaying]);

  const fromEvent = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    setCursor(((clientX - r.left) / r.width) * 24);
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-line-strong bg-ink-900/95 px-3 py-2">
      <button
        onClick={() => {
          if (cursor >= 24) setCursor(0);
          setPlaying(!playing);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md btn-brand text-white"
        aria-label={playing ? "Pause timeline" : "Play timeline"}
      >
        {playing ? <IconPause size={13} /> : <IconPlay size={13} />}
      </button>
      <button
        onClick={() => {
          setPlaying(false);
          setCursor(0);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-subtle hover:text-fg"
        aria-label="Back to now"
      >
        <IconReset size={13} />
      </button>
      <div className="relative flex-1 select-none px-1">
        <div
          ref={trackRef}
          className="relative h-7 cursor-pointer"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setPlaying(false);
            fromEvent(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && fromEvent(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          role="slider"
          aria-label="Scenario time"
          aria-valuemin={0}
          aria-valuemax={24}
          aria-valuenow={Math.round(cursor * 10) / 10}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setCursor(cursor + 0.5);
            if (e.key === "ArrowLeft") setCursor(cursor - 0.5);
          }}
        >
          <div className="absolute left-0 right-0 top-[13px] h-[2px] rounded-full bg-ink-700" />
          <div className="absolute left-0 top-[13px] h-[2px] rounded-full bg-accent" style={{ width: `${(cursor / 24) * 100}%` }} />
          {TIMELINE_MARKS.map((m) => (
            <button
              key={m}
              onClick={(e) => {
                e.stopPropagation();
                setPlaying(false);
                setCursor(m);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`absolute top-0 -translate-x-1/2 text-center ${m === 1 || m === 3 ? "max-sm:hidden" : ""}`}
              style={{ left: `${(m / 24) * 100}%` }}
            >
              <span className={`mx-auto block h-[9px] w-px ${cursor >= m ? "bg-accent" : "bg-line-bright"}`} />
              <span className={`mt-[3px] block font-mono text-[10px] ${Math.abs(cursor - m) < 0.25 ? "text-fg" : "text-fg-subtle"}`}>{m === 0 ? "NOW" : `+${m}h`}</span>
            </button>
          ))}
          <div
            className="absolute top-[7px] h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 border-accent bg-ink-950 shadow"
            style={{ left: `${(cursor / 24) * 100}%` }}
          />
        </div>
      </div>
      <div className="w-[84px] text-right leading-tight max-sm:w-[64px]">
        <div className="num font-mono text-[12px] text-fg">+{cursor.toFixed(1)} h</div>
        <div className="num font-mono text-[10px] text-fg-subtle">{startClock === null ? "–" : hourOfDay(startClock + cursor)}</div>
      </div>
    </div>
  );
}
