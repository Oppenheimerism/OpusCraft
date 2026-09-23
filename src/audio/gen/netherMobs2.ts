// Nether mob vocalisations and foley, second batch (in the style of netherMobs.ts): blaze (breath
// through hot metal pipes), wither skeleton (deep, hollow bony rattles), piglin brute and zoglin (the
// piglin's and hoglin's throats from netherMobs.ts, made bigger and angrier / rotten and wet), and the
// respawn anchor's deep, magical hums.

import type { SoundGen } from '../synth';
import { type Rng, SVF, TAU, addOsc, alloc, clamp, echo, envAD, envBump, envExpPts, envPts, highpass, layer, lowpass, reverb, smooth, upsample2 } from './dsp';
import { type Ctx, sound } from './registry';
import { type Grunt, HOGLIN, type Throat, converted, deathGroan, gruntInto, gurgleInto, snortInto, yelpInto } from './netherMobs';
import { bubble, burst, creak, fireCrackles, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import { reverbHalf, worldSounds } from './world';

// ------------------------------------------------------------------ blaze

/**
 * An irregular flutter, like a loose plate buzzing in a stream of hot air: a jittery pulse train
 * at `rate(x)` Hz over normalised time x, 0..1, tabulated at 2 kHz.
 */
function flutter(rng: Rng, d: number, rate: (x: number) => number, jitter: number, sharp = 2): (t: number) => number {
  const K = 2000;
  const N = Math.ceil(d * K) + 2;
  const tab = new Float32Array(N);
  let ph = rng.next();
  let per = 1;
  let amp = 1;
  for (let k = 0; k < N; k++) {
    ph += (rate(Math.min(1, k / K / d)) * per) / K;
    if (ph >= 1) {
      ph -= Math.floor(ph);
      per = clamp(1 + jitter * rng.gauss(), 0.5, 1.8);
      amp = 0.55 + 0.45 * rng.next();
    }
    tab[k] = amp * Math.pow(0.5 - 0.5 * Math.cos(TAU * ph), sharp);
  }
  return (t) => {
    const u = clamp(t * K, 0, N - 1.001);
    const k = u | 0;
    return tab[k] + (tab[k + 1] - tab[k]) * (u - k);
  };
}

interface PipeOpts {
  /** lowest resonance (Hz), constant or over time */
  f: number | ((t: number) => number);
  /** the lowest `f` ever takes (sizes the delay line) */
  lo?: number;
  /** feedback 0..1: how strongly the pipe rings */
  fb: number;
  /** damping low-pass inside the loop (Hz) */
  damp: number;
  /** slow random wander of the pipe length (fraction) */
  wob: number;
}

/**
 * A hot metal pipe: a feedback comb with only odd harmonics (a tube closed at one end) whose
 * length slowly wanders, so air blown through it takes on a hollow, flanging, metallic resonance.
 */
function pipe(x: Float32Array, sr: number, rng: Rng, o: PipeOpts): Float32Array {
  const fOf = typeof o.f === 'number' ? () => o.f as number : o.f;
  const lo = o.lo ?? (typeof o.f === 'number' ? o.f : 50);
  const L = Math.ceil((sr / (2 * lo)) * (1 + 2 * o.wob)) + 4;
  const line = new Float32Array(L);
  const out = new Float32Array(x.length);
  const a = 1 - Math.exp((-TAU * o.damp) / sr);
  const r1 = rng.range(0.6, 1.2);
  const r2 = rng.range(1.8, 3.2);
  const p1 = rng.next() * TAU;
  const p2 = rng.next() * TAU;
  let D = 1;
  let lp = 0;
  let w = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0) {
      const t = i / sr;
      const wander = 0.7 * Math.sin(TAU * r1 * t + p1) + 0.3 * Math.sin(TAU * r2 * t + p2);
      D = clamp((sr / (2 * fOf(t))) * (1 + o.wob * wander), 2, L - 2);
    }
    let rp = w - D;
    if (rp < 0) rp += L;
    const k = rp | 0;
    const y = line[k] + (line[k + 1 === L ? 0 : k + 1] - line[k]) * (rp - k);
    lp += a * (y - lp);
    const v = x[i] - o.fb * lp;
    line[w] = v;
    out[i] = v;
    if (++w === L) w = 0;
  }
  return out;
}

/** Sheet metal: a few narrow, inharmonic resonances that make any noise through them ring like a hot plate. */
function metal(x: Float32Array, sr: number, f: number, q: number): Float32Array {
  const R = [1, 1.41, 1.93, 2.58, 3.19, 3.86];
  const G = [1, 0.8, 0.65, 0.5, 0.35, 0.25];
  const fs = R.map((r) => new SVF(f * r, q, sr));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let y = 0;
    for (let k = 0; k < R.length; k++) y += G[k] * fs[k].band(x[i]);
    out[i] = y;
  }
  return out;
}

/** One blaze breath. */
interface Breath {
  t: number;
  d: number;
  /** in: swells and is cut off at the top; out: fuller, sinks; hit: a sharp, forced huff; fall: a dying exhale */
  kind: 'in' | 'out' | 'hit' | 'fall';
  a?: number;
  /** 0..1: how hard the air rasps (flutter depth) */
  rasp?: number;
  /** rattle rate (Hz) */
  rate?: number;
  /** how much the rattle slows by the end (fraction) */
  slow?: number;
}

/** Loudness of a breath over normalised time. */
function breathEnv(q: Breath, x: number): number {
  switch (q.kind) {
    case 'in':
      return smooth(envPts(x, [0, 0, 0.55, 0.7, 0.9, 1, 1, 0]));
    case 'out':
      return smooth(envPts(x, [0, 0, 0.12, 1, 0.5, 0.8, 1, 0]));
    case 'hit':
      return envAD(x * q.d, 0.01, q.d * 0.3) * Math.min(1, ((1 - x) * q.d) / 0.03);
    default:
      return smooth(envPts(x, [0, 0, 0.06, 1, 0.3, 0.85, 0.7, 0.4, 1, 0]));
  }
}

/** Centre of the breath noise (as a multiple of the base) over normalised time: in-breaths rise, out-breaths sink. */
function breathTone(q: Breath, x: number): number {
  switch (q.kind) {
    case 'in':
      return 0.85 + 0.5 * x;
    case 'out':
      return 1.25 - 0.45 * x;
    case 'hit':
      return 1.45 - 0.6 * Math.sqrt(x);
    default:
      return 1.2 - 0.65 * x;
  }
}

/**
 * A blaze breath: noise with a moving band (the air), rasped by an irregular flutter, over an
 * unrasped hiss; the metallic rattle and the pipe are added by blazeBreaths().
 */
