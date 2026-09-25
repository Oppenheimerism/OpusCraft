// The goat's sounds (M8), synthesized. A goat bleats — a nasal "meh" shaken by a quick tremolo, higher and sharper
// when hurt, sinking away as it dies; it munches its wheat, taps along on its hooves, pushes off with a grunt to leap,
// snorts and scrapes a hoof before it rams, and hits with a heavy knock of its skull; a horn snaps with a hard crack.
// A screaming goat does all of it screaming — a startlingly human yell. Its milk squirts ringing into a bucket.
// And the goat horn's eight calls (item.goat_horn.sound.0-7): Ponder, Sing, Seek and Feel, Admire, Call, Yearn and
// Dream — a brassy horn blown on the mountainside, each its own short melody, carried off in its echo.

import type { SoundGen } from '../synth';
import { addOsc, alloc, echo, envBump, envPts, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump, ticks } from './texture';
import { voice } from './voice';
import { reverbHalf } from './world';
import { bucketRing } from './fish';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ voices

interface Cry {
  dur: number;
  /** the pitch over the cry (t in seconds) */
  f0: (t: number) => number;
  /** its loudness over the cry (0..1 of `dur`) */
  env: number[];
  /** tremolo [rate Hz, depth]: a bleat's shake */
  trem?: [number, number];
  /** how hard it's pressed out: rough and breathy */
  rough?: number;
  t?: number;
}

/** a goat's bleat: "meh", nasal and small-throated, its pitch and loudness shaken together */
function bleatInto(b: Float32Array, c: Ctx, o: Cry): void {
  const [rate, depth] = o.trem ?? [11, 0.45];
  const ph = c.rng.range(0, TAU);
  const shake = (t: number) => Math.sin(TAU * rate * t + ph);
  voice(b, c.sr, c.rng, {
    t: o.t ?? 0,
    dur: o.dur,
    f0: (t) => o.f0(t) * (1 + 0.06 * depth * shake(t)),
    amp: (t) => envPts(t / o.dur, o.env) * (1 - depth + depth * (0.5 + 0.5 * shake(t))),
    formants: [
      { f: 260, bw: 90, g: 0.5 },
      { f: (t) => 560 + 120 * smooth(t / (o.dur * 0.3)), bw: 130, g: 1 },
      { f: 2150, bw: 220, g: 0.55 },
      { f: 3050, bw: 300, g: 0.25 },
      { f: 4100, bw: 420, g: 0.1 },
    ],
    oq: 0.45,
    jitter: 0.025,
    shimmer: 0.1,
    rough: o.rough ?? 0.12,
    breath: 0.18,
  });
}

/** a screaming goat's scream: an open, human "aaah!", hoarse and wavering */
function screamInto(b: Float32Array, c: Ctx, o: Cry): void {
  const vib = c.rng.range(5, 7);
  voice(b, c.sr, c.rng, {
    t: o.t ?? 0,
    dur: o.dur,
    f0: (t) => o.f0(t) * (1 + 0.025 * Math.sin(TAU * vib * t)),
    amp: (t) => envPts(t / o.dur, o.env),
    formants: [
      { f: (t) => 700 + 250 * smooth(t / 0.12), bw: 140, g: 1 },
      { f: 1350, bw: 180, g: 0.8 },
      { f: 2750, bw: 260, g: 0.45 },
      { f: 3700, bw: 380, g: 0.2 },
    ],
    oq: 0.38,
    jitter: 0.04,
    shimmer: 0.15,
    rough: o.rough ?? 0.4,
    sub: 0.08,
    breath: 0.35,
  });
}

const bleat = (dur: number, f0: (t: number) => number, env: number[], o: Partial<Cry> = {}) => (c: Ctx): Float32Array => {
  const out = alloc(dur + 0.1, c.sr);
  layer(out, 1, (b) => bleatInto(b, c, { dur, f0, env, ...o }));
  return out;
};

/** vanilla entity.goat.ambient: one bleat or two */
function ambient(c: Ctx): Float32Array {
  const { rng } = c;
  const n = rng.int(3) === 0 ? 2 : 1;
  const d = rng.range(0.45, 0.8);
  const out = alloc(n * (d + 0.15) + 0.1, c.sr);
  const base = rng.range(360, 470);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const dd = i ? d * 0.8 : d;
    layer(out, i ? 0.85 : 1, (b) => bleatInto(b, c, { t, dur: dd, f0: (x) => base * (1 + 0.06 * Math.sin((Math.PI * x) / dd) - (0.08 * x) / dd), env: [0, 0, 0.08, 1, 0.7, 0.85, 1, 0], trem: [rng.range(9, 13), rng.range(0.35, 0.55)] }));
    t += dd + rng.range(0.08, 0.15);
  }
  return out;
}

