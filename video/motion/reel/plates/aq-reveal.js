// aq-reveal: "Meet AquaTwin: a physics-informed AI digital twin ..."
// The logo draws itself from its own traced outline, fills with the real mark, a ring spreads
// like a drop landing on water, and the name and descriptor land with the voice.
import { wordOf, wordsIn } from '../motion.js';
import { at, clamp, draw, ease, envelope, outline, pop, range, svg } from './aq.js';

const SIZE = 330, CX = 960, CY = 352;

export default function aqreveal({ name = 'reveal' } = {}) {
  let wrap, strokes = [], mark, glint, rings = [], word, desc, spans = [], timed = [], note;
  return {
    name,
    async setup(root) {
      const O = await outline();
      const x0 = CX - SIZE / 2, y0 = CY - SIZE / 2;
      root.innerHTML = `<div class="rv">
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style="left:0;top:0"></svg>
        <div class="rv-mark" style="left:${x0}px;top:${y0}px;width:${SIZE}px;height:${SIZE}px;overflow:hidden">
          <img src="assets/aquatwin-mark-1024.png" alt="" style="width:${SIZE}px;height:${SIZE}px;display:block">
          <i style="position:absolute;top:-10%;bottom:-10%;width:30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);mix-blend-mode:overlay"></i>
        </div>
        <div class="rv-word" style="top:574px">Aqua<span class="brand-text">Twin</span></div>
        <div class="rv-sub" style="top:768px"></div>
        <div class="ot-meta" style="top:846px">for seawater reverse-osmosis desalination</div>
      </div>`;
      wrap = root.firstElementChild;
      mark = root.querySelector('.rv-mark');
      glint = mark.querySelector('i');
      word = root.querySelector('.rv-word');
      desc = root.querySelector('.rv-sub');
      note = root.querySelector('.ot-meta');
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const g = svg('linearGradient', { id: 'rvstroke', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      svg('stop', { offset: 0, 'stop-color': '#5ee9f6' }, g);
      svg('stop', { offset: 0.5, 'stop-color': '#22b5fb' }, g);
      svg('stop', { offset: 1, 'stop-color': '#0a84ea' }, g);
      const gl = svg('filter', { id: 'rvglow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 1.2 }, gl);
      for (let i = 0; i < 3; i++) {
        rings.push(svg('ellipse', { cx: CX, cy: CY + SIZE * 0.36, rx: 10, ry: 3, fill: 'none', stroke: '#5ee9f6', 'stroke-width': 2.5, opacity: 0 }, s));
      }
      const grp = svg('g', { transform: `translate(${x0} ${y0}) scale(${SIZE / 100})` }, s);
      for (const p of [...O.drop, ...O.bars]) {
        const halo = svg('path', { d: p.d, fill: 'none', stroke: 'url(#rvstroke)', 'stroke-width': 1.4, pathLength: 1, filter: 'url(#rvglow)', opacity: 0.8 }, grp);
        const line = svg('path', { d: p.d, fill: 'none', stroke: 'url(#rvstroke)', 'stroke-width': 0.55, pathLength: 1, 'stroke-linejoin': 'round' }, grp);
        strokes.push(halo, line);
      }
      // The descriptor, word by word as spoken (falls back to plain text without words.json).
      timed = wordsIn(wordOf('physics-informed', this.start)?.s ?? this.start + 1.6, this.end + 0.2);
      const words = timed.length ? timed.map((w) => w.w) : ['A', 'physics-informed', 'AI', 'digital', 'twin'];
      const lead = document.createElement('span');
      lead.textContent = 'A';
      desc.append(lead, ' ');
      spans = words.filter((w) => !/^that$/i.test(w)).map((w) => {
        const el = document.createElement('span');
        el.textContent = w.replace(/[.,:]$/, '');
        desc.append(el, ' ');
        return el;
      });
      spans.unshift(lead);
    },
    draw(f) {
      const { out } = envelope(f, this, 0.32);
      wrap.style.opacity = 1 - out;
      wrap.style.transform = `scale(${1 - out * 0.06}) translateY(${-out * 30}px)`;
      wrap.style.filter = out > 0.02 ? `blur(${(out * 12).toFixed(2)}px)` : 'none';
      const t0 = this.start + 0.05;
      const k = range(f.t, t0, t0 + 0.95, ease.inOutCubic);
      const fill = range(f.t, t0 + 0.7, t0 + 1.2, ease.inOutQuad);
      strokes.forEach((p) => {
        draw(p, k);
        p.style.opacity = String((1 - fill * 0.85) * (p.getAttribute('filter') ? 0.8 : 1));
      });
      const sp = pop(f, t0 + 0.75, { stiffness: 150, damping: 13 });
      mark.style.opacity = fill;
      mark.style.transform = `scale(${0.94 + 0.06 * clamp(sp, 0, 1.1)})`;
      const gk = range(f.t, t0 + 1.2, t0 + 1.9, ease.inOutQuad);
      glint.style.transform = `translateX(${-140 + 520 * gk}%) skewX(-18deg)`;
      glint.style.opacity = gk > 0 && gk < 1 ? 0.75 : 0;
      rings.forEach((r, i) => {
        const rk = range(f.t, t0 + 0.8 + i * 0.22, t0 + 2.4 + i * 0.22, ease.outCubic);
        r.setAttribute('rx', (40 + rk * (520 + i * 80)).toFixed(1));
        r.setAttribute('ry', (10 + rk * (120 + i * 20)).toFixed(1));
        r.setAttribute('opacity', (rk > 0 ? (1 - rk) * 0.5 : 0).toFixed(3));
      });
      const name = wordOf('AquaTwin', this.start)?.s ?? t0 + 0.4;
      const wk = range(f.t, name + 0.15, name + 0.7, ease.outExpo);
      word.style.opacity = wk;
      word.style.transform = `translateY(${(1 - wk) * 36}px)`;
      word.style.letterSpacing = `${-0.05 + (1 - wk) * 0.03}em`;
      spans.forEach((el, i) => {
        const w = timed[i - 1];
        const s = i === 0 ? (timed[0]?.s ?? t0 + 1.6) - 0.15 : w ? w.s : t0 + 1.6 + i * 0.4;
        const kk = range(f.t, s - 0.06, s + 0.3, ease.outExpo);
        el.style.opacity = kk;
        el.style.transform = `translateY(${(1 - kk) * 0.3}em)`;
        const live = w && f.t >= w.s - 0.06 && f.t < w.e + 0.1;
        el.style.color = live ? '#40b4ff' : '';
      });
      note.style.opacity = at(f, (timed[timed.length - 1]?.s ?? t0 + 3) - 0.2, 0.5, ease.outQuad);
    },
  };
}
