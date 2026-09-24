// Nether mob vocalisations and foley: zombified piglin, ghast, strider, hoglin, piglin (formant synthesis,
// swept noise and cavernous reverb, in the style of mobs.ts).

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, envExpPts, envPts, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, fireCrackles, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import { voice, vowelGlide } from './voice';
import { reverbHalf } from './world';

// ------------------------------------------------------------------ pig-family throats

/** Pitch-independent voice character of a pig-like Nether mob. */
export interface Throat {
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
export interface Grunt {
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
export function gruntInto(b: Float32Array, c: Ctx, th: Throat, g: Grunt): void {
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
export function snortInto(b: Float32Array, c: Ctx, t0: number, d: number, fc: number, inhale = false, a = 1): void {
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
export function gurgleInto(b: Float32Array, c: Ctx, t0: number, d: number, density: number): void {
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
export const ZPIG: Throat = { fs: 0.8, rough: 0.6, sub: 0.12, breath: 0.4, oq: 0.45, growl: [17, 26, 0.55], jitter: 0.07, shimmer: 0.3, nasal: 0.35 };

/** Zombified piglin idle: one to three wet, throaty grunts and snorts; each take has its own rhythm. */
function zpigAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1, sr);
  const base = rng.range(84, 98);
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
export function snarlInto(b: Float32Array, c: Ctx, t0: number, d: number, fA: number, fB: number, peak: number, a = 1): void {
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
      amp: (t) => envAD(t, 0.012, d * 0.45) * Math.min(1, (d - t) / 0.03),
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

// ------------------------------------------------------------------ ghast

/** One ghast cry: pitch and loudness over normalised time, a vowel glide and vibrato depths. */
interface Cry {
  t?: number;
  d: number;
  f0: (x: number) => number;
  amp: (x: number) => number;
  from: string;
  to: string;
  /** extra formant scale (smaller, brighter mouth) */
  bright?: number;
  breath?: number;
  /** vibrato depth (fraction) at the start and at the end */
  vib?: [number, number];
  rough?: number;
  oq?: number;
}

/**
 * A ghast cry: a high, child-like voice (formants scaled ~1.5x) whose vibrato blooms just
 * after the onset, like a crying toddler or a mewling cat.
 */
function cryInto(b: Float32Array, c: Ctx, o: Cry): void {
  const { sr, rng } = c;
  const d = o.d;
  const F = vowelGlide(o.from, o.to, d * 0.1, d * 0.9, 1.45 + (o.bright ?? 0));
  const vr = rng.range(5, 6.5);
  const [va, vb] = o.vib ?? [0.03, 0.03];
  const ph = rng.next() * TAU;
  voice(b, sr, rng, {
    t: o.t,
    dur: d,
    f0: (t) => o.f0(t / d) * (1 + (va + ((vb - va) * t) / d) * smooth(t / 0.25) * Math.sin(TAU * vr * t + ph)),
    amp: (t) => o.amp(t / d),
    formants: [
      // F1 rides just above the fundamental once the cry climbs past it (formant tuning)
      { f: (t) => Math.max(F[0](t), 1.1 * o.f0(t / d)), bw: 130, g: 1 },
      { f: F[1], bw: 170, g: 0.6 },
      { f: F[2], bw: 280, g: 0.3 },
      { f: F[3], bw: 420, g: 0.12 },
    ],
    jitter: 0.012,
    shimmer: 0.06,
    rough: o.rough ?? 0.06,
    breath: o.breath ?? 0.2,
    oq: o.oq ?? 0.62,
  });
}

/** The ghast's voice rings through a huge Nether cavern: a long, dark, diffuse tail. */
function cavern(buf: Float32Array, sr: number, t60: number, wet: number): Float32Array {
  highpass(buf, 160, sr);
  return reverbHalf(buf, sr, { t60, wet, dry: 0.9, size: 1.8, pre: 0.03, hf: 0.35, lowcut: 200, tail: t60 * 0.75 });
}

/** Ghast moan: a drawn-out, eerie coo or crying wail with vibrato; seven different shapes. */
function ghastMoan(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(430, 520);
  const bump = (a: number) => (x: number) => envBump(x, a, 1 - a);
  const cries: Cry[] = [];
  switch (v) {
    case 0: // a rise-and-fall coo, "ooOOoo"
      cries.push({ d: 1.5, f0: (x) => base * (1 + 0.3 * Math.sin(Math.PI * x)), amp: bump(0.3), from: 'u', to: 'o' });
      break;
    case 1: // a falling cry, "waaah"
      cries.push({ d: 1.3, f0: (x) => base * 1.45 * (1 - 0.38 * Math.pow(x, 1.3)), amp: (x) => envPts(x, [0, 0, 0.08, 1, 0.6, 0.8, 1, 0]), from: 'a', to: 'u', breath: 0.25 });
      break;
    case 2: // a sob: a short "oo", then a longer, breaking wail
      cries.push({ d: 0.55, f0: (x) => base * 1.2 * (1 - 0.1 * x), amp: bump(0.25), from: 'o', to: 'a' });
      cries.push({ t: 0.65, d: 1.05, f0: (x) => base * 1.3 * (1 + 0.15 * Math.sin(Math.PI * x) - 0.3 * x), amp: bump(0.2), from: 'a', to: 'u', vib: [0.03, 0.05] });
      break;
    case 3: // a coo that lifts at the end, "oooo-OO?"
      cries.push({ d: 1.4, f0: (x) => base * (0.9 + 0.55 * x * x * x), amp: bump(0.35), from: 'u', to: 'oo', bright: 0.15 });
      break;
    case 4: // a long, wavering wail
      cries.push({ d: 2, f0: (x) => base * (1.05 + 0.12 * Math.sin(TAU * 1.5 * x) - 0.1 * x), amp: bump(0.3), from: 'oo', to: 'aw', vib: [0.025, 0.045] });
      break;
    case 5: // a high, sobbing whimper
      cries.push({
        d: 0.95,
        f0: (x) => base * 1.6 * (1 - 0.15 * x),
        amp: (x) => envBump(x, 0.15, 0.85) * (0.7 + 0.3 * Math.cos(TAU * 3.5 * x)),
        from: 'ae',
        to: 'u',
        bright: 0.1,
        breath: 0.3,
      });
      break;
    default: // a low, slow moan
      cries.push({ d: 1.9, f0: (x) => base * 0.78 * (1 + 0.25 * Math.sin(Math.PI * Math.pow(x, 0.7))), amp: bump(0.35), from: 'u', to: 'aw', vib: [0.02, 0.04] });
  }
  const len = Math.max(...cries.map((q) => (q.t ?? 0) + q.d)) + 0.05;
  const out = alloc(len, sr);
  layer(out, 1, (b) => {
    for (const q of cries) cryInto(b, c, q);
  });
  return cavern(out, sr, 3.2, 0.75);
}

/** Pitch shapes (normalised time, pitch ratio) of the five ghast shrieks. */
const SHRIEKS: readonly (readonly number[])[] = [
  [0, 0.8, 0.12, 1, 1, 0.6], // snaps up, then falls
  [0, 0.9, 0.35, 1.1, 1, 0.75], // rises and falls
  [0, 0.85, 0.08, 1, 0.4, 0.82, 0.5, 1.05, 1, 0.65], // a double yelp
  [0, 1.1, 1, 0.7], // one sharp, falling yelp
  [0, 0.85, 0.2, 1, 1, 0.7], // a wavering shriek
];

/** Ghast hurt / scream: a short, shrill, pained shriek (a cat-like "mrEEow") with a cavern tail. */
function ghastShriek(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const k = v % SHRIEKS.length;
  const hi = rng.range(1000, 1250);
  const d = [0.42, 0.34, 0.52, 0.3, 0.46][k] * rng.range(0.92, 1.08);
  const out = alloc(d + 0.05, sr);
  layer(out, 1, (b) =>
    cryInto(b, c, {
      d,
      f0: (x) => hi * envExpPts(x, SHRIEKS[k]) * (k === 4 ? 1 + 0.05 * Math.sin(TAU * 11 * x * d) : 1),
      amp: k === 2 ? (x) => envPts(x, [0, 0, 0.04, 1, 0.34, 0.7, 0.4, 0.15, 0.46, 1, 1, 0]) : (x) => envPts(x, [0, 0, 0.05, 1, 0.5, 0.75, 1, 0]),
      // "ee-ow": the vowel opens as the pitch falls, like a cat's screech
      from: rng.pick(['i', 'ih', 'e']),
      to: rng.pick(['ae', 'aw']),
      bright: 0.1,
      breath: 0.3,
      vib: [0.02, 0.04],
      rough: 0.25,
      oq: 0.45,
    }),
  );
  return cavern(out, sr, 1.8, 0.45);
}

/** Ghast death: a long wail that falls away, its vibrato widening as it dies. */
function ghastDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 2.1;
  const out = alloc(d + 0.05, sr);
  const hi = rng.range(1050, 1150);
  layer(out, 1, (b) =>
    cryInto(b, c, {
      d,
      f0: (x) => hi * envExpPts(x, [0, 0.85, 0.1, 1, 0.35, 0.85, 1, 0.3]),
      amp: (x) => envPts(x, [0, 0, 0.05, 1, 0.4, 0.85, 1, 0]),
      from: 'a',
      to: 'u',
      breath: 0.28,
      vib: [0.02, 0.07],
      rough: 0.15,
      oq: 0.5,
    }),
  );
  return cavern(out, sr, 3.5, 0.8);
}

/** Ghast warn: the loud, rising "affectionate scream" it lets out just before it spits a fireball. */
function ghastWarn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 1.05;
  const out = alloc(d + 0.05, sr);
  const f = rng.range(460, 500);
  layer(out, 1, (b) =>
    cryInto(b, c, {
      d,
      f0: (x) => f * envExpPts(x, [0, 1, 0.15, 1.1, 0.8, 2.6, 1, 2.45]),
      amp: (x) => envPts(x, [0, 0, 0.1, 0.55, 0.75, 1, 1, 0]),
      from: 'u',
      to: 'i',
      bright: 0.1,
      breath: 0.25,
      vib: [0.02, 0.045],
      rough: 0.15,
      oq: 0.5,
    }),
  );
  return cavern(out, sr, 2.6, 0.6);
}

/** Ghast shoot: the fireball launching, a deep, fiery "fwoomp" of flame with a few crackles. */
function ghastShoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.3, sr);
  const fl = rng.range(9, 13);
  // the roar of the flame: dark noise with a fast swell, a flickering body and a long tail
  layer(out, 1, (b) =>
    burst(b, sr, rng, { dur: 1.2, attack: 0.035, tau: 0.22, lp: 900, color: 'brown', env: (t) => 0.72 + 0.28 * Math.sin(TAU * fl * t + 2 * Math.sin(TAU * 3.3 * t)) }),
  );
  // the whoosh: the band swings up as the fireball leaves, then settles
  layer(out, 0.75, (b) =>
    sweep(b, sr, rng, { dur: 1, f: (t) => envExpPts(t, [0, 280, 0.09, 1500, 0.7, 420]), q: 1.1, amp: (t) => envAD(t, 0.05, 0.22), color: 'pink' }),
  );
  // the hiss of the flame front
  layer(out, 0.22, (b) => burst(b, sr, rng, { dur: 0.5, attack: 0.02, tau: 0.08, hp: 2500 }));
  // a deep pressure thump
  layer(out, 0.8, (b) => thump(b, sr, { f0: 120, f1: 45, glide: 0.06, tau: 0.12, attack: 0.012 }));
  layer(out, 0.25, (b) => fireCrackles(b, sr, rng, 0.03, 0.7, 70, 0.1));
  return reverbHalf(out, sr, { t60: 1.4, wet: 0.35, size: 1.4, pre: 0.02, hf: 0.4, lowcut: 150, tail: 1 });
}

// ------------------------------------------------------------------ strider

/** One strider trill: pitch contour and trill rate (Hz) over normalised time. */
interface Trill {
  t?: number;
  d: number;
  f0: (x: number) => number;
  rate: (x: number) => number;
  /** FM depth of the trill (fraction) */
  depth: number;
  /** 0 = muffled coo .. 1 = bright chirp */
  bright?: number;
  rough?: number;
  a?: number;
  /** loudness over normalised time (default: a soft bump) */
  env?: (x: number) => number;
}

/**
 * Strider trill: a soft, closed-mouth coo whose pitch and loudness flutter together at a
 * lip-trill rate ("brrrr"), a warbling purr somewhere between a pigeon and a turkey.
 */
function trillInto(b: Float32Array, c: Ctx, o: Trill): void {
  const { sr, rng } = c;
  const d = o.d;
  const br = o.bright ?? 0;
  const F = vowelGlide(rng.pick(['u', 'oo', 'o']), rng.pick(['u', 'o', 'er']), 0, d, 1.15 + 0.35 * br);
  // integrate the trill phase at a 400 Hz control rate so the trill rate can glide
  const K = 400;
  const N = Math.ceil(d * K) + 2;
  const ph = new Float64Array(N);
  ph[0] = rng.next();
  for (let k = 1; k < N; k++) ph[k] = ph[k - 1] + o.rate(Math.min(1, k / K / d)) / K;
  const trill = (t: number): number => {
    const u = Math.min(N - 1.001, t * K);
    const k = Math.floor(u);
    return Math.sin(TAU * (ph[k] + (ph[k + 1] - ph[k]) * (u - k)));
  };
  const env = o.env ?? ((x: number) => envBump(x, 0.15, 0.85));
  voice(b, sr, rng, {
    t: o.t,
    dur: d,
    f0: (t) => o.f0(t / d) * (1 + o.depth * trill(t)),
    amp: (t) => env(t / d) * (0.62 + 0.38 * trill(t)),
    formants: [
      { f: (t) => Math.max(F[0](t), 1.1 * o.f0(t / d)), bw: 90, g: 1 },
      { f: F[1], bw: 140, g: 0.45 + 0.3 * br },
      { f: F[2], bw: 240, g: 0.15 + 0.15 * br },
    ],
    jitter: 0.02,
    shimmer: 0.08,
    rough: o.rough ?? 0.1,
    breath: 0.12,
    oq: 0.6 - 0.15 * br,
    gain: o.a ?? 1,
  });
}

/** Render a set of trills, high-passed at `hp` Hz (0 = off). */
function trills(c: Ctx, ts: Trill[], hp: number): Float32Array {
  const { sr } = c;
  const len = Math.max(...ts.map((q) => (q.t ?? 0) + q.d)) + 0.05;
  const out = alloc(len, sr);
  layer(out, 1, (b) => {
    for (const q of ts) trillInto(b, c, q);
  });
  if (hp) highpass(out, hp, sr);
  lowpass(out, 4500, sr);
  return out;
}

/** Strider idle: gentle, warbling trills and purrs; five different shapes. */
function striderAmbient(c: Ctx): Float32Array {
  const { rng, v } = c;
  const base = rng.range(190, 240);
  const r = rng.range(19, 25);
  const ts: Trill[] = [];
  switch (v) {
    case 0: // "brrr-rrup": lifts at the end
      ts.push({ d: 0.55, f0: (x) => base * (1 + 0.25 * x * x), rate: () => r, depth: 0.05 });
      break;
    case 1: // a sinking purr that slows as it falls
      ts.push({ d: 0.7, f0: (x) => base * 1.2 * (1 - 0.25 * x), rate: (x) => r * (1 - 0.25 * x), depth: 0.06 });
      break;
    case 2: // two short trills
      ts.push({ d: 0.25, f0: (x) => base * (1.05 + 0.1 * x), rate: () => r, depth: 0.05 });
      ts.push({ t: 0.33, d: 0.3, f0: (x) => base * (1.1 - 0.15 * x), rate: () => r * 0.9, depth: 0.05, a: 0.85 });
      break;
    case 3: // a slow, rolling warble that rises and falls
      ts.push({ d: 0.6, f0: (x) => base * (1 + 0.2 * Math.sin(Math.PI * x)), rate: () => r * 0.6, depth: 0.09 });
      break;
    default: // a long, low, contented purr
      ts.push({ d: 0.85, f0: (x) => base * 0.82 * (1 + 0.1 * Math.sin(Math.PI * x)), rate: (x) => r * (1.1 - 0.2 * x), depth: 0.04, rough: 0.18 });
  }
  return trills(c, ts, 0);
}

/** Strider happy (tempted with warped fungus): a bright, chirpy, rising warble. */
function striderHappy(c: Ctx): Float32Array {
  const { rng, v } = c;
  const base = rng.range(380, 450);
  const r = rng.range(26, 32);
  const ts: Trill[] = [];
  switch (v) {
    case 0: // one rising chirp
      ts.push({ d: 0.34, f0: (x) => base * (0.9 + 0.45 * x), rate: () => r, depth: 0.05, bright: 1 });
      break;
    case 1: // two chirps, the second higher
      ts.push({ d: 0.18, f0: (x) => base * (0.95 + 0.25 * x), rate: () => r, depth: 0.04, bright: 1 });
      ts.push({ t: 0.24, d: 0.24, f0: (x) => base * (1.1 + 0.35 * x), rate: () => r, depth: 0.05, bright: 1 });
      break;
    case 2: // a warble that trills faster and flicks up
      ts.push({ d: 0.42, f0: (x) => base * (1 + 0.1 * Math.sin(Math.PI * x) + 0.4 * Math.pow(x, 4)), rate: (x) => r * (1 + 0.3 * x), depth: 0.07, bright: 0.8 });
      break;
    default: // "brr-ip!": a quick up-flick
      ts.push({ d: 0.26, f0: (x) => base * envExpPts(x, [0, 0.85, 0.6, 1.05, 1, 1.5]), rate: () => r * 1.1, depth: 0.05, bright: 1 });
  }
  return trills(c, ts, 250);
}

/** Strider retreat (scared): a short, worried squeak. */
function striderRetreat(c: Ctx): Float32Array {
  const { rng, v } = c;
  const f = rng.range(520, 600);
  const ts: Trill[] = [];
  if (v === 2) ts.push({ d: 0.24, f0: (x) => f * 1.1 * envExpPts(x, [0, 1.3, 0.3, 1.45, 1, 0.9]), rate: () => 34, depth: 0.04, bright: 1 });
  else ts.push({ d: rng.range(0.16, 0.2), f0: (x) => f * envExpPts(x, [0, 1, 0.4, 1.45, 1, 1.1]), rate: () => 30, depth: 0.03, bright: 1 });
  if (v === 1) ts.push({ t: 0.22, d: 0.14, f0: (x) => f * 1.2 * envExpPts(x, [0, 1, 0.4, 1.3, 1, 1]), rate: () => 30, depth: 0.03, bright: 1, a: 0.75 });
  return trills(c, ts, 300);
}

/** Strider hurt: a sharp, squawking warble; four different squawks. */
function striderHurt(c: Ctx): Float32Array {
  const { rng, v } = c;
  const f = rng.range(400, 460);
  const r = rng.range(30, 36);
  const env = (x: number) => envPts(x, [0, 0, 0.06, 1, 0.5, 0.7, 1, 0]);
  const q = (t: number, d: number, shape: number[], a = 1, rate = r): Trill => ({ t, d, f0: (x) => f * envExpPts(x, shape), rate: () => rate, depth: 0.06, bright: 0.7, rough: 0.35, env, a });
  switch (v) {
    case 0: // a sharp, falling squawk
      return trills(c, [q(0, rng.range(0.22, 0.28), [0, 1.25, 0.15, 1.45, 1, 0.8])], 200);
    case 1: // a double squawk
      return trills(c, [q(0, 0.12, [0, 1.2, 0.3, 1.45, 1, 1.1]), q(0.15, 0.16, [0, 1.3, 0.25, 1.5, 1, 0.95], 0.85)], 200);
    case 2: // a yelp cut short on its way up
      return trills(c, [q(0, 0.17, [0, 1, 0.6, 1.55, 1, 1.35])], 200);
    default: // a longer, wobbling squawk with a slower trill
      return trills(c, [q(0, 0.34, [0, 1.35, 0.2, 1.4, 1, 0.75], 1, r * 0.65)], 200);
  }
}

/** Strider death: a long warble that sinks, its trill slowing, and fades out. */
function striderDeath(c: Ctx): Float32Array {
  const { rng, v } = c;
  const f = rng.range(340, 380);
  const env = (x: number) => envPts(x, [0, 0, 0.05, 1, 0.5, 0.7, 1, 0]);
  const sink: Trill = { d: 0.95, f0: (x) => f * envExpPts(x, [0, 1.2, 0.2, 1.1, 1, 0.42]), rate: (x) => 26 - 16 * x, depth: 0.07, bright: 0.4, rough: 0.2, env };
  if (v === 0) return trills(c, [sink], 120);
  // a last squawk, then the long sinking warble
  const squawk: Trill = { d: 0.16, f0: (x) => f * 1.2 * envExpPts(x, [0, 1, 0.3, 1.3, 1, 1]), rate: () => 32, depth: 0.05, bright: 0.7, rough: 0.35, env };
  return trills(c, [squawk, { ...sink, t: 0.22, d: 1.05, f0: (x) => f * envExpPts(x, [0, 1.1, 0.25, 1, 1, 0.38]) }], 120);
}

/** Strider step: a soft, squishy footfall — a wet squelch over a dull thud. */
function striderStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const p = rng.range(0.85, 1.2);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.24, f: (t) => 700 * p * Math.pow(0.45, t / 0.16), q: 2.4, amp: (t) => envAD(t, 0.008, 0.045) }));
  layer(out, 0.7, (b) => thump(b, sr, { f0: 110 * p, f1: 65, tau: 0.03, attack: 0.004 }));
  layer(out, 0.3, (b) => {
    const n = 2 + rng.int(2);
    for (let k = 0; k < n; k++) bubble(b, sr, rng.range(0.01, 0.08), rng.range(350, 800), 1, undefined, 0.5);
  });
  lowpass(out, 3000, sr);
  return out;
}

