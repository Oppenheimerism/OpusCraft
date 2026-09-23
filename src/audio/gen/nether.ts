// Nether world sounds: the portal (its ambient whoosh, the trigger heard on stepping in, the
// travel whoosh on arrival) and the ambience of the five Nether biomes — for each a seamless
// loop (vanilla ambient.<biome>.loop), mood sounds (ambient.<biome>.mood, played by the moodiness
// accumulator) and additions (ambient.<biome>.additions, the random non-positional details).

import type { SoundGen } from '../synth';
import {
  type ReverbOpts,
  type Rng,
  TAU,
  addOsc,
  alloc,
  brown,
  envAD,
  envBump,
  highpass,
  layer,
  loopify,
  lowpass,
  mixInto,
  peakOf,
  reverb,
  sinCyc,
  smooth,
  upsample2,
  white,
} from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, fireCrackles, impact, phisem, sweep, thump, ticks } from './texture';
import { VOWELS, voice, vowelGlide } from './voice';
import { reverbHalf } from './world';

type Fn = (t: number) => number;

// ------------------------------------------------------------------ helpers

/** Add `src` into `dst` scaled so that its RMS is `rms`. */
function addRms(dst: Float32Array, src: Float32Array, rms: number): void {
  let s = 0;
  for (let i = 0; i < src.length; i++) s += src[i] * src[i];
  const r = Math.sqrt(s / Math.max(1, src.length));
  if (r > 1e-12) mixInto(dst, src, 0, rms / r);
}

/** Add `src` into `dst` scaled so that its peak is `peak`. */
function addPeak(dst: Float32Array, src: Float32Array, peak: number): void {
  const m = peakOf(src);
  if (m > 1e-12) mixInto(dst, src, 0, peak / m);
}

/** Run an effect over a periodic signal in its steady state (two periods in, the second one out). */
function periodic(x: Float32Array, fx: (y: Float32Array) => Float32Array): Float32Array {
  const n = x.length;
  const y = new Float32Array(2 * n);
  y.set(x);
  y.set(x, n);
  return fx(y).slice(n, 2 * n);
}

/** remove the images a half-rate render leaves above ~10 kHz once it is upsampled to `sr` */
function deImage(y: Float32Array, sr: number): Float32Array {
  lowpass(y, 9500, sr);
  return lowpass(y, 9500, sr);
}

/** half-rate render -> full rate (one-shots) */
const up2 = (x: Float32Array, sr: number): Float32Array => deImage(upsample2(x), sr);

/**
 * Seamless loop builder, rendered at half the sample rate (the Nether's ambience lives below
 * ~9 kHz) and upsampled periodically at the end. Noise beds are rendered a crossfade longer than
 * the loop and folded into their own start (loopify); events get room to ring out and their
 * overhang wraps onto the start; tones and contours use whole cycles per loop, so they are
 * exactly periodic.
 */
class LoopBuilder {
  readonly hs: number;
  readonly n: number;
  private readonly x: number;
  private readonly mix: Float32Array;
  constructor(sr: number, readonly L: number, X = 1) {
    this.hs = sr / 2;
    this.n = Math.round(L * this.hs);
    this.x = Math.round(X * this.hs);
    this.mix = new Float32Array(this.n);
  }

  /** frequency rounded to whole cycles per loop */
  q(f: number): number {
    return Math.max(1, Math.round(f * this.L)) / this.L;
  }

  /** sine LFO with k whole cycles per loop */
  lfo(k: number, ph = 0): Fn {
    const w = (TAU * k) / this.L;
    return (t) => Math.sin(w * t + ph);
  }

  /**
   * A smooth periodic 0..1 contour (gusts, swells): `parts` random whole-cycle sines from k = kmin,
   * stretched to fill 0..1, eased and raised to `sharp` (> 1 = mostly low with brief surges).
   */
  contour(rng: Rng, parts: number, sharp = 1, kmin = 1): Fn {
    const K: number[] = [];
    const A: number[] = [];
    const P: number[] = [];
    for (let k = kmin; k < kmin + parts; k++) {
      K.push(k);
      A.push(rng.range(0.4, 1) / Math.sqrt(k));
      P.push(rng.next() * TAU);
    }
    const N = Math.round(this.L * 100);
    const tab = new Float32Array(N + 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < N; j++) {
      const t = (j / N) * this.L;
      let v = 0;
      for (let i = 0; i < K.length; i++) v += A[i] * Math.sin((TAU * K[i] * t) / this.L + P[i]);
      tab[j] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let j = 0; j < N; j++) tab[j] = Math.pow(smooth((tab[j] - lo) / Math.max(1e-9, hi - lo)), sharp);
    tab[N] = tab[0];
    const L = this.L;
    return (t) => {
      let u = t / L;
      u -= Math.floor(u);
      const x = u * N;
      const j = x | 0;
      return tab[j] + (tab[j + 1] - tab[j]) * (x - j);
    };
  }

  /** a noise bed (rendered L + crossfade long, `t` in seconds) mixed at RMS `rms` */
  bed(rms: number, fill: (b: Float32Array, hs: number) => void): void {
    const b = new Float32Array(this.n + this.x);
    fill(b, this.hs);
    addRms(this.mix, loopify(b, this.x), rms);
  }

  /** events placed in [0, L) with `tail` seconds to ring out (wrapped), optional steady-state effect, mixed at peak `peak` */
  events(peak: number, tail: number, fill: (b: Float32Array, hs: number) => void, fx?: (y: Float32Array) => Float32Array): void {
    const b = new Float32Array(this.n + Math.round(tail * this.hs));
    fill(b, this.hs);
    const l = new Float32Array(this.n);
    for (let i = 0; i < b.length; i++) l[i % this.n] += b[i];
    addPeak(this.mix, fx ? periodic(l, fx) : l, peak);
  }

  /** an exactly periodic sine of amplitude `gain * amp(t)`, with an optional vibrato of ±devHz at k cycles per loop */
  tone(gain: number, f: number, amp: Fn, devHz = 0, k = 1): void {
    const fq = this.q(f);
    const inc = fq / this.hs;
    const vib = devHz > 0 ? (devHz * this.L) / k : 0;
    const w = (TAU * k) / this.L;
    for (let i = 0; i < this.n; i++) {
      const t = i / this.hs;
      let ph = inc * i + (vib ? vib * Math.sin(w * t) : 0);
      ph -= Math.floor(ph);
      this.mix[i] += gain * amp(t) * sinCyc(ph);
    }
  }

  /** the finished loop at the full sample rate (optionally through a steady-state effect first) */
  done(fx?: (y: Float32Array) => Float32Array): Float32Array {
    const up = upsample2(fx ? periodic(this.mix, fx) : this.mix, true);
    return periodic(up, (y) => deImage(y, this.hs * 2));
  }
}

/** big, dark Nether space for the mood sounds */
const MOOD_VERB: ReverbOpts = { t60: 4.2, hf: 0.3, size: 2.1, wet: 1.4, dry: 0.6, pre: 0.035, tail: 3, highcut: 5000 };
/** a smaller, closer space for the additions */
const ADD_VERB: ReverbOpts = { t60: 2.4, hf: 0.35, size: 1.6, wet: 0.9, dry: 0.8, pre: 0.02, tail: 1.8, highcut: 6000 };

