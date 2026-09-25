// The lead's knot (vanilla sounds.json entity.leash_knot.*): tied round a fence post, the rope drawn tight, its
// fibres creaking as they bite, against a soft knock on the wood; undone, it snaps loose with a crack of fibres and
// the slack falling away.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, thump, ticks } from './texture';
import type { Band } from './texture';

/** a hemp rope's fibres rubbing under strain */
const FIBRE: Band[] = [
  { f: 1150, q: 5, g: 1 },
  { f: 2450, q: 6, g: 0.7 },
  { f: 4100, q: 4, g: 0.35 },
];

/** vanilla entity.leash_knot.place: the rope pulled tight round the post, creaking up as it takes the strain */
function knotPlace(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const len = rng.range(0.26, 0.36);
  const out = alloc(len + 0.1, sr);
  const lo = rng.range(55, 75), hi = rng.range(130, 170);
  const f = FIBRE.map((b) => ({ ...b, f: b.f * rng.range(0.9, 1.1) }));
  layer(out, 1, (b) => creak(b, sr, rng, { t: 0.02, dur: len, rate: (t) => lo + (hi - lo) * Math.min(1, t / len), amp: (t) => envBump(t, 0.05, len - 0.05), jitter: 0.3, bands: f }));
  // (the fibres hissing over each other as it draws up)
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: 0.02, dur: len, attack: 0.04, tau: len / 2, bp: [2600, 1.2] }));
  // (the knock of rope on the post)
  layer(out, 0.45, (b) => thump(b, sr, { f0: 210, f1: 140, tau: 0.02 }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.04, tau: 0.008, lp: 2200 }));
  return out;
}

/** vanilla entity.leash_knot.break: undone, the rope snaps loose (a crack of fibres) and the slack drops */
function knotBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 0.8, (b) => burst(b, sr, rng, { dur: 0.05, tau: 0.007, hp: 1400 }));
  layer(out, 0.6, (b) => ticks(b, sr, rng, { dur: 0.1, rate: 260, energy: (t) => Math.exp(-t / 0.035), f: [1300, 4800], t60: [0.004, 0.015], click: 0.5 }));
  const f = FIBRE.map((b) => ({ ...b, f: b.f * rng.range(0.95, 1.2) }));
  layer(out, 0.6, (b) => creak(b, sr, rng, { dur: 0.13, rate: (t) => 190 - 900 * t, amp: (t) => Math.exp(-t / 0.05), jitter: 0.35, bands: f }));
  // (the slack falling away)
  const t2 = rng.range(0.07, 0.11);
  layer(out, 0.45, (b) => burst(b, sr, rng, { t: t2, dur: 0.2, attack: 0.01, tau: 0.05, lp: 700, color: 'brown' }));
  return out;
}

export function leashSounds(): Record<string, SoundGen> {
  return {
    'entity.leash_knot.place': sound('entity.leash_knot.place', 3, knotPlace),
    'entity.leash_knot.break': sound('entity.leash_knot.break', 3, knotBreak),
  };
}
