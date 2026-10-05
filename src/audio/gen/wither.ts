// The wither (vanilla sounds.json entity.wither.*): three charred skulls on a spine of black bone, one vast, hollow
// throat between them. Idle, it groans: a deep, rattling breath of a growl dragged up out of its ribs, the three
// heads grinding a little off one another's note, a rasp of breath torn through it, a hollow ring to it as if
// through a pipe of bone, and a thin wind wailing round it like a ghost (ambient). Hurt, a sharp, harsh snarl jolts
// out of it, rattling (hurt). Dying, it roars, climbing in agony and straining higher, then the roar breaks and
// collapses, the rattle in its throat slowing, and sinks away into a long rumble and a last breath (death). Firing a
// skull: a short, deep, explosive whoomp, a blast of breath with a hollow roar after it (shoot). Bursting into life
// (heard by everyone in the world at once): a huge explosion with a monstrous roar torn out of it, climbing and then
// falling, and a long rumbling tail (spawn). Its breaking blocks (entity.wither.break_block) is vanilla's zombie
// wooden-door break (mob/zombie/woodbreak), not one of these. Every take starts at once (no lead-in of near silence).
// Takes: ambient 4, hurt 4, death 1, shoot 1, spawn 1.

import type { SoundGen } from '../synth';
import { TAU, type Rng, SVF, alloc, brown, envAD, envExpPts, envPts, highpass, layer, lowpass, mixInto, peakOf, smooth, softClip } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, sweep, thump } from './texture';
import { type Formant, voice } from './voice';
import { reverbHalf } from './world';

/** its throat: huge, dark and hollow; `open` 0..1 over 0..1 of `d` (wider, brighter); `size` above 1 a smaller head's */
function throat(open: (x: number) => number, d: number, size = 1, bright = 0): Formant[] {
  const o = (t: number) => open(t / d);
  return [
    // (the chest: it keeps the low of the voice)
    { f: (t) => (125 + 45 * o(t)) * size, bw: 110, g: 0.75 },
    { f: (t) => (280 + 240 * o(t)) * size, bw: 140, g: 1 },
    { f: (t) => (660 + 360 * o(t)) * size, bw: 200, g: (t) => 0.45 + 0.25 * o(t) + bright },
    { f: (t) => (1700 + 400 * o(t)) * size, bw: 340, g: (t) => 0.08 + 0.14 * o(t) + bright },
    { f: 2700 * size, bw: 520, g: (t) => 0.03 + 0.05 * o(t) + bright * 0.5 },
  ];
}

interface Head {
  /** start (s) */
  t?: number;
  /** length (s) */
  d: number;
  /** pitch (Hz) over 0..1 of it */
  f0: (x: number) => number;
  /** level over 0..1 of it */
  amp: (x: number) => number;
  /** how open the jaws are over 0..1 of it */
  open: (x: number) => number;
  rough?: number;
  breath?: number;
  bright?: number;
  /** formant scale (a smaller head's above 1) */
  size?: number;
  /** how much of it is voice (0: only breath through the throat, fluttering with the folds) */
  voiced?: number;
  gain?: number;
}

/** one head's voice: a rough, period-doubled growl through the hollow throat */
function head(b: Float32Array, c: Ctx, h: Head): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t: h.t ?? 0,
    dur: h.d,
    f0: (t) => h.f0(t / h.d),
    amp: (t) => h.amp(t / h.d),
    formants: throat(h.open, h.d, h.size ?? 1, h.bright ?? 0),
    oq: 0.42,
    jitter: 0.06,
    shimmer: 0.25,
    rough: h.rough ?? 0.6,
    sub: 0.25,
    breath: h.breath ?? 0.5,
    growl: [rng.range(17, 27), 0.5],
    vib: [rng.range(4, 6), 0.015],
    voiced: h.voiced ?? 1,
    gain: h.gain ?? 1,
  });
}