/** a screaming goat's cry, as `scream` gives its shape, with its gasp of breath first */
function screaming(dur: [number, number], f: [number, number], shape: 'yell' | 'wail' | 'short') {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = rng.range(dur[0], dur[1]);
    const out = alloc(d + 0.15, sr);
    const hi = rng.range(f[0], f[1]);
    const f0 =
      shape === 'wail'
        ? (t: number) => hi * (0.7 + 0.35 * smooth(t / 0.15) - 0.45 * smooth((t - 0.3 * d) / (0.7 * d)))
        : shape === 'short'
          ? (t: number) => hi * (0.75 + 0.3 * smooth(t / 0.06) - 0.15 * (t / d))
          : (t: number) => hi * (0.65 + 0.4 * smooth(t / 0.12) - 0.2 * smooth((t - 0.7 * d) / (0.3 * d)));
    const env = shape === 'wail' ? [0, 0, 0.06, 1, 0.5, 0.8, 1, 0] : shape === 'short' ? [0, 0, 0.1, 1, 0.6, 0.7, 1, 0] : [0, 0, 0.07, 1, 0.75, 0.9, 1, 0];
    layer(out, 1, (b) => screamInto(b, c, { dur: d, f0, env }));
    return out;
  };
}

// ------------------------------------------------------------------ the body

/** vanilla entity.goat.step: a small hoof tapping down, and a scuff */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.16, sr);
  layer(out, 0.8, (b) => thump(b, sr, { t: 0.002, f0: rng.range(210, 260), f1: rng.range(120, 150), glide: 0.012, tau: 0.018, h2: 0.25 }));
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: 0, modes: [rng.range(1500, 1900), 1, 0.015, rng.range(2900, 3400), 0.5, 0.01], noise: 0.8, noiseTau: 0.005, noiseBp: [2400, 0.9] }));
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: 0.006, dur: 0.06, attack: 0.003, tau: 0.015, hp: 3000 }));
  return out;
}

/** vanilla entity.goat.eat: quick munching of what it was fed */
function eat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 3 + rng.int(3);
  const out = alloc(0.2 + n * 0.12, sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    layer(out, rng.range(0.6, 1), (b) => burst(b, sr, rng, { t, dur: 0.08, attack: 0.005, tau: 0.022, bp: [rng.range(1000, 1900), 0.8] }));
    layer(out, rng.range(0.25, 0.4), (b) => burst(b, sr, rng, { t: t + 0.008, dur: 0.09, attack: 0.008, tau: 0.03, bp: [rng.range(320, 480), 0.8], color: 'brown' }));
    t += rng.range(0.1, 0.14);
  }
  highpass(out, 180, sr);
  return out;
}

/** vanilla entity.goat.long_jump: a scrabble of hooves pushing off, a grunt of effort, the rush of air */
function longJump(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 0.7, (b) => {
    for (let i = 0; i < 3; i++) burst(b, sr, rng, { t: i * rng.range(0.02, 0.035), dur: 0.08, attack: 0.002, tau: 0.02, bp: [rng.range(900, 1600), 0.7] });
  });
  layer(out, 0.55, (b) =>
    voice(b, sr, rng, { t: 0.02, dur: 0.16, f0: (t) => 240 * (1 - t), amp: (t) => envBump(t, 0.02, 0.12), formants: [{ f: 520, bw: 150, g: 1 }, { f: 1300, bw: 200, g: 0.5 }, { f: 2500, bw: 300, g: 0.2 }], breath: 0.6, rough: 0.3 }),
  );
  layer(out, 0.4, (b) => sweep(b, sr, rng, { t: 0.05, dur: 0.45, f: (t) => 500 + 1400 * t, q: 0.8, amp: (t) => envPts(t / 0.45, [0, 0, 0.3, 1, 1, 0]), color: 'pink' }));
  return out;
}