function breathInto(b: Float32Array, c: Ctx, q: Breath, fc: number): void {
  const { sr, rng } = c;
  const d = q.d;
  const a = q.a ?? 1;
  const rasp = q.rasp ?? 0.5;
  const r = q.rate ?? 38;
  const slow = q.slow ?? 0.2;
  const fl = flutter(rng, d, (x) => r * (1 - slow * x), 0.28);
  sweep(b, sr, rng, {
    t: q.t,
    dur: d,
    f: (t) => fc * breathTone(q, t / d),
    q: 1.1,
    amp: (t) => a * breathEnv(q, t / d) * (1 - rasp + rasp * fl(t)),
    color: 'pink',
  });
  // the low, hollow body of the breath, which the pipe below rings on
  sweep(b, sr, rng, {
    t: q.t,
    dur: d,
    f: (t) => 0.42 * fc * breathTone(q, t / d),
    q: 0.9,
    amp: (t) => 0.7 * a * breathEnv(q, t / d) * (1 - 0.8 * rasp + 0.8 * rasp * fl(t)),
    color: 'pink',
  });
  sweep(b, sr, rng, {
    t: q.t,
    dur: d,
    f: (t) => 2.2 * fc * breathTone(q, t / d),
    q: 0.8,
    amp: (t) => 0.2 * a * (q.kind === 'in' ? 1.4 : 1) * breathEnv(q, t / d),
  });
}

/** The rods rattling in the airflow: a jittery, metallic buzz that follows the breath. */
function rattleInto(b: Float32Array, c: Ctx, q: Breath, f: number): void {
  const { sr, rng } = c;
  const d = q.d;
  const r = (q.rate ?? 38) * rng.range(0.9, 1.1);
  const slow = q.slow ?? 0.2;
  creak(b, sr, rng, {
    t: q.t,
    dur: d,
    rate: (t) => r * (1 - (slow * t) / d),
    amp: (t) => (q.a ?? 1) * (q.rasp ?? 0.5) * breathEnv(q, t / d),
    jitter: 0.35,
    bands: [
      { f, q: 12, g: 1 },
      { f: f * 2.76, q: 16, g: 0.6 },
      { f: f * 5.4, q: 18, g: 0.3 },
    ],
  });
}

interface BlazeVoice {
  /** pipe resonance (Hz) */
  pipe: number | ((t: number) => number);
  lo?: number;
  /** pipe feedback */
  fb: number;
  /** centre of the breath noise (Hz) */
  fc: number;
  /** base of the rod rattle's resonances (Hz) */
  rod: number;
  /** base of the sheet-metal ring (Hz) */
  ring: number;
  /** mix levels of the ring and the rattle */
  ringMix?: number;
  rattleMix?: number;
  /** a small metal room around it: [t60, wet] */
  room?: [number, number];
  /** final low-pass (Hz) */
  lp?: number;
}

/** Render a set of blaze breaths through its hot metal pipe, with the sheen of the plates and the rattle of its rods. */
function blazeBreaths(c: Ctx, bs: Breath[], o: BlazeVoice): Float32Array {
  const { sr, rng } = c;
  const len = Math.max(...bs.map((q) => q.t + q.d)) + 0.05;
  const air = alloc(len, sr);
  for (const q of bs) breathInto(air, c, q, o.fc);
  const out = alloc(len, sr);
  layer(out, 1, (b) => b.set(pipe(air, sr, rng, { f: o.pipe, lo: o.lo, fb: o.fb, damp: 3500, wob: 0.06 })));
  layer(out, o.ringMix ?? 0.3, (b) => b.set(metal(air, sr, o.ring, 45)));
  layer(out, o.rattleMix ?? 0.3, (b) => {
    for (const q of bs) rattleInto(b, c, q, o.rod);
  });
  highpass(out, 120, sr);
  lowpass(out, o.lp ?? 6000, sr);
  const [t60, wet] = o.room ?? [0.6, 0.18];
  return reverbHalf(out, sr, { t60, wet, size: 0.7, pre: 0.008, hf: 0.5, lowcut: 200, tail: t60 * 0.7 });
}

/** Blaze idle: raspy, hollow, mechanical breathing through a hot metal pipe; each take breathes differently. */
function blazeAmbient(c: Ctx): Float32Array {
  const { rng, v } = c;
  // each take has its own pipe and rattle, not just its own rhythm
  const p = [200, 178, 226, 190][v] * rng.range(0.96, 1.04);
  const r = [38, 33, 44, 36][v] * rng.range(0.95, 1.05);
  const bs: Breath[] = [];
  switch (v) {
    case 0: // in, then a long, rattling out
      bs.push({ t: 0, d: 0.42, kind: 'in', a: 0.6, rasp: 0.35, rate: r });
      bs.push({ t: 0.47, d: 0.7, kind: 'out', rasp: 0.6, rate: r });
      break;
    case 1: // one long out-breath that catches halfway and rattles on
      bs.push({ t: 0, d: 0.5, kind: 'out', rasp: 0.5, rate: r });
      bs.push({ t: 0.44, d: 0.6, kind: 'out', a: 0.8, rasp: 0.75, rate: r * 0.8, slow: 0.35 });
      break;
    case 2: // a quick in, an out and a weaker second out
      bs.push({ t: 0, d: 0.26, kind: 'in', a: 0.55, rasp: 0.3, rate: r * 1.1 });
      bs.push({ t: 0.3, d: 0.4, kind: 'out', rasp: 0.6, rate: r });
      bs.push({ t: 0.76, d: 0.4, kind: 'out', a: 0.6, rasp: 0.5, rate: r * 0.9 });
      break;
    default: // out, then a slow, rasping in
      bs.push({ t: 0, d: 0.55, kind: 'out', rasp: 0.55, rate: r });
      bs.push({ t: 0.66, d: 0.52, kind: 'in', a: 0.7, rasp: 0.5, rate: r * 1.15, slow: -0.2 });
  }
  return blazeBreaths(c, bs, { pipe: p, fb: 0.7, fc: p * 4.5 * rng.range(0.95, 1.05), rod: rng.range(950, 1200), ring: rng.range(1100, 1400) });
}

/** A hot rod struck: a short, bright clang (the modes of a free bar) with a tink of contact noise. */
function clangInto(b: Float32Array, c: Ctx, t0: number, f: number, a = 1): void {
  const { sr, rng } = c;
  impact(b, sr, rng, {
    t: t0,
    modes: [f, 1, 0.22, f * 2.756, 0.7, 0.14, f * 5.404, 0.45, 0.08, f * 8.933, 0.25, 0.05],
    jitter: 0.02,
    noise: 0.6,
    noiseTau: 0.0015,
    noiseBp: [4000, 0.9],
    gain: a,
  });
}

