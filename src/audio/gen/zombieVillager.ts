// Zombie villager voice (vanilla entity.zombie_villager.*, with the zombie's infect): the villager's nasal "hrmm"
// gone to a low, rasping, wet groan; the fizz and moan of the cure taking hold, the rising rush of one coming back
// to itself, and the snarl and gurgle of a villager being turned.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer, lowpass, highpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, sweep, ticks, bubble } from './texture';
import { voice } from './voice';
import { zombieStep } from './mobs';

/** one groan: a villager's hum, lower, rasping and wet (`open`: how far the mouth opens mid-groan) */
function groan(b: Float32Array, c: Ctx, t: number, d: number, base: number, f: (x: number) => number, open: number, rasp = 0.6, gain = 1): void {
  const { sr, rng } = c;
  const att = Math.min(0.06, d * 0.25);
  const o = (tt: number) => open * Math.sin(Math.PI * Math.min(1, tt / d));
  const wob = rng.range(2.5, 4);
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (tt) => base * f(tt / d) * (1 + 0.04 * Math.sin(2 * Math.PI * wob * tt)),
    amp: (tt) => envBump(tt, att, d - att),
    formants: [
      { f: (tt) => 300 + 320 * o(tt), bw: (tt) => 90 + 80 * o(tt), g: 1 },
      { f: (tt) => 950 + 180 * o(tt), bw: 140, g: (tt) => 0.35 + 0.3 * o(tt) },
      { f: (tt) => 2100 + 300 * o(tt), bw: 260, g: 0.14 },
      { f: 3000, bw: 360, g: 0.05 },
    ],
    jitter: 0.05,
    shimmer: 0.22,
    rough: rasp,
    sub: 0.12,
    breath: 0.3,
    oq: 0.6,
    growl: [rng.range(22, 30), 0.5],
    gain,
  });
}

function groans(c: Ctx, len: number, list: [t: number, d: number, base: number, f: (x: number) => number, open: number, rasp?: number][]): Float32Array {
  const out = alloc(len, c.sr);
  layer(out, 1, (b) => {
    for (const [t, d, base, f, open, rasp] of list) groan(b, c, t, d, base, f, open, rasp);
  });
  // (the wet catch in the throat)
  layer(out, 0.08, (b) => {
    for (let i = 0; i < 4; i++) bubble(b, c.sr, c.rng.range(0.05, len * 0.6), c.rng.range(250, 480), 1, 0.03);
  });
  highpass(out, 60, c.sr);
  lowpass(out, 3800, c.sr);
  return out;
}

const base = (c: Ctx) => c.rng.range(92, 108);

/** vanilla mob/zombie_villager/say1-3: "hrrmm", "hm-hrrgh", "hurrrr" */
function ambient(c: Ctx): Float32Array {
  const b = base(c);
  switch (c.v % 3) {
    case 0:
      return groans(c, 0.95, [[0, 0.72, b, (x) => 1.06 - 0.2 * x, 0.25]]);
    case 1:
      return groans(c, 1.0, [[0, 0.22, b * 1.04, () => 1, 0.1, 0.45], [0.3, 0.52, b, (x) => 1.02 - 0.18 * x, 0.55]]);
    default:
      return groans(c, 1.05, [[0, 0.82, b * 0.96, (x) => 0.98 + 0.1 * Math.sin(Math.PI * x), 0.65, 0.7]]);
  }
}

/** vanilla mob/zombie_villager/hurt1-2: a short, choked "hrah!" */
function hurt(c: Ctx): Float32Array {
  const b = base(c) * c.rng.range(1.18, 1.32);
  return groans(c, 0.5, [[0, c.rng.range(0.24, 0.3), b, (x) => 1.08 - 0.3 * x, 0.85, 0.5]]);
}

/** vanilla mob/zombie_villager/death: a long groan sinking into a gurgle */
function death(c: Ctx): Float32Array {
  const b = base(c) * 1.08;
  const out = groans(c, 1.7, [[0, 1.25, b, (x) => 1.04 - 0.45 * x + 0.05 * Math.sin(Math.PI * 3 * x), 0.55, 0.75]]);
  layer(out, 0.18, (bf) => {
    for (let i = 0; i < 9; i++) bubble(bf, c.sr, 0.8 + i * 0.07 + c.rng.range(0, 0.04), c.rng.range(180, 360), 1 - i * 0.07, 0.04);
  });
  return out;
}

