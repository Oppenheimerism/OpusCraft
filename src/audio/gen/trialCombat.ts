// (trial chambers) The 1.21 combat sounds: the breeze's (vanilla entity.breeze.*; its wind burst is in brewing.ts) and
// the wind charge's (entity.wind_charge.throw and wind_burst). All air: the breeze idles in a hollow, wavering whistle
// over a swirl of wind (lower and rushing on the ground, higher and fluting aloft), whirls, slides in a rush with a
// hiss of grit, breathes in rising before it fires or leaps, spits its charge in a sharp puff, leaps with a whoosh and
// lands with a soft thump of air and dust; a projectile turned off it whips away with a high chirp; hurt, it yelps in
// a hollow whistle with a knock of its blocky head; dying, its whistle and its wind wind down together. A thrown wind
// charge whooshes, and bursts with a pop and a gust that tears away (lighter than the breeze's own).
// The bogged's (entity.bogged.*): the skeleton's rattle and knock, but damp, the bones muffled in moss, with a squelch
// and a drip or two; shorn, the shears snip and the mushrooms come away with a soft pluck.
// The mace's (item.mace.smash_*): a heavy swing ending in a blunt, ringing blow on something in the air; on something
// standing, a deep thud, the clang of the head and grit and stones thrown up; from high up, a boom that rumbles on.

import type { SoundGen } from '../synth';
import { alloc, addOsc, envAD, envBump, layer, onePoleLP, TAU } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, phisem, sweep, thump } from './texture';
import { rattleInto, skeletonDeath, skeletonHurt, skeletonStep } from './mobs';

// ------------------------------------------------------------------ building blocks

/** a breathy tone: a sine along f(t), wavering a little, `amp` over it */
function tone(b: Float32Array, c: Ctx, t0: number, d: number, f: (t: number) => number, amp: (t: number) => number, vibDepth = 0.015): void {
  const { sr, rng } = c;
  const rate = rng.range(4, 7), ph = rng.range(0, TAU);
  addOsc(b, sr, t0, d, (t) => f(t) * (1 + vibDepth * Math.sin(TAU * rate * t + ph)), amp);
}

/** the breath of a whistle: noise tuned narrowly to f(t) */
function breath(b: Float32Array, c: Ctx, t0: number, d: number, f: (t: number) => number, amp: (t: number) => number, q = 9): void {
  sweep(b, c.sr, c.rng, { t: t0, dur: d, f, q, amp, color: 'pink' });
}

/** a swirl of wind: pink noise through a band that wanders, its level turning over and over like something spinning */
function swirl(b: Float32Array, c: Ctx, t0: number, d: number, lo: number, hi: number, spin: number, amp: (t: number) => number): void {
  const { rng } = c;
  const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU), wob = rng.range(0.6, 1.4);
  const mid = Math.sqrt(lo * hi), span = Math.log(hi / lo) / 2;
  sweep(b, c.sr, rng, {
    t: t0,
    dur: d,
    f: (t) => mid * Math.exp(span * Math.sin(TAU * wob * t + p1)),
    q: 1.6,
    amp: (t) => amp(t) * (0.65 + 0.35 * Math.sin(TAU * spin * t + p2)),
    color: 'pink',
  });
}

/** grit hissing along under a slide or a landing */
function grit(b: Float32Array, c: Ctx, t0: number, d: number, energy: (t: number) => number): void {
  phisem(b, c.sr, c.rng, { t: t0, dur: d, rate: 2400, energy, grain: 0.0009, heavy: 2.2, bands: [{ f: 3800, q: 1.4, g: 1, spread: 0.35 }, { f: 1700, q: 1.2, g: 0.5, spread: 0.3 }] });
}

// ------------------------------------------------------------------ the breeze

/** entity.breeze.idle_ground: a low, hollow whistle wavering over a rushing swirl */
function idleGround(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.1, 1.6);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(520, 700), glide = rng.range(-0.18, 0.22);
  const env = (t: number) => envBump(t, d * 0.3, d * 0.7);
  layer(out, 1, (b) => swirl(b, c, 0, d, 350, 1500, rng.range(3, 5), env));
  layer(out, 0.55, (b) => tone(b, c, 0, d, (t) => f0 * (1 + glide * Math.sin((Math.PI * t) / d)), (t) => env(t), 0.02));
  layer(out, 0.4, (b) => breath(b, c, 0, d, (t) => f0 * 2 * (1 + glide * Math.sin((Math.PI * t) / d)), env));
  return out;
}

