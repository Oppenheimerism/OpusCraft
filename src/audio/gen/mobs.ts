// Mob vocalisations (formant synthesis) and mob foley (steps, rattles, hisses).

import type { SoundGen } from '../synth';
import {
  type Rng,
  TAU,
  addOsc,
  alloc,
  envAD,
  envBump,
  highpass,
  layer,
  lowpass,
  mixInto,
  resample,
  reverb,
  reverse,
  sinCyc,
  smooth,
  upsample2,
  white,
} from './dsp';
import { bowShoot } from './player';
import { type Ctx, sound } from './registry';
import { bubble, burst, fireCrackles, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import { type Formant, voice, vowelGlide } from './voice';

// ------------------------------------------------------------------ shared foley

/** Hoof / foot landing on grass: a small thump plus a leafy rustle. */
function hoofStep(c: Ctx, weight: number, len = 0.28): Float32Array {
  const { sr, rng } = c;
  const out = alloc(len, sr);
  const f = rng.range(140, 200) / (0.6 + 0.4 * weight);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.05 + 0.03 * weight, f * 2.3, 0.5, 0.035, f * 4.1, 0.25, 0.02],
      jitter: 0.05,
      noise: 0.6,
      noiseTau: 0.003,
      noiseBp: [1400, 0.8],
    }),
  );
  layer(out, 0.4 + 0.3 * weight, (b) => thump(b, sr, { f0: 120 - 30 * weight, f1: 70, tau: 0.02 + 0.02 * weight }));
  const en = twoBump(0.006, 0.03, rng.range(0.04, 0.07), 0.5, 0.01, 0.04);
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      dur: len * 0.8,
      rate: 7000,
      energy: en,
      grain: 0.0008,
      heavy: 2.3,
      bands: [
        { f: 3800, q: 1, g: 1, spread: 0.35 },
        { f: 2000, q: 1.3, g: 0.7, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ pig

function oinkInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: number): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f0 * (1 + 0.22 * Math.sin((Math.PI * t) / d)) * (1 - (0.12 * t) / d),
    amp: (t) => envBump(t, d * 0.22, d * 0.78),
    formants: [
      { f: 270, bw: 80, g: 0.75 },
      { f: (t) => 470 + 260 * Math.sin((Math.PI * t) / d), bw: 120, g: 1 },
      { f: (t) => 1150 + 600 * (t / d), bw: 170, g: 0.55 },
      { f: 2500, bw: 260, g: 0.2 },
    ],
    jitter: 0.06,
    shimmer: 0.2,
    rough: 0.45,
    sub: 0.08,
    breath: 0.35,
    oq: 0.5,
    growl: [45, 0.3],
  });
  sweep(b, sr, rng, { t: t0, dur: d, f: () => 1800, q: 1.5, amp: (t) => 0.05 * envBump(t, d * 0.2, d * 0.8) });
}

function pigSay(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  layer(out, 1, (b) => {
    const n = 1 + rng.int(2) + (c.v === 0 ? 1 : 0);
    let t = 0;
    for (let k = 0; k < n; k++) {
      const d = rng.range(0.12, 0.2);
      oinkInto(b, c, t, d, rng.range(115, 150) * (1 + 0.08 * k));
      t += d + rng.range(0.04, 0.09);
    }
  });
  return out;
}

function pigHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => oinkInto(b, c, 0, rng.range(0.16, 0.22), rng.range(190, 240)));
  return out;
}

function pigDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.7;
  const out = alloc(0.8, sr);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => (t < 0.25 ? 420 + 900 * t : 645 - 330 * (t - 0.25)),
    amp: (t) => envBump(t, 0.06, d - 0.06),
    formants: [
      { f: 750, bw: 140, g: 1 },
      { f: (t) => 1800 + 300 * Math.sin((Math.PI * t) / d), bw: 200, g: 0.7 },
      { f: 2900, bw: 300, g: 0.35 },
      { f: 4000, bw: 400, g: 0.15 },
    ],
    jitter: 0.03,
    shimmer: 0.15,
    rough: 0.25,
    breath: 0.2,
    vib: [12, 0.03],
    oq: 0.45,
  });
  return out;
}

// ------------------------------------------------------------------ cow

function moo(c: Ctx, hurt: boolean): Float32Array {
  const { sr, rng } = c;
  const d = hurt ? rng.range(0.42, 0.55) : rng.range(1.0, 1.4);
  const out = alloc(d + 0.1, sr);
  const base = hurt ? rng.range(140, 165) : rng.range(95, 125);
  const peakAt = hurt ? 0.15 : rng.range(0.22, 0.32);
  const f0 = (t: number): number => {
    const x = t / d;
    if (x < peakAt) return base * (0.82 + 0.33 * (x / peakAt));
    const y = (x - peakAt) / (1 - peakAt);
    return base * (1.15 - 0.35 * y * y) * (1 + 0.015 * Math.sin(TAU * 2.3 * t));
  };
  const open = hurt ? 0.05 : 0.14;
  const F1 = (t: number) => {
    const x = t / d;
    if (x < open) return 280 + 240 * (x / open);
    return 520 - 170 * Math.max(0, (x - 0.6) / 0.4);
  };
  const F2 = (t: number) => 820 + 180 * Math.sin(Math.PI * Math.min(1, t / d));
  const formants: Formant[] = [
    { f: 250, bw: 70, g: (t) => 0.35 + 0.65 * (1 - smooth(t / d / open - 0.5)) },
    { f: F1, bw: 110, g: 1 },
    { f: F2, bw: 140, g: 0.55 },
    { f: 2300, bw: 220, g: 0.18 },
    { f: 3100, bw: 300, g: 0.08 },
  ];
  voice(out, sr, rng, {
    dur: d,
    f0,
    amp: (t) => envAD(t, hurt ? 0.03 : 0.09, 1e9) * (t > d - 0.2 ? Math.max(0, (d - t) / 0.2) : 1),
    formants,
    jitter: hurt ? 0.04 : 0.02,
    shimmer: 0.07,
    rough: hurt ? 0.3 : 0.15,
    breath: (t) => 0.12 + 0.2 * (t / d),
    vib: [5, 0.01],
    oq: 0.62,
  });
  return out;
}

// ------------------------------------------------------------------ sheep

function baa(c: Ctx, hurt: boolean): Float32Array {
  const { sr, rng } = c;
  const d = hurt ? rng.range(0.4, 0.5) : rng.range(0.65, 0.9);
  const out = alloc(d + 0.08, sr);
  const base = hurt ? rng.range(290, 330) : rng.range(230, 285);
  const rate = rng.range(21, 27);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => base * (1 - (0.1 * t) / d) * (1 + 0.05 * Math.sin(TAU * rate * t)),
    amp: (t) => envBump(t, 0.04, d - 0.04) * (0.65 + 0.35 * Math.sin(TAU * rate * t + 0.7)),
    formants: [
      { f: (t) => (t < 0.04 ? 250 + 13000 * t : t > d - 0.1 ? 780 - 2800 * (t - (d - 0.1)) : 780), bw: 120, g: 1 },
      { f: 1700, bw: 180, g: 0.6 },
      { f: 2750, bw: 260, g: 0.3 },
      { f: 3800, bw: 350, g: 0.12 },
    ],
    jitter: 0.03,
    shimmer: 0.12,
    rough: 0.15,
    breath: 0.2,
    oq: 0.5,
  });
  return out;
}

