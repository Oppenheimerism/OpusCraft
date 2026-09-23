// Nether block sound types (vanilla 1.16+ SoundTypes): netherrack and its ores, nylium, soul sand
// and soul soil, basalt, wart blocks, ancient debris, nether bricks, bone blocks, shroomlight, the
// nether plants (fungus, roots, sprouts, weeping vines), stems and nether wood, netherite,
// lodestone and gilded blackstone.
//
// Same conventions as blocks.ts: `place` reuses the break takes, `hit` is the step take at
// pitch 0.5 and `fall` the step take at pitch 0.75 (vanilla plays a SoundType's fall sound — its
// step files — at pitch * 0.75); break and place are designed for vanilla's playback pitch 0.8.

import type { SoundGen } from '../synth';
import { type Rng, alloc, envBump, layer, lowpass } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { bubble, burst, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import { voice } from './voice';

type Env = (t: number) => number;

/** break energy: fast onset, a quick main decay and a longer, quieter settle */
const brkEnv = (tau: number, tail = 0, tailTau = 0.2): Env => (t) => (1 - Math.exp(-t / 0.004)) * ((1 - tail) * Math.exp(-t / tau) + tail * Math.exp(-t / tailTau));

/** heel-and-toe energy of a footstep with the toe `t2` later */
const stepEnv = (rng: Rng, t2: number, a = 0.006, d = 0.025): Env => twoBump(a, d, t2, rng.range(0.45, 0.75), a, d * 1.15);

// ------------------------------------------------------------------ small shared textures

/** crumbly porous-rock grit (netherrack family): lots of small, dry, loosely tuned grains */
function grit(b: Float32Array, sr: number, rng: Rng, dur: number, rate: number, energy: Env, tone: number, grain = 0.0009, t = 0): void {
  phisem(b, sr, rng, {
    t,
    dur,
    rate,
    energy,
    grain,
    heavy: 2.7,
    bands: [
      { f: 2000 * tone, q: 1.3, g: 1, spread: 0.5 },
      { f: 950 * tone, q: 1.6, g: 0.8, spread: 0.35 },
      { f: 3900 * tone, q: 1.4, g: 0.2, spread: 0.3 },
    ],
  });
}

/** quartz: small crystalline clinks */
function quartzClinks(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, rate: number, energy: Env): void {
  ticks(b, sr, rng, { t, dur, rate, energy, f: [2300, 5000], t60: [0.015, 0.045], ratios: [1, 1.73, 2.61], weights: [1, 0.45, 0.22], heavy: 1.8, click: 0.35 });
}

/** gold: bright little metallic tinkles (nuggets and flecks) */
function goldTinkle(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, rate: number, energy: Env): void {
  ticks(b, sr, rng, { t, dur, rate, energy, f: [2500, 5000], t60: [0.03, 0.09], ratios: [1, 2.76, 5.4], weights: [1, 0.3, 0.08], heavy: 1.5, click: 0.12 });
}

/** a fibrous brush (nylium's fuzz, roots): soft, dense rustle */
function brush(b: Float32Array, sr: number, rng: Rng, dur: number, energy: Env, tone = 1, rate = 8000): void {
  phisem(b, sr, rng, {
    dur,
    rate,
    energy,
    grain: 0.0007,
    heavy: 2.3,
    bands: [
      { f: 3100 * tone, q: 1, g: 1, spread: 0.35 },
      { f: 1550 * tone, q: 1.3, g: 0.7, spread: 0.3 },
      { f: 5600 * tone, q: 1.3, g: 0.3, spread: 0.2 },
    ],
  });
}

/** a moist squelch: noise through a resonance gliding up (or down), shaped as a bump */
function squelch(b: Float32Array, sr: number, rng: Rng, t: number, d: number, fA: number, fB: number, q = 3.5): void {
  sweep(b, sr, rng, { t, dur: d, f: (u) => fA * Math.pow(fB / fA, u / d), q, amp: (u) => envBump(u, d * 0.3, d * 0.7) });
}

// ------------------------------------------------------------------ netherrack family

interface RackOpts {
  /** pitch / brightness scale of the knock and the grains */
  tone?: number;
  /** hollow body amount */
  hollow?: number;
  /** crumbly grit amount */
  crumble?: number;
}

/** Netherrack step: a dry, quickly damped knock over a hollow little body, then crumbly grit. */
function rackStep(c: Ctx, o: RackOpts = {}): Float32Array {
  const { sr, rng } = c;
  const tone = o.tone ?? 1, hollow = o.hollow ?? 1, crumble = o.crumble ?? 1;
  const out = alloc(0.24, sr);
  const t2 = rng.range(0.04, 0.07);
  const f = rng.range(1050, 1450) * tone;
  // porous rock rings far less than stone: short modes, a lot of contact noise
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.0075, f * rng.range(1.4, 1.6), 0.55, 0.0055, f * rng.range(2.1, 2.5), 0.3, 0.004, f * 0.47, 0.35, 0.01],
      jitter: 0.04,
      noise: 1.5,
      noiseTau: 0.003,
      noiseBp: [2100 * tone, 0.8],
    }),
  );
  const hf = rng.range(290, 400) * (0.8 + 0.2 * tone);
  layer(out, 0.5 * hollow, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.0012, tau: 0.013, bp: [hf, 3.2] }));
  layer(out, 0.8 * crumble, (b) => grit(b, sr, rng, 0.2, 4200, stepEnv(rng, t2), tone));
  layer(out, rng.range(0.3, 0.45), (b) =>
    impact(b, sr, rng, {
      t: t2,
      modes: [f * rng.range(0.85, 1.15), 1, 0.006, f * 1.5, 0.5, 0.0045],
      noise: 1.1,
      noiseTau: 0.0025,
      noiseBp: [2100 * tone, 0.8],
    }),
  );
  return out;
}