/** vanilla entity.goat.milk: two or three squirts ringing into a tin bucket */
function milk(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 2 + rng.int(2);
  const out = alloc(0.35 + n * 0.28, sr);
  layer(out, 0.3, (b) => bucketRing(b, sr, rng, 0));
  layer(out, 1, (b) => {
    let t = 0.03;
    for (let i = 0; i < n; i++) {
      const d = rng.range(0.14, 0.22), f = rng.range(2600, 3600);
      sweep(b, sr, rng, { t, dur: d, f: (x) => f * (1 - (0.35 * x) / d), q: 4, amp: (x) => envPts(x / d, [0, 0, 0.1, 1, 0.6, 0.7, 1, 0]), color: 'pink' });
      burst(b, sr, rng, { t: t + d * 0.7, dur: 0.08, attack: 0.004, tau: 0.02, bp: [rng.range(700, 1100), 1.5], amp: 0.5 });
      t += d + rng.range(0.07, 0.12);
    }
  });
  return out;
}

/** vanilla entity.goat.prepare_ram: a snort through the nose, and a hoof scraping the ground */
function prepareRam(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.75, sr);
  layer(out, 0.9, (b) => sweep(b, sr, rng, { dur: 0.22, f: (t) => 1600 - 2200 * t, q: 1.6, amp: (t) => envPts(t / 0.22, [0, 0, 0.12, 1, 0.5, 0.6, 1, 0]) }));
  layer(out, 0.6, (b) => {
    for (let i = 0; i < 2; i++) sweep(b, sr, rng, { t: 0.3 + i * 0.18, dur: 0.16, f: (t) => 1100 + 900 * t, q: 0.9, amp: (t) => envPts(t / 0.16, [0, 0, 0.2, 1, 1, 0]) });
  });
  // (the grit it kicks up)
  layer(out, 0.35, (b) => ticks(b, sr, rng, { t: 0.3, dur: 0.35, rate: 60, energy: (t) => envPts(t / 0.35, [0, 1, 1, 0]), f: [1800, 4200], t60: [0.01, 0.03], click: 0.4 }));
  return out;
}

/** vanilla entity.goat.ram_impact: the heavy knock of its skull into something */
function ramImpact(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(95, 115), f1: rng.range(48, 58), glide: 0.03, tau: 0.07, h2: 0.3 }));
  layer(out, 0.7, (b) => impact(b, sr, rng, { modes: [rng.range(520, 640), 1, 0.06, rng.range(1250, 1450), 0.6, 0.04, rng.range(2300, 2600), 0.3, 0.025], jitter: 0.05, noise: 1.2, noiseTau: 0.012, noiseBp: [1200, 0.7] }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.01, dur: 0.2, attack: 0.004, tau: 0.06, bp: [400, 0.6], color: 'brown' }));
  return out;
}

/** vanilla entity.goat.horn_break: the horn cracking off, and a bit of it clattering */
function hornBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [rng.range(1900, 2300), 1, 0.03, rng.range(3300, 3800), 0.7, 0.02, rng.range(5200, 5800), 0.4, 0.015], noise: 1.6, noiseTau: 0.006, noiseBp: [3500, 0.8] }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { t: 0.004, dur: 0.05, attack: 0.001, tau: 0.01, hp: 2000 }));
  layer(out, 0.45, (b) => {
    let t = 0.12;
    for (let i = 0; i < 3; i++) {
      const f = rng.range(1400, 2200);
      impact(b, sr, rng, { t, modes: [f, 0.8 - i * 0.2, 0.02, f * 1.6, 0.4, 0.015] });
      t += rng.range(0.07, 0.12);
    }
  });
  return out;
}

/** a screaming goat's version of one of its body's sounds: the sound, and a scream over it */
function withScream(base: (c: Ctx) => Float32Array, at: number, dur: [number, number], f: [number, number]) {
  const yell = screaming(dur, f, 'short');
  return (c: Ctx): Float32Array => {
    const a = base(c), s = yell(c);
    const n = Math.max(a.length, Math.round(at * c.sr) + s.length);
    const out = new Float32Array(n);
    out.set(a);
    const o = Math.round(at * c.sr);
    for (let i = 0; i < s.length; i++) out[o + i] += s[i] * 0.8;
    return out;
  };
}

// ------------------------------------------------------------------ the horn

interface Note {
  t: number;
  dur: number;
  f: (t: number) => number;
  /** loudness over the note (0..1 of dur) */
  env: number[];
}

/** one note of a goat horn: brass, the upper harmonics coming up the harder it's blown, with the breath through it */
function hornNote(b: Float32Array, c: Ctx, n: Note, bright: number): void {
  const { sr, rng } = c;
  const env = (t: number) => envPts(t / n.dur, n.env);
  for (let h = 1; h <= 11; h++) {
    const w = 1 / Math.pow(h, 1.1);
    addOsc(b, sr, n.t, n.dur, (t) => n.f(t) * h, (t) => {
      const e = env(t);
      return w * e * Math.pow(e, ((h - 1) * 0.45) / bright);
    }, rng.range(0, TAU));
  }
  sweep(b, sr, rng, { t: n.t, dur: n.dur, f: (t) => n.f(t) * 6, q: 1.2, amp: (t) => 0.05 * env(t), color: 'pink' });
}

