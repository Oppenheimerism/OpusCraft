// Horses, donkeys and mules (vanilla entity.horse.*, entity.donkey.*, entity.mule.*). The horse's whinny: a high,
// fluttering squeal falling away into a low nicker; the angry one harsher, after a snort; a sharp squeal when it's
// hurt and a long failing whinny when it dies; the breath blown out through the nostrils, lips fluttering; munching;
// hooves: a dull thud on earth, a hollow clop on wood, the three-beat drum of a canter, the thump of a landing; the
// grunt as it leaps; the saddle's creak and buckle and the clank of armour going on. The donkey's hee-haw, the breath
// dragged in on a rasp and brayed out low, over and over; its hurt and dying cries. The mule's whinny breaking into a
// bray. As in vanilla's sounds.json the donkey and mule eat and jump with the horse's sounds, and the chest going on
// is the chicken's plop. Takes: horse ambient 3, angry 2, breathe 3, death 1, eat 5, gallop 4, hurt 4, jump 1,
// land 1, saddle 1, armor 1, step 6, step_wood 6; donkey ambient 3, angry 2, death 1, hurt 3; mule ambient 3,
// angry 1, death 1, hurt 3.

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, layer, lowpass, highpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, impact, thump } from './texture';
import { voice } from './voice';

// ---------------------------------------------------------------------------
// voices

/**
 * a whinny into `out` at `t0`: a high squeal fluttering fast (the trill a horse's neigh has) that falls in pitch
 * and slows, `f` its top, `rough` how harsh
 */
function whinnyInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, rough: number, fall = 0.55): void {
  const { sr, rng } = c;
  const trill = rng.range(18, 26);
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      // (up a little over the onset, then down and down, the trill slowing with it)
      const glide = x < 0.12 ? 0.9 + 0.1 * smooth(x / 0.12) : 1 - fall * smooth((x - 0.12) / 0.88);
      return f * glide * (1 + 0.05 * (1 - 0.6 * x) * Math.sin(TAU * trill * (1 - 0.35 * x) * t));
    },
    amp: (t) => {
      const x = t / d;
      return envBump(t, d * 0.08, d * 0.92) * (1 - 0.45 * (1 - x) * (0.5 + 0.5 * Math.sin(TAU * trill * (1 - 0.35 * x) * t)));
    },
    formants: [
      { f: (t) => 950 - 300 * (t / d), bw: 180, g: 1 },
      { f: (t) => 1900 - 350 * (t / d), bw: 260, g: 0.7 },
      { f: 2900, bw: 380, g: 0.35 },
      { f: 4100, bw: 500, g: 0.15 },
    ],
    oq: 0.45,
    jitter: 0.02,
    shimmer: 0.1,
    rough,
    breath: (t) => 0.1 + 0.25 * (t / d),
  });
}

/** a nicker: the low, pulsing "huh-huh-huh" a whinny trails off into */
function nickerInto(out: Float32Array, c: Ctx, t0: number, d: number): void {
  const { sr, rng } = c;
  const rate = rng.range(9, 13), f = rng.range(105, 135);
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (1 - 0.15 * (t / d)),
    amp: (t) => envBump(t, 0.03, d - 0.03) * (0.25 + 0.75 * Math.max(0, Math.sin(TAU * rate * t))),
    formants: [
      { f: 500, bw: 140, g: 1 },
      { f: 1250, bw: 200, g: 0.45 },
      { f: 2500, bw: 320, g: 0.15 },
    ],
    oq: 0.5,
    jitter: 0.05,
    shimmer: 0.2,
    rough: 0.35,
    breath: 0.35,
  });
}

/** a snort: breath blown hard out through the nostrils, the lips fluttering */
function snortInto(out: Float32Array, c: Ctx, t0: number, d: number, level = 1): void {
  const { sr, rng } = c;
  const flutter = rng.range(24, 34);
  layer(out, 0.8 * level, (b) =>
    burst(b, sr, rng, { t: t0, dur: d, attack: 0.02, tau: d * 0.45, bp: [rng.range(420, 650), 0.8], color: 'brown', env: (t) => 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * flutter * t)) }),
  );
  layer(out, 0.4 * level, (b) => burst(b, sr, rng, { t: t0, dur: d, attack: 0.015, tau: d * 0.35, bp: [rng.range(1600, 2400), 1.1], env: (t) => 0.5 + 0.5 * Math.abs(Math.sin(Math.PI * flutter * t)) }));
}