const verb = (b: Float32Array, sr: number, base: ReverbOpts, o: Partial<ReverbOpts> = {}): Float32Array => reverbHalf(b, sr, { ...base, ...o });

/** cap a one-shot's length with a gentle fade (as the cave sounds do) */
function capLen(b: Float32Array, sr: number, max: number): Float32Array {
  const n = Math.round(max * sr);
  const o = b.length > n ? b.slice(0, n) : b;
  const fl = Math.min(o.length >> 2, Math.round(0.4 * sr));
  for (let i = 0; i < fl; i++) o[o.length - 1 - i] *= i / fl;
  return o;
}

// ------------------------------------------------------------------ vocal-ish building blocks

/** A ghostly moan: a soft, breathy "oooh" rising a little and sinking away, with a slow vibrato. */
function moan(b: Float32Array, sr: number, rng: Rng, t: number, d: number, f: number, amp: number): void {
  const F = vowelGlide(rng.pick(['oo', 'u', 'o']), rng.pick(['o', 'aw', 'u']), d * 0.2, d * 0.85, rng.range(1.02, 1.15));
  const up = rng.range(1.06, 1.18);
  const down = rng.range(0.76, 0.9);
  const peak = rng.range(0.3, 0.45);
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (u) => f * (u < d * peak ? 1 + (up - 1) * smooth(u / (d * peak)) : up + (down - up) * smooth((u - d * peak) / (d * (1 - peak)))),
    amp: (u) => amp * envBump(u, d * 0.35, d * 0.65),
    formants: [
      { f: F[0], bw: 90, g: 1 },
      { f: F[1], bw: 120, g: 0.5 },
      { f: F[2], bw: 220, g: 0.1 },
    ],
    vib: [rng.range(4.5, 6), 0.012],
    jitter: 0.008,
    shimmer: 0.05,
    breath: 0.4,
    oq: 0.78,
  });
}

/** A fleshy groan: a low, rough, wet voice sagging downwards. */
function groan(b: Float32Array, sr: number, rng: Rng, t: number, d: number, f: number, amp: number): void {
  const F = vowelGlide(rng.pick(['o', 'uh', 'aw']), rng.pick(['uh', 'er', 'm']), d * 0.2, d * 0.9, rng.range(0.72, 0.85));
  const wob = rng.range(1.5, 2.8);
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (u) => f * (1 + 0.1 * Math.sin((Math.PI * Math.min(1, u / (d * 0.5))))) * (1 - (0.25 * u) / d) * (1 + 0.04 * Math.sin(TAU * wob * u)),
    amp: (u) => amp * envBump(u, d * 0.3, d * 0.7),
    formants: [
      { f: F[0], bw: 110, g: 1 },
      { f: F[1], bw: 150, g: 0.55 },
      { f: F[2], bw: 220, g: 0.18 },
    ],
    rough: 0.45,
    sub: 0.12,
    jitter: 0.04,
    shimmer: 0.2,
    breath: 0.4,
    growl: [rng.range(14, 22), 0.4],
    oq: 0.55,
  });
}

/** Unvoiced whisper syllables: breath through formants that hop between vowels, a few sibilants. */
function whisperInto(b: Float32Array, sr: number, rng: Rng, t0: number, syllables: number, amp: number): number {
  const names = Object.keys(VOWELS);
  let t = t0;
  for (let k = 0; k < syllables; k++) {
    const d = rng.range(0.12, 0.3);
    const F = vowelGlide(rng.pick(names), rng.pick(names), 0, d, rng.range(1.1, 1.3));
    const a = amp * rng.range(0.5, 1);
    voice(b, sr, rng, {
      t,
      dur: d,
      f0: 150,
      voiced: 0,
      breath: 1,
      amp: (u) => a * envBump(u, d * 0.3, d * 0.7),
      formants: [
        { f: F[0], bw: 120, g: 0.7 },
        { f: F[1], bw: 150, g: 1 },
        { f: F[2], bw: 250, g: 0.6 },
        { f: F[3], bw: 350, g: 0.3 },
      ],
    });
    if (rng.chance(0.4)) burst(b, sr, rng, { t: t + d * 0.8, dur: 0.1, attack: 0.012, tau: 0.03, bp: [rng.pick([3600, 5200]), 2], amp: a * 0.35 });
    t += d + rng.range(0.03, 0.14);
  }
  return t;
}

// ------------------------------------------------------------------ portal

/** The portal's own sound: a long, deep, swirling whoosh that swells and dies away, wavering all through. */
function portalAmbient(c: Ctx): Float32Array {
  const { rng } = c;
  const sr = c.sr / 2;
  const D = rng.range(5.4, 6.2);
  const out = alloc(D, sr);
  const env: Fn = (t) => envBump(t, D * 0.36, D * 0.64);
  const wob = rng.range(4.2, 5.4);
  const wph = rng.next() * TAU;
  const warble: Fn = (t) => Math.sin(TAU * wob * t + wph);
  // the swirl: resonant noise bands circling round each other
  layer(out, 1, (b) => {
    [340, 560, 880].forEach((f0) => {
      const fc = f0 * rng.range(0.9, 1.1);
      const lf = rng.range(0.25, 0.6);
      const ph = rng.next() * TAU;
      sweep(b, sr, rng, { dur: D, f: (t) => fc * (1 + 0.4 * Math.sin(TAU * lf * t + ph)) * (1 + 0.07 * warble(t)), q: 7, amp: env, color: 'pink' });
    });
  });
  // the deep hum under it
  layer(out, 0.55, (b) => {
    const f = rng.range(50, 58);
    for (let h = 1; h <= 6; h++) addOsc(b, sr, 0, D, (t) => f * h * (1 + 0.012 * warble(t)), (t) => (0.5 / h) * env(t));
    lowpass(b, 380, sr);
  });
  // a breath of air on top
  layer(out, 0.16, (b) => sweep(b, sr, rng, { dur: D, f: (t) => 1800 * (1 + 0.2 * warble(t)), q: 1.2, amp: (t) => env(t) * env(t), color: 'pink' }));
  for (let i = 0; i < out.length; i++) out[i] *= 0.78 + 0.22 * warble(i / sr);
  return up2(out, c.sr);
}

