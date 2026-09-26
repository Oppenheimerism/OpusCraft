// The redstone components' sounds. Most are vanilla's shared samples under their own event names (sounds.json):
// the torch burning out is random/fizz, the dispenser's, comparator's and tripwire's clicks are random/click, the dispenser's
// launch is random/bow and the tripwire snapping is random/bowhit; each is played at its own pitch. A bottle o'
// enchanting is thrown with random/bow too. The pistons have their own (tile/piston/out and in), made here.

import type { SoundGen } from '../synth';
import { sound, type Ctx } from './registry';
import { alloc, layer } from './dsp';
import { impact, burst, thump } from './texture';

/** vanilla tile/piston/out: a short rush of air as the head shoots out, then the knock of it hitting home */
function pistonOut(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 0.45, (b) => burst(b, sr, rng, { dur: 0.09, attack: 0.03, tau: 0.025, bp: [1700, 1.1] }));
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t: 0.045,
      modes: [230, 1, 0.07, 510, 0.7, 0.05, 960, 0.45, 0.035, 1720, 0.25, 0.022, 2900, 0.12, 0.012],
      jitter: 0.03,
      noise: 1,
      noiseTau: 0.003,
      noiseBp: [2300, 0.9],
    }),
  );
  layer(out, 0.6, (b) => thump(b, sr, { t: 0.045, f0: 135, f1: 80, tau: 0.05 }));
  return out;
}

/** vanilla tile/piston/in: the knock of the head pulled back in, and the little suck of air after it */
function pistonIn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [200, 1, 0.08, 440, 0.65, 0.055, 870, 0.4, 0.035, 1580, 0.22, 0.02],
      jitter: 0.03,
      noise: 0.9,
      noiseTau: 0.0035,
      noiseBp: [1900, 0.9],
    }),
  );
  layer(out, 0.6, (b) => thump(b, sr, { f0: 115, f1: 70, tau: 0.055 }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.03, dur: 0.1, attack: 0.02, tau: 0.035, bp: [1150, 1] }));
  return out;
}

export function redstoneSounds(base: Record<string, SoundGen>): Record<string, SoundGen> {
  const click = base['block.lever.click'], bow = base['entity.arrow.shoot'], bowhit = base['entity.arrow.hit'];
  return {
    'block.redstone_torch.burnout': base['block.fire.extinguish'],
    'block.comparator.click': click,
    'block.dispenser.dispense': click,
    'block.dispenser.fail': click,
    'block.dispenser.launch': bow,
    'block.tripwire.attach': click,
    'block.tripwire.click_on': click,
    'block.tripwire.click_off': click,
    'block.tripwire.detach': bowhit,
    'entity.experience_bottle.throw': bow,
    'block.piston.extend': sound('block.piston.extend', 1, pistonOut),
    'block.piston.contract': sound('block.piston.contract', 1, pistonIn),
  };
}