/** a bray's breath in: a harsh, squeezed "hee", mostly rasp */
function heeInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, rough = 0.6): void {
  const { sr, rng } = c;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (0.92 + 0.14 * smooth(t / d)),
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: 620, bw: 200, g: 0.7 },
      { f: 2200, bw: 300, g: 1 },
      { f: 3300, bw: 420, g: 0.5 },
    ],
    oq: 0.35,
    jitter: 0.06,
    shimmer: 0.25,
    rough,
    sub: 0.2,
    breath: 0.55,
  });
}

/** a bray's breath out: a big, open, honking "haw" falling in pitch */
function hawInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, rough = 0.45): void {
  const { sr, rng } = c;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (1.08 - 0.3 * smooth(t / d)),
    amp: (t) => envBump(t, d * 0.1, d * 0.9),
    formants: [
      { f: (t) => 820 - 180 * (t / d), bw: 170, g: 1 },
      { f: 1350, bw: 220, g: 0.75 },
      { f: 2500, bw: 320, g: 0.3 },
      { f: 3500, bw: 420, g: 0.12 },
    ],
    oq: 0.4,
    jitter: 0.03,
    shimmer: 0.14,
    rough,
    sub: 0.12,
    breath: 0.18,
    growl: [rng.range(28, 36), 0.35],
  });
}

/** a bray: hee-haw, `n` times over, each a little weaker */
function brayInto(out: Float32Array, c: Ctx, t0: number, n: number, f: number, harsh = 0): number {
  const { rng } = c;
  let t = t0;
  for (let i = 0; i < n; i++) {
    const k = 1 - 0.12 * i;
    const dh = rng.range(0.24, 0.32) * (1 - 0.3 * harsh), dw = rng.range(0.34, 0.46) * (1 - 0.3 * harsh);
    const hee = alloc(dh + 0.05, c.sr), haw = alloc(dw + 0.05, c.sr);
    heeInto(hee, c, 0, dh, f * 2.9 * k, 0.6 + 0.3 * harsh);
    hawInto(haw, c, 0, dw, f * k, 0.45 + 0.35 * harsh);
    layer(out, 0.55 * k, (b) => b.set(hee.subarray(0, Math.min(hee.length, b.length))), Math.round(t * c.sr));
    t += dh * 0.92;
    layer(out, 1 * k, (b) => b.set(haw.subarray(0, Math.min(haw.length, b.length))), Math.round(t * c.sr));
    t += dw * 0.95;
  }
  return t;
}

// ---------------------------------------------------------------------------
// the horse

/** the whinny, trailing into a nicker */
function horseAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.85, 1.2), dn = rng.range(0.25, 0.4);
  const out = alloc(d + dn + 0.2, sr);
  layer(out, 1, (b) => whinnyInto(b, c, 0, d, rng.range(900, 1150), 0.12));
  layer(out, 0.45, (b) => nickerInto(b, c, d * 0.9, dn));
  highpass(out, 90, sr);
  return out;
}

/** angry: a snort, then a louder, harsher whinny */
function horseAngry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const ds = rng.range(0.25, 0.35), d = rng.range(0.9, 1.2);
  const out = alloc(ds + d + 0.25, sr);
  snortInto(out, c, 0, ds, 0.8);
  layer(out, 1, (b) => whinnyInto(b, c, ds * 0.8, d, rng.range(1150, 1350), 0.45, 0.6));
  highpass(out, 90, sr);
  return out;
}

/** hurt: a sharp, short squeal */
function horseHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.45);
  const out = alloc(d + 0.12, sr);
  layer(out, 1, (b) => whinnyInto(b, c, 0, d, rng.range(1150, 1400), 0.5, 0.4));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0, dur: 0.08, attack: 0.003, tau: 0.03, bp: [1800, 0.9] }));
  highpass(out, 150, sr);
  return out;
}