/** entity.breeze.idle_air: higher, fluting and gliding, the wind thinner */
function idleAir(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.9, 1.4);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(900, 1250);
  const a = rng.range(0.15, 0.35) * (rng.chance(0.5) ? 1 : -1);
  const f = (t: number) => f0 * (1 + a * Math.sin((TAU * t) / d));
  const env = (t: number) => envBump(t, d * 0.25, d * 0.75);
  layer(out, 1, (b) => tone(b, c, 0, d, f, env, 0.03));
  layer(out, 0.6, (b) => breath(b, c, 0, d, f, env, 7));
  layer(out, 0.5, (b) => swirl(b, c, 0, d, 900, 3200, rng.range(4, 7), env));
  return out;
}

/** entity.breeze.whirl: a quick spinning rush */
function whirl(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.6, 0.9);
  const out = alloc(d + 0.05, sr);
  const env = (t: number) => envBump(t, d * 0.35, d * 0.65);
  layer(out, 1, (b) => swirl(b, c, 0, d, 500, 2600, rng.range(7, 11), env));
  layer(out, 0.3, (b) => breath(b, c, 0, d, (t) => rng.range(0.95, 1.05) * (1400 + 500 * Math.sin((TAU * t) / d)), env, 5));
  return out;
}

/** entity.breeze.slide: a rush along the ground, swelling and falling away, grit hissing under it */
function slide(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.7);
  const out = alloc(d + 0.05, sr);
  const peak = rng.range(1400, 1900);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => 300 + peak * Math.sin((Math.PI * Math.min(1, t / d)) ** 0.8), q: 1.3, amp: (t) => envAD(t, d * 0.3, d * 0.3), color: 'pink' }),
  );
  layer(out, 0.35, (b) => grit(b, c, 0, d, (t) => envBump(t, d * 0.3, d * 0.6)));
  return out;
}

/** a breath in: noise rising in pitch and loudness, a thin whistle rising in it, cut off at the top */
function inhaleLayers(out: Float32Array, c: Ctx, d: number, lo: number, hi: number, whistle: number): void {
  const { sr, rng } = c;
  const up = (t: number) => lo * Math.pow(hi / lo, Math.min(1, t / d));
  const env = (t: number) => (t < d ? Math.pow(t / d, 1.6) * (t > d - 0.03 ? (d - t) / 0.03 : 1) : 0);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: up, q: 1.8, amp: env, color: 'pink' }));
  const k = rng.range(0.9, 1.1);
  if (whistle > 0) layer(out, 0.3 * whistle, (b) => tone(b, c, 0, d, (t) => up(t) * 1.5 * k, env, 0.01));
}

/** entity.breeze.inhale: the quick breath before it fires */
function inhale(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.7);
  const out = alloc(d + 0.05, sr);
  inhaleLayers(out, c, d, 350, 2600, 1);
  return out;
}

/** entity.breeze.charge: the deeper, longer breath before it leaps */
function charge(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.6, 0.8);
  const out = alloc(d + 0.05, sr);
  inhaleLayers(out, c, d, 180, 1500, 1.4);
  layer(out, 0.35, (b) => swirl(b, c, 0, d, 200, 900, 6, (t) => Math.min(1, t / d)));
  return out;
}

/** entity.breeze.shoot: a sharp spit of air, a thump in it and a short whip after */
function shoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  layer(out, 0.8, (b) => thump(b, sr, { f0: rng.range(170, 210), f1: 70, tau: 0.045 }));
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.25, attack: 0.002, tau: 0.045, bp: [rng.range(1300, 1800), 0.9] }));
  layer(out, 0.6, (b) => sweep(b, sr, rng, { t: 0.01, dur: 0.3, f: (t) => 2800 * Math.exp(-t / 0.09) + 400, q: 2, amp: (t) => envAD(t, 0.008, 0.07), color: 'pink' }));
  return out;
}

