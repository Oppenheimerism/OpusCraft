// Boat paddling (vanilla entity.boat.paddle_water / paddle_land, 8 and 6 takes): the blade
// scooping through the water with its swirl, bubbles and spray, or knocking and dragging along
// the ground when the boat is on land.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, phisem, sweep, thump } from './texture';

function paddleWater(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.75);
  const out = alloc(d + 0.12, sr);
  // the blade slicing in and pulling through: a band of noise that opens up, then settles
  const f0 = rng.range(650, 950);
  const pk = rng.range(0.1, 0.16);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d * 0.8,
      f: (t) => f0 * (1 + 0.9 * Math.min(1, t / (d * 0.18))) * (1 - 0.35 * Math.min(1, t / d)),
      q: 0.9,
      amp: (t) => envBump(t, d * pk, d * 0.6),
      color: 'pink',
    }),
  );
  // the swirl behind the blade
  layer(out, 0.45, (b) => burst(b, sr, rng, { t: 0.02, dur: d * 0.7, attack: 0.06, tau: 0.13, lp: 420, color: 'brown' }));
  // bubbles and drips
  layer(out, 0.5, (b) => {
    const nb = 16 + rng.int(12);
    for (let k = 0; k < nb; k++) {
      const t = 0.02 + Math.pow(rng.next(), 1.4) * d * 0.95;
      bubble(b, sr, t, rng.logRange(420, 2400), rng.range(0.2, 1) * Math.exp(-t / 0.35), undefined, rng.range(0.2, 0.5));
    }
  });
  // fine spray off the blade
  layer(out, 0.22, (b) =>
    phisem(b, sr, rng, {
      t: 0.01,
      dur: d * 0.6,
      rate: 1200,
      energy: (t) => envBump(t, 0.05, d * 0.45),
      grain: 0.0007,
      heavy: 2,
      bands: [
        { f: 3800, q: 1.4, g: 1, spread: 0.4 },
        { f: 2200, q: 1.8, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

function paddleLand(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.28, 0.42);
  const out = alloc(d + 0.1, sr);
  // the blade striking the ground: a hollow wooden knock
  const f = rng.range(180, 260);
  layer(out, 0.8, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.05, f * 2.4, 0.5, 0.03, f * 5.1, 0.25, 0.015],
      jitter: 0.05,
      noise: 0.5,
      noiseTau: 0.004,
      noiseBp: [1200, 0.8],
    }),
  );
  layer(out, 0.35, (b) => thump(b, sr, { f0: 130, f1: 80, tau: 0.03 }));
  // dragging through the dirt
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      t: 0.01,
      dur: d,
      rate: 5000,
      energy: (t) => envBump(t, d * 0.15, d * 0.8),
      grain: 0.0009,
      heavy: 2.2,
      bands: [
        { f: 1900, q: 1, g: 1, spread: 0.35 },
        { f: 950, q: 1.2, g: 0.8, spread: 0.3 },
      ],
    }),
  );
  return out;
}

export function boatSounds(): Record<string, SoundGen> {
  return {
    'entity.boat.paddle_water': sound('entity.boat.paddle_water', 8, paddleWater),
    'entity.boat.paddle_land': sound('entity.boat.paddle_land', 6, paddleLand),
  };
}