/** Blaze hurt: a sharp, pained huff through the pipe with a clang of its rods; four different shapes. */
function blazeHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const bs: Breath[] = [];
  const clangs: [number, number, number][] = []; // [start, frequency, level]
  const f = [700, 640, 760, 600][v] * rng.range(0.96, 1.04);
  switch (v) {
    case 0: // one sharp "KHH"
      bs.push({ t: 0.004, d: 0.3, kind: 'hit', rasp: 0.8, rate: 52 });
      clangs.push([0, f, 1]);
      break;
    case 1: // "kh-KHH"
      bs.push({ t: 0.004, d: 0.13, kind: 'hit', a: 0.7, rasp: 0.7, rate: 55 });
      bs.push({ t: 0.14, d: 0.28, kind: 'hit', rasp: 0.85, rate: 48 });
      clangs.push([0, f * 1.12, 0.6], [0.136, f, 1]);
      break;
    case 2: // the rods jolt, a sharp gasp in, then the huff and the clang
      bs.push({ t: 0, d: 0.2, kind: 'in', a: 0.8, rasp: 0.6, rate: 58, slow: -0.3 });
      bs.push({ t: 0.2, d: 0.2, kind: 'hit', a: 0.9, rasp: 0.8, rate: 50 });
      clangs.push([0, f * 1.25, 0.4], [0.196, f * 0.9, 1]);
      break;
    default: // a lower clang and a longer, rasping huff
      bs.push({ t: 0.004, d: 0.42, kind: 'hit', rasp: 0.9, rate: 42, slow: 0.4 });
      clangs.push([0, f * 0.78, 1]);
  }
  const body = blazeBreaths(c, bs, { pipe: [280, 300, 265, 250][v] * rng.range(0.96, 1.04), fb: 0.78, fc: rng.range(950, 1100), rod: rng.range(1100, 1400), ring: rng.range(1350, 1650), ringMix: 0.4, rattleMix: 0.45, room: [0.5, 0.16], lp: 7000 });
  const out = alloc(body.length / sr, sr);
  layer(out, 1, (b) => b.set(body));
  layer(out, 0.55, (b) => {
    for (const [t, fq, a] of clangs) clangInto(b, c, t, fq, a);
  });
  return out;
}

/** Blaze death: a long breath out that rattles, sinks and slows as it falls away. */
function blazeDeath(c: Ctx): Float32Array {
  const { rng } = c;
  const bs: Breath[] = [
    { t: 0, d: 0.2, kind: 'hit', a: 0.8, rasp: 0.7, rate: 50 },
    { t: 0.14, d: 1.7, kind: 'fall', rasp: 0.8, rate: 46, slow: 0.7 },
  ];
  const p = rng.range(210, 240);
  return blazeBreaths(c, bs, {
    pipe: (t) => p * envExpPts(t, [0, 1.2, 0.35, 1, 1.85, 0.55]),
    lo: p * 0.5,
    fb: 0.74,
    fc: 900,
    rod: rng.range(950, 1150),
    ring: rng.range(1150, 1400),
    ringMix: 0.3,
    rattleMix: 0.4,
    room: [0.9, 0.22],
  });
}

/**
 * Blaze shoot: vanilla reuses the ghast's fireball sound, played once for each of the three
 * fireballs in a volley (0.3 s apart), so this is a tighter, punchier take on ghastShoot that
 * stays distinct when three overlap.
 */
function blazeShoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const fl = rng.range(10, 14);
  // the roar of the flame: a fast swell of dark noise with a flickering body
  layer(out, 1, (b) =>
    burst(b, sr, rng, { dur: 0.55, attack: 0.018, tau: 0.09, lp: 1100, color: 'brown', env: (t) => 0.72 + 0.28 * Math.sin(TAU * fl * t + 2 * Math.sin(TAU * 3.3 * t)) }),
  );
  // the whoosh: the band swings up as the fireball leaves, then falls back
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, { dur: 0.5, f: (t) => envExpPts(t, [0, 350, 0.05, 1900, 0.35, 500]), q: 1.1, amp: (t) => envAD(t, 0.025, 0.09), color: 'pink' }),
  );
  // the hiss of the flame front
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: 0.25, attack: 0.01, tau: 0.04, hp: 2500 }));
  // a pressure thump, smaller and quicker than the ghast's
  layer(out, 0.7, (b) => thump(b, sr, { f0: 140, f1: 60, glide: 0.035, tau: 0.06, attack: 0.006 }));
  layer(out, 0.22, (b) => fireCrackles(b, sr, rng, 0.02, 0.35, 60, 0.1));
  return reverbHalf(out, sr, { t60: 0.9, wet: 0.25, size: 1.2, pre: 0.015, hf: 0.4, lowcut: 150, tail: 0.5 });
}

// ------------------------------------------------------------------ wither skeleton

/** Partial ratios of a wither skeleton's heavy, charred bones: a skeleton's (mobs.ts), a touch duller. */
const BONE = [1, 2.6, 4.9];

/** A deep, hollow bony rattle: the skeleton's rattle made lower, heavier and slower, its bones ringing a little longer. */
function boneRattleInto(b: Float32Array, c: Ctx, t0: number, d: number, rate: number, lo = 420, hi = 1800): void {
  ticks(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    rate,
    energy: (t) => envBump(t, d * 0.25, d * 0.75),
    f: [lo, hi],
    t60: [0.012, 0.04],
    ratios: BONE,
    weights: [1, 0.45, 0.2],
    heavy: 1.6,
    click: 0.5,
  });
}

/** The jaw chattering: `n` clacks at a steady `rate` (Hz), each a knock of the hollow skull. */
function chatterInto(b: Float32Array, c: Ctx, t0: number, n: number, rate: number, f: number, a = 1): void {
  const { sr, rng } = c;
  for (let k = 0; k < n; k++) {
    const t = t0 + (k + 0.12 * rng.bi()) / rate;
    const g = a * (0.6 + 0.4 * rng.next()) * (k === 0 ? 1 : 0.85);
    const fk = f * (1 + 0.06 * rng.bi());
    impact(b, sr, rng, { t: Math.max(0, t), modes: [fk, g, 0.035, fk * 1.93, g * 0.5, 0.025, fk * 3.4, g * 0.25, 0.015], noise: g * 0.8, noiseTau: 0.0012, noiseBp: [2000, 0.9] });
  }
}

/** A heavy bone knocking on stone (or on other bones): a dull, low clonk. */
function knockInto(b: Float32Array, c: Ctx, t0: number, f: number, a = 1): void {
  const { sr, rng } = c;
  impact(b, sr, rng, { t: t0, modes: [f, a, 0.06, f * 2.6, a * 0.45, 0.035, f * 4.9, a * 0.2, 0.02], jitter: 0.04, noise: a * 0.5, noiseTau: 0.002, noiseBp: [1500, 0.8] });
  thump(b, sr, { t: t0, f0: f * 0.6, f1: f * 0.35, tau: 0.03, amp: a * 0.5 });
}

/** The hollow of the skull and ribcage: a short, lightly ringing pipe. */
function hollow(x: Float32Array, sr: number, rng: Rng, f: number, fb = 0.5): Float32Array {
  return pipe(x, sr, rng, { f, fb, damp: 2500, wob: 0.01 });
}

/** Wither skeleton idle: a deep, hollow rattling of charred bones, the jaw chattering; three different takes. */
function witherAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.9, sr);
  const f = rng.range(430, 520);
  layer(out, 1, (b) => {
    switch (v) {
      case 0: // the jaw chatters, then the bones settle with a rattle
        chatterInto(b, c, 0, 6, rng.range(12, 15), f);
        boneRattleInto(b, c, 0.44, 0.22, rng.range(55, 75));
        break;
      case 1: // one long, rolling rattle with a knock at its heart
        boneRattleInto(b, c, 0, 0.55, rng.range(70, 90));
        knockInto(b, c, rng.range(0.15, 0.25), f * 0.6, 0.7);
        break;
      default: // a clack, then three short rattles, each lower
        chatterInto(b, c, 0, 2, 14, f, 0.7);
        for (let k = 0; k < 3; k++) boneRattleInto(b, c, 0.16 + k * 0.22, rng.range(0.12, 0.16), rng.range(60, 90), 420 * (1 - 0.12 * k), 1800 * (1 - 0.15 * k));
    }
  });
  const h = hollow(out, sr, rng, rng.range(260, 320));
  lowpass(h, 7000, sr);
  return h;
}