/** all three heads: the middle one, and the two smaller ones beside it a little off its note (a minor third over, a tone under) */
function heads(b: Float32Array, c: Ctx, h: Head, side = 0.45): void {
  const { rng } = c;
  head(b, c, h);
  for (const [k, size, g] of [[1.19, 1.12, side], [0.89, 1.06, side * 0.8]] as const) {
    const lag = rng.range(0.01, 0.04);
    const kk = k * rng.range(0.99, 1.01);
    head(b, c, { ...h, t: (h.t ?? 0) + lag, d: h.d - lag, f0: (x) => kk * h.f0(x), size: (h.size ?? 1) * size, gain: (h.gain ?? 1) * g });
  }
}

/** breath torn through the throat with the voice: hissing noise, its band following the jaws, fluttering */
function rasp(b: Float32Array, c: Ctx, t0: number, d: number, amp: (x: number) => number, open: (x: number) => number, flutter = 29): void {
  sweep(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f: (t) => 450 + 650 * open(t / d),
    q: 0.9,
    amp: (t) => amp(t / d) * (0.7 + 0.3 * Math.sin(TAU * flutter * t)),
    color: 'pink',
  });
}

/** the rattle in its throat: an uneven croak of clicks through the hollow of it, `rate` (Hz) and `amp` over 0..1 of `d` */
function rattle(b: Float32Array, c: Ctx, t0: number, d: number, rate: (x: number) => number, amp: (x: number) => number): void {
  creak(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    rate: (t) => rate(t / d),
    amp: (t) => amp(t / d),
    jitter: 0.35,
    bands: [
      { f: 380, q: 3, g: 1 },
      { f: 820, q: 4, g: 0.6 },
      { f: 1700, q: 4, g: 0.3 },
    ],
  });
}

/** a thin wind wailing round it like a ghost: noise through narrow bands wandering slowly about `f`, `amp` over 0..1 of `d` */
function ghost(b: Float32Array, c: Ctx, t0: number, d: number, f: (x: number) => number, amp: (x: number) => number): void {
  const { sr, rng } = c;
  const r1 = rng.range(0.6, 1.1), r2 = rng.range(1.7, 2.6), p1 = rng.next() * TAU, p2 = rng.next() * TAU;
  const wander = (t: number) => 1 + 0.1 * Math.sin(TAU * r1 * t + p1) + 0.05 * Math.sin(TAU * r2 * t + p2);
  sweep(b, sr, rng, { t: t0, dur: d, f: (t) => f(t / d) * wander(t), q: 10, amp: (t) => amp(t / d), color: 'pink' });
  sweep(b, sr, rng, { t: t0, dur: d, f: (t) => f(t / d) * 1.52 * wander(t * 1.3 + 0.4), q: 12, amp: (t) => 0.5 * amp(t / d), color: 'pink' });
}

/** a rumble under it, felt more than heard: brown noise kept under `fc`, `amp` over seconds from `t0` */
function rumble(b: Float32Array, c: Ctx, t0: number, d: number, fc: number, amp: (t: number) => number): void {
  const { sr, rng } = c;
  const s = Math.round(t0 * sr);
  const n = Math.min(b.length - s, Math.round(d * sr));
  if (n <= 0) return;
  const r = brown(n, rng, 0.998);
  lowpass(r, fc, sr);
  lowpass(r, fc, sr);
  for (let i = 0; i < n; i++) b[s + i] += r[i] * amp(i / sr);
}

/**
 * the hollow of its ribs and skulls: a closed pipe (the odd harmonics of `f`) ringing lightly with all that goes through
 * it, its high end damped (above `damp`) so only the body of the sound rings
 */