/** Stepping into a portal: the vortex spins up — a rising, accelerating, wobbling whoosh. */
function portalTrigger(c: Ctx): Float32Array {
  const { rng } = c;
  const sr = c.sr / 2;
  const D = rng.range(4.4, 4.8);
  const out = alloc(D, sr);
  const top = D - 0.8;
  const env: Fn = (t) => (t < top ? Math.pow(t / top, 2) : Math.pow(Math.max(0, 1 - (t - top) / (D - top)), 1.5));
  const rise: Fn = (t) => Math.pow(Math.min(1, t / top), 1.3);
  // warble accelerating from w0 to w1 Hz (phase = integral of the rate)
  const w0 = 1.6, w1 = 9;
  const wph = rng.next() * TAU;
  const warble: Fn = (t) => {
    const u = Math.min(t, top);
    return Math.sin(wph + TAU * (w0 * u + ((w1 - w0) * u * u) / (2 * top) + w1 * Math.max(0, t - top)));
  };
  layer(out, 1, (b) => {
    [150, 230, 340].forEach((f0) => {
      const fa = f0 * rng.range(0.9, 1.1);
      const fb = fa * rng.range(6, 8);
      const lf = rng.range(0.4, 0.8);
      const ph = rng.next() * TAU;
      sweep(b, sr, rng, {
        dur: D,
        f: (t) => fa * Math.pow(fb / fa, rise(t)) * (1 + 0.12 * Math.sin(TAU * lf * t + ph)) * (1 + 0.08 * warble(t)),
        q: (t) => 5 + 5 * rise(t),
        amp: env,
        color: 'pink',
      });
    });
  });
  layer(out, 0.6, (b) => {
    const f = rng.range(52, 60);
    for (let h = 1; h <= 5; h++) addOsc(b, sr, 0, D, (t) => f * h * (1 + 1.4 * rise(t)) * (1 + 0.015 * warble(t)), (t) => (0.5 / h) * env(t));
    lowpass(b, 800, sr);
  });
  layer(out, 0.25, (b) => sweep(b, sr, rng, { dur: D, f: (t) => 1500 + 2600 * rise(t), q: 1.5, amp: (t) => env(t) * rise(t), color: 'pink' }));
  for (let i = 0; i < out.length; i++) out[i] *= 0.74 + 0.26 * warble(i / sr);
  return up2(out, c.sr);
}

/** Arriving through a portal: a big, deep whoosh that falls away, its swirl slowing as it fades. */
function portalTravel(c: Ctx): Float32Array {
  const { rng } = c;
  const sr = c.sr / 2;
  const D = rng.range(4, 4.5);
  const out = alloc(D, sr);
  const att = 0.18;
  const env: Fn = (t) => (t < att ? Math.sin((0.5 * Math.PI * t) / att) : Math.exp(-(t - att) / 1.05));
  const fall: Fn = (t) => 1 - Math.exp(-t / 1.1);
  // warble slowing from 8 to 2 Hz
  const w0 = 8, w1 = 2, tw = 1.3;
  const wph = rng.next() * TAU;
  const warble: Fn = (t) => Math.sin(wph + TAU * (w1 * t + (w0 - w1) * tw * (1 - Math.exp(-t / tw))));
  layer(out, 1, (b) => {
    [1400, 950, 620].forEach((f0) => {
      const fa = f0 * rng.range(0.9, 1.1);
      const fb = fa * rng.range(0.12, 0.18);
      const ph = rng.next() * TAU;
      sweep(b, sr, rng, {
        dur: D,
        f: (t) => fa * Math.pow(fb / fa, fall(t)) * (1 + 0.1 * Math.sin(TAU * 0.6 * t + ph)) * (1 + 0.07 * warble(t)),
        q: (t) => 3 + 4 * fall(t),
        amp: env,
        color: 'pink',
      });
    });
  });
  layer(out, 0.7, (b) => thump(b, sr, { f0: 72, f1: 34, glide: 0.12, tau: 0.5, attack: 0.02, dur: D }));
  layer(out, 0.5, (b) => {
    const f = rng.range(140, 160);
    for (let h = 1; h <= 4; h++) addOsc(b, sr, 0, D, (t) => f * h * (1 - 0.62 * fall(t)) * (1 + 0.012 * warble(t)), (t) => (0.5 / h) * env(t));
    lowpass(b, 700, sr);
  });
  for (let i = 0; i < out.length; i++) out[i] *= 0.8 + 0.2 * warble(i / sr);
  const w = reverb(out, sr, { t60: 2.4, hf: 0.35, size: 1.8, wet: 0.5, dry: 1, tail: 1.2, highcut: 4000 });
  return up2(w, c.sr);
}

// ------------------------------------------------------------------ nether wastes

/** Nether wastes: a deep rumbling roar, a low beating drone and far-off lava bubbling. */
function wastesLoop(c: Ctx): Float32Array {
  const { rng } = c;
  const lb = new LoopBuilder(c.sr, 16);
  const L = lb.L;
  const g1 = lb.contour(rng, 3);
  const g2 = lb.contour(rng, 5, 1.3);
  lb.bed(1, (b, hs) => {
    const r = brown(b.length, rng, 0.9993);
    lowpass(r, 120, hs);
    lowpass(r, 120, hs);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * (0.65 + 0.35 * g1(i / hs));
  });
  lb.bed(0.5, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 230 + 170 * g2(t), q: 1.1, amp: (t) => 0.3 + 0.7 * g2(t), color: 'pink' }));
  const d1 = lb.contour(rng, 2);
  const d2 = lb.contour(rng, 2);
  const f = rng.range(41, 45);
  lb.tone(0.42, f, (t) => 0.5 + 0.5 * d1(t));
  lb.tone(0.26, f * 1.5 + 0.19, (t) => 0.4 + 0.6 * d2(t));
  lb.tone(0.14, f * 2 - 0.13, d1);
  lb.tone(0.05, f * 3, d2);
  lb.events(0.4, 0.6, (b, hs) => {
    const nb = 9 + rng.int(4);
    for (let k = 0; k < nb; k++) bubble(b, hs, rng.next() * L, rng.logRange(55, 160), rng.range(0.35, 1), rng.range(0.05, 0.1), rng.range(0.12, 0.3));
    lowpass(b, 600, hs);
  });
  lb.events(
    0.12,
    0.3,
    (b, hs) => {
      fireCrackles(b, hs, rng, 0, L - 0.05, 0.7);
      lowpass(b, 1400, hs);
    },
    (y) => reverb(y, lb.hs, { t60: 2.2, hf: 0.3, size: 1.6, wet: 1.2, dry: 0.3, tail: 0 }),
  );
  return lb.done();
}

