// aq-hook: "In the Gulf, cities drink the sea."  The logo's own elements at full-frame scale:
// its waves become the sea, its peaked bars become the city skyline, and water rises from one
// into the other.
import { hash, wordsIn } from '../motion.js';
import { at, clamp, ease, envelope, pop, range, svg } from './aq.js';

const W = 1920, H = 1080, HORIZON = 772;
const N = 25;

export default function aqhook({ name = 'hook' } = {}) {
  let wrap, eyebrow, spans = [], timed = [], blds = [], ribbons = [], drops = [], city;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="hook"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"></svg>
        <div class="hook-eyebrow eyebrow" style="top:92px">Arabian Gulf · seawater desalination</div><p class="hook-words" style="top:150px;font-size:128px"></p></div>`;
      wrap = root.firstElementChild;
      eyebrow = root.querySelector('.hook-eyebrow');
      const p = root.querySelector('.hook-words');
      timed = wordsIn(this.start, this.end);
      spans = timed.map((w, i) => {
        const s = document.createElement('span');
        s.textContent = w.w;
        if (i === timed.length - 1) s.className = 'brand-text';
        p.append(s, ' ');
        if (/gulf/i.test(w.w)) p.appendChild(document.createElement('br'));
        return s;
      });
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const bg = svg('linearGradient', { id: 'hkbar', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      svg('stop', { offset: 0, 'stop-color': '#4fd8d0' }, bg);
      svg('stop', { offset: 0.5, 'stop-color': '#1a8fc0' }, bg);
      svg('stop', { offset: 1, 'stop-color': '#0a3f78', 'stop-opacity': 0.35 }, bg);
      const rg = svg('linearGradient', { id: 'hkwave', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      svg('stop', { offset: 0, 'stop-color': '#0461c8', 'stop-opacity': 0.0 }, rg);
      svg('stop', { offset: 0.25, 'stop-color': '#22b5fb' }, rg);
      svg('stop', { offset: 0.6, 'stop-color': '#5ee9f6' }, rg);
      svg('stop', { offset: 1, 'stop-color': '#0a84ea', 'stop-opacity': 0.0 }, rg);
      const glow = svg('filter', { id: 'hkglow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 6 }, glow);
      const ground = svg('clipPath', { id: 'hkground' }, defs);
      svg('rect', { x: 0, y: 0, width: W, height: HORIZON }, ground);
      // Skyline: buildings with flat, slanted or peaked roofs (the logo's bars), lit windows and a
      // few towers with spires; tallest near the centre.
      city = svg('g', { 'clip-path': 'url(#hkground)' }, s);
      const row = svg('g', {}, city);
      let x = 0;
      for (let i = 0; i < N; i++) {
        const tower = hash(i, 51) > 0.84;
        const w = tower ? 30 + Math.round(16 * hash(i, 21)) : 44 + Math.round(46 * hash(i, 21));
        const c = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
        const h = (tower ? 150 : 60) + (tower ? 170 : 200) * (0.35 * hash(i, 33) + 0.65 * c * c);
        const roof = hash(i, 61);
        const r = roof < 0.55 ? 0 : Math.min(26, w * 0.45);
        const kind = roof < 0.55 ? 'flat' : roof < 0.75 ? 'left' : roof < 0.92 ? 'right' : 'peak';
        const top = HORIZON - h;
        const yl = kind === 'left' ? top + r : top;
        const yr = kind === 'right' ? top + r : top;
        const g = svg('g', {}, row);
        const d = kind === 'peak'
          ? `M${x} ${HORIZON} L${x} ${top + r} L${x + w / 2} ${top} L${x + w} ${top + r} L${x + w} ${HORIZON} Z`
          : `M${x} ${HORIZON} L${x} ${yl} L${x + w} ${yr} L${x + w} ${HORIZON} Z`;
        svg('path', { d, fill: 'url(#hkbar)' }, g);
        if (tower) svg('line', { x1: x + w / 2, x2: x + w / 2, y1: top, y2: top - 40 - 30 * hash(i, 71), stroke: '#4fd8d0', 'stroke-width': 3 }, g);
        // windows
        const cols = Math.max(1, Math.floor((w - 12) / 12));
        const rows = Math.floor((h - r - 24) / 16);
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const on = hash(i * 997 + rr * 31 + cc, 83);
            if (on < 0.55) continue;
            svg('rect', { x: x + 7 + cc * 12, y: top + r + 14 + rr * 16, width: 5, height: 7, fill: '#d8fbff', opacity: (0.12 + 0.35 * on).toFixed(2) }, g);
          }
        }
        blds.push({ g, h: h + (tower ? 70 : 0), i, c });
        x += w + 9 + Math.round(9 * hash(i, 41));
      }
      row.setAttribute('transform', `translate(${(W - (x - 9)) / 2} 0)`);
      for (let i = 0; i < 3; i++) ribbons.push(svg('path', { fill: 'url(#hkwave)' }, s));
      for (let i = 0; i < 7; i++) {
        drops.push({
          halo: svg('circle', { r: 11, fill: '#5ee9f6', opacity: 0, filter: 'url(#hkglow)' }, s),
          dot: svg('circle', { r: 5, fill: '#e8fbff', opacity: 0 }, s),
        });
      }
    },
    draw(f) {
      const { out } = envelope(f, this, 0.3);
      const t = f.t;
      wrap.style.opacity = 1 - out;
      wrap.style.filter = out > 0.02 ? `blur(${(out * 10).toFixed(2)}px)` : 'none';
      eyebrow.style.opacity = at(f, this.start + 0.05, 0.6, ease.outQuad);
      eyebrow.style.transform = `translateY(${(1 - at(f, this.start, 0.6)) * 14}px)`;
      spans.forEach((el, i) => {
        const w = timed[i];
        const k = range(t, w.s - 0.06, w.s + 0.3, ease.outExpo);
        el.style.opacity = k;
        el.style.transform = `translateY(${(1 - k) * 0.32 - out * 0.25}em)`;
      });
      // The city rises out of the ground on "cities", centre first.
      const cities = timed.find((w) => /cities/i.test(w.w))?.s ?? 1.1;
      blds.forEach(({ g, h, i, c }) => {
        const k = pop(f, cities - 0.18 + (1 - c) * 0.3 + hash(i, 9) * 0.05, { stiffness: 170, damping: 18 });
        g.setAttribute('transform', `translate(0 ${((1 - clamp(k, 0, 1.06)) * (h + 10)).toFixed(1)})`);
      });
      city.style.opacity = String(1 - out);
      // The sea moves from frame 0 and swells on "sea".
      const sea = timed.find((w) => /sea/i.test(w.w))?.s ?? 1.9;
      const swell = at(f, sea - 0.05, 0.7, ease.outCubic);
      ribbons.forEach((p, i) => {
        const top = HORIZON + 28 + i * 74, thick = 30 - i * 5 + swell * 6;
        const amp = 16 + i * 6 + swell * 10, k = 0.0052 - i * 0.0007, sp = 0.9 + i * 0.25;
        let a = '', b = '';
        for (let x = -60; x <= W + 60; x += 30) {
          const y = top + Math.sin(x * k + t * sp + i * 1.7) * amp;
          a += `${x === -60 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
        }
        for (let x = W + 60; x >= -60; x -= 30) {
          const y = top + thick + Math.sin(x * k + t * sp + i * 1.7 + 0.5) * (amp * 0.85);
          b += `L${x} ${y.toFixed(1)}`;
        }
        p.setAttribute('d', a + b + 'Z');
        p.setAttribute('opacity', ((0.55 - i * 0.12 + swell * 0.25) * (1 - out)).toFixed(3));
      });
      // Water rises from the sea into the city on "drink".
      const drink = timed.find((w) => /drink/i.test(w.w))?.s ?? 1.4;
      drops.forEach(({ halo, dot }, j) => {
        const t0 = drink - 0.1 + j * 0.13;
        const k = range(t, t0, t0 + 0.85, ease.inOutQuad);
        const x = W / 2 + (j - 3) * 26 + Math.sin(k * 3 + j) * 10;
        const y = HORIZON + 70 - k * 310;
        const o = k > 0 && k < 1 ? Math.sin(k * Math.PI) * (1 - out) : 0;
        for (const c of [halo, dot]) {
          c.setAttribute('cx', x.toFixed(1));
          c.setAttribute('cy', y.toFixed(1));
        }
        halo.setAttribute('opacity', (o * 0.7).toFixed(3));
        dot.setAttribute('opacity', o.toFixed(3));
      });
    },
  };
}
