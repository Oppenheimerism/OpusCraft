// (cake) A candle pushed into a cake (vanilla block.cake.add_candle, three takes): a soft, damp squish of frosting and
// sponge giving way, a muffled thump, and a small knock of wax as it seats. The cake itself sounds as wool does, and
// eating it makes no sound (vanilla has none).

import { alloc, envBump, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, sweep, thump } from './texture';

function addCandle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const d = rng.range(0.08, 0.13);
  const f0 = rng.range(1200, 1600);
  layer(out, 0.7, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * Math.pow(0.45, t / d), q: 1.8, amp: (t) => envBump(t, d * 0.2, d * 0.8), color: 'pink' }));
  layer(out, 0.5, (b) => thump(b, sr, { t: 0.008, f0: rng.range(200, 240), f1: 140, tau: 0.03 }));
  layer(out, 0.28, (b) =>
    impact(b, sr, rng, { t: d * 0.8, modes: [rng.range(820, 980), 1, 0.02, 1750, 0.5, 0.012], noise: 0.4, noiseTau: 0.002, noiseBp: [2500, 1] }),
  );
  lowpass(out, 4200, sr);
  return out;
}

export function cakeSounds(): Record<string, ReturnType<typeof sound>> {
  return { 'block.cake.add_candle': sound('block.cake.add_candle', 3, addCandle) };
}
