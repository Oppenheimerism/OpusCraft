// World / block-entity / weather / ambience sounds.

import type { SoundGen } from '../synth';
import {
  type ReverbOpts,
  TAU,
  addMode,
  addOsc,
  alloc,
  brown,
  echo,
  envAD,
  envBump,
  highpass,
  layer,
  loopify,
  lowpass,
  mixInto,
  nsamp,
  peakEq,
  pink,
  reverb,
  reverse,
  smooth,
  SVF,
  sinCyc,
  upsample2,
  white,
} from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, fireCrackles, impact, phisem, sweep, thump, ticks } from './texture';
import { voice } from './voice';

// ------------------------------------------------------------------ helpers

/** Reverb computed at half the sample rate (cheap; fine for dark / long tails). */
export function reverbHalf(input: Float32Array, sr: number, o: ReverbOpts): Float32Array {
  const lp = input.slice();
  lowpass(lp, sr * 0.2, sr);
  lowpass(lp, sr * 0.2, sr);
  const h = new Float32Array(Math.ceil(lp.length / 2));
  for (let i = 0; i < h.length; i++) h[i] = lp[2 * i];
  const r = reverb(h, sr / 2, { ...o, dry: 0 });
  const n = r.length * 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i >> 1;
    const a = r[p];
    const b = p + 1 < r.length ? r[p + 1] : 0;
    out[i] = i & 1 ? 0.5 * (a + b) : a;
  }
  const dry = o.dry ?? 1;
  for (let i = 0; i < input.length; i++) out[i] += input[i] * dry;
  return out;
}

/** Crossfade-loop helper: renders `len + xf` seconds with fn, then folds the tail into the head. */
function looped(sr: number, len: number, xf: number, fn: (b: Float32Array) => void): Float32Array {
  const b = alloc(len + xf, sr);
  fn(b);
  return loopify(b, nsamp(xf, sr));
}

// ------------------------------------------------------------------ chests & doors

const WOOD_BODY = [
  { f: 480, q: 5, g: 1 },
  { f: 1050, q: 7, g: 0.8 },
  { f: 1900, q: 6, g: 0.5 },
  { f: 3100, q: 5, g: 0.25 },
];

function chestOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 0.5, (b) =>
    impact(b, sr, rng, {
      modes: [230, 1, 0.08, 520, 0.6, 0.06, 900, 0.35, 0.04, 1500, 0.2, 0.025],
      noise: 0.5,
      noiseTau: 0.003,
      noiseBp: [1500, 1],
    }),
  );
  const cd = rng.range(0.5, 0.65);
  const r0 = rng.range(140, 190);
  const r1 = r0 * rng.range(0.55, 0.75);
  const wob = rng.range(3, 5);
  layer(out, 1, (b) =>
    creak(b, sr, rng, {
      t: 0.04,
      dur: cd,
      rate: (t) => r0 + (r1 - r0) * smooth(t / cd) + 15 * Math.sin(TAU * wob * t),
      amp: (t) => envBump(t, cd * 0.3, cd * 0.7),
      jitter: 0.12,
      bands: WOOD_BODY,
    }),
  );
  return out;
}

function chestClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const cd = 0.12;
  layer(out, 0.35, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => 120 + (60 * t) / cd, amp: (t) => envBump(t, 0.03, 0.09), jitter: 0.12, bands: WOOD_BODY }),
  );
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t: 0.11,
      modes: [170, 1, 0.12, 390, 0.7, 0.08, 720, 0.45, 0.06, 1250, 0.3, 0.04, 2100, 0.15, 0.025],
      jitter: 0.03,
      noise: 0.8,
      noiseTau: 0.004,
      noiseBp: [1200, 0.8],
    }),
  );
  layer(out, 0.4, (b) => thump(b, sr, { t: 0.11, f0: 120, f1: 80, tau: 0.04 }));
  return out;
}

function latch(b: Float32Array, sr: number, c: Ctx, t: number, a: number): void {
  impact(b, sr, c.rng, {
    t,
    modes: [2300, a, 0.03, 3450, 0.6 * a, 0.02, 5100, 0.35 * a, 0.015, 1200, 0.3 * a, 0.03],
    noise: 0.8 * a,
    noiseTau: 0.0015,
    noiseBp: [4000, 1],
  });
}

function doorOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  layer(out, 0.7, (b) => latch(b, sr, c, 0, 1));
  const cd = rng.range(0.35, 0.5);
  const r0 = rng.range(200, 260);
  const r1 = r0 * rng.range(0.6, 0.8);
  layer(out, 1, (b) =>
    creak(b, sr, rng, {
      t: 0.05,
      dur: cd,
      rate: (t) => r0 + (r1 - r0) * smooth(t / cd),
      amp: (t) => envBump(t, cd * 0.25, cd * 0.75),
      jitter: 0.1,
      bands: WOOD_BODY,
    }),
  );
  layer(out, 0.35, (b) => impact(b, sr, rng, { t: 0.02, modes: [150, 1, 0.1, 340, 0.6, 0.07, 620, 0.3, 0.05], noise: 0.3, noiseTau: 0.003 }));
  return out;
}

function doorClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const cd = rng.range(0.1, 0.15);
  layer(out, 0.4, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => 180 + (70 * t) / cd, amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.1, bands: WOOD_BODY }),
  );
  const tt = cd * 0.9;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t: tt,
      modes: [130, 1, 0.14, 300, 0.75, 0.1, 560, 0.45, 0.07, 980, 0.3, 0.045, 1700, 0.15, 0.03],
      jitter: 0.03,
      noise: 0.9,
      noiseTau: 0.004,
      noiseBp: [1000, 0.8],
    }),
  );
  layer(out, 0.45, (b) => thump(b, sr, { t: tt, f0: 110, f1: 70, tau: 0.05 }));
  layer(out, 0.45, (b) => latch(b, sr, c, tt + 0.012, 1));
  return out;
}

/** Lighter wooden trapdoor: a short, higher creak and a flat board "flap". */
const TRAP_BODY = [
  { f: 620, q: 5, g: 1 },
  { f: 1350, q: 6, g: 0.7 },
  { f: 2450, q: 5, g: 0.35 },
];

function boardFlap(b: Float32Array, sr: number, c: Ctx, t: number, a: number): void {
  const { rng } = c;
  const f = rng.range(280, 360);
  impact(b, sr, rng, {
    t,
    modes: [f, a, 0.05, f * 1.9, 0.7 * a, 0.035, f * 3.1, 0.45 * a, 0.025, f * 4.6, 0.25 * a, 0.018],
    jitter: 0.03,
    noise: 1.4 * a,
    noiseTau: 0.005,
    noiseBp: [900, 0.6],
  });
}

function trapdoorOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const cd = rng.range(0.12, 0.18);
  const r0 = rng.range(150, 210);
  layer(out, 0.55, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => r0 * (1 - (0.3 * t) / cd), amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.15, bands: TRAP_BODY }),
  );
  layer(out, 1, (b) => boardFlap(b, sr, c, cd * 0.85, 1));
  layer(out, 0.25, (b) => thump(b, sr, { t: cd * 0.85, f0: 150, f1: 100, tau: 0.02 }));
  return out;
}

function trapdoorClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const cd = rng.range(0.05, 0.08);
  layer(out, 0.35, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => 170 + (60 * t) / cd, amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.15, bands: TRAP_BODY }),
  );
  layer(out, 1, (b) => boardFlap(b, sr, c, cd * 0.8, 1));
  layer(out, 0.35, (b) => thump(b, sr, { t: cd * 0.8, f0: 140, f1: 90, tau: 0.025 }));
  return out;
}

/** Heavy iron: high-Q metallic groan resonances and long-ringing plate clanks. */
const IRON_BODY = [
  { f: 380, q: 12, g: 1 },
  { f: 910, q: 14, g: 0.8 },
  { f: 1730, q: 12, g: 0.5 },
  { f: 2950, q: 10, g: 0.3 },
];

function ironClank(b: Float32Array, sr: number, c: Ctx, t: number, f: number, ring: number): void {
  impact(b, sr, c.rng, {
    t,
    modes: [
      f, 1, 0.45 * ring,
      f * 1.59, 0.75, 0.36 * ring,
      f * 2.32, 0.6, 0.28 * ring,
      f * 3.41, 0.4, 0.2 * ring,
      f * 4.25, 0.35, 0.14 * ring,
      f * 6.63, 0.25, 0.08 * ring,
      f * 9.1, 0.16, 0.05 * ring,
      f * 11.8, 0.1, 0.035 * ring,
    ],
    jitter: 0.015,
    noise: 1.3,
    noiseTau: 0.003,
    noiseBp: [2000, 0.7],
  });
}

function ironOpen(c: Ctx, trap: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(trap ? 0.7 : 0.95, sr);
  layer(out, trap ? 0.55 : 0.75, (b) => ironClank(b, sr, c, 0, rng.range(trap ? 300 : 220, trap ? 380 : 280), 0.6));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 100, f1: 70, tau: 0.035 }));
  const cd = trap ? rng.range(0.22, 0.3) : rng.range(0.45, 0.6);
  const r0 = rng.range(70, 100);
  layer(out, 1, (b) =>
    creak(b, sr, rng, {
      t: 0.05,
      dur: cd,
      rate: (t) => r0 * (1 - (0.35 * t) / cd) * (1 + 0.08 * Math.sin(TAU * 3 * t)),
      amp: (t) => envBump(t, cd * 0.3, cd * 0.7),
      jitter: 0.15,
      bands: IRON_BODY,
    }),
  );
  if (trap) layer(out, 0.8, (b) => ironClank(b, sr, c, 0.05 + cd * 0.9, rng.range(330, 420), 0.5));
  return out;
}