/** A heavy bone cracking: a sharp, bright-edged crack over a low, hollow body. */
function crackInto(b: Float32Array, c: Ctx, t0: number, f: number, a = 1): void {
  const { sr, rng } = c;
  impact(b, sr, rng, {
    t: t0,
    modes: [f, a, 0.04, f * 2.6, a * 0.55, 0.025, f * 4.9, a * 0.35, 0.015, f * 0.45, a * 0.45, 0.06],
    noise: a * 1.3,
    noiseTau: 0.0022,
    noiseBp: [3200, 0.7],
  });
}

/** Wither skeleton hurt: a sharp crack of a heavy bone and a jolted rattle; four different shapes. */
function witherHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.45, sr);
  const f = rng.range(850, 1100);
  let rt = 0.02;
  layer(out, 1, (b) => {
    switch (v) {
      case 0: // one sharp crack
        crackInto(b, c, 0, f);
        break;
      case 1: // a double crack
        crackInto(b, c, 0, f * 1.1, 0.7);
        crackInto(b, c, 0.06, f * 0.92);
        rt = 0.07;
        break;
      case 2: // a crack and a jolt of the jaw
        crackInto(b, c, 0, f);
        chatterInto(b, c, 0.07, 3, 20, f * 0.6, 0.55);
        rt = 0.12;
        break;
      default: // a lower, heavier crack
        crackInto(b, c, 0, f * 0.75);
        knockInto(b, c, 0.004, f * 0.32, 0.6);
    }
  });
  layer(out, 0.6, (b) => boneRattleInto(b, c, rt, rng.range(0.18, 0.28), rng.range(100, 140), 500, 2200));
  layer(out, 0.25, (b) => thump(b, sr, { f0: 160, f1: 80, tau: 0.03 }));
  const h = hollow(out, sr, rng, rng.range(280, 340), 0.45);
  lowpass(h, 8000, sr);
  return h;
}

/** Wither skeleton death: a long collapse of heavy bones, tumbling and bouncing, with the skull landing last. */
function witherDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const D = v === 0 ? 1.3 : 1.6;
  const out = alloc(D + 0.2, sr);
  // the clatter of the bones coming apart, thinning out as they settle
  layer(out, 1, (b) =>
    ticks(b, sr, rng, { dur: D, rate: 80, energy: (t) => Math.exp(-t / (D * 0.3)), f: [320, 1700], t60: [0.012, 0.045], ratios: BONE, weights: [1, 0.45, 0.2], heavy: 1.8, click: 0.4 }),
  );
  // the heavier bones hitting the ground, each with a smaller bounce, and the skull landing last
  layer(out, 0.8, (b) => {
    const n = 6 + 2 * v;
    for (let k = 0; k < n; k++) {
      const t = D * 0.7 * Math.pow(rng.next(), 1.6);
      const fq = rng.range(250, 560);
      const a = rng.range(0.5, 1);
      knockInto(b, c, t, fq, a);
      knockInto(b, c, t + rng.range(0.05, 0.09), fq * rng.range(1, 1.1), a * 0.35);
    }
    const ts = D * rng.range(0.72, 0.8);
    const fs = rng.range(200, 240);
    knockInto(b, c, ts, fs, 1);
    knockInto(b, c, ts + 0.11, fs * 1.05, 0.4);
    knockInto(b, c, ts + 0.18, fs * 1.08, 0.18);
  });
  const h = hollow(out, sr, rng, rng.range(250, 300), 0.45);
  lowpass(h, 6500, sr);
  return h;
}

/** Wither skeleton step: a heavy, bony clack on stone. */
function witherStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.25, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    for (let k = 0; k < n; k++) {
      const f = rng.range(550, 1100);
      impact(b, sr, rng, { t: k * rng.range(0.018, 0.04), modes: [f, 1 - 0.3 * k, 0.03, f * 2.6, 0.4, 0.018, f * 4.9, 0.18, 0.01], noise: 0.6, noiseTau: 0.0015, noiseBp: [2600, 1] });
    }
  });
  layer(out, 0.6, (b) => thump(b, sr, { f0: 130, f1: 75, tau: 0.028 }));
  lowpass(out, 8000, sr);
  return out;
}

// ------------------------------------------------------------------ piglin brute

/** The piglin's throat on a much bigger body: a fourth lower in formants, gruffer, less nasal and never curious. */
const BRUTE: Throat = { fs: 0.84, rough: 0.5, sub: 0.1, breath: 0.38, oq: 0.42, growl: [24, 32, 0.45], jitter: 0.06, shimmer: 0.25, nasal: 0.6 };
/** Bellowing: pressed hard, rough and breathy. */
const BRUTE_SHOUT: Throat = { ...BRUTE, rough: 0.58, sub: 0.12, breath: 0.42, oq: 0.33, growl: [26, 34, 0.5] };
/** A low, menacing growl: slow and heavy flutter. */
const BRUTE_GROWL: Throat = { ...BRUTE, rough: 0.6, sub: 0.14, oq: 0.4, growl: [17, 23, 0.6] };

/** Piglin brute idle: gruff, territorial grunts and snorts, a menacing growl; five different takes. */
function bruteAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.9, sr);
  const base = rng.range(88, 104);
  const gs: Grunt[] = [];
  const snorts: [number, number, boolean][] = []; // [start, length, inhale]
  let th = BRUTE;
  switch (v) {
    case 0: // a gruff, falling "HRMPH"
      gs.push({ t: 0, d: 0.26, f0: (x) => base * (1.2 - 0.3 * x), open: 0.6 });
      break;
    case 1: // "hrr-HRM": a low mutter, then a harder grunt
      gs.push({ t: 0, d: 0.14, f0: (x) => base * (1 - 0.08 * x), open: 0.3, a: 0.7 });
      gs.push({ t: 0.2, d: 0.24, f0: (x) => base * (1.18 - 0.25 * x), open: 0.7 });
      break;
    case 2: // a heavy snort out, then a grunt
      snorts.push([0, 0.12, false]);
      gs.push({ t: 0.17, d: 0.24, f0: (x) => base * (1.1 - 0.2 * x), open: 0.5 });
      break;
    case 3: // a long, menacing growl
      th = BRUTE_GROWL;
      gs.push({ t: 0, d: 0.55, f0: (x) => base * 0.92 * (1 + 0.1 * Math.sin(Math.PI * x) - 0.08 * x), open: 0.3 });
      break;
    default: // two sniffs, then a grunt
      snorts.push([0, 0.08, true], [0.12, 0.08, true]);
      gs.push({ t: 0.28, d: 0.22, f0: (x) => base * (1.15 - 0.22 * x), open: 0.55 });
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, th, g);
  });
  layer(out, 0.16, (b) => {
    for (const g of gs) snortInto(b, c, g.t, Math.min(0.07, g.d * 0.4), 1250);
  });
  if (snorts.length) {
    layer(out, 0.55, (b) => {
      for (const [t, d, inhale] of snorts) snortInto(b, c, t, d, rng.range(1000, 1300), inhale);
    });
  }
  lowpass(out, 3600, sr);
  return out;
}

