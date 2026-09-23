// Minecart loops (vanilla minecart/base, minecart/inside, minecart/inside_underwater): the
// rumble of iron wheels on the rails, the clack-clack of each rail joint under the front and
// back wheels, a faint grind and the rattle of the cart body. All seamless loops; the game
// sets their volume from the cart's speed every tick.

import type { SoundGen } from '../synth';
import { TAU, alloc, brown, white, lowpass, nsamp, loopify, layer, SVF, Biquad } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, thump, ticks } from './texture';

/** `inside` = heard from the seat: boomier, the grind muffled by the cart body */
function rolling(c: Ctx, inside: boolean): Float32Array {
  const { sr, rng } = c;
  const L = 4;
  const X = 0.25;
  const b = alloc(L + X, sr);
  const n = b.length;
  // the wheels rumbling along
  layer(b, inside ? 0.8 : 0.55, (o) => {
    const r = brown(n, rng, 0.997);
    lowpass(r, inside ? 170 : 260, sr);
    const f1 = rng.range(5, 7);
    const f2 = rng.range(0.6, 1.1);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      o[i] = r[i] * (0.75 + 0.15 * Math.sin(TAU * f1 * t) + 0.1 * Math.sin(TAU * f2 * t + 1));
    }
  });
  // iron grinding on iron, wandering in level
  layer(b, inside ? 0.05 : 0.12, (o) => {
    const w = white(n, rng);
    const b1 = new SVF(rng.range(1400, 1800), 6, sr);
    const b2 = new SVF(rng.range(2600, 3200), 8, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const e = 0.5 + 0.5 * Math.sin(TAU * 0.35 * t + 2) * Math.sin(TAU * 0.9 * t);
      o[i] = (b1.band(w[i]) + 0.6 * b2.band(w[i])) * (0.4 + 0.6 * e * e);
    }
  });
  // rail joints: front then back wheels, every half second or so
  layer(b, 1, (o) => {
    let t = X + rng.range(0.05, 0.2);
    while (t < L - 0.05) {
      for (let k = 0; k < 2; k++) {
        const tt = t + k * rng.range(0.11, 0.14);
        const a = k ? 0.8 : 1;
        impact(o, sr, rng, {
          t: tt,
          modes: inside ? [420, a, 0.05, 780, 0.6 * a, 0.035, 1350, 0.3 * a, 0.02] : [900, a, 0.06, 1650, 0.7 * a, 0.04, 2750, 0.4 * a, 0.03, 4100, 0.2 * a, 0.02],
          jitter: 0.05,
          noise: 0.6,
          noiseTau: 0.003,
          noiseBp: [inside ? 900 : 2200, 0.8],
        });
        thump(o, sr, { t: tt, f0: inside ? 110 : 140, f1: 70, tau: 0.03, amp: (inside ? 1.2 : 0.5) * a });
      }
      t += rng.range(0.55, 0.75);
    }
  });
  // the loose body rattling
  layer(b, inside ? 0.3 : 0.22, (o) => {
    ticks(o, sr, rng, { t: X, dur: L - X, rate: 14, energy: () => 1, f: inside ? [500, 1600] : [900, 3200], t60: [0.02, 0.06] });
  });
  return loopify(b, nsamp(X, sr));
}

/** the seat sound through water: everything above a few hundred hertz gone */
function insideUnderwater(c: Ctx): Float32Array {
  const b = rolling(c, true);
  for (let k = 0; k < 2; k++) {
    // warm the filter on the loop's tail so the seam stays click-free
    const bq = new Biquad().lowpass(380, 0.7071, c.sr);
    bq.run(b.slice(b.length - Math.round(0.5 * c.sr)));
    bq.run(b);
  }
  return b;
}

export function minecartSounds(): Record<string, SoundGen> {
  const loop = { loop: true };
  return {
    'entity.minecart.riding': sound('entity.minecart.riding', 1, (c) => rolling(c, false), loop),
    'entity.minecart.inside': sound('entity.minecart.inside', 1, (c) => rolling(c, true), loop),
    'entity.minecart.inside.underwater': sound('entity.minecart.inside.underwater', 1, insideUnderwater, loop),
  };
}