function hollow(x: Float32Array, sr: number, rng: Rng, f: number, fb: number, damp = 900): Float32Array {
  const D0 = sr / (2 * f);
  const L = Math.ceil(D0 * 1.06) + 4;
  const line = new Float32Array(L);
  const out = new Float32Array(x.length);
  const a = 1 - Math.exp((-TAU * damp) / sr);
  const r = rng.range(0.4, 0.8), p = rng.next() * TAU;
  let w = 0, lp = 0, D = D0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) D = D0 * (1 + 0.03 * Math.sin(TAU * r * (i / sr) + p));
    let rp = w - D;
    if (rp < 0) rp += L;
    const k = rp | 0;
    const y = line[k] + (line[k + 1 === L ? 0 : k + 1] - line[k]) * (rp - k);
    lp += a * (y - lp);
    const v = x[i] - fb * lp;
    line[w] = v;
    out[i] = v;
    if (++w === L) w = 0;
  }
  return out;
}

/** the open air round it: a big, dark tail */
function air(buf: Float32Array, sr: number, t60: number, wet: number, tail: number): Float32Array {
  highpass(buf, 30, sr);
  return reverbHalf(buf, sr, { t60, wet, dry: 0.9, size: 2, pre: 0.03, hf: 0.3, lowcut: 100, tail });
}

/** render `fill` into a fresh buffer and add it to `b` with its peak at `k` times the peak `b` has now */
function under(b: Float32Array, k: number, fill: (x: Float32Array) => void): void {
  const x = new Float32Array(b.length);
  fill(x);
  const px = peakOf(x);
  if (px > 1e-12) mixInto(b, x, 0, (k * peakOf(b)) / px);
}

/** render `fill` into a buffer as long as `out`, ring it through the hollow of it, and add it to `out` at `peak` */
function hollowLayer(out: Float32Array, c: Ctx, peak: number, f: number, fb: number, fill: (b: Float32Array) => void): void {
  layer(out, peak, (b) => {
    fill(b);
    b.set(hollow(b, c.sr, c.rng, f, fb));
  });
}

// ------------------------------------------------------------------ the voice