/** Piglin brute angry: bellowed, roaring war cries, deeper and harder than a piglin's. */
function bruteAngry(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1, sr);
  const base = rng.range(108, 125);
  const gs: Grunt[] = [];
  let sn = -1;
  switch (v) {
    case 0: // a snort, then "HRRAAH!"
      sn = 0;
      gs.push({ t: 0.1, d: 0.36, f0: (x) => base * envExpPts(x, [0, 1, 0.3, 1.4, 1, 1.05]), open: 1 });
      break;
    case 1: // "HRAH-HRAAH!"
      gs.push({ t: 0, d: 0.22, f0: (x) => base * envExpPts(x, [0, 1, 0.3, 1.3, 1, 1.05]), open: 1, a: 0.85 });
      gs.push({ t: 0.28, d: 0.32, f0: (x) => base * envExpPts(x, [0, 1.1, 0.3, 1.5, 1, 1.1]), open: 1 });
      break;
    case 2: // a long, roaring "HRRRAAGH"
      gs.push({ t: 0, d: 0.62, f0: (x) => base * envExpPts(x, [0, 0.95, 0.25, 1.45, 0.7, 1.35, 1, 0.95]), open: 0.95 });
      break;
    default: // a growl that bursts into a roar
      gs.push({ t: 0, d: 0.2, f0: (x) => base * 0.75 * (1 + 0.05 * x), open: 0.3, a: 0.7 });
      gs.push({ t: 0.2, d: 0.4, f0: (x) => base * envExpPts(x, [0, 1.05, 0.35, 1.55, 1, 1.15]), open: 1 });
  }
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, g.open === 0.3 ? BRUTE_GROWL : BRUTE_SHOUT, g);
  });
  // the breath of the roar
  layer(out, 0.3, (b) => {
    for (const g of gs) {
      const d = g.d;
      sweep(b, sr, rng, { t: g.t, dur: d, f: (t) => 950 + 550 * Math.sin((Math.PI * t) / d), q: 1.2, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' });
    }
  });
  if (sn >= 0) layer(out, 0.7, (b) => snortInto(b, c, sn, 0.1, 1000));
  lowpass(out, 4200, sr);
  return out;
}

/** Piglin brute hurt: a deep, angry grunt-squeal; four different shapes. */
function bruteHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(0.22, 0.3);
  const out = alloc(d + 0.3, sr);
  const f = rng.range(128, 150);
  layer(out, 1, (b) => {
    switch (v) {
      case 0: // a squeal-grunt that drops into a growl
        yelpInto(b, c, 0, d, f, 0.55, 0.85, 0.5);
        gruntInto(b, c, BRUTE, { t: d * 0.7, d: 0.14, f0: (x) => f * 0.62 * (1 - 0.1 * x), a: 0.5 });
        break;
      case 1: // "hk-HENGH": a caught grunt, then the squeal
        gruntInto(b, c, BRUTE_SHOUT, { t: 0, d: 0.09, f0: (x) => f * 0.7 * (1 + 0.1 * x), open: 0.7, a: 0.8 });
        yelpInto(b, c, 0.08, d, f * 1.08, 0.65, 0.85, 0.5);
        break;
      case 2: // a short, angry yelp
        yelpInto(b, c, 0, d * 0.75, f * 1.15, 0.5, 0.85, 0.55);
        break;
      default: // a pained grunt through gritted teeth
        gruntInto(b, c, BRUTE_SHOUT, { t: 0, d: d * 1.1, f0: (x) => f * envExpPts(x, [0, 1, 0.2, 1.35, 1, 0.8]), open: 0.8 });
    }
  });
  layer(out, 0.25, (b) => snortInto(b, c, 0, 0.05, 1300));
  lowpass(out, 4300, sr);
  return out;
}

