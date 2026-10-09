// aq-shock: "Fixed setpoints break limits for twenty-one hours. AquaTwin's plan breaks none."
// Real data: salinity shock, 24 h closed loop on the hidden reference plant (seed 1 trajectories);
// hours with any violation = mean of 5 seeds (fixed 21.3 h, AquaTwin hybrid 0 h).
import { wordOf } from '../motion.js';
import { at, clamp, ease, enter, fmt, keyed, linePath, pop, range, results, scale, svg } from './aq.js';

const L = 150, R = 1220, T1 = 300, B1 = 590, T2 = 668, B2 = 930;

export default function aqshock({ name = 'shock' } = {}) {
  let wrap, clipF, clipH, nF, nH, cardF, cardH, legend, badF, badH, fixedH, hybridH;
  return {
    name,
    async setup(root) {
      const RS = await results();
      const F = RS.salinity.fixed, Hy = RS.salinity.hybrid;
      fixedH = RS.violations.salinity.fixed;
      hybridH = RS.violations.salinity.hybrid;
      const xs = F.map((p) => p.t);
      const sx = scale(0, 24, L, R);
      const syT = scale(300, 450, B1, T1);
      const syS = scale(0, 100, B2, T2);
      root.innerHTML = `<div class="chartp">
        <div class="chartp-head" style="top:96px"><div class="eyebrow">Rehearsed on the hidden plant · 24 h · simulated</div>
        <div class="chartp-title" style="font-size:58px">Salinity shock <span style="color:#a2acba">+15 %</span></div></div>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080"></svg>
        <div class="abs card" style="left:1310px;top:300px;width:460px;padding:34px 38px" data-c="f">
          <div class="mae-k">Fixed setpoints</div>
          <div class="big num" style="margin-top:16px;color:#f0564d"><span class="nF">0.0</span><span style="font-size:52px;margin-left:10px">h</span></div>
          <div class="eq-s" style="margin-top:14px">breaking a limit, of 24</div>
        </div>
        <div class="abs card" style="left:1310px;top:632px;width:460px;padding:34px 38px;border-color:rgba(64,180,255,.55)" data-c="h">
          <div class="mae-k" style="color:#40b4ff">AquaTwin plan</div>
          <div class="big num" style="margin-top:16px;color:#3ecf8e"><span class="nH">0</span><span style="font-size:52px;margin-left:10px">h</span></div>
          <div class="eq-s" style="margin-top:14px">every limit held, all day</div>
        </div>
      </div>`;
      wrap = root.firstElementChild;
      nF = root.querySelector('.nF');
      nH = root.querySelector('.nH');
      cardF = root.querySelector('[data-c="f"]');
      cardH = root.querySelector('[data-c="h"]');
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const c1 = svg('clipPath', { id: 'shF' }, defs);
      clipF = svg('rect', { x: L, y: 200, width: 0, height: 800 }, c1);
      const c2 = svg('clipPath', { id: 'shH' }, defs);
      clipH = svg('rect', { x: L, y: 200, width: 0, height: 800 }, c2);
      const gl = svg('filter', { id: 'shglow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 5 }, gl);
      const panel = (top, bot, lo, hi, step, label, sy) => {
        for (let v = lo; v <= hi; v += step) {
          svg('line', { x1: L, x2: R, y1: sy(v), y2: sy(v), stroke: 'rgba(255,255,255,.06)' }, s);
          svg('text', { x: L - 16, y: sy(v) + 7, 'text-anchor': 'end', class: 'ax' }, s).textContent = v;
        }
        svg('text', { x: L, y: top - 22, class: 'axl' }, s).textContent = label;
      };
      panel(T1, B1, 300, 450, 50, 'Permeate TDS, mg/L', syT);
      panel(T2, B2, 0, 100, 25, 'Product storage, % of capacity', syS);
      for (const h of [0, 6, 12, 18, 24]) svg('text', { x: sx(h), y: B2 + 38, 'text-anchor': 'middle', class: 'ax' }, s).textContent = h === 0 ? '0 h' : `${h} h`;
      // limits
      svg('line', { x1: L, x2: R, y1: syT(400), y2: syT(400), stroke: '#f0564d', 'stroke-width': 2.5, 'stroke-dasharray': '10 8' }, s);
      svg('text', { x: R, y: syT(400) - 12, 'text-anchor': 'end', class: 'ax', fill: '#f0564d' }, s).textContent = 'limit 400';
      svg('line', { x1: L, x2: R, y1: syS(25), y2: syS(25), stroke: '#f0564d', 'stroke-width': 2.5, 'stroke-dasharray': '10 8' }, s);
      svg('text', { x: R, y: syS(25) - 12, 'text-anchor': 'end', class: 'ax', fill: '#f0564d' }, s).textContent = 'reserve 25 %';
      // violation shading for fixed operation
      const tds = F.map((p) => p.tds), st = F.map((p) => p.reservoir);
      const over = tds.map((v) => Math.max(v, 400));
      svg('path', { d: `${linePath(xs, over, sx, syT)} L${sx(24)} ${syT(400)} L${sx(0)} ${syT(400)} Z`, fill: 'rgba(240,86,77,.18)', 'clip-path': 'url(#shF)' }, s);
      const under = st.map((v) => Math.min(v, 25));
      svg('path', { d: `${linePath(xs, under, sx, syS)} L${sx(24)} ${syS(25)} L${sx(0)} ${syS(25)} Z`, fill: 'rgba(240,86,77,.18)', 'clip-path': 'url(#shF)' }, s);
      // series
      const series = (ys, sy, col, clip, w) => {
        svg('path', { d: linePath(xs, ys, sx, sy), fill: 'none', stroke: col, 'stroke-width': w + 6, opacity: 0.18, filter: 'url(#shglow)', 'clip-path': `url(#${clip})` }, s);
        svg('path', { d: linePath(xs, ys, sx, sy), fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round', 'clip-path': `url(#${clip})` }, s);
      };
      series(tds, syT, '#d4dae3', 'shF', 3.5);
      series(st, syS, '#d4dae3', 'shF', 3.5);
      series(Hy.map((p) => p.tds), syT, '#40b4ff', 'shH', 4.5);
      series(Hy.map((p) => p.reservoir), syS, '#40b4ff', 'shH', 4.5);
      legend = svg('g', { transform: `translate(${L + 470} ${T1 - 30})` }, s);
      svg('line', { x1: 0, x2: 34, y1: -7, y2: -7, stroke: '#d4dae3', 'stroke-width': 4 }, legend);
      svg('text', { x: 46, y: 0, class: 'axl' }, legend).textContent = 'Fixed setpoints';
      badH = svg('g', { transform: 'translate(270 0)' }, legend);
      svg('line', { x1: 0, x2: 34, y1: -7, y2: -7, stroke: '#40b4ff', 'stroke-width': 5 }, badH);
      svg('text', { x: 46, y: 0, class: 'axl', fill: '#40b4ff' }, badH).textContent = 'AquaTwin';
      badF = null;
    },
    draw(f) {
      enter(wrap, f, this);
      const tw = wordOf('twenty-one', this.start)?.s ?? this.start + 1.7;
      const tA = wordOf("AquaTwin's", this.start)?.s ?? this.start + 3.4;
      const tN = wordOf('none', this.start)?.s ?? this.start + 4.4;
      const fx = keyed(f.t, [[this.start + 0.15, 0], [tw + 0.5, 24]], ease.inOutQuad);
      clipF.setAttribute('width', ((fx / 24) * (R - L) + 2).toFixed(1));
      const hx = keyed(f.t, [[tA - 0.35, 0], [tN + 0.05, 24]], ease.inOutQuad);
      clipH.setAttribute('width', ((hx / 24) * (R - L) + 2).toFixed(1));
      // Counters: fixed counts to 21.3 h as "twenty-one hours" is said; AquaTwin pops "0" on "none".
      const kF = range(f.t, this.start + 0.4, tw + 0.55, ease.inOutQuad);
      nF.textContent = fmt(fixedH * kF, 1);
      const pF = pop(f, this.start + 0.2, { stiffness: 180, damping: 18 });
      cardF.style.opacity = clamp(pF * 2);
      cardF.style.transform = `translateX(${(1 - clamp(pF, 0, 1.1)) * 50}px)`;
      const pH = pop(f, tA - 0.2, { stiffness: 180, damping: 18 });
      cardH.style.opacity = clamp(pH * 2);
      cardH.style.transform = `translateX(${(1 - clamp(pH, 0, 1.1)) * 50}px)`;
      const zero = pop(f, tN - 0.05, { stiffness: 260, damping: 12 });
      nH.textContent = fmt(hybridH, 0);
      nH.parentNode.style.transform = `scale(${0.7 + 0.3 * clamp(zero, 0, 1.15)})`;
      nH.parentNode.style.transformOrigin = '0 70%';
      nH.parentNode.style.opacity = clamp(zero * 2);
      badH.setAttribute('opacity', at(f, tA - 0.3, 0.4).toFixed(3));
    },
  };
}