/** death: a long whinny failing, the breath giving out under it */
function horseDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.3, 1.6);
  const out = alloc(d + 0.5, sr);
  layer(out, 1, (b) => whinnyInto(b, c, 0, d, rng.range(1000, 1150), 0.35, 0.75));
  layer(out, 0.35, (b) => snortInto(b, c, d * 0.85, 0.45, 0.6));
  highpass(out, 80, sr);
  return out;
}

/** breathe: a blow through the nostrils */
function horseBreathe(c: Ctx): Float32Array {
  const d = c.rng.range(0.4, 0.7);
  const out = alloc(d + 0.1, c.sr);
  snortInto(out, c, 0, d);
  highpass(out, 120, c.sr);
  return out;
}

/** eating: slow, grinding chews */
function horseEat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 3 + rng.int(3);
  const out = alloc(0.25 + n * 0.17, sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    layer(out, rng.range(0.6, 1), (b) => burst(b, sr, rng, { t, dur: 0.1, attack: 0.006, tau: 0.03, bp: [rng.range(700, 1500), 0.7] }));
    layer(out, rng.range(0.3, 0.5), (b) => burst(b, sr, rng, { t: t + 0.01, dur: 0.12, attack: 0.01, tau: 0.04, bp: [rng.range(250, 400), 0.8], color: 'brown' }));
    layer(out, rng.range(0.15, 0.3), (b) => burst(b, sr, rng, { t, dur: 0.05, attack: 0.002, tau: 0.012, hp: 3500 }));
    t += rng.range(0.13, 0.19);
  }
  highpass(out, 150, sr);
  return out;
}

/** one hoof coming down on earth: a dull thud and a scuff of grit */
function hoofInto(out: Float32Array, c: Ctx, t: number, level: number, weight = 1): void {
  const { sr, rng } = c;
  layer(out, 0.9 * level, (b) => thump(b, sr, { t, f0: rng.range(130, 160) * (1.1 - 0.2 * weight), f1: rng.range(65, 80), glide: 0.02, tau: 0.028 * weight, h2: 0.2 }));
  layer(out, 0.45 * level, (b) => burst(b, sr, rng, { t, dur: 0.05, attack: 0.001, tau: 0.012, bp: [rng.range(700, 1100), 0.8] }));
  layer(out, 0.2 * level, (b) => burst(b, sr, rng, { t: t + 0.004, dur: 0.07, attack: 0.004, tau: 0.02, hp: 2500 }));
}

function horseStep(c: Ctx): Float32Array {
  const out = alloc(0.22, c.sr);
  hoofInto(out, c, 0.004, 1);
  lowpass(out, 5000, c.sr);
  return out;
}

/** a hoof on wood: the hollow clop */
function horseStepWood(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.25, sr);
  const k = rng.range(0.9, 1.12);
  impact(out, sr, rng, { t: 0.004, modes: [480 * k, 1, 0.07, 830 * k, 0.55, 0.05, 1270 * k, 0.3, 0.035, 1900 * k, 0.12, 0.02], jitter: 0.03, noise: 0.5, noiseTau: 0.003, noiseBp: [2600, 0.9] });
  layer(out, 0.35, (b) => thump(b, sr, { t: 0.004, f0: 160, f1: 90, glide: 0.015, tau: 0.02 }));
  highpass(out, 100, sr);
  return out;
}

/** a canter's three beats, hind, diagonal pair, leading fore: da-da-dum */
function horseGallop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const gap = rng.range(0.07, 0.09);
  hoofInto(out, c, 0.004, 0.7, 1.1);
  hoofInto(out, c, 0.004 + gap, 0.85, 1.1);
  hoofInto(out, c, 0.004 + gap * 2 + rng.range(0.005, 0.02), 1, 1.2);
  // (the ground thrown up behind)
  layer(out, 0.15, (b) => burst(b, sr, rng, { t: 0.02, dur: 0.3, attack: 0.02, tau: 0.08, bp: [1800, 0.6] }));
  lowpass(out, 6000, sr);
  return out;
}

