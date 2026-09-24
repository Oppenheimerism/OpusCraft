// The ocean's sounds (Stage 5: ocean), synthesized: a sponge soaking up the water round it, and a wet sponge set
// down in the Nether hissing dry.

import type { SoundGen } from '../synth';
import { alloc, envPts, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, sweep } from './texture';
import { reverbHalf } from './world';

/** vanilla block.sponge.absorb: a gulping slurp — water rushing in, bubbles popping as it goes */
function spongeAbsorb(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 0.9;
  const out = alloc(dur, sr);
  layer(out, 0.9, (b) => sweep(b, sr, rng, { t: 0, dur: 0.75, f: (t) => 500 + 1400 * Math.pow(t / 0.75, 0.6), q: 2.2, amp: (t) => envPts(t / 0.75, [0, 0, 0.1, 1, 0.55, 0.7, 1, 0]), color: 'pink' }));
  layer(out, 0.7, (b) => {
    for (let i = 0; i < 9; i++) bubble(b, sr, rng.range(0.03, 0.65), rng.range(380, 1100), rng.range(0.3, 0.8), rng.range(0.02, 0.05), rng.range(0.2, 0.6));
  });
  return reverbHalf(out, sr, { t60: 0.5, wet: 0.2, dry: 1 });
}

/** vanilla block.wet_sponge.dries: a steamy hiss, fading as it dries out */
function wetSpongeDries(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 1.6;
  const out = alloc(dur, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { t: 0, dur, f: (t) => 5200 - 1600 * (t / dur), q: 0.8, mode: 'hp', amp: (t) => envPts(t / dur, [0, 0, 0.05, 1, 0.4, 0.55, 1, 0]), color: 'white' }));
  layer(out, 0.35, (b) => {
    for (let i = 0; i < 6; i++) bubble(b, sr, rng.range(0.02, 0.5), rng.range(900, 2200), rng.range(0.2, 0.5), 0.02, 0.4);
  });
  return out;
}

export function oceanSounds(): Record<string, SoundGen> {
  return {
    'block.sponge.absorb': sound('block.sponge.absorb', 3, spongeAbsorb),
    'block.wet_sponge.dries': sound('block.wet_sponge.dries', 2, wetSpongeDries),
  };
}