/** Strider step on lava: a soft, slurpy press into the lava with a brief sizzle. */
function striderStepLava(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const p = rng.range(0.85, 1.2);
  layer(out, 0.8, (b) => sweep(b, sr, rng, { dur: 0.32, f: (t) => 480 * p * Math.pow(0.5, t / 0.22), q: 1.8, amp: (t) => envAD(t, 0.015, 0.06) }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 90 * p, f1: 55, tau: 0.035, attack: 0.008 }));
  layer(out, 0.7, (b) =>
    phisem(b, sr, rng, {
      dur: 0.42,
      rate: 9000,
      energy: (t) => envAD(t, 0.02, 0.1),
      grain: 0.0004,
      heavy: 2,
      bands: [
        { f: 5500, q: 1.2, g: 1, spread: 0.3 },
        { f: 3200, q: 1.5, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.3, (b) => fireCrackles(b, sr, rng, 0.01, 0.25, 25));
  layer(out, 0.3, (b) => bubble(b, sr, rng.range(0.03, 0.1), rng.range(160, 280), 1, 0.03, 0.4));
  return out;
}

/** Strider eat: slow, soft munching — two or three wet, crunchy chews. */
function striderEat(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const n = 2 + (v % 2);
  const gap = rng.range(0.11, 0.15);
  const d = n * gap + 0.12;
  const out = alloc(d, sr);
  const at: number[] = [];
  for (let k = 0; k < n; k++) at.push(k * gap + rng.range(0, 0.02));
  const en = (t: number) => {
    let e = 0;
    for (const a of at) e += envAD(t - a, 0.006, 0.03);
    return Math.min(1, e);
  };
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 3500,
      energy: en,
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 1500, q: 2, g: 1, spread: 0.4 },
        { f: 3000, q: 2, g: 0.6, spread: 0.3 },
        { f: 700, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.5, (b) => {
    for (const a of at) sweep(b, sr, rng, { t: a, dur: 0.16, f: (t) => 900 * Math.pow(0.5, t / 0.09), q: 2, amp: (t) => envAD(t, 0.01, 0.03) });
  });
  layer(out, 0.45, (b) => {
    for (const a of at) thump(b, sr, { t: a, f0: 150, f1: 90, tau: 0.02 });
  });
  lowpass(out, 5000, sr);
  return out;
}

/** Saddling a strider (or a pig): the leather saddle flops on (a dull slap and a creak) with a buckle clink. */
function saddle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.002, tau: 0.02, bp: [900, 0.9] }));
  layer(out, 0.6, (b) => thump(b, sr, { f0: 160, f1: 90, tau: 0.03 }));
  layer(out, 0.5, (b) =>
    creak(b, sr, rng, {
      t: 0.08,
      dur: 0.3,
      rate: (t) => 90 + 150 * t,
      amp: (t) => envBump(t, 0.08, 0.22),
      jitter: 0.3,
      bands: [
        { f: 700, q: 3, g: 1 },
        { f: 1800, q: 4, g: 0.5 },
      ],
    }),
  );
  layer(out, 0.45, (b) =>
    ticks(b, sr, rng, { t: 0.12, dur: 0.25, rate: 25, energy: (t) => envAD(t, 0.001, 0.08), f: [2600, 4200], t60: [0.05, 0.12], ratios: [1, 2.76, 5.4], weights: [1, 0.5, 0.25], click: 0.3 }),
  );
  return out;
}