const WASTES_MOODS: ((c: Ctx) => Float32Array)[] = [
  // 0: a deep, distant boom rolling away
  (c) => {
    const { sr, rng } = c;
    const b = alloc(3, sr);
    thump(b, sr, { f0: rng.range(55, 66), f1: 31, glide: 0.1, tau: 0.35, attack: 0.012 });
    burst(b, sr, rng, { dur: 1.2, attack: 0.008, tau: 0.25, lp: 260, color: 'brown', amp: 0.8 });
    burst(b, sr, rng, { t: 0.2, dur: 2.6, attack: 0.3, tau: 0.9, lp: 160, color: 'brown', amp: 0.5 });
    return verb(b, sr, MOOD_VERB, { t60: 5, tail: 3.5, highcut: 1200 });
  },
  // 1: a low groaning drone swelling out of the dark
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 4);
    const b = alloc(d, sr);
    const f = rng.range(46, 58);
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => f * (1 + 0.12 * Math.sin((Math.PI * t) / d)),
      amp: (t) => envBump(t, d * 0.45, d * 0.55),
      formants: [
        { f: 280, bw: 110, g: 1 },
        { f: 620, bw: 160, g: 0.5 },
        { f: 1150, bw: 240, g: 0.15 },
      ],
      rough: 0.5,
      jitter: 0.05,
      shimmer: 0.2,
      breath: 0.35,
      growl: [16, 0.35],
    });
    lowpass(b, 900, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 2: rumble swelling up under a slowly sinking drone
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.5, 4.5);
    const b = alloc(d, sr);
    sweep(b, sr, rng, { dur: d, f: (t) => 110 + 120 * Math.sin((Math.PI * t) / d), q: 1.2, amp: (t) => envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    const f = rng.range(85, 100);
    addOsc(b, sr, 0, d, (t) => f * (1 - (0.3 * t) / d), (t) => 0.25 * envBump(t, d * 0.4, d * 0.6));
    addOsc(b, sr, 0, d, (t) => f * 1.5 * (1 - (0.3 * t) / d) + 0.6, (t) => 0.12 * envBump(t, d * 0.45, d * 0.55));
    lowpass(b, 700, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 3: a lava lake gurgling somewhere far away
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2, 2.8);
    const b = alloc(d, sr);
    const nb = 7 + rng.int(5);
    for (let k = 0; k < nb; k++) bubble(b, sr, rng.range(0, d - 0.3), rng.logRange(40, 120), rng.range(0.4, 1), rng.range(0.08, 0.16), rng.range(0.15, 0.35));
    burst(b, sr, rng, { dur: d, attack: 0.3, tau: d * 0.5, lp: 200, color: 'brown', amp: 0.35, env: (t) => envBump(t, d * 0.3, d * 0.7) });
    lowpass(b, 800, sr);
    return verb(b, sr, MOOD_VERB, { t60: 4.5, tail: 3 });
  },
];

const WASTES_ADDS: ((c: Ctx) => Float32Array)[] = [
  // 0: a few slow lava blubs
  (c) => {
    const { sr, rng } = c;
    const b = alloc(1.4, sr);
    const nb = 3 + rng.int(4);
    for (let k = 0; k < nb; k++) bubble(b, sr, rng.range(0, 0.9), rng.logRange(70, 220), rng.range(0.4, 1), rng.range(0.04, 0.08), rng.range(0.15, 0.35));
    lowpass(b, 1200, sr);
    return verb(b, sr, ADD_VERB);
  },
  // 1: distant crackles
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.8, 1.3);
    const b = alloc(d, sr);
    fireCrackles(b, sr, rng, 0.01, d - 0.1, rng.range(10, 18), 0.25);
    lowpass(b, 2600, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 2: loose rock tumbling down a slope
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.9, 1.4);
    const b = alloc(d, sr);
    ticks(b, sr, rng, { dur: d, rate: 30, energy: (t) => envBump(t, d * 0.25, d * 0.75), f: [700, 2600], t60: [0.01, 0.035], heavy: 1.8, click: 0.4 });
    lowpass(b, 3000, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 3: a low rumble swelling and fading
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.6, 2.4);
    const b = alloc(d, sr);
    burst(b, sr, rng, { dur: d, attack: d * 0.4, tau: d * 0.3, lp: 180, color: 'brown', env: (t) => envBump(t, d * 0.4, d * 0.6) });
    return verb(b, sr, ADD_VERB, { highcut: 1000 });
  },
  // 4: a soft hot whoosh
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    const fa = rng.range(250, 350);
    sweep(b, sr, rng, { dur: d, f: (t) => fa * (1 + 2 * Math.sin((Math.PI * t) / d)), q: 1.4, amp: (t) => envBump(t, d * 0.45, d * 0.55), color: 'pink' });
    return verb(b, sr, ADD_VERB);
  },
  // 5: a deep lava pop with a little sizzle
  (c) => {
    const { sr, rng } = c;
    const b = alloc(0.8, sr);
    const f = rng.range(70, 95);
    addOsc(b, sr, 0.01, 0.4, (t) => f * (1 + 1.8 * (1 - Math.exp(-t / 0.04))), (t) => envAD(t, 0.006, 0.06));
    burst(b, sr, rng, { t: 0.04, dur: 0.5, attack: 0.02, tau: 0.12, hp: 2500, amp: 0.25 });
    lowpass(b, 5000, sr);
    return verb(b, sr, ADD_VERB);
  },
];

// ------------------------------------------------------------------ crimson forest

/** Crimson forest: a low roaring wind with a slow, fleshy throb and distant crackling. */
function crimsonLoop(c: Ctx): Float32Array {
  const { rng } = c;
  const lb = new LoopBuilder(c.sr, 16);
  const L = lb.L;
  const g1 = lb.contour(rng, 4, 1.2);
  const g2 = lb.contour(rng, 6, 1.6);
  const breath = lb.contour(rng, 1, 1, 4);
  lb.bed(1, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 150 + 170 * g1(t), q: 1.8, amp: (t) => 0.35 + 0.65 * g1(t), color: 'pink' }));
  lb.bed(0.45, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 480 + 320 * g2(t), q: 1.3, amp: (t) => 0.15 + 0.85 * g2(t), color: 'pink' }));
  lb.bed(0.55, (b, hs) => {
    const r = brown(b.length, rng, 0.9993);
    lowpass(r, 85, hs);
    lowpass(r, 85, hs);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * (0.8 + 0.2 * g1(i / hs));
  });
  lb.bed(0.32, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 110 + 30 * breath(t), q: 4, amp: (t) => Math.pow(breath(t), 2.5), color: 'pink' }));
  lb.events(
    0.14,
    0.3,
    (b, hs) => {
      fireCrackles(b, hs, rng, 0, L - 0.05, 1.3, 0.2);
      lowpass(b, 2400, hs);
    },
    (y) => reverb(y, lb.hs, { t60: 2.4, hf: 0.3, size: 1.7, wet: 1.2, dry: 0.4, tail: 0 }),
  );
  return lb.done();
}