function shear(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const snip = (b: Float32Array, t: number, a: number) => {
    impact(b, sr, rng, {
      t,
      modes: [rng.range(3000, 3400), a, 0.03, rng.range(4600, 5000), 0.7 * a, 0.025, rng.range(6700, 7200), 0.4 * a, 0.02],
      noise: 1.3 * a,
      noiseTau: 0.006,
      noiseBp: [5000, 1.5],
    });
  };
  layer(out, 1, (b) => {
    snip(b, 0, 1);
    snip(b, rng.range(0.1, 0.14), 0.85);
  });
  layer(out, 0.25, (b) =>
    phisem(b, sr, rng, { dur: 0.35, rate: 3000, energy: (t) => envAD(t, 0.02, 0.1), grain: 0.002, bands: [{ f: 1500, q: 1, g: 1, spread: 0.3 }] }),
  );
  return out;
}

// ------------------------------------------------------------------ chicken

function cluckInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: number, rough = 0.3): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f0 * (1 + 0.3 * Math.sin((Math.PI * t) / d)),
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: (t) => 900 + 300 * Math.sin((Math.PI * t) / d), bw: 250, g: 1 },
      { f: 2300, bw: 350, g: 0.7 },
      { f: 3600, bw: 500, g: 0.35 },
    ],
    jitter: 0.04,
    shimmer: 0.2,
    rough,
    breath: 0.25,
    oq: 0.4,
  });
}

function chickenSay(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(3);
    let t = 0;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1 && rng.chance(0.5);
      const d = last ? rng.range(0.16, 0.22) : rng.range(0.06, 0.1);
      cluckInto(b, c, t, d, last ? rng.range(650, 800) : rng.range(420, 560));
      t += d + rng.range(0.04, 0.09);
    }
  });
  return out;
}

function chickenHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.25, 0.32);
  const out = alloc(d + 0.05, sr);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => 900 + 450 * Math.sin((Math.PI * t) / d),
    amp: (t) => envBump(t, 0.02, d - 0.02),
    formants: [
      { f: 1200, bw: 300, g: 1 },
      { f: 2600, bw: 400, g: 0.8 },
      { f: 3900, bw: 500, g: 0.4 },
    ],
    jitter: 0.05,
    shimmer: 0.25,
    rough: 0.4,
    breath: 0.35,
    oq: 0.35,
  });
  return out;
}

function chickenStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.18, sr);
  layer(out, 1, (b) => {
    for (let k = 0; k < 2; k++) {
      const f = rng.range(1500, 2600);
      impact(b, sr, rng, { t: k * rng.range(0.04, 0.07), modes: [f, 1 - 0.3 * k, 0.015, f * 1.7, 0.5, 0.01], noise: 0.8, noiseTau: 0.0015, noiseBp: [3500, 1] });
    }
  });
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, { dur: 0.12, rate: 3000, energy: (t) => Math.exp(-t / 0.03), grain: 0.0006, bands: [{ f: 4500, q: 1.2, g: 1, spread: 0.3 }] }),
  );
  return out;
}

function eggPlop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.22, sr);
  layer(out, 1, (b) => addOsc(b, sr, 0, 0.2, (t) => 380 * Math.exp(-t / 0.05) + 160, (t) => envAD(t, 0.003, 0.03)));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 150, f1: 90, tau: 0.025 }));
  layer(out, 0.2, (b) => burst(b, sr, rng, { dur: 0.02, tau: 0.002, bp: [2000, 1] }));
  return out;
}

// ------------------------------------------------------------------ zombie

export function zombieVoice(c: Ctx, d: number, base: number, fall: number, o: { breath?: number; attack?: number } = {}): Float32Array {
  const { sr, rng } = c;
  const out = alloc(d + 0.1, sr);
  const wob = rng.range(1.5, 3);
  const F = vowelGlide(rng.pick(['uh', 'aw', 'o']), rng.pick(['er', 'o', 'uh']), d * 0.2, d * 0.9, 0.88);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => base * (1 + 0.15 * Math.sin(Math.PI * Math.min(1, t / (d * 0.6)))) * (1 - (fall * t) / d) * (1 + 0.05 * Math.sin(TAU * wob * t)),
    amp: (t) => envBump(t, o.attack ?? d * 0.2, d - (o.attack ?? d * 0.2)),
    formants: [
      { f: F[0], bw: 130, g: 1 },
      { f: F[1], bw: 160, g: 0.6 },
      { f: F[2], bw: 220, g: 0.25 },
      { f: F[3], bw: 300, g: 0.1 },
    ],
    jitter: 0.05,
    shimmer: 0.25,
    rough: 0.55,
    sub: 0.1,
    breath: o.breath ?? 0.35,
    growl: [rng.range(24, 32), 0.45],
    oq: 0.55,
  });
  lowpass(out, 3500, sr);
  return out;
}

export function zombieStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: 110, f1: 70, tau: 0.035 }));
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.002, tau: 0.03, lp: 1100 }));
  const sd = rng.range(0.12, 0.18);
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.02,
      dur: sd,
      rate: 5000,
      energy: (t) => envBump(t, sd * 0.3, sd * 0.7),
      grain: 0.0018,
      heavy: 2,
      bands: [
        { f: 1300, q: 1.2, g: 1, spread: 0.3 },
        { f: 2600, q: 1.5, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ skeleton

export function rattleInto(b: Float32Array, c: Ctx, t0: number, d: number, rate: number): void {
  ticks(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    rate,
    energy: (t) => envBump(t, d * 0.2, d * 0.8),
    f: [900, 3200],
    t60: [0.006, 0.02],
    ratios: [1, 2.7, 5.1],
    weights: [1, 0.5, 0.3],
    heavy: 1.5,
    click: 0.6,
  });
}

function skeletonSay(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    let t = 0;
    for (let k = 0; k < n; k++) {
      const d = rng.range(0.1, 0.2);
      rattleInto(b, c, t, d, rng.range(60, 120));
      t += d + rng.range(0.03, 0.1);
    }
  });
  return out;
}

export function skeletonHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => {
    const f = rng.range(1100, 1600);
    impact(b, sr, rng, { modes: [f, 1, 0.03, f * 2.7, 0.5, 0.02, f * 5.1, 0.3, 0.012, f * 0.5, 0.5, 0.04], noise: 1, noiseTau: 0.002, noiseBp: [3000, 0.8] });
  });
  layer(out, 0.7, (b) => rattleInto(b, c, 0.02, rng.range(0.2, 0.3), rng.range(90, 140)));
  return out;
}