// ------------------------------------------------------------------ hoglin

/** A huge boar: deep, rough and breathy, with little nasal honk. */
export const HOGLIN: Throat = { fs: 0.7, rough: 0.55, sub: 0.12, breath: 0.45, oq: 0.4, growl: [22, 30, 0.45], jitter: 0.06, shimmer: 0.25, nasal: 0.25 };
/** The same throat pushed hard: more pressed, rougher and breathier. */
export const HOGLIN_ROAR: Throat = { ...HOGLIN, rough: 0.6, oq: 0.34, breath: 0.5, growl: [26, 34, 0.5] };

/** A pained squeal-grunt: the pitch jumps up by `jump` and falls back past where it started. */
export function yelpInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, jump: number, fs: number, rough: number, a = 1): void {
  const { sr, rng } = c;
  const F = vowelGlide(rng.pick(['ae', 'a']), 'uh', d * 0.2, d, fs);
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (x < 0.2 ? 1 + jump * smooth(x / 0.2) : 1 + jump - (jump + 0.2) * smooth((x - 0.2) / 0.8));
    },
    amp: (t) => envAD(t, 0.012, d * 0.45) * Math.min(1, (d - t) / 0.03),
    formants: [
      { f: F[0], bw: 150, g: 1 },
      { f: 1000 * fs * 1.15, bw: 90, g: 0.3 },
      { f: F[1], bw: 190, g: 0.7 },
      { f: F[2], bw: 280, g: 0.3 },
      { f: 3400 * fs, bw: 400, g: 0.1 },
    ],
    jitter: 0.05,
    shimmer: 0.22,
    rough,
    sub: 0.08,
    breath: 0.35,
    oq: 0.38,
    growl: [rng.range(28, 34), 0.3],
    gain: a,
  });
}

