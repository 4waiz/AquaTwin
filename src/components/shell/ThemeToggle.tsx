"use client";
import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/icons";

/** Light / dark switch. The choice is remembered per browser; dark is the default look. */
export const THEME_KEY = "aquatwin.theme";

// The theme lives on <html data-theme>, set before first paint by the layout script.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const isLight = () => document.documentElement.dataset.theme === "light";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const light = useSyncExternalStore(subscribe, isLight, () => false);
  const toggle = () => {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked: the theme still applies for this visit
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-fg-muted transition-colors hover:border-line-bright hover:text-fg ${className}`}
    >
      {light ? <IconMoon size={15} /> : <IconSun size={15} />}
    </button>
  );
}