export function skeletonDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.2, sr);
  layer(out, 1, (b) =>
    ticks(b, sr, rng, {
      dur: 1.0,
      rate: 70,
      energy: (t) => Math.exp(-t / 0.35),
      f: [700, 3000],
      t60: [0.008, 0.03],
      ratios: [1, 2.7, 5.1],
      weights: [1, 0.5, 0.3],
      heavy: 1.8,
      click: 0.5,
    }),
  );
  layer(out, 0.6, (b) => {
    for (let k = 0; k < 4; k++) {
      const t = rng.range(0.05, 0.8);
      const f = rng.range(400, 800);
      impact(b, sr, rng, { t, modes: [f, 1, 0.05, f * 2.4, 0.4, 0.03], noise: 0.4, noiseTau: 0.002 });
    }
  });
  return out;
}

export function skeletonStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.25, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    for (let k = 0; k < n; k++) {
      const f = rng.range(1000, 2200);
      impact(b, sr, rng, {
        t: k * rng.range(0.02, 0.05),
        modes: [f, 1 - 0.25 * k, 0.02, f * 2.7, 0.4, 0.012, f * 5.1, 0.2, 0.008],
        noise: 0.6,
        noiseTau: 0.0015,
        noiseBp: [3000, 1],
      });
    }
  });
  layer(out, 0.4, (b) => thump(b, sr, { f0: 150, f1: 100, tau: 0.02 }));
  return out;
}

// ------------------------------------------------------------------ creeper

function fuse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 1.6;
  const out = alloc(d, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 9000,
      energy: (t) => Math.min(1, t / 0.04) * (0.8 + 0.2 * (t / d)) * (t > d - 0.15 ? (d - t) / 0.15 : 1),
      grain: 0.0003,
      heavy: 1.6,
      dry: 0.4,
      bands: [
        { f: 5500, q: 1, g: 1, spread: 0.2 },
        { f: 9000, q: 1.5, g: 0.6, spread: 0.15 },
        { f: 3200, q: 2, g: 0.3, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.35, (b) => {
    const w = white(b.length, rng);
    highpass(w, 3000, sr);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      b[i] = w[i] * Math.min(1, t / 0.05) * (t > d - 0.15 ? (d - t) / 0.15 : 1);
    }
  });
  return out;
}

/** Lit TNT: sparkly fizzing fuse with a soft attack, fluttering hiss and bright sparks. */
function tntFuse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.75, 1.9);
  const out = alloc(d, sr);
  const att = rng.range(0.12, 0.18);
  const fl1 = rng.range(7, 11);
  const fl2 = rng.range(13, 19);
  const p1 = rng.next();
  const p2 = rng.next();
  const env = ctlTable(d, (t) =>
    smooth(t / att) * (t > d - 0.2 ? Math.max(0, (d - t) / 0.2) : 1) * (0.85 + 0.1 * sinCyc(fl1 * t + p1) + 0.05 * sinCyc(fl2 * t + p2)),
  );
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 10000,
      energy: env,
      grain: 0.00028,
      heavy: 1.5,
      dry: 0.45,
      bands: [
        { f: 6000, q: 1, g: 1, spread: 0.25 },
        { f: 9500, q: 1.4, g: 0.6, spread: 0.15 },
        { f: 3500, q: 1.8, g: 0.35, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.4, (b) => {
    const w = white(b.length, rng);
    highpass(w, 2800, sr);
    for (let i = 0; i < b.length; i++) b[i] = w[i] * env(i / sr);
  });
  layer(out, 0.3, (b) =>
    ticks(b, sr, rng, {
      t: att * 0.5,
      dur: d - att,
      rate: 45,
      energy: () => 1,
      f: [3500, 8500],
      t60: [0.002, 0.007],
      ratios: [1, 1.6],
      weights: [1, 0.4],
      click: 0.9,
    }),
  );
  layer(out, 0.12, (b) => sweep(b, sr, rng, { dur: d, f: () => 1400, q: 0.8, amp: env }));
  return out;
}

function creeperHiss(c: Ctx, d: number): Float32Array {
  const { sr, rng } = c;
  const out = alloc(d, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.008)) * Math.exp(-t / (d * 0.3));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 6000,
      energy: en,
      grain: 0.0012,
      heavy: 2.6,
      bands: [
        { f: 2600, q: 1.5, g: 1, spread: 0.4 },
        { f: 1200, q: 2, g: 0.7, spread: 0.35 },
        { f: 5000, q: 1.5, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.4, (b) => sweep(b, sr, rng, { dur: d, f: () => 4500, q: 0.9, amp: (t) => en(t) }));
  return out;
}

// ------------------------------------------------------------------ spider

function spiderSay(c: Ctx, d: number, decay = false): Float32Array {
  const { sr, rng } = c;
  const out = alloc(d, sr);
  const rate = rng.range(22, 36);
  const env = decay ? (t: number) => envAD(t, 0.03, d * 0.35) : (t: number) => envBump(t, d * 0.25, d * 0.75);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => (decay ? 4200 * Math.pow(0.5, t / d) : 3400 + 600 * Math.sin(TAU * 1.5 * t)),
      q: 1.4,
      amp: (t) => env(t) * (0.55 + 0.45 * Math.max(0, Math.sin(TAU * rate * t))),
    }),
  );
  layer(out, 0.6, (b) =>
    ticks(b, sr, rng, { dur: d, rate: rate * 1.2, energy: env, f: [1500, 4000], t60: [0.003, 0.008], ratios: [1, 1.8], weights: [1, 0.4], click: 0.8 }),
  );
  layer(out, 0.4, (b) =>
    voice(b, sr, rng, {
      dur: d,
      f0: rng.range(55, 70),
      amp: env,
      formants: [
        { f: 800, bw: 200, g: 1 },
        { f: 1800, bw: 300, g: 0.5 },
      ],
      rough: 0.6,
      jitter: 0.1,
      breath: 0.5,
    }),
  );
  return out;
}

function spiderHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.4, 0.55);
  const out = alloc(d, sr);
  const rate = rng.range(26, 38);
  const env = (t: number) => envAD(t, 0.008, d * 0.35);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => 3800 - 1200 * (t / d), q: 1.3, amp: (t) => env(t) * (0.6 + 0.4 * Math.max(0, Math.sin(TAU * rate * t))) }),
  );
  layer(out, 0.6, (b) => ticks(b, sr, rng, { dur: d, rate: rate * 1.3, energy: env, f: [1500, 4000], t60: [0.003, 0.008], ratios: [1, 1.8], weights: [1, 0.4], click: 0.8 }));
  layer(out, 0.45, (b) =>
    voice(b, sr, rng, {
      dur: d,
      f0: rng.range(60, 75),
      amp: env,
      formants: [
        { f: 900, bw: 200, g: 1 },
        { f: 2000, bw: 300, g: 0.5 },
      ],
      rough: 0.6,
      jitter: 0.1,
      breath: 0.5,
    }),
  );
  return out;
}

function spiderStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.2, sr);
  layer(out, 1, (b) => {
    const n = 3 + rng.int(3);
    for (let k = 0; k < n; k++) {
      const f = rng.range(1800, 3500);
      impact(b, sr, rng, { t: rng.range(0, 0.09), modes: [f, rng.range(0.4, 1), 0.01, f * 1.9, 0.4, 0.006], noise: 0.7, noiseTau: 0.001, noiseBp: [4000, 1] });
    }
  });
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, { dur: 0.12, rate: 2500, energy: (t) => envBump(t, 0.02, 0.1), grain: 0.0008, bands: [{ f: 3000, q: 1.5, g: 1, spread: 0.3 }] }),
  );
  return out;
}

// ------------------------------------------------------------------ enderman

function ringMod(buf: Float32Array, sr: number, f: number, depth: number): void {
  for (let i = 0; i < buf.length; i++) buf[i] *= 1 - depth + depth * Math.sin((TAU * f * i) / sr);
}

function enderIdle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.8, 1.3);
  const out = alloc(d + 0.2, sr);
  const base = rng.range(95, 140);
  const g1 = rng.range(-0.35, 0.35);
  const g2 = rng.range(-0.3, 0.3);
  const vA = rng.pick(['a', 'o', 'u', 'e', 'uh']);
  const vB = rng.pick(['i', 'u', 'aw', 'er']);
  const F = vowelGlide(vA, vB, d * 0.1, d * 0.8, rng.range(0.8, 1));
  layer(out, 1, (b) => {
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => base * (1 + g1 * (t / d) + g2 * Math.sin((TAU * t) / d)) * (1 + 0.04 * Math.sin(TAU * 7 * t)),
      amp: (t) => envBump(t, d * 0.3, d * 0.7),
      formants: [
        { f: F[0], bw: 100, g: 1 },
        { f: F[1], bw: 130, g: 0.7 },
        { f: F[2], bw: 200, g: 0.3 },
      ],
      jitter: 0.03,
      rough: 0.3,
      breath: 0.25,
    });
    ringMod(b, sr, rng.range(35, 70), 0.6);
  });
  // a deeper, time-reversed ghost of the same voice
  const ghost = reverse(resample(out, 0.7));
  const o2 = new Float32Array(Math.max(out.length, ghost.length));
  o2.set(out);
  mixInto(o2, ghost, 0, 0.45);
  return o2;
}

function enderTeleport(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.75);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(1100, 1500);
  const f1 = rng.range(140, 200);
  const fr = (t: number) => f0 * Math.pow(f1 / f0, Math.min(1, t / (d * 0.8)));
  layer(out, 1, (b) =>
    addOsc(b, sr, 0, d, (t) => fr(t) * (1 + 0.06 * Math.sin(TAU * 32 * t)), (t) => envAD(t, 0.015, d * 0.35)),
  );
  layer(out, 0.5, (b) => addOsc(b, sr, 0, d, (t) => fr(t) * 2.01, (t) => envAD(t, 0.01, d * 0.2)));
  layer(out, 0.7, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fr(t) * 1.5, q: 5, amp: (t) => envAD(t, 0.01, d * 0.3) }));
  // short reversed-air swell into the zap
  const pl = 0.05;
  const pre = alloc(pl, sr);
  sweep(pre, sr, rng, { dur: pl, f: (t) => 800 + 50000 * t, q: 1.5, amp: (t) => Math.pow(t / pl, 2) });
  const o2 = new Float32Array(out.length + pre.length);
  mixInto(o2, pre, 0, 0.35 / Math.max(1e-6, maxAbs(pre)));
  mixInto(o2, out, pre.length - Math.round(0.012 * sr), 1 / Math.max(1e-6, maxAbs(out)));
  return o2;
}

/**
 * Ender pearl landing: an airy reversed swell rushing in, then a descending whoosh with a
 * faint glassy "vwoop" glide underneath.
 */
function playerTeleport(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const sw = rng.range(0.22, 0.28);
  const wd = rng.range(0.3, 0.36);
  const out = alloc(sw + wd + 0.05, sr);
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, { dur: sw, f: (t) => 500 * Math.pow(7, t / sw), q: 1.3, amp: (t) => Math.pow(t / sw, 2.5), color: 'pink' }),
  );
  const fa = rng.range(2800, 3600);
  layer(out, 1, (b) => {
    sweep(b, sr, rng, { t: sw, dur: wd, f: (t) => fa * Math.pow(400 / fa, t / wd), q: 1.2, amp: (t) => envAD(t, 0.01, wd * 0.35), color: 'pink' });
    sweep(b, sr, rng, { t: sw + 0.012, dur: wd, f: (t) => fa * 1.4 * Math.pow(400 / fa, t / wd), q: 2, amp: (t) => 0.5 * envAD(t, 0.01, wd * 0.3) });
  });
  const g0 = rng.range(850, 1000);
  layer(out, 0.25, (b) => addOsc(b, sr, sw, wd, (t) => g0 * Math.pow(0.33, t / wd) * (1 + 0.03 * Math.sin(TAU * 28 * t)), (t) => envAD(t, 0.01, wd * 0.3)));
  return out;
}

function maxAbs(b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  return m;
}

function enderHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.6);
  const out = alloc(d + 0.05, sr);
  const base = rng.range(300, 420);
  layer(out, 1, (b) => {
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => base * (1 + 0.3 * Math.sin((Math.PI * t) / d)) * (1 + 0.08 * Math.sin(TAU * 17 * t)),
      amp: (t) => envAD(t, 0.01, d * 0.4),
      formants: [
        { f: 800, bw: 150, g: 1 },
        { f: (t) => 1500 + 800 * (t / d), bw: 200, g: 0.8 },
        { f: 3000, bw: 300, g: 0.4 },
      ],
      jitter: 0.06,
      rough: 0.5,
      breath: 0.3,
      oq: 0.35,
    });
    ringMod(b, sr, rng.range(70, 110), 0.7);
  });
  return out;
}

/** Randomly reverse or stutter a few short grains in place (with soft edges): a glitchy warp. */
function glitch(b: Float32Array, sr: number, rng: Rng, d: number): void {
  const fade = Math.round(0.0015 * sr);
  const edge = (p: number) => {
    for (let i = -fade; i < fade; i++) {
      const j = p + i;
      if (j >= 0 && j < b.length) b[j] *= Math.abs(i) / fade;
    }
  };
  const n = 2 + rng.int(3);
  for (let k = 0; k < n; k++) {
    const len = Math.round(rng.range(0.035, 0.08) * sr);
    const s = Math.round(rng.range(0.05, Math.max(0.06, d - 0.1)) * sr);
    if (s + 2 * len >= b.length) continue;
    if (rng.chance(0.5)) {
      for (let i = 0; i < len >> 1; i++) {
        const a = b[s + i];
        b[s + i] = b[s + len - 1 - i];
        b[s + len - 1 - i] = a;
      }
      edge(s);
      edge(s + len);
    } else {
      for (let i = 0; i < len; i++) b[s + len + i] = b[s + i];
      edge(s + len);
      edge(s + 2 * len);
    }
  }
}

