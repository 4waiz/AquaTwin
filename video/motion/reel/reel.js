// AquaTwin: the one-minute film. Cuts come from the voiceover itself: cut('Meet AquaTwin') is
// 0.18 s before that line's first word, so regenerating the voice re-times the whole film.
import { run, E } from './engine.js';
import { cut } from './motion.js';
import bg from './plates/aq-bg.js';
import hook from './plates/aq-hook.js';
import alarm from './plates/aq-alarm.js';
import reveal from './plates/aq-reveal.js';
import screen from './plates/screen.js';
import hybrid from './plates/aq-hybrid.js';
import shock from './plates/aq-shock.js';
import foul from './plates/aq-foul.js';
import guard from './plates/aq-guard.js';
import proof from './plates/aq-proof.js';
import pillars from './plates/aq-pillars.js';
import outro from './plates/aq-outro.js';
import sub from './plates/aq-sub.js';

const END = 57.5; // last word ends at ~53.6 s; the outro holds to here (under 60 s)
const URL = 'aquatwin.kanbanstudios.ae';

run({
  width: 1920,
  height: 1080,
  fps: 30,
  background: '#04060a',
  audio: 'audio/voiceover.wav', // preview playback; the render muxes the final mix
  words: 'data/words.json',
  env: 'data/audio.json',
  timeline: () => {
    const c = {
      problem: cut('Yet plants still', 0.18, 2.5),
      reveal: cut('Meet AquaTwin', 0.18, 8.3),
      live: cut('that stays calibrated', 0.18, 12.06),
      hybrid: cut('Physics predicts', 0.18, 15.22),
      scenario: cut('Before a salinity shock', 0.18, 21.12),
      shock: cut('Fixed setpoints break', 0.2, 24.64),
      foul: cut('It flags membrane', 0.18, 29.61),
      guard: cut('Its safety layer', 0.18, 33.3),
      proof: cut('Tested against', 0.18, 40.09),
      pillars: cut('Smart water', 0.18, 47.02),
      outro: cut('AquaTwin Predict', 0.18, 49.95),
    };
    const T = { tail: 0.2 };
    return [
      E(bg(), 0, END),
      E(hook(), 0, c.problem, { tail: 0.2 }),
      E(alarm(), c.problem, c.reveal, T),
      E(reveal(), c.reveal, c.live, { tail: 0.22 }),
      E(
        screen({
          name: 'live', src: 'assets/screens/01-overview.png', vw: 1500, vh: 844, top: 70, url: URL,
          keys: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }, { t: 2.1, x: 0.46, y: 0.5, zoom: 1.38, move: 1.4 }],
          callouts: [
            { t: 0.45, until: 1.25, x: 0.795, y: 0.12, w: 0.195, h: 0.185, label: 'Live plant KPIs' },
            { t: 1.55, x: 0.445, y: 0.355, w: 0.21, h: 0.24, label: 'Calibrated to the plant, live' },
          ],
        }),
        c.live, c.hybrid,
      ),
      E(hybrid(), c.hybrid, c.scenario, T),
      E(
        screen({
          name: 'scenario', src: 'assets/screens/03a-scenario-lab-no-action.png', vw: 1500, vh: 844, top: 70, url: `${URL}/scenarios`,
          keys: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }, { t: 1.5, x: 0.36, y: 0.45, zoom: 1.7, move: 1.2 }],
          callouts: [
            { t: 0.9, x: 0.252, y: 0.258, w: 0.086, h: 0.026, label: 'No action: limit broken' },
            { t: 1.9, x: 0.136, y: 0.652, w: 0.507, h: 0.044, label: '24 h ahead, from the live plant' },
          ],
        }),
        c.scenario, c.shock,
      ),
      E(shock(), c.shock, c.foul, T),
      E(foul(), c.foul, c.guard, T),
      E(guard(), c.guard, c.proof, T),
      E(proof(), c.proof, c.pillars, T),
      E(pillars(), c.pillars, c.outro, { tail: 0.2 }),
      E(outro({ bg: 'assets/hero.png' }), c.outro, END),
      E(sub({ name: 'sub1', from: c.problem, to: c.reveal }), c.problem, c.reveal),
      E(sub({ name: 'sub2', from: c.live, to: c.pillars }), c.live, c.pillars),
    ];
  },
});
