"use client";
/**
 * Navigation for screens below the `lg` breakpoint: a compact header with the
 * brand, live status and a menu button that opens a full-height drawer with
 * the same destinations as the desktop sidebar.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AquaTwinMark, IconExternal, IconInfo } from "@/components/icons";
import { useLive } from "@/state/live";
import { TEAM_URL } from "@/lib/brand";
import { NAV, STATUS_DOT, STATUS_TEXT } from "./Sidebar";

export function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const status = useLive((s) => s.snapshot?.status);
  const loading = useLive((s) => s.status !== "ready" && s.status !== "error");

  // Close the drawer on navigation and with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label ?? (path.startsWith("/about") ? "About" : "");

  return (
    <div className="no-print relative z-30 shrink-0 lg:hidden">
      <div className="flex h-14 items-center gap-3 border-b border-line bg-ink-900 px-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <AquaTwinMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-fg">AquaTwin</span>
        </Link>
        <span className="truncate text-[12.5px] text-fg-subtle">{current}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
          <span className={`h-2 w-2 rounded-full ${loading ? "bg-fg-faint" : status ? STATUS_DOT[status] : "bg-fg-faint"}`} aria-hidden />
          {loading ? "Syncing" : status ? STATUS_TEXT[status] : "Offline"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-fg-muted hover:text-fg"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            {open ? (
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 top-14 z-30 bg-ink-950/70" onClick={() => setOpen(false)} />
          <nav
            id="mobile-menu"
            aria-label="Primary"
            className="scroll-quiet fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto border-t border-line bg-ink-900 px-3 pb-6 pt-2 sm:right-auto sm:w-80 sm:border-r"
          >
            <ul className="space-y-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-11 items-center gap-3 rounded-md px-3 text-[14px] ${active ? "bg-ink-750 text-fg" : "text-fg-muted hover:bg-ink-800 hover:text-fg"}`}
                    >
                      <Icon size={17} className={active ? "text-accent" : "text-fg-subtle"} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-line px-3 pt-4 text-[13px]">
              <a href={TEAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg">
                Team Kanban
                <IconExternal size={12} />
              </a>
              <Link href="/about" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg">
                <IconInfo size={13} />
                About
              </Link>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