/**
 * Enderman stare (turning hostile): two detuned vocal drones rising with an accelerating
 * glide, warped by a sweeping ring modulator, swelling like reversed audio into a
 * reversed-reverb "hit", over a sub-octave drone.
 */
function enderStare(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.6, 1.85);
  const out = alloc(d + 0.25, sr);
  const f0 = rng.range(70, 85);
  const f1 = f0 * rng.range(2.6, 3.2);
  const rise = (t: number) => f0 * Math.pow(f1 / f0, Math.pow(Math.min(1, t / d), 1.6));
  // builds like reversed audio (slow swell, abrupt end) but is audible from the first moment
  const sw = ctlTable(d + 0.2, (t) => Math.min(1, t / 0.06) * (0.22 + 0.78 * Math.pow(Math.min(1, t / d), 1.8)) * (t > d ? Math.max(0, 1 - (t - d) / 0.08) : 1));
  const F = vowelGlide('u', 'a', 0, d * 0.75, 1.1);
  const dets = [1, rng.range(1.025, 1.04)];
  // the vocal drone lives below ~3 kHz: render it at half rate and upsample
  layer(out, 1, (b) => {
    const hr = sr / 2;
    const h = alloc(d + 0.25, hr);
    for (const det of dets) {
      voice(h, hr, rng, {
        dur: d + 0.08,
        f0: (t) => rise(t) * det * (1 + 0.02 * Math.sin(TAU * 5.5 * t)),
        amp: sw,
        formants: [
          { f: F[0], bw: 120, g: 1 },
          { f: F[1], bw: 150, g: 0.7 },
          { f: F[2], bw: 220, g: 0.35 },
        ],
        jitter: 0.03,
        rough: 0.35,
        sub: 0.05,
        breath: 0.3,
        oq: 0.5,
      });
    }
    let ph = 0;
    for (let i = 0; i < h.length; i++) {
      ph += (25 + 45 * Math.min(1, i / hr / d)) / hr;
      h[i] *= 0.45 + 0.55 * sinCyc(ph);
    }
    mixInto(b, upsample2(h));
  });
  layer(out, 0.55, (b) => {
    const hit = alloc(0.25, sr);
    voice(hit, sr, rng, {
      dur: 0.2,
      f0: f1 * 0.9,
      amp: (t) => envAD(t, 0.005, 0.05),
      formants: [
        { f: 800, bw: 150, g: 1 },
        { f: 1600, bw: 200, g: 0.6 },
        { f: 2800, bw: 300, g: 0.3 },
      ],
      rough: 0.4,
      breath: 0.5,
    });
    const rev = reverse(reverb(hit, sr, { t60: 1.4, hf: 0.4, wet: 1.2, dry: 0.3, tail: 1.3, pre: 0.01 }));
    mixInto(b, rev, Math.round(d * sr) - rev.length, 1);
  });
  layer(out, 0.4, (b) => addOsc(b, sr, 0, d + 0.05, (t) => rise(t) * 0.5, sw));
  return out;
}

/** Tabulate an envelope at 1 ms resolution; returns a cheap interpolating lookup. */
function ctlTable(dur: number, f: (t: number) => number): (t: number) => number {
  const n = Math.ceil(dur * 1000) + 2;
  const tab = new Float32Array(n);
  for (let i = 0; i < n; i++) tab[i] = f(i / 1000);
  return (t: number) => {
    const x = t * 1000;
    if (x <= 0) return tab[0];
    const k = x | 0;
    if (k >= n - 1) return tab[n - 1];
    return tab[k] + (tab[k + 1] - tab[k]) * (x - k);
  };
}

/** Angry enderman: shrill vocal screech with glitchy stepped pitch, ring-mod warp and stutters. */
function enderScream(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.8, 1.2);
  const out = alloc(d + 0.1, sr);
  const base = rng.range(430, 600);
  const steps: number[] = [];
  for (let t = 0; t < d; t += rng.range(0.04, 0.09)) steps.push(t, base * Math.pow(2, rng.range(-0.35, 0.6)));
  const fAt = (t: number): number => {
    let f = steps[1];
    for (let k = 0; k < steps.length && steps[k] <= t; k += 2) f = steps[k + 1];
    return f;
  };
  const F = vowelGlide(rng.pick(['ae', 'a', 'e']), rng.pick(['i', 'ih', 'ae']), 0, d, 1.25);
  const trem = rng.range(9, 13);
  layer(out, 1, (b) => {
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => fAt(t) * (1 + 0.05 * Math.sin(TAU * 23 * t)),
      amp: (t) => envAD(t, 0.02, d * 0.45) * (0.75 + 0.25 * Math.sin(TAU * trem * t)),
      formants: [
        { f: F[0], bw: 160, g: 1 },
        { f: F[1], bw: 200, g: 0.8 },
        { f: F[2], bw: 300, g: 0.45 },
      ],
      jitter: 0.08,
      rough: 0.45,
      sub: 0.06,
      breath: 0.35,
      oq: 0.32,
    });
    ringMod(b, sr, rng.range(90, 160), 0.65);
    glitch(b, sr, rng, d);
  });
  highpass(out, 250, sr);
  return out;
}

// ------------------------------------------------------------------ slime, bat, villager

/** Slime squish; p scales pitch, ts scales time (small slimes: higher and quicker). */
function slimeSquish(c: Ctx, p = 1, ts = 1): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.25, 0.35) * ts;
  const out = alloc(d + 0.1, sr);
  const fA = rng.range(250, 350) * p;
  const fB = fA * rng.range(2.5, 3.5);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fA * Math.pow(fB / fA, t / d), q: 5, amp: (t) => envBump(t, d * 0.3, d * 0.7) }));
  const fb = rng.range(160, 210) * p;
  layer(out, 0.8, (b) =>
    addOsc(b, sr, 0, d, (t) => fb * (1 + 0.8 * (t / d)) * (1 + 0.08 * Math.sin((TAU * 25 * t) / ts)), (t) => envAD(t, 0.01, 0.07 * ts)),
  );
  layer(out, 0.4, (b) => {
    for (let k = 0; k < 3; k++) bubble(b, sr, rng.range(0.02, d), rng.range(400, 1200) * p, rng.range(0.4, 1), undefined, 0.6);
  });
  layer(out, 0.4 * (p > 1 ? 0.5 : 1), (b) => thump(b, sr, { f0: 110 * p, f1: 70 * p, tau: 0.03 * ts }));
  return out;
}