const CRIMSON_MOODS: ((c: Ctx) => Float32Array)[] = [
  // 0: a fleshy groan
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.8, 2.6);
    const b = alloc(d + 0.2, sr);
    groan(b, sr, rng, 0, d, rng.range(68, 92), 1);
    squelchInto(b, sr, rng, rng.range(0.1, d * 0.5), 0.25, 180, 520, 0.4);
    lowpass(b, 1400, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 1: slow organic creaking, as of huge fungal stems swaying
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2, 3);
    const b = alloc(d, sr);
    const r0 = rng.range(26, 40);
    creak(b, sr, rng, {
      dur: d,
      rate: (t) => r0 * (1 + 0.5 * Math.sin((Math.PI * t) / d)),
      amp: (t) => envBump(t, d * 0.4, d * 0.6),
      jitter: 0.25,
      bands: [
        { f: 190, q: 5, g: 1 },
        { f: 430, q: 6, g: 0.7 },
        { f: 920, q: 5, g: 0.3 },
      ],
    });
    lowpass(b, 1500, sr);
    return verb(b, sr, MOOD_VERB, { t60: 4.5, tail: 3.2 });
  },
  // 2: the roar swelling up
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 4);
    const b = alloc(d, sr);
    sweep(b, sr, rng, { dur: d, f: (t) => 170 + 160 * Math.sin((Math.PI * t) / d), q: 2, amp: (t) => envBump(t, d * 0.55, d * 0.45), color: 'pink' });
    burst(b, sr, rng, { dur: d, attack: d * 0.4, tau: d, lp: 110, color: 'brown', amp: 0.6, env: (t) => envBump(t, d * 0.5, d * 0.5) });
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 3: something wet heaving twice
  (c) => {
    const { sr, rng } = c;
    const b = alloc(2.2, sr);
    const t2 = rng.range(0.7, 1);
    squelchInto(b, sr, rng, 0.05, rng.range(0.55, 0.75), 160, 560, 1);
    squelchInto(b, sr, rng, t2, rng.range(0.6, 0.85), 140, 480, 0.8);
    thump(b, sr, { t: 0.1, f0: 70, f1: 45, tau: 0.2, attack: 0.05, amp: 0.4 });
    thump(b, sr, { t: t2 + 0.05, f0: 65, f1: 42, tau: 0.22, attack: 0.05, amp: 0.35 });
    lowpass(b, 1600, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
];

/** a wet squelch at `amp`: a resonance gliding from fa to fb */
function squelchInto(b: Float32Array, sr: number, rng: Rng, t: number, d: number, fa: number, fb: number, amp: number): void {
  const f1 = fa * rng.range(0.9, 1.1);
  const f2 = fb * rng.range(0.9, 1.1);
  sweep(b, sr, rng, { t, dur: d, f: (u) => f1 * Math.pow(f2 / f1, u / d), q: 3.5, amp: (u) => amp * envBump(u, d * 0.35, d * 0.65) });
}

const CRIMSON_ADDS: ((c: Ctx) => Float32Array)[] = [
  // 0: a pair of wet squelches
  (c) => {
    const { sr, rng } = c;
    const b = alloc(0.9, sr);
    squelchInto(b, sr, rng, 0.02, rng.range(0.12, 0.2), 300, 900, 1);
    squelchInto(b, sr, rng, rng.range(0.2, 0.35), rng.range(0.1, 0.16), 350, 1000, 0.7);
    return verb(b, sr, ADD_VERB);
  },
  // 1: a moist, fleshy crackle
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.5, 0.9);
    const b = alloc(d, sr);
    phisem(b, sr, rng, {
      dur: d,
      rate: 1600,
      energy: (t) => envBump(t, d * 0.2, d * 0.8),
      grain: 0.0016,
      heavy: 2.4,
      bands: [
        { f: 1300, q: 1.6, g: 1, spread: 0.4 },
        { f: 2600, q: 1.6, g: 0.5, spread: 0.3 },
        { f: 600, q: 1.8, g: 0.4, spread: 0.3 },
      ],
    });
    return verb(b, sr, ADD_VERB);
  },
  // 2: drifting spores glinting: a few soft, tiny ticks
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.8, 1.4);
    const b = alloc(d, sr);
    ticks(b, sr, rng, { dur: d, rate: 9, energy: () => 1, f: [1800, 3400], t60: [0.05, 0.14], ratios: [1, 2.4], weights: [1, 0.3], heavy: 1.2, click: 0.05 });
    lowpass(b, 4500, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 3: a creak far off in the stems
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.6, 1);
    const b = alloc(d, sr);
    const r0 = rng.range(45, 70);
    creak(b, sr, rng, {
      dur: d,
      rate: (t) => r0 * (1 - (0.3 * t) / d),
      amp: (t) => envBump(t, d * 0.3, d * 0.7),
      jitter: 0.2,
      bands: [
        { f: 320, q: 5, g: 1 },
        { f: 760, q: 6, g: 0.6 },
      ],
    });
    lowpass(b, 1600, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 4: a short low growl
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.7, 1.1);
    const b = alloc(d + 0.1, sr);
    groan(b, sr, rng, 0, d, rng.range(58, 75), 1);
    lowpass(b, 1100, sr);
    return verb(b, sr, ADD_VERB);
  },
  // 5: fleshy rustling, as of vines stirring
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.7, 1.2);
    const b = alloc(d, sr);
    phisem(b, sr, rng, {
      dur: d,
      rate: 5000,
      energy: (t) => envBump(t, d * 0.4, d * 0.6),
      grain: 0.0011,
      heavy: 2.3,
      bands: [
        { f: 1900, q: 1.1, g: 1, spread: 0.35 },
        { f: 900, q: 1.3, g: 0.7, spread: 0.3 },
      ],
    });
    return verb(b, sr, ADD_VERB);
  },
];

// ------------------------------------------------------------------ warped forest

/** Warped forest: eerie airy wind with high whistles and faint, shimmering, otherworldly tones. */
function warpedLoop(c: Ctx): Float32Array {
  const { rng } = c;
  const lb = new LoopBuilder(c.sr, 16);
  const g1 = lb.contour(rng, 4, 1.1);
  const g2 = lb.contour(rng, 5, 1.4);
  lb.bed(1, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 800 + 700 * g1(t), q: 0.9, amp: (t) => 0.3 + 0.7 * g1(t), color: 'pink' }));
  lb.bed(0.4, (b, hs) => {
    const r = brown(b.length, rng, 0.999);
    lowpass(r, 150, hs);
    lowpass(r, 150, hs);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * (0.7 + 0.3 * g2(i / hs));
  });
  for (const [f0, q] of [
    [rng.range(560, 680), 26],
    [rng.range(880, 1000), 30],
  ]) {
    const w = lb.contour(rng, 3, 1.6);
    const dr = lb.lfo(1 + rng.int(2), rng.next() * TAU);
    lb.bed(0.2, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => f0 * (1 + 0.04 * dr(t)), q, amp: w, color: 'pink' }));
  }
  // the shimmer: faint glassy tones drifting in and out, trembling
  const base = rng.range(360, 420);
  [1, 1.335, 1.782, 2.245, 2.997].forEach((r, k) => {
    const sw = lb.contour(rng, 3, 2);
    const tr = lb.lfo(40 + rng.int(60), rng.next() * TAU);
    lb.tone(0.05 / Math.sqrt(k + 1), base * r, (t) => sw(t) * (0.75 + 0.25 * tr(t)), 1.5 + k * 0.6, 3 + k);
  });
  return lb.done((y) => reverb(y, lb.hs, { t60: 3, hf: 0.5, size: 1.8, wet: 0.5, dry: 1, tail: 0, lowcut: 300 }));
}

/** eerie glassy partials swelling in, staggered */
function glassSwell(b: Float32Array, sr: number, rng: Rng, d: number, f: number, ratios: number[], bend: number): void {
  ratios.forEach((r, k) => {
    const st = k * rng.range(0.15, 0.4);
    const len = d - st;
    const tr = rng.range(3, 6);
    addOsc(b, sr, st, len, (t) => f * r * (1 + bend * (t / len)) * (1 + 0.003 * Math.sin(TAU * 4.5 * t)), (t) => (0.3 / Math.sqrt(k + 1)) * envBump(t, len * 0.45, len * 0.55) * (0.8 + 0.2 * Math.sin(TAU * tr * t)));
  });
}

