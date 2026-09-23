// Enchanting table, anvil and grindstone sounds: vanilla block/enchantment_table/enchant1-3,
// random/anvil_use, random/anvil_land, random/anvil_break and block/grindstone/grindstone1-3.
// Like vanilla's sounds.json the anvil's break/step/hit/fall reuse the stone takes, and its
// place sound is the landing clang. They are scaled down here because the anvil's SoundType
// volume is 0.3: vanilla plays break/place at (0.3 + 1) / 2, hits at (0.3 + 1) / 8 and steps at
// 0.3 * 0.15, where this game plays every block at the stone volumes.

import type { SoundGen } from '../synth';
import { TAU, addOsc, alloc, brown, envBump, layer, lowpass } from './dsp';
import { type Ctx, FX_PEAK, pitched, sound } from './registry';
import { creak, impact, phisem, sweep, thump } from './texture';
import { reverbHalf } from './world';
import { blockSounds } from './blocks';

// ------------------------------------------------------------------ enchanting table

/** a swirl of breathy noise rising through resonant filters, a glassy chord and climbing sparkles, in a big room */
function enchant(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 2.1;
  const dry = alloc(L, sr);
  const root = [1046.5, 987.77, 1108.73][v % 3];
  layer(dry, 0.55, (b) => {
    for (let k = 0; k < 3; k++) {
      const f0 = rng.range(450, 800) * (1 + 0.55 * k);
      const f1 = f0 * rng.range(3, 4.5);
      const rise = rng.range(0.45, 0.75);
      const wob = rng.range(2.5, 5);
      sweep(b, sr, rng, {
        t: 0.03 * k,
        dur: 1.5,
        f: (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / rise)) * (1 + 0.07 * Math.sin(TAU * wob * t)),
        q: 7,
        amp: (t) => envBump(t, 0.28 + 0.06 * k, 1.0),
        color: 'pink',
      });
    }
  });
  layer(dry, 0.45, (b) => {
    for (const s of [0, 7, 12, 16, 19]) {
      const f = root * 0.5 * Math.pow(2, s / 12) * (1 + rng.range(-0.003, 0.003));
      const rate = rng.range(4, 7);
      const ph = rng.range(0, TAU);
      addOsc(b, sr, 0.04, L - 0.04, (t) => f * (1 + 0.0025 * Math.sin(TAU * rate * t)), (t) => envBump(t, 0.3, 1.45) * (0.75 + 0.25 * Math.sin(TAU * 0.5 * rate * t + ph)));
    }
  });
  layer(dry, 0.6, (b) => {
    const scale = [0, 2, 4, 7, 9];
    let t = 0.003;
    let step = rng.int(3);
    while (t < 1.15) {
      const f = root * Math.pow(2, (scale[step % 5] + 12 * Math.floor(step / 5)) / 12) * (rng.chance(0.25) ? 0.5 : 1);
      // the first chime rings out at once, the rest swell with the whoosh
      const a = (t < 0.01 ? 0.8 : envBump(t, 0.35, 0.95)) * rng.range(0.45, 1);
      impact(b, sr, rng, { t, modes: [f, a, rng.range(0.25, 0.5), f * 2.76, a * 0.3, 0.12, f * 5.4, a * 0.1, 0.05], jitter: 0.003 });
      t += rng.range(0.03, 0.085);
      step = (step + 1 + rng.int(2)) % 10;
    }
  });
  return reverbHalf(dry, sr, { t60: 1.7, hf: 0.5, wet: 0.75, dry: 1, tail: 1.1, pre: 0.015 });
}

// ------------------------------------------------------------------ anvil

/** steel ring of a struck anvil: [ratio, amp, t60] */
const ANVIL_RING = [1, 1, 1.15, 1.47, 0.62, 0.95, 2.09, 0.78, 0.75, 2.81, 0.5, 0.6, 3.62, 0.42, 0.42, 4.73, 0.3, 0.3, 6.1, 0.16, 0.2];

function ring(f: number, g: number, tl: number): number[] {
  const m: number[] = [];
  for (let i = 0; i < ANVIL_RING.length; i += 3) m.push(f * ANVIL_RING[i], ANVIL_RING[i + 1] * g, ANVIL_RING[i + 2] * tl);
  return m;
}

/** random/anvil_use: the hammer's bright clang, and its little rebound */
function anvilUse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.7, sr);
  const f = rng.range(1150, 1230);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { modes: ring(f, 1, 1), jitter: 0.004, noise: 1.4, noiseTau: 0.0015, noiseBp: [5200, 0.7] });
    impact(b, sr, rng, { t: rng.range(0.085, 0.11), modes: ring(f, 0.3, 0.6), jitter: 0.004, noise: 0.5, noiseTau: 0.001, noiseBp: [5200, 0.7] });
  });
  layer(out, 0.35, (b) => thump(b, sr, { f0: 420, f1: 380, tau: 0.05 }));
  return out;
}

