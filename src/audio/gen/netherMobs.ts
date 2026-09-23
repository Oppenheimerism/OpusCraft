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
      { f: F[0], bw: 130, g: 1 },
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
      from: rng.pick(['ae', 'e']),
      to: rng.pick(['i', 'ih']),
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
      { f: F[0], bw: 90, g: 1 },
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

/** Strider hurt: a sharp, squawking warble. */
function striderHurt(c: Ctx): Float32Array {
  const { rng, v } = c;
  const f = rng.range(400, 460) * (1 + 0.06 * v);
  const r = rng.range(30, 36);
  const env = (x: number) => envPts(x, [0, 0, 0.06, 1, 0.5, 0.7, 1, 0]);
  return trills(c, [{ d: rng.range(0.22, 0.3), f0: (x) => f * envExpPts(x, [0, 1.25, 0.15, 1.45, 1, 0.8]), rate: () => r, depth: 0.06, bright: 0.7, rough: 0.35, env }], 200);
}

/** Strider death: a long warble that sinks, its trill slowing, and fades out. */
function striderDeath(c: Ctx): Float32Array {
  const { rng, v } = c;
  const f = rng.range(340, 380);
  const env = (x: number) => envPts(x, [0, 0, 0.05, 1, 0.5, 0.7, 1, 0]);
  return trills(c, [{ d: v === 0 ? 0.95 : 1.1, f0: (x) => f * envExpPts(x, [0, 1.2, 0.2, 1.1, 1, 0.42]), rate: (x) => 26 - 16 * x, depth: 0.07, bright: 0.4, rough: 0.2, env }], 120);
}

/** Strider step: a soft, squishy footfall — a wet squelch over a dull thud. */
function striderStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const p = rng.range(0.85, 1.2);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.16, f: (t) => 700 * p * Math.pow(0.45, t / 0.16), q: 2.4, amp: (t) => envAD(t, 0.008, 0.045) }));
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
  layer(out, 0.8, (b) => sweep(b, sr, rng, { dur: 0.22, f: (t) => 480 * p * Math.pow(0.5, t / 0.22), q: 1.8, amp: (t) => envAD(t, 0.015, 0.06) }));
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
    for (const a of at) sweep(b, sr, rng, { t: a, dur: 0.09, f: (t) => 900 * Math.pow(0.5, t / 0.09), q: 2, amp: (t) => envAD(t, 0.01, 0.03) });
  });
  layer(out, 0.45, (b) => {
    for (const a of at) thump(b, sr, { t: a, f0: 150, f1: 90, tau: 0.02 });
  });
  lowpass(out, 5000, sr);
  return out;
}

/** Saddling a strider: the leather saddle flops on (a dull slap and a creak) with a buckle clink. */
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
  };
}