/** Piglin brute step: a heavy hoof coming down hard, with a gritty scrape. */
function bruteStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.26, sr);
  const f = rng.range(125, 170);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.055, f * 2.25, 0.5, 0.04, f * 4, 0.25, 0.025, 1100, 0.1, 0.012],
      jitter: 0.05,
      noise: 0.55,
      noiseTau: 0.0035,
      noiseBp: [1400, 0.8],
    }),
  );
  layer(out, 0.65, (b) => thump(b, sr, { f0: 120, f1: 60, tau: 0.035, attack: 0.002 }));
  layer(out, 0.5, (b) =>
    phisem(b, sr, rng, {
      dur: 0.18,
      rate: 5000,
      energy: twoBump(0.004, 0.022, rng.range(0.03, 0.05), 0.4, 0.007, 0.028),
      grain: 0.0007,
      heavy: 2.5,
      bands: [
        { f: 2800, q: 1.2, g: 1, spread: 0.35 },
        { f: 1400, q: 1.2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  lowpass(out, 5500, sr);
  return out;
}

// ------------------------------------------------------------------ zoglin

/**
 * The hoglin's throat, rotten: as the zombified piglin is to the piglin, lower in formants,
 * rougher and breathier, with a slow, wet, sagging flutter and hardly any snout left.
 */
const ZOGLIN: Throat = { ...HOGLIN, fs: 0.62, rough: 0.68, sub: 0.18, breath: 0.5, oq: 0.43, growl: [13, 20, 0.6], jitter: 0.08, shimmer: 0.34, nasal: 0.15 };
/** The same rotten throat pushed hard. */
const ZOGLIN_ROAR: Throat = { ...ZOGLIN, rough: 0.72, oq: 0.35, breath: 0.55, growl: [18, 26, 0.6] };

/** A wet snort: a snort through a nose full of phlegm, with a few bubbles bursting in it. */
function wetSnortInto(b: Float32Array, c: Ctx, t0: number, d: number, fc: number, inhale = false, a = 1): void {
  const { sr, rng } = c;
  snortInto(b, c, t0, d, fc, inhale, a);
  const n = 2 + rng.int(3);
  for (let k = 0; k < n; k++) bubble(b, sr, t0 + rng.range(0.1, 0.9) * d, rng.logRange(300, 900), a * rng.range(0.15, 0.4), undefined, rng.range(0.3, 0.7));
}

/** Render zoglin grunts: the rotten voice with phlegm gurgling in it, and a wet snort on each grunt. */
function zoglinGrunts(c: Ctx, th: Throat, gs: Grunt[], len: number, gurgle: number, lp: number): Float32Array {
  const { sr } = c;
  const out = alloc(len, sr);
  layer(out, 1, (b) => {
    for (const g of gs) gruntInto(b, c, th, g);
  });
  layer(out, gurgle, (b) => {
    for (const g of gs) gurgleInto(b, c, g.t, g.d, 40);
  });
  layer(out, 0.14, (b) => {
    for (const g of gs) snortInto(b, c, g.t, Math.min(0.08, g.d * 0.4), 800);
  });
  lowpass(out, lp, sr);
  return out;
}

/** Zoglin idle: deep, rotten boar grunts, gurgling and snorting wetly; five different takes. */
function zoglinAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(56, 68);
  const gs: Grunt[] = [];
  const snorts: [number, number, boolean][] = []; // [start, length, inhale]
  switch (v) {
    case 0: // one deep, wet "HRRGH"
      gs.push({ t: 0, d: 0.32, f0: (x) => base * (1.15 + 0.1 * Math.sin(Math.PI * x) - 0.3 * x), open: 0.6 });
      break;
    case 1: // a gurgling snort in, then a rotten grunt
      snorts.push([0, 0.14, true]);
      gs.push({ t: 0.2, d: 0.3, f0: (x) => base * (1.1 - 0.22 * x), open: 0.5 });
      break;
    case 2: // "hrm-HRRGH"
      gs.push({ t: 0, d: 0.15, f0: (x) => base * (1 - 0.1 * x), open: 0.3, a: 0.7 });
      gs.push({ t: 0.21, d: 0.32, f0: (x) => base * (1.25 - 0.38 * x), open: 0.8 });
      break;
    case 3: // a long, bubbling grunt that sags
      gs.push({ t: 0, d: 0.62, f0: (x) => base * (1.1 + 0.15 * Math.sin(Math.PI * Math.min(1, 1.6 * x)) - 0.4 * x), open: 0.5 });
      break;
    default: // a grunt, then a wet, rattling snort out
      gs.push({ t: 0, d: 0.24, f0: (x) => base * (1.2 - 0.25 * x), open: 0.7 });
      snorts.push([0.27, 0.2, false]);
  }
  const out = zoglinGrunts(c, ZOGLIN, gs, 1, 0.32, 3000);
  if (snorts.length) {
    layer(out, 0.55, (b) => {
      for (const [t, d, inhale] of snorts) wetSnortInto(b, c, t, d, rng.range(600, 850), inhale);
    });
    lowpass(out, 3200, sr);
  }
  return out;
}

/** Zoglin angry: a rotten, gurgling roar that swells and breaks. */
function zoglinAngry(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(68, 80);
  const gs: Grunt[] = [];
  let sn = -1;
  switch (v) {
    case 0: // a wet snort, then the roar
      sn = 0;
      gs.push({ t: 0.13, d: 0.72, f0: (x) => base * envExpPts(x, [0, 1, 0.35, 1.7, 1, 1.1]), open: 1 });
      break;
    case 1: // a long roar with two swells
      gs.push({ t: 0, d: 0.9, f0: (x) => base * (1.3 + 0.35 * Math.sin(Math.PI * x) + 0.15 * Math.sin(TAU * 2 * x)), open: 0.9 });
      break;
    default: // a grunt, then the roar, sagging at the end
      gs.push({ t: 0, d: 0.16, f0: (x) => base * (1.1 - 0.1 * x), open: 0.5, a: 0.7 });
      gs.push({ t: 0.2, d: 0.68, f0: (x) => base * envExpPts(x, [0, 1.2, 0.3, 1.9, 0.8, 1.35, 1, 1]), open: 1 });
  }
  const out = zoglinGrunts(c, ZOGLIN_ROAR, gs, 1.2, 0.3, 3800);
  // the breath of the roar
  layer(out, 0.3, (b) => {
    for (const g of gs) {
      const d = g.d;
      sweep(b, sr, rng, { t: g.t, dur: d, f: (t) => 700 + 450 * Math.sin((Math.PI * t) / d), q: 1.2, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' });
    }
  });
  if (sn >= 0) layer(out, 0.65, (b) => wetSnortInto(b, c, sn, 0.13, 700, true));
  return out;
}

/** Zoglin attack: the heavy, gurgling grunt of a headbutt, with the thud of the toss. */
function zoglinAttack(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(74, 88) * (v === 0 ? 1 : 0.9);
  const d = v === 0 ? rng.range(0.2, 0.24) : rng.range(0.26, 0.3);
  const out = zoglinGrunts(c, ZOGLIN_ROAR, [{ t: 0, d, f0: (x) => base * envExpPts(x, [0, 1.2, 0.25, 1.35, 1, 0.85]), open: 0.9 }], 0.5, 0.25, 3600);
  layer(out, 0.55, (b) => thump(b, sr, { t: 0.02, f0: 100, f1: 45, tau: 0.06, attack: 0.003 }));
  layer(out, 0.35, (b) => wetSnortInto(b, c, d * 0.8, 0.14, 750));
  return out;
}

/** Zoglin hurt: a deep, pained squeal-grunt that chokes off into a wet rattle; three different shapes. */
function zoglinHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(0.26, 0.34);
  const out = alloc(d + 0.3, sr);
  const f = rng.range(110, 130);
  layer(out, 1, (b) => {
    if (v === 0) {
      // a squeal that sinks into a choking grunt
      yelpInto(b, c, 0, d, f, 0.6, 0.72, 0.6);
      gruntInto(b, c, ZOGLIN, { t: d * 0.7, d: 0.18, f0: (x) => 64 * (1 - 0.15 * x), a: 0.5 });
    } else if (v === 1) {
      // "hrk-EEGH": a caught grunt, then the squeal
      gruntInto(b, c, ZOGLIN_ROAR, { t: 0, d: 0.1, f0: (x) => 80 * (1 + 0.1 * x), open: 0.7, a: 0.8 });
      yelpInto(b, c, 0.09, d, f * 1.1, 0.72, 0.72, 0.6);
    } else {
      // a short, sharp yelp and a gurgle
      yelpInto(b, c, 0, d * 0.7, f * 1.18, 0.5, 0.72, 0.65);
    }
  });
  layer(out, 0.28, (b) => gurgleInto(b, c, d * 0.5, 0.25, 45));
  layer(out, 0.3, (b) => snortInto(b, c, 0, 0.06, 850));
  lowpass(out, 4000, sr);
  return out;
}

/** Zoglin death: a long, groaning squeal that sinks and drowns in a bubbling, rotten gurgle. */
function zoglinDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = [0.95, 1.1, 0.85][v % 3];
  const groan = deathGroan(c, rng.range(135, 158), 0.72, d, [1.3, 1.45, 1.2][v % 3], 650);
  const out = alloc(groan.length / sr, sr);
  layer(out, 1, (b) => b.set(groan));
  layer(out, 0.4, (b) => gurgleInto(b, c, d * 0.35, d * 0.65, 50));
  lowpass(out, 3600, sr);
  return out;
}

/** Zoglin step: a heavy cloven hoof coming down hard on rotting flesh, a dull thud with a wet squelch. */
function zoglinStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.32, sr);
  const f = rng.range(90, 120);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.07, f * 2.2, 0.45, 0.05, f * 3.9, 0.2, 0.03, 850, 0.1, 0.012],
      jitter: 0.05,
      noise: 0.45,
      noiseTau: 0.004,
      noiseBp: [1100, 0.8],
    }),
  );
  layer(out, 0.8, (b) => thump(b, sr, { f0: 105, f1: 48, tau: 0.045, attack: 0.002 }));
  layer(out, 0.45, (b) => sweep(b, sr, rng, { t: 0.005, dur: 0.2, f: (t) => 800 * Math.pow(0.45, t / 0.12), q: 2.4, amp: (t) => envAD(t, 0.006, 0.035) }));
  layer(out, 0.25, (b) => {
    const n = 1 + rng.int(2);
    for (let k = 0; k < n; k++) bubble(b, sr, rng.range(0.01, 0.07), rng.range(300, 700), 1, undefined, 0.5);
  });
  lowpass(out, 4000, sr);
  return out;
}

