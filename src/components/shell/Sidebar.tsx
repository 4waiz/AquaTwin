"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AquaTwinMark,
  IconBolt,
  IconDroplet,
  IconExternal,
  IconInfo,
  IconLayers,
  IconMembrane,
  IconOptimize,
  IconOverview,
  IconReport,
  IconScenario,
  IconTwin,
  IconValidation,
} from "@/components/icons";
import { useLive } from "@/state/live";
import { TEAM_URL } from "@/lib/brand";

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/twin", label: "Digital Twin", icon: IconTwin },
  { href: "/scenarios", label: "Scenarios", icon: IconScenario },
  { href: "/optimization", label: "Optimization", icon: IconOptimize },
  { href: "/membranes", label: "Membrane Health", icon: IconMembrane },
  { href: "/water-quality", label: "Water Quality", icon: IconDroplet },
  { href: "/energy", label: "Energy & Carbon", icon: IconBolt },
  { href: "/intelligence", label: "Model Intelligence", icon: IconLayers },
  { href: "/validation", label: "Validation", icon: IconValidation },
  { href: "/reports", label: "Reports", icon: IconReport },
] as const;

const STATUS_TEXT = { stable: "Stable", watch: "Watch", warning: "Warning", critical: "Critical" } as const;
const STATUS_DOT = {
  stable: "bg-ok",
  watch: "bg-accent",
  warning: "bg-warn",
  critical: "bg-crit",
} as const;

export function Sidebar() {
  const path = usePathname();
  const status = useLive((s) => s.snapshot?.status);
  const loading = useLive((s) => s.status !== "ready" && s.status !== "error");

  return (
    <aside
      data-reveal="sidebar"
      className="no-print relative z-20 flex h-full w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-ink-900"
      aria-label="Primary"
    >
      <div className="flex h-[68px] items-center gap-3 px-5">
        <AquaTwinMark size={26} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-fg">AquaTwin</div>
          <div className="text-[11px] text-fg-subtle">Desalination digital twin</div>
        </div>
      </div>

      <nav className="scroll-quiet mt-2 flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${
                    active ? "bg-ink-750 text-fg" : "text-fg-muted hover:bg-ink-800 hover:text-fg"
                  }`}
                >
                  {active && <span className="absolute left-0 top-2 h-5 w-[2px] rounded-full bg-accent" aria-hidden />}
                  <Icon size={16} className={active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted"} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-line px-4 pb-4 pt-4">
        <div className="panel-flat px-3 py-2.5">
          <div className="label">Plant status</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${loading ? "bg-fg-faint" : status ? STATUS_DOT[status] : "bg-fg-faint"}`} aria-hidden />
            <span className="text-[13px] font-medium text-fg">{loading ? "Synchronizing" : status ? STATUS_TEXT[status] : "Offline"}</span>
            <span className="ml-auto rounded border border-line px-1.5 py-px font-mono text-[9.5px] tracking-wider text-fg-subtle">SIM</span>
          </div>
        </div>
        <div className="flex items-center justify-between px-1 text-[12px]">
          <a href={TEAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg">
            Team Kanban
            <IconExternal size={12} />
          </a>
          <Link href="/about" className={`inline-flex items-center gap-1.5 transition-colors hover:text-fg ${path === "/about" ? "text-fg" : "text-fg-muted"}`}>
            <IconInfo size={13} />
            About
          </Link>
        </div>
      </div>
    </aside>
  );
}
