// aq-alarm: "Yet plants still run on fixed setpoints, and alarms that fire once the trouble has started."
// Real data: the salinity-shock closed-loop run with setpoints held (fixed operation, seed 1).
// The cursor sweeps the first hours; the conventional alarm (95 % of limit) fires only
// 20 minutes before permeate quality breaks the 400 mg/L specification.
import { wordOf } from '../motion.js';
import { at, clamp, crossing, ease, enter, keyed, linePath, pop, results, sample, scale, svg } from './aq.js';

const X0 = 250, X1 = 1770, Y0 = 400, Y1 = 900;
const HMAX = 5;

export default function aqalarm({ name = 'alarm' } = {}) {
  let wrap, line, clipR, fillR, cur, curDot, curTxt, alarmG, offG, gapG, fixedChip, xs, ys, tA, tV, sx, sy;
  return {
    name,
    async setup(root) {
      const R = await results();
      const run = R.salinity.fixed.filter((p) => p.t <= HMAX + 0.01);
      xs = run.map((p) => p.t);
      ys = run.map((p) => p.tds);
      tA = crossing(xs, ys, 380);
      tV = crossing(xs, ys, 400);
      sx = scale(0, HMAX, X0, X1);
      sy = scale(300, 450, Y1, Y0);
      root.innerHTML = `<div class="chartp">
        <div class="chartp-head"><div class="eyebrow">Today · fixed setpoints, fixed alarms</div><div class="chartp-title">Reactive <em>by design.</em></div></div>
        <div class="abs" style="right:150px;top:150px"><span class="chip">Setpoints · fixed</span></div>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080"></svg></div>`;
      wrap = root.firstElementChild;
      fixedChip = root.querySelector('.chip');
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const cp = svg('clipPath', { id: 'alclip' }, defs);
      clipR = svg('rect', { x: X0, y: Y0 - 80, width: 0, height: Y1 - Y0 + 160 }, cp);
      const gl = svg('filter', { id: 'alglow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 5 }, gl);
      // grid + axes
      for (const v of [300, 350, 400, 450]) {
        svg('line', { x1: X0, x2: X1, y1: sy(v), y2: sy(v), stroke: 'rgba(255,255,255,.07)' }, s);
        svg('text', { x: X0 - 22, y: sy(v) + 7, 'text-anchor': 'end', class: 'ax' }, s).textContent = v;
      }
      svg('text', { x: 150, y: Y0 - 40, class: 'axl' }, s).textContent = 'Permeate TDS, mg/L';
      for (let h = 0; h <= HMAX; h++) {
        svg('text', { x: sx(h), y: Y1 + 40, 'text-anchor': 'middle', class: 'ax' }, s).textContent = h === 0 ? 'now' : `+${h} h`;
      }
      svg('text', { x: X1, y: Y0 - 40, 'text-anchor': 'end', class: 'axl' }, s).textContent = 'Salinity shock · setpoints held · simulated';
      // off-spec fill, limit, alarm level
      fillR = svg('path', { fill: 'rgba(240,86,77,.16)', 'clip-path': 'url(#alclip)' }, s);
      const above = ys.map((v) => Math.max(v, 400));
      fillR.setAttribute('d', `${linePath(xs, above, sx, sy)} L${sx(xs[xs.length - 1])} ${sy(400)} L${sx(xs[0])} ${sy(400)} Z`);
      svg('line', { x1: X0, x2: X1, y1: sy(400), y2: sy(400), stroke: '#f0564d', 'stroke-width': 2.5, 'stroke-dasharray': '10 8' }, s);
      svg('text', { x: X0 + 12, y: sy(400) - 14, class: 'lbl', fill: '#f0564d' }, s).textContent = 'Specification 400 mg/L';
      svg('line', { x1: X0, x2: X1, y1: sy(380), y2: sy(380), stroke: '#f2a93b', 'stroke-width': 2, 'stroke-dasharray': '3 7', opacity: 0.8 }, s);
      svg('text', { x: X0 + 12, y: sy(380) + 32, class: 'ax', fill: '#f2a93b' }, s).textContent = 'alarm at 95 % of limit';
      // the series
      const d = linePath(xs, ys, sx, sy);
      svg('path', { d, fill: 'none', stroke: '#d4dae3', 'stroke-width': 9, opacity: 0.18, filter: 'url(#alglow)', 'clip-path': 'url(#alclip)' }, s);
      line = svg('path', { d, fill: 'none', stroke: '#e8edf4', 'stroke-width': 4, 'stroke-linejoin': 'round', 'clip-path': 'url(#alclip)' }, s);
      // cursor
      cur = svg('line', { y1: Y0 - 30, y2: Y1, stroke: 'rgba(64,180,255,.55)', 'stroke-width': 2 }, s);
      curDot = svg('circle', { r: 9, fill: '#04060a', stroke: '#e8edf4', 'stroke-width': 4 }, s);
      curTxt = svg('text', { class: 'lbl', fill: '#e8edf4' }, s);
      // alarm + off-spec markers
      alarmG = svg('g', {}, s);
      svg('circle', { r: 14, fill: 'none', stroke: '#f2a93b', 'stroke-width': 3, class: 'ring' }, alarmG);
      svg('circle', { r: 8, fill: '#f2a93b' }, alarmG);
      const ab = svg('g', { transform: 'translate(-300 -118)' }, alarmG);
      svg('rect', { width: 268, height: 56, rx: 12, fill: 'rgba(46,34,17,.92)', stroke: 'rgba(242,169,59,.7)', 'stroke-width': 2 }, ab);
      svg('text', { x: 134, y: 37, 'text-anchor': 'middle', class: 'lbl', fill: '#f2a93b' }, ab).textContent = 'ALARM · TDS high';
      offG = svg('g', {}, s);
      svg('circle', { r: 9, fill: '#f0564d' }, offG);
      const ob = svg('g', { transform: 'translate(34 10)' }, offG);
      svg('rect', { width: 330, height: 56, rx: 12, fill: 'rgba(51,21,20,.92)', stroke: 'rgba(240,86,77,.75)', 'stroke-width': 2 }, ob);
      svg('text', { x: 165, y: 37, 'text-anchor': 'middle', class: 'lbl', fill: '#f0564d' }, ob).textContent = 'Off specification';
      gapG = svg('g', {}, s);
      svg('path', { d: `M${sx(tA)} ${Y1 - 46} L${sx(tA)} ${Y1 - 30} L${sx(tV)} ${Y1 - 30} L${sx(tV)} ${Y1 - 46}`, fill: 'none', stroke: '#f2a93b', 'stroke-width': 2.5 }, gapG);
      svg('text', { x: (sx(tA) + sx(tV)) / 2, y: Y1 - 50 - 14, 'text-anchor': 'middle', class: 'ax', fill: '#f2a93b' }, gapG).textContent = `${Math.round((tV - tA) * 60)} min warning`;
    },
    draw(f) {
      enter(wrap, f, this);
      const fire = wordOf('fire', this.start)?.s ?? this.start + 3.4;
      const started = wordOf('started', this.start)?.s ?? this.start + 4.6;
      const fixed = wordOf('fixed', this.start)?.s ?? this.start + 1.4;
      // Cursor: hours as a function of film time, landing on the alarm at "fire" and on the
      // violation at "started".
      const h = keyed(f.t, [[this.start + 0.25, 0], [fire, tA], [started, tV], [this.end + 0.2, HMAX]], (k) => 0.5 - Math.cos(Math.PI * k) / 2);
      const x = sx(h), v = sample(xs, ys, h);
      clipR.setAttribute('width', Math.max(0, x - X0 + 2).toFixed(1));
      cur.setAttribute('x1', x.toFixed(1));
      cur.setAttribute('x2', x.toFixed(1));
      curDot.setAttribute('cx', x.toFixed(1));
      curDot.setAttribute('cy', sy(v).toFixed(1));
      const alarm = f.t >= fire, off = f.t >= started;
      curDot.setAttribute('stroke', off ? '#f0564d' : alarm ? '#f2a93b' : '#e8edf4');
      const flip = x > X1 - 220;
      curTxt.setAttribute('x', (flip ? x - 22 : x + 22).toFixed(1));
      curTxt.setAttribute('text-anchor', flip ? 'end' : 'start');
      curTxt.setAttribute('y', (sy(v) + (v > 395 ? -24 : 46)).toFixed(1));
      curTxt.textContent = `${Math.round(v)} mg/L`;
      curTxt.setAttribute('fill', off ? '#f0564d' : '#e8edf4');
      // Fixed setpoints chip lights on "fixed".
      const fk = at(f, fixed - 0.05, 0.4);
      fixedChip.style.color = fk > 0.5 ? '#e8edf4' : '';
      fixedChip.style.borderColor = fk > 0.5 ? 'rgba(255,255,255,.35)' : '';
      // Alarm and off-spec markers.
      const ak = pop(f, fire - 0.04, { stiffness: 260, damping: 14 });
      alarmG.setAttribute('transform', `translate(${sx(tA)} ${sy(380)}) scale(${clamp(ak, 0, 1.2)})`);
      alarmG.setAttribute('opacity', clamp(ak * 2).toFixed(3));
      const ring = alarmG.querySelector('.ring');
      const rp = alarm ? ((f.t - fire) % 0.9) / 0.9 : 0;
      ring.setAttribute('r', (14 + rp * 30).toFixed(1));
      ring.setAttribute('opacity', alarm ? (1 - rp).toFixed(3) : 0);
      const ok = pop(f, started - 0.04, { stiffness: 260, damping: 15 });
      offG.setAttribute('transform', `translate(${sx(tV)} ${sy(400)}) scale(${clamp(ok, 0, 1.2)})`);
      offG.setAttribute('opacity', clamp(ok * 2).toFixed(3));
      gapG.setAttribute('opacity', at(f, started + 0.25, 0.4).toFixed(3));
    },
  };
}