/** entity.breeze.jump: a gust bursting up, a whistle climbing in it */
function jump(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.6);
  const out = alloc(d + 0.05, sr);
  layer(out, 0.7, (b) => thump(b, sr, { f0: rng.range(120, 150), f1: 60, tau: 0.06 }));
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 250 * Math.pow(9, Math.min(1, t / (d * 0.7))), q: 1.4, amp: (t) => envAD(t, 0.03, d * 0.35), color: 'pink' }));
  layer(out, 0.4, (b) => tone(b, c, 0, d, (t) => 500 * Math.pow(3, t / d), (t) => envAD(t, 0.05, d * 0.3), 0.01));
  return out;
}

/** entity.breeze.land: a soft thump of air and a puff of dust */
function land(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(100, 125), f1: 55, tau: 0.07 }));
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.4, attack: 0.004, tau: 0.09, lp: 900, color: 'brown' }));
  layer(out, 0.35, (b) => grit(b, c, 0.01, 0.3, (t) => Math.exp(-t / 0.08)));
  return out;
}

/** entity.breeze.deflect: a whip of wind turning back, with a high chirp as it goes */
function deflect(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const f0 = rng.range(2600, 3300);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.25, f: (t) => f0 * Math.exp(-t / 0.08) + 500, q: 2.5, amp: (t) => envAD(t, 0.006, 0.06), color: 'pink' }));
  layer(out, 0.5, (b) => tone(b, c, 0.01, 0.15, (t) => f0 * 0.9 * Math.exp(-t / 0.12), (t) => envAD(t, 0.004, 0.04), 0));
  return out;
}

/** entity.breeze.hurt: a hollow whistled yelp, jumping up and falling, and a knock of its blocky head */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.28, 0.38);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(1100, 1500);
  const f = (t: number) => f0 * (t < 0.04 ? 0.8 + 0.2 * (t / 0.04) : Math.exp(-(t - 0.04) / (d * 0.9)));
  layer(out, 1, (b) => tone(b, c, 0, d, f, (t) => envAD(t, 0.015, d * 0.4), 0.025));
  layer(out, 0.55, (b) => breath(b, c, 0, d, (t) => f(t) * 2, (t) => envAD(t, 0.01, d * 0.35), 6));
  const k = rng.range(420, 560);
  layer(out, 0.45, (b) => impact(b, sr, rng, { modes: [k, 1, 0.05, k * 2.3, 0.4, 0.03, k * 3.9, 0.2, 0.02], noise: 0.6, noiseTau: 0.003, noiseBp: [1500, 0.8] }));
  return out;
}

/** entity.breeze.death: its whistle and its wind winding down together, and a last puff */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.3, 1.6);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(1100, 1300);
  const down = (t: number) => f0 * Math.pow(0.18, Math.min(1, t / d));
  const env = (t: number) => envAD(t, 0.03, d * 0.45);
  layer(out, 1, (b) => tone(b, c, 0, d, (t) => down(t) * (1 + 0.04 * Math.sin(TAU * (6 - 4 * (t / d)) * t)), env, 0.01));
  layer(out, 0.7, (b) => swirl(b, c, 0, d, 200, 1800, 5, env));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: d * 0.8, dur: 0.35, attack: 0.01, tau: 0.08, lp: 700, color: 'brown' }));
  return out;
}

// ------------------------------------------------------------------ the wind charge

/** entity.wind_charge.throw: a quick whoosh */
function windThrow(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.25, 0.35);
  const out = alloc(d + 0.05, sr);
  const top = rng.range(2000, 2800);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 450 + top * Math.sin(Math.PI * Math.min(1, t / d)), q: 1.5, amp: (t) => envBump(t, d * 0.35, d * 0.65), color: 'pink' }));
  return out;
}

/** entity.wind_charge.wind_burst: a pop, and a gust tearing away (smaller than the breeze's) */
function windChargeBurst(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.6);
  const out = alloc(d + 0.08, sr);
  layer(out, 0.75, (b) => thump(b, sr, { t: 0.002, f0: rng.range(150, 180), f1: 70, tau: 0.045 }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.05, attack: 0.001, tau: 0.008, hp: 1500 }));
  const f0 = rng.range(2000, 2600);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 300 + f0 * Math.exp(-t / (d * 0.3)), q: (t) => 1.3 + 1.5 * (t / d), amp: (t) => envAD(t, 0.008, d * 0.25), color: 'pink' }));
  return out;
}

// ------------------------------------------------------------------ the bogged