/** Slime jump: a quick springy "boing" squelch. */
function slimeJump(c: Ctx, p: number, ts: number): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.18, 0.26) * ts;
  const out = alloc(d + 0.12, sr);
  const f0 = rng.range(120, 160) * p;
  layer(out, 1, (b) =>
    addOsc(
      b,
      sr,
      0,
      d,
      (t) => f0 * (1 + 1.6 * (1 - Math.exp(-t / (0.05 * ts)))) * (1 + 0.1 * Math.sin((TAU * 30 * t) / ts)),
      (t) => envAD(t, 0.006, d * 0.35),
    ),
  );
  const fA = rng.range(300, 420) * p;
  layer(out, 0.75, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fA * Math.pow(3.2, t / d), q: 5, amp: (t) => envBump(t, d * 0.15, d * 0.85) }));
  layer(out, 0.4, (b) => {
    for (let k = 0; k < 2; k++) bubble(b, sr, rng.range(0.01, d * 0.7), rng.range(500, 1300) * p, rng.range(0.5, 1), undefined, 0.8);
  });
  layer(out, p > 1 ? 0.2 : 0.45, (b) => thump(b, sr, { f0: 120 * p, f1: 80 * p, tau: 0.025 * ts }));
  return out;
}

/** Slime hurt: a sharp wet onset and a downward squelch. */
function slimeHurt(c: Ctx, p: number, ts: number): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.22, 0.3) * ts;
  const out = alloc(d + 0.1, sr);
  const fA = rng.range(900, 1200) * p;
  const fB = fA * 0.3;
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fA * Math.pow(fB / fA, t / d), q: 4.5, amp: (t) => envAD(t, 0.004, d * 0.35) }));
  const fb = rng.range(240, 300) * p;
  layer(out, 0.7, (b) =>
    addOsc(b, sr, 0, d, (t) => fb * (1 - (0.4 * t) / d) * (1 + 0.12 * Math.sin((TAU * 34 * t) / ts)), (t) => envAD(t, 0.004, d * 0.3)),
  );
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.04 * ts, attack: 0.0005, tau: 0.008 * ts, bp: [1300 * p, 1] }));
  layer(out, 0.35, (b) => {
    for (let k = 0; k < 3; k++) bubble(b, sr, rng.range(0.02, d), rng.range(400, 1100) * p, rng.range(0.4, 1), undefined, 0.5);
  });
  return out;
}

/** Slime death: the body collapsing in a few falling squelches with bubbles escaping. */
function slimeDeath(c: Ctx, p: number, ts: number): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.65) * ts;
  const out = alloc(d + 0.15, sr);
  layer(out, 1, (b) => {
    let t = 0;
    const parts = [0.4, 0.33, 0.45];
    for (let k = 0; k < parts.length; k++) {
      const dd = d * parts[k];
      const fA = rng.range(600, 800) * p * (1 - 0.2 * k);
      sweep(b, sr, rng, { t, dur: dd, f: (x) => fA * Math.pow(0.35, x / dd), q: 4, amp: (x) => (1 - 0.25 * k) * envBump(x, dd * 0.2, dd * 0.8) });
      t += dd * rng.range(0.6, 0.8);
    }
  });
  const fb = rng.range(200, 260) * p;
  layer(out, 0.6, (b) =>
    addOsc(b, sr, 0, d, (t) => fb * (1 - (0.55 * t) / d) * (1 + 0.1 * Math.sin((TAU * 20 * t) / ts)), (t) => envAD(t, 0.01, d * 0.35)),
  );
  layer(out, 0.45, (b) => {
    for (let k = 0; k < 8; k++) bubble(b, sr, rng.range(0.05, d), rng.range(300, 1000) * p, rng.range(0.3, 1), undefined, 0.5);
  });
  layer(out, p > 1 ? 0.2 : 0.45, (b) => thump(b, sr, { f0: 100 * p, f1: 60 * p, tau: 0.05 * ts }));
  return out;
}

/**
 * Magma cube squish: the slime's splat made heavy and hot, a deeper, fuller slap of molten flesh with a hiss and a
 * few spits of lava as it lands.
 */
function magmaSquish(c: Ctx, p: number, ts: number): Float32Array {
  const { sr, rng } = c;
  const body = slimeSquish(c, p * 0.62, ts * 1.25);
  const out = alloc(body.length / sr + 0.15, sr);
  layer(out, 1, (b) => mixInto(b, body));
  layer(out, 0.5, (b) => thump(b, sr, { f0: 90 * p, f1: 55 * p, tau: 0.05 * ts }));
  layer(out, 0.22, (b) => burst(b, sr, rng, { t: 0.01, dur: 0.25 * ts, attack: 0.01, tau: 0.07 * ts, hp: 2500 }));
  layer(out, 0.2, (b) => fireCrackles(b, sr, rng, 0.02, 0.2 * ts, 30));
  return out;
}

/** Magma cube jump: a heavy, low spring off the ground, the slices smacking apart. */
function magmaJump(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const body = slimeJump(c, 0.7, 1.2);
  const out = alloc(body.length / sr + 0.1, sr);
  layer(out, 1, (b) => mixInto(b, body));
  const f = rng.range(180, 240);
  layer(out, 0.35, (b) => impact(b, sr, rng, { modes: [f, 1, 0.05, f * 2.2, 0.4, 0.03], noise: 0.6, noiseTau: 0.004, noiseBp: [900, 0.8] }));
  layer(out, 0.15, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.005, tau: 0.04, hp: 3000 }));
  return out;
}

/** Slime attack: a sharp wet slap. */
function slimeAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.14, 0.2);
  const out = alloc(d + 0.08, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: d, attack: 0.0004, tau: 0.018, bp: [rng.range(1000, 1400), 0.8] }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.03, attack: 0.0002, tau: 0.003, hp: 2500 }));
  layer(out, 0.6, (b) => thump(b, sr, { f0: rng.range(150, 180), f1: 90, tau: 0.025 }));
  const fA = rng.range(500, 700);
  layer(out, 0.45, (b) =>
    sweep(b, sr, rng, { t: 0.01, dur: d * 0.8, f: (t) => fA * Math.pow(2.5, t / (d * 0.8)), q: 5, amp: (t) => envBump(t, d * 0.15, d * 0.65) }),
  );
  return out;
}

const SMALL_P = 1.75;
const SMALL_T = 0.7;

// ------------------------------------------------------------------ squid

/** Squid voice: soft, muffled wet squishes with bubbles (heard through water). */
function squidSquish(c: Ctx, kind: 'ambient' | 'hurt' | 'death'): Float32Array {
  const { sr, rng } = c;
  const hurt = kind === 'hurt';
  const death = kind === 'death';
  const d = death ? rng.range(0.75, 0.9) : hurt ? rng.range(0.28, 0.36) : rng.range(0.4, 0.6);
  const out = alloc(d + 0.12, sr);
  const fA = death ? rng.range(700, 900) : rng.range(200, 280) * (hurt ? 1.4 : 1);
  const fB = death ? fA * rng.range(0.22, 0.3) : fA * rng.range(2.2, 3);
  const pk = hurt ? 0.2 : 0.4;
  const wob = death ? 9 : 14;
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => fA * Math.pow(fB / fA, t / d) * (1 + 0.06 * Math.sin(TAU * wob * t)),
      q: 4,
      amp: (t) => envBump(t, d * pk, d * (1 - pk)),
    }),
  );
  const fb = rng.range(140, 200) * (hurt ? 1.3 : 1);
  layer(out, 0.6, (b) =>
    addOsc(b, sr, 0.01, d * 0.6, (t) => fb * (death ? 1 - (0.4 * t) / d : 1 + (0.9 * t) / d), (t) => envAD(t, 0.015, d * 0.18)),
  );
  layer(out, 0.5, (b) => {
    const nb = death ? 14 : hurt ? 7 : 5;
    for (let k = 0; k < nb; k++) {
      const t = rng.range(0.02, d * (death ? 0.95 : 0.8));
      bubble(b, sr, t, rng.logRange(280, 900) * (hurt ? 1.3 : 1), rng.range(0.3, 1), undefined, rng.range(0.2, 0.5));
    }
  });
  if (hurt) layer(out, 0.45, (b) => burst(b, sr, rng, { dur: 0.05, attack: 0.001, tau: 0.01, bp: [900, 0.9] }));
  lowpass(out, hurt ? 2600 : 1600, sr);
  return out;
}

