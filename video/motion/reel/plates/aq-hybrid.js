// aq-hybrid: "Physics predicts. Machine learning corrects the rest. And every answer carries its uncertainty."
// physics + ML residual = AquaTwin, then the held-out permeate-flow error of each (docs/VALIDATION.md §2):
// calibrated physics 48.0, ML only 9.7, AquaTwin hybrid 4.9 m³/h per train (inside the envelope).
import { wordOf } from '../motion.js';
import { at, clamp, ease, enter, fmt, pop, range } from './aq.js';

const MAE = [
  { k: 'Physics only', v: 48.0, c: '#8fb4e6' },
  { k: 'ML only', v: 9.7, c: '#c7cdd6' },
  { k: 'AquaTwin', v: 4.9, c: '#40b4ff', win: true },
];

export default function aqhybrid({ name = 'hybrid' } = {}) {
  let wrap, boxes, ops, cards, nums, bars, cap, head;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="chartp">
        <div class="chartp-head" style="top:104px"><div class="eyebrow">How AquaTwin thinks</div></div>
        <div class="eq" style="top:196px">
          <div class="eq-box"><div class="eq-k">01 · Physics</div><div class="eq-t">Solution–diffusion model</div><div class="eq-s">Self-calibrates A, B, ΔP and pump efficiency from noisy telemetry</div></div>
          <div class="eq-op">+</div>
          <div class="eq-box"><div class="eq-k">02 · Machine learning</div><div class="eq-t">Learned residual</div><div class="eq-s">Gradient-boosted trees correct what the physics misses</div></div>
          <div class="eq-op">=</div>
          <div class="eq-box final"><div class="eq-k" style="color:#40b4ff">03 · AquaTwin</div><div class="eq-t">Prediction <span class="brand-text">± 90 %</span></div><div class="eq-s">Calibrated conformal interval and an out-of-envelope check</div></div>
        </div>
        <div class="mae-cap" style="top:604px">Permeate-flow error · held-out data · m³/h per train</div>
        <div class="mae" style="top:656px">${MAE.map((m) => `<div class="mae-card${m.win ? ' win' : ''}"><div class="mae-k"${m.win ? ' style="color:#40b4ff"' : ''}>${m.k}</div><div class="mae-v num"><span>0.0</span><small>m³/h</small></div><div class="mae-bar"><i style="background:${m.c}"></i></div></div>`).join('')}</div>
      </div>`;
      wrap = root.firstElementChild;
      head = root.querySelector('.chartp-head');
      boxes = [...root.querySelectorAll('.eq-box')];
      ops = [...root.querySelectorAll('.eq-op')];
      cards = [...root.querySelectorAll('.mae-card')];
      nums = [...root.querySelectorAll('.mae-v span')];
      bars = [...root.querySelectorAll('.mae-bar i')];
      cap = root.querySelector('.mae-cap');
    },
    draw(f) {
      enter(wrap, f, this);
      const tP = wordOf('Physics', this.start)?.s ?? this.start + 0.2;
      const tM = wordOf('Machine', this.start)?.s ?? this.start + 1.6;
      const tE = wordOf('every', this.start)?.s ?? this.start + 3.4;
      const tU = wordOf('uncertainty', this.start)?.s ?? this.start + 4.8;
      const times = [tP - 0.1, tM - 0.25, tE - 0.1];
      head.style.opacity = at(f, this.start, 0.4, ease.outQuad);
      boxes.forEach((b, i) => {
        const k = pop(f, times[i], { stiffness: 190, damping: 17 });
        b.style.opacity = clamp(k * 2);
        b.style.transform = `translateY(${(1 - clamp(k, 0, 1.1)) * 46}px) scale(${0.94 + 0.06 * clamp(k, 0, 1.05)})`;
      });
      ops.forEach((o, i) => {
        const k = at(f, times[i + 1] - 0.1, 0.4);
        o.style.opacity = k;
        o.style.transform = `scale(${0.6 + 0.4 * k})`;
      });
      const final = boxes[2];
      const glow = at(f, tU, 0.6, ease.outCubic);
      final.style.boxShadow = `0 0 0 1px rgba(64,180,255,${0.25 + 0.35 * glow}), 0 30px 90px rgba(0,0,0,.5), 0 0 ${80 + 60 * glow}px rgba(34,181,251,${0.18 + 0.14 * glow})`;
      // Error comparison lands after the equation is complete.
      const tC = tE + 0.55;
      cap.style.opacity = at(f, tC - 0.1, 0.4, ease.outQuad);
      cards.forEach((c, i) => {
        const t0 = tC + i * 0.16;
        const k = pop(f, t0, { stiffness: 200, damping: 18 });
        c.style.opacity = clamp(k * 2);
        c.style.transform = `translateY(${(1 - clamp(k, 0, 1.1)) * 40}px)`;
        const n = range(f.t, t0, t0 + 1.0, ease.outExpo);
        // Count down from the physics error so the improvement reads as motion.
        const v = MAE[0].v + (MAE[i].v - MAE[0].v) * n;
        nums[i].textContent = fmt(i === 0 ? MAE[0].v * n : v, 1);
        bars[i].style.transform = `scaleX(${((i === 0 ? MAE[0].v * n : v) / 50).toFixed(4)})`;
      });
    },
  };
}