/** a wet squelch: a muffled gulp of noise, its band sliding from f0 to f1 */
function squelch(b: Float32Array, c: Ctx, t0: number, d: number, f0: number, f1: number): void {
  sweep(b, c.sr, c.rng, { t: t0, dur: d, f: (t) => f0 * Math.pow(f1 / f0, t / d), q: 3.2, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' });
}

/** drips in the moss */
function drips(b: Float32Array, c: Ctx, t0: number, d: number, n: number): void {
  for (let k = 0; k < n; k++) bubble(b, c.sr, t0 + c.rng.range(0, d), c.rng.range(550, 1400), c.rng.range(0.5, 1));
}

/** the skeleton's own sound (from mobs.ts) muffled, as if through wet moss: its highs taken off */
function damp(b: Float32Array, c: Ctx, src: (c: Ctx) => Float32Array, lp: number): void {
  const x = onePoleLP(src(c), lp, c.sr);
  for (let i = 0; i < b.length && i < x.length; i++) b[i] += x[i];
}

/** entity.bogged.ambient: a slow, damp rattle, a squelch and a drip */
function boggedAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.95, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    let t = 0;
    for (let k = 0; k < n; k++) {
      const d = rng.range(0.1, 0.2);
      rattleInto(b, c, t, d, rng.range(45, 90));
      t += d + rng.range(0.05, 0.12);
    }
    onePoleLP(b, 2600, sr);
  });
  layer(out, 0.5, (b) => squelch(b, c, rng.range(0.05, 0.25), rng.range(0.22, 0.36), rng.range(750, 1050), rng.range(240, 360)));
  layer(out, 0.3, (b) => drips(b, c, 0.15, 0.6, 1 + rng.int(3)));
  return out;
}

/** entity.bogged.hurt: the skeleton's knock and rattle, dulled, and a squelch */
function boggedHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => damp(b, c, skeletonHurt, 3000));
  layer(out, 0.55, (b) => squelch(b, c, 0.01, rng.range(0.15, 0.22), rng.range(900, 1200), rng.range(280, 380)));
  return out;
}

/** entity.bogged.death: the bones falling apart, muffled, and a wet slump */
function boggedDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.3, sr);
  layer(out, 1, (b) => damp(b, c, skeletonDeath, 2600));
  layer(out, 0.55, (b) => squelch(b, c, rng.range(0.25, 0.4), rng.range(0.35, 0.5), rng.range(600, 800), rng.range(150, 220)));
  layer(out, 0.3, (b) => drips(b, c, 0.4, 0.8, 3 + rng.int(3)));
  return out;
}

/** entity.bogged.step: the skeleton's step, softer, with a squish */
function boggedStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) => damp(b, c, skeletonStep, 3200));
  layer(out, 0.45, (b) => squelch(b, c, 0, rng.range(0.1, 0.16), rng.range(1100, 1500), rng.range(350, 500)));
  return out;
}

/** entity.bogged.shear: the shears' snip-snip, and the mushrooms coming away */
function boggedShear(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const snip = (b: Float32Array, t: number, a: number) =>
    impact(b, sr, rng, {
      t,
      modes: [rng.range(3000, 3400), a, 0.03, rng.range(4600, 5000), 0.7 * a, 0.025, rng.range(6700, 7200), 0.4 * a, 0.02],
      noise: 1.3 * a,
      noiseTau: 0.006,
      noiseBp: [5000, 1.5],
    });
  layer(out, 1, (b) => {
    snip(b, 0, 1);
    snip(b, rng.range(0.1, 0.14), 0.85);
  });
  layer(out, 0.4, (b) => squelch(b, c, rng.range(0.16, 0.2), 0.14, rng.range(1300, 1700), rng.range(500, 650)));
  return out;
}

// ------------------------------------------------------------------ the mace

/** the head of the mace ringing as it strikes: a heavy, dull clang */
function clang(b: Float32Array, c: Ctx, t: number, f: number, ring: number): void {
  impact(b, c.sr, c.rng, { t, modes: [f, 1, 0.12 * ring, f * 2.63, 0.55, 0.08 * ring, f * 4.7, 0.3, 0.05 * ring, f * 7.1, 0.15, 0.03 * ring], noise: 0.9, noiseTau: 0.004, noiseBp: [2200, 0.9] });
}

