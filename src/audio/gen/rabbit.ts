// Rabbits (vanilla entity.rabbit.*). A rabbit is mostly quiet: now and then it sniffs, a few quick puffs through its
// nose, with a faint squeak or a soft grinding of its teeth. Hurt, it squeaks sharply; dying, it screams, a thin shriek
// that wavers and sinks away. Every hop pushes off with a soft pat of its feet. The killer bunny's bite is a snarled
// little shriek snapped off by its teeth.
// Takes: ambient 3, hurt 4, death 3, jump 4, attack 1.

import type { SoundGen } from '../synth';
import { alloc, addOsc, envAD, envBump, layer, TAU } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, thump, ticks } from './texture';
import { voice } from './voice';

/** a squeak into `b` at `t0`: a thin, high voice gliding from `f0` to `f1`, wobbling; `rough` and `growl` rasp it */
function squeakInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: number, f1: number, o: { rough?: number; growl?: number; breath?: number; wobble?: number } = {}): void {
  const { sr, rng } = c;
  const wob = o.wobble ?? 0.02, rate = rng.range(22, 34);
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => (f0 + (f1 - f0) * Math.min(1, t / d)) * (1 + wob * Math.sin(TAU * rate * t)),
    amp: (t) => envBump(t, d * 0.12, d * 0.88),
    formants: [
      { f: 2300, bw: 500, g: 1 },
      { f: 3700, bw: 700, g: 0.6 },
      { f: 5300, bw: 900, g: 0.25 },
    ],
    oq: 0.45,
    jitter: 0.02,
    shimmer: 0.1,
    rough: o.rough ?? 0.15,
    growl: o.growl ? [rng.range(28, 40), o.growl] : undefined,
    breath: o.breath ?? 0.2,
  });
}

/** a quick puff of air through the nose at `t0` */
function sniffInto(b: Float32Array, c: Ctx, t0: number, d: number): void {
  burst(b, c.sr, c.rng, { t: t0, dur: d, attack: d * 0.55, tau: d * 0.25, bp: [c.rng.range(2800, 4200), 1.4] });
}

/** vanilla entity.rabbit.ambient: two to four quick sniffs, and a faint squeak or a soft grinding of its teeth */
function ambient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.8, sr);
  let t = 0.01;
  const n = 2 + rng.int(3);
  layer(out, 1, (b) => {
    for (let i = 0; i < n; i++) {
      const d = rng.range(0.035, 0.06);
      sniffInto(b, c, t, d);
      t += d + rng.range(0.05, 0.09);
    }
  });
  if (c.v === 1) {
    const d = rng.range(0.07, 0.1), f = rng.range(1500, 1800);
    layer(out, 0.4, (b) => squeakInto(b, c, t + 0.02, d, f, f * rng.range(1.08, 1.2), { breath: 0.3 }));
  } else if (c.v === 2) {
    layer(out, 0.35, (b) => ticks(b, sr, rng, { t: t + 0.02, dur: 0.2, rate: 30, energy: (x) => envBump(x, 0.04, 0.16), f: [1800, 3200], t60: [0.004, 0.01], ratios: [1, 2.3], weights: [1, 0.4], click: 0.5 }));
  }
  return out;
}

/** vanilla entity.rabbit.hurt: a sharp squeak */
function hurt(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.12, 0.2);
  const out = alloc(d + 0.05, sr);
  const f = rng.range(1500, 1900);
  layer(out, 1, (b) => squeakInto(b, c, 0.003, d, f * 1.15, f * 0.8, { rough: 0.25, breath: 0.25, wobble: 0.03 }));
  layer(out, 0.4, (b) => addOsc(b, sr, 0.003, d, (t) => 2 * f * (1.15 - 0.35 * (t / d)), (t) => envAD(t, 0.004, d * 0.35)));
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: d * 0.6, attack: 0.002, tau: d * 0.15, bp: [rng.range(4500, 6000), 1.3] }));
  return out;
}

/** vanilla entity.rabbit.death: a thin shriek that wavers and sinks away */
function death(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.55, 0.8);
  const out = alloc(d + 0.1, sr);
  const f = rng.range(1600, 2000), end = rng.range(0.45, 0.55);
  layer(out, 1, (b) => squeakInto(b, c, 0.005, d, f, f * end, { rough: 0.35, growl: 0.25, breath: 0.3, wobble: 0.05 }));
  layer(out, 0.35, (b) => addOsc(b, sr, 0.005, d * 0.8, (t) => 2 * f * (1 - (1 - end) * (t / d)), (t) => envAD(t, 0.01, d * 0.3)));
  return out;
}

/** vanilla entity.rabbit.jump: the soft pat of its feet pushing off the ground */
function jump(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.18, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(150, 190), f1: rng.range(85, 105), glide: 0.015, tau: 0.02 }));
  layer(out, 0.55, (b) => burst(b, sr, rng, { t: 0.002, dur: 0.08, attack: 0.003, tau: 0.018, lp: rng.range(1600, 2400), color: 'brown' }));
  layer(out, 0.25, (b) => burst(b, sr, rng, { t: 0.004, dur: 0.05, attack: 0.002, tau: 0.01, bp: [rng.range(2500, 3500), 1] }));
  return out;
}

/** vanilla entity.rabbit.attack: the killer bunny's bite, a snarled shriek snapped off by its teeth */
function attack(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = 0.22;
  const out = alloc(d + 0.06, sr);
  layer(out, 1, (b) => squeakInto(b, c, 0.005, d, 1300, 1700, { rough: 0.5, growl: 0.6, breath: 0.35, wobble: 0.04 }));
  layer(out, 0.8, (b) => {
    burst(b, sr, rng, { t: d - 0.01, dur: 0.03, attack: 0.001, tau: 0.004, hp: 2500 });
    thump(b, sr, { t: d - 0.01, f0: 400, f1: 250, glide: 0.005, tau: 0.008, amp: 0.6 });
  });
  return out;
}

export function rabbitSounds(): Record<string, SoundGen> {
  return {
    'entity.rabbit.ambient': sound('entity.rabbit.ambient', 3, ambient),
    'entity.rabbit.hurt': sound('entity.rabbit.hurt', 4, hurt),
    'entity.rabbit.death': sound('entity.rabbit.death', 3, death),
    'entity.rabbit.jump': sound('entity.rabbit.jump', 4, jump),
    'entity.rabbit.attack': sound('entity.rabbit.attack', 1, attack),
  };
}