/** a slide from `a` to `b` Hz between `t0` and `t1` */
const glide = (a: number, b: number, t0: number, t1: number) => (t: number) => a + (b - a) * smooth((t - t0) / (t1 - t0));
/** a slow waver of `depth` at `rate` Hz on a pitch */
const waver = (f: (t: number) => number, rate: number, depth: number) => (t: number) => f(t) * (1 + depth * Math.sin(TAU * rate * t));

/** the eight calls: each a short melody of notes, how bright it's blown, and the room it rings in */
const CALLS: { notes: Note[]; bright: number; echo: number; t60: number; dur: number }[] = [
  // 0 Ponder: one low, long, thoughtful note, rising into it and settling away
  { dur: 4.6, bright: 0.8, echo: 0.5, t60: 3.2, notes: [{ t: 0.02, dur: 4.2, f: waver(glide(92, 98, 0, 0.6), 4, 0.003), env: [0, 0, 0.14, 0.75, 0.45, 1, 0.8, 0.8, 1, 0] }] },
  // 1 Sing: a rising, singing phrase, sliding from note to note
  {
    dur: 4.4, bright: 1.1, echo: 0.45, t60: 2.8,
    notes: [{ t: 0.02, dur: 3.9, f: (t) => (t < 1 ? glide(128, 131, 0, 0.2)(t) : t < 2 ? glide(131, 165, 1, 1.15)(t) : t < 3 ? glide(165, 196, 2, 2.15)(t) : glide(196, 175, 3, 3.2)(t)), env: [0, 0, 0.06, 0.85, 0.25, 0.8, 0.5, 0.95, 0.75, 0.9, 1, 0] }],
  },
  // 2 Seek: a call rising a fifth, and again, as if asking
  {
    dur: 4.4, bright: 1, echo: 0.55, t60: 3,
    notes: [
      { t: 0.02, dur: 1.6, f: glide(108, 163, 0.1, 0.9), env: [0, 0, 0.1, 0.8, 0.6, 1, 1, 0] },
      { t: 2.0, dur: 2.0, f: glide(110, 168, 0.1, 1.0), env: [0, 0, 0.08, 0.8, 0.55, 1, 0.85, 0.8, 1, 0] },
    ],
  },
  // 3 Feel: a low note that wavers and swells twice, full of feeling
  { dur: 4.8, bright: 0.9, echo: 0.5, t60: 3.2, notes: [{ t: 0.02, dur: 4.4, f: waver(() => 123, 4.5, 0.028), env: [0, 0, 0.12, 0.85, 0.35, 0.55, 0.6, 1, 0.85, 0.7, 1, 0] }] },
  // 4 Admire: bright, climbing a fourth and holding it high
  {
    dur: 4.2, bright: 1.5, echo: 0.45, t60: 2.6,
    notes: [{ t: 0.02, dur: 3.8, f: (t) => glide(147, 196, 0.9, 1.1)(t) * (1 + 0.004 * Math.sin(TAU * 5 * t)), env: [0, 0, 0.06, 0.9, 0.22, 0.75, 0.35, 1, 0.8, 0.9, 1, 0] }],
  },
  // 5 Call: two short blasts, then a long one, loud and bright
  {
    dur: 4.4, bright: 1.6, echo: 0.6, t60: 3,
    notes: [
      { t: 0.02, dur: 0.38, f: () => 155, env: [0, 0, 0.15, 1, 0.7, 0.9, 1, 0] },
      { t: 0.55, dur: 0.38, f: () => 155, env: [0, 0, 0.15, 1, 0.7, 0.9, 1, 0] },
      { t: 1.1, dur: 2.9, f: glide(155, 175, 2.0, 2.6), env: [0, 0, 0.05, 1, 0.8, 0.95, 1, 0] },
    ],
  },
  // 6 Yearn: high and longing, sighing down a fourth
  { dur: 4.6, bright: 1.2, echo: 0.5, t60: 3.4, notes: [{ t: 0.02, dur: 4.2, f: waver(glide(220, 165, 0.6, 3.4), 5, 0.006), env: [0, 0, 0.1, 0.9, 0.4, 1, 0.85, 0.6, 1, 0] }] },
  // 7 Dream: two soft voices a hair apart, drifting up a minor third and back, far off
  {
    dur: 5.4, bright: 0.7, echo: 0.65, t60: 4.2,
    notes: [
      { t: 0.02, dur: 4.8, f: (t) => (t < 2.4 ? glide(185, 220, 1.0, 2.0)(t) : glide(220, 185, 2.8, 4.0)(t)), env: [0, 0, 0.25, 0.8, 0.5, 0.9, 0.75, 0.7, 1, 0] },
      { t: 0.02, dur: 4.8, f: (t) => 1.008 * (t < 2.4 ? glide(185, 220, 1.0, 2.0)(t) : glide(220, 185, 2.8, 4.0)(t)), env: [0, 0, 0.3, 0.7, 0.5, 0.85, 0.75, 0.65, 1, 0] },
    ],
  },
];

