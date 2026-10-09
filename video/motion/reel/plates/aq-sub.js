// aq-sub: burned-in subtitles for viewers with the sound off. The spoken line, split into short
// one-line chunks, words appearing as they are said. Lines shown as kinetic type elsewhere
// (hook, outro) are skipped by passing the plate's [from, to) window.
import { wordsIn } from '../motion.js';
import { ease, range } from './aq.js';

const MAX = 52; // characters per chunk, so a chunk always fits on one line

export default function aqsub({ from, to, name = 'sub' } = {}) {
  let chunks = [];
  return {
    name,
    setup(root) {
      // Written forms for the screen: the script spells numbers and acronyms as spoken.
      const raw = wordsIn(from ?? this.start, to ?? this.end);
      const words = [];
      for (let i = 0; i < raw.length; i++) {
        const w = raw[i];
        if (w.w === 'S' && raw[i + 1]?.w === 'D' && raw[i + 2]?.w === 'G') {
          const six = raw[i + 3] && /^six/i.test(raw[i + 3].w);
          words.push({ ...w, w: six ? 'SDG ' + raw[i + 3].w.replace(/six/i, '6') : 'SDG', e: (six ? raw[i + 3] : raw[i + 2]).e });
          i += six ? 3 : 2;
          continue;
        }
        words.push({ ...w, w: w.w.replace(/^twenty-one/i, '21') });
      }
      // chunk by line, then by length, breaking after punctuation when possible
      let cur = [], len = 0, line = null;
      const flush = () => {
        if (cur.length) chunks.push(cur);
        cur = [];
        len = 0;
      };
      for (const w of words) {
        if (line !== null && w.line !== line) flush();
        line = w.line;
        const n = w.w.length + 1;
        const prev = cur[cur.length - 1]?.w || '';
        if ((/[.:;?!]$/.test(prev) && len >= 10) || (/,$/.test(prev) && len > 30) || len + n > MAX) flush();
        cur.push(w);
        len += n;
      }
      flush();
      chunks = chunks.map((ws) => {
        const p = document.createElement('p');
        p.className = 'sub';
        const spans = ws.map((w) => {
          const s = document.createElement('span');
          s.textContent = w.w;
          p.append(s, ' ');
          return s;
        });
        root.appendChild(p);
        return { p, ws, spans, s: ws[0].s, e: ws[ws.length - 1].e };
      });
    },
    draw(f) {
      chunks.forEach((c, i) => {
        const next = chunks[i + 1];
        const endAt = next ? Math.min(next.s - 0.05, c.e + 0.9) : c.e + 0.7;
        const vis = f.t >= c.s - 0.12 && f.t < endAt;
        c.p.style.visibility = vis ? 'visible' : 'hidden';
        const fade = range(f.t, endAt - 0.12, endAt, ease.inQuad);
        c.p.style.opacity = 1 - fade;
        c.spans.forEach((sp, j) => {
          const k = range(f.t, c.ws[j].s - 0.1, c.ws[j].s + 0.12, ease.outQuad);
          sp.style.opacity = 0.25 + 0.75 * k;
        });
      });
    },
  };
}