function ironClose(c: Ctx, trap: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(trap ? 0.65 : 0.85, sr);
  const cd = trap ? 0.07 : 0.12;
  layer(out, 0.35, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => 90 + (40 * t) / cd, amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.15, bands: IRON_BODY }),
  );
  const tt = cd * 0.9;
  layer(out, 1, (b) => ironClank(b, sr, c, tt, rng.range(trap ? 260 : 185, trap ? 340 : 240), trap ? 0.7 : 1));
  layer(out, 0.55, (b) => thump(b, sr, { t: tt, f0: trap ? 110 : 85, f1: 60, tau: trap ? 0.035 : 0.05 }));
  if (!trap) layer(out, 0.4, (b) => latch(b, sr, c, tt + 0.015, 1));
  return out;
}

/** Fence gate: a wooden latch clack (open: latch lift + light creak; close: post knock + latch drop). */
function gateOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const f = rng.range(1300, 1800);
  layer(out, 0.7, (b) => impact(b, sr, rng, { modes: [f, 1, 0.025, f * 2.2, 0.5, 0.015], noise: 0.8, noiseTau: 0.0015, noiseBp: [3000, 1] }));
  const cd = rng.range(0.1, 0.14);
  layer(out, 0.5, (b) =>
    creak(b, sr, rng, { t: 0.02, dur: cd, rate: (t) => 160 * (1 - (0.25 * t) / cd), amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.15, bands: TRAP_BODY }),
  );
  const g = rng.range(350, 450);
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: 0.02 + cd, modes: [g, 1, 0.05, g * 2.1, 0.5, 0.03, g * 3.4, 0.3, 0.02], noise: 0.6, noiseTau: 0.002, noiseBp: [1500, 0.8] }));
  return out;
}

function gateClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const g = rng.range(350, 450);
  layer(out, 1, (b) =>
    impact(b, sr, rng, { modes: [g, 1, 0.06, g * 2.05, 0.6, 0.04, g * 3.3, 0.4, 0.025, g * 4.8, 0.2, 0.018], jitter: 0.02, noise: 1, noiseTau: 0.003, noiseBp: [1400, 0.8] }),
  );
  const f = rng.range(900, 1300);
  const dt = rng.range(0.025, 0.045);
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: dt, modes: [f, 1, 0.03, f * 2.3, 0.5, 0.018], noise: 0.7, noiseTau: 0.0015, noiseBp: [2800, 1] }));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 150, f1: 100, tau: 0.02 }));
  return out;
}

// ------------------------------------------------------------------ fire

function furnaceCrackle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.5);
  const out = alloc(d, sr);
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0.005, d - 0.05, rng.range(12, 22), 0.25));
  layer(out, 0.18, (b) => burst(b, sr, rng, { dur: d, attack: 0.15, tau: d, lp: 350, color: 'brown', env: (t) => envBump(t, 0.2, d - 0.2) }));
  return out;
}

function fireAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 2.5;
  const X = 0.3;
  return looped(sr, L, X, (out) => {
    const n = out.length;
    layer(out, 0.55, (b) => {
      const r = brown(n, rng, 0.997);
      lowpass(r, 500, sr);
      const f1 = rng.range(1.5, 3);
      const f2 = rng.range(4, 7);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        b[i] = r[i] * (0.7 + 0.2 * Math.sin(TAU * f1 * t) + 0.1 * Math.sin(TAU * f2 * t + 1));
      }
    });
    layer(out, 1, (b) => fireCrackles(b, sr, rng, 0, L + X, 38, 0.15));
    layer(out, 0.12, (b) => {
      const w = white(n, rng);
      highpass(w, 3500, sr);
      mixInto(b, w);
    });
  });
}

function fizz(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.8,
      rate: 5000,
      energy: (t) => envAD(t, 0.005, 0.18),
      grain: 0.0006,
      heavy: 1.8,
      dry: 0.3,
      bands: [
        { f: 5000, q: 1.2, g: 1, spread: 0.3 },
        { f: 8500, q: 1.5, g: 0.6, spread: 0.2 },
        { f: 3000, q: 2, g: 0.3, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.003, tau: 0.04, lp: 800 }));
  highpass(out, 200, sr);
  return out;
}

/** Fire meeting water: a short steam hiss with a soft "pff" and a few bubbles. */
function extinguishFire(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.35, 0.45);
  const out = alloc(d, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 7000,
      energy: (t) => envAD(t, 0.004, d * 0.3),
      grain: 0.0005,
      heavy: 1.7,
      dry: 0.35,
      bands: [
        { f: 4800, q: 1.2, g: 1, spread: 0.3 },
        { f: 8000, q: 1.5, g: 0.6, spread: 0.2 },
        { f: 2600, q: 2, g: 0.3, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.002, tau: 0.025, lp: 900 }));
  layer(out, 0.25, (b) => {
    for (let k = 0; k < 5; k++) bubble(b, sr, rng.range(0, d * 0.6), rng.logRange(800, 2500), rng.range(0.3, 1), undefined, 0.4);
  });
  highpass(out, 250, sr);
  return out;
}