/** vanilla entity.wither.ambient: a deep, hollow, rattling groan, four different breaths of it */
function ambient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(46, 54);
  let len: number;
  let g: Head;
  // (each starts at once: the breath already moving)
  switch (v) {
    case 0: // a long breath of a groan that swells and sinks
      g = { d: 1.3, f0: (x) => base * envExpPts(x, [0, 0.92, 0.35, 1.12, 1, 0.8]), amp: (x) => envPts(x, [0, 0.5, 0.02, 0.75, 0.35, 1, 0.75, 0.7, 1, 0]), open: (x) => envPts(x, [0, 0.3, 0.4, 0.7, 1, 0.15]) };
      len = 1.35;
      break;
    case 1: // a rattling breath in, then the groan let out
      g = { t: 0.3, d: 1.0, f0: (x) => base * 1.05 * envExpPts(x, [0, 1.1, 0.3, 1.05, 1, 0.78]), amp: (x) => envPts(x, [0, 0.35, 0.08, 1, 0.6, 0.8, 1, 0]), open: (x) => envPts(x, [0, 0.6, 0.3, 0.8, 1, 0.2]) };
      len = 1.35;
      break;
    case 2: // a low, grinding growl, barely opening, the rattle heavy in it
      g = { d: 1.2, f0: (x) => base * 0.86 * (1 + 0.06 * Math.sin(TAU * 1.6 * x)), amp: (x) => envPts(x, [0, 0.55, 0.03, 0.85, 0.5, 1, 0.85, 0.75, 1, 0]), open: (x) => 0.15 + 0.15 * Math.sin(Math.PI * x), rough: 0.75 };
      len = 1.25;
      break;
    default: // a groan rising as if asking, and a rattling breath let out after it
      g = { d: 1.05, f0: (x) => base * envExpPts(x, [0, 0.85, 0.65, 1.3, 1, 1.15]), amp: (x) => envPts(x, [0, 0.5, 0.03, 0.75, 0.6, 1, 0.85, 0.8, 1, 0]), open: (x) => envPts(x, [0, 0.25, 0.65, 0.9, 1, 0.5]) };
      len = 1.45;
  }
  const t0 = g.t ?? 0;
  const out = alloc(len, sr);
  hollowLayer(out, c, 1, rng.range(118, 136), 0.35, (b) => {
    heads(b, c, g);
    // (the breath of it through the same throat, fluttering with the voice)
    under(b, 0.45, (x) => head(x, c, { ...g, voiced: 0, breath: 1 }));
    under(b, 0.3, (x) => rasp(x, c, t0, g.d, g.amp, g.open));
    under(b, v === 2 ? 0.45 : 0.28, (x) => rattle(x, c, t0, g.d, (u) => 26 - 8 * u, g.amp));
    if (v === 1)
      under(b, 0.8, (x) => {
        // (the breath in: a hiss climbing, the rattle already in it)
        sweep(x, sr, rng, { dur: 0.4, f: (t) => 500 + 1100 * (t / 0.4), q: 1.2, amp: (t) => envPts(t, [0, 0.7, 0.02, 0.85, 0.28, 1, 0.4, 0]), color: 'pink' });
        under(x, 0.6, (y) => rattle(y, c, 0, 0.38, () => 30, (u) => envPts(u, [0, 0.6, 0.7, 1, 1, 0])));
      });
    if (v === 3)
      under(b, 0.45, (x) => {
        // (the breath let out: a falling hiss, the rattle slowing)
        sweep(x, sr, rng, { t: 0.9, dur: 0.55, f: (t) => 1000 - 550 * (t / 0.55), q: 1, amp: (t) => envPts(t, [0, 0, 0.1, 1, 0.55, 0]), color: 'pink' });
        under(x, 0.7, (y) => rattle(y, c, 0.9, 0.5, (u) => 22 - 12 * u, (u) => envPts(u, [0, 0, 0.2, 1, 1, 0])));
      });
  });
  layer(out, 0.2, (b) => ghost(b, c, 0, len, (x) => 900 - 150 * x, (x) => envPts(x, [0, 0.5, 0.4, 1, 1, 0.3])));
  layer(out, 0.4, (b) => rumble(b, c, 0, len, 110, (t) => envPts(t, [0, 0.7, len * 0.4, 1, len, 0])));
  return air(out, sr, 1.5, 0.5, 0.4);
}