/** Hoglin idle: deep, aggressive boar grunts and heavy snorts. */
function hoglinAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1, sr);
  const base = rng.range(60, 72);
  const gs: Grunt[] = [];
  const snorts: [number, number, boolean][] = []; // [start, length, inhale]
  switch (v) {
    case 0: // one deep "HRUNGH"
      snorts.push([0, 0.07, false]);
      gs.push({ t: 0.04, d: 0.3, f0: (x) => base * (1.15 + 0.1 * Math.sin(Math.PI * x) - 0.3 * x), open: 0.6 });
      break;
    case 1: // two sniffing snorts, then a grunt
      snorts.push([0, 0.1, true], [0.16, 0.1, true]);
      gs.push({ t: 0.34, d: 0.26, f0: (x) => base * (1.1 - 0.2 * x), open: 0.5 });
      break;
    case 2: // "hrm-HRMPH"
      gs.push({ t: 0, d: 0.16, f0: (x) => base * (1 - 0.1 * x), open: 0.3, a: 0.7 });
      gs.push({ t: 0.22, d: 0.3, f0: (x) => base * (1.25 - 0.35 * x), open: 0.8 });
      break;
    case 3: // a long, rumbling grunt that sinks
      gs.push({ t: 0, d: 0.58, f0: (x) => base * (1.1 + 0.12 * Math.sin(Math.PI * Math.min(1, 1.5 * x)) - 0.35 * x), open: 0.55 });
      break;
    default: // a grunt, then a huffing snort out
      gs.push({ t: 0, d: 0.24, f0: (x) => base * (1.2 - 0.25 * x), open: 0.7 });
      snorts.push([0.28, 0.18, false]);
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, HOGLIN, g);
  });
  if (snorts.length) {
    layer(out, 0.6, (b) => {
      for (const [t, d, inhale] of snorts) snortInto(b, c, t, d, rng.range(650, 900), inhale);
    });
  }
  layer(out, 0.12, (b) => {
    for (const g of gs) snortInto(b, c, g.t, Math.min(0.08, g.d * 0.4), 900);
  });
  lowpass(out, 3200, sr);
  return out;
}