/** vanilla mob/zombie/remedy: the cure taking hold, a long fizzing hiss with a moan under it and sparks */
function cure(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.6, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 2.4, f: (t) => 2600 + 2200 * Math.sin(Math.PI * Math.min(1, t / 2.2)), q: 1.1, amp: (t) => envBump(t, 0.25, 2.1), color: 'white' }));
  layer(out, 0.4, (b) => ticks(b, sr, rng, { t: 0.1, dur: 2.2, rate: 60, energy: (t) => envBump(t, 0.4, 1.8), f: [2500, 7000], t60: [0.004, 0.012], click: 0.4 }));
  layer(out, 0.55, (b) => groan(b, c, 0.2, 1.9, rng.range(70, 80), (x) => 0.9 + 0.35 * x, 0.5, 0.8));
  highpass(out, 50, sr);
  return out;
}

/** vanilla mob/zombie/unfect: one comes back to itself, a rising rush that settles into a villager's sigh */
function converted(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.9, sr);
  layer(out, 0.9, (b) => sweep(b, sr, rng, { dur: 1.1, f: (t) => 350 * Math.pow(9, t / 1.1), q: (t) => 1.5 + 3 * (t / 1.1), amp: (t) => envBump(t, 0.85, 0.25), color: 'pink' }));
  layer(out, 0.35, (b) => ticks(b, sr, rng, { t: 0.6, dur: 0.6, rate: 40, energy: (t) => Math.exp(-t / 0.2), f: [3000, 8000], t60: [0.01, 0.03] }));
  // (and then the villager's own "hmm")
  layer(out, 0.7, (b) =>
    voice(b, sr, rng, {
      t: 1.05,
      dur: 0.55,
      f0: (t) => rng.range(135, 145) * (1.05 - 0.14 * (t / 0.55)),
      amp: (t) => envBump(t, 0.05, 0.5),
      formants: [
        { f: 280, bw: 80, g: 1 },
        { f: 1020, bw: 110, g: 0.35 },
        { f: 2200, bw: 230, g: 0.1 },
      ],
      jitter: 0.02,
      shimmer: 0.07,
      rough: 0.25,
      breath: 0.08,
      oq: 0.55,
      vib: [5.5, 0.009],
    }),
  );
  highpass(out, 60, sr);
  return out;
}

/** vanilla mob/zombie/infect: a villager turned, a snarl and a wet crunch */
function infect(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.4, sr);
  layer(out, 1, (b) => groan(b, c, 0, 1.0, rng.range(78, 90), (x) => 1.15 - 0.35 * x, 0.8, 0.9));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: 0.02, dur: 0.18, tau: 0.05, bp: [900, 1.3] }));
  layer(out, 0.25, (b) => {
    for (let i = 0; i < 7; i++) bubble(b, sr, 0.3 + i * 0.09 + rng.range(0, 0.05), rng.range(200, 420), 1 - i * 0.1, 0.035);
  });
  lowpass(out, 4000, sr);
  return out;
}

export function zombieVillagerSounds(): Record<string, SoundGen> {
  return {
    'entity.zombie_villager.ambient': sound('entity.zombie_villager.ambient', 3, ambient),
    'entity.zombie_villager.hurt': sound('entity.zombie_villager.hurt', 2, hurt),
    'entity.zombie_villager.death': sound('entity.zombie_villager.death', 1, death),
    // (vanilla plays the zombie's own steps)
    'entity.zombie_villager.step': sound('entity.zombie_villager.step', 5, zombieStep),
    'entity.zombie_villager.cure': sound('entity.zombie_villager.cure', 1, cure),
    'entity.zombie_villager.converted': sound('entity.zombie_villager.converted', 1, converted),
    'entity.zombie.infect': sound('entity.zombie.infect', 1, infect),
  };
}