/** vanilla item.goat_horn.sound.N: the call blown, and the mountains giving it back */
function hornCall(i: number) {
  return (c: Ctx): Float32Array => {
    const { sr } = c;
    const k = CALLS[i];
    const out = alloc(k.dur + 1.6, sr);
    layer(out, 1, (b) => {
      for (const n of k.notes) hornNote(b, c, n, k.bright);
      lowpass(b, 2400 + 600 * k.bright, sr);
    });
    echo(out, sr, 0.42, 0.3, 0.35, 2200);
    return reverbHalf(out, sr, { t60: k.t60, wet: k.echo, dry: 1, pre: 0.05 });
  };
}

export function goatSounds(): Record<string, SoundGen> {
  const g = 'entity.goat.', s = 'entity.goat.screaming.';
  const out: Record<string, SoundGen> = {
    [g + 'ambient']: sound(g + 'ambient', 5, ambient),
    [g + 'hurt']: sound(g + 'hurt', 4, (c) => bleat(c.rng.range(0.25, 0.35), (t) => 560 * (1 + 0.1 * Math.sin(Math.PI * t * 3)), [0, 0, 0.1, 1, 0.6, 0.8, 1, 0], { trem: [13, 0.3], rough: 0.3 })(c)),
    [g + 'death']: sound(g + 'death', 2, (c) => bleat(1.1, (t) => 480 * (1 - 0.35 * smooth(t / 1.1)), [0, 0, 0.06, 1, 0.5, 0.7, 1, 0], { trem: [9, 0.5], rough: 0.25 })(c)),
    [g + 'eat']: sound(g + 'eat', 3, eat),
    [g + 'long_jump']: sound(g + 'long_jump', 2, longJump),
    [g + 'milk']: sound(g + 'milk', 3, milk),
    [g + 'prepare_ram']: sound(g + 'prepare_ram', 3, prepareRam),
    [g + 'ram_impact']: sound(g + 'ram_impact', 3, ramImpact),
    [g + 'horn_break']: sound(g + 'horn_break', 2, hornBreak),
    [g + 'step']: sound(g + 'step', 5, step),
    [s + 'ambient']: sound(s + 'ambient', 5, screaming([0.7, 1.3], [430, 560], 'yell')),
    [s + 'hurt']: sound(s + 'hurt', 3, screaming([0.3, 0.45], [560, 680], 'short')),
    [s + 'death']: sound(s + 'death', 2, screaming([1.2, 1.5], [480, 560], 'wail')),
    [s + 'eat']: sound(s + 'eat', 3, withScream(eat, 0.3, [0.25, 0.35], [480, 560])),
    [s + 'long_jump']: sound(s + 'long_jump', 2, withScream(longJump, 0, [0.35, 0.45], [520, 620])),
    [s + 'milk']: sound(s + 'milk', 3, withScream(milk, 0.1, [0.3, 0.4], [480, 560])),
    [s + 'prepare_ram']: sound(s + 'prepare_ram', 3, withScream(prepareRam, 0.05, [0.4, 0.55], [420, 520])),
    [s + 'ram_impact']: sound(s + 'ram_impact', 3, withScream(ramImpact, 0.02, [0.3, 0.4], [540, 640])),
    [s + 'horn_break']: sound(s + 'horn_break', 2, withScream(hornBreak, 0.05, [0.45, 0.6], [560, 660])),
  };
  for (let i = 0; i < CALLS.length; i++) out[`item.goat_horn.sound.${i}`] = sound(`item.goat_horn.sound.${i}`, 1, hornCall(i));
  return out;
}