// ------------------------------------------------------------------ respawn anchor

// The anchor's hums are dark, so they are rendered at half the sample rate (as nether.ts does its portal).

/** Half-rate render -> full rate, with the images above ~10 kHz removed. */
function up2(x: Float32Array, sr: number): Float32Array {
  const y = upsample2(x);
  lowpass(y, 9500, sr);
  return lowpass(y, 9500, sr);
}

/** A slow oscillator whose rate glides (rate(x) Hz over normalised time x): returns sin(phase), tabulated at 1 kHz. */
function glideLfo(rng: Rng, d: number, rate: (x: number) => number): (t: number) => number {
  const K = 1000;
  const N = Math.ceil(d * K) + 2;
  const ph = new Float64Array(N);
  ph[0] = rng.next();
  for (let k = 1; k < N; k++) ph[k] = ph[k - 1] + rate(Math.min(1, k / K / d)) / K;
  return (t) => {
    const u = clamp(t * K, 0, N - 1.001);
    const k = u | 0;
    return Math.sin(TAU * (ph[k] + (ph[k + 1] - ph[k]) * (u - k)));
  };
}

/**
 * A deep, magical hum: `n` harmonics of f(t), each voiced twice a hair apart so they shimmer and
 * beat, rolled off above bright(t) Hz.
 */
function humInto(b: Float32Array, sr: number, t0: number, d: number, f: (t: number) => number, amp: (t: number) => number, n: number, bright: (t: number) => number): void {
  for (let h = 1; h <= n; h++) {
    for (const det of [0.9965, 1.0035]) {
      addOsc(
        b,
        sr,
        t0,
        d,
        (t) => f(t) * h * det,
        (t) => ((0.5 / h) * amp(t)) / (1 + Math.pow((f(t) * h) / bright(t), 2)),
        h * 1.7,
      );
    }
  }
}

/** The swirl of power in the anchor: resonant noise bands at `ks` times f(t), circling as they move. */
function swirlInto(b: Float32Array, sr: number, rng: Rng, d: number, f: (t: number) => number, ks: number[], q: number, amp: (t: number) => number): void {
  for (const k of ks) {
    const lf = rng.range(0.5, 1.1);
    const ph = rng.next() * TAU;
    sweep(b, sr, rng, { dur: d, f: (t) => f(t) * k * (1 + 0.12 * Math.sin(TAU * lf * t + ph)), q, amp, color: 'pink' });
  }
}

/** Respawn anchor charge: a block of glowstone going in, a soft chunk, then a deep, resonant thrum that rises as the anchor fills. */
function anchorCharge(c: Ctx): Float32Array {
  const { rng, v } = c;
  const sr = c.sr / 2;
  const D = [1.25, 1.1, 1.4][v % 3] * rng.range(0.95, 1.05);
  const out = alloc(D + 0.05, sr);
  const f0 = rng.range(50, 58) * [1, 1.12, 0.92][v % 3];
  const up = [1.7, 1.55, 1.85][v % 3];
  const rise = (t: number) => smooth(Math.min(1, t / (D * 0.75)));
  const f = (t: number) => f0 * Math.pow(up, rise(t));
  const env = (t: number) => smooth(envPts(t / D, [0, 0, 0.1, 0.45, 0.72, 1, 1, 0]));
  // the thrum pulses faster as the charge builds
  const thr = glideLfo(rng, D, (x) => 5 + 9 * x);
  layer(out, 1, (b) => humInto(b, sr, 0, D, f, (t) => env(t) * (0.6 + 0.4 * thr(t)), 8, (t) => 260 + 900 * rise(t)));
  layer(out, 0.5, (b) => swirlInto(b, sr, rng, D, f, [6, 11, 19], 6, (t) => env(t) * (0.7 + 0.3 * thr(t))));
  // a breath of air rising through it
  layer(out, 0.14, (b) => sweep(b, sr, rng, { dur: D, f: (t) => 1200 * Math.pow(2.5, rise(t)), q: 2, amp: (t) => env(t) * rise(t), color: 'pink' }));
  // the glowstone going in: a soft, crumbly chunk
  layer(out, 0.45, (b) => {
    impact(b, sr, rng, { modes: [rng.range(170, 220), 1, 0.07, rng.range(420, 520), 0.45, 0.04], jitter: 0.03, noise: 0.8, noiseTau: 0.004, noiseBp: [1400, 0.8] });
    phisem(b, sr, rng, {
      dur: 0.12,
      rate: 4000,
      energy: (t) => envAD(t, 0.003, 0.03),
      grain: 0.0008,
      heavy: 2,
      bands: [
        { f: 2200, q: 1.3, g: 1, spread: 0.3 },
        { f: 4200, q: 1.5, g: 0.5, spread: 0.3 },
      ],
    });
  });
  return up2(reverb(out, sr, { t60: 1.4, wet: 0.35, size: 1.3, pre: 0.02, hf: 0.45, lowcut: 120, tail: 0.9 }), c.sr);
}

/** Respawn anchor deplete: a charge used up, the power draining away in a falling, slowing thrum. */
function anchorDeplete(c: Ctx): Float32Array {
  const { rng, v } = c;
  const sr = c.sr / 2;
  const D = [1.15, 1.3][v % 2] * rng.range(0.95, 1.05);
  const out = alloc(D + 0.05, sr);
  const f0 = rng.range(95, 110) * (v === 0 ? 1 : 0.9);
  const fall = (t: number) => 1 - Math.exp(-t / (D * 0.35));
  const f = (t: number) => f0 * Math.pow(0.36, fall(t));
  const env = (t: number) => (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) / (D * 0.38))) * clamp((D - t) / 0.1, 0, 1);
  // the thrum slows as the power drains
  const thr = glideLfo(rng, D, (x) => 13 - 10 * x);
  layer(out, 1, (b) => humInto(b, sr, 0, D, f, (t) => env(t) * (0.65 + 0.35 * thr(t)), 8, (t) => 160 + 1000 * Math.pow(0.25, fall(t))));
  layer(out, 0.5, (b) => swirlInto(b, sr, rng, D, f, [6, 11, 19], 5, (t) => env(t) * (0.7 + 0.3 * thr(t))));
  // the air rushing out of it
  layer(out, 0.14, (b) => sweep(b, sr, rng, { dur: D, f: (t) => 3000 * Math.pow(0.3, fall(t)), q: 2, amp: env, color: 'pink' }));
  layer(out, 0.5, (b) => thump(b, sr, { f0: 110, f1: 40, glide: 0.1, tau: 0.18, attack: 0.008 }));
  return up2(reverb(out, sr, { t60: 1.3, wet: 0.35, size: 1.3, pre: 0.02, hf: 0.45, lowcut: 120, tail: 0.8 }), c.sr);
}