/** random/anvil_land: the whole block slamming down, low and heavy, with grit under it */
function anvilLand(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.4, sr);
  const f = rng.range(440, 480);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 0.9, 0.75, f * 1.58, 0.8, 0.6, f * 2.24, 0.7, 0.5, f * 2.92, 0.55, 0.42, f * 3.83, 0.42, 0.3, f * 5.1, 0.3, 0.2, f * 6.7, 0.2, 0.12],
      jitter: 0.01,
      noise: 1.6,
      noiseTau: 0.005,
      noiseBp: [2400, 0.6],
    }),
  );
  layer(out, 0.5, (b) => thump(b, sr, { f0: 150, f1: 68, glide: 0.02, tau: 0.05, h2: 0.3 }));
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, {
      t: 0.003,
      dur: 0.25,
      rate: 1800,
      energy: (t) => Math.exp(-t / 0.05),
      grain: 0.0006,
      bands: [
        { f: 1800, q: 2, g: 1, spread: 0.3 },
        { f: 4200, q: 2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** random/anvil_break: the body cracking apart and the pieces clattering down */
function anvilBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.3, sr);
  const f = rng.range(380, 420);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 0.8, 0.35, f * 1.58, 0.75, 0.3, f * 2.24, 0.6, 0.25, f * 3.1, 0.45, 0.18, f * 4.4, 0.3, 0.12],
      jitter: 0.03,
      noise: 2.2,
      noiseTau: 0.012,
      noiseBp: [2000, 0.5],
    }),
  );
  layer(out, 0.55, (b) => thump(b, sr, { f0: 140, f1: 60, glide: 0.025, tau: 0.06, h2: 0.4 }));
  layer(out, 0.7, (b) => {
    let t = 0.05;
    while (t < 0.85) {
      const a = Math.exp(-t / 0.3) * rng.range(0.3, 1);
      const fp = rng.range(1300, 3200);
      impact(b, sr, rng, { t, modes: [fp, a, rng.range(0.08, 0.2), fp * 2.3, a * 0.6, 0.06, fp * 3.9, a * 0.3, 0.04], noise: a * 0.8, noiseTau: 0.001, noiseBp: [4000, 0.8] });
      t += rng.range(0.03, 0.12);
    }
  });
  layer(out, 0.4, (b) =>
    phisem(b, sr, rng, {
      dur: 0.5,
      rate: 2200,
      energy: (t) => Math.exp(-t / 0.12),
      grain: 0.0008,
      heavy: 2.2,
      bands: [
        { f: 1400, q: 1.8, g: 1, spread: 0.35 },
        { f: 3600, q: 2, g: 0.6, spread: 0.35 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ grindstone

/** the stone wheel spun against steel: gritty scraping in waves as it turns, a rumble and an axle creak */
function grindstone(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = [0.95, 1.1, 0.85][v % 3];
  const out = alloc(d + 0.05, sr);
  const rot = rng.range(9, 13);
  const env = (t: number) => Math.min(1, t / 0.06) * (t < d - 0.3 ? 1 : Math.max(0, (d - t) / 0.3));
  const fc = rng.range(2600, 3400);
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => fc * (1 + 0.12 * Math.sin(TAU * rot * t)),
      q: 1.3,
      amp: (t) => env(t) * (0.6 + 0.4 * Math.sin(TAU * rot * t)),
    }),
  );
  layer(out, 0.65, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 2600,
      energy: (t) => env(t) * (0.55 + 0.45 * Math.max(0, Math.sin(TAU * rot * t + 0.6))),
      grain: 0.0004,
      heavy: 2.2,
      bands: [
        { f: fc, q: 3, g: 1, spread: 0.25 },
        { f: fc * 1.9, q: 3, g: 0.7, spread: 0.25 },
        { f: fc * 0.5, q: 2, g: 0.4, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.45, (b) => {
    const r = brown(b.length, rng, 0.995);
    lowpass(r, 280, sr);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      b[i] = r[i] * env(t) * (0.7 + 0.3 * Math.sin(TAU * rot * t + 1));
    }
  });
  layer(out, 0.3, (b) =>
    creak(b, sr, rng, {
      dur: 0.35,
      rate: (t) => 55 - 60 * t,
      amp: (t) => envBump(t, 0.03, 0.3),
      jitter: 0.15,
      bands: [
        { f: 700, q: 6, g: 1 },
        { f: 1500, q: 7, g: 0.6 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ registry

export function enchantingSounds(): Record<string, SoundGen> {
  const stone = blockSounds();
  const scaled = (base: SoundGen, k: number) => pitched(base, 1, { peak: FX_PEAK * k });
  const land = sound('block.anvil.land', 1, anvilLand);
  return {
    'block.enchantment_table.use': sound('block.enchantment_table.use', 3, enchant),
    'block.anvil.use': sound('block.anvil.use', 1, anvilUse),
    'block.anvil.land': land,
    'block.anvil.destroy': sound('block.anvil.destroy', 1, anvilBreak),
    'block.anvil.place': scaled(land, 0.65),
    'block.anvil.break': scaled(stone['block.stone.break'], 0.65),
    'block.anvil.hit': scaled(stone['block.stone.hit'], 0.65),
    'block.anvil.step': scaled(stone['block.stone.step'], 0.3),
    'block.anvil.fall': scaled(stone['block.stone.step'], 0.3),
    'block.grindstone.use': sound('block.grindstone.use', 3, grindstone),
  };
}
