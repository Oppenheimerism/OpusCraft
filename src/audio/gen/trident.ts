// The trident (vanilla item.trident.*): the whoosh of a throw, the wet thunk of a hit, the ringing twang as it sticks
// in the ground, the rising swirl of a loyal trident flying home, riptide's rush of water (bigger with each level),
// and channeling's crack of thunder.
// Takes as in vanilla's sounds.json: throw 2, hit 3, hit_ground 4, return 3, riptide_1/2/3 1 each, thunder 2.

import type { SoundGen } from '../synth';
import { TAU, alloc, brown, envAD, envBump, envExpPts, layer, lowpass, highpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep, thump } from './texture';
import { reverbHalf } from './world';

/** the prongs' metallic shimmer: four inharmonic modes, a little detuned per take */
function ring(b: Float32Array, c: Ctx, t: number, f: number, t60: number): void {
  impact(b, c.sr, c.rng, { t, modes: [f, 1, t60, f * 1.53, 0.6, t60 * 0.8, f * 2.37, 0.35, t60 * 0.6, f * 3.41, 0.2, t60 * 0.4], jitter: 0.01, noise: 0.2, noiseTau: 0.002, noiseBp: [f * 2, 1] });
}

/** vanilla item/trident/throw1-2: a heavy swoosh through the air with a glint of metal */
function throwIt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.55, sr);
  const k = v ? 1.08 : 1;
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.45, f: (t) => envExpPts(t, [0, 350 * k, 0.12, 1700 * k, 0.45, 600 * k]), q: 1.3, amp: (t) => envBump(t, 0.1, 0.33) }));
  layer(out, 0.35, (b) => ring(b, c, 0.05, rng.range(2300, 2700) * k, 0.5));
  return out;
}

/** vanilla item/trident/pierce1-3: the prongs stabbing in, a sharp wet crunch over a thunk, and a short ring */
function hit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 0.55, (b) => thump(b, sr, { f0: rng.range(170, 210), f1: 80, tau: 0.04 }));
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.0008, tau: 0.02, bp: [rng.range(1100, 1500), 0.9] }));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: 0.002, dur: 0.05, attack: 0.0005, tau: 0.008, hp: 3000 }));
  layer(out, 0.5, (b) => ring(b, c, 0.004, rng.range(1600, 2100), 0.35));
  return out;
}

/** vanilla item/trident/ground_impact1-4: it bites into the ground and the shaft twangs, quivering */
function hitGround(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 0.9, (b) => thump(b, sr, { f0: rng.range(120, 150), f1: 70, tau: 0.04 }));
  layer(out, 0.75, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.001, tau: 0.02, bp: [rng.range(800, 1100), 0.8] }));
  // the quiver: a low twang wobbling as the shaft shakes
  layer(out, 0.8, (b) => {
    const f = rng.range(190, 240), wob = rng.range(9, 13);
    const n = Math.round(0.8 * sr);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += f / sr;
      ph2 += (f * 2.76) / sr;
      const e = Math.exp(-t / 0.22) * (0.65 + 0.35 * Math.cos(TAU * wob * t));
      b[i] += (Math.sin(TAU * ph) + 0.35 * Math.sin(TAU * ph2)) * e * Math.min(1, t / 0.004);
    }
  });
  layer(out, 0.45, (b) => ring(b, c, 0.003, rng.range(2000, 2600), 0.6));
  return out;
}

/** vanilla item/trident/return1-3: a swirling, rising hum as it wheels round and flies home */
function returnHome(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.3);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(300, 380);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 2.5 * (t / d) ** 1.5) * (1 + 0.12 * Math.sin(TAU * 7 * t)), q: 6, amp: (t) => envBump(t, d * 0.45, d * 0.55) }));
  layer(out, 0.5, (b) => {
    const n = Math.round(d * sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (f0 * 2 * (1 + 1.2 * (t / d))) / sr;
      b[i] += Math.sin(TAU * ph + 0.6 * Math.sin(TAU * 11 * t)) * envBump(t, d * 0.5, d * 0.5);
    }
  });
  return reverbHalf(out, sr, { t60: 0.8, wet: 0.35, dry: 1, size: 0.9, pre: 0.01, hf: 0.5, tail: 0.4 });
}

/** vanilla item/trident/riptide1-3: a surge of water and air, longer and fiercer for each level */
function riptide(level: number) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = 0.7 + 0.35 * level;
    const out = alloc(d + 0.3, sr);
    layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => envExpPts(t, [0, 300, d * 0.25, 1400 + 400 * level, d, 500]), q: 0.9, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' }));
    layer(out, 0.7, (b) => {
      const n = 25 + 20 * level;
      for (let i = 0; i < n; i++) {
        const t = rng.range(0, d * 0.85);
        bubble(b, sr, t, rng.range(350, 1300), rng.range(0.3, 1) * envBump(t, d * 0.15, d * 0.85));
      }
    });
    // (the churn under it)
    layer(out, 0.45, (b) => {
      const r = brown(Math.round(d * sr), rng, 0.995);
      lowpass(r, 500, sr);
      for (let i = 0; i < r.length; i++) b[i] += r[i] * envBump(i / sr, d * 0.1, d * 0.9);
    });
    highpass(out, 60, sr);
    return out;
  };
}

/** vanilla item/trident/thunder1-2: a searing electric crack and the thunder rolling after it */
function thunder(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(2.6, 3.2);
  const out = alloc(d, sr);
  layer(out, 1, (b) => {
    burst(b, sr, rng, { dur: 0.25, attack: 0.0005, tau: 0.03, hp: 900 });
    for (let k = 0; k < 6; k++) burst(b, sr, rng, { t: rng.range(0.005, 0.2), dur: 0.05, attack: 0.0005, tau: 0.008, hp: 2500, amp: rng.range(0.4, 0.9) });
  });
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: 0.35, f: (t) => 5000 * Math.exp(-t / 0.12) + 400, q: 3, amp: (t) => envAD(t, 0.002, 0.08) }));
  layer(out, 0.9, (b) => {
    const r = brown(b.length, rng, 0.998);
    lowpass(r, 240, sr);
    lowpass(r, 240, sr);
    for (let i = 0; i < r.length; i++) {
      const t = i / sr;
      b[i] += r[i] * Math.min(1, t / 0.08) * Math.exp(-t / (d * 0.3)) * (0.75 + 0.25 * Math.sin(TAU * 1.7 * t + 1));
    }
  });
  return reverbHalf(out, sr, { t60: 1.8, wet: 0.5, dry: 1, size: 1.5, pre: 0.015, hf: 0.35, tail: 1 });
}

export function tridentSounds(): Record<string, SoundGen> {
  return {
    'item.trident.throw': sound('item.trident.throw', 2, throwIt),
    'item.trident.hit': sound('item.trident.hit', 3, hit),
    'item.trident.hit_ground': sound('item.trident.hit_ground', 4, hitGround),
    'item.trident.return': sound('item.trident.return', 3, returnHome),
    'item.trident.riptide_1': sound('item.trident.riptide_1', 1, riptide(1)),
    'item.trident.riptide_2': sound('item.trident.riptide_2', 1, riptide(2)),
    'item.trident.riptide_3': sound('item.trident.riptide_3', 1, riptide(3)),
    'item.trident.thunder': sound('item.trident.thunder', 2, thunder, { hp: 25 }),
  };
}