/** vanilla entity.wither.hurt: a sharp, pained, harsh snarl with a rattle, four different shapes */
function hurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(88, 100) * [1, 1.08, 0.96, 0.82][v];
  const snarls: Head[] = [];
  const sharp = (x: number) => envPts(x, [0, 0.75, 0.04, 1, 0.4, 0.75, 1, 0]);
  switch (v) {
    case 0: // snaps up, and falls away
      snarls.push({ d: 0.5, f0: (x) => base * envExpPts(x, [0, 1.15, 0.12, 1.5, 0.5, 1.05, 1, 0.7]), amp: sharp, open: (x) => envPts(x, [0, 0.7, 0.15, 1, 1, 0.35]) });
      break;
    case 1: // a short bark, and a longer snarl on its heels
      snarls.push({ d: 0.22, f0: (x) => base * envExpPts(x, [0, 1.3, 0.3, 1.45, 1, 1.0]), amp: sharp, open: (x) => envPts(x, [0, 0.8, 0.3, 1, 1, 0.5]) });
      snarls.push({ t: 0.2, d: 0.42, f0: (x) => base * envExpPts(x, [0, 1.2, 0.2, 1.4, 1, 0.75]), amp: (x) => envPts(x, [0, 0.3, 0.06, 1, 0.45, 0.7, 1, 0]), open: (x) => envPts(x, [0, 0.8, 0.2, 1, 1, 0.3]) });
      break;
    case 2: // a yelp that chokes off into the rattle
      snarls.push({ d: 0.36, f0: (x) => base * envExpPts(x, [0, 1.25, 0.1, 1.6, 1, 0.9]), amp: (x) => envPts(x, [0, 0.8, 0.03, 1, 0.55, 0.7, 1, 0]), open: (x) => envPts(x, [0, 0.9, 0.1, 1, 1, 0.4]), rough: 0.7 });
      break;
    default: // a lower, longer snarl, hissing
      snarls.push({ d: 0.62, f0: (x) => base * envExpPts(x, [0, 1.1, 0.15, 1.4, 0.6, 1.15, 1, 0.75]), amp: (x) => envPts(x, [0, 0.7, 0.03, 1, 0.5, 0.8, 1, 0]), open: (x) => envPts(x, [0, 0.6, 0.2, 1, 1, 0.3]), breath: 0.7 });
  }
  const end = Math.max(...snarls.map((s) => (s.t ?? 0) + s.d));
  const len = end + (v === 2 ? 0.22 : 0.04);
  const out = alloc(len, sr);
  hollowLayer(out, c, 1, rng.range(130, 150), 0.3, (b) => {
    for (const s of snarls) heads(b, c, { ...s, bright: 0.15, rough: s.rough ?? 0.65 }, 0.5);
    under(b, 0.35, (x) => {
      for (const s of snarls) rasp(x, c, s.t ?? 0, s.d, s.amp, s.open, 37);
    });
    under(b, v === 2 ? 0.45 : 0.25, (x) => rattle(x, c, 0, len, (u) => 42 - 20 * u, (u) => (v === 2 ? envPts(u, [0, 0.4, 0.5, 0.7, 0.7, 1, 1, 0]) : envPts(u, [0, 1, 0.7, 0.6, 1, 0]))));
  });
  // (the bark of it: a burst of breath at the very start)
  layer(out, 0.4, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.002, tau: 0.035, bp: [900, 0.7] }));
  layer(out, 0.3, (b) => rumble(b, c, 0, len, 130, (t) => envAD(t, 0.01, 0.22)));
  return air(softClip(out, 1.3), sr, 1, 0.32, 0.25);
}

/** vanilla entity.wither.death: a long, agonised roar climbing and straining, then breaking and collapsing, sinking into rumble */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(60, 65);
  const D = 5.3;
  const out = alloc(D, sr);
  // the roar climbing in agony, straining higher and wider
  const dA = 2.5;
  const f0A = (x: number) => base * envExpPts(x, [0, 0.95, 0.25, 1.15, 0.6, 1.6, 0.85, 1.9, 1, 1.85]);
  const ampA = (x: number) => envPts(x, [0, 0.3, 0.01, 0.38, 0.25, 0.5, 0.55, 0.78, 0.85, 1, 1, 0.9]);
  const openA = (x: number) => envPts(x, [0, 0.3, 0.7, 1, 1, 1]);
  // then breaking: falling steeply, rougher, sobbing, the breath taking over
  const tB = 2.25, dB = 1.9;
  const f0B = (x: number) => base * envExpPts(x, [0, 1.85, 0.12, 1.7, 0.5, 0.95, 1, 0.5]);
  const ampB = (x: number) => envPts(x, [0, 0, 0.1, 1, 0.3, 0.8, 0.7, 0.35, 1, 0]) * (1 - 0.45 * smooth((x - 0.2) / 0.3) * (0.5 + 0.5 * Math.sin(TAU * 6.5 * dB * x)));
  const openB = (x: number) => envPts(x, [0, 1, 0.4, 0.5, 1, 0.1]);
  hollowLayer(out, c, 1, rng.range(112, 124), 0.35, (b) => {
    heads(b, c, { d: dA, f0: f0A, amp: ampA, open: openA, rough: 0.55, bright: 0.1 }, 0.5);
    heads(b, c, { t: tB, d: dB, f0: f0B, amp: ampB, open: openB, rough: 0.85, breath: 0.8 }, 0.4);
    under(b, 0.3, (x) => {
      rasp(x, c, 0, dA, ampA, openA, 33);
      rasp(x, c, tB, dB, ampB, openB, 24);
    });
    // the rattle in its throat, slowing to nothing
    under(b, 0.3, (x) => rattle(x, c, 0, D - 0.3, (u) => 32 * Math.pow(0.15, u), (u) => envPts(u, [0, 0.35, 0.4, 0.6, 0.6, 1, 0.85, 0.6, 1, 0])));
  });
  // the agony on top: a strained shriek riding over the roar as it climbs
  layer(out, 0.3, (b) => head(b, c, { t: 0.05, d: dA + 0.2, f0: (x) => 2.6 * f0A(x), amp: (x) => envPts(x, [0, 0.1, 0.3, 0.35, 0.7, 1, 0.9, 0.6, 1, 0]), open: () => 0.85, rough: 0.45, bright: 0.2, size: 1.25 }));
  // the last breath let out
  layer(out, 0.4, (b) => sweep(b, sr, rng, { t: 3.4, dur: 1.9, f: (t) => 950 * Math.pow(0.35, t / 1.9), q: 1, amp: (t) => envPts(t, [0, 0, 0.3, 1, 0.9, 0.7, 1.9, 0]), color: 'pink' }));
  layer(out, 0.16, (b) => ghost(b, c, 0, D, (x) => 950 - 400 * x, (x) => envPts(x, [0, 0.3, 0.15, 0.8, 0.5, 1, 1, 0])));
  // the ground of it: a rumble swelling as it collapses, and dying with it
  layer(out, 0.85, (b) => rumble(b, c, 0, D, 90, (t) => envPts(t, [0, 0.3, 1.2, 0.45, 2.6, 1, 3.6, 0.8, D, 0])));
  return air(softClip(out, 1.25), sr, 3.6, 0.55, 1.3);
}

