// Nether mob vocalisations and foley, second batch: blaze (breath through hot metal pipes) and wither
// skeleton (deep, hollow bony rattles), in the style of netherMobs.ts.

import type { SoundGen } from '../synth';
import { type Rng, SVF, TAU, alloc, clamp, envAD, envBump, envExpPts, envPts, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, fireCrackles, impact, sweep, thump, ticks } from './texture';
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
  const r = rng.range(32, 44);
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
  const p = rng.range(170, 230);
  return blazeBreaths(c, bs, { pipe: p, fb: 0.7, fc: rng.range(800, 1000), rod: rng.range(950, 1200), ring: rng.range(1100, 1400) });
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
  const f = rng.range(620, 760);
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
    case 2: // a sharp gasp in, cut off by the clang
      bs.push({ t: 0, d: 0.2, kind: 'in', a: 0.8, rasp: 0.6, rate: 58, slow: -0.3 });
      bs.push({ t: 0.2, d: 0.2, kind: 'hit', a: 0.9, rasp: 0.8, rate: 50 });
      clangs.push([0.196, f * 0.9, 1]);
      break;
    default: // a lower clang and a longer, rasping huff
      bs.push({ t: 0.004, d: 0.42, kind: 'hit', rasp: 0.9, rate: 42, slow: 0.4 });
      clangs.push([0, f * 0.78, 1]);
  }
  const body = blazeBreaths(c, bs, { pipe: rng.range(250, 310), fb: 0.78, fc: rng.range(950, 1100), rod: rng.range(1100, 1400), ring: rng.range(1350, 1650), ringMix: 0.4, rattleMix: 0.45, room: [0.5, 0.16], lp: 7000 });
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
  };
}
