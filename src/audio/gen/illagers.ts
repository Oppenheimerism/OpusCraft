// The sounds of the shield, the illagers and their raids.
// The shield (vanilla item.shield.block, item/shield/block1-5): a blow landing on the boards, a heavy wooden thud
// with the iron rim's clank in it. (item.shield.break is vanilla's random/break, the item-break sound: aliased in
// soundManager.)

import type { SoundGen } from '../synth';
import { alloc, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, thump } from './texture';

/** vanilla item/shield/block1-5: the blow on the boards, the wood's knock, the rim's short clank */
function shieldBlock(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.42, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(150, 185), f1: rng.range(85, 105), tau: 0.045, h2: 0.3 }));
  // the boards: a hollow knock
  layer(out, 0.8, (b) => impact(b, sr, rng, { modes: [rng.range(420, 520), 1, 0.05, rng.range(690, 820), 0.6, 0.035, rng.range(1150, 1350), 0.3, 0.02], jitter: 0.02, noise: 0.5, noiseTau: 0.004, noiseBp: [900, 1.1] }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.0006, tau: 0.012, bp: [rng.range(1300, 1800), 0.9] }));
  // the rim: iron, briefly
  layer(out, 0.28, (b) => impact(b, sr, rng, { t: 0.002, modes: [rng.range(2300, 2700), 1, 0.09, rng.range(3500, 3900), 0.5, 0.06, rng.range(5200, 5800), 0.25, 0.04], jitter: 0.01 }));
  return out;
}

export function illagerSounds(): Record<string, SoundGen> {
  return {
    'item.shield.block': sound('item.shield.block', 5, shieldBlock),
  };
}