/** Squid squirt: a quick jet of ink — a rising band of bubbly noise. */
function squidSquirt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.4);
  const out = alloc(d + 0.1, sr);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => 450 * Math.pow(3.2, Math.min(1, t / (d * 0.35))),
      q: 1.6,
      amp: (t) => envAD(t, 0.012, d * 0.3) * (0.7 + 0.3 * Math.sin(TAU * 38 * t)),
    }),
  );
  layer(out, 0.8, (b) => {
    const nb = 22 + rng.int(12);
    for (let k = 0; k < nb; k++) {
      const t = Math.pow(rng.next(), 1.5) * d * 0.8;
      bubble(b, sr, t, rng.logRange(500, 1600), rng.range(0.3, 1) * Math.exp(-t / (d * 0.5)), undefined, rng.range(0.3, 0.7));
    }
  });
  layer(out, 0.4, (b) => thump(b, sr, { f0: 160, f1: 100, tau: 0.03 }));
  lowpass(out, 3200, sr);
  return out;
}

function batSqueak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => {
    const n = 3 + rng.int(4);
    let t = 0;
    for (let k = 0; k < n; k++) {
      const d = rng.range(0.015, 0.035);
      const fa = rng.range(5200, 7200);
      const fb = fa * rng.range(0.6, 0.8);
      addOsc(b, sr, t, d, (x) => fa * Math.pow(fb / fa, x / d), (x) => envBump(x, d * 0.2, d * 0.8));
      addOsc(b, sr, t, d, (x) => 0.5 * fa * Math.pow(fb / fa, x / d), (x) => 0.3 * envBump(x, d * 0.2, d * 0.8));
      t += d + rng.range(0.02, 0.06);
      if (t > 0.4) break;
    }
  });
  return out;
}

/** A falling squeal with a rough, fluttering edge (bat hurt / death). */
function batShriek(b: Float32Array, sr: number, t: number, d: number, fa: number, fb: number, rough: number): void {
  const am = (x: number) => envBump(x, d * 0.12, d * 0.88) * (1 - rough + rough * Math.abs(Math.sin(TAU * 95 * x)));
  const f = (x: number) => fa * Math.pow(fb / fa, x / d);
  addOsc(b, sr, t, d, f, am);
  addOsc(b, sr, t, d, (x) => 1.5 * f(x), (x) => 0.3 * am(x));
  addOsc(b, sr, t, d, (x) => 0.5 * f(x), (x) => 0.45 * am(x));
}

/** Bat hurt: two or three shrill, rough shrieks in quick succession. */
function batHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => {
    let t = 0;
    const n = 2 + rng.int(2);
    for (let k = 0; k < n && t < 0.3; k++) {
      const d = rng.range(0.05, 0.09);
      const fa = rng.range(4300, 5600);
      batShriek(b, sr, t, d, fa, fa * rng.range(0.55, 0.7), 0.35);
      t += d + rng.range(0.012, 0.035);
    }
  });
  layer(out, 0.2, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.002, tau: 0.03, bp: [5200, 1.4] }));
  return out;
}

/** Bat death: a long falling squeal that breaks up at the end. */
function batDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  layer(out, 1, (b) => {
    batShriek(b, sr, 0, 0.32, 5600, 2600, 0.45);
    batShriek(b, sr, 0.34, 0.14, 3600, 2100, 0.6);
    batShriek(b, sr, 0.5, 0.1, 2900, 1800, 0.7);
  });
  layer(out, 0.15, (b) => burst(b, sr, rng, { dur: 0.3, attack: 0.004, tau: 0.08, bp: [4200, 1.2] }));
  return out;
}

/** Bat takeoff: a burst of leathery wingbeats, fast at first and fading. */
function batTakeoff(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) => {
    let t = 0.002;
    for (let k = 0; t < 0.62; k++) {
      const a = Math.exp(-t / 0.35) * rng.range(0.7, 1);
      const d = rng.range(0.035, 0.05);
      sweep(b, sr, rng, { t, dur: d, f: (x) => 900 + 1600 * (x / d), q: 1.1, amp: (x) => a * envBump(x, d * 0.3, d * 0.7), color: 'pink' });
      burst(b, sr, rng, { t, dur: d, attack: 0.003, tau: 0.012, amp: 0.35 * a, lp: 600, color: 'brown' });
      t += rng.range(0.055, 0.075) + k * 0.004;
    }
  });
  return out;
}

function villagerHmm(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.75);
  const out = alloc(d + 0.08, sr);
  const kind = c.v % 3;
  const f0 = (t: number) => {
    const x = t / d;
    if (kind === 0) return 175 - 50 * x; // "hmm." falling
    if (kind === 1) return 140 + 70 * x * x; // "hmm?" rising
    return 150 + 35 * Math.sin(Math.PI * x) - 15 * x; // "hrmm" rise-fall
  };
  voice(out, sr, rng, {
    dur: d,
    f0,
    amp: (t) => envBump(t, 0.05, d - 0.05),
    formants: [
      { f: 280, bw: 60, g: 1 },
      { f: 1250, bw: 200, g: 0.12 },
      { f: 2300, bw: 250, g: 0.07 },
    ],
    jitter: 0.012,
    shimmer: 0.05,
    rough: 0.06,
    breath: 0.05,
    vib: [5.5, 0.012],
    oq: 0.65,
  });
  lowpass(out, 2200, sr);
  return out;
}

// ------------------------------------------------------------------ registry