/** Netherrack break: the knock and a hollow thud, then the rock crumbling away into grit. */
function rackBreak(c: Ctx, o: RackOpts = {}): Float32Array {
  const { sr, rng } = c;
  const tone = o.tone ?? 1, hollow = o.hollow ?? 1, crumble = o.crumble ?? 1;
  const out = alloc(0.5, sr);
  const f = rng.range(800, 1150) * tone;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.014, f * rng.range(1.42, 1.58), 0.6, 0.01, f * rng.range(2.2, 2.45), 0.35, 0.007, f * 0.48, 0.5, 0.018],
      jitter: 0.04,
      noise: 1.8,
      noiseTau: 0.005,
      noiseBp: [2200 * tone, 0.6],
    }),
  );
  layer(out, 0.5 * hollow, (b) => burst(b, sr, rng, { dur: 0.16, attack: 0.0015, tau: 0.026, bp: [rng.range(270, 370), 2.6] }));
  layer(out, 0.32, (b) => thump(b, sr, { f0: 200, f1: 115, glide: 0.02, tau: 0.022 }));
  layer(out, 0.95 * crumble, (b) => grit(b, sr, rng, 0.45, 2700, brkEnv(0.085, 0.2, 0.2), tone, 0.0012, 0.003));
  layer(out, 0.42 * crumble, (b) =>
    ticks(b, sr, rng, { t: 0.008, dur: 0.34, rate: 70, energy: (t) => Math.exp(-t / 0.09), f: [900 * tone, 3600 * tone], t60: [0.004, 0.016], heavy: 2, click: 0.45 }),
  );
  return out;
}

function netherOreStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = rackStep(c, { tone: 1.12, hollow: 0.7, crumble: 0.75 });
  layer(out, 0.35, (b) => quartzClinks(b, sr, rng, 0.002, 0.08, 45, (t) => Math.exp(-t / 0.03)));
  return out;
}

function netherOreBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = rackBreak(c, { tone: 1.1, hollow: 0.7, crumble: 0.85 });
  layer(out, 0.6, (b) => quartzClinks(b, sr, rng, 0.004, 0.3, 90, (t) => Math.exp(-t / 0.09)));
  return out;
}

function goldOreStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = rackStep(c, { tone: 1.05, hollow: 0.85, crumble: 0.8 });
  layer(out, 0.22, (b) => goldTinkle(b, sr, rng, 0.003, 0.08, 40, (t) => Math.exp(-t / 0.03)));
  return out;
}

function goldOreBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = rackBreak(c, { tone: 1.02, hollow: 0.85, crumble: 0.9 });
  layer(out, 0.5, (b) => goldTinkle(b, sr, rng, 0.006, 0.34, 70, (t) => Math.exp(-t / 0.1)));
  return out;
}

/** Nylium: netherrack under a fibrous, slightly spongy fuzz. */
function nyliumSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const out = brk ? rackBreak(c, { tone: 0.92, hollow: 0.8, crumble: 0.7 }) : rackStep(c, { tone: 0.9, hollow: 0.75, crumble: 0.65 });
  const n = out.length;
  const en = brk ? brkEnv(0.07, 0.3, 0.18) : stepEnv(rng, rng.range(0.05, 0.08), 0.012, 0.035);
  layer(out, brk ? 0.7 : 0.65, (b) => brush(b, sr, rng, n / sr, en, 0.95));
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.006, tau: 0.03, lp: 600 }));
  return out;
}

// ------------------------------------------------------------------ soul sand & soul soil

/**
 * Soul sand: a sandy, slightly coarse crunch with a hollow, breathy "hooh" in it — noise through
 * a falling resonance plus a whispered formant tail.
 */
function soulSand(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.62 : 0.36;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.09, 0.3, 0.25) : twoBump(0.018, 0.045, rng.range(0.05, 0.09), rng.range(0.5, 0.8), 0.018, 0.05);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 16000,
      energy: en,
      grain: 0.0022,
      heavy: 1.6,
      dry: 0.04,
      bands: [
        { f: 2300, q: 0.9, g: 1, spread: 0.2 },
        { f: 1050, q: 1.1, g: 0.6, spread: 0.15 },
        { f: 4600, q: 1, g: 0.25 },
      ],
    }),
  );
  const hd = brk ? rng.range(0.38, 0.5) : rng.range(0.2, 0.28);
  const f0 = rng.range(520, 680);
  const f1 = f0 * rng.range(0.5, 0.65);
  layer(out, brk ? 0.72 : 0.6, (b) =>
    sweep(b, sr, rng, { t: 0.004, dur: hd, f: (t) => f0 * Math.pow(f1 / f0, t / hd), q: 4.5, amp: (t) => envBump(t, hd * 0.18, hd * 0.82), color: 'pink' }),
  );
  const fs = rng.range(0.9, 1.1);
  layer(out, brk ? 0.45 : 0.35, (b) =>
    voice(b, sr, rng, {
      t: 0.01,
      dur: hd * 1.1,
      f0: 110,
      voiced: 0,
      breath: 1,
      amp: (t) => envBump(t, hd * 0.25, hd * 0.85),
      formants: [
        { f: 470 * fs, bw: 140, g: 1 },
        { f: 880 * fs, bw: 200, g: 0.6 },
        { f: 2400 * fs, bw: 400, g: 0.22 },
      ],
    }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.14, attack: 0.008, tau: 0.035, lp: 450 }));
  return out;
}