const WARPED_MOODS: ((c: Ctx) => Float32Array)[] = [
  // 0: an eerie tonal swell, bending upwards
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.5, 4.5);
    const b = alloc(d, sr);
    glassSwell(b, sr, rng, d, rng.range(300, 420), [1, 1.19, 1.5, 1.78], rng.range(0.02, 0.05));
    return verb(b, sr, MOOD_VERB, { hf: 0.5, highcut: 7000, tail: 3 });
  },
  // 1: a shimmering descent
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 3.8);
    const b = alloc(d, sr);
    const f0 = rng.range(1300, 1900);
    for (let k = 0; k < 4; k++) {
      const st = k * rng.range(0.1, 0.25);
      const fr = f0 * [1, 1.26, 1.5, 2][k];
      const tr = rng.range(6, 9);
      addOsc(b, sr, st, d - st, (t) => fr * Math.pow(0.5, t / (d - st)), (t) => (0.25 / (k + 1)) * envBump(t, 0.4, d - st - 0.4) * (0.7 + 0.3 * Math.sin(TAU * tr * t)));
    }
    return verb(b, sr, MOOD_VERB, { hf: 0.55, highcut: 8000, tail: 3 });
  },
  // 2: an airy whoosh with a whistle gliding through it
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.5, 3.5);
    const b = alloc(d, sr);
    sweep(b, sr, rng, { dur: d, f: (t) => 600 + 1300 * Math.sin((Math.PI * t) / d), q: 1, amp: (t) => envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    const w0 = rng.range(700, 900);
    sweep(b, sr, rng, { dur: d, f: (t) => w0 * (1 + 0.4 * Math.sin((Math.PI * t) / d)), q: 30, amp: (t) => 0.8 * envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    return verb(b, sr, MOOD_VERB, { hf: 0.45, tail: 3 });
  },
  // 3: a low otherworldly hum, beating, with a breathy "ooh" around it
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.5, 4.5);
    const b = alloc(d, sr);
    const f = rng.range(105, 125);
    addOsc(b, sr, 0, d, () => f, (t) => 0.35 * envBump(t, d * 0.4, d * 0.6));
    addOsc(b, sr, 0, d, () => f * 1.0595 + 0.4, (t) => 0.28 * envBump(t, d * 0.5, d * 0.5));
    addOsc(b, sr, 0, d, () => f * 3.02, (t) => 0.06 * envBump(t, d * 0.5, d * 0.5));
    voice(b, sr, rng, {
      dur: d,
      f0: 100,
      voiced: 0,
      breath: 1,
      amp: (t) => 0.5 * envBump(t, d * 0.5, d * 0.5),
      formants: [
        { f: 330, bw: 100, g: 1 },
        { f: 850, bw: 150, g: 0.5 },
      ],
    });
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
];

const WARPED_ADDS: ((c: Ctx) => Float32Array)[] = [
  // 0: a shine: a soft, glassy tone swelling and trembling away
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.6, 2.4);
    const b = alloc(d, sr);
    const f = rng.range(900, 1700);
    const tr = rng.range(4, 7);
    const env: Fn = (t) => envBump(t, 0.2, d - 0.2) * (0.72 + 0.28 * Math.sin(TAU * tr * t));
    addOsc(b, sr, 0, d, (t) => f * (1 + 0.003 * Math.sin(TAU * 5 * t)), env);
    addOsc(b, sr, 0.04, d - 0.04, () => f * 1.5, (t) => 0.3 * env(t));
    addOsc(b, sr, 0.08, d - 0.08, () => f * 2.76, (t) => 0.12 * env(t));
    return verb(b, sr, ADD_VERB, { hf: 0.6, highcut: 9000 });
  },
  // 1: a little cluster of twinkles
  (c) => {
    const { sr, rng } = c;
    const b = alloc(1.3, sr);
    const n = 3 + rng.int(3);
    for (let k = 0; k < n; k++) {
      const f = rng.range(2200, 4200);
      impact(b, sr, rng, { t: rng.range(0, 0.7), modes: [f, 1, rng.range(0.25, 0.5), f * 2.76, 0.25, 0.15], jitter: 0.01 });
    }
    return verb(b, sr, ADD_VERB, { hf: 0.6, highcut: 9000, wet: 1.1 });
  },
  // 2: an airy swoosh
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.9, 1.5);
    const b = alloc(d, sr);
    const fa = rng.range(900, 1300);
    sweep(b, sr, rng, { dur: d, f: (t) => fa * (1 + 1.2 * Math.sin((Math.PI * t) / d)), q: 1.2, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' });
    return verb(b, sr, ADD_VERB);
  },
  // 3: a soft creak
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.5, 0.9);
    const b = alloc(d, sr);
    const r0 = rng.range(70, 110);
    creak(b, sr, rng, {
      dur: d,
      rate: (t) => r0 * (1 + (0.3 * t) / d),
      amp: (t) => envBump(t, d * 0.3, d * 0.7),
      jitter: 0.15,
      bands: [
        { f: 500, q: 6, g: 1 },
        { f: 1200, q: 6, g: 0.5 },
      ],
    });
    lowpass(b, 2400, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 4: an eerie tone gliding
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    const f0 = rng.range(480, 640);
    const f1 = f0 * rng.pick([0.75, 1.335, 1.5, 0.667]);
    addOsc(b, sr, 0, d, (t) => f0 * Math.pow(f1 / f0, smooth(t / d)) * (1 + 0.008 * Math.sin(TAU * 5.5 * t)), (t) => envBump(t, d * 0.3, d * 0.7));
    addOsc(b, sr, 0, d, (t) => 2.003 * f0 * Math.pow(f1 / f0, smooth(t / d)), (t) => 0.1 * envBump(t, d * 0.4, d * 0.6));
    return verb(b, sr, ADD_VERB, { hf: 0.55 });
  },
  // 5: a hum, two tones beating
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.5, 2.2);
    const b = alloc(d, sr);
    const f = rng.range(190, 240);
    addOsc(b, sr, 0, d, () => f, (t) => 0.5 * envBump(t, d * 0.4, d * 0.6));
    addOsc(b, sr, 0, d, () => f + rng.range(2, 4), (t) => 0.4 * envBump(t, d * 0.45, d * 0.55));
    sweep(b, sr, rng, { dur: d, f: () => f * 4, q: 3, amp: (t) => 0.3 * envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    return verb(b, sr, ADD_VERB);
  },
];

// ------------------------------------------------------------------ soul sand valley

/** Soul sand valley: hollow wind, with narrow howls rising and falling through it. */
function valleyLoop(c: Ctx): Float32Array {
  const { rng } = c;
  const lb = new LoopBuilder(c.sr, 16);
  const g = lb.contour(rng, 4, 1.2);
  lb.bed(1, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 200 + 120 * g(t), q: 1.4, amp: (t) => 0.35 + 0.65 * g(t), color: 'pink' }));
  lb.bed(0.5, (b, hs) => {
    const r = brown(b.length, rng, 0.9993);
    lowpass(r, 110, hs);
    lowpass(r, 110, hs);
    b.set(r.subarray(0, b.length));
  });
  [270, 390, 540].forEach((f0, k) => {
    const hg = lb.contour(rng, 3 + k, 1.8);
    const fc = f0 * rng.range(0.92, 1.08);
    lb.bed(0.55 - 0.1 * k, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => fc * (0.85 + 0.35 * hg(t)), q: 13 + 3 * k, amp: (t) => Math.pow(hg(t), 1.5), color: 'pink' }));
  });
  const wg = lb.contour(rng, 3, 2, 2);
  lb.bed(0.14, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 1100 + 500 * wg(t), q: 2, amp: wg, color: 'pink' }));
  return lb.done((y) => reverb(y, lb.hs, { t60: 3.5, hf: 0.35, size: 2, wet: 0.6, dry: 1, tail: 0, lowcut: 150 }));
}