export function mobSounds(): Record<string, SoundGen> {
  const spider = sound('entity.spider.ambient', 4, (c) => spiderSay(c, c.rng.range(0.55, 0.85)));
  return {
    'entity.pig.ambient': sound('entity.pig.ambient', 3, pigSay),
    'entity.pig.hurt': sound('entity.pig.hurt', 3, pigHurt),
    'entity.pig.death': sound('entity.pig.death', 1, pigDeath),
    'entity.pig.step': sound('entity.pig.step', 5, (c) => hoofStep(c, 0.5)),

    'entity.cow.ambient': sound('entity.cow.ambient', 4, (c) => moo(c, false)),
    'entity.cow.hurt': sound('entity.cow.hurt', 3, (c) => moo(c, true)),
    'entity.cow.death': sound('entity.cow.hurt', 3, (c) => moo(c, true)),
    'entity.cow.step': sound('entity.cow.step', 4, (c) => hoofStep(c, 1, 0.32)),

    'entity.sheep.ambient': sound('entity.sheep.ambient', 3, (c) => baa(c, false)),
    'entity.sheep.hurt': sound('entity.sheep.hurt', 3, (c) => baa(c, true)),
    'entity.sheep.death': sound('entity.sheep.hurt', 3, (c) => baa(c, true)),
    'entity.sheep.step': sound('entity.sheep.step', 5, (c) => hoofStep(c, 0.35, 0.24)),
    'entity.sheep.shear': sound('entity.sheep.shear', 1, shear),

    'entity.chicken.ambient': sound('entity.chicken.ambient', 3, chickenSay),
    'entity.chicken.hurt': sound('entity.chicken.hurt', 2, chickenHurt),
    'entity.chicken.death': sound('entity.chicken.hurt', 2, chickenHurt),
    'entity.chicken.step': sound('entity.chicken.step', 2, chickenStep),
    'entity.chicken.egg': sound('entity.chicken.egg', 1, eggPlop),

    'entity.zombie.ambient': sound('entity.zombie.ambient', 3, (c) => zombieVoice(c, c.rng.range(1.1, 1.5), c.rng.range(80, 95), 0.2)),
    'entity.zombie.hurt': sound('entity.zombie.hurt', 2, (c) => zombieVoice(c, c.rng.range(0.35, 0.45), c.rng.range(105, 120), 0.3, { attack: 0.02, breath: 0.45 })),
    'entity.zombie.death': sound('entity.zombie.death', 1, (c) => zombieVoice(c, 1.4, 100, 0.45, { attack: 0.05, breath: 0.5 })),
    'entity.zombie.step': sound('entity.zombie.step', 5, zombieStep),

    'entity.skeleton.ambient': sound('entity.skeleton.ambient', 3, skeletonSay),
    'entity.skeleton.hurt': sound('entity.skeleton.hurt', 4, skeletonHurt),
    'entity.skeleton.death': sound('entity.skeleton.death', 1, skeletonDeath),
    'entity.skeleton.step': sound('entity.skeleton.step', 4, skeletonStep),
    'entity.skeleton.shoot': sound('entity.arrow.shoot', 1, bowShoot),

    'entity.creeper.primed': sound('entity.creeper.primed', 1, fuse),
    'entity.tnt.primed': sound('entity.tnt.primed', 2, tntFuse),
    'entity.creeper.hurt': sound('entity.creeper.hurt', 4, (c) => creeperHiss(c, c.rng.range(0.3, 0.4))),
    'entity.creeper.death': sound('entity.creeper.death', 1, (c) => creeperHiss(c, 0.75)),

    'entity.spider.ambient': spider,
    'entity.spider.hurt': sound('entity.spider.hurt', 3, spiderHurt),
    'entity.spider.death': sound('entity.spider.death', 1, (c) => spiderSay(c, 1.0, true)),
    'entity.spider.step': sound('entity.spider.step', 4, spiderStep),

    'entity.enderman.ambient': sound('entity.enderman.ambient', 5, enderIdle),
    'entity.enderman.teleport': sound('entity.enderman.teleport', 2, enderTeleport),
    'entity.player.teleport': sound('entity.player.teleport', 2, playerTeleport),
    'entity.enderman.hurt': sound('entity.enderman.hurt', 4, enderHurt),
    'entity.enderman.death': sound('entity.enderman.hurt', 4, enderHurt),
    'entity.enderman.stare': sound('entity.enderman.stare', 2, enderStare),
    'entity.enderman.scream': sound('entity.enderman.scream', 4, enderScream),

    'entity.squid.ambient': sound('entity.squid.ambient', 5, (c) => squidSquish(c, 'ambient')),
    'entity.squid.hurt': sound('entity.squid.hurt', 4, (c) => squidSquish(c, 'hurt')),
    'entity.squid.death': sound('entity.squid.death', 3, (c) => squidSquish(c, 'death')),
    'entity.squid.squirt': sound('entity.squid.squirt', 3, squidSquirt),

    'entity.slime.squish': sound('entity.slime.squish', 4, (c) => slimeSquish(c)),
    'entity.slime.jump': sound('entity.slime.jump', 4, (c) => slimeJump(c, 1, 1)),
    'entity.slime.hurt': sound('entity.slime.hurt', 4, (c) => slimeHurt(c, 1, 1)),
    'entity.slime.death': sound('entity.slime.death', 4, (c) => slimeDeath(c, 1, 1)),
    'entity.slime.attack': sound('entity.slime.attack', 2, slimeAttack),
    'entity.slime.squish_small': sound('entity.slime.squish_small', 5, (c) => slimeSquish(c, SMALL_P, SMALL_T)),
    'entity.slime.jump_small': sound('entity.slime.jump_small', 5, (c) => slimeJump(c, SMALL_P, SMALL_T)),
    'entity.slime.hurt_small': sound('entity.slime.hurt_small', 5, (c) => slimeHurt(c, SMALL_P, SMALL_T)),
    'entity.slime.death_small': sound('entity.slime.death_small', 5, (c) => slimeDeath(c, SMALL_P, SMALL_T)),
    // vanilla magma cubes hurt and die with the slime's voice; they squish and jump with their own
    'entity.magma_cube.squish': sound('entity.magma_cube.squish', 4, (c) => magmaSquish(c, 1, 1)),
    'entity.magma_cube.squish_small': sound('entity.magma_cube.squish_small', 5, (c) => magmaSquish(c, SMALL_P, SMALL_T)),
    'entity.magma_cube.jump': sound('entity.magma_cube.jump', 4, magmaJump),
    'entity.magma_cube.hurt': sound('entity.magma_cube.hurt', 4, (c) => slimeHurt(c, 1, 1)),
    'entity.magma_cube.hurt_small': sound('entity.magma_cube.hurt_small', 5, (c) => slimeHurt(c, SMALL_P, SMALL_T)),
    'entity.magma_cube.death': sound('entity.magma_cube.death', 4, (c) => slimeDeath(c, 1, 1)),
    'entity.magma_cube.death_small': sound('entity.magma_cube.death_small', 5, (c) => slimeDeath(c, SMALL_P, SMALL_T)),
    'entity.bat.ambient': sound('entity.bat.ambient', 4, batSqueak),
    'entity.bat.hurt': sound('entity.bat.hurt', 4, batHurt),
    'entity.bat.death': sound('entity.bat.death', 1, batDeath),
    'entity.bat.takeoff': sound('entity.bat.takeoff', 1, batTakeoff),
    'entity.villager.ambient': sound('entity.villager.ambient', 3, villagerHmm),
  };
}
