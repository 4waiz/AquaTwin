// aq-outro: "AquaTwin. Predict, simulate, adapt. By Team Kanban."  The app icon lands, the name,
// the three verbs as spoken, the credit, the address, then a long hold for the last frame.
import { wordOf } from '../motion.js';
import { at, clamp, ease, pop, range, svg } from './aq.js';

const ICON = 236, CX = 960, CY = 292;

export default function aqoutro({ name = 'outro', bg = '' } = {}) {
  let wrap, icon, glint, word, verbs = [], by, url, meta, rings = [], bgImg;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="rv">
        ${bg ? `<img class="ot-bg" src="${bg}" alt="" style="position:absolute;inset:0;width:1920px;height:1080px;object-fit:cover;opacity:.26;filter:saturate(1.1) blur(1.5px);transform-origin:50% 60%"><i style="position:absolute;inset:0;background:radial-gradient(70% 70% at 50% 42%, rgba(4,6,10,.35), rgba(4,6,10,.92) 75%)"></i>` : ''}
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style="left:0;top:0"></svg>
        <div class="rv-mark" style="left:${CX - ICON / 2}px;top:${CY - ICON / 2}px;width:${ICON}px;height:${ICON}px;border-radius:${ICON * 0.2}px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 90px rgba(34,181,251,.25)">
          <img src="assets/aquatwin-icon-512.png" alt="" style="width:${ICON}px;height:${ICON}px;display:block">
          <i style="position:absolute;top:-10%;bottom:-10%;width:30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);mix-blend-mode:overlay"></i>
        </div>
        <div class="rv-word" style="top:452px;font-size:140px">Aqua<span class="brand-text">Twin</span></div>
        <div class="ot-tag" style="top:628px"><span>Predict.</span> <span>Simulate.</span> <span>Adapt.</span></div>
        <div class="ot-by" style="top:742px">By <b style="font-weight:650">Team Kanban</b></div>
        <div class="ot-url" style="top:812px">aquatwin.kanbanstudios.ae</div>
        <div class="ot-meta" style="top:904px">Khalifa University–UNESCO Global Water Hackathon 2026 · Theme 3 · research prototype, simulated results</div>
      </div>`;
      wrap = root.firstElementChild;
      icon = root.querySelector('.rv-mark');
      glint = icon.querySelector('i');
      word = root.querySelector('.rv-word');
      verbs = [...root.querySelectorAll('.ot-tag span')];
      by = root.querySelector('.ot-by');
      url = root.querySelector('.ot-url');
      meta = root.querySelector('.ot-meta');
      bgImg = root.querySelector('.ot-bg');
      const s = root.querySelector('svg');
      for (let i = 0; i < 3; i++) rings.push(svg('circle', { cx: CX, cy: CY, r: 10, fill: 'none', stroke: '#22b5fb', 'stroke-width': 2, opacity: 0 }, s));
    },
    draw(f) {
      const t0 = this.start;
      wrap.style.opacity = at(f, t0, 0.35, ease.outQuad);
      if (bgImg) bgImg.style.transform = `scale(${1.04 + 0.06 * f.p})`;
      const tA = wordOf('AquaTwin', t0 - 0.5)?.s ?? t0 + 0.2;
      const ik = pop(f, tA - 0.15, { stiffness: 150, damping: 14 });
      icon.style.opacity = clamp(ik * 2);
      icon.style.transform = `translateY(${(1 - clamp(ik, 0, 1.1)) * 40}px) scale(${0.8 + 0.2 * clamp(ik, 0, 1.08)})`;
      const gk = range(f.t, tA + 0.35, tA + 1.1, ease.inOutQuad);
      glint.style.transform = `translateX(${-140 + 520 * gk}%) skewX(-18deg)`;
      glint.style.opacity = gk > 0 && gk < 1 ? 0.8 : 0;
      rings.forEach((r, i) => {
        const rk = range(f.t, tA + i * 0.25, tA + 2.2 + i * 0.25, ease.outCubic);
        r.setAttribute('r', (ICON * 0.55 + rk * (360 + i * 90)).toFixed(1));
        r.setAttribute('opacity', (rk > 0 ? (1 - rk) * 0.35 : 0).toFixed(3));
      });
      const wk = range(f.t, tA + 0.05, tA + 0.6, ease.outExpo);
      word.style.opacity = wk;
      word.style.transform = `translateY(${(1 - wk) * 34}px)`;
      const vt = ['Predict', 'simulate', 'adapt'].map((w, i) => wordOf(w, t0 - 0.5)?.s ?? tA + 0.6 + i * 0.6);
      verbs.forEach((v, i) => {
        const k = range(f.t, vt[i] - 0.06, vt[i] + 0.32, ease.outExpo);
        v.style.opacity = k;
        v.style.transform = `translateY(${(1 - k) * 0.35}em)`;
        v.className = f.t >= vt[i] - 0.06 ? 'brand-text' : '';
      });
      const tB = wordOf('By', t0 - 0.5)?.s ?? vt[2] + 0.5;
      const bk = range(f.t, tB - 0.05, tB + 0.45, ease.outExpo);
      by.style.opacity = bk;
      by.style.transform = `translateY(${(1 - bk) * 24}px)`;
      const uk = range(f.t, tB + 0.55, tB + 1.05, ease.outExpo);
      url.style.opacity = uk;
      url.style.transform = `translateY(${(1 - uk) * 18}px)`;
      meta.style.opacity = range(f.t, tB + 0.9, tB + 1.5, ease.outQuad) * 0.95;
    },
  };
}
