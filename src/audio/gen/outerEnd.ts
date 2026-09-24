// The outer End's sounds: a chorus flower growing (vanilla block.chorus_flower.grow, four takes) and dying
// (block.chorus_flower.death, three takes); a shulker box opening and shutting (block.shulker_box.open, .close). (Chorus fruit teleports with the enderman's portal samples, as in
// vanilla's sounds.json: soundManager's aliases.)

import type { SoundGen } from '../synth';
import { TAU, addOsc, alloc, envAD, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, bubble, impact, phisem, sweep, thump } from './texture';
import { reverbHalf } from './world';

/**
 * A flower growing: a soft wet pop as it swells, a hollow rising "bloop" with a woody knock under it, and a faint
 * glassy shimmer of the End over the top.
 */
function flowerGrow(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 0.8;
  const out = alloc(L, sr);
  const f0 = [260, 300, 235, 280][v % 4] * rng.range(0.96, 1.04);
  // the bloop: a rounded tone gliding up an octave and a bit
  layer(out, 1, (b) => {
    for (const [m, g] of [[1, 1], [2, 0.28], [3.01, 0.08]] as const)
      addOsc(b, sr, 0.01, 0.42, (t) => f0 * m * (1 + 1.25 * (1 - Math.exp(-t / 0.07))), (t) => g * envBump(t, 0.02, 0.3));
  });
  // the pop of it swelling
  layer(out, 0.45, (b) => {
    bubble(b, sr, 0.004, f0 * 3.2, 1, 0.018, 0.5);
    bubble(b, sr, 0.03 + rng.range(0, 0.03), f0 * 4.4, 0.6, 0.012, 0.6);
  });
  layer(out, 0.35, (b) => thump(b, sr, { f0: 190, f1: 120, glide: 0.03, tau: 0.045, attack: 0.002, h2: 0.25 }));
  layer(out, 0.22, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.004, tau: 0.02, bp: [1400, 0.9] }));
  // the shimmer
  layer(out, 0.12, (b) => {
    const root = [1318.5, 1479.98, 1174.66, 1396.91][v % 4];
    const ph = rng.range(0, TAU);
    for (const [m, g] of [[1, 1], [1.5, 0.5]] as const) addOsc(b, sr, 0.05, L - 0.08, (t) => root * m * (1 + 0.004 * Math.sin(TAU * 6 * t + ph)), (t) => g * envBump(t, 0.06, 0.55));
  });
  return reverbHalf(out, sr, { t60: 0.6, hf: 0.5, wet: 0.3, dry: 1, tail: 0.35, pre: 0.01 });
}

/**
 * A flower dying: a dry, papery crackle as it withers, over a hollow tone sinking away, and a soft dull thud.
 */
function flowerDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 0.9;
  const out = alloc(L, sr);
  const f0 = [420, 380, 460][v % 3] * rng.range(0.96, 1.04);
  layer(out, 0.9, (b) => {
    for (const [m, g] of [[1, 1], [1.98, 0.35], [2.97, 0.12]] as const)
      addOsc(b, sr, 0.005, 0.6, (t) => f0 * m * Math.pow(0.42, Math.min(1, t / 0.5)), (t) => g * envAD(t, 0.012, 0.16));
  });
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      dur: 0.55,
      rate: 900,
      energy: (t) => envAD(t, 0.01, 0.14),
      grain: 0.0012,
      heavy: 3,
      bands: [{ f: 2600, q: 1.4, g: 1, spread: 0.3 }, { f: 5200, q: 1.8, g: 0.5, spread: 0.25 }, { f: 1300, q: 1.1, g: 0.4, spread: 0.2 }],
    }),
  );
  layer(out, 0.4, (b) => thump(b, sr, { f0: 150, f1: 85, glide: 0.04, tau: 0.06, attack: 0.002 }));
  layer(out, 0.3, (b) =>
    sweep(b, sr, rng, {
      t: 0.01,
      dur: 0.5,
      f: (t) => 2200 * Math.pow(500 / 2200, Math.min(1, t / 0.45)),
      q: 1.6,
      amp: (t) => envAD(t, 0.02, 0.12),
      color: 'pink',
    }),
  );
  return reverbHalf(out, sr, { t60: 0.55, hf: 0.45, wet: 0.28, dry: 1, tail: 0.3, pre: 0.01 });
}

/** a shulker's shell: hollow, a little glassy (its body's ring, [f, amp, t60]) */
const SHELL = [230, 1, 0.16, 520, 0.7, 0.11, 890, 0.45, 0.08, 1480, 0.25, 0.05, 2350, 0.12, 0.03];

/**
 * A shulker box opening: the lid comes unstuck from the rim with a soft hollow knock, and slides up and round with a
 * breathy rising hiss over the shell's ring.
 */
function boxOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: SHELL, jitter: 0.03, noise: 0.6, noiseTau: 0.004, noiseBp: [900, 0.8] }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 170, f1: 120, glide: 0.02, tau: 0.035, h2: 0.3 }));
  layer(out, 0.5, (b) =>
    sweep(b, sr, rng, {
      t: 0.03,
      dur: 0.42,
      f: (t) => 700 * Math.pow(2600 / 700, Math.min(1, t / 0.36)),
      q: 2.2,
      amp: (t) => envBump(t, 0.12, 0.28),
      color: 'pink',
    }),
  );
  layer(out, 0.3, (b) => impact(b, sr, rng, { t: 0.36, modes: SHELL.map((v, i) => (i % 3 === 0 ? v * 1.12 : v)), jitter: 0.03, noise: 0.3, noiseTau: 0.003, noiseBp: [1500, 0.8] }));
  return reverbHalf(out, sr, { t60: 0.45, hf: 0.5, wet: 0.2, dry: 1, tail: 0.25, pre: 0.008 });
}

/** A shulker box shutting: the lid sliding down and round, then seating on the rim with a firm hollow clunk. */
function boxClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const hit = 0.3;
  layer(out, 0.4, (b) =>
    sweep(b, sr, rng, {
      dur: hit + 0.02,
      f: (t) => 2200 * Math.pow(600 / 2200, Math.min(1, t / hit)),
      q: 2,
      amp: (t) => envBump(t, 0.1, hit - 0.08),
      color: 'pink',
    }),
  );
  layer(out, 1, (b) => impact(b, sr, rng, { t: hit, modes: SHELL.map((v, i) => (i % 3 === 0 ? v * 0.9 : v)), jitter: 0.03, noise: 0.8, noiseTau: 0.005, noiseBp: [700, 0.8] }));
  layer(out, 0.6, (b) => thump(b, sr, { t: hit, f0: 150, f1: 95, glide: 0.025, tau: 0.05, h2: 0.3 }));
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: hit, dur: 0.06, attack: 0.002, tau: 0.012, bp: [2400, 1] }));
  return reverbHalf(out, sr, { t60: 0.45, hf: 0.5, wet: 0.2, dry: 1, tail: 0.25, pre: 0.008 });
}

export function outerEndSounds(): Record<string, SoundGen> {
  return {
    'block.chorus_flower.grow': sound('block.chorus_flower.grow', 4, flowerGrow, { fadeOut: 0.15 }),
    'block.chorus_flower.death': sound('block.chorus_flower.death', 3, flowerDeath, { fadeOut: 0.15 }),
    'block.shulker_box.open': sound('block.shulker_box.open', 1, boxOpen, { fadeOut: 0.1 }),
    'block.shulker_box.close': sound('block.shulker_box.close', 1, boxClose, { fadeOut: 0.1 }),
  };
}