/** Something burning in lava / fire: a quick flare with crackles and a sizzling hiss. */
function burn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.35, 0.5);
  const out = alloc(d, sr);
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0.002, d * 0.8, rng.range(40, 60), 0.2));
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 6000,
      energy: (t) => envAD(t, 0.01, d * 0.35),
      grain: 0.0005,
      heavy: 1.8,
      dry: 0.3,
      bands: [
        { f: 5200, q: 1.2, g: 1, spread: 0.3 },
        { f: 3000, q: 1.8, g: 0.4, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.45, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => 400 + 1600 * envAD(t, 0.03, 0.08),
      q: 0.8,
      amp: (t) => envAD(t, 0.015, d * 0.3),
      mode: 'lp',
      color: 'pink',
    }),
  );
  return out;
}

// ------------------------------------------------------------------ lava & water

function lavaPop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(125, 150);
  layer(out, 1, (b) => addOsc(b, sr, 0, 0.25, (t) => f * (1 + 2.2 * (1 - Math.exp(-t / 0.03))), (t) => envAD(t, 0.004, 0.035)));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: 0.03, dur: 0.02, attack: 0.0003, tau: 0.002, bp: [1800, 1] }));
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, { t: 0.03, dur: 0.15, rate: 3000, energy: (t) => Math.exp(-t / 0.03), grain: 0.0005, bands: [{ f: 5000, q: 1.5, g: 1, spread: 0.3 }] }),
  );
  return out;
}

function lavaAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 3;
  const X = 0.4;
  return looped(sr, L, X, (out) => {
    const n = out.length;
    layer(out, 1, (b) => {
      const nb = 12 + rng.int(5);
      for (let k = 0; k < nb; k++) {
        const t = rng.next() * (L + X - 0.2);
        bubble(b, sr, t, rng.logRange(70, 240), rng.range(0.4, 1), rng.range(0.035, 0.08), rng.range(0.1, 0.3));
      }
    });
    layer(out, 0.45, (b) => {
      const r = brown(n, rng, 0.998);
      lowpass(r, 140, sr);
      const f1 = rng.range(0.4, 0.9);
      for (let i = 0; i < n; i++) b[i] = r[i] * (0.8 + 0.2 * Math.sin((TAU * f1 * i) / sr));
    });
    layer(out, 0.25, (b) => {
      for (let k = 0; k < 4; k++) {
        const t = rng.next() * (L + X - 0.1);
        burst(b, sr, rng, { t, dur: 0.02, attack: 0.0003, tau: 0.002, bp: [rng.range(1200, 2500), 1] });
      }
    });
  });
}

function waterAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 3.5;
  const X = 0.4;
  return looped(sr, L, X, (out) => {
    const n = out.length;
    layer(out, 1, (b) => {
      const nb = Math.round((L + X) * 110);
      for (let k = 0; k < nb; k++) {
        const t = rng.next() * (L + X - 0.05);
        const f = rng.logRange(350, 2400);
        bubble(b, sr, t, f, Math.pow(rng.next(), 2.2), undefined, rng.range(0.2, 0.8));
      }
    });
    layer(out, 0.4, (b) => {
      const p = pink(n, rng);
      const bp = new SVF(900, 0.7, sr);
      const f1 = rng.range(0.3, 0.7);
      for (let i = 0; i < n; i++) b[i] = bp.band(p[i]) * (0.7 + 0.3 * Math.sin((TAU * f1 * i) / sr));
    });
  });
}

// ------------------------------------------------------------------ note block

function harp(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.5, sr);
  const f = 369.994; // F#4 — the note block's pitch-1.0 note
  const amps = [1, 0.42, 0.22, 0.11, 0.07, 0.04, 0.025, 0.015];
  layer(out, 1, (b) => {
    for (let k = 1; k <= amps.length; k++) {
      const fk = f * k * Math.sqrt(1 + 0.0002 * k * k);
      addMode(b, 0, sr, fk, amps[k - 1], 1.2 / Math.pow(k, 0.8));
    }
    burst(b, sr, rng, { dur: 0.012, tau: 0.002, bp: [3000, 1], amp: 0.05 });
  });
  return out;
}

// ------------------------------------------------------------------ weather

function rain(c: Ctx, above: boolean): Float32Array {
  const { sr, rng } = c;
  const L = 5;
  const X = 0.5;
  const k = above ? 0.5 : 1; // "above" = vanilla plays the rain takes at pitch 0.5: dull and slow
  return looped(sr, L, X, (out) => {
    const n = out.length;
    // steady hiss bed with a slow swell
    layer(out, 0.55, (b) => {
      const p = pink(n, rng);
      highpass(p, 500 * k, sr);
      lowpass(p, 8000 * k, sr);
      const m1 = rng.range(0.15, 0.3) / sr;
      const m2 = rng.range(0.5, 0.9) / sr;
      for (let i0 = 0; i0 < n; i0 += 64) {
        const g = 0.85 + 0.1 * sinCyc(m1 * i0) + 0.05 * sinCyc(m2 * i0 + 0.3);
        const i1 = Math.min(n, i0 + 64);
        for (let i = i0; i < i1; i++) b[i] = p[i] * g;
      }
    });
    // individual drops: tiny noisy ticks + some tonal plinks
    layer(out, 1, (b) => {
      const count = Math.round((L + X) * 650 * k);
      for (let j = 0; j < count; j++) {
        const s = Math.floor(rng.next() * (n - 400));
        const a = Math.pow(rng.next(), 3);
        if (rng.chance(0.82)) {
          const len = Math.round((rng.range(0.0008, 0.003) * sr) / k);
          const inv = 1 / len;
          for (let i = 0; i < len; i++) {
            const e = 1 - i * inv;
            b[s + i] += a * e * e * rng.bi();
          }
        } else {
          bubble(b, sr, s / sr, rng.logRange(1800, 5000) * k, a * 0.8, rng.range(0.002, 0.006) / k, 0.4);
        }
      }
      highpass(b, 900 * k, sr);
      peakEq(b, 3200 * k, 0.8, 5, sr);
    });
    if (above) lowpass(out, 3200, sr);
  });
}

