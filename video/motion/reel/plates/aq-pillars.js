// aq-pillars: "Smart water, for S D G six."  The hackathon's six themes, aligned with the UN Water
// pillars; AquaTwin is entered under theme 3 and contributes to the others (see the About page).
import { wordOf } from '../motion.js';
import { at, clamp, ease, enter, pop } from './aq.js';

const THEMES = [
  'Water security & sustainable desalination',
  'Water reuse, circularity & resource efficiency',
  'Smart, digital & AI-enabled water systems',
  'Water quality, health & environmental protection',
  'Energy–water nexus & climate resilience',
  'Integrated water systems, governance & cooperation',
];

export default function aqpillars({ name = 'pillars' } = {}) {
  let wrap, head, tiles;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="pl">
        <div class="pl-sdg" style="top:150px"><h2>Smart water, for <span class="brand-text">SDG 6</span>.</h2><div class="eyebrow" style="font-size:20px">Six themes · aligned with the UN Water pillars</div></div>
        <div class="pl-grid" style="top:300px">${THEMES.map((t, i) => `<div class="pl-tile${i === 2 ? ' main' : ''}"><div class="pl-n">0${i + 1}${i === 2 ? '<em>OUR THEME</em>' : ''}</div><div class="pl-t">${t}</div></div>`).join('')}</div>
      </div>`;
      wrap = root.firstElementChild;
      head = root.querySelector('.pl-sdg');
      tiles = [...root.querySelectorAll('.pl-tile')];
    },
    draw(f) {
      enter(wrap, f, this);
      const tS = wordOf('Smart', this.start)?.s ?? this.start + 0.2;
      const tG = wordOf('six', this.start)?.s ?? this.start + 1.6;
      const hk = at(f, this.start + 0.05, 0.5);
      head.style.opacity = hk;
      head.style.transform = `translateY(${(1 - hk) * 24}px)`;
      const order = [2, 0, 3, 4, 5, 1];
      tiles.forEach((t, i) => {
        const rank = order.indexOf(i);
        const t0 = i === 2 ? tS - 0.1 : tS + 0.35 + rank * 0.09;
        const k = pop(f, t0, { stiffness: 210, damping: 18 });
        t.style.opacity = clamp(k * 2) * (i === 2 ? 1 : 0.92);
        t.style.transform = `translateY(${(1 - clamp(k, 0, 1.1)) * 36}px) scale(${i === 2 ? 1 + 0.03 * at(f, tG, 0.5, ease.outCubic) : 1})`;
      });
    },
  };
}
