// aq-guard: "Its safety layer, AquaGuard, checks every limit, and outside what the model knows,
// it withholds its advice."  Values are the app's own: the live recommendation on the Optimization
// page (docs/screenshots/04) and the out-of-distribution probe at a compound extreme
// (53 g/L, 37.5 °C → confidence 35 %, docs/screenshots/08b).
import { wordOf } from '../motion.js';
import { BANG, TICK, at, clamp, ease, enter, fmt, lerp, pop, range } from './aq.js';

const ROWS = [
  ['Feed pressure', '64.5 bar', '≤ 70'],
  ['Permeate TDS', '339 mg/L', '≤ 400'],
  ['Recovery', '43.8 %', '≤ 50'],
  ['Average flux', '14.5 LMH', '≤ 17'],
  ['Vessel ΔP', '1.6 bar', '≤ 3.5'],
  ['Model confidence', '100 %', '≥ 50'],
];

export default function aqguard({ name = 'guard' } = {}) {
  let wrap, head, rows, ticks, verdict, side, conf, gauge, sal, tmp, stamp, lastV;
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="gd">
        <div class="chartp-head" style="top:96px"><div class="eyebrow">AquaGuard · deterministic safety layer</div>
          <div class="chartp-title" style="font-size:58px">Approve. Reject. <em style="color:#f2a93b">Withhold.</em></div></div>
        <div class="gd-panel card" style="top:300px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="mae-k">Hard limits · checked at the 90 % interval edge</div><span class="chip ok vd"><i></i><b style="font-weight:500">Approved</b></span></div>
          ${ROWS.map(([k, v, l]) => `<div class="gd-row"><span class="gd-tick">${TICK}</span><span>${k}</span><span class="v num">${v}</span><span class="l">${l}</span></div>`).join('')}
        </div>
        <div class="gd-side card" style="top:300px">
          <div class="mae-k">Model confidence</div>
          <div class="gd-input">Feed salinity <b class="num sal">41.5 g/L</b></div>
          <div class="gd-input">Seawater temperature <b class="num tmp">28.7 °C</b></div>
          <div class="gd-conf num">100 %</div>
          <div class="gd-gauge"><i></i></div>
          <div class="eq-s" style="margin-top:12px">Below 50 %, every recommendation is withheld.</div>
        </div>
        <div class="gd-stamp" style="top:742px"><b>Recommendation withheld</b><span>Outside its envelope · operator review</span></div>
      </div>`;
      wrap = root.firstElementChild;
      head = root.querySelector('.chartp-head');
      rows = [...root.querySelectorAll('.gd-row')];
      ticks = [...root.querySelectorAll('.gd-tick')];
      verdict = root.querySelector('.vd');
      side = root.querySelector('.gd-side');
      conf = root.querySelector('.gd-conf');
      gauge = root.querySelector('.gd-gauge i');
      sal = root.querySelector('.sal');
      tmp = root.querySelector('.tmp');
      stamp = root.querySelector('.gd-stamp');
      lastV = rows[5].querySelector('.v');
    },
    draw(f) {
      enter(wrap, f, this);
      head.style.opacity = at(f, this.start, 0.4, ease.outQuad);
      const tChk = wordOf('checks', this.start)?.s ?? this.start + 2;
      const tLim = wordOf('limit', this.start)?.s ?? this.start + 2.6;
      const tOut = wordOf('outside', this.start)?.s ?? this.start + 3.6;
      const tKnow = wordOf('knows', this.start)?.s ?? this.start + 4.6;
      const tW = wordOf('withholds', this.start)?.s ?? this.start + 5.3;
      // rows arrive, then tick in sequence as "checks every limit" is said
      rows.forEach((r, i) => {
        const k = pop(f, this.start + 0.15 + i * 0.07, { stiffness: 200, damping: 19 });
        r.style.opacity = clamp(k * 2);
        r.style.transform = `translateX(${(1 - clamp(k, 0, 1.1)) * -40}px)`;
      });
      // confidence collapses as conditions leave the envelope
      const dk = range(f.t, tOut + 0.05, tKnow + 0.35, ease.inOutCubic);
      const c = lerp(100, 35, dk);
      const low = c < 50;
      ticks.forEach((tk, i) => {
        const t0 = tChk - 0.25 + i * ((tLim + 0.1 - tChk) / ROWS.length);
        const k = pop(f, t0, { stiffness: 320, damping: 16 });
        tk.style.opacity = clamp(k * 2);
        tk.style.transform = `scale(${clamp(k, 0, 1.25)})`;
        if (i === 5) {
          tk.innerHTML = low ? BANG : TICK;
          tk.style.borderColor = low ? 'rgba(242,169,59,.7)' : '';
        }
      });
      lastV.textContent = `${fmt(c, 0)} %`;
      lastV.style.color = low ? '#f2a93b' : '';
      rows[5].style.background = low ? 'rgba(46,34,17,.45)' : 'transparent';
      // verdict chip: approved, then withheld
      const vk = pop(f, tLim + 0.05, { stiffness: 260, damping: 15 });
      verdict.style.opacity = clamp(vk * 2);
      verdict.style.transform = `scale(${clamp(vk, 0, 1.15)})`;
      const withheld = f.t >= tW - 0.1;
      verdict.className = `chip ${withheld ? 'warn' : 'ok'} vd`;
      verdict.querySelector('b').textContent = withheld ? 'Withheld' : 'Approved';
      // side card: inputs drift out of the envelope
      const sk = pop(f, tOut - 0.25, { stiffness: 190, damping: 18 });
      side.style.opacity = clamp(sk * 2);
      side.style.transform = `translateX(${(1 - clamp(sk, 0, 1.1)) * 60}px)`;
      sal.textContent = `${fmt(lerp(41.5, 53.0, dk), 1)} g/L`;
      tmp.textContent = `${fmt(lerp(28.7, 37.5, dk), 1)} °C`;
      sal.style.color = tmp.style.color = dk > 0.6 ? '#f2a93b' : '';
      conf.textContent = `${fmt(c, 0)} %`;
      conf.style.color = low ? '#f2a93b' : '#3ecf8e';
      gauge.style.width = `${c}%`;
      gauge.style.background = low ? '#f2a93b' : '#3ecf8e';
      const wk = pop(f, tW - 0.08, { stiffness: 230, damping: 13 });
      stamp.style.opacity = clamp(wk * 2);
      stamp.style.transform = `scale(${1.25 - 0.25 * clamp(wk, 0, 1.08)}) rotate(${(1 - clamp(wk)) * -3}deg)`;
    },
  };
}
