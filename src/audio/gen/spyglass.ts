// (spyglass) The spyglass's two sounds (vanilla item.spyglass.use and item.spyglass.stop_using, one take each): raised
// to the eye, its brass tube slides out with a rising metallic hiss and seats with a small bright clink; lowered, it
// slides shut, the hiss falling, and closes with a duller knock.

import { alloc, envBump, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, sweep, thump } from './texture';

/** the tube sliding: noise through a narrow band sweeping from `f0` to `f1` over `d` seconds */
function slide(out: Float32Array, c: Ctx, d: number, f0: number, f1: number, peak: number): void {
  const { sr, rng } = c;
  layer(out, peak, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * Math.pow(f1 / f0, t / d), q: 6, amp: (t) => envBump(t, d * 0.35, d * 0.65), color: 'pink' }));
  // (and the rub of metal on metal under it, a wider band)
  layer(out, peak * 0.45, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 0.5 * f0 * Math.pow(f1 / f0, t / d), q: 1.4, amp: (t) => envBump(t, d * 0.3, d * 0.7) }));
}

function use(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const d = rng.range(0.16, 0.2);
  slide(out, c, d, 1700, 4200, 0.55);
  // seated: a bright clink of brass, inharmonic
  const f = rng.range(2500, 2800);
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: d * 0.92, modes: [f, 1, 0.12, f * 1.71, 0.55, 0.08, f * 2.63, 0.3, 0.05], noise: 0.35, noiseTau: 0.0015, noiseBp: [6000, 1.2] }));
  return out;
}

function stopUsing(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const d = rng.range(0.13, 0.16);
  slide(out, c, d, 3600, 1400, 0.5);
  // shut: a duller knock, the tube's body under it
  const f = rng.range(1500, 1700);
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: d * 0.9, modes: [f, 1, 0.06, f * 1.83, 0.4, 0.04], noise: 0.5, noiseTau: 0.002, noiseBp: [3500, 1] }));
  layer(out, 0.3, (b) => thump(b, sr, { t: d * 0.9, f0: 320, f1: 220, tau: 0.02 }));
  lowpass(out, 7000, sr);
  return out;
}

export function spyglassSounds(): Record<string, ReturnType<typeof sound>> {
  return {
    'item.spyglass.use': sound('item.spyglass.use', 1, use),
    'item.spyglass.stop_using': sound('item.spyglass.stop_using', 1, stopUsing),
  };
}