/** Soul soil: drier and grittier — coarse grains, a dull thud and only a faint hollowness. */
function soulSoil(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.5 : 0.3;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.1, 0.25, 0.2) : twoBump(0.01, 0.035, rng.range(0.05, 0.08), rng.range(0.5, 0.8), 0.012, 0.04);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 6500,
      energy: en,
      grain: 0.0013,
      heavy: 2.4,
      bands: [
        { f: 1900, q: 1.2, g: 1, spread: 0.4 },
        { f: 850, q: 1.4, g: 0.85, spread: 0.3 },
        { f: 3800, q: 1.3, g: 0.3, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.4, (b) => burst(b, sr, rng, { dur: 0.16, attack: 0.004, tau: brk ? 0.04 : 0.03, lp: 600 }));
  layer(out, 0.28, (b) => thump(b, sr, { f0: 125, f1: 78, tau: 0.022 }));
  const hd = brk ? 0.22 : 0.13;
  const f0 = rng.range(430, 520);
  layer(out, 0.22, (b) => sweep(b, sr, rng, { t: 0.004, dur: hd, f: (t) => f0 * (1 - 0.35 * (t / hd)), q: 3, amp: (t) => envBump(t, hd * 0.2, hd * 0.8), color: 'pink' }));
  layer(out, 0.32, (b) => ticks(b, sr, rng, { dur: d * 0.8, rate: brk ? 110 : 80, energy: en, f: [800, 2800], t60: [0.004, 0.012], heavy: 2, click: 0.45 }));
  return out;
}

// ------------------------------------------------------------------ basalt

/** Basalt: a sharp, dense, glassy stone knock — clean, with almost no crumble. */
function basaltStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.2, sr);
  const f = rng.range(1700, 2300);
  const body = rng.range(480, 640);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.016, f * rng.range(1.48, 1.56), 0.6, 0.012, f * rng.range(2.25, 2.38), 0.45, 0.009, f * 3.4, 0.22, 0.006, body, 0.5, 0.022],
      jitter: 0.02,
      noise: 1.1,
      noiseTau: 0.0018,
      noiseBp: [3800, 0.8],
    }),
  );
  const t2 = rng.range(0.03, 0.06);
  layer(out, rng.range(0.3, 0.5), (b) =>
    impact(b, sr, rng, {
      t: t2,
      modes: [f * rng.range(0.9, 1.15), 1, 0.012, f * 1.52, 0.5, 0.009, body * 1.1, 0.4, 0.018],
      noise: 0.8,
      noiseTau: 0.0015,
      noiseBp: [3800, 0.8],
    }),
  );
  layer(out, 0.18, (b) => phisem(b, sr, rng, { dur: 0.06, rate: 2500, energy: (t) => Math.exp(-t / 0.012), grain: 0.0005, bands: [{ f: 3500, q: 1.5, g: 1, spread: 0.3 }] }));
  return out;
}

function basaltBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const f = rng.range(1200, 1600);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.035, f * 1.52, 0.65, 0.026, f * 2.31, 0.45, 0.018, f * 3.4, 0.3, 0.012, f * 0.42, 0.45, 0.03],
      jitter: 0.02,
      noise: 1.6,
      noiseTau: 0.004,
      noiseBp: [3000, 0.7],
    }),
  );
  layer(out, 0.3, (b) => thump(b, sr, { f0: 220, f1: 130, glide: 0.02, tau: 0.02 }));
  layer(out, 0.55, (b) =>
    ticks(b, sr, rng, {
      t: 0.006,
      dur: 0.3,
      rate: 75,
      energy: (t) => Math.exp(-t / 0.08),
      f: [1600, 5200],
      t60: [0.012, 0.04],
      ratios: [1, 1.73, 2.6],
      weights: [1, 0.55, 0.3],
      heavy: 1.8,
      click: 0.35,
    }),
  );
  layer(out, 0.45, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.3,
      rate: 1500,
      energy: brkEnv(0.06),
      grain: 0.001,
      heavy: 3,
      bands: [
        { f: 2600, q: 2.2, g: 1, spread: 0.4 },
        { f: 1200, q: 2.4, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ wart blocks, shroomlight

/** Wart block: soft and fleshy — a padded low thud, a wet squelch and a little moist crackle. */
function wartSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.42 : 0.28;
  const out = alloc(d, sr);
  layer(out, 0.55, (b) => thump(b, sr, { f0: rng.range(150, 180), f1: 100, glide: 0.02, tau: brk ? 0.03 : 0.022, attack: 0.004 }));
  layer(out, 0.8, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.004, tau: brk ? 0.05 : 0.035, lp: 1100 }));
  const sd = brk ? rng.range(0.1, 0.15) : rng.range(0.06, 0.09);
  const fA = rng.range(260, 360);
  layer(out, brk ? 0.9 : 0.75, (b) => squelch(b, sr, rng, 0.006, sd, fA, fA * rng.range(2.2, 3.2)));
  const en = brk ? brkEnv(0.08, 0.3) : stepEnv(rng, rng.range(0.05, 0.08), 0.01, 0.035);
  layer(out, brk ? 0.5 : 0.4, (b) =>
    phisem(b, sr, rng, {
      dur: d * 0.8,
      rate: 1800,
      energy: en,
      grain: 0.0015,
      heavy: 2.2,
      bands: [
        { f: 1400, q: 1.2, g: 1, spread: 0.35 },
        { f: 2600, q: 1.4, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** Shroomlight: soft and spongy — a muffled puff with damp cells collapsing inside it. */
function shroomlightSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.45 : 0.3;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.07, 0.3, 0.18) : stepEnv(rng, rng.range(0.05, 0.09), 0.012, 0.04);
  layer(out, 1, (b) => {
    burst(b, sr, rng, { dur: d, attack: rng.range(0.006, 0.012), tau: brk ? 0.06 : 0.04, lp: rng.range(900, 1300) });
    lowpass(b, 1500, sr);
  });
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 3500,
      energy: en,
      grain: 0.002,
      heavy: 2,
      bands: [
        { f: 1100, q: 1, g: 1, spread: 0.35 },
        { f: 2200, q: 1.2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) => thump(b, sr, { f0: 115, f1: 80, tau: 0.03, attack: 0.006 }));
  if (brk) layer(out, 0.3, (b) => squelch(b, sr, rng, 0.01, 0.12, rng.range(380, 480), rng.range(900, 1200), 2.5));
  return out;
}

// ------------------------------------------------------------------ nether plants

/** Fungus: a small mushroomy squish — a soft rubbery pop and a light fleshy rustle. */
function fungusSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.32 : 0.22;
  const out = alloc(d, sr);
  const sd = brk ? rng.range(0.07, 0.1) : rng.range(0.05, 0.07);
  const fA = rng.range(380, 520);
  layer(out, 1, (b) => squelch(b, sr, rng, 0.003, sd, fA, fA * rng.range(1.9, 2.5), 3));
  layer(out, 0.55, (b) => bubble(b, sr, 0.004, rng.range(480, 700), 1, rng.range(0.016, 0.024), 0.8));
  const en = brk ? brkEnv(0.05, 0.2, 0.12) : (t: number) => (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.035);
  layer(out, 0.5, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 4000,
      energy: en,
      grain: 0.0009,
      heavy: 2.3,
      bands: [
        { f: 2600, q: 1.2, g: 1, spread: 0.35 },
        { f: 1400, q: 1.4, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.003, tau: 0.025, lp: 700 }));
  return out;
}

/** Crimson / warped roots: a dry fibrous rustle with a few strands snapping. */
function rootsSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.36 : 0.24;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.06, 0.25, 0.16) : stepEnv(rng, rng.range(0.05, 0.08), 0.01, 0.035);
  layer(out, 1, (b) => brush(b, sr, rng, d, en, 0.78, 7500));
  layer(out, brk ? 0.5 : 0.35, (b) => ticks(b, sr, rng, { dur: d * 0.8, rate: brk ? 120 : 80, energy: en, f: [1500, 4200], t60: [0.003, 0.009], heavy: 2.2, click: 0.45 }));
  layer(out, 0.22, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.004, tau: 0.025, lp: 500 }));
  return out;
}

/** Nether sprouts: a light, crispy tuft — brighter and shorter than roots. */
function sproutsSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.28 : 0.2;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.045, 0.2, 0.12) : stepEnv(rng, rng.range(0.04, 0.07), 0.008, 0.025);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 6000,
      energy: en,
      grain: 0.0005,
      heavy: 2.2,
      bands: [
        { f: 3300, q: 1.2, g: 1, spread: 0.35 },
        { f: 1900, q: 1.4, g: 0.65, spread: 0.3 },
        { f: 5400, q: 1.4, g: 0.22, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.4, (b) => ticks(b, sr, rng, { dur: d * 0.7, rate: 90, energy: en, f: [2300, 5200], t60: [0.002, 0.006], heavy: 2, click: 0.45 }));
  return out;
}

/** Weeping / twisting vines: a soft, fleshy vine rustle with moist squelches in it. */
function vinesSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const d = brk ? 0.42 : 0.3;
  const out = alloc(d, sr);
  const en = brk ? brkEnv(0.07, 0.3, 0.2) : stepEnv(rng, rng.range(0.06, 0.1), 0.015, 0.045);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 6000,
      energy: en,
      grain: 0.0011,
      heavy: 2.3,
      bands: [
        { f: 2000, q: 1.1, g: 1, spread: 0.35 },
        { f: 950, q: 1.3, g: 0.8, spread: 0.3 },
        { f: 3800, q: 1.3, g: 0.3, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.5, (b) => {
    const n = brk ? 2 : 1;
    for (let k = 0; k < n; k++) squelch(b, sr, rng, rng.range(0.005, d * 0.4), rng.range(0.05, 0.08), rng.range(330, 450), rng.range(800, 1100), 3);
  });
  layer(out, 0.3, (b) => {
    const n = brk ? 3 : 1 + rng.int(2);
    for (let k = 0; k < n; k++) bubble(b, sr, rng.range(0.01, d * 0.6), rng.range(420, 900), rng.range(0.5, 1), undefined, 0.6);
  });
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: 0.14, attack: 0.006, tau: 0.03, lp: 600 }));
  return out;
}

// ------------------------------------------------------------------ stems and nether wood

