// (trial chambers) Minecraft: Trial(s) Edition: vanilla's location trigger, every 20 ticks, with
// LocationPredicate.inStructure: the player stands inside one of the pieces of a trial chambers.

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { PlayerAdvancements } from './advancements';
import { inTrialChambers } from './trialChamberStructure';

export function tickTrialChamberProgress(level: Level, p: Player, adv: PlayerAdvancements): void {
  if (level.gameTime % 20 === 0 && level.dim.id === 'overworld' && inTrialChambers(level.seed, p.x, p.y, p.z))
    adv.trigger('structure', { structures: ['trial_chambers'] });
}
