// aq-bg: the film's backdrop. Deep-navy gradient, a faint blueprint grid, two slow glows that
// breathe with the voice, and the logo's wave motif as faint flowing streamlines with particles.
import { hash } from '../motion.js';
import { svg } from './aq.js';

const W = 1920, H = 1080;
const LINES = 6;

export default function aqbg({ name = 'bg' } = {}) {
  let ga, gb, grid, paths = [], dots = [];
  return {
    name,
    setup(root) {
      root.innerHTML = `<div class="aqbg"><i class="aqbg-glow a"></i><i class="aqbg-glow b"></i><div class="aqbg-grid"></div><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"></svg><i class="aqbg-vig"></i></div>`;
      [ga, gb] = root.querySelectorAll('.aqbg-glow');
      grid = root.querySelector('.aqbg-grid');
      const s = root.querySelector('svg');
      const defs = svg('defs', {}, s);
      const lg = svg('linearGradient', { id: 'bgline', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      svg('stop', { offset: 0, 'stop-color': '#22b5fb', 'stop-opacity': 0 }, lg);
      svg('stop', { offset: 0.3, 'stop-color': '#5ee9f6', 'stop-opacity': 1 }, lg);
      svg('stop', { offset: 0.7, 'stop-color': '#22b5fb', 'stop-opacity': 1 }, lg);
      svg('stop', { offset: 1, 'stop-color': '#0a84ea', 'stop-opacity': 0 }, lg);
      for (let i = 0; i < LINES; i++) {
        paths.push(svg('path', { fill: 'none', stroke: 'url(#bgline)', 'stroke-width': i % 2 ? 1.2 : 1.8, opacity: 0.05 + 0.025 * (i % 3) }, s));
      }
      for (let i = 0; i < 46; i++) dots.push(svg('circle', { r: 1.4 + 1.8 * hash(i, 7), fill: '#5ee9f6' }, s));
    },
    draw(f) {
      const t = f.t, env = f.env || 0;
      ga.style.transform = `translate(${Math.sin(t * 0.13) * 90}px, ${Math.cos(t * 0.11) * 60}px) scale(${1 + 0.05 * Math.sin(t * 0.21)})`;
      gb.style.transform = `translate(${Math.cos(t * 0.12) * 110}px, ${Math.sin(t * 0.15) * 70}px)`;
      ga.style.opacity = 0.75 + 0.25 * env;
      grid.style.transform = `translate(${(-t * 6) % 48}px, ${(-t * 3) % 48}px)`;
      // Streamlines: the logo's waves, stretched across the frame.
      const yOf = (i, x) => {
        const base = 690 + i * 62;
        const k = 0.0042 + i * 0.0004;
        return base + Math.sin(x * k + t * (0.55 + i * 0.07) + i * 1.3) * (22 + i * 4) + Math.sin(x * 0.0011 - t * 0.2 + i) * 18;
      };
      paths.forEach((p, i) => {
        let d = '';
        for (let x = -40; x <= W + 40; x += 40) d += `${x === -40 ? 'M' : 'L'}${x} ${yOf(i, x).toFixed(1)}`;
        p.setAttribute('d', d);
      });
      // Particles drift along the streamlines, left to right, looping.
      dots.forEach((c, j) => {
        const i = j % LINES;
        const speed = 60 + 90 * hash(j, 3);
        const x = ((hash(j, 11) * (W + 200) + t * speed) % (W + 200)) - 100;
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', yOf(i, x).toFixed(1));
        const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(j, 5) * 2) + j);
        c.setAttribute('opacity', (0.08 + 0.22 * tw * (0.6 + 0.4 * env)).toFixed(3));
      });
    },
  };
}