/** item.mace.smash_air: a heavy swing ending in a blunt, ringing blow */
function smashAir(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  const hit = 0.07;
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: hit + 0.05, f: (t) => 2200 - 1600 * (t / (hit + 0.05)), q: 1.4, amp: (t) => envBump(t, hit * 0.8, 0.05), color: 'pink' }));
  layer(out, 1, (b) => thump(b, sr, { t: hit, f0: rng.range(120, 140), f1: 50, tau: 0.08, h2: 0.3 }));
  layer(out, 0.6, (b) => clang(b, c, hit, rng.range(380, 460), 1));
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: hit, dur: 0.25, attack: 0.002, tau: 0.05, lp: 1400, color: 'brown' }));
  return out;
}

/** item.mace.smash_ground: a deep thud into the ground, the clang of the head, and grit and stones thrown up */
function smashGround(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.0, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(95, 115), f1: 38, tau: 0.13, h2: 0.25 }));
  layer(out, 0.55, (b) => clang(b, c, 0.003, rng.range(320, 400), 1.2));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.4, attack: 0.002, tau: 0.08, lp: 900, color: 'brown' }));
  layer(out, 0.45, (b) =>
    phisem(b, sr, rng, { t: 0.02, dur: 0.8, rate: 900, energy: (t) => Math.exp(-t / 0.18), grain: 0.0025, heavy: 2, bands: [{ f: 1100, q: 1.3, g: 1, spread: 0.4 }, { f: 2600, q: 1.6, g: 0.5, spread: 0.3 }] }),
  );
  return out;
}

/** item.mace.smash_ground_heavy: from high up, a boom that rumbles on, the head ringing lower, and more of the ground thrown up */
function smashGroundHeavy(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.6, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(75, 90), f1: 28, tau: 0.22, h2: 0.3, dur: 1.2 }));
  layer(out, 0.5, (b) => clang(b, c, 0.003, rng.range(250, 300), 1.6));
  layer(out, 0.65, (b) => burst(b, sr, rng, { dur: 1.2, attack: 0.004, tau: 0.3, lp: 380, color: 'brown' }));
  layer(out, 0.5, (b) =>
    phisem(b, sr, rng, { t: 0.02, dur: 1.4, rate: 1400, energy: (t) => Math.exp(-t / 0.35), grain: 0.003, heavy: 2.2, bands: [{ f: 900, q: 1.2, g: 1, spread: 0.45 }, { f: 2200, q: 1.5, g: 0.6, spread: 0.35 }] }),
  );
  return out;
}

export function trialCombatSounds(): Record<string, SoundGen> {
  return {
    'entity.breeze.idle_ground': sound('entity.breeze.idle_ground', 4, idleGround),
    'entity.breeze.idle_air': sound('entity.breeze.idle_air', 4, idleAir),
    'entity.breeze.whirl': sound('entity.breeze.whirl', 3, whirl),
    'entity.breeze.slide': sound('entity.breeze.slide', 3, slide),
    'entity.breeze.inhale': sound('entity.breeze.inhale', 2, inhale),
    'entity.breeze.charge': sound('entity.breeze.charge', 2, charge),
    'entity.breeze.shoot': sound('entity.breeze.shoot', 3, shoot),
    'entity.breeze.jump': sound('entity.breeze.jump', 2, jump),
    'entity.breeze.land': sound('entity.breeze.land', 3, land),
    'entity.breeze.deflect': sound('entity.breeze.deflect', 3, deflect),
    'entity.breeze.hurt': sound('entity.breeze.hurt', 4, hurt),
    'entity.breeze.death': sound('entity.breeze.death', 2, death),
    'entity.wind_charge.throw': sound('entity.wind_charge.throw', 3, windThrow),
    'entity.wind_charge.wind_burst': sound('entity.wind_charge.wind_burst', 3, windChargeBurst),
    'entity.bogged.ambient': sound('entity.bogged.ambient', 4, boggedAmbient),
    'entity.bogged.hurt': sound('entity.bogged.hurt', 4, boggedHurt),
    'entity.bogged.death': sound('entity.bogged.death', 2, boggedDeath),
    'entity.bogged.step': sound('entity.bogged.step', 4, boggedStep),
    'entity.bogged.shear': sound('entity.bogged.shear', 1, boggedShear),
    'item.mace.smash_air': sound('item.mace.smash_air', 3, smashAir),
    'item.mace.smash_ground': sound('item.mace.smash_ground', 4, smashGround),
    'item.mace.smash_ground_heavy': sound('item.mace.smash_ground_heavy', 1, smashGroundHeavy),
  };
}