/** Crimson / warped stems and hyphae: a fleshy wooden knock — wood's hollow body, damped, with a soft fibrous crunch. */
function stemStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.24, sr);
  const fb = rng.range(300, 400);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 0.8, 0.04, fb * rng.range(1.8, 1.95), 0.8, 0.03, fb * rng.range(2.8, 3.05), 0.6, 0.02, fb * 4.3, 0.35, 0.014],
      jitter: 0.03,
      noise: 1.2,
      noiseTau: 0.003,
      noiseBp: [1700, 0.8],
    }),
  );
  layer(out, 0.28, (b) => thump(b, sr, { f0: 150, f1: 105, glide: 0.02, tau: 0.02 }));
  const t2 = rng.range(0.04, 0.07);
  layer(out, rng.range(0.28, 0.42), (b) =>
    impact(b, sr, rng, { t: t2, modes: [fb * rng.range(1.05, 1.25), 0.8, 0.03, fb * 2.1, 0.6, 0.022], noise: 0.9, noiseTau: 0.0025, noiseBp: [1800, 0.9] }),
  );
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, {
      dur: 0.14,
      rate: 2200,
      energy: stepEnv(rng, t2),
      grain: 0.0012,
      heavy: 2.4,
      bands: [
        { f: 1600, q: 2, g: 1, spread: 0.35 },
        { f: 3000, q: 1.8, g: 0.4, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.003, tau: 0.02, lp: 900 }));
  return out;
}

function stemBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.48, sr);
  const fb = rng.range(190, 260);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 1, 0.08, fb * rng.range(2.05, 2.25), 0.7, 0.055, fb * rng.range(3.3, 3.6), 0.45, 0.035, fb * 5.1, 0.25, 0.022],
      jitter: 0.02,
      noise: 1,
      noiseTau: 0.004,
      noiseBp: [1300, 0.7],
    }),
  );
  layer(out, 0.65, (b) =>
    phisem(b, sr, rng, {
      t: 0.003,
      dur: 0.4,
      rate: 1400,
      energy: brkEnv(0.09),
      grain: 0.0018,
      heavy: 2.8,
      bands: [
        { f: 1200, q: 3, g: 1, spread: 0.45 },
        { f: 2500, q: 2.5, g: 0.55, spread: 0.35 },
        { f: 600, q: 2.5, g: 0.45, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.3, rate: 35, energy: (t) => Math.exp(-t / 0.1), f: [500, 1800], t60: [0.015, 0.04], ratios: [1, 2.3, 3.9], weights: [1, 0.5, 0.25], click: 0.2 }),
  );
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.004, tau: 0.04, lp: 800 }));
  return out;
}

/** Crimson / warped planks and wooden things: the plank knock, drier and more muffled than overworld wood. */
function netherWoodStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.22, sr);
  const fb = rng.range(360, 470);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 0.8, 0.05, fb * rng.range(1.75, 2), 0.8, 0.036, fb * rng.range(2.8, 3.2), 0.6, 0.025, fb * rng.range(4.2, 4.7), 0.35, 0.017],
      jitter: 0.02,
      noise: 1,
      noiseTau: 0.0022,
      noiseBp: [1800, 0.9],
    }),
  );
  layer(out, 0.25, (b) => thump(b, sr, { f0: 175, f1: 120, glide: 0.02, tau: 0.018 }));
  const t2 = rng.range(0.04, 0.07);
  layer(out, rng.range(0.28, 0.42), (b) =>
    impact(b, sr, rng, { t: t2, modes: [fb * rng.range(1.05, 1.3), 0.8, 0.035, fb * 2.2, 0.7, 0.025, fb * 3.4, 0.4, 0.016], noise: 0.7, noiseTau: 0.002, noiseBp: [2000, 0.9] }),
  );
  layer(out, 0.08, (b) => phisem(b, sr, rng, { dur: 0.08, rate: 1500, energy: (t) => Math.exp(-t / 0.025), grain: 0.001, bands: [{ f: 1800, q: 3, g: 1, spread: 0.3 }] }));
  return out;
}

function netherWoodBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.46, sr);
  const fb = rng.range(210, 300);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 1, 0.1, fb * rng.range(2.1, 2.4), 0.7, 0.068, fb * rng.range(3.5, 3.9), 0.45, 0.045, fb * rng.range(5.2, 5.9), 0.28, 0.03],
      jitter: 0.02,
      noise: 0.9,
      noiseTau: 0.004,
      noiseBp: [1200, 0.7],
    }),
  );
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.003,
      dur: 0.32,
      rate: 900,
      energy: brkEnv(0.075),
      grain: 0.002,
      heavy: 3,
      bands: [
        { f: 1150, q: 4, g: 1, spread: 0.5 },
        { f: 2400, q: 3, g: 0.5, spread: 0.4 },
        { f: 560, q: 3, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.28, rate: 38, energy: (t) => Math.exp(-t / 0.09), f: [450, 1700], t60: [0.02, 0.05], ratios: [1, 2.3, 3.9], weights: [1, 0.5, 0.25], click: 0.2 }),
  );
  return out;
}

// ------------------------------------------------------------------ dense rock and metal