function thunder(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(5.5, 7);
  const out = alloc(d, sr);
  const n = out.length;
  // initial crack + sub-cracks (with room)
  layer(out, 1, (b) => {
    const cr = alloc(1.2, sr);
    burst(cr, sr, rng, { dur: 0.3, attack: 0.001, tau: 0.03, hp: 300 });
    const nsub = 3 + rng.int(4);
    for (let k = 0; k < nsub; k++) {
      burst(cr, sr, rng, { t: rng.range(0.015, 0.25), dur: 0.12, attack: 0.001, tau: rng.range(0.01, 0.03), hp: 400, amp: rng.range(0.4, 0.85) });
    }
    lowpass(cr, 6000, sr);
    const wet = reverbHalf(cr, sr, { t60: 2.2, hf: 0.3, size: 1.6, wet: 0.9, dry: 1, pre: 0.02, tail: 2.5 });
    mixInto(b, wet);
  });
  // rolling rumble: brown noise shaped by several random "rolls"
  layer(out, 0.95, (b) => {
    const r = brown(n, rng, 0.998);
    lowpass(r, 260, sr);
    lowpass(r, 260, sr);
    const m = pink(n, rng);
    highpass(m, 120, sr);
    lowpass(m, 700, sr);
    const rolls: number[] = [];
    const nr = 5 + rng.int(4);
    for (let k = 0; k < nr; k++) rolls.push(rng.range(0.05, d * 0.55), rng.range(0.1, 0.4), rng.range(0.5, 1.6), rng.range(0.3, 1) * (1 - k / (nr + 2)));
    const env = new Float32Array(Math.ceil(n / 64) + 1);
    for (let j = 0; j < env.length; j++) {
      const t = (j * 64) / sr;
      let e = 0;
      for (let k = 0; k < rolls.length; k += 4) {
        const u = t - rolls[k];
        if (u > 0) e += rolls[k + 3] * (u < rolls[k + 1] ? smooth(u / rolls[k + 1]) : Math.exp(-(u - rolls[k + 1]) / rolls[k + 2]));
      }
      env[j] = e * Math.min(1, t / 0.05) * Math.exp(-t / (d * 0.35));
    }
    for (let i = 0; i < n; i++) {
      const j = i >> 6;
      const f = (i & 63) / 64;
      const e = env[j] + (env[j + 1] - env[j]) * f;
      b[i] = (r[i] + 0.35 * m[i]) * e;
    }
  });
  return out;
}

// ------------------------------------------------------------------ cave ambience

const CAVE_VERB: ReverbOpts = { t60: 4, hf: 0.25, size: 2.2, wet: 1.4, dry: 0.6, pre: 0.03, tail: 3, highcut: 5000 };

function caveFinish(src: Float32Array, sr: number, o: Partial<ReverbOpts> = {}): Float32Array {
  return reverbHalf(src, sr, { ...CAVE_VERB, ...o });
}

type CaveFn = (c: Ctx) => Float32Array;

