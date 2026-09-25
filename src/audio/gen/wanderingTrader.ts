// The wandering trader (vanilla entity.wandering_trader.*). His voice is a villager's hum pitched a little lower and
// drawn out, breathier and more nasal, with a questioning lift: a peddler's "hmm-mm?". He gulps down his potion
// from a glass bottle and his milk from a bucket; drinking the potion he vanishes in a shimmering rush that falls away,
// and he comes back in one that rises. Takes as in vanilla's sounds.json: ambient 5, death 1, disappeared 2,
// drink_milk 4, drink_potion 1, hurt 4, no 5, reappeared 2, trade 3, yes 4.

import type { SoundGen } from '../synth';
import { type Rng, addOsc, alloc, envAD, envBump, highpass, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep, thump } from './texture';
import { voice } from './voice';

interface Hum {
  t: number;
  d: number;
  /** pitch over normalised time, as a multiple of the voice's base */
  f: (x: number) => number;
  a?: number;
  /** 0: lips shut ("mm") .. 1: an open "uh" in the middle */
  open?: number;
  /** the rasp in his throat */
  rasp?: number;
}

/** one hum of his voice: the villager's shut-mouthed hum, more of it through the nose, and breathier */
function humInto(b: Float32Array, c: Ctx, base: number, h: Hum): void {
  const { sr, rng } = c;
  const d = h.d, open = h.open ?? 0, rasp = h.rasp ?? 0.2;
  const att = Math.min(0.05, d * 0.22);
  const o = (t: number) => open * Math.sin(Math.PI * Math.min(1, t / d));
  voice(b, sr, rng, {
    t: h.t,
    dur: d,
    f0: (t) => base * h.f(t / d),
    amp: (t) => envBump(t, att, d - att),
    formants: [
      { f: (t) => 240 + 300 * o(t), bw: (t) => 80 + 60 * o(t), g: 1 },
      { f: (t) => 1150 + 120 * o(t), bw: 150, g: (t) => 0.4 + 0.3 * o(t) },
      { f: (t) => 2400 + 300 * o(t), bw: 280, g: (t) => 0.14 + 0.1 * o(t) },
      { f: 3400, bw: 380, g: 0.05 },
    ],
    jitter: 0.02,
    shimmer: 0.08,
    rough: rasp,
    sub: 0.015,
    breath: 0.12,
    oq: 0.6,
    growl: [rng.range(20, 26), rasp * 0.45],
    vib: [5, 0.014],
    gain: h.a ?? 1,
  });
}

function hums(c: Ctx, len: number, base: number, list: Hum[]): Float32Array {
  const out = alloc(len, c.sr);
  layer(out, 1, (b) => {
    for (const h of list) humInto(b, c, base, h);
  });
  highpass(out, 65, c.sr);
  lowpass(out, 5000, c.sr);
  return out;
}

const voiceBase = (c: Ctx) => c.rng.range(112, 132);

/** vanilla entity.wandering_trader.ambient: "hmm-mm?", a long musing "hmmm", a "hm?" that lifts */
function ambient(c: Ctx): Float32Array {
  const b = voiceBase(c);
  switch (c.v % 5) {
    case 0:
      return hums(c, 0.9, b, [{ t: 0, d: 0.22, f: () => 1.0 }, { t: 0.28, d: 0.4, f: (x) => 0.98 + 0.28 * x * x }]);
    case 1:
      return hums(c, 0.9, b, [{ t: 0, d: 0.66, f: (x) => 1.06 - 0.12 * x + 0.05 * Math.sin(Math.PI * 2 * x), rasp: 0.3 }]);
    case 2:
      return hums(c, 0.6, b, [{ t: 0, d: 0.34, f: (x) => 0.95 + 0.35 * Math.pow(x, 1.5), open: 0.3 }]);
    case 3:
      return hums(c, 0.8, b, [{ t: 0, d: 0.48, f: (x) => 1.1 - 0.2 * x, open: 0.4, rasp: 0.3 }]);
    default:
      return hums(c, 0.9, b, [{ t: 0, d: 0.18, f: () => 1.05 }, { t: 0.24, d: 0.18, f: () => 0.96 }, { t: 0.48, d: 0.28, f: (x) => 1.0 + 0.2 * x }]);
  }
}

