// Wolves (vanilla entity.wolf.*): a single sharp bark; a low, rattling growl; a thin, nasal whine that climbs and
// sinks; open-mouthed panting, breath in and out; a yelp when hurt; a long whimpering cry falling away when it dies;
// the rapid flapping of a wet coat shaken dry, with the spray flying off it; soft padded footfalls; and the howl.
// Takes as in vanilla's sounds.json: ambient (bark) 3, growl 3, whine 1, pant 1, hurt 3, death 1, shake 1, step 5,
// howl 2.

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, layer, lowpass, highpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, thump } from './texture';
import { voice } from './voice';

/** one bark: a hard onset, the pitch jumping up and falling off, the mouth wide open */
function bark(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.17, 0.25);
  const out = alloc(d + 0.12, sr);
  const f = rng.range(430, 540);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (t < 0.03 ? 0.8 + (0.35 * t) / 0.03 : 1.15 - 0.45 * smooth((t - 0.03) / (d - 0.03))),
    amp: (t) => envAD(t, 0.008, d * 0.55),
    formants: [
      { f: (t) => 500 + 350 * Math.min(1, t / 0.04), bw: 160, g: 1 },
      { f: 1450, bw: 220, g: 0.7 },
      { f: 2600, bw: 300, g: 0.35 },
      { f: 3600, bw: 400, g: 0.15 },
    ],
    oq: 0.4,
    jitter: 0.04,
    shimmer: 0.12,
    rough: 0.35,
    breath: 0.25,
  });
  // (the chuff of air as the jaws open)
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: 0, dur: 0.06, attack: 0.002, tau: 0.02, bp: [1600, 0.9] }));
  highpass(out, 120, sr);
  return out;
}

/** a growl: deep, rough, rattling in the throat, swelling and easing off */
function growl(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.5);
  const out = alloc(d + 0.1, sr);
  const f = rng.range(85, 110);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (1 + 0.12 * Math.sin((Math.PI * t) / d)) * (1 + 0.02 * Math.sin(TAU * 3.1 * t)),
    amp: (t) => envBump(t, d * 0.25, d * 0.75) * (0.75 + 0.25 * Math.sin(TAU * rng.range(5, 7) * t)),
    formants: [
      { f: 420, bw: 120, g: 1 },
      { f: 1050, bw: 180, g: 0.55 },
      { f: 2400, bw: 300, g: 0.18 },
    ],
    oq: 0.35,
    jitter: 0.08,
    shimmer: 0.25,
    rough: 0.7,
    sub: 0.25,
    growl: [rng.range(24, 32), 0.6],
    breath: 0.3,
  });
  lowpass(out, 2600, sr);
  highpass(out, 60, sr);
  return out;
}

/** a whine through the nose: thin and high, rising, wavering, sinking again */
function whine(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.85, 1.1);
  const out = alloc(d + 0.1, sr);
  const f = rng.range(720, 820);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (x < 0.4 ? 1 + 0.35 * smooth(x / 0.4) : 1.35 - 0.5 * smooth((x - 0.4) / 0.6));
    },
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: 380, bw: 90, g: 0.6 },
      { f: 1250, bw: 150, g: 0.35 },
      { f: 2300, bw: 200, g: 0.8 },
      { f: 3400, bw: 300, g: 0.25 },
    ],
    oq: 0.7,
    jitter: 0.01,
    shimmer: 0.05,
    rough: 0.05,
    breath: 0.12,
    vib: [7, 0.025],
  });
  return out;
}

/** panting: quick breaths out and in through an open mouth, a soft voiced edge on each */
function pant(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 6 + rng.int(3);
  const period = rng.range(0.19, 0.24);
  const d = n * period;
  const out = alloc(d + 0.2, sr);
  for (let i = 0; i < n; i++) {
    const t0 = i * period + rng.range(-0.01, 0.01);
    const inward = i % 2 === 1;
    const len = period * (inward ? 0.7 : 0.85);
    layer(out, inward ? 0.55 : 0.8, (b) => burst(b, sr, rng, { t: t0, dur: len, attack: len * 0.25, tau: len * 0.35, bp: [inward ? rng.range(1900, 2300) : rng.range(1300, 1700), 1.4] }));
    layer(out, 0.25, (b) => burst(b, sr, rng, { t: t0, dur: len, attack: len * 0.2, tau: len * 0.3, bp: [inward ? 3400 : 2700, 2] }));
  }
  lowpass(out, 4500, sr);
  return out;
}

