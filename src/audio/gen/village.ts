// Village block sounds: vanilla block/bell/bell_use01-02 (the bell struck).

import type { SoundGen } from '../synth';
import { alloc, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, thump } from './texture';

// ------------------------------------------------------------------ bell

/**
 * the partials of a tuned bell over its prime: hum (an octave under), prime, tierce (a minor third), quint, nominal
 * (an octave over, the note it is heard as), then the thinner upper ones; [ratio, level, seconds to die away]
 */
const BELL_PARTIALS: [number, number, number][] = [
  [0.5, 0.5, 5.5],
  [1, 0.75, 4.5],
  [1.2, 0.55, 3.2],
  [1.5, 0.22, 2.6],
  [2, 1, 3.4],
  [2.51, 0.3, 1.8],
  [2.66, 0.24, 1.6],
  [3.01, 0.32, 1.4],
  [4.07, 0.14, 0.9],
  [5.2, 0.07, 0.5],
];

/** a cast bell struck once by its clapper: a bright clang over a long ring that beats as it dies away */
function bellUse(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(5.5, sr);
  const f = v === 0 ? 392 : 370;
  layer(out, 1, (b) => {
    const modes: number[] = [];
    for (const [r, a, t60] of BELL_PARTIALS) {
      modes.push(f * r, a, t60);
      // (no casting is perfectly round: each partial is a close pair, and the pair beats)
      modes.push(f * r * (1 + rng.range(0.0012, 0.0035)), a * 0.5, t60 * 0.85);
    }
    impact(b, sr, rng, { modes, jitter: 0.001, noise: 0.5, noiseTau: 0.0012, noiseBp: [3500, 0.9] });
  });
  // the clapper's knock on the lip
  layer(out, 0.2, (b) => thump(b, sr, { f0: 300, f1: 210, tau: 0.006 }));
  return out;
}

export function villageSounds(): Record<string, SoundGen> {
  return {
    'block.bell.use': sound('block.bell.use', 2, bellUse),
  };
}