/** Respawn anchor set spawn: a resonant, echoing, magical swell, a shimmering chord blooming over the deep hum. */
function anchorSetSpawn(c: Ctx): Float32Array {
  const { rng, v } = c;
  const sr = c.sr / 2;
  const D = 1.8;
  const out = alloc(D + 0.6, sr);
  const root = rng.range(52, 58) * [1, 1.06, 0.94][v % 3];
  // stacked fifths and octaves; the other takes colour it with a ninth or a fourth
  const chord = [
    [1, 1.5, 2, 3],
    [1, 1.5, 2.25, 3],
    [1, 1.333, 2, 3],
  ][v % 3];
  const env = (t: number) => smooth(envPts(t / D, [0, 0, 0.05, 0.5, 0.35, 1, 0.6, 0.8, 1, 0]));
  const vr = rng.range(4.5, 5.5);
  // the anchor answering at once: a soft, resonant "bwong" the swell grows out of
  layer(out, 0.45, (b) => thump(b, sr, { f0: root * 2, f1: root, glide: 0.08, tau: 0.3, attack: 0.012, h2: 0.3 }));
  // the deep hum
  layer(out, 0.8, (b) => humInto(b, sr, 0, D, (t) => root * (1 + 0.004 * Math.sin(TAU * vr * t)), env, 5, () => 400));
  // the chord blooming above it, its voices entering one after another
  layer(out, 1, (b) => {
    chord.forEach((r, k) => {
      const fr = root * 4 * r;
      const t0 = 0.06 * k;
      const e = (t: number) => env(t + t0) / Math.sqrt(r);
      for (const det of [0.996, 1.004]) addOsc(b, sr, t0, D - t0, (t) => fr * det * (1 + 0.005 * Math.sin(TAU * vr * t + k)), e, k);
      // a faint, glassy upper partial
      addOsc(b, sr, t0, D - t0, (t) => fr * 2.76, (t) => 0.12 * e(t), k + 1);
    });
  });
  // a rising breath of air through it
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: D, f: (t) => 400 * Math.pow(4, smooth(t / D)), q: 4, amp: env, color: 'pink' }));
  echo(out, sr, 0.19, 0.35, 0.4, 3000);
  return up2(reverb(out, sr, { t60: 2.6, wet: 0.7, size: 1.6, pre: 0.03, hf: 0.4, lowcut: 150, tail: 1.6 }), c.sr);
}

/** Respawn anchor ambient: now and then a charged anchor hums to itself, a low, portal-like swirl and warble. */
function anchorAmbient(c: Ctx): Float32Array {
  const { rng, v } = c;
  const sr = c.sr / 2;
  const D = [2.6, 3.1, 2.2][v % 3] * rng.range(0.95, 1.05);
  const out = alloc(D, sr);
  const env = (t: number) => envBump(t, D * 0.4, D * 0.6);
  const wob = rng.range(3.5, 5.5);
  const wph = rng.next() * TAU;
  const warble = (t: number) => Math.sin(TAU * wob * t + wph);
  const fb = rng.range(48, 56);
  // the swirl: resonant noise bands circling round each other, as in the portal but lower and smaller
  layer(out, 1, (b) => swirlInto(b, sr, rng, D, (t) => fb * (1 + 0.05 * warble(t)), [5, 8.5, 13.5], 7, env));
  // the deep hum under it
  layer(out, 0.6, (b) => humInto(b, sr, 0, D, (t) => fb * (1 + 0.012 * warble(t)), env, 6, () => 280));
  for (let i = 0; i < out.length; i++) out[i] *= 0.75 + 0.25 * warble(i / sr);
  return up2(out, c.sr);
}

// ------------------------------------------------------------------ registry

export function netherMobSounds2(): Record<string, SoundGen> {
  // vanilla's entity.blaze.burn is the fire block's own sound (fire/fire): the same flames, with soft edges as a one-shot
  const fire = worldSounds()['block.fire.ambient'];
  return {
    'entity.blaze.ambient': sound('entity.blaze.ambient', 4, blazeAmbient),
    'entity.blaze.hurt': sound('entity.blaze.hurt', 4, blazeHurt),
    'entity.blaze.death': sound('entity.blaze.death', 1, blazeDeath),
    'entity.blaze.shoot': sound('entity.blaze.shoot', 1, blazeShoot),
    'entity.blaze.burn': sound('entity.blaze.burn', 1, (c) => fire.generate(0, c.sr), { fadeIn: 0.02, fadeOut: 0.15 }),

    'entity.wither_skeleton.ambient': sound('entity.wither_skeleton.ambient', 3, witherAmbient),
    'entity.wither_skeleton.hurt': sound('entity.wither_skeleton.hurt', 4, witherHurt),
    'entity.wither_skeleton.death': sound('entity.wither_skeleton.death', 2, witherDeath),
    'entity.wither_skeleton.step': sound('entity.wither_skeleton.step', 4, witherStep),

    'entity.piglin_brute.ambient': sound('entity.piglin_brute.ambient', 5, bruteAmbient),
    'entity.piglin_brute.angry': sound('entity.piglin_brute.angry', 4, bruteAngry),
    'entity.piglin_brute.hurt': sound('entity.piglin_brute.hurt', 4, bruteHurt),
    'entity.piglin_brute.death': sound('entity.piglin_brute.death', 3, (c) => deathGroan(c, c.rng.range(170, 195), 0.86, [0.85, 1, 0.75][c.v % 3], [1.3, 1.4, 1.25][c.v % 3], 950)),
    'entity.piglin_brute.step': sound('entity.piglin_brute.step', 4, bruteStep),
    'entity.piglin_brute.converted_to_zombified': sound('entity.piglin_brute.converted_to_zombified', 3, (c) => converted(c, BRUTE_SHOUT, c.rng.range(92, 104)), { trimStartDb: -26 }),

    'entity.zoglin.ambient': sound('entity.zoglin.ambient', 5, zoglinAmbient),
    'entity.zoglin.angry': sound('entity.zoglin.angry', 3, zoglinAngry),
    'entity.zoglin.attack': sound('entity.zoglin.attack', 2, zoglinAttack),
    'entity.zoglin.hurt': sound('entity.zoglin.hurt', 3, zoglinHurt),
    'entity.zoglin.death': sound('entity.zoglin.death', 3, zoglinDeath),
    'entity.zoglin.step': sound('entity.zoglin.step', 4, zoglinStep),

    'block.respawn_anchor.charge': sound('block.respawn_anchor.charge', 3, anchorCharge),
    'block.respawn_anchor.deplete': sound('block.respawn_anchor.deplete', 2, anchorDeplete),
    'block.respawn_anchor.set_spawn': sound('block.respawn_anchor.set_spawn', 3, anchorSetSpawn),
    'block.respawn_anchor.ambient': sound('block.respawn_anchor.ambient', 3, anchorAmbient),
  };
}