const CAVES: CaveFn[] = [
  // 0: deep drone swell with beating
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.5, 4.5);
    const b = alloc(d, sr);
    const f = rng.range(48, 60);
    const env = (t: number) => envBump(t, d * 0.45, d * 0.55);
    addOsc(b, sr, 0, d, () => f, (t) => 0.5 * env(t));
    addOsc(b, sr, 0, d, () => f * 1.5 + 0.7, (t) => 0.3 * env(t));
    addOsc(b, sr, 0, d, (t) => f * 2.02 * (1 - 0.03 * t / d), (t) => 0.18 * env(t));
    layer(b, 0.35, (x) => {
      const r = brown(x.length, rng);
      lowpass(r, 180, sr);
      for (let i = 0; i < x.length; i++) x[i] = r[i] * env(i / sr);
    });
    return caveFinish(b, sr, { tail: 2.5 });
  },
  // 1: distant wooden creak
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    const r0 = rng.range(35, 60);
    creak(b, sr, rng, {
      dur: d,
      rate: (t) => r0 * (1 + 0.6 * Math.sin((Math.PI * t) / d)),
      amp: (t) => envBump(t, d * 0.4, d * 0.6),
      jitter: 0.2,
      bands: [
        { f: 260, q: 6, g: 1 },
        { f: 610, q: 8, g: 0.7 },
        { f: 1300, q: 6, g: 0.3 },
      ],
    });
    lowpass(b, 1800, sr);
    return caveFinish(b, sr, { t60: 4.5, tail: 3.5 });
  },
  // 2: whistling wind tones
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(4, 5.5);
    const b = alloc(d, sr);
    const fa = rng.range(330, 470);
    const fb = fa * rng.range(1.45, 1.55);
    sweep(b, sr, rng, { dur: d, f: (t) => fa * (1 + 0.06 * Math.sin((TAU * t) / d)), q: 30, amp: (t) => envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    sweep(b, sr, rng, { dur: d, f: (t) => fb * (1 - 0.05 * Math.sin((TAU * t) / d)), q: 25, amp: (t) => 0.6 * envBump(t - 0.4, d * 0.4, d * 0.5), color: 'pink' });
    sweep(b, sr, rng, { dur: d, f: () => 700, q: 0.8, amp: (t) => 0.05 * envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    return caveFinish(b, sr, { t60: 3, tail: 2 });
  },
  // 3: dripping water in a cavern
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 4);
    const b = alloc(d, sr);
    const nd = 4 + rng.int(4);
    let t = rng.range(0, 0.3);
    for (let k = 0; k < nd && t < d - 0.2; k++) {
      bubble(b, sr, t, rng.logRange(1100, 2800), rng.range(0.4, 1), rng.range(0.012, 0.03), rng.range(0.6, 1.4));
      t += rng.range(0.25, 0.9);
    }
    echo(b, sr, rng.range(0.28, 0.4), 0.35, 0.4, 2500);
    return caveFinish(b, sr, { t60: 3.5, wet: 1.6, tail: 2.5, highcut: 7000 });
  },
  // 4: reversed low bell cluster
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.2, 3);
    const b = alloc(d, sr);
    const f = rng.range(90, 130);
    for (const r of [1, 1.06, 2.4, 3.1, 4.7]) addMode(b, 0, sr, f * r, 1 / r, d * 0.8 / Math.sqrt(r));
    const rev = reverse(caveFinish(b, sr, { t60: 2, tail: 0.5, wet: 1 }));
    const tail = alloc(2.5, sr);
    addMode(tail, 0, sr, f * 0.5, 0.25, 1.2);
    const o = new Float32Array(rev.length + tail.length);
    o.set(rev);
    mixInto(o, caveFinish(tail, sr, { t60: 3, tail: 1 }), rev.length - 1);
    return o;
  },
  // 5: bowed metal (inharmonic, slowly beating)
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3, 4);
    const b = alloc(d, sr);
    const f = rng.range(160, 240);
    const ratios = [1, 1.58, 2.31, 3.14, 4.07];
    ratios.forEach((r, k) => {
      const det = rng.range(-0.8, 0.8);
      addOsc(b, sr, 0, d, (t) => f * r + det * Math.sin(TAU * 0.3 * t), (t) => (0.5 / (k + 1)) * envBump(t - k * 0.15, d * 0.45, d * 0.5));
    });
    return caveFinish(b, sr, { t60: 3.5 });
  },
  // 6: slow breathing of something large
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.2, 4.2);
    const b = alloc(d, sr);
    const br = (t0: number, len: number, a: number, fs: number) =>
      voice(b, sr, rng, {
        t: t0,
        dur: len,
        f0: 60,
        voiced: 0,
        breath: 1,
        amp: (t) => a * envBump(t, len * 0.45, len * 0.55),
        formants: [
          { f: 520 * fs, bw: 160, g: 1 },
          { f: 1000 * fs, bw: 200, g: 0.7 },
          { f: 2300 * fs, bw: 300, g: 0.3 },
        ],
      });
    const l1 = rng.range(1.1, 1.5);
    br(0.05, l1, 1, 0.8);
    br(l1 + rng.range(0.2, 0.5), rng.range(1.3, 1.7), 0.8, 0.7);
    lowpass(b, 1600, sr);
    return caveFinish(b, sr, { t60: 3 });
  },
  // 7: distant booms
  (c) => {
    const { sr, rng } = c;
    const b = alloc(2, sr);
    thump(b, sr, { f0: rng.range(55, 70), f1: 35, glide: 0.1, tau: 0.25, attack: 0.01 });
    burst(b, sr, rng, { dur: 0.6, attack: 0.005, tau: 0.12, lp: 300, color: 'brown', amp: 0.8 });
    if (rng.chance(0.6)) {
      const t = rng.range(0.6, 1.1);
      thump(b, sr, { t, f0: 60, f1: 38, glide: 0.1, tau: 0.2, amp: 0.5 });
      burst(b, sr, rng, { t, dur: 0.5, attack: 0.005, tau: 0.1, lp: 250, color: 'brown', amp: 0.5 });
    }
    return caveFinish(b, sr, { t60: 5, tail: 3.5, highcut: 1500 });
  },
  // 8: stone scraping / grinding
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.5, 2.2);
    const b = alloc(d, sr);
    phisem(b, sr, rng, {
      dur: d,
      rate: 2500,
      energy: (t) => envBump(t, d * 0.35, d * 0.65),
      grain: 0.002,
      heavy: 2.5,
      bands: [
        { f: 700, q: 4, g: 1, spread: 0.3 },
        { f: 1500, q: 4, g: 0.6, spread: 0.3 },
        { f: 320, q: 3, g: 0.6, spread: 0.2 },
      ],
    });
    lowpass(b, 2200, sr);
    return caveFinish(b, sr, { t60: 4.5, tail: 3 });
  },
  // 9: dissonant sine cluster
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(3.5, 4.5);
    const b = alloc(d, sr);
    const f = rng.range(190, 260);
    [1, 1.059, 1.335, 1.42].forEach((r, k) => {
      const st = k * rng.range(0.2, 0.5);
      addOsc(b, sr, st, d - st, (t) => f * r * (1 + 0.004 * Math.sin(TAU * (0.2 + k * 0.07) * t)), (t) => 0.25 * envBump(t, (d - st) * 0.4, (d - st) * 0.6));
    });
    return caveFinish(b, sr, { t60: 3.5, tail: 2 });
  },
  // 10: descending ghostly tone
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(2.5, 3.5);
    const b = alloc(d, sr);
    const f0 = rng.range(700, 950);
    const f1 = f0 * rng.range(0.3, 0.42);
    addOsc(b, sr, 0, d, (t) => f0 * Math.pow(f1 / f0, t / d) * (1 + 0.012 * Math.sin(TAU * 5 * t)), (t) => envBump(t, 0.4, d - 0.4));
    addOsc(b, sr, 0, d, (t) => 2.003 * f0 * Math.pow(f1 / f0, t / d), (t) => 0.12 * envBump(t, 0.5, d - 0.5));
    return caveFinish(b, sr, { t60: 4, tail: 3 });
  },
  // 11: low growl
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.8, 2.5);
    const b = alloc(d, sr);
    const f = rng.range(42, 55);
    voice(b, sr, rng, {
      dur: d,
      f0: (t) => f * (1 + 0.15 * Math.sin((Math.PI * t) / d) + 0.05 * Math.sin(TAU * 1.3 * t)),
      amp: (t) => envBump(t, d * 0.4, d * 0.6),
      formants: [
        { f: 250, bw: 120, g: 1 },
        { f: 560, bw: 180, g: 0.6 },
        { f: 1100, bw: 250, g: 0.2 },
      ],
      rough: 0.5,
      sub: 0.1,
      jitter: 0.06,
      shimmer: 0.25,
      breath: 0.3,
      growl: [18, 0.5],
    });
    lowpass(b, 900, sr);
    return caveFinish(b, sr, { t60: 4, tail: 3 });
  },
  // 12: a single stone clack ringing through the cave
  (c) => {
    const { sr, rng } = c;
    const b = alloc(0.5, sr);
    const f = rng.range(900, 1400);
    impact(b, sr, rng, { modes: [f, 1, 0.05, f * 1.52, 0.6, 0.04, f * 2.3, 0.4, 0.03, f * 0.47, 0.5, 0.06], noise: 1.2, noiseTau: 0.004, noiseBp: [2200, 0.7] });
    echo(b, sr, rng.range(0.35, 0.5), 0.4, 0.5, 1800);
    return caveFinish(b, sr, { t60: 5, tail: 4, wet: 1.8 });
  },
  // 13: reversed noise swell into a low hit
  (c) => {
    const { sr, rng } = c;
    const sw = rng.range(1.6, 2.2);
    const b = alloc(sw + 1.2, sr);
    sweep(b, sr, rng, { dur: sw, f: (t) => 300 + 2200 * Math.pow(t / sw, 2), q: 1.5, amp: (t) => Math.pow(t / sw, 3), color: 'pink' });
    thump(b, sr, { t: sw, f0: 90, f1: 45, glide: 0.08, tau: 0.25, amp: 1.2 });
    burst(b, sr, rng, { t: sw, dur: 0.4, attack: 0.002, tau: 0.08, lp: 600, amp: 0.5 });
    return caveFinish(b, sr, { t60: 3.5, tail: 2.5 });
  },
  // 14: minor-second drone under hollow wind
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(4, 5);
    const b = alloc(d, sr);
    const f = rng.range(100, 125);
    addOsc(b, sr, 0, d, () => f, (t) => 0.4 * envBump(t, d * 0.3, d * 0.6));
    addOsc(b, sr, d * 0.25, d * 0.75, () => f * 1.0595, (t) => 0.35 * envBump(t, d * 0.3, d * 0.45));
    sweep(b, sr, rng, { dur: d, f: (t) => 500 + 150 * Math.sin((TAU * t) / d), q: 4, amp: (t) => 0.5 * envBump(t, d * 0.5, d * 0.5), color: 'pink' });
    return caveFinish(b, sr, { t60: 3 });
  },
  // 15: pebbles trickling down a shaft
  (c) => {
    const { sr, rng } = c;
    const d = rng.range(1.2, 1.8);
    const b = alloc(d, sr);
    ticks(b, sr, rng, {
      dur: d,
      rate: 40,
      energy: (t) => envBump(t, d * 0.3, d * 0.7),
      f: [900, 3500],
      t60: [0.01, 0.04],
      heavy: 2,
      click: 0.4,
    });
    lowpass(b, 4000, sr);
    return caveFinish(b, sr, { t60: 4, tail: 3.5, wet: 1.7 });
  },
];

