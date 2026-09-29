"use client";
/**
 * Core interface primitives. Deliberately few: panel, section header, stat,
 * chip, segmented control, button, provenance tag. Everything else is built
 * from these so every page reads as the same product.
 */
import type { ReactNode } from "react";

export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
  reveal,
  id,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  reveal?: string;
  id?: string;
}) {
  return (
    <section id={id} data-reveal={reveal} className={`panel flex min-h-0 flex-col ${className}`}>
      {(title || right) && (
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 className="truncate text-[13px] font-medium text-fg">{title}</h2>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ index, title, subtitle, right }: { index: string; title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div data-reveal="header" className="flex shrink-0 items-end justify-between gap-6 pb-4">
      <div className="min-w-0">
        <div className="label mb-1.5">{index}</div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-fg-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone = "default",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "ok" | "warn" | "crit" | "accent" | "muted";
  size?: "sm" | "md" | "lg";
}) {
  const toneCls = {
    default: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    crit: "text-crit",
    accent: "text-accent",
    muted: "text-fg-muted",
  }[tone];
  const sizeCls = { sm: "text-[15px]", md: "text-[20px]", lg: "text-[28px]" }[size];
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className={`num mt-1 flex items-baseline gap-1 font-medium tracking-tight ${sizeCls} ${toneCls}`}>
        <span>{value}</span>
        {unit && <span className="text-[12px] font-normal text-fg-subtle">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{sub}</div>}
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "warn" | "crit" | "accent";
  dot?: boolean;
  className?: string;
}) {
  const t = {
    default: "border-line-strong text-fg-muted",
    ok: "border-ok/30 text-ok bg-ok-soft/60",
    warn: "border-warn/35 text-warn bg-warn-soft/60",
    crit: "border-crit/40 text-crit bg-crit-soft/60",
    accent: "border-accent/35 text-accent bg-accent-soft/50",
  }[tone];
  const d = { default: "bg-fg-subtle", ok: "bg-ok", warn: "bg-warn", crit: "bg-crit", accent: "bg-accent" }[tone];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] tracking-wider whitespace-nowrap uppercase ${t} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${d}`} aria-hidden />}
      {children}
    </span>
  );
}

/** Provenance label: every number in the product is one of these. */
export function Provenance({ kind }: { kind: "simulated" | "estimated" | "modeled" | "assumed" | "reference" | "measured" }) {
  const map = {
    simulated: "Simulated",
    estimated: "Estimated",
    modeled: "Modeled",
    assumed: "Assumed",
    reference: "External ref.",
    measured: "Measured",
  };
  return (
    <span className="inline-flex h-5 items-center rounded border border-line px-1.5 font-mono text-[9.5px] tracking-wider text-fg-subtle uppercase">{map[kind]}</span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-md border border-line bg-ink-900 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-[5px] px-2.5 font-medium whitespace-nowrap transition-colors ${size === "sm" ? "h-6 text-[11.5px]" : "h-7 text-[12px]"} ${
              active ? "bg-ink-700 text-fg shadow-[0_0_0_1px_var(--color-line-strong)]" : "text-fg-subtle hover:text-fg-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className = "",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const v = {
    primary: "bg-accent-strong text-white hover:bg-[#4b8ff7] disabled:bg-ink-700 disabled:text-fg-faint",
    secondary: "border border-line-strong bg-ink-800 text-fg hover:bg-ink-750 hover:border-line-bright disabled:text-fg-faint",
    ghost: "text-fg-muted hover:bg-ink-800 hover:text-fg disabled:text-fg-faint",
  }[variant];
  const s = { sm: "h-7 px-2.5 text-[12px]", md: "h-8 px-3 text-[12.5px]", lg: "h-10 px-4 text-[13.5px]" }[size];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${v} ${s} ${className}`}
    >
      {children}
    </button>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "crit" | "off" | "accent" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", crit: "bg-crit", off: "bg-fg-faint", accent: "bg-accent" }[tone];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-hidden />;
}

export function KeyValue({ k, v, unit, tone }: { k: ReactNode; v: ReactNode; unit?: string; tone?: "ok" | "warn" | "crit" }) {
  const t = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "crit" ? "text-crit" : "text-fg";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="truncate text-fg-muted">{k}</span>
      <span className={`num shrink-0 ${t}`}>
        {v}
        {unit && <span className="ml-1 text-[11px] text-fg-subtle">{unit}</span>}
      </span>
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[13px] font-medium text-fg-muted">{title}</div>
      {detail && <div className="max-w-md text-[12px] text-fg-subtle">{detail}</div>}
      {action}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="animate-spin text-fg-subtle" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" fill="none" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
