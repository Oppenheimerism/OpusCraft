// The axolotl's sounds (Stage 5: ocean, M7), synthesized. Idle, it gives tiny, bright chirps and squeaks, clear in
// the air and muffled and bubbly under water; hurt, a sharp squeal; dying, a squeak that sinks away. Its bite is a
// quick wet snap; it swims with a soft swish and a few bubbles and splashes in and out of the water. A bucket scoops
// it up with a slosh and a surprised chirp, and pours it back out.

import type { SoundGen } from '../synth';
import { alloc, envBump, envPts, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep } from './texture';
import { voice } from './voice';
import { bucketRing, underwater, waterSplash } from './fish';

/** its voice: a small, bright, closed squeak round `f0` sliding by `bend` */
function chirp(b: Float32Array, sr: number, c: Ctx, t0: number, d: number, f0: number, bend: number, rough = 0.05): void {
  voice(b, sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => f0 * (1 + bend * Math.sin((Math.PI * t) / (2 * d))),
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: f0 * 2.1, bw: 220, g: 1 },
      { f: 3100, bw: 420, g: 0.5 },
      { f: 4600, bw: 600, g: 0.2 },
    ],
    oq: 0.5,
    jitter: 0.015,
    shimmer: 0.06,
    breath: 0.25,
    rough,
  });
}

/** vanilla entity.axolotl.idle_air / idle_water: one to three chirps (in the water, muffled, with a bubble or two) */
function idle(inWater: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.8, sr);
    layer(out, 1, (b) => {
      let t = 0;
      const n = 1 + rng.int(3);
      const f0 = rng.range(900, 1250);
      for (let i = 0; i < n; i++) {
        const d = rng.range(0.06, 0.13);
        chirp(b, sr, c, t, d, f0 * rng.range(0.9, 1.12), rng.range(-0.2, 0.35));
        t += d + rng.range(0.04, 0.12);
      }
      if (inWater) for (let k = 0; k < 3; k++) bubble(b, sr, rng.range(0, t), rng.logRange(500, 1400), rng.range(0.2, 0.5), undefined, 0.4);
    });
    return inWater ? underwater(out, sr, 3200, 0.25) : out;
  };
}

/** vanilla entity.axolotl.hurt: a sharp, short squeal */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) => chirp(b, sr, c, 0, rng.range(0.12, 0.18), rng.range(1300, 1600), rng.range(0.25, 0.45), 0.3));
  return out;
}

/** vanilla entity.axolotl.death: a squeak sinking away, and a last little one */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) => {
    chirp(b, sr, c, 0, 0.45, rng.range(1150, 1300), -0.55, 0.25);
    chirp(b, sr, c, 0.5, 0.12, rng.range(650, 750), -0.3, 0.2);
  });
  return out;
}

/** vanilla entity.axolotl.attack: a quick wet snap of its jaws, and a gulp */
function attack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { t: 0, modes: [rng.range(700, 900), 1, 0.02, rng.range(1800, 2200), 0.5, 0.012], jitter: 0.1, noise: 1, noiseTau: 0.004, noiseBp: [2500, 0.8] });
    bubble(b, sr, 0.05, rng.range(380, 480), 0.7, 0.04, 0.9);
    burst(b, sr, rng, { t: 0.04, dur: 0.12, attack: 0.005, tau: 0.03, bp: [900, 0.8], amp: 0.4 });
  });
  return underwater(out, sr, 4200, 0.15);
}

/** vanilla entity.axolotl.swim: a soft swish of its tail, a few bubbles */
function swim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.45);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(500, 700);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 0.8 * Math.sin((Math.PI * t) / d)), q: 1.2, amp: (t) => envPts(t / d, [0, 0, 0.35, 1, 1, 0]), color: 'pink' }));
  layer(out, 0.3, (b) => {
    for (let k = 0; k < 3; k++) bubble(b, sr, rng.range(0.03, d), rng.logRange(600, 1600), rng.range(0.3, 1), undefined, 0.4);
  });
  lowpass(out, 3000, sr);
  return out;
}

/** a bucket's slosh: the water swirling in or out (`out`: pouring), and the tin's soft ring */
function slosh(c: Ctx, pouring: boolean): Float32Array {
  const { sr, rng } = c;
  const d = 0.7;
  const out = alloc(d + 0.15, sr);
  layer(out, 0.25, (b) => bucketRing(b, sr, rng, 0));
  layer(out, 0.55, (b) => sweep(b, sr, rng, { dur: d, f: (t) => (pouring ? 1500 * (1 - (0.3 * t) / d) : 1100 + 900 * Math.sin((Math.PI * t) / d)), q: 1, amp: (t) => envBump(t, 0.06, d - 0.1), color: 'pink' }));
  layer(out, 0.8, (b) => {
    for (let k = 0; k < 20; k++) bubble(b, sr, 0.03 + rng.next() * d * 0.7, rng.logRange(350, 1500), rng.range(0.3, 1), undefined, 0.4);
  });
  // the axolotl's own little chirp, going in or coming out
  layer(out, 0.6, (b) => chirp(b, sr, c, pouring ? 0.35 : 0.25, 0.1, rng.range(1000, 1200), 0.3));
  return out;
}

export function axolotlSounds(): Record<string, SoundGen> {
  const n = 'entity.axolotl.';
  return {
    [n + 'idle_air']: sound(n + 'idle_air', 5, idle(false)),
    [n + 'idle_water']: sound(n + 'idle_water', 5, idle(true)),
    [n + 'hurt']: sound(n + 'hurt', 4, hurt),
    [n + 'death']: sound(n + 'death', 2, death),
    [n + 'attack']: sound(n + 'attack', 2, attack),
    [n + 'swim']: sound(n + 'swim', 4, swim),
    [n + 'splash']: sound(n + 'splash', 3, (c) => waterSplash(c, false)),
    'item.bucket.fill_axolotl': sound('item.bucket.fill_axolotl', 3, (c) => slosh(c, false)),
    'item.bucket.empty_axolotl': sound('item.bucket.empty_axolotl', 3, (c) => slosh(c, true)),
  };
}
