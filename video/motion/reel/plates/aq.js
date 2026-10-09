// AquaTwin plate helpers. Everything here is a pure function of its inputs, so plates stay
// deterministic: same time in, same frame out.
import { clamp, ease, lerp, range, spring } from '../motion.js';

export const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// 0..1 progress from an absolute time t0 over dur seconds.
export const at = (f, t0, dur = 0.5, e = ease.outExpo) => range(f.t, t0, t0 + dur, e);

// Spring 0..1 starting at absolute time t0 (0 before it).
export const pop = (f, t0, o = { stiffness: 210, damping: 18 }) => (f.t < t0 ? 0 : spring(f.t - t0, o));

// Plate envelope: fade/scale in at the start, out over the last `outDur` s (including any tail).
// The incoming plate waits `IN_DELAY` so the outgoing one has mostly cleared (no muddy double exposure).
const IN_DELAY = 0.1;
export function envelope(f, plate, outDur = 0.28) {
  const tail = plate.tail || 0;
  const inK = spring(f.lt - IN_DELAY, { stiffness: 120, damping: 19 });
  const out = range(f.lt, f.dur + tail - outDur, f.dur + tail, ease.inQuad);
  return { inK, out, vis: clamp(inK * 1.6) * (1 - out) };
}

// Apply a standard in/out to a container: rises in, lifts and softens out.
export function enter(el, f, plate, { dy = 40, outDy = -26, blur = 10, outDur = 0.28 } = {}) {
  const { inK, out, vis } = envelope(f, plate, outDur);
  el.style.opacity = vis;
  el.style.transform = `translateY(${(1 - inK) * dy + out * outDy}px) scale(${1 + (1 - inK) * 0.02 - out * 0.015})`;
  const b = Math.max((1 - clamp(inK * 1.4)) * blur, out * blur);
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none';
  return { inK, out, vis };
}

// Path drawn from 0 to k (path needs pathLength="1").
export function draw(el, k) {
  el.style.strokeDasharray = '1 1';
  el.style.strokeDashoffset = String(1 - clamp(k));
}

export const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export const linePath = (xs, ys, sx, sy) =>
  xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join(' ');

export const areaPath = (xs, ys, sx, sy, base) =>
  `${linePath(xs, ys, sx, sy)} L${sx(xs[xs.length - 1]).toFixed(1)} ${sy(base).toFixed(1)} L${sx(xs[0]).toFixed(1)} ${sy(base).toFixed(1)} Z`;

// Linear interpolation of a series at x (xs ascending).
export function sample(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  }
  return ys[ys.length - 1];
}

// First x at which the series crosses `level` going up (or down when dir < 0).
export function crossing(xs, ys, level, dir = 1) {
  for (let i = 1; i < xs.length; i++) {
    const a = (ys[i - 1] - level) * dir, b = (ys[i] - level) * dir;
    if (a < 0 && b >= 0) return lerp(xs[i - 1], xs[i], -a / (b - a));
  }
  return null;
}

// Piecewise-linear time map: keys [[t, v], ...] -> v at t (clamped), each segment eased.
export function keyed(t, keys, e = ease.inOutQuad) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], e((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  }
  return keys[keys.length - 1][1];
}

let RESULTS = null;
export async function results() {
  if (!RESULTS) RESULTS = await (await fetch('data/aq-results.json')).json();
  return RESULTS;
}

let OUTLINE = null;
export async function outline() {
  if (!OUTLINE) OUTLINE = await (await fetch('assets/aquatwin-mark-outline.json')).json();
  return OUTLINE;
}

export const TICK = '<svg viewBox="0 0 20 20"><path d="M4.5 10.5l3.6 3.6L15.5 6.5" fill="none" stroke="#3ecf8e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const BANG = '<svg viewBox="0 0 20 20"><path d="M10 4.5v7M10 15v.4" fill="none" stroke="#f2a93b" stroke-width="2.6" stroke-linecap="round"/></svg>';

export { clamp, ease, lerp, range, spring };
