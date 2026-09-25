// The crafter's sounds (1.21; vanilla SoundEvents.CRAFTER_CRAFT and CRAFTER_FAIL, played by level events 1049 and
// 1050 at full volume and pitch). Made here from scratch: a craft is a quick whirr of gear teeth, a sliding latch and
// the solid clunk of the mechanism slamming home, with a puff of air as the item goes out; a failure is the same
// mechanism starting, catching on nothing and knocking dully back.

import type { SoundGen } from '../synth';
import { sound, type Ctx } from './registry';
import { alloc, layer } from './dsp';
import { impact, burst, thump, ticks } from './texture';

/** block.crafter.craft: gears, a latch, a clunk and a puff */
function craft(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.5, sr);
  const whirr = 0.1 + v * 0.015; // how long the gears run before the clunk
  // the gears: fast, bright ticks of metal teeth speeding up
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, {
      dur: whirr,
      rate: 190,
      energy: (t) => 0.45 + 0.55 * (t / whirr),
      f: [1500, 2900],
      t60: [0.012, 0.03],
      ratios: [1, 2.21, 3.4],
      weights: [1, 0.45, 0.2],
      heavy: 1.5,
      click: 0.6,
    }),
  );
  // a sliding latch under them
  layer(out, 0.18, (b) => burst(b, sr, rng, { t: 0.02, dur: whirr, attack: whirr * 0.6, tau: 0.03, bp: [3200 + v * 250, 1.6] }));
  // the clunk: iron and wood struck together
  const t = whirr + 0.01;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t,
      modes: [250, 1, 0.08, 610, 0.75, 0.06, 1180, 0.5, 0.045, 2130, 0.3, 0.03, 3460, 0.14, 0.018],
      jitter: 0.04,
      noise: 1.1,
      noiseTau: 0.003,
      noiseBp: [2600, 0.9],
    }),
  );
  layer(out, 0.55, (b) => thump(b, sr, { t, f0: 150, f1: 85, tau: 0.045 }));
  // the item pushed out: a short breath of air
  layer(out, 0.22, (b) => burst(b, sr, rng, { t: t + 0.015, dur: 0.14, attack: 0.02, tau: 0.04, bp: [1300, 0.8] }));
  return out;
}

/** block.crafter.fail: the mechanism catches and knocks back, duller and lower */
function fail(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.4, sr);
  layer(out, 0.25, (b) =>
    ticks(b, sr, rng, {
      dur: 0.05,
      rate: 160,
      energy: () => 1,
      f: [900, 1700],
      t60: [0.01, 0.025],
      heavy: 1.5,
      click: 0.5,
    }),
  );
  const t = 0.05 + v * 0.01;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t,
      modes: [190, 1, 0.05, 430, 0.6, 0.035, 870, 0.3, 0.02, 1650, 0.12, 0.012],
      jitter: 0.05,
      noise: 0.8,
      noiseTau: 0.004,
      noiseBp: [1500, 0.8],
    }),
  );
  layer(out, 0.6, (b) => thump(b, sr, { t, f0: 120, f1: 70, tau: 0.04 }));
  return out;
}

export function crafterSounds(): Record<string, SoundGen> {
  return {
    'block.crafter.craft': sound('block.crafter.craft', 3, craft),
    'block.crafter.fail': sound('block.crafter.fail', 2, fail),
  };
}
