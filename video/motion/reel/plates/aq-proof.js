// aq-proof: "Tested against a hidden plant, fully reproducible, and built for shadow mode on data
// plants already record."  Validation design (docs/VALIDATION.md) and the adoption roadmap (report §6).
import { wordOf } from '../motion.js';
import { at, clamp, ease, enter, pop, range } from './aq.js';

const STEPS = [
  ['Historian back-test', '12+ months of a host plant’s recorded data'],
  ['Shadow mode', 'Read-only; advice logged, never applied'],
  ['Operator-confirmed', 'Selected advice, accepted by operators'],
  ['Fleet', 'Every train, every plant, one model governance'],
];

export default function aqproof({ name = 'proof' } = {}) {
  let wrap, head, boxes, mid, chips, steps, rail, dots, note;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="pf">
        <div class="chartp-head" style="top:96px"><div class="eyebrow">Evidence, then a path to a real plant</div></div>
        <div class="pf-twins" style="top:176px">
          <div class="pf-box hidden"><div class="pf-k">Hidden reference plant</div><div class="pf-t">The ground truth</div><div class="pf-s">Element-level physics, hidden fouling state</div></div>
          <div class="pf-mid"><svg width="120" height="40" viewBox="0 0 120 40"><path d="M6 20h108M98 8l14 12-14 12M22 8 8 20l14 12" fill="none" stroke="#6d7787" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div style="margin-top:6px">compared</div></div>
          <div class="pf-box twin"><div class="pf-k" style="color:#40b4ff">AquaTwin</div><div class="pf-t">Sees only noisy sensors</div><div class="pf-s">Every claim tested against the truth it cannot see</div></div>
        </div>
        <div class="pf-chips" style="top:470px">
          <span class="chip acc">200 closed-loop runs</span><span class="chip">10 scenarios × 4 methods × 5 seeds</span><span class="chip">One command reproduces it all</span>
        </div>
        <div class="pf-road" style="top:610px"><div class="pf-rail"><i></i></div>
          ${STEPS.map(([b, s], i) => `<div class="pf-step"><div class="pf-dot">0${i + 1}</div><b>${b}</b><span>${s}</span></div>`).join('')}
        </div>
        <div class="abs" style="left:150px;top:850px"><span class="chip ok"><i></i>No new sensors · signals plants already record</span></div>
      </div>`;
      wrap = root.firstElementChild;
      head = root.querySelector('.chartp-head');
      boxes = [...root.querySelectorAll('.pf-box')];
      mid = root.querySelector('.pf-mid');
      chips = [...root.querySelectorAll('.pf-chips .chip')];
      steps = [...root.querySelectorAll('.pf-step')];
      dots = [...root.querySelectorAll('.pf-dot')];
      rail = root.querySelector('.pf-rail i');
      note = root.querySelector('.abs .chip');
    },
    draw(f) {
      enter(wrap, f, this);
      head.style.opacity = at(f, this.start, 0.4, ease.outQuad);
      const tH = wordOf('hidden', this.start)?.s ?? this.start + 0.9;
      const tR = wordOf('reproducible', this.start)?.s ?? this.start + 2.3;
      const tS = wordOf('shadow', this.start)?.s ?? this.start + 4.1;
      const tD = wordOf('data', this.start)?.s ?? this.start + 5;
      boxes.forEach((b, i) => {
        const k = pop(f, (i ? tH - 0.1 : this.start + 0.15), { stiffness: 190, damping: 18 });
        b.style.opacity = clamp(k * 2);
        b.style.transform = `translateX(${(1 - clamp(k, 0, 1.1)) * (i ? 60 : -60)}px)`;
      });
      mid.style.opacity = at(f, tH + 0.1, 0.4);
      chips.forEach((c, i) => {
        const k = pop(f, tR - 0.2 + i * 0.14, { stiffness: 230, damping: 17 });
        c.style.opacity = clamp(k * 2);
        c.style.transform = `translateY(${(1 - clamp(k, 0, 1.1)) * 26}px)`;
      });
      // roadmap: steps arrive, the rail fills to "Shadow mode" as it is said
      const tRoad = tR + 0.9;
      steps.forEach((s, i) => {
        const k = pop(f, tRoad + i * 0.1, { stiffness: 200, damping: 18 });
        s.style.opacity = clamp(k * 2) * (i <= 1 ? 1 : 0.55 + 0.45 * clamp(k));
        s.style.transform = `translateY(${(1 - clamp(k, 0, 1.1)) * 30}px)`;
      });
      const fill = range(f.t, tS - 0.5, tS + 0.1, ease.inOutCubic);
      rail.style.transform = `scaleX(${(fill / 3).toFixed(4)})`;
      dots.forEach((d, i) => {
        const on = i === 0 ? f.t >= tRoad + 0.2 : i === 1 ? f.t >= tS : false;
        d.style.borderColor = on ? '#40b4ff' : '';
        d.style.color = on ? (i === 1 ? '#031635' : '#e8edf4') : '';
        d.style.background = i === 1 && on ? '#40b4ff' : '';
        d.style.boxShadow = i === 1 && on ? '0 0 40px rgba(64,180,255,.7)' : 'none';
      });
      const sb = steps[1].querySelector('b');
      sb.style.color = f.t >= tS ? '#40b4ff' : '';
      const nk = pop(f, tD - 0.1, { stiffness: 220, damping: 17 });
      note.style.opacity = clamp(nk * 2);
      note.style.transform = `translateY(${(1 - clamp(nk, 0, 1.1)) * 20}px)`;
    },
  };
}