function cave(c: Ctx): Float32Array {
  const out = CAVES[c.v % CAVES.length](c);
  // cap length at 8 s with a fade
  const max = nsamp(8, c.sr);
  const o = out.length > max ? out.slice(0, max) : out;
  const fl = Math.min(o.length >> 2, nsamp(0.5, c.sr));
  for (let i = 0; i < fl; i++) o[o.length - 1 - i] *= i / fl;
  return o;
}

function portal(c: Ctx): Float32Array {
  const { rng } = c;
  // everything here lives below ~2 kHz: render at half rate, then upsample (periodically)
  const sr = c.sr / 2;
  const L = 4;
  const X = 0.5;
  const half = looped(sr, L, X, (out) => {
    const n = out.length;
    layer(out, 1, (b) => {
      for (let k = 0; k < 3; k++) {
        const fc = rng.range(300, 900);
        const lf = rng.range(0.25, 0.9);
        const ph = rng.next() * TAU;
        sweep(b, sr, rng, { dur: L + X, f: (t) => fc * (1 + 0.45 * Math.sin(TAU * lf * t + ph)), q: 9, amp: () => 1, color: 'pink' });
      }
    });
    layer(out, 0.6, (b) => {
      const f = rng.range(52, 60);
      for (let h = 1; h <= 6; h++) addOsc(b, sr, 0, L + X, (t) => f * h * (1 + 0.004 * Math.sin(TAU * 0.5 * t)), () => 0.5 / h);
      addOsc(b, sr, 0, L + X, () => f * 1.007, () => 0.4);
      lowpass(b, 400, sr);
    });
    const sw = rng.range(0.4, 0.7);
    for (let i = 0; i < n; i++) out[i] *= 0.75 + 0.25 * Math.sin((TAU * sw * i) / sr);
  });
  return upsample2(half, true);
}