/** Ancient debris: a heavy, dense thud of metal-bearing rock with a dull ring inside it. */
function debrisStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(560, 760);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.04, f * 1.47, 0.6, 0.03, f * 2.2, 0.4, 0.022, f * 3.1, 0.2, 0.015],
      jitter: 0.03,
      noise: 1.2,
      noiseTau: 0.003,
      noiseBp: [1800, 0.7],
    }),
  );
  layer(out, 0.38, (b) => thump(b, sr, { f0: rng.range(125, 145), f1: 80, glide: 0.02, tau: 0.02 }));
  const g = rng.range(780, 980);
  layer(out, 0.42, (b) => impact(b, sr, rng, { modes: [g, 1, 0.09, g * 2.32, 0.6, 0.06, g * 4.25, 0.35, 0.04, g * 6.63, 0.2, 0.025], jitter: 0.01 }));
  const t2 = rng.range(0.04, 0.07);
  layer(out, 0.3, (b) => phisem(b, sr, rng, { dur: 0.14, rate: 2500, energy: stepEnv(rng, t2), grain: 0.0009, heavy: 2.6, bands: [{ f: 1800, q: 1.6, g: 1, spread: 0.4 }, { f: 3600, q: 1.5, g: 0.4, spread: 0.3 }] }));
  layer(out, rng.range(0.3, 0.45), (b) => impact(b, sr, rng, { t: t2, modes: [f * rng.range(0.9, 1.1), 1, 0.03, f * 1.47, 0.5, 0.022], noise: 0.8, noiseTau: 0.0025, noiseBp: [1800, 0.8] }));
  return out;
}

function debrisBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.65, sr);
  const f = rng.range(420, 560);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.045, f * 1.47, 0.65, 0.035, f * 2.2, 0.45, 0.025, f * 3.1, 0.3, 0.016, f * 4.3, 0.15, 0.01],
      jitter: 0.03,
      noise: 1.6,
      noiseTau: 0.005,
      noiseBp: [1500, 0.6],
    }),
  );
  layer(out, 0.5, (b) => thump(b, sr, { f0: 115, f1: 62, glide: 0.025, tau: 0.035 }));
  const g = rng.range(600, 760);
  layer(out, 0.42, (b) => impact(b, sr, rng, { modes: [g, 1, 0.22, g * 2.32, 0.6, 0.15, g * 4.25, 0.35, 0.1, g * 6.63, 0.2, 0.06], jitter: 0.01 }));
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.5,
      rate: 2200,
      energy: brkEnv(0.12),
      grain: 0.0014,
      heavy: 3,
      bands: [
        { f: 1500, q: 2, g: 1, spread: 0.4 },
        { f: 700, q: 2.2, g: 0.7, spread: 0.3 },
        { f: 3200, q: 1.8, g: 0.35, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.4, rate: 60, energy: (t) => Math.exp(-t / 0.12), f: [700, 2600], t60: [0.01, 0.035], ratios: [1, 2.32, 4.25], weights: [1, 0.5, 0.25], click: 0.3 }),
  );
  return out;
}

/** Netherite block: heavy, dense metal — lower and far more damped than iron, with a solid thud. */
function netheriteStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.34, sr);
  const f = rng.range(620, 820);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.14, f * 2.32, 0.7, 0.1, f * 4.25, 0.45, 0.065, f * 6.63, 0.25, 0.04],
      jitter: 0.01,
      noise: 1.2,
      noiseTau: 0.0025,
      noiseBp: [2600, 0.8],
    }),
  );
  layer(out, 0.4, (b) => thump(b, sr, { f0: 140, f1: 90, glide: 0.02, tau: 0.02 }));
  const t2 = rng.range(0.04, 0.07);
  layer(out, 0.35, (b) => impact(b, sr, rng, { t: t2, modes: [f * rng.range(1, 1.12), 1, 0.07, f * 2.4, 0.5, 0.05, f * 4.3, 0.3, 0.03], noise: 0.6, noiseTau: 0.002, noiseBp: [2600, 0.8] }));
  return out;
}

function netheriteBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  const f = rng.range(380, 500);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.28, f * 2.32, 0.75, 0.2, f * 4.25, 0.5, 0.13, f * 6.63, 0.3, 0.08, f * 1.51, 0.35, 0.1],
      jitter: 0.015,
      noise: 1.5,
      noiseTau: 0.004,
      noiseBp: [2200, 0.7],
    }),
  );
  layer(out, 0.55, (b) => thump(b, sr, { f0: 125, f1: 68, glide: 0.025, tau: 0.035 }));
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.3,
      rate: 1500,
      energy: brkEnv(0.07),
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 2400, q: 2.5, g: 1, spread: 0.4 },
        { f: 4800, q: 2, g: 0.45, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** a stone knock (shared by lodestone and gilded blackstone): `deep` < 1 lowers and darkens it */
function stoneKnock(b: Float32Array, sr: number, rng: Rng, t: number, deep: number, ring: number): void {
  const f = rng.range(1300, 1900) * deep;
  impact(b, sr, rng, {
    t,
    modes: [f, 1, 0.012 * ring, f * rng.range(1.38, 1.55), 0.6, 0.009 * ring, f * rng.range(2.05, 2.4), 0.35, 0.006 * ring, f * 0.5, 0.45, 0.018 * ring],
    jitter: 0.03,
    noise: 1.3,
    noiseTau: 0.0035,
    noiseBp: [2800 * deep, 0.7],
  });
}

/** Lodestone: a dense stone block with a dull metallic ring from its netherite core. */
function lodestoneStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) => stoneKnock(b, sr, rng, 0, 0.8, 1.2));
  const g = rng.range(850, 1050);
  layer(out, 0.4, (b) => impact(b, sr, rng, { modes: [g, 1, 0.09, g * 2.32, 0.55, 0.06, g * 4.25, 0.3, 0.035], jitter: 0.01 }));
  layer(out, 0.24, (b) => thump(b, sr, { f0: 155, f1: 100, tau: 0.018 }));
  layer(out, rng.range(0.3, 0.45), (b) => stoneKnock(b, sr, rng, rng.range(0.04, 0.07), 0.82, 0.9));
  return out;
}

function lodestoneBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => stoneKnock(b, sr, rng, 0, 0.68, 2.6));
  const g = rng.range(620, 780);
  layer(out, 0.5, (b) => impact(b, sr, rng, { modes: [g, 1, 0.22, g * 2.32, 0.55, 0.15, g * 4.25, 0.3, 0.09, g * 6.63, 0.15, 0.05], jitter: 0.01 }));
  layer(out, 0.32, (b) => thump(b, sr, { f0: 175, f1: 100, glide: 0.02, tau: 0.026 }));
  layer(out, 0.65, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.45,
      rate: 1800,
      energy: brkEnv(0.1),
      grain: 0.0014,
      heavy: 3,
      bands: [
        { f: 1500, q: 2.2, g: 1, spread: 0.45 },
        { f: 650, q: 2.5, g: 0.7, spread: 0.3 },
        { f: 3200, q: 1.8, g: 0.35, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** Gilded blackstone: blackstone's stone knock with a sprinkle of gold flecks ringing. */
function gildedStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.26, sr);
  const t2 = rng.range(0.035, 0.07);
  layer(out, 1, (b) => stoneKnock(b, sr, rng, 0, 0.9, 1));
  layer(out, 0.3, (b) => grit(b, sr, rng, 0.12, 3000, stepEnv(rng, t2), 1, 0.0006));
  layer(out, rng.range(0.3, 0.45), (b) => stoneKnock(b, sr, rng, t2, 0.92, 0.8));
  layer(out, 0.24, (b) => goldTinkle(b, sr, rng, 0.003, 0.09, 45, (t) => Math.exp(-t / 0.035)));
  return out;
}

function gildedBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  layer(out, 1, (b) => stoneKnock(b, sr, rng, 0, 0.72, 2.4));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 220, f1: 125, glide: 0.02, tau: 0.02 }));
  layer(out, 0.7, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.42,
      rate: 1800,
      energy: brkEnv(0.09),
      grain: 0.0014,
      heavy: 3,
      bands: [
        { f: 2000, q: 2.2, g: 1, spread: 0.45 },
        { f: 900, q: 2.5, g: 0.7, spread: 0.3 },
        { f: 4400, q: 1.8, g: 0.35, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.5, (b) => goldTinkle(b, sr, rng, 0.006, 0.36, 75, (t) => Math.exp(-t / 0.11)));
  return out;
}

// ------------------------------------------------------------------ nether bricks, bone

/** Nether bricks: a crisp, dense, clay-like "tonk" — drier and higher than stone, hardly any grit. */
function brickStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.2, sr);
  const f = rng.range(1150, 1500);
  const hb = rng.range(420, 520);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.018, f * 1.47, 0.65, 0.013, f * 2.18, 0.4, 0.009, f * 3.05, 0.2, 0.006, hb, 0.6, 0.028],
      jitter: 0.025,
      noise: 0.9,
      noiseTau: 0.0016,
      noiseBp: [3400, 0.8],
    }),
  );
  const t2 = rng.range(0.035, 0.065);
  layer(out, rng.range(0.3, 0.5), (b) =>
    impact(b, sr, rng, { t: t2, modes: [f * rng.range(0.92, 1.12), 1, 0.014, f * 1.47, 0.55, 0.01, hb * 1.08, 0.5, 0.022], noise: 0.7, noiseTau: 0.0014, noiseBp: [3400, 0.8] }),
  );
  return out;
}

function brickBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const f = rng.range(900, 1200);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.04, f * 1.47, 0.65, 0.03, f * 2.18, 0.45, 0.02, f * 3.05, 0.28, 0.013, f * 0.45, 0.5, 0.045],
      jitter: 0.025,
      noise: 1.4,
      noiseTau: 0.004,
      noiseBp: [2600, 0.7],
    }),
  );
  layer(out, 0.3, (b) => thump(b, sr, { f0: 210, f1: 125, glide: 0.02, tau: 0.022 }));
  layer(out, 0.6, (b) =>
    ticks(b, sr, rng, {
      t: 0.008,
      dur: 0.34,
      rate: 65,
      energy: (t) => Math.exp(-t / 0.09),
      f: [1000, 3600],
      t60: [0.012, 0.04],
      ratios: [1, 1.47, 2.18],
      weights: [1, 0.55, 0.3],
      heavy: 1.8,
      click: 0.35,
    }),
  );
  layer(out, 0.4, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.3,
      rate: 1400,
      energy: brkEnv(0.07),
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 2200, q: 2.4, g: 1, spread: 0.4 },
        { f: 1000, q: 2.4, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** Bone block: dry, hollow bone clacks — two or three quick knocks with a hollow body. */
function boneStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.24, sr);
  const n = 2 + rng.int(2);
  const f = rng.range(1300, 1900);
  const hb = rng.range(650, 850);
  layer(out, 1, (b) => {
    let t = 0;
    for (let k = 0; k < n; k++) {
      impact(b, sr, rng, {
        t,
        modes: [f * rng.range(0.9, 1.12), 1 - 0.25 * k, 0.018, f * 2.7, 0.45, 0.011, f * 5.1, 0.2, 0.007, hb, 0.55, 0.03],
        noise: 0.7,
        noiseTau: 0.0012,
        noiseBp: [3200, 1],
      });
      t += rng.range(0.012, 0.035);
    }
  });
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.001, tau: 0.018, bp: [hb, 3] }));
  layer(out, 0.25, (b) => thump(b, sr, { f0: 160, f1: 110, tau: 0.018 }));
  return out;
}

function boneBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const f = rng.range(900, 1300);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.035, f * 2.7, 0.5, 0.02, f * 5.1, 0.25, 0.012, f * 0.55, 0.6, 0.045],
      jitter: 0.03,
      noise: 1.1,
      noiseTau: 0.003,
      noiseBp: [2600, 0.8],
    }),
  );
  layer(out, 0.75, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.45, rate: 85, energy: (t) => Math.exp(-t / 0.12), f: [800, 3000], t60: [0.008, 0.03], ratios: [1, 2.7, 5.1], weights: [1, 0.5, 0.3], heavy: 1.6, click: 0.5 }),
  );
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.0015, tau: 0.03, bp: [rng.range(620, 780), 2.5] }));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 170, f1: 110, tau: 0.025 }));
  return out;
}

// ------------------------------------------------------------------ nether wart (the crop)

/** Nether wart crop broken / planted: a soft, fleshy pluck (vanilla SoundType.NETHER_WART). */
function wartCrop(c: Ctx, plant: boolean): Float32Array {
  const { sr, rng } = c;
  const d = plant ? 0.3 : 0.36;
  const out = alloc(d, sr);
  const fA = rng.range(300, 420);
  layer(out, 1, (b) => squelch(b, sr, rng, 0.004, rng.range(0.06, 0.09), fA, fA * rng.range(2, 2.8), 3));
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 5000,
      energy: brkEnv(0.05, 0.2, 0.12),
      grain: 0.0009,
      heavy: 2.3,
      bands: [
        { f: 2400, q: 1.2, g: 1, spread: 0.35 },
        { f: 1200, q: 1.4, g: 0.7, spread: 0.3 },
      ],
    }),
  );
  layer(out, plant ? 0.5 : 0.35, (b) => burst(b, sr, rng, { dur: 0.14, attack: 0.004, tau: 0.03, lp: 600 }));
  return out;
}

// ------------------------------------------------------------------ registry

export function netherBlockSounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  const set = (mat: string, brk: SoundGen, step: SoundGen, place: SoundGen = brk) => {
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.place`] = place;
    S[`block.${mat}.hit`] = pitched(step, 0.5);
    S[`block.${mat}.fall`] = pitched(step, 0.75);
  };
  const mk = (mat: string, brk: (c: Ctx) => Float32Array, step: (c: Ctx) => Float32Array, nb = 5, ns = 6) =>
    set(mat, sound(`block.${mat}.break`, nb, brk), sound(`block.${mat}.step`, ns, step));

  mk('netherrack', (c) => rackBreak(c), (c) => rackStep(c), 6);
  mk('nether_ore', netherOreBreak, netherOreStep, 4, 5);
  mk('nether_gold_ore', goldOreBreak, goldOreStep, 4, 5);
  mk('nylium', (c) => nyliumSound(c, true), (c) => nyliumSound(c, false), 6);
  mk('soul_sand', (c) => soulSand(c, true), (c) => soulSand(c, false), 6, 5);
  mk('soul_soil', (c) => soulSoil(c, true), (c) => soulSoil(c, false), 6, 5);
  mk('basalt', basaltBreak, basaltStep, 5, 6);
  mk('wart_block', (c) => wartSound(c, true), (c) => wartSound(c, false), 6, 5);
  mk('ancient_debris', debrisBreak, debrisStep, 4, 5);
  mk('nether_bricks', brickBreak, brickStep, 6, 6);
  mk('bone_block', boneBreak, boneStep, 5, 5);
  mk('shroomlight', (c) => shroomlightSound(c, true), (c) => shroomlightSound(c, false), 5, 6);
  mk('fungus', (c) => fungusSound(c, true), (c) => fungusSound(c, false), 6, 5);
  mk('roots', (c) => rootsSound(c, true), (c) => rootsSound(c, false), 6, 5);
  mk('nether_sprouts', (c) => sproutsSound(c, true), (c) => sproutsSound(c, false), 4, 5);
  mk('weeping_vines', (c) => vinesSound(c, true), (c) => vinesSound(c, false), 5, 5);
  mk('stem', stemBreak, stemStep, 6, 6);
  mk('nether_wood', netherWoodBreak, netherWoodStep, 4, 6);
  mk('netherite_block', netheriteBreak, netheriteStep, 6, 6);
  mk('lodestone', lodestoneBreak, lodestoneStep, 4, 5);
  mk('gilded_blackstone', gildedBreak, gildedStep, 5, 6);
  // the nether wart crop (vanilla SoundType.NETHER_WART: its own break and plant sounds, stone steps)
  S['block.nether_wart.break'] = sound('block.nether_wart.break', 6, (c) => wartCrop(c, false));
  S['item.nether_wart.plant'] = sound('item.nether_wart.plant', 6, (c) => wartCrop(c, true));
  return S;
}
