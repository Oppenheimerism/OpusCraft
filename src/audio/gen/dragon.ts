// The ender dragon's sounds, original takes in the spirit of vanilla's: its growl (vanilla entity.ender_dragon.growl
// and .ambient, four takes — a vast, guttural roar rolling round the void), its wing beats (.flap, six), its hurt
// shriek (.hurt, four) and its long dying roar (.death); dragon's breath drawn into a bottle is with the other
// bottle sounds (brewing.ts). Its fireball's burst, its spit and a gateway opening are the explosion and ghast
// samples in vanilla too (soundManager's aliases).

import type { SoundGen } from '../synth';
import { TAU, alloc, brown, envAD, envBump, envExpPts, envPts, layer, lowpass, highpass, bandpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump } from './texture';
import { voice, type Formant } from './voice';
import { reverbHalf } from './world';

/** a huge throat: low formants, wide, the higher ones damped */
function throat(open: (x: number) => number, d: number, bright = 0): Formant[] {
  const o = (t: number) => open(t / d);
  return [
    { f: (t) => 260 + 300 * o(t), bw: 160, g: 1 },
    { f: (t) => 720 + 420 * o(t), bw: 220, g: 0.7 + bright },
    { f: (t) => 1900 + 500 * o(t), bw: 380, g: 0.28 + bright },
    { f: 2900, bw: 520, g: 0.12 + bright * 0.5 },
  ];
}

/** the void round it: a huge, dark, slow tail */
function vast(buf: Float32Array, sr: number, t60: number, wet: number): Float32Array {
  highpass(buf, 35, sr);
  return reverbHalf(buf, sr, { t60, wet, dry: 0.85, size: 2.2, pre: 0.045, hf: 0.3, lowcut: 90, tail: t60 * 0.8 });
}

interface Roar {
  t?: number;
  d: number;
  /** pitch (Hz) over 0..1 of it */
  f0: (x: number) => number;
  amp: (x: number) => number;
  /** how open the jaws are over 0..1 */
  open: (x: number) => number;
  rough?: number;
  sub?: number;
  rasp?: number;
  bright?: number;
}

/** one roar: a rough, period-doubling voice in a huge throat, a rasp of breath over it and a rumble under it */
function roar(b: Float32Array, c: Ctx, r: Roar): void {
  const { sr, rng } = c;
  const t0 = r.t ?? 0;
  voice(b, sr, rng, {
    t: t0,
    dur: r.d,
    f0: (t) => r.f0(t / r.d),
    amp: (t) => r.amp(t / r.d),
    formants: throat(r.open, r.d, r.bright ?? 0),
    oq: 0.45,
    jitter: 0.045,
    shimmer: 0.18,
    rough: r.rough ?? 0.45,
    sub: r.sub ?? 0.22,
    breath: 0.4,
    growl: [26, 0.45],
    vib: [5.5, 0.02],
    gain: 1,
  });
  // the rasp: breath torn through the throat, following the voice
  const rasp = r.rasp ?? 0.35;
  if (rasp > 0)
    sweep(b, sr, rng, {
      t: t0,
      dur: r.d,
      f: (t) => 500 + 900 * r.open(t / r.d),
      q: 1.4,
      amp: (t) => rasp * r.amp(t / r.d) * (0.75 + 0.25 * Math.sin(TAU * 31 * t)),
      color: 'pink',
    });
  // the chest: a low rumble under it
  const n = Math.min(b.length - Math.round(t0 * sr), Math.round(r.d * sr));
  const rum = brown(n, rng, 0.998);
  lowpass(rum, 110, sr);
  lowpass(rum, 110, sr);
  const s = Math.round(t0 * sr);
  for (let i = 0; i < n; i++) b[s + i] += rum[i] * 2.2 * r.amp(i / n);
}

/** vanilla entity.ender_dragon.growl (and .ambient): four slow, rolling roars */
function growl(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(52, 64);
  const shapes: Roar[] = [
    // a swelling roar that sinks away
    { d: 2.4, f0: (x) => base * envExpPts(x, [0, 0.8, 0.3, 1.25, 0.75, 1, 1, 0.7]), amp: (x) => envPts(x, [0, 0, 0.15, 0.8, 0.35, 1, 0.8, 0.6, 1, 0]), open: (x) => envPts(x, [0, 0.2, 0.3, 1, 0.8, 0.6, 1, 0.1]) },
    // two pulses, the second longer
    { d: 0.8, f0: (x) => base * 1.1 * envExpPts(x, [0, 0.85, 0.4, 1.1, 1, 0.9]), amp: (x) => envBump(x, 0.25, 0.75), open: (x) => envBump(x, 0.3, 0.7) },
    // a deep, grinding growl, barely opening
    { d: 2.1, f0: (x) => base * 0.82 * (1 + 0.08 * Math.sin(TAU * 1.7 * x)), amp: (x) => envPts(x, [0, 0, 0.2, 1, 0.8, 0.85, 1, 0]), open: (x) => 0.15 + 0.2 * Math.sin(Math.PI * x), rough: 0.6, sub: 0.3, rasp: 0.5 },
    // a rising challenge, jaws flung open
    { d: 1.9, f0: (x) => base * envExpPts(x, [0, 0.75, 0.55, 1.45, 1, 1.15]), amp: (x) => envPts(x, [0, 0, 0.1, 0.6, 0.6, 1, 0.85, 0.8, 1, 0]), open: (x) => envPts(x, [0, 0.1, 0.6, 1, 1, 0.8]), bright: 0.1 },
  ];
  const parts: Roar[] = v === 1 ? [shapes[1], { ...shapes[0], t: 0.7, d: 1.8 }] : [shapes[v % shapes.length]];
  const len = Math.max(...parts.map((p) => (p.t ?? 0) + p.d)) + 0.05;
  const out = alloc(len, sr);
  layer(out, 1, (b) => {
    for (const p of parts) roar(b, c, p);
  });
  return vast(out, sr, 3.4, 0.62);
}