/** the leap: a grunt of breath and the hind hooves pushing off */
function horseJump(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.32;
  const out = alloc(d + 0.12, sr);
  layer(out, 0.8, (b) => voice(b, sr, rng, {
    t: 0.03,
    dur: d,
    f0: (t) => 155 - 45 * (t / d),
    amp: (t) => envAD(t, 0.03, d * 0.4),
    formants: [
      { f: 560, bw: 160, g: 1 },
      { f: 1300, bw: 220, g: 0.4 },
      { f: 2600, bw: 320, g: 0.15 },
    ],
    oq: 0.5,
    jitter: 0.05,
    shimmer: 0.15,
    rough: 0.3,
    breath: 0.6,
  }));
  hoofInto(out, c, 0, 0.8, 1.2);
  hoofInto(out, c, 0.025, 0.7, 1.2);
  highpass(out, 60, sr);
  return out;
}

/** landing: the forefeet, then the hind, heavily */
function horseLand(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  hoofInto(out, c, 0.004, 1, 1.5);
  hoofInto(out, c, 0.05, 0.9, 1.5);
  layer(out, 0.5, (b) => thump(b, sr, { t: 0.01, f0: 90, f1: 45, glide: 0.04, tau: 0.08 }));
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: 0.02, dur: 0.25, attack: 0.01, tau: 0.07, bp: [1200, 0.6] }));
  lowpass(out, 5000, sr);
  return out;
}

/** the saddle going on: leather settling and creaking, a buckle jingling shut */
function horseSaddle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  // (the flap of the leather onto its back)
  layer(out, 0.7, (b) => burst(b, sr, rng, { t: 0.005, dur: 0.12, attack: 0.004, tau: 0.035, bp: [650, 0.7], color: 'brown' }));
  layer(out, 0.6, (b) =>
    creak(b, sr, rng, { t: 0.08, dur: 0.35, rate: (t) => 70 + 90 * Math.sin((Math.PI * t) / 0.35), amp: (t) => envBump(t, 0.06, 0.29), jitter: 0.25, bands: [{ f: 420, q: 3, g: 1 }, { f: 1150, q: 4, g: 0.6 }, { f: 2600, q: 5, g: 0.25 }] }),
  );
  for (let i = 0; i < 3; i++) {
    const t = 0.42 + i * rng.range(0.035, 0.06);
    impact(out, sr, rng, { t, modes: [3100, 0.25, 0.08, 4700, 0.18, 0.06, 6900, 0.1, 0.04], jitter: 0.08, noise: 0.15, noiseTau: 0.002, noiseBp: [5000, 1] });
  }
  highpass(out, 120, sr);
  return out;
}

/** armour going on: the plates clanking down and settling, their chains rattling */
function horseArmor(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  const plate = (t: number, g: number) =>
    impact(out, sr, rng, { t, modes: [340, 0.6, 0.35, 810, 0.45, 0.3, 1390, 0.35, 0.25, 2270, 0.22, 0.18, 3160, 0.12, 0.12], jitter: 0.06, noise: 0.5, noiseTau: 0.004, noiseBp: [2400, 0.8], gain: g });
  plate(0.005, 1);
  plate(0.09 + rng.range(0, 0.03), 0.6);
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + i * rng.range(0.03, 0.06);
    impact(out, sr, rng, { t, modes: [2600 + rng.range(0, 900), 0.12, 0.05, 5200 + rng.range(0, 1200), 0.07, 0.03], noise: 0.05, noiseTau: 0.002, noiseBp: [6000, 1] });
  }
  highpass(out, 100, sr);
  return out;
}

// ---------------------------------------------------------------------------
// the donkey and the mule

function donkeyAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 2 + rng.int(2);
  const out = alloc(0.3 + n * 0.85, sr);
  brayInto(out, c, 0.01, n, rng.range(190, 230));
  highpass(out, 80, sr);
  return out;
}

function donkeyAngry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  snortInto(out, c, 0, 0.25, 0.7);
  brayInto(out, c, 0.2, 2 + rng.int(2), rng.range(230, 260), 1);
  highpass(out, 80, sr);
  return out;
}

/** hurt: one strained "hee" and a short "haw" */
function donkeyHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  const f = rng.range(210, 250);
  layer(out, 0.6, (b) => heeInto(b, c, 0, 0.2, f * 3, 0.8));
  layer(out, 0.8, (b) => hawInto(b, c, 0.17, 0.3, f * 1.1, 0.7));
  highpass(out, 100, sr);
  return out;
}

