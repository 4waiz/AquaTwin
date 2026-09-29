/**
 * Number formatting. Every value shown in the interface passes through here so
 * that NaN, Infinity or undefined can never reach the screen ("—" instead).
 */

export const DASH = "—";

export function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function fmt(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return DASH;
  return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(x: number | null | undefined): string {
  if (!isNum(x)) return DASH;
  return Math.round(x).toLocaleString("en-US");
}

export function fmtPct(x: number | null | undefined, digits = 1, isFraction = false): string {
  if (!isNum(x)) return DASH;
  return `${(isFraction ? x * 100 : x).toFixed(digits)}%`;
}

export function fmtSigned(x: number | null | undefined, digits = 1, unit = ""): string {
  if (!isNum(x)) return DASH;
  const s = x > 0 ? "+" : x < 0 ? "−" : "±";
  return `${s}${Math.abs(x).toFixed(digits)}${unit}`;
}

/** m³/h → m³/day with thousands separators. */
export function m3d(m3h: number | null | undefined): string {
  return isNum(m3h) ? fmtInt(m3h * 24) : DASH;
}

export function fmtHours(h: number | null | undefined): string {
  if (!isNum(h)) return DASH;
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export function clockLabel(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return withSeconds ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export function hourOfDay(h: number): string {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.round((x - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}

export function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}