/** vanilla entity.ender_dragon.hurt: a shorter, higher shriek of pain */
function hurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const base = rng.range(95, 125) * [1, 1.12, 0.92, 1.05][v % 4];
  const d = rng.range(0.75, 1.05);
  const out = alloc(d + 0.05, sr);
  layer(out, 1, (b) =>
    roar(b, c, {
      d,
      f0: (x) => base * envExpPts(x, [0, 1.3, 0.12, 1.6, 0.5, 1.1, 1, 0.7]),
      amp: (x) => envPts(x, [0, 0, 0.05, 1, 0.4, 0.75, 1, 0]),
      open: (x) => envPts(x, [0, 0.6, 0.15, 1, 1, 0.3]),
      rough: 0.5,
      sub: 0.15,
      rasp: 0.45,
      bright: 0.25,
    }),
  );
  return vast(out, sr, 2.6, 0.5);
}

/** vanilla entity.ender_dragon.death: a last great roar, then a long wail wavering down into the dark */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d1 = 2.8, d2 = 8.5;
  const out = alloc(d1 + d2, sr);
  layer(out, 1, (b) => {
    roar(b, c, {
      d: d1 + 0.4,
      f0: (x) => 70 * envExpPts(x, [0, 0.9, 0.35, 1.6, 0.8, 1.3, 1, 1.1]),
      amp: (x) => envPts(x, [0, 0, 0.1, 1, 0.75, 0.9, 1, 0.3]),
      open: (x) => envPts(x, [0, 0.3, 0.3, 1, 1, 0.8]),
      rough: 0.5,
      rasp: 0.5,
      bright: 0.15,
    });
    // the wail: falling, its vibrato slowing and widening as it goes
    voice(b, sr, rng, {
      t: d1,
      dur: d2,
      f0: (t) => 78 * envExpPts(t / d2, [0, 1, 0.3, 0.8, 1, 0.42]) * (1 + (0.02 + 0.07 * (t / d2)) * Math.sin(TAU * (4.5 - 2.5 * (t / d2)) * t)),
      amp: (t) => envPts(t / d2, [0, 0.3, 0.05, 0.85, 0.5, 0.55, 1, 0]),
      formants: throat((x) => 0.7 - 0.55 * x, d2, 0.05),
      oq: 0.5,
      jitter: 0.05,
      shimmer: 0.2,
      rough: 0.35,
      sub: 0.2,
      breath: 0.45,
      growl: [14, 0.35],
    });
    // the ground of it: a rumble that swells in the middle and dies with it
    const n = b.length;
    const rum = brown(n, rng, 0.999);
    lowpass(rum, 70, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      b[i] += rum[i] * 3 * envPts(t, [0, 0, 1.5, 0.6, 5, 0.9, d1 + d2, 0]);
    }
  });
  return vast(out, sr, 4.5, 0.7);
}

/** vanilla entity.ender_dragon.flap: one beat of the great wings — a push of air, the leather snapping taut */
function flap(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.9, sr);
  const lo = rng.range(0.85, 1.15) * [1, 0.9, 1.1, 0.95, 1.05, 1][v % 6];
  // the push: a low whump of moved air
  layer(out, 1, (b) => thump(b, sr, { f0: 95 * lo, f1: 38 * lo, glide: 0.07, tau: 0.13, attack: 0.03, dur: 0.6 }));
  // the whoosh: the air rushing off the membranes
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, { dur: 0.8, f: (t) => envExpPts(t, [0, 220 * lo, 0.1, 700 * lo, 0.5, 260 * lo]), q: 0.9, amp: (t) => envAD(t, 0.07, 0.16), color: 'pink' }),
  );
  // the membranes snapping and fluttering
  layer(out, 0.35, (b) =>
    burst(b, sr, rng, { t: 0.02, dur: 0.45, attack: 0.02, tau: 0.09, bp: [900 * lo, 0.8], env: (t) => 0.55 + 0.45 * Math.sin(TAU * rng.range(20, 26) * t) }),
  );
  return reverbHalf(out, sr, { t60: 1.2, wet: 0.3, dry: 1, size: 1.6, pre: 0.02, hf: 0.35, lowcut: 120, tail: 0.8 });
}

export function dragonSounds(): Record<string, SoundGen> {
  return {
    'entity.ender_dragon.growl': sound('entity.ender_dragon.growl', 4, growl, { fadeOut: 0.3 }),
    'entity.ender_dragon.hurt': sound('entity.ender_dragon.hurt', 4, hurt, { fadeOut: 0.2 }),
    'entity.ender_dragon.death': sound('entity.ender_dragon.death', 1, death, { trimDb: -60, fadeOut: 0.8 }),
    'entity.ender_dragon.flap': sound('entity.ender_dragon.flap', 6, flap, { fadeOut: 0.1 }),
  };
}
