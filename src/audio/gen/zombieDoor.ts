// A zombie at a wooden door (vanilla entity.zombie.attack_wooden_door / break_wooden_door): the heavy boom of a body
// slamming into the door, the panel shuddering and the latch rattling in its frame; and the crash of the door giving
// way, the wood splitting and the pieces clattering down.

import type { SoundGen } from '../synth';
import { alloc, layer, highpass, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, thump, phisem, ticks } from './texture';

/** one slam against a door panel whose lowest mode is `fb` */
function slam(b: Float32Array, c: Ctx, t: number, fb: number, a: number): void {
  const { sr, rng } = c;
  impact(b, sr, rng, {
    t,
    modes: [fb, a, 0.22, fb * 2.3, 0.7 * a, 0.14, fb * 3.9, 0.45 * a, 0.09, fb * 6.1, 0.3 * a, 0.06, fb * 9.4, 0.15 * a, 0.035],
    jitter: 0.04,
    noise: a,
    noiseTau: 0.006,
    noiseBp: [900, 0.7],
  });
  thump(b, sr, { t, f0: fb * 1.2, f1: fb * 0.6, tau: 0.09, amp: 0.9 * a });
}

/** vanilla mob/zombie/wood1-4: a slam against the door, the panel booming and the door rattling in its frame */
function attackDoor(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.95, sr);
  const fb = rng.range(95, 125);
  // (one take bounces: a second, weaker knock just after)
  const bounce = v === 3 ? rng.range(0.07, 0.1) : 0;
  layer(out, 1, (b) => {
    slam(b, c, 0, fb, 1);
    if (bounce) slam(b, c, bounce, fb * 1.05, 0.45);
  });
  // the door rattling in its frame, the latch knocking
  layer(out, v === 1 ? 0.5 : 0.32, (b) =>
    ticks(b, sr, rng, { t: 0.03, dur: 0.4, rate: 45, energy: (t) => Math.exp(-t / (v === 1 ? 0.14 : 0.08)), f: [900, 2600], t60: [0.01, 0.03], ratios: [1, 2.4], weights: [1, 0.4] }),
  );
  // (the wood's grain in the hit)
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, { dur: 0.2, rate: 700, energy: (t) => Math.exp(-t / 0.04), grain: 0.0015, heavy: 2, bands: [{ f: 700, q: 3, g: 1, spread: 0.3 }, { f: 1600, q: 3, g: 0.5, spread: 0.3 }] }),
  );
  highpass(out, 45, sr);
  lowpass(out, 6000, sr);
  return out;
}

/** vanilla mob/zombie/woodbreak1-5: the door gives way, a split and a boom, then the pieces clattering down */
function breakDoor(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.35, sr);
  const fb = rng.range(85, 115);
  layer(out, 1, (b) => slam(b, c, 0, fb, 1));
  // the wood splitting: a tearing crackle
  layer(out, 0.85, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.6,
      rate: 1400,
      energy: (t) => (1 - Math.exp(-t / 0.005)) * Math.exp(-t / 0.13),
      grain: 0.0025,
      heavy: 3,
      bands: [
        { f: 1100, q: 4, g: 1, spread: 0.5 },
        { f: 2600, q: 3, g: 0.7, spread: 0.4 },
        { f: 520, q: 3, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  // splinters and planks clattering down
  layer(out, 0.45, (b) =>
    ticks(b, sr, rng, { t: 0.08, dur: 1.0, rate: 30, energy: (t) => Math.exp(-t / 0.28), f: [400, 1800], t60: [0.02, 0.07], ratios: [1, 2.3, 3.9], weights: [1, 0.5, 0.25] }),
  );
  highpass(out, 40, sr);
  return out;
}

export function zombieDoorSounds(): Record<string, SoundGen> {
  return {
    'entity.zombie.attack_wooden_door': sound('entity.zombie.attack_wooden_door', 4, attackDoor),
    'entity.zombie.break_wooden_door': sound('entity.zombie.break_wooden_door', 5, breakDoor),
  };
}