/** Hoglin angry: a loud, snorting roar that swells and breaks. */
function hoglinAngry(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1.2, sr);
  const base = rng.range(72, 85);
  const gs: Grunt[] = [];
  let sn = -1;
  switch (v) {
    case 0: // a snort, then the roar
      sn = 0;
      gs.push({ t: 0.12, d: 0.7, f0: (x) => base * envExpPts(x, [0, 1, 0.35, 1.7, 1, 1.15]), open: 1 });
      break;
    case 1: // a long roar with two swells
      gs.push({ t: 0, d: 0.9, f0: (x) => base * (1.3 + 0.35 * Math.sin(Math.PI * x) + 0.15 * Math.sin(TAU * 2 * x)), open: 0.9 });
      break;
    case 2: // a grunt, then the roar
      gs.push({ t: 0, d: 0.16, f0: (x) => base * (1.1 - 0.1 * x), open: 0.5, a: 0.7 });
      gs.push({ t: 0.2, d: 0.65, f0: (x) => base * envExpPts(x, [0, 1.2, 0.3, 1.9, 1, 1.2]), open: 1 });
      break;
    default: // two short roars
      gs.push({ t: 0, d: 0.36, f0: (x) => base * envExpPts(x, [0, 1.1, 0.4, 1.6, 1, 1.2]), open: 0.9, a: 0.85 });
      gs.push({ t: 0.42, d: 0.5, f0: (x) => base * envExpPts(x, [0, 1.2, 0.35, 1.85, 1, 1.25]), open: 1 });
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, HOGLIN_ROAR, g);
  });
  // the breath of the roar
  layer(out, 0.3, (b) => {
    for (const g of gs) {
      const d = g.d;
      sweep(b, sr, rng, { t: g.t, dur: d, f: (t) => 800 + 500 * Math.sin((Math.PI * t) / d), q: 1.2, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' });
    }
  });
  if (sn >= 0) layer(out, 0.7, (b) => snortInto(b, c, sn, 0.12, 750, true));
  lowpass(out, 4000, sr);
  return out;
}

/** Hoglin attack: the heavy grunt of a headbutt, with the thud of the toss. */
function hoglinAttack(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.45, sr);
  const base = rng.range(80, 95) * (v === 0 ? 1 : 0.9);
  const d = v === 0 ? rng.range(0.2, 0.24) : rng.range(0.26, 0.3);
  layer(out, 1, (b) => gruntInto(b, c, HOGLIN_ROAR, { t: 0, d, f0: (x) => base * envExpPts(x, [0, 1.2, 0.25, 1.35, 1, 0.9]), open: 0.9 }));
  layer(out, 0.55, (b) => thump(b, sr, { t: 0.02, f0: 105, f1: 48, tau: 0.06, attack: 0.003 }));
  layer(out, 0.35, (b) => snortInto(b, c, d * 0.8, 0.14, 800));
  lowpass(out, 3800, sr);
  return out;
}

/** Hoglin hurt: a deep, pained squeal-grunt; three different shapes. */
function hoglinHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(0.26, 0.34);
  const out = alloc(d + 0.3, sr);
  const f = rng.range(120, 140);
  layer(out, 1, (b) => {
    if (v === 0) {
      // a squeal that sinks into a grunt
      yelpInto(b, c, 0, d, f, 0.6, 0.8, 0.5);
      gruntInto(b, c, HOGLIN, { t: d * 0.7, d: 0.16, f0: (x) => 70 * (1 - 0.15 * x), a: 0.5 });
    } else if (v === 1) {
      // "hrk-EEGH": a caught grunt, then the squeal
      gruntInto(b, c, HOGLIN_ROAR, { t: 0, d: 0.1, f0: (x) => 85 * (1 + 0.1 * x), open: 0.7, a: 0.8 });
      yelpInto(b, c, 0.09, d, f * 1.1, 0.75, 0.8, 0.5);
    } else {
      // a short, sharp yelp
      yelpInto(b, c, 0, d * 0.7, f * 1.18, 0.5, 0.8, 0.55);
    }
  });
  layer(out, 0.3, (b) => snortInto(b, c, 0, 0.06, 900));
  lowpass(out, 4200, sr);
  return out;
}