/** vanilla entity.wandering_trader.trade: coaxing, "hmm? hm-hmm?" */
function trade(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.04;
  switch (c.v % 3) {
    case 0:
      return hums(c, 0.8, b, [{ t: 0, d: 0.5, f: (x) => 0.94 + 0.4 * Math.pow(x, 1.7) }]);
    case 1:
      return hums(c, 0.8, b, [{ t: 0, d: 0.16, f: () => 1.02 }, { t: 0.22, d: 0.36, f: (x) => 1.0 + 0.34 * x, open: 0.2 }]);
    default:
      return hums(c, 0.8, b, [{ t: 0, d: 0.46, f: (x) => 1.12 - 0.1 * x + 0.34 * Math.max(0, x - 0.55), open: 0.35 }]);
  }
}

/** vanilla entity.wandering_trader.yes: a pleased "mm-hm!" */
function yes(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.08;
  switch (c.v % 4) {
    case 0:
      return hums(c, 0.6, b, [{ t: 0, d: 0.14, f: () => 1.0 }, { t: 0.18, d: 0.22, f: (x) => 1.12 + 0.14 * x }]);
    case 1:
      return hums(c, 0.6, b, [{ t: 0, d: 0.2, f: (x) => 0.96 - 0.04 * x }, { t: 0.24, d: 0.24, f: (x) => 1.1 + 0.2 * x, open: 0.2 }]);
    case 2:
      return hums(c, 0.5, b, [{ t: 0, d: 0.32, f: (x) => 1.02 + 0.32 * Math.sin(Math.PI * 0.6 * x), open: 0.35 }]);
    default:
      return hums(c, 0.6, b, [{ t: 0, d: 0.12, f: () => 1.06 }, { t: 0.15, d: 0.12, f: () => 1.16 }, { t: 0.3, d: 0.18, f: (x) => 1.24 - 0.06 * x }]);
  }
}

/** vanilla entity.wandering_trader.no: a grumbled "hrrm", "mm-mm" */
function no(c: Ctx): Float32Array {
  const b = voiceBase(c) * 0.92;
  switch (c.v % 5) {
    case 0:
      return hums(c, 0.7, b, [{ t: 0, d: 0.48, f: (x) => 1.06 - 0.28 * x, rasp: 0.45 }]);
    case 1:
      return hums(c, 0.7, b, [{ t: 0, d: 0.2, f: (x) => 1.05 - 0.06 * x, rasp: 0.3 }, { t: 0.26, d: 0.28, f: (x) => 0.94 - 0.16 * x, rasp: 0.35 }]);
    case 2:
      return hums(c, 0.7, b, [{ t: 0, d: 0.16, f: () => 1.08, open: 0.6 }, { t: 0.22, d: 0.3, f: (x) => 0.92 - 0.14 * x, rasp: 0.4 }]);
    case 3:
      return hums(c, 0.6, b, [{ t: 0, d: 0.36, f: (x) => 1.0 - 0.2 * x * x, open: 0.25, rasp: 0.5 }]);
    default:
      return hums(c, 0.8, b, [{ t: 0, d: 0.56, f: (x) => 1.02 - 0.1 * x - 0.08 * Math.sin(Math.PI * 3 * x), rasp: 0.55 }]);
  }
}

/** vanilla entity.wandering_trader.hurt: a short, pained "hurh!" */
function hurt(c: Ctx): Float32Array {
  const b = voiceBase(c) * c.rng.range(1.2, 1.35);
  return hums(c, 0.45, b, [{ t: 0, d: c.rng.range(0.18, 0.26), f: (x) => 1.1 - 0.28 * x, open: 0.85, rasp: 0.35, a: 1 }]);
}

/** vanilla entity.wandering_trader.death: a long "hrrmmm..." sinking away */
function death(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.1;
  return hums(c, 1.5, b, [{ t: 0, d: 1.2, f: (x) => 1.06 - 0.42 * x + 0.05 * Math.sin(Math.PI * 3 * x), open: 0.5, rasp: 0.5 }]);
}

/** a gulp: the tongue's click, the swallow's rising "glk", the water's bubble */
function gulp(b: Float32Array, c: Ctx, t0: number, f0: number, a: number, thick: number): void {
  const { sr, rng } = c;
  addOsc(b, sr, t0, 0.09, (t) => f0 * (1 + 1.2 * Math.min(1, t / 0.05)), (t) => a * envAD(t, 0.004, 0.024));
  bubble(b, sr, t0 + 0.01, f0 * rng.range(1.6, 2.1), 0.5 * a, 0.02, 0.6);
  burst(b, sr, rng, { t: t0, dur: 0.12, attack: 0.01, tau: 0.03, lp: 700 - 250 * thick, amp: (0.5 + 0.3 * thick) * a });
  thump(b, sr, { t: t0 + 0.01, f0: 170 - 40 * thick, f1: 105, tau: 0.025 + 0.01 * thick, amp: 0.45 * a });
}