/** death: the bray running down, the last breath rasping out */
function donkeyDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.1, sr);
  const f = rng.range(200, 230);
  const t = brayInto(out, c, 0, 1, f, 0.6);
  layer(out, 0.8, (b) => hawInto(b, c, t, 0.8, f * 0.8, 0.8));
  layer(out, 0.35, (b) => heeInto(b, c, t + 0.75, 0.35, f * 2.2, 1));
  highpass(out, 70, sr);
  return out;
}

/** the mule: a horse's whinny breaking into a donkey's bray */
function muleAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.7);
  const out = alloc(d + 2, sr);
  layer(out, 0.8, (b) => whinnyInto(b, c, 0, d, rng.range(850, 1000), 0.3, 0.45));
  brayInto(out, c, d * 0.85, 1 + rng.int(2), rng.range(170, 200), 0.3);
  highpass(out, 80, sr);
  return out;
}

function muleAngry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  snortInto(out, c, 0, 0.25, 0.8);
  const d = rng.range(0.4, 0.55);
  layer(out, 1, (b) => whinnyInto(b, c, 0.2, d, rng.range(1000, 1150), 0.55, 0.45));
  brayInto(out, c, 0.2 + d * 0.85, 2, rng.range(200, 225), 0.9);
  highpass(out, 80, sr);
  return out;
}

function muleHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => whinnyInto(b, c, 0, 0.26, rng.range(950, 1150), 0.6, 0.35));
  layer(out, 0.7, (b) => hawInto(b, c, 0.2, 0.28, rng.range(210, 240), 0.7));
  highpass(out, 100, sr);
  return out;
}

function muleDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  const d = rng.range(0.8, 1);
  layer(out, 1, (b) => whinnyInto(b, c, 0, d, rng.range(900, 1000), 0.45, 0.7));
  layer(out, 0.8, (b) => hawInto(b, c, d * 0.85, 0.8, rng.range(170, 190), 0.8));
  highpass(out, 70, sr);
  return out;
}

/** `base`: the sounds so far, for the chicken's plop */
export function horseSounds(base: Record<string, SoundGen>): Record<string, SoundGen> {
  const eat = sound('entity.horse.eat', 5, horseEat);
  const jump = sound('entity.horse.jump', 1, horseJump);
  const plop = base['entity.chicken.egg'];
  return {
    'entity.horse.ambient': sound('entity.horse.ambient', 3, horseAmbient),
    'entity.horse.angry': sound('entity.horse.angry', 2, horseAngry),
    'entity.horse.hurt': sound('entity.horse.hurt', 4, horseHurt),
    'entity.horse.death': sound('entity.horse.death', 1, horseDeath),
    'entity.horse.breathe': sound('entity.horse.breathe', 3, horseBreathe),
    'entity.horse.eat': eat,
    'entity.horse.step': sound('entity.horse.step', 6, horseStep),
    'entity.horse.step_wood': sound('entity.horse.step_wood', 6, horseStepWood),
    'entity.horse.gallop': sound('entity.horse.gallop', 4, horseGallop),
    'entity.horse.jump': jump,
    'entity.horse.land': sound('entity.horse.land', 1, horseLand),
    'entity.horse.saddle': sound('entity.horse.saddle', 1, horseSaddle),
    'entity.horse.armor': sound('entity.horse.armor', 1, horseArmor),
    'entity.donkey.ambient': sound('entity.donkey.ambient', 3, donkeyAmbient),
    'entity.donkey.angry': sound('entity.donkey.angry', 2, donkeyAngry),
    'entity.donkey.hurt': sound('entity.donkey.hurt', 3, donkeyHurt),
    'entity.donkey.death': sound('entity.donkey.death', 1, donkeyDeath),
    'entity.donkey.eat': eat,
    'entity.donkey.jump': jump,
    'entity.mule.ambient': sound('entity.mule.ambient', 3, muleAmbient),
    'entity.mule.angry': sound('entity.mule.angry', 1, muleAngry),
    'entity.mule.hurt': sound('entity.mule.hurt', 3, muleHurt),
    'entity.mule.death': sound('entity.mule.death', 1, muleDeath),
    'entity.mule.eat': eat,
    'entity.mule.jump': jump,
    ...(plop ? { 'entity.donkey.chest': plop, 'entity.mule.chest': plop } : {}),
  };
}
