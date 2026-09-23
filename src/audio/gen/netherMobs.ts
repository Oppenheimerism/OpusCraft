// Nether mob vocalisations and foley: zombified piglin, ghast, strider (formant synthesis,
// swept noise and cavernous reverb, in the style of mobs.ts).

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, envExpPts, envPts, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, fireCrackles, phisem, sweep, thump, ticks } from './texture';
import { voice, vowelGlide } from './voice';
import { reverbHalf } from './world';

// ------------------------------------------------------------------ pig-family throats

/** Pitch-independent voice character of a pig-like Nether mob. */
interface Throat {
  /** formant scale (smaller = bigger, deeper head) */
  fs: number;
  rough: number;
  sub: number;
  breath: number;
  /** open quotient (lower = more pressed and brassy) */
  oq: number;
  /** irregular growl flutter: [min rate, max rate, depth] */
  growl: [number, number, number];
  jitter: number;
  shimmer: number;
  /** weight of the ~1 kHz nasal resonance (snouty, honking colour) */
  nasal: number;
}

/** One grunt: timing, pitch contour over normalised time, loudness and mouth opening. */
interface Grunt {
  t: number;
  d: number;
  f0: (x: number) => number;
  /** relative loudness */
  a?: number;
  /** 0 = closed "hrm" .. 1 = open "hrah" */
  open?: number;
}

/**
 * A pig-family grunt: a rough, period-doubled glottal source through a snouty formant set
 * that opens and closes over the grunt, with an irregular growl flutter on top.
 */
function gruntInto(b: Float32Array, c: Ctx, th: Throat, g: Grunt): void {
  const { sr, rng } = c;
  const d = g.d;
  const open = g.open ?? 0.4;
  const F = vowelGlide(rng.pick(['uh', 'o', 'aw']), rng.pick(['er', 'u', 'uh']), d * 0.3, d, th.fs);
  const f1 = 0.8 + 0.4 * open;
  voice(b, sr, rng, {
    t: g.t,
    dur: d,
    f0: (t) => g.f0(t / d),
    amp: (t) => envBump(t, d * 0.15, d * 0.85),
    formants: [
      { f: (t) => F[0](t) * f1 * (0.9 + 0.2 * Math.sin((Math.PI * t) / d)), bw: 120, g: 1 },
      { f: 1000 * th.fs * 1.15, bw: 90, g: 0.6 * th.nasal },
      { f: F[1], bw: 160, g: 0.6 },
      { f: F[2], bw: 260, g: 0.22 },
      { f: 3000 * th.fs, bw: 400, g: 0.06 },
    ],
    jitter: th.jitter,
    shimmer: th.shimmer,
    rough: th.rough,
    sub: th.sub,
    breath: th.breath,
    oq: th.oq,
    growl: [rng.range(th.growl[0], th.growl[1]), th.growl[2]],
    gain: g.a ?? 1,
  });
}

/** Nasal snort: noise through a nostril resonance, fluttering as the soft palate flaps. */
function snortInto(b: Float32Array, c: Ctx, t0: number, d: number, fc: number, inhale = false, a = 1): void {
  const { sr, rng } = c;
  const flap = rng.range(28, 45);
  const ph = rng.next();
  sweep(b, sr, rng, {
    t: t0,
    dur: d,
    f: (t) => fc * (inhale ? 0.85 + 0.3 * (t / d) : 1.15 - 0.3 * (t / d)),
    q: 2.2,
    amp: (t) =>
      a * envBump(t, inhale ? d * 0.6 : d * 0.15, inhale ? d * 0.4 : d * 0.85) * (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * (flap * t + ph)))),
    color: 'pink',
  });
}

/** Phlegm: small low bubbles and a sticky crackle riding on a grunt. */
function gurgleInto(b: Float32Array, c: Ctx, t0: number, d: number, density: number): void {
  const { sr, rng } = c;
  const n = Math.max(1, Math.round(density * d));
  for (let k = 0; k < n; k++) bubble(b, sr, t0 + rng.range(0.05, 0.95) * d, rng.logRange(220, 700), rng.range(0.3, 1), undefined, rng.range(0.2, 0.6));
  phisem(b, sr, rng, {
    t: t0,
    dur: d,
    rate: 400,
    energy: (t) => envBump(t, d * 0.2, d * 0.8),
    grain: 0.0015,
    heavy: 2.5,
    bands: [
      { f: 900, q: 3, g: 1, spread: 0.4 },
      { f: 1700, q: 3, g: 0.5, spread: 0.3 },
    ],
    gain: 0.5,
  });
}

// ------------------------------------------------------------------ zombified piglin

/** Low, rotten and phlegmy: deeper than a pig, with a slow, wet flutter. */
const ZPIG: Throat = { fs: 0.8, rough: 0.6, sub: 0.15, breath: 0.4, oq: 0.45, growl: [17, 26, 0.55], jitter: 0.07, shimmer: 0.3, nasal: 0.35 };

