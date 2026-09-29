// (armour stand) The armour stand's sounds (vanilla entity.armor_stand.*, four takes each as in its sounds.json): set
// down (place: its stone base plate knocked onto the ground, the wooden frame rattling on it), struck (hit: a dry
// wooden knock and the stand rocking on its plate), coming apart (break: sticks splintering and clattering down, the
// plate's clunk) and landing from a height (fall: vanilla's is the wood breaking sound, a hollow wooden thud).

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, phisem, thump, ticks } from './texture';
import { reverbHalf } from './world';

/** the frame's sticks: oak, two pixels square ([f, amp, t60]) */
const STICKS = [520, 1, 0.06, 1180, 0.65, 0.045, 2140, 0.4, 0.03, 3400, 0.2, 0.018];
/** the smooth stone base plate: short, hard and bright */
const PLATE = [760, 1, 0.035, 1630, 0.55, 0.025, 2890, 0.3, 0.015];

function tuned(modes: number[], k: number): number[] {
  return modes.map((v, i) => (i % 3 === 0 ? v * k : v));
}

/** the take's pitch: each a little apart, and a little loose */
function take(c: Ctx, ks: number[]): number {
  return ks[c.v % ks.length] * c.rng.range(0.97, 1.03);
}

/** set down: the plate knocked onto the ground, the sticks rattling on it just after */
function place(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const k = take(c, [1, 1.07, 0.94, 1.03]);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(PLATE, k), jitter: 0.04, noise: 0.8, noiseTau: 0.003, noiseBp: [2000, 0.8] }));
  layer(out, 0.55, (b) => thump(b, sr, { f0: 150 * k, f1: 100 * k, glide: 0.02, tau: 0.03, h2: 0.3 }));
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: 0.018, modes: tuned(STICKS, k), jitter: 0.05, noise: 0.4, noiseTau: 0.002, noiseBp: [2600, 1] }));
  layer(out, 0.3, (b) => ticks(b, sr, rng, { t: 0.03, dur: 0.08, rate: 70, energy: (t) => envBump(t, 0.005, 0.05), f: [1400, 2800], t60: [0.01, 0.03], amp: 0.6 }));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.12, dry: 1, tail: 0.15, pre: 0.006 });
}

/** struck: a dry knock on the wood, then the stand rocking on its plate, a couple of smaller knocks */
function hit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const k = take(c, [1, 1.1, 0.92, 1.04]);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(STICKS, k), jitter: 0.04, noise: 0.9, noiseTau: 0.0025, noiseBp: [1800, 0.9] }));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 180 * k, f1: 130 * k, glide: 0.015, tau: 0.02, h2: 0.25 }));
  const t1 = rng.range(0.05, 0.07), t2 = t1 + rng.range(0.05, 0.07);
  layer(out, 0.35, (b) => impact(b, sr, rng, { t: t1, modes: tuned(PLATE, k * 1.05), jitter: 0.05, noise: 0.5, noiseTau: 0.002, noiseBp: [2400, 1] }));
  layer(out, 0.18, (b) => impact(b, sr, rng, { t: t2, modes: tuned(PLATE, k * 1.1), jitter: 0.05, noise: 0.4, noiseTau: 0.002, noiseBp: [2600, 1] }));
  return reverbHalf(out, sr, { t60: 0.28, hf: 0.5, wet: 0.1, dry: 1, tail: 0.12, pre: 0.005 });
}

/** coming apart: a splintering crack, the sticks clattering down one after another, the plate's clunk under them */
function breakApart(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  const k = take(c, [1, 0.95, 1.06, 0.98]);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(STICKS, k * 0.9), jitter: 0.07, noise: 1, noiseTau: 0.007, noiseBp: [1600, 0.7] }));
  layer(out, 0.7, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.2,
      rate: 380,
      energy: (t) => envBump(t, 0.004, 0.08),
      grain: 0.004,
      heavy: 2,
      bands: [
        { f: 1300, q: 5, g: 1, spread: 0.3 },
        { f: 2600, q: 6, g: 0.6, spread: 0.3 },
        { f: 4800, q: 4, g: 0.3 },
      ],
    }),
  );
  // the sticks landing, each its own knock
  for (let i = 0; i < 5; i++) {
    const t = 0.08 + i * rng.range(0.04, 0.07);
    const kk = k * rng.range(0.85, 1.2);
    layer(out, 0.5 - i * 0.07, (b) => impact(b, sr, rng, { t, modes: tuned(STICKS, kk), jitter: 0.06, noise: 0.5, noiseTau: 0.002, noiseBp: [2200, 1] }));
  }
  layer(out, 0.5, (b) => impact(b, sr, rng, { t: 0.1, modes: tuned(PLATE, k * 0.85), jitter: 0.04, noise: 0.6, noiseTau: 0.003, noiseBp: [1500, 0.8] }));
  layer(out, 0.45, (b) => thump(b, sr, { t: 0.1, f0: 120 * k, f1: 80 * k, glide: 0.03, tau: 0.04, h2: 0.2 }));
  return reverbHalf(out, sr, { t60: 0.35, hf: 0.5, wet: 0.14, dry: 1, tail: 0.2, pre: 0.006 });
}

/** landed hard (vanilla's dig/wood): a hollow wooden thud and a crackle of grain */
function fall(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const k = take(c, [1, 1.08, 0.93, 1.02]);
  layer(out, 1, (b) => thump(b, sr, { f0: 210 * k, f1: 120 * k, glide: 0.03, tau: 0.045, h2: 0.35 }));
  layer(out, 0.7, (b) => impact(b, sr, rng, { modes: tuned(STICKS, k * 0.7), jitter: 0.05, noise: 0.9, noiseTau: 0.004, noiseBp: [900, 0.8] }));
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, { t: 0.005, dur: 0.12, rate: 260, energy: (t) => envBump(t, 0.004, 0.05), grain: 0.003, heavy: 2, bands: [{ f: 1100, q: 4, g: 1, spread: 0.3 }, { f: 2300, q: 5, g: 0.5 }] }),
  );
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.1, dry: 1, tail: 0.12, pre: 0.005 });
}

export function armorStandSounds(): Record<string, SoundGen> {
  const n = 'entity.armor_stand';
  return {
    [`${n}.place`]: sound(`${n}.place`, 4, place, { fadeOut: 0.08 }),
    [`${n}.hit`]: sound(`${n}.hit`, 4, hit, { fadeOut: 0.08 }),
    [`${n}.break`]: sound(`${n}.break`, 4, breakApart, { fadeOut: 0.1 }),
    [`${n}.fall`]: sound(`${n}.fall`, 4, fall, { fadeOut: 0.08 }),
  };
}