const VALLEY_MOODS: ((c: Ctx) => Float32Array)[] = [
  // 0: a ghostly moan
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.2, 3.2);
    const b = alloc(d + 0.2, sr);
    moan(b, sr, rng, 0.05, d, rng.range(190, 260), 1);
    lowpass(b, 2500, sr);
    return verb(b, sr, MOOD_VERB, { t60: 5, wet: 1.6, tail: 3.5 });
  },
  // 1: several distant moans overlapping
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.5, 3.5);
    const b = alloc(d + 1.2, sr);
    const f = rng.range(170, 230);
    const n = 2 + rng.int(2);
    for (let k = 0; k < n; k++) moan(b, sr, rng, k * rng.range(0.3, 0.6), d * rng.range(0.75, 1), f * rng.pick([1, 1.19, 1.335, 0.84]), 1 - 0.2 * k);
    lowpass(b, 1800, sr);
    return verb(b, sr, MOOD_VERB, { t60: 5.5, wet: 1.8, tail: 3.5 });
  },
  // 2: a howling gust
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.5, 3.5);
    const b = alloc(d, sr);
    const f0 = rng.range(280, 340);
    sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 1.1 * Math.sin((Math.PI * t) / d) * (1 - (0.3 * t) / d)), q: 14, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' });
    sweep(b, sr, rng, { dur: d, f: (t) => 250 + 250 * Math.sin((Math.PI * t) / d), q: 1.2, amp: (t) => 0.45 * envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 3: a deep, hollow sigh with a low moan inside it
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.4, 3.2);
    const b = alloc(d + 0.2, sr);
    voice(b, sr, rng, {
      dur: d,
      f0: 90,
      voiced: 0,
      breath: 1,
      amp: (t) => envBump(t, d * 0.25, d * 0.75),
      formants: [
        { f: 400, bw: 120, g: 1 },
        { f: 780, bw: 160, g: 0.6 },
        { f: 2300, bw: 300, g: 0.15 },
      ],
    });
    moan(b, sr, rng, d * 0.15, d * 0.8, rng.range(105, 130), 0.45);
    lowpass(b, 2200, sr);
    return verb(b, sr, MOOD_VERB, { t60: 5, wet: 1.6, tail: 3.5 });
  },
];

const VALLEY_ADDS: ((c: Ctx) => Float32Array)[] = [
  // 0, 1: whispers
  (c) => {
    const { sr, rng } = c;
    const b = alloc(2.4, sr);
    whisperInto(b, sr, rng, 0.03, 3 + rng.int(3), 1);
    highpass(b, 300, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.3 });
  },
  (c) => {
    const { sr, rng } = c;
    const b = alloc(1.6, sr);
    whisperInto(b, sr, rng, 0.03, 2 + rng.int(2), 1);
    highpass(b, 400, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.5, t60: 3 });
  },
  // 2: a wind howl sweeping past
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    const f0 = rng.range(320, 460);
    sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 0.6 * Math.sin((Math.PI * t) / d)), q: 10, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' });
    return verb(b, sr, ADD_VERB);
  },
  // 3: a distant voice
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.9, 1.4);
    const b = alloc(d + 0.2, sr);
    moan(b, sr, rng, 0.02, d, rng.range(210, 300), 1);
    lowpass(b, 2000, sr);
    return verb(b, sr, ADD_VERB, { t60: 3.2, wet: 1.6 });
  },
  // 4: a hollow gust
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    sweep(b, sr, rng, { dur: d, f: (t) => 220 + 120 * Math.sin((Math.PI * t) / d), q: 3, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' });
    return verb(b, sr, ADD_VERB);
  },
  // 5: a thin wisp of a whistle
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1, 1.6);
    const b = alloc(d, sr);
    const f0 = rng.range(900, 1300);
    sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 0.25 * Math.sin((Math.PI * t) / d)), q: 28, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' });
    return verb(b, sr, ADD_VERB, { hf: 0.5 });
  },
];

// ------------------------------------------------------------------ basalt deltas

/** Basalt deltas: harsh, surging gusts, hissing ash, a low rumble and crackling rock. */
function deltasLoop(c: Ctx): Float32Array {
  const { rng } = c;
  const lb = new LoopBuilder(c.sr, 16);
  const L = lb.L;
  const g = lb.contour(rng, 9, 1.8);
  const g2 = lb.contour(rng, 6, 1.2, 2);
  lb.bed(1, (b, hs) => sweep(b, hs, rng, { dur: b.length / hs, f: (t) => 600 + 1100 * g(t), q: 0.75, amp: (t) => 0.12 + 0.88 * g(t), color: 'pink' }));
  lb.bed(0.3, (b, hs) => {
    const w = white(b.length, rng);
    highpass(w, 3200, hs);
    lowpass(w, 9000, hs);
    for (let i = 0; i < b.length; i++) b[i] = w[i] * (0.35 + 0.65 * g2(i / hs));
  });
  lb.bed(0.6, (b, hs) => {
    const r = brown(b.length, rng, 0.9993);
    lowpass(r, 130, hs);
    lowpass(r, 130, hs);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * (0.7 + 0.3 * g2(i / hs));
  });
  lb.events(
    0.4,
    0.3,
    (b, hs) => fireCrackles(b, hs, rng, 0, L - 0.05, 2.5, 0.3),
    (y) => reverb(y, lb.hs, { t60: 1.8, hf: 0.35, size: 1.4, wet: 0.8, dry: 0.7, tail: 0 }),
  );
  lb.events(0.2, 0.4, (b, hs) => {
    ticks(b, hs, rng, { dur: L - 0.1, rate: 3, energy: () => 1, f: [700, 2500], t60: [0.01, 0.03], heavy: 1.6, click: 0.4 });
    lowpass(b, 3000, hs);
  });
  return lb.done();
}

/** stones grinding against each other */
function grindInto(b: Float32Array, sr: number, rng: Rng, t: number, d: number, amp: number): void {
  phisem(b, sr, rng, {
    t,
    dur: d,
    rate: 3000,
    energy: (u) => amp * envBump(u, d * 0.35, d * 0.65),
    grain: 0.003,
    heavy: 2.4,
    bands: [
      { f: 380, q: 3, g: 1, spread: 0.25 },
      { f: 820, q: 3, g: 0.7, spread: 0.25 },
      { f: 1700, q: 2, g: 0.35, spread: 0.3 },
    ],
  });
}