/** Zombified piglin idle: one to three wet, throaty grunts and snorts; each take has its own rhythm. */
function zpigAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1, sr);
  const base = rng.range(78, 92);
  const gs: Grunt[] = [];
  let snort = -1;
  switch (v) {
    case 0: // "hrm-hrrm"
      gs.push({ t: 0, d: 0.17, f0: (x) => base * (1.08 - 0.12 * x) });
      gs.push({ t: 0.25, d: 0.28, f0: (x) => base * (1.12 + 0.1 * Math.sin(Math.PI * x) - 0.3 * x), open: 0.6 });
      break;
    case 1: // one long, gurgling grunt that sags
      gs.push({ t: 0, d: 0.55, f0: (x) => base * (1 + 0.2 * Math.sin(Math.PI * Math.min(1, x * 1.6)) - 0.25 * x), open: 0.5 });
      break;
    case 2: // a snort, then a grunt
      snort = 0;
      gs.push({ t: 0.2, d: 0.3, f0: (x) => base * (1.15 - 0.25 * x), open: 0.35 });
      break;
    case 3: // a questioning "hrrn?" and a short afterthought
      gs.push({ t: 0, d: 0.34, f0: (x) => base * (0.95 + 0.4 * x * x), open: 0.45 });
      gs.push({ t: 0.42, d: 0.14, f0: (x) => base * (1.05 - 0.15 * x), a: 0.7 });
      break;
    default: // three quick, sinking grunts
      for (let k = 0; k < 3; k++) {
        const f = base * (1.2 - 0.12 * k);
        gs.push({ t: k * 0.19, d: rng.range(0.11, 0.14), f0: (x) => f * (1 - 0.1 * x), a: 1 - 0.15 * k });
      }
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, ZPIG, g);
  });
  layer(out, 0.3, (b) => {
    for (const g of gs) gurgleInto(b, c, g.t, g.d, 30);
  });
  layer(out, 0.14, (b) => {
    for (const g of gs) snortInto(b, c, g.t, Math.min(0.08, g.d * 0.5), 1400);
  });
  if (snort >= 0) layer(out, 0.55, (b) => snortInto(b, c, snort, 0.16, rng.range(900, 1300)));
  lowpass(out, 3000, sr);
  return out;
}

/** A snarl that tears upward from a grunt into a harsh squeal, peaking at `peak` (0..1) of its length. */
function snarlInto(b: Float32Array, c: Ctx, t0: number, d: number, fA: number, fB: number, peak: number, a = 1): void {
  const { sr, rng } = c;
  const F = vowelGlide('uh', rng.pick(['ae', 'a']), 0, d * peak, 1.05);
  const k = peak + (1 - peak) * 0.6;
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const u = t / d;
      return u < peak ? fA * Math.pow(fB / fA, smooth(u / peak)) : fB * (1 - (0.18 * (u - peak)) / (1 - peak));
    },
    amp: (t) => envPts(t / d, [0, 0, 0.06, 0.5, peak, 1, k, 0.8, 1, 0]),
    formants: [
      { f: F[0], bw: 150, g: 1 },
      { f: F[1], bw: 190, g: 0.75 },
      { f: F[2], bw: 280, g: 0.35 },
      { f: (t) => 3300 + 400 * (t / d), bw: 400, g: 0.12 },
    ],
    jitter: 0.06,
    shimmer: 0.25,
    rough: 0.5,
    sub: 0.1,
    breath: 0.35,
    oq: 0.36,
    growl: [rng.range(28, 36), 0.4],
    gain: a,
  });
}

/** Zombified piglin angry: a louder grunt that rises into an aggressive, snarling squeal. */
function zpigAngry(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1.1, sr);
  const lo = rng.range(105, 125);
  const hi = rng.range(330, 420);
  let wet = 0;
  let wd = 0.4;
  layer(out, 1, (b) => {
    switch (v) {
      case 0: // one long, rising snarl
        snarlInto(b, c, 0, 0.75, lo, hi, 0.7);
        wet = 0.45;
        break;
      case 1: // a grunt, then the squeal
        gruntInto(b, c, ZPIG, { t: 0, d: 0.15, f0: (x) => lo * 0.85 * (1 - 0.1 * x), open: 0.6 });
        snarlInto(b, c, 0.18, 0.55, lo * 1.1, hi * 1.08, 0.6);
        wet = 0.5;
        break;
      case 2: // a sudden "RRAAGH" that rises fast and falls away
        snarlInto(b, c, 0, 0.5, lo * 1.2, hi * 0.9, 0.42);
        wet = 0.3;
        break;
      default: // two snarls, the second higher
        snarlInto(b, c, 0, 0.32, lo, hi * 0.72, 0.6, 0.8);
        snarlInto(b, c, 0.38, 0.5, lo * 1.15, hi * 1.05, 0.55);
        wet = 0.6;
        wd = 0.3;
    }
  });
  layer(out, 0.22, (b) => gurgleInto(b, c, wet, wd, 45));
  layer(out, 0.2, (b) => snortInto(b, c, 0, 0.09, 1300));
  lowpass(out, 4200, sr);
  return out;
}