/** Hoglin death: a long, groaning squeal that sinks into a rattling grunt. */
function hoglinDeath(c: Ctx): Float32Array {
  const { rng, v } = c;
  return deathGroan(c, rng.range(150, 175), 0.78, [0.9, 1.05, 0.8][v % 3], [1.3, 1.45, 1.2][v % 3], 700);
}

/**
 * A pig-family death: a groaning squeal that lifts to `peak` x its starting pitch, then sinks
 * to less than half of it as the voice gives out, ending on a last snorting breath.
 */
export function deathGroan(c: Ctx, f: number, fs: number, d: number, peak: number, snort: number): Float32Array {
  const { sr, rng } = c;
  const out = alloc(d + 0.25, sr);
  layer(out, 1, (b) => {
    const F = vowelGlide(rng.pick(['a', 'ae']), 'uh', 0, d, fs);
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => f * envExpPts(t / d, [0, 1, 0.15, peak, 0.5, 0.9, 1, 0.4]),
      amp: (t) => envPts(t / d, [0, 0, 0.05, 1, 0.45, 0.8, 1, 0]),
      formants: [
        { f: F[0], bw: 140, g: 1 },
        { f: 1150 * fs, bw: 90, g: 0.2 },
        { f: F[1], bw: 180, g: 0.65 },
        { f: F[2], bw: 270, g: 0.25 },
      ],
      jitter: 0.06,
      shimmer: 0.28,
      rough: 0.55,
      sub: 0.12,
      breath: 0.4,
      oq: 0.4,
      growl: [rng.range(18, 24), 0.5],
    });
  });
  layer(out, 0.3, (b) => snortInto(b, c, d * 0.8, 0.22, snort));
  lowpass(out, 3800, sr);
  return out;
}

/** Hoglin step: a heavy cloven hoof coming down hard, with a gritty scrape. */
function hoglinStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(95, 130);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.07, f * 2.2, 0.5, 0.05, f * 3.9, 0.25, 0.03, 900, 0.12, 0.012],
      jitter: 0.05,
      noise: 0.5,
      noiseTau: 0.004,
      noiseBp: [1200, 0.8],
    }),
  );
  layer(out, 0.8, (b) => thump(b, sr, { f0: 110, f1: 50, tau: 0.045, attack: 0.002 }));
  layer(out, 0.4, (b) =>
    phisem(b, sr, rng, {
      dur: 0.2,
      rate: 5000,
      energy: twoBump(0.004, 0.025, rng.range(0.03, 0.05), 0.4, 0.008, 0.03),
      grain: 0.0007,
      heavy: 2.5,
      bands: [
        { f: 2600, q: 1.2, g: 1, spread: 0.35 },
        { f: 1300, q: 1.2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  lowpass(out, 5000, sr);
  return out;
}

/** Hoglin retreat (repelled by warped fungus): a startled snort and a reluctant, squealing grunt. */
function hoglinRetreat(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.7, sr);
  layer(out, 0.7, (b) => snortInto(b, c, 0, 0.12, 800, v === 1));
  layer(out, 1, (b) => {
    const d = rng.range(0.3, 0.38);
    yelpInto(b, c, 0.1, d, rng.range(135, 160), 0.5 + 0.15 * v, 0.8, 0.45);
    // the third take backs off with a sulky grunt
    if (v === 2) gruntInto(b, c, HOGLIN, { t: 0.12 + d, d: 0.2, f0: (x) => 68 * (1.1 - 0.2 * x), open: 0.3, a: 0.6 });
  });
  lowpass(out, 4200, sr);
  return out;
}

/**
 * A pig-family mob turning zombified: a choking, straining groan in its own throat that
 * rots into the zombified piglin's wet gurgle.
 */
export function converted(c: Ctx, th: Throat, base: number): Float32Array {
  const { sr, v } = c;
  const out = alloc(1.3, sr);
  const rise = [1.6, 1.9, 1.4][v % 3];
  const d1 = [0.55, 0.45, 0.65][v % 3];
  layer(out, 1, (b) => {
    gruntInto(b, c, th, { t: 0, d: d1, f0: (x) => base * envExpPts(x, [0, 1, 0.5, rise, 1, rise * 0.8]), open: 0.8 });
    gruntInto(b, c, ZPIG, { t: d1 - 0.05, d: 0.55, f0: (x) => base * rise * 0.8 * Math.pow(0.6, x), open: 0.4, a: 0.8 });
  });
  layer(out, 0.4, (b) => gurgleInto(b, c, d1 - 0.1, 0.6, 50));
  lowpass(out, 3500, sr);
  return out;
}

// ------------------------------------------------------------------ piglin

/** A person-sized pig: nasal and snouty, lighter and less rough than its zombified kin. */
const PIGLIN: Throat = { fs: 0.95, rough: 0.35, sub: 0.06, breath: 0.3, oq: 0.5, growl: [30, 40, 0.3], jitter: 0.05, shimmer: 0.2, nasal: 0.8 };
/** Shouting: pressed and rough. */
const PIGLIN_SHOUT: Throat = { ...PIGLIN, rough: 0.45, sub: 0.08, breath: 0.35, oq: 0.36, growl: [32, 40, 0.35] };

/** Piglin idle: nasal, curious grunts, "hm?", "hng-hng", a sniff and a mutter. */
function piglinAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.8, sr);
  const base = rng.range(115, 140);
  const gs: Grunt[] = [];
  const sniffs: number[] = [];
  switch (v) {
    case 0: // "hm?"
      gs.push({ t: 0, d: 0.22, f0: (x) => base * (0.95 + 0.3 * x * x), open: 0.2 });
      break;
    case 1: // "hng-hng"
      gs.push({ t: 0, d: 0.12, f0: (x) => base * 1.1 * (1 - 0.1 * x), open: 0.3 });
      gs.push({ t: 0.18, d: 0.14, f0: (x) => base * (1 - 0.15 * x), open: 0.3, a: 0.85 });
      break;
    case 2: // two sniffs, then a mutter
      sniffs.push(0, 0.11);
      gs.push({ t: 0.25, d: 0.2, f0: (x) => base * (1.05 - 0.15 * x), open: 0.4 });
      break;
    case 3: // a drawn-out, wondering "hrrm?"
      gs.push({ t: 0, d: 0.35, f0: (x) => base * (1 + 0.25 * Math.sin(Math.PI * Math.pow(x, 0.8))), open: 0.5 });
      break;
    default: // "huh-hng"
      gs.push({ t: 0, d: 0.14, f0: (x) => base * 1.2 * (1 - 0.15 * x), open: 0.8 });
      gs.push({ t: 0.2, d: 0.2, f0: (x) => base * (0.95 + 0.15 * x), open: 0.3, a: 0.8 });
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, PIGLIN, g);
  });
  layer(out, 0.14, (b) => {
    for (const g of gs) snortInto(b, c, g.t, Math.min(0.06, g.d * 0.4), 1600);
  });
  if (sniffs.length) {
    layer(out, 0.5, (b) => {
      for (const t of sniffs) snortInto(b, c, t, 0.07, rng.range(1300, 1700), true);
    });
  }
  lowpass(out, 4000, sr);
  return out;
}