/** vanilla entity.wandering_trader.drink_potion: the bottle's glassy knock at his lips, and two or three gulps */
function drinkPotion(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.65, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { t: 0.004, modes: [2900, 1, 0.05, 4700, 0.5, 0.03, 6800, 0.3, 0.02], noise: 0.2 });
    const n = 2 + rng.int(2);
    for (let i = 0; i < n; i++) gulp(b, c, 0.06 + i * rng.range(0.14, 0.18), rng.range(250, 300), 1 - 0.1 * i, 0);
  });
  return out;
}

/** vanilla entity.wandering_trader.drink_milk: the bucket's rim knocking, then slower, thicker gulps */
function drinkMilk(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { t: 0.004, modes: [1450, 1, 0.06, 2350, 0.6, 0.04, 3600, 0.3, 0.025], noise: 0.35 });
    const n = 2 + (c.v % 2);
    for (let i = 0; i < n; i++) gulp(b, c, 0.08 + i * rng.range(0.17, 0.22), rng.range(200, 240), 1 - 0.12 * i, 1);
  });
  return out;
}

/** a rush of air through a narrowing band, and glassy glints scattered through it, the band and glints `rise`-ing or falling */
function magic(c: Ctx, rise: boolean): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.9, 1.1);
  const out = alloc(d + 0.4, sr);
  const f0 = rise ? 500 : 3600, f1 = rise ? 3600 : 450;
  const bend = (t: number) => f0 * Math.pow(f1 / f0, Math.min(1, t / d));
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, { dur: d, f: bend, q: (t) => 2 + 6 * Math.min(1, t / d), amp: (t) => (rise ? envBump(t, d * 0.7, d * 0.3) : envBump(t, d * 0.08, d * 0.92)), color: 'pink' }),
  );
  layer(out, 0.45, (b) => glints(b, sr, rng, d, 14, rise));
  highpass(out, 150, sr);
  return out;
}

/** bell-like glints through `d` seconds, climbing or falling with the rush, thinning as it fades */
function glints(b: Float32Array, sr: number, rng: Rng, d: number, n: number, rise: boolean): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, 1);
    const t = x * d;
    const f = rng.logRange(1800, 2600) * Math.pow(2, rise ? 1.3 * x : 1.3 * (1 - x));
    const a = rng.range(0.4, 1) * (rise ? 0.4 + 0.6 * x : 1 - 0.6 * x);
    const len = rng.range(0.2, 0.4);
    addOsc(b, sr, t, len, () => f, (s) => a * Math.exp(-s / (len * 0.3)) * Math.min(1, s / 0.004));
    addOsc(b, sr, t, len, () => f * 2.76, (s) => 0.2 * a * Math.exp(-s / (len * 0.15)) * Math.min(1, s / 0.004));
  }
}

export function wanderingTraderSounds(): Record<string, SoundGen> {
  return {
    'entity.wandering_trader.ambient': sound('entity.wandering_trader.ambient', 5, ambient),
    'entity.wandering_trader.trade': sound('entity.wandering_trader.trade', 3, trade),
    'entity.wandering_trader.yes': sound('entity.wandering_trader.yes', 4, yes),
    'entity.wandering_trader.no': sound('entity.wandering_trader.no', 5, no),
    'entity.wandering_trader.hurt': sound('entity.wandering_trader.hurt', 4, hurt),
    'entity.wandering_trader.death': sound('entity.wandering_trader.death', 1, death),
    'entity.wandering_trader.drink_potion': sound('entity.wandering_trader.drink_potion', 1, drinkPotion),
    'entity.wandering_trader.drink_milk': sound('entity.wandering_trader.drink_milk', 4, drinkMilk),
    'entity.wandering_trader.disappeared': sound('entity.wandering_trader.disappeared', 2, (c) => magic(c, false)),
    'entity.wandering_trader.reappeared': sound('entity.wandering_trader.reappeared', 2, (c) => magic(c, true)),
  };
}