/** Zombified piglin hurt: a sharp, pained squeal-grunt that chokes off into a wet rattle. */
function zpigHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = v === 0 ? rng.range(0.22, 0.26) : rng.range(0.3, 0.34);
  const out = alloc(d + 0.25, sr);
  const f = rng.range(190, 230) * (v === 0 ? 1.1 : 1);
  const jump = v === 0 ? 0.9 : 0.65;
  layer(out, 1, (b) => {
    const F = vowelGlide(v === 0 ? 'ae' : 'a', 'uh', d * 0.2, d, 1.05);
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => {
        const x = t / d;
        return f * (x < 0.2 ? 1 + jump * smooth(x / 0.2) : 1 + jump - (jump + 0.2) * smooth((x - 0.2) / 0.8));
      },
      amp: (t) => envAD(t, 0.012, d * 0.45),
      formants: [
        { f: F[0], bw: 150, g: 1 },
        { f: F[1], bw: 190, g: 0.7 },
        { f: F[2], bw: 280, g: 0.3 },
        { f: 3400, bw: 400, g: 0.1 },
      ],
      jitter: 0.05,
      shimmer: 0.22,
      rough: 0.45,
      sub: 0.08,
      breath: 0.35,
      oq: 0.38,
      growl: [rng.range(28, 34), 0.3],
    });
    // the choke: a low gurgling grunt under the tail
    gruntInto(b, c, ZPIG, { t: d * 0.75, d: 0.15, f0: (x) => 85 * (1 - 0.15 * x), a: 0.45 });
  });
  layer(out, 0.25, (b) => gurgleInto(b, c, d * 0.6, 0.2, 40));
  layer(out, 0.3, (b) => snortInto(b, c, 0, 0.06, 1500));
  lowpass(out, 4500, sr);
  return out;
}

/** Zombified piglin death: a drawn-out squeal that sinks into a bubbling, gurgling rattle and fades. */
function zpigDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = v === 0 ? 1.15 : 1.35;
  const out = alloc(d + 0.3, sr);
  const f = rng.range(290, 330) * (v === 0 ? 1 : 1.12);
  const split = d * (v === 0 ? 0.42 : 0.5);
  const rest = d - split;
  layer(out, 1, (b) => {
    const F = vowelGlide(v === 0 ? 'ae' : 'a', 'aw', 0, split, 1.08);
    voice(b, sr, rng, {
      dur: split + 0.08,
      f0: (t) => f * envExpPts(t, [0, 1, 0.12, v === 0 ? 1.2 : 1.32, split + 0.08, 0.75]),
      amp: (t) => envBump(t, 0.05, split + 0.03),
      formants: [
        { f: F[0], bw: 150, g: 1 },
        { f: F[1], bw: 190, g: 0.7 },
        { f: F[2], bw: 280, g: 0.3 },
        { f: 3300, bw: 400, g: 0.1 },
      ],
      jitter: 0.05,
      shimmer: 0.22,
      rough: 0.4,
      sub: 0.08,
      breath: 0.3,
      oq: 0.4,
      growl: [rng.range(28, 34), 0.35],
    });
    // the collapse: the voice sags into a slow, wet rattle
    const G = vowelGlide('aw', 'u', 0, rest, 0.85);
    voice(b, sr, rng, {
      t: split - 0.02,
      dur: rest + 0.02,
      f0: (t) => f * 0.75 * Math.pow(0.4, t / rest),
      amp: (t) => envPts(t, [0, 0, 0.06, 0.85, rest * 0.5, 0.55, rest, 0]),
      formants: [
        { f: G[0], bw: 130, g: 1 },
        { f: G[1], bw: 170, g: 0.6 },
        { f: G[2], bw: 260, g: 0.2 },
      ],
      jitter: 0.08,
      shimmer: 0.35,
      rough: 0.7,
      sub: 0.2,
      breath: 0.45,
      oq: 0.5,
      growl: [rng.range(12, 18), 0.7],
    });
  });
  layer(out, 0.4, (b) => gurgleInto(b, c, split, rest, 45));
  lowpass(out, 3800, sr);
  return out;
}

// ------------------------------------------------------------------ registry

export function netherMobSounds(): Record<string, SoundGen> {
  return {
    'entity.zombified_piglin.ambient': sound('entity.zombified_piglin.ambient', 5, zpigAmbient),
    'entity.zombified_piglin.angry': sound('entity.zombified_piglin.angry', 4, zpigAngry),
    'entity.zombified_piglin.hurt': sound('entity.zombified_piglin.hurt', 2, zpigHurt),
    'entity.zombified_piglin.death': sound('entity.zombified_piglin.death', 2, zpigDeath),
  };
}
