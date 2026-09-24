// The job sites' menu sounds: vanilla ui/stonecutter/cut1-2 (a block sawn through) and the click of picking a
// recipe, ui/cartography_table/drawmap1-3 (pencil on paper), ui/loom/select_pattern1-5 and take_result1-2 (thread and
// the beater), block/smithing_table/smithing_table1-3 (a hammer on the anvil plate).

import type { SoundGen } from '../synth';
import { alloc, layer, envBump } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, thump, phisem, burst, sweep, ticks } from './texture';

// ------------------------------------------------------------------ stonecutter

/** the saw bites into the block: gritty stone dust under a blade's rising whine, and the blade ringing clear at the end */
function stonecutterCut(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = v === 0 ? 0.36 : 0.42;
  const out = alloc(d + 0.35, sr);
  const en = (t: number) => envBump(t, 0.035, d - 0.035);
  layer(out, 0.8, (b) =>
    phisem(b, sr, rng, {
      dur: d, rate: 14000, energy: en, grain: 0.0005, heavy: 1.8,
      bands: [{ f: 2600, q: 1.4, g: 1, spread: 0.3 }, { f: 5200, q: 1.6, g: 0.8, spread: 0.25 }, { f: 9000, q: 1.2, g: 0.4, spread: 0.2 }],
    }),
  );
  const f0 = v === 0 ? 3100 : 2850;
  layer(out, 0.55, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 0.35 * (t / d)), q: 14, amp: en }));
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 2 * f0 * (1 + 0.35 * (t / d)), q: 18, amp: en }));
  layer(out, 0.35, (b) =>
    impact(b, sr, rng, { t: d * 0.85, modes: [f0 * 1.3, 0.6, 0.22, f0 * 2.05, 0.4, 0.15, f0 * 2.9, 0.25, 0.1], jitter: 0.02 }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: d, attack: 0.02, tau: d, lp: 500, color: 'brown', env: en }));
  return out;
}

/** picking a recipe: a small dry tick */
function stonecutterSelect(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.08, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [2300, 1, 0.012, 3900, 0.5, 0.008, 6100, 0.25, 0.005], noise: 0.6, noiseTau: 0.0008, noiseBp: [4000, 0.8] }));
  return out;
}

// ------------------------------------------------------------------ cartography table

/** a map drawn: quick pencil strokes scratching over paper */
function drawMap(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const strokes = 3 + rng.int(3);
  const out = alloc(0.95, sr);
  let t = 0.01;
  for (let k = 0; k < strokes; k++) {
    const len = rng.range(0.07, 0.15);
    const f = rng.range(3200, 4800);
    const a = rng.range(0.55, 1);
    layer(out, a, (b) =>
      phisem(b, sr, rng, {
        t, dur: len, rate: 9000, energy: (x) => envBump(x, len * 0.25, len * 0.75), grain: 0.00035, heavy: 2,
        bands: [{ f, q: 1.8, g: 1, spread: 0.2 }, { f: f * 1.9, q: 1.5, g: 0.5, spread: 0.2 }, { f: 1800, q: 1.2, g: 0.25 }],
      }),
    );
    t += len + rng.range(0.015, 0.06);
    if (t > 0.8) break;
  }
  return out;
}

// ------------------------------------------------------------------ loom

/** a pattern picked: threads shifting on the frame, a light knock of wood */
function loomSelect(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.14, 0.22);
  const out = alloc(d + 0.08, sr);
  layer(out, 0.8, (b) =>
    phisem(b, sr, rng, {
      dur: d, rate: 5000, energy: (t) => envBump(t, d * 0.3, d * 0.7), grain: 0.0009, heavy: 2.2,
      bands: [{ f: 1900, q: 1.3, g: 1, spread: 0.3 }, { f: 3600, q: 1.4, g: 0.6, spread: 0.3 }],
    }),
  );
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: rng.range(0, d * 0.5), modes: [rng.range(700, 900), 1, 0.03, rng.range(1500, 1900), 0.5, 0.02], noise: 0.5, noiseTau: 0.001, noiseBp: [2000, 0.8] }));
  return out;
}

/** the banner woven: the beater knocks the weft home and the cloth swishes off the frame */
function loomTake(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [260, 1, 0.07, 610, 0.7, 0.05, 1180, 0.4, 0.03, 2100, 0.2, 0.02], jitter: 0.04, noise: 0.8, noiseTau: 0.002, noiseBp: [1400, 0.8] }));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 150, f1: 95, tau: 0.04 }));
  layer(out, 0.55, (b) => sweep(b, sr, rng, { t: 0.06, dur: 0.4, f: (t) => 900 + 2600 * t, q: 1.2, amp: (t) => envBump(t, 0.1, 0.3), color: 'pink' }));
  return out;
}

// ------------------------------------------------------------------ smithing table

/** the smith's hammer on the plate: two bright clinks and the ring of the metal between */
function smithingUse(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.9, sr);
  const f = [1850, 2050, 1700][v];
  const hit = (t: number, a: number) =>
    layer(out, a, (b) =>
      impact(b, sr, rng, {
        t, modes: [f, 1, 0.45, f * 1.52, 0.65, 0.32, f * 2.21, 0.45, 0.22, f * 3.05, 0.28, 0.14, f * 4.3, 0.12, 0.08],
        jitter: 0.01, noise: 0.9, noiseTau: 0.0012, noiseBp: [5000, 0.7],
      }),
    );
  hit(0, 1);
  hit(rng.range(0.16, 0.22), 0.65);
  // (the table's wooden body under it)
  layer(out, 0.3, (b) => thump(b, sr, { f0: 180, f1: 120, tau: 0.03 }));
  layer(out, 0.12, (b) => ticks(b, sr, rng, { dur: 0.3, rate: 30, energy: (t) => Math.exp(-t / 0.1), f: [3000, 6000], t60: [0.01, 0.03] }));
  return out;
}

export function jobSiteSounds(): Record<string, SoundGen> {
  return {
    'ui.stonecutter.take_result': sound('ui.stonecutter.take_result', 2, stonecutterCut),
    'ui.stonecutter.select_recipe': sound('ui.stonecutter.select_recipe', 1, stonecutterSelect),
    'ui.cartography_table.take_result': sound('ui.cartography_table.take_result', 3, drawMap),
    'ui.loom.select_pattern': sound('ui.loom.select_pattern', 5, loomSelect),
    'ui.loom.take_result': sound('ui.loom.take_result', 2, loomTake),
    'block.smithing_table.use': sound('block.smithing_table.use', 3, smithingUse),
  };
}
