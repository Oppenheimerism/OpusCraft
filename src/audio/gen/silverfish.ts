// The silverfish (vanilla entity.silverfish.*): a tiny thing with a big hiss. Its chatter is a few quick, dry
// bursts of high hiss, each one fluttering as it's pushed out, with a thin squeak riding on it; hurt, it gives one
// sharp squeal; dying, a squeal that sinks away as its chatter slows; its feet are the faintest patter of clicks.
// Takes as in vanilla's sounds.json: ambient 4, hurt 3, death 1, step 4.

import type { SoundGen } from '../synth';
import { alloc, addOsc, envAD, envBump, layer, TAU } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, sweep, ticks } from './texture';

/** one breath of hiss: band noise around f, fluttering at `rate` */
function hissInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, rate: number): void {
  const ph = c.rng.next() * TAU;
  sweep(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f: (t) => f * (1 - 0.18 * (t / d)),
    q: 2.2,
    amp: (t) => envBump(t, d * 0.2, d * 0.8) * (0.45 + 0.55 * Math.max(0, Math.sin(TAU * rate * t + ph))),
  });
}

/** a thin whistle gliding from f0 to f1, with a quick flutter in its pitch */
function squeakInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: number, f1: number, env: (t: number) => number): void {
  const vib = c.rng.range(38, 55);
  addOsc(b, c.sr, t0, d, (t) => (f0 + (f1 - f0) * (t / d)) * (1 + 0.025 * Math.sin(TAU * vib * t)), (t) => env(t));
  addOsc(b, c.sr, t0, d, (t) => 2 * (f0 + (f1 - f0) * (t / d)), (t) => env(t) * 0.25);
}

/** vanilla mob/silverfish/say1-4: two to four quick hisses, chattering */
function say(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(0.75, c.sr);
  const f = rng.range(5200, 7000), rate = rng.range(45, 70);
  const bursts: [number, number][] = [];
  let t = 0.01;
  const n = 2 + rng.int(3);
  for (let k = 0; k < n && t < 0.62; k++) {
    const d = rng.range(0.06, 0.13);
    bursts.push([t, d]);
    t += d + rng.range(0.025, 0.07);
  }
  layer(out, 1, (b) => {
    for (const [t0, d] of bursts) hissInto(b, c, t0, d, f * rng.range(0.92, 1.08), rate);
  });
  layer(out, 0.3, (b) => {
    for (const [t0, d] of bursts) {
      const s = rng.range(3400, 4400);
      squeakInto(b, c, t0, d, s, s * rng.range(0.85, 1.05), (tt) => envBump(tt, d * 0.3, d * 0.7));
    }
  });
  layer(out, 0.25, (b) => ticks(b, c.sr, rng, { dur: t, rate: rate, energy: () => 0.7, f: [3000, 6500], t60: [0.002, 0.005], ratios: [1, 1.7], weights: [1, 0.4], click: 0.6 }));
  return out;
}

/** vanilla mob/silverfish/hit1-3: a sharp little squeal over a spit of hiss */
function hit(c: Ctx): Float32Array {
  const { rng } = c;
  const d = rng.range(0.16, 0.24);
  const out = alloc(d + 0.02, c.sr);
  const env = (t: number) => envAD(t, 0.006, d * 0.35);
  const s = rng.range(4800, 6000);
  layer(out, 1, (b) => squeakInto(b, c, 0, d, s, s * rng.range(0.55, 0.7), env));
  layer(out, 0.7, (b) => burst(b, c.sr, rng, { dur: d, attack: 0.003, tau: d * 0.25, bp: [rng.range(6000, 7800), 1.6] }));
  layer(out, 0.35, (b) => hissInto(b, c, 0.01, d * 0.8, rng.range(4200, 5200), rng.range(60, 80)));
  return out;
}

/** vanilla mob/silverfish/kill: a squeal falling away, its chatter slowing to nothing */
function kill(c: Ctx): Float32Array {
  const { rng } = c;
  const d = 0.85;
  const out = alloc(d + 0.05, c.sr);
  const env = (t: number) => envAD(t, 0.01, d * 0.4);
  layer(out, 1, (b) => squeakInto(b, c, 0, d, rng.range(5200, 5800), rng.range(1500, 1900), env));
  layer(out, 0.75, (b) => {
    const ph = rng.next() * TAU;
    sweep(b, c.sr, rng, {
      dur: d,
      f: (t) => 6500 * Math.pow(0.45, t / d),
      q: 2,
      amp: (t) => env(t) * (0.4 + 0.6 * Math.max(0, Math.sin(TAU * (70 - 45 * (t / d)) * t + ph))),
    });
  });
  return out;
}

/** vanilla mob/silverfish/step1-4: a patter of tiny clicks and a scratch */
function step(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(0.14, c.sr);
  layer(out, 1, (b) => ticks(b, c.sr, rng, { dur: 0.1, rate: 60, energy: (t) => envBump(t, 0.01, 0.09), f: [2800, 6500], t60: [0.002, 0.006], ratios: [1, 1.9], weights: [1, 0.35], click: 0.9 }));
  layer(out, 0.35, (b) => burst(b, c.sr, rng, { t: 0.005, dur: 0.07, attack: 0.004, tau: 0.018, bp: [rng.range(5000, 7000), 1.2] }));
  return out;
}

export function silverfishSounds(): Record<string, SoundGen> {
  return {
    'entity.silverfish.ambient': sound('entity.silverfish.ambient', 4, say),
    'entity.silverfish.hurt': sound('entity.silverfish.hurt', 3, hit),
    'entity.silverfish.death': sound('entity.silverfish.death', 1, kill),
    'entity.silverfish.step': sound('entity.silverfish.step', 4, step),
  };
}
