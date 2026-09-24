// The redstone components' sounds. Most are vanilla's shared samples under their own event names (sounds.json):
// the torch burning out is random/fizz, the dispenser's and tripwire's clicks are random/click, the dispenser's
// launch is random/bow and the tripwire snapping is random/bowhit; each is played at its own pitch.

import type { SoundGen } from '../synth';

export function redstoneSounds(base: Record<string, SoundGen>): Record<string, SoundGen> {
  const click = base['block.lever.click'], bow = base['entity.arrow.shoot'], bowhit = base['entity.arrow.hit'];
  return {
    'block.redstone_torch.burnout': base['block.fire.extinguish'],
    'block.dispenser.dispense': click,
    'block.dispenser.fail': click,
    'block.dispenser.launch': bow,
    'block.tripwire.attach': click,
    'block.tripwire.click_on': click,
    'block.tripwire.click_off': click,
    'block.tripwire.detach': bowhit,
  };
}
