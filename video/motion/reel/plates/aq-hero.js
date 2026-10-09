// aq-hero: "...that stays calibrated to the plant as it runs."  A full-bleed render of the live 3D
// twin (scripts/qa/hero_shot.py: the app with its interface hidden), a slow push-in, and tags
// that pin to equipment like the app's own callouts.
//   tags: [{ x, y, label, sub, at, side }]  x/y are 0..1 fractions of the image, `at` is plate time (s),
//   side: 'left' puts the label to the left of its marker (for tags near the right edge)
import { wordOf } from '../motion.js';
import { at, clamp, ease, envelope, lerp, pop, range } from './aq.js';

export default function aqhero({ src, tags = [], from = { x: 0.5, y: 0.5, zoom: 1 }, to = { x: 0.52, y: 0.5, zoom: 1.12 }, name = 'hero' } = {}) {
  let wrap, img, card, chips = [], iw = 1, ih = 1, W = 1920, H = 1080;
  const place = (k) => {
    const cam = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), zoom: lerp(from.zoom, to.zoom, k) };
    const s = Math.max(W / iw, H / ih) * cam.zoom;
    let tx = W / 2 - cam.x * iw * s, ty = H / 2 - cam.y * ih * s;
    tx = Math.min(0, Math.max(W - iw * s, tx));
    ty = Math.min(0, Math.max(H - ih * s, ty));
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    return { s, tx, ty };
  };
  return {
    name,
    async setup(root, { width, height }) {
      W = width; H = height;
      root.innerHTML = `<div class="ph" style="background:#04060a">
        <img class="ph-a" src="${src}" alt="">
        <i class="ph-shade" style="background:radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.55)), linear-gradient(0deg, rgba(3,7,13,.85) 0%, rgba(3,7,13,0) 32%)"></i>
        <div class="abs" style="left:110px;bottom:118px">
          <div class="chip acc" style="background:rgba(4,22,40,.72)"><i></i>Live · simulated plant</div>
          <div style="margin-top:18px;font:650 64px/1.04 var(--display);letter-spacing:-0.035em;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.6)">Calibrated to the plant,<br><span class="brand-text">as it runs.</span></div>
        </div>
        ${tags.map((t) => `<div class="abs hero-tag" style="left:0;top:0"><i style="display:block;width:16px;height:16px;border-radius:50%;background:#40b4ff;box-shadow:0 0 0 6px rgba(64,180,255,.25),0 0 24px rgba(64,180,255,.8)"></i><div class="chip" style="position:absolute;${t.side === 'left' ? 'right:28px' : 'left:28px'};top:-15px;height:42px;background:rgba(4,10,18,.78);color:#e8edf4;border-color:rgba(64,180,255,.45);font-size:19px"><b style="font-weight:600;color:#40b4ff">${t.label}</b>${t.sub ? `<span style="text-transform:none;letter-spacing:0;color:#a2acba">${t.sub}</span>` : ''}</div></div>`).join('')}
      </div>`;
      wrap = root.firstElementChild;
      img = root.querySelector('.ph-a');
      card = root.querySelector('.abs');
      chips = [...root.querySelectorAll('.hero-tag')];
      try { await img.decode(); } catch { /* the renderer waits for images */ }
      iw = img.naturalWidth || 1; ih = img.naturalHeight || 1;
    },
    draw(f) {
      const { inK, out } = envelope(f, this, 0.3);
      wrap.style.opacity = clamp(inK * 1.6) * (1 - out);
      const { s, tx, ty } = place(ease.inOutQuad(clamp(f.p)));
      const calib = wordOf('calibrated', this.start - 0.5)?.s ?? this.start + 0.8;
      const ck = at(f, calib - 0.35, 0.6);
      card.style.opacity = ck;
      card.style.transform = `translateY(${(1 - ck) * 30}px)`;
      chips.forEach((c, i) => {
        const t = tags[i];
        const k = pop(f, this.start + (t.at ?? 0.4 + i * 0.25), { stiffness: 240, damping: 16 });
        const x = tx + t.x * iw * s, y = ty + t.y * ih * s;
        c.style.transform = `translate(${x - 8}px, ${y - 8}px) scale(${clamp(k, 0, 1.15)})`;
        c.style.opacity = clamp(k * 2) * (1 - out) * (1 - range(f.lt, f.dur - 0.5, f.dur - 0.2));
      });
    },
  };
}