// ------------------------------------------------------------------ registry

export function worldSounds(): Record<string, SoundGen> {
  const loop = { loop: true };
  return {
    'block.chest.open': sound('block.chest.open', 1, chestOpen),
    'block.chest.close': sound('block.chest.close', 1, chestClose),
    'block.wooden_door.open': sound('block.wooden_door.open', 2, doorOpen),
    'block.wooden_door.close': sound('block.wooden_door.close', 2, doorClose),
    'block.wooden_trapdoor.open': sound('block.wooden_trapdoor.open', 3, trapdoorOpen),
    'block.wooden_trapdoor.close': sound('block.wooden_trapdoor.close', 3, trapdoorClose),
    'block.iron_door.open': sound('block.iron_door.open', 4, (c) => ironOpen(c, false)),
    'block.iron_door.close': sound('block.iron_door.close', 4, (c) => ironClose(c, false)),
    'block.iron_trapdoor.open': sound('block.iron_trapdoor.open', 4, (c) => ironOpen(c, true)),
    'block.iron_trapdoor.close': sound('block.iron_trapdoor.close', 4, (c) => ironClose(c, true)),
    'block.fence_gate.open': sound('block.fence_gate.open', 2, gateOpen),
    'block.fence_gate.close': sound('block.fence_gate.close', 3, gateClose),
    'block.furnace.fire_crackle': sound('block.furnace.fire_crackle', 5, furnaceCrackle),
    'block.fire.ambient': sound('block.fire.ambient', 1, fireAmbient, loop),
    'block.fire.extinguish': sound('block.fire.extinguish', 1, fizz),
    'entity.generic.extinguish_fire': sound('entity.generic.extinguish_fire', 2, extinguishFire),
    'entity.generic.burn': sound('entity.generic.burn', 3, burn),
    'block.lava.pop': sound('block.lava.pop', 1, lavaPop),
    'block.lava.ambient': sound('block.lava.ambient', 1, lavaAmbient, loop),
    'block.water.ambient': sound('block.water.ambient', 1, waterAmbient, loop),
    'block.note_block.harp': sound('block.note_block.harp', 1, harp),
    'weather.rain': sound('weather.rain', 3, (c) => rain(c, false), loop),
    'weather.rain.above': sound('weather.rain.above', 3, (c) => rain(c, true), loop),
    'entity.lightning_bolt.thunder': sound('entity.lightning_bolt.thunder', 3, thunder, { hp: 25 }),
    'ambient.cave': sound('ambient.cave', CAVES.length, cave, { trimDb: -70, fadeOut: 0.3 }),
    'block.portal.ambient': sound('block.portal.ambient', 1, portal, loop),
  };
}

