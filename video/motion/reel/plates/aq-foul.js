// aq-foul: "It flags membrane fouling half a day before cleaning is due."
// Real data: membrane-fouling scenario, Train 2, no-action run (seed 1): true normalised permeate
// flow on the hidden plant, AquaTwin's estimate from noisy data, and the lead time of the warning
// before the flow cleaning criterion (−10 %): 12.5 h (conventional alarms: none).
import { wordOf } from '../motion.js';
import { at, clamp, crossing, ease, enter, keyed, linePath, pop, range, results, sample, scale, svg } from './aq.js';

const L = 230, R = 1770, T = 330, B = 880;

export default function aqfoul({ name = 'foul' } = {}) {
  let wrap, clip, warnG, eventG, fc, conv, tWarn, tEvent, lead, sx, sy, xs, est;
  return {
    name,
    async setup(root) {
      const RS = await results();
      const F = RS.fouling;
      xs = F.t;
      est = F.estimate;
      lead = F.leadTime.hybrid_h;
      tEvent = F.leadTime.event_h;
      tWarn = tEvent - lead;
      const all = [...F.trueNoAction, ...F.estimate];
      const lo = Math.floor(Math.min(...all, 89)) - 0.5, hi = Math.ceil(Math.max(...all)) + 0.5;
      sx = scale(0, 24, L, R);
      sy = scale(lo, hi, B, T);
      root.innerHTML = `<div class="chartp">
        <div class="chartp-head" style="top:96px"><div class="eyebrow">Membrane health · Train 2 · simulated</div>
        <div class="chartp-title" style="font-size:58px">Cleaning <em>planned</em>, not triggered.</div></div>
        <div class="abs" style="right:150px;top:150px"><span class="chip">Conventional alarm · no warning</span></div>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080"></svg></div>`;
      wrap = root.firstElementChild;
      conv = root.querySelector('.chip');
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const cp = svg('clipPath', { id: 'foclip' }, defs);
      clip = svg('rect', { x: L, y: T - 60, width: 0, height: B - T + 120 }, cp);
      for (let v = Math.ceil(lo); v <= hi; v += 2) {
        svg('line', { x1: L, x2: R, y1: sy(v), y2: sy(v), stroke: 'rgba(255,255,255,.06)' }, s);
        svg('text', { x: L - 18, y: sy(v) + 7, 'text-anchor': 'end', class: 'ax' }, s).textContent = `${v} %`;
      }
      svg('text', { x: 150, y: T - 34, class: 'axl' }, s).textContent = 'Normalised permeate flow, Train 2';
      for (const h of [0, 6, 12, 18, 24]) svg('text', { x: sx(h), y: B + 40, 'text-anchor': 'middle', class: 'ax' }, s).textContent = `${h} h`;
      svg('line', { x1: L, x2: R, y1: sy(90), y2: sy(90), stroke: '#f2a93b', 'stroke-width': 2.5, 'stroke-dasharray': '10 8' }, s);
      svg('text', { x: L + 10, y: sy(90) + 34, class: 'ax', fill: '#f2a93b' }, s).textContent = 'cleaning criterion · −10 %';
      svg('path', { d: linePath(xs, F.trueNoAction, sx, sy), fill: 'none', stroke: '#d4dae3', 'stroke-width': 4, 'clip-path': 'url(#foclip)' }, s);
      svg('path', { d: linePath(xs, F.estimate, sx, sy), fill: 'none', stroke: '#40b4ff', 'stroke-width': 2.5, opacity: 0.9, 'clip-path': 'url(#foclip)' }, s);
      const lg = svg('g', { transform: `translate(${R - 860} ${B - 24})` }, s);
      svg('line', { x1: 0, x2: 34, y1: -7, y2: -7, stroke: '#d4dae3', 'stroke-width': 4 }, lg);
      svg('text', { x: 46, y: 0, class: 'axl' }, lg).textContent = 'True plant (hidden)';
      svg('line', { x1: 330, x2: 364, y1: -7, y2: -7, stroke: '#40b4ff', 'stroke-width': 3 }, lg);
      svg('text', { x: 376, y: 0, class: 'axl', fill: '#40b4ff' }, lg).textContent = 'AquaTwin estimate (noisy sensors)';
      // Forecast from the warning to the crossing.
      const yw = sample(xs, est, tWarn);
      fc = svg('path', { d: `M${sx(tWarn)} ${sy(yw)} L${sx(tEvent)} ${sy(90)}`, fill: 'none', stroke: '#5ee9f6', 'stroke-width': 3, 'stroke-dasharray': '8 8', pathLength: 1 }, s);
      warnG = svg('g', {}, s);
      svg('line', { x1: 0, x2: 0, y1: T - 10, y2: B, stroke: '#40b4ff', 'stroke-width': 2.5 }, warnG);
      const wb = svg('g', { transform: `translate(16 ${T - 4})` }, warnG);
      svg('rect', { width: 470, height: 58, rx: 12, fill: 'rgba(14,43,71,.92)', stroke: 'rgba(64,180,255,.75)', 'stroke-width': 2 }, wb);
      svg('text', { x: 235, y: 38, 'text-anchor': 'middle', class: 'lbl', fill: '#40b4ff' }, wb).textContent = `AquaTwin warns · ${lead.toFixed(1)} h ahead`;
      eventG = svg('g', {}, s);
      svg('circle', { r: 10, fill: '#f2a93b' }, eventG);
      const eb = svg('g', { transform: 'translate(-360 30)' }, eventG);
      svg('rect', { width: 344, height: 56, rx: 12, fill: 'rgba(46,34,17,.92)', stroke: 'rgba(242,169,59,.7)', 'stroke-width': 2 }, eb);
      svg('text', { x: 172, y: 37, 'text-anchor': 'middle', class: 'lbl', fill: '#f2a93b' }, eb).textContent = 'Cleaning criterion met';
      // sanity: the true series really crosses near the event time
      this._cross = crossing(xs, F.trueNoAction, 90, -1);
    },
    draw(f) {
      enter(wrap, f, this);
      const half = wordOf('half', this.start)?.s ?? this.start + 1.6;
      const due = wordOf('due', this.start)?.s ?? this.start + 3.0;
      const h = keyed(f.t, [[this.start + 0.15, 0], [half - 0.05, tWarn], [due + 0.35, 24]], ease.inOutQuad);
      clip.setAttribute('width', (((h / 24) * (R - L)) + 2).toFixed(1));
      const wk = pop(f, half - 0.08, { stiffness: 240, damping: 16 });
      warnG.setAttribute('transform', `translate(${sx(tWarn)} 0)`);
      warnG.setAttribute('opacity', clamp(wk * 2).toFixed(3));
      const fk = range(f.t, half + 0.1, half + 0.8, ease.inOutCubic);
      fc.style.strokeDasharray = `${(fk * 1).toFixed(4)} 1`;
      fc.style.opacity = fk > 0 ? 1 : 0;
      const tE = keyed(tEvent, [[0, this.start + 0.15], [tWarn, half - 0.05], [24, due + 0.35]], (k) => k);
      const ek = pop(f, Math.max(half + 0.6, tE), { stiffness: 240, damping: 16 });
      eventG.setAttribute('transform', `translate(${sx(tEvent)} ${sy(90)}) scale(${clamp(ek, 0, 1.15)})`);
      eventG.setAttribute('opacity', clamp(ek * 2).toFixed(3));
      conv.style.opacity = at(f, due - 0.2, 0.4, ease.outQuad);
    },
  };
}