/** vanilla entity.wither.shoot: a skull fired: a short, deep, explosive whoomp of breath and a hollow roar after it */
function shoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const len = 0.66;
  const out = alloc(len, sr);
  const base = rng.range(58, 64);
  // the push: a deep thump of moved air
  layer(out, 1, (b) => thump(b, sr, { f0: 125, f1: 40, glide: 0.05, tau: 0.12, attack: 0.004, h2: 0.3, dur: 0.6 }));
  // the blast of breath: a sharp puff, dark noise flaring and dying, and the air rushing off it
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.001, tau: 0.022, hp: 1200 }));
  layer(out, 0.8, (b) => burst(b, sr, rng, { dur: 0.55, attack: 0.004, tau: 0.09, lp: 1200, color: 'brown', env: (t) => 0.8 + 0.2 * Math.sin(TAU * 13 * t) }));
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: 0.5, f: (t) => envExpPts(t, [0, 300, 0.04, 1100, 0.45, 320]), q: 0.9, amp: (t) => envAD(t, 0.006, 0.1), color: 'pink' }));
  // the hollow roar after it
  const g: Head = { t: 0.005, d: 0.6, f0: (x) => base * envExpPts(x, [0, 1.3, 0.2, 1.1, 1, 0.7]), amp: (x) => envPts(x, [0, 0.7, 0.03, 1, 0.3, 0.65, 1, 0]), open: (x) => envPts(x, [0, 1, 1, 0.3]) };
  hollowLayer(out, c, 0.75, rng.range(120, 135), 0.35, (b) => {
    heads(b, c, { ...g, breath: 0.7, rough: 0.6 }, 0.4);
    under(b, 0.35, (x) => rasp(x, c, g.t ?? 0, g.d, g.amp, g.open));
  });
  return air(softClip(out, 1.6), sr, 0.9, 0.32, 0.22);
}