/** A nasal "hmm" through a closed snout: interest, admiration or disapproval by its contour. */
function hmmInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: (x: number) => number, a = 1): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f0(t / d),
    amp: (t) => envBump(t, Math.min(0.06, d * 0.2), d - Math.min(0.06, d * 0.2)),
    formants: [
      { f: 290, bw: 70, g: 1 },
      { f: 1100, bw: 110, g: 0.3 },
      { f: 2300, bw: 250, g: 0.08 },
    ],
    jitter: 0.03,
    shimmer: 0.1,
    rough: 0.2,
    sub: 0.03,
    breath: 0.12,
    oq: 0.6,
    growl: [rng.range(28, 36), 0.15],
    vib: [6, 0.012],
    gain: a,
  });
}

/** Piglin admiring an item: a pleased, interested "hmmm", sometimes with a satisfied grunt. */
function piglinAdmire(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(120, 138);
  const out = alloc(1, sr);
  layer(out, 1, (b) => {
    switch (v % 4) {
      case 0: // "hmm" rising and falling: "ooh, nice"
        hmmInto(b, c, 0, 0.6, (x) => base * (1 + 0.28 * Math.sin(Math.PI * Math.pow(x, 0.7))));
        break;
      case 1: // a long, satisfied, falling "hmmm"
        hmmInto(b, c, 0, 0.75, (x) => base * 1.25 * (1 - 0.3 * x));
        break;
      case 2: // "hm-hmm!"
        hmmInto(b, c, 0, 0.18, (x) => base * (1.1 + 0.1 * x));
        hmmInto(b, c, 0.25, 0.4, (x) => base * (1.3 - 0.35 * x));
        break;
      default: // an intrigued "hmm?" and a pleased grunt
        hmmInto(b, c, 0, 0.45, (x) => base * (0.95 + 0.4 * x * x));
        gruntInto(b, c, PIGLIN, { t: 0.52, d: 0.14, f0: (x) => base * 1.15 * (1 - 0.1 * x), open: 0.4, a: 0.6 });
    }
  });
  lowpass(out, 3000, sr);
  return out;
}

/** Piglin angry: shouted, snarling grunts. */
function piglinAngry(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.9, sr);
  const base = rng.range(150, 180);
  const gs: Grunt[] = [];
  switch (v) {
    case 0: // "HRAH!"
      gs.push({ t: 0, d: 0.3, f0: (x) => base * envExpPts(x, [0, 1, 0.3, 1.35, 1, 1]), open: 1 });
      break;
    case 1: // "HRAH-HRAH!"
      gs.push({ t: 0, d: 0.2, f0: (x) => base * envExpPts(x, [0, 1, 0.3, 1.3, 1, 1.05]), open: 1, a: 0.85 });
      gs.push({ t: 0.26, d: 0.26, f0: (x) => base * envExpPts(x, [0, 1.1, 0.3, 1.45, 1, 1.1]), open: 1 });
      break;
    case 2: // a long "HRRRAGH"
      gs.push({ t: 0, d: 0.55, f0: (x) => base * envExpPts(x, [0, 1, 0.25, 1.45, 0.7, 1.3, 1, 1]), open: 0.9 });
      break;
    default: // "huh-RAAH"
      gs.push({ t: 0, d: 0.12, f0: (x) => base * (1 - 0.1 * x), open: 0.5, a: 0.7 });
      gs.push({ t: 0.16, d: 0.35, f0: (x) => base * envExpPts(x, [0, 1.05, 0.35, 1.5, 1, 1.15]), open: 1 });
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, PIGLIN_SHOUT, g);
  });
  layer(out, 0.22, (b) => {
    for (const g of gs) {
      const d = g.d;
      sweep(b, sr, rng, { t: g.t, dur: d, f: (t) => 1100 + 600 * Math.sin((Math.PI * t) / d), q: 1.3, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' });
    }
  });
  lowpass(out, 4500, sr);
  return out;
}

/** Piglin celebrate: a run of quick, excited cheering grunts, climbing in pitch. */
function piglinCelebrate(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1, sr);
  const base = rng.range(150, 170);
  const n = [4, 3, 5, 2][v % 4];
  layer(out, 1, (b) => {
    let t = 0;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      const d = v % 4 === 3 ? rng.range(0.22, 0.28) : last ? rng.range(0.2, 0.26) : rng.range(0.09, 0.13);
      const f = base * (1 + 0.12 * k) * rng.range(0.97, 1.03);
      const lift = last ? 1.35 : 1.15;
      gruntInto(b, c, PIGLIN_SHOUT, { t, d, f0: (x) => f * envExpPts(x, [0, 1, 0.4, lift, 1, lift * 0.92]), open: last ? 1 : 0.8, a: last ? 1 : 0.8 });
      t += d + rng.range(0.035, 0.06);
    }
  });
  lowpass(out, 4500, sr);
  return out;
}

/** Piglin jealous (you took its gold): an annoyed "hmph!" with a snort. */
function piglinJealous(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.7, sr);
  const base = rng.range(125, 145);
  layer(out, 1, (b) => {
    if (v === 0) {
      // "hmph!"
      hmmInto(b, c, 0, 0.16, (x) => base * 1.2 * (1 - 0.2 * x));
    } else if (v === 1) {
      // a low, disapproving "hrrm"
      gruntInto(b, c, PIGLIN, { t: 0, d: 0.32, f0: (x) => base * 0.85 * (1.05 - 0.2 * x), open: 0.2 });
    } else {
      // "hng-HMPH"
      gruntInto(b, c, PIGLIN, { t: 0, d: 0.1, f0: (x) => base * (1 - 0.05 * x), open: 0.3, a: 0.7 });
      hmmInto(b, c, 0.15, 0.2, (x) => base * 1.3 * (1 - 0.25 * x));
    }
  });
  const t = v === 1 ? 0.3 : v === 0 ? 0.14 : 0.33;
  layer(out, 0.45, (b) => snortInto(b, c, t, 0.14, rng.range(1100, 1400)));
  lowpass(out, 3800, sr);
  return out;
}