const DELTAS_MOODS: ((c: Ctx) => Float32Array)[] = [
  // 0: a deep "plode": a boom with a shower of crackling debris
  (c) => {
    const { sr, rng } = c;
    const b = alloc(2.4, sr);
    thump(b, sr, { f0: rng.range(52, 62), f1: 30, glide: 0.1, tau: 0.3, attack: 0.008, amp: 1.2 });
    burst(b, sr, rng, { dur: 0.9, attack: 0.004, tau: 0.18, lp: 400, color: 'brown', amp: 0.8 });
    fireCrackles(b, sr, rng, 0.05, 1.1, 30, 0.3);
    ticks(b, sr, rng, { t: 0.1, dur: 1.4, rate: 25, energy: (t) => Math.exp(-t / 0.6), f: [500, 2000], t60: [0.01, 0.04], heavy: 1.8, click: 0.4 });
    lowpass(b, 3500, sr);
    return verb(b, sr, MOOD_VERB, { t60: 4.5, tail: 3.2 });
  },
  // 1: rocks grinding
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2, 3);
    const b = alloc(d, sr);
    grindInto(b, sr, rng, 0, d, 1);
    const r0 = rng.range(30, 50);
    creak(b, sr, rng, {
      dur: d,
      rate: (t) => r0 * (1 + 0.4 * Math.sin((Math.PI * t) / d)),
      amp: (t) => 0.6 * envBump(t, d * 0.4, d * 0.6),
      jitter: 0.3,
      bands: [
        { f: 300, q: 4, g: 1 },
        { f: 700, q: 5, g: 0.6 },
      ],
    });
    lowpass(b, 2000, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
  // 2: a heavy rumble rolling through the deltas
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 4);
    const b = alloc(d, sr);
    const rolls = 3 + rng.int(3);
    for (let k = 0; k < rolls; k++) {
      const t = rng.range(0, d * 0.5);
      burst(b, sr, rng, { t, dur: d - t, attack: rng.range(0.05, 0.3), tau: rng.range(0.4, 1), lp: 220, color: 'brown', amp: rng.range(0.4, 1) });
    }
    return verb(b, sr, MOOD_VERB, { t60: 5, tail: 3, highcut: 1200 });
  },
  // 3: a burst of hissing ash, crackles and a small boom
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.6, 2.2);
    const b = alloc(d, sr);
    burst(b, sr, rng, { dur: d, attack: 0.08, tau: d * 0.35, hp: 2500, amp: 0.5, env: (t) => envBump(t, d * 0.2, d * 0.8) });
    fireCrackles(b, sr, rng, 0.02, d * 0.7, 25, 0.2);
    thump(b, sr, { t: 0.02, f0: 70, f1: 40, tau: 0.15, amp: 0.8 });
    lowpass(b, 8000, sr);
    return verb(b, sr, MOOD_VERB, { tail: 3 });
  },
];

const DELTAS_ADDS: ((c: Ctx) => Float32Array)[] = [
  // 0: dry crackling
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.5, 1);
    const b = alloc(d, sr);
    fireCrackles(b, sr, rng, 0.005, d - 0.05, rng.range(20, 35), 0.3);
    return verb(b, sr, ADD_VERB, { wet: 0.7 });
  },
  // 1: debris trickling down
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.8, 1.3);
    const b = alloc(d, sr);
    ticks(b, sr, rng, { dur: d, rate: 45, energy: (t) => envBump(t, d * 0.2, d * 0.8), f: [800, 3200], t60: [0.008, 0.03], heavy: 1.8, click: 0.5 });
    lowpass(b, 4000, sr);
    return verb(b, sr, ADD_VERB);
  },
  // 2: a hiss of ash
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.8, 1.4);
    const b = alloc(d, sr);
    phisem(b, sr, rng, {
      dur: d,
      rate: 6000,
      energy: (t) => envBump(t, d * 0.3, d * 0.7),
      grain: 0.0005,
      heavy: 1.7,
      dry: 0.4,
      bands: [
        { f: 4500, q: 1.2, g: 1, spread: 0.3 },
        { f: 7000, q: 1.5, g: 0.5, spread: 0.2 },
      ],
    });
    highpass(b, 1500, sr);
    return verb(b, sr, ADD_VERB);
  },
  // 3: a short grind
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(0.7, 1.2);
    const b = alloc(d, sr);
    grindInto(b, sr, rng, 0, d, 1);
    lowpass(b, 2400, sr);
    return verb(b, sr, ADD_VERB);
  },
  // 4: a small collapse somewhere near
  (c) => {
    const { sr, rng } = c;
    const b = alloc(1.2, sr);
    const f = rng.range(1000, 1500);
    impact(b, sr, rng, { modes: [f, 1, 0.03, f * 1.52, 0.6, 0.022, f * 2.31, 0.4, 0.015, f * 0.45, 0.5, 0.03], noise: 1.4, noiseTau: 0.004, noiseBp: [2600, 0.7] });
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.8,
      rate: 1800,
      energy: (t) => Math.exp(-t / 0.2),
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 2000, q: 2, g: 1, spread: 0.4 },
        { f: 900, q: 2.4, g: 0.6, spread: 0.3 },
      ],
    });
    lowpass(b, 3500, sr);
    return verb(b, sr, ADD_VERB, { wet: 1.2 });
  },
  // 5: a harsh gust
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1, 1.6);
    const b = alloc(d, sr);
    sweep(b, sr, rng, { dur: d, f: (t) => 700 + 1400 * Math.sin((Math.PI * t) / d), q: 0.8, amp: (t) => Math.pow(envBump(t, d * 0.35, d * 0.65), 1.5), color: 'pink' });
    return verb(b, sr, ADD_VERB, { wet: 0.6 });
  },
];

// ------------------------------------------------------------------ registry

/** a one-shot pool that renders variant v with fns[v % fns.length] */
function pool(name: string, fns: ((c: Ctx) => Float32Array)[], variants: number, max: number): SoundGen {
  return sound(name, variants, (c) => capLen(fns[c.v % fns.length](c), c.sr, max), { trimDb: -70, fadeOut: 0.3 });
}

export function netherSounds(): Record<string, SoundGen> {
  const loop = { loop: true };
  const S: Record<string, SoundGen> = {
    'block.portal.ambient': sound('block.portal.ambient', 2, portalAmbient, { fadeOut: 0.2 }),
    'block.portal.trigger': sound('block.portal.trigger', 2, portalTrigger, { fadeOut: 0.2 }),
    'block.portal.travel': sound('block.portal.travel', 2, portalTravel, { trimDb: -66, fadeOut: 0.3 }),
  };
  const biome = (id: string, loopFn: (c: Ctx) => Float32Array, moods: ((c: Ctx) => Float32Array)[], adds: ((c: Ctx) => Float32Array)[]) => {
    S[`ambient.${id}.loop`] = sound(`ambient.${id}.loop`, 1, loopFn, loop);
    S[`ambient.${id}.mood`] = pool(`ambient.${id}.mood`, moods, moods.length * 2, 8);
    S[`ambient.${id}.additions`] = pool(`ambient.${id}.additions`, adds, adds.length * 2, 5);
  };
  biome('nether_wastes', wastesLoop, WASTES_MOODS, WASTES_ADDS);
  biome('crimson_forest', crimsonLoop, CRIMSON_MOODS, CRIMSON_ADDS);
  biome('warped_forest', warpedLoop, WARPED_MOODS, WARPED_ADDS);
  biome('soul_sand_valley', valleyLoop, VALLEY_MOODS, VALLEY_ADDS);
  biome('basalt_deltas', deltasLoop, DELTAS_MOODS, DELTAS_ADDS);
  return S;
}