/** vanilla entity.wither.spawn: it bursts into life: a huge explosion, a monstrous roar torn out of it climbing and falling, a long rumble */
function spawn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const D = 4.4;
  const out = alloc(D, sr);
  const n = out.length;
  const base = rng.range(50, 55);
  // the blast: a crack of noise whose top closes fast, over the long body of it
  layer(out, 1, (b) => {
    const f = new SVF(9000, 0.8, sr);
    let e1 = 1, e2 = 1;
    const k1 = Math.exp(-1 / (0.1 * sr)), k2 = Math.exp(-1 / (0.8 * sr));
    const att = Math.round(0.0015 * sr);
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) f.set(220 + 8000 * Math.exp(-i / sr / 0.18), 0.8, sr);
      b[i] = f.low(rng.bi()) * (0.7 * e1 + 0.3 * e2) * (i < att ? i / att : 1);
      e1 *= k1;
      e2 *= k2;
    }
  });
  layer(out, 1, (b) => thump(b, sr, { f0: 70, f1: 26, glide: 0.2, tau: 0.5, attack: 0.003, h2: 0.25, dur: 2.8 }));
  // the rumble rolling on after it
  layer(out, 0.8, (b) => {
    const m1 = rng.range(1.3, 2.2), m2 = rng.range(3, 5), p1 = rng.next(), p2 = rng.next();
    rumble(b, c, 0, D, 190, (t) => smooth(t / 0.03) * (0.6 * Math.exp(-t / 0.8) + 0.4 * Math.exp(-t / 2.2)) * (1 + 0.35 * Math.sin(TAU * (m1 * t + p1)) + 0.2 * Math.sin(TAU * (m2 * t + p2))));
  });
  // the roar torn out of it: climbing, held, then falling away
  const tR = 0.04, dR = 3.5;
  const f0R = (x: number) => base * envExpPts(x, [0, 1, 0.25, 1.65, 0.5, 1.6, 0.8, 0.95, 1, 0.65]);
  const ampR = (x: number) => envPts(x, [0, 0.35, 0.08, 0.7, 0.25, 1, 0.5, 0.95, 0.8, 0.5, 1, 0]);
  const openR = (x: number) => envPts(x, [0, 0.6, 0.25, 1, 0.55, 0.9, 1, 0.15]);
  hollowLayer(out, c, 1, rng.range(115, 128), 0.35, (b) => {
    heads(b, c, { t: tR, d: dR, f0: f0R, amp: ampR, open: openR, rough: 0.6, bright: 0.1 }, 0.55);
    under(b, 0.3, (x) => rasp(x, c, tR, dR, ampR, openR, 31));
    under(b, 0.3, (x) => rattle(x, c, tR + 0.1, dR - 0.1, (u) => 30 - 14 * u, (u) => envPts(u, [0, 0.5, 0.4, 1, 1, 0])));
  });
  // (a scream riding over it, the monster in it)
  layer(out, 0.25, (b) => head(b, c, { t: tR + 0.05, d: dR * 0.75, f0: (x) => 2.9 * f0R(x * 0.75), amp: (x) => envPts(x, [0, 0.3, 0.3, 1, 0.7, 0.8, 1, 0]), open: () => 0.85, rough: 0.5, bright: 0.2, size: 1.25 }));
  layer(out, 0.14, (b) => ghost(b, c, 0.3, D - 0.3, (x) => 950 - 300 * x, (x) => envPts(x, [0, 0, 0.2, 1, 1, 0])));
  softClip(out, 1.8);
  lowpass(out, 8000, sr);
  return air(out, sr, 3.2, 0.5, 1.0);
}

export function witherSounds(): Record<string, SoundGen> {
  return {
    'entity.wither.ambient': sound('entity.wither.ambient', 4, ambient, { fadeOut: 0.25 }),
    'entity.wither.hurt': sound('entity.wither.hurt', 4, hurt, { fadeOut: 0.15 }),
    'entity.wither.death': sound('entity.wither.death', 1, death, { trimDb: -60, fadeOut: 0.8 }),
    'entity.wither.shoot': sound('entity.wither.shoot', 1, shoot, { fadeOut: 0.15 }),
    'entity.wither.spawn': sound('entity.wither.spawn', 1, spawn, { trimDb: -60, fadeOut: 0.8 }),
  };
}