/** Piglin retreat (scared off by soul fire or a zombified crowd): a fearful squeal. */
function piglinRetreat(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.8, sr);
  const f = rng.range(250, 290);
  layer(out, 1, (b) => {
    yelpInto(b, c, 0, rng.range(0.28, 0.34), f, 0.55 + 0.1 * v, 1.05, 0.3);
    if (v === 1) yelpInto(b, c, 0.36, 0.22, f * 1.1, 0.5, 1.05, 0.3, 0.75);
  });
  layer(out, 0.3, (b) => snortInto(b, c, 0, 0.06, 1600, true));
  lowpass(out, 5000, sr);
  return out;
}

/** Piglin hurt: a pained, nasal grunt-squeal; three different shapes. */
function piglinHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(0.2, 0.28);
  const out = alloc(d + 0.3, sr);
  const f = rng.range(165, 195);
  layer(out, 1, (b) => {
    if (v === 0) {
      // a squeal that drops into a grunt
      yelpInto(b, c, 0, d, f, 0.55, 0.95, 0.4);
      gruntInto(b, c, PIGLIN, { t: d * 0.7, d: 0.12, f0: (x) => f * 0.6 * (1 - 0.1 * x), a: 0.4 });
    } else if (v === 1) {
      // two quick yelps, "hng-HENGH"
      yelpInto(b, c, 0, 0.11, f * 0.9, 0.35, 0.95, 0.4, 0.7);
      yelpInto(b, c, 0.13, d, f * 1.08, 0.65, 0.95, 0.4);
    } else {
      // a higher, sharper yelp
      yelpInto(b, c, 0, d * 0.8, f * 1.2, 0.75, 1, 0.35);
    }
  });
  layer(out, 0.25, (b) => snortInto(b, c, 0, 0.05, 1500));
  lowpass(out, 4500, sr);
  return out;
}

/** Piglin step: a light hoof on netherrack, with a little grit. */
function piglinStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.22, sr);
  const f = rng.range(170, 230);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.04, f * 2.3, 0.5, 0.03, f * 4.1, 0.25, 0.02, 1300, 0.1, 0.01],
      jitter: 0.05,
      noise: 0.6,
      noiseTau: 0.003,
      noiseBp: [1600, 0.8],
    }),
  );
  layer(out, 0.45, (b) => thump(b, sr, { f0: 130, f1: 75, tau: 0.025 }));
  layer(out, 0.4, (b) =>
    phisem(b, sr, rng, {
      dur: 0.16,
      rate: 5000,
      energy: twoBump(0.004, 0.02, rng.range(0.03, 0.05), 0.4, 0.006, 0.025),
      grain: 0.0006,
      heavy: 2.5,
      bands: [
        { f: 3000, q: 1.2, g: 1, spread: 0.35 },
        { f: 1500, q: 1.2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  lowpass(out, 6000, sr);
  return out;
}

// ------------------------------------------------------------------ registry

export function netherMobSounds(): Record<string, SoundGen> {
  return {
    'entity.zombified_piglin.ambient': sound('entity.zombified_piglin.ambient', 5, zpigAmbient),
    'entity.zombified_piglin.angry': sound('entity.zombified_piglin.angry', 4, zpigAngry),
    'entity.zombified_piglin.hurt': sound('entity.zombified_piglin.hurt', 2, zpigHurt),
    'entity.zombified_piglin.death': sound('entity.zombified_piglin.death', 2, zpigDeath),

    'entity.ghast.ambient': sound('entity.ghast.ambient', 7, ghastMoan),
    'entity.ghast.hurt': sound('entity.ghast.hurt', 5, ghastShriek),
    'entity.ghast.scream': sound('entity.ghast.scream', 5, ghastShriek),
    'entity.ghast.death': sound('entity.ghast.death', 1, ghastDeath),
    'entity.ghast.warn': sound('entity.ghast.warn', 1, ghastWarn),
    'entity.ghast.shoot': sound('entity.ghast.shoot', 1, ghastShoot),

    'entity.strider.ambient': sound('entity.strider.ambient', 5, striderAmbient),
    'entity.strider.happy': sound('entity.strider.happy', 4, striderHappy),
    'entity.strider.retreat': sound('entity.strider.retreat', 3, striderRetreat),
    'entity.strider.hurt': sound('entity.strider.hurt', 4, striderHurt),
    'entity.strider.death': sound('entity.strider.death', 2, striderDeath),
    'entity.strider.step': sound('entity.strider.step', 4, striderStep),
    'entity.strider.step_lava': sound('entity.strider.step_lava', 5, striderStepLava),
    'entity.strider.eat': sound('entity.strider.eat', 3, striderEat),
    'entity.strider.saddle': sound('entity.strider.saddle', 1, saddle),
    // (vanilla: the pig's saddle is the same leather sound)
    'entity.pig.saddle': sound('entity.pig.saddle', 1, saddle),

    'entity.hoglin.ambient': sound('entity.hoglin.ambient', 5, hoglinAmbient),
    'entity.hoglin.angry': sound('entity.hoglin.angry', 4, hoglinAngry),
    'entity.hoglin.attack': sound('entity.hoglin.attack', 2, hoglinAttack),
    'entity.hoglin.hurt': sound('entity.hoglin.hurt', 3, hoglinHurt),
    'entity.hoglin.death': sound('entity.hoglin.death', 3, hoglinDeath),
    'entity.hoglin.step': sound('entity.hoglin.step', 4, hoglinStep),
    'entity.hoglin.retreat': sound('entity.hoglin.retreat', 3, hoglinRetreat),
    'entity.hoglin.converted_to_zombified': sound('entity.hoglin.converted_to_zombified', 3, (c) => converted(c, HOGLIN_ROAR, c.rng.range(75, 88))),

    'entity.piglin.ambient': sound('entity.piglin.ambient', 5, piglinAmbient),
    'entity.piglin.angry': sound('entity.piglin.angry', 4, piglinAngry),
    'entity.piglin.admiring_item': sound('entity.piglin.admiring_item', 4, piglinAdmire),
    'entity.piglin.celebrate': sound('entity.piglin.celebrate', 4, piglinCelebrate),
    'entity.piglin.jealous': sound('entity.piglin.jealous', 3, piglinJealous),
    'entity.piglin.retreat': sound('entity.piglin.retreat', 3, piglinRetreat),
    'entity.piglin.hurt': sound('entity.piglin.hurt', 3, piglinHurt),
    'entity.piglin.death': sound('entity.piglin.death', 3, (c) => deathGroan(c, c.rng.range(210, 240), 0.95, [0.8, 0.95, 0.7][c.v % 3], [1.3, 1.4, 1.25][c.v % 3], 1100)),
    'entity.piglin.step': sound('entity.piglin.step', 5, piglinStep),
    'entity.piglin.converted_to_zombified': sound('entity.piglin.converted_to_zombified', 3, (c) => converted(c, PIGLIN_SHOUT, c.rng.range(115, 130))),
  };
}
