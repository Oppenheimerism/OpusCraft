// (ender chests) The ender chest's lid (vanilla block.ender_chest.open and .close): a slab of obsidian grinding up off
// its seat with a breath of air drawn in after it and a hollow, shimmering hum from whatever is inside; and going down
// again, the air let out and the stone set down with a heavy knock, the hum dying under it. The block itself sounds as
// stone does.

import { TAU, alloc, addOsc, envBump, layer, lowpass, reverb } from './dsp';
import { type Ctx, sound } from './registry';
import { creak, impact, sweep, thump } from './texture';

/** the stone's grain: low, gritty resonances for the grinding lid */
const STONE_BODY = [
  { f: 190, q: 4, g: 1 },
  { f: 430, q: 5, g: 0.7 },
  { f: 870, q: 6, g: 0.4 },
  { f: 1650, q: 5, g: 0.2 },
];

/** the hum from inside: a hollow chord of fifths, drifting `bend` of the way (up opening, down shutting) */
function hum(out: Float32Array, c: Ctx, t0: number, dur: number, base: number, bend: number, attack: number): void {
  const { sr, rng } = c;
  const vib = rng.range(4.5, 6);
  for (const [ratio, a] of [[1, 1], [1.5, 0.6], [2, 0.45], [3, 0.18]] as const) {
    const f0 = base * ratio * rng.range(0.995, 1.005);
    addOsc(out, sr, t0, dur, (t) => f0 * (1 + bend * Math.min(1, t / dur)) * (1 + 0.006 * Math.sin(TAU * vib * t)), (t) => a * envBump(t, attack, dur - attack));
  }
}

function enderOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.6, sr);
  const gd = rng.range(0.38, 0.46);
  // the lid grinding up
  layer(out, 0.55, (b) =>
    creak(b, sr, rng, { t: 0.01, dur: gd, rate: (t) => 70 + 50 * (t / gd), amp: (t) => envBump(t, gd * 0.2, gd * 0.8), jitter: 0.35, bands: STONE_BODY }),
  );
  layer(out, 0.35, (b) => sweep(b, sr, rng, { t: 0.01, dur: gd, f: (t) => 350 + 500 * (t / gd), q: 1.4, amp: (t) => envBump(t, gd * 0.25, gd * 0.75), color: 'pink' }));
  // air drawn in behind it
  const wd = rng.range(0.55, 0.7);
  layer(out, 0.4, (b) => sweep(b, sr, rng, { t: 0.08, dur: wd, f: (t) => 500 * Math.pow(6, t / wd), q: 2.5, amp: (t) => envBump(t, wd * 0.55, wd * 0.45) }));
  // and the hum
  layer(out, 0.5, (b) => hum(b, c, 0.12, 0.95, rng.range(205, 225), 0.06, 0.3));
  lowpass(out, 6000, sr);
  return reverb(out, sr, { t60: 1.3, wet: 0.45, pre: 0.02, hf: 0.4 });
}

function enderClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.1, sr);
  // air let out as it comes down
  const wd = rng.range(0.2, 0.26);
  layer(out, 0.4, (b) => sweep(b, sr, rng, { dur: wd, f: (t) => 2600 * Math.pow(0.18, t / wd), q: 2.2, amp: (t) => envBump(t, wd * 0.4, wd * 0.6) }));
  // the hum sinking under it
  layer(out, 0.3, (b) => hum(b, c, 0, 0.5, rng.range(190, 205), -0.08, 0.05));
  // the stone set down: a heavy, dull knock
  const t = wd * 0.9;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t,
      modes: [150, 1, 0.1, 330, 0.6, 0.07, 640, 0.35, 0.05, 1150, 0.2, 0.03, 2000, 0.08, 0.02],
      jitter: 0.03,
      noise: 0.7,
      noiseTau: 0.004,
      noiseBp: [900, 0.8],
    }),
  );
  layer(out, 0.6, (b) => thump(b, sr, { t, f0: 95, f1: 55, tau: 0.05 }));
  lowpass(out, 5000, sr);
  return reverb(out, sr, { t60: 0.9, wet: 0.35, pre: 0.015, hf: 0.4 });
}

export function enderChestSounds(): Record<string, ReturnType<typeof sound>> {
  return {
    'block.ender_chest.open': sound('block.ender_chest.open', 1, enderOpen),
    'block.ender_chest.close': sound('block.ender_chest.close', 1, enderClose),
  };
}