/** a yelp: high, sudden and bright, snapping down at the end */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.2, 0.28);
  const out = alloc(d + 0.1, sr);
  const f = rng.range(880, 1050);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (1.08 - 0.4 * smooth(t / d)),
    amp: (t) => envAD(t, 0.006, d * 0.5),
    formants: [
      { f: 800, bw: 150, g: 1 },
      { f: 1900, bw: 220, g: 0.7 },
      { f: 3000, bw: 300, g: 0.35 },
    ],
    oq: 0.45,
    jitter: 0.03,
    shimmer: 0.1,
    rough: 0.25,
    breath: 0.15,
  });
  return out;
}

/** the death cry: a long yelp that breaks into a whimper, falling and fading */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.25);
  const out = alloc(d + 0.15, sr);
  const f = rng.range(900, 1000);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 - 0.55 * smooth(x)) * (1 + (x > 0.45 ? 0.05 * Math.sin(TAU * 9 * t) : 0));
    },
    amp: (t) => envAD(t, 0.01, d * 0.45) * (1 - 0.35 * smooth((t / d - 0.3) / 0.7)),
    formants: [
      { f: (t) => 820 - 300 * (t / d), bw: 150, g: 1 },
      { f: 1900, bw: 220, g: 0.6 },
      { f: 2900, bw: 300, g: 0.3 },
    ],
    oq: 0.55,
    jitter: 0.05,
    shimmer: 0.15,
    rough: 0.3,
    breath: (t) => 0.15 + 0.3 * (t / d),
  });
  return out;
}

/** shaking dry: the coat flapping side to side, faster than you can count, and the spray flying off */
function shake(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.2, 1.45);
  const out = alloc(d + 0.2, sr);
  const rate = rng.range(13, 16);
  const n = Math.floor(d * rate);
  for (let i = 0; i < n; i++) {
    const t0 = i / rate + rng.range(-0.006, 0.006);
    const env = envBump(t0, d * 0.35, d * 0.65);
    layer(out, 0.9 * env, (b) => burst(b, sr, rng, { t: t0, dur: 0.06, attack: 0.004, tau: 0.018, bp: [rng.range(700, 1300), 0.8] }));
    // (the ears and jowls flapping)
    if (i % 2 === 0) layer(out, 0.35 * env, (b) => thump(b, sr, { t: t0, f0: rng.range(140, 190), f1: 90, tau: 0.02 }));
  }
  // (the spray)
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: d * 0.2, dur: d * 0.7, attack: d * 0.2, tau: d * 0.25, hp: 3500 }));
  highpass(out, 70, sr);
  return out;
}

/** a paw coming down: a soft, muffled pad and a faint scuff */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.14, sr);
  layer(out, 1, (b) => thump(b, sr, { t: 0.004, f0: rng.range(150, 200), f1: 90, tau: 0.018 }));
  layer(out, 0.4, (b) => burst(b, sr, rng, { t: 0.002, dur: 0.05, attack: 0.003, tau: 0.012, bp: [rng.range(900, 1400), 1] }));
  lowpass(out, 3000, sr);
  return out;
}

/** the howl: a long, pure cry sliding up, holding and wavering, then trailing away */
function howl(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(2.4, 3.0);
  const out = alloc(d + 0.3, sr);
  const f = rng.range(330, 380);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (x < 0.25 ? 1 + 0.5 * smooth(x / 0.25) : x < 0.7 ? 1.5 : 1.5 - 0.55 * smooth((x - 0.7) / 0.3));
    },
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: (t) => 500 + 150 * Math.sin((Math.PI * t) / d), bw: 110, g: 1 },
      { f: 900, bw: 150, g: 0.45 },
      { f: 2500, bw: 250, g: 0.12 },
    ],
    oq: 0.72,
    jitter: 0.008,
    shimmer: 0.04,
    rough: 0.04,
    breath: 0.1,
    vib: [5.5, 0.018],
  });
  return out;
}

export function wolfSounds(): Record<string, SoundGen> {
  return {
    'entity.wolf.ambient': sound('entity.wolf.ambient', 3, bark),
    'entity.wolf.growl': sound('entity.wolf.growl', 3, growl),
    'entity.wolf.whine': sound('entity.wolf.whine', 1, whine),
    'entity.wolf.pant': sound('entity.wolf.pant', 1, pant),
    'entity.wolf.hurt': sound('entity.wolf.hurt', 3, hurt),
    'entity.wolf.death': sound('entity.wolf.death', 1, death),
    'entity.wolf.shake': sound('entity.wolf.shake', 1, shake),
    'entity.wolf.step': sound('entity.wolf.step', 5, step),
    'entity.wolf.howl': sound('entity.wolf.howl', 2, howl),
  };
}
