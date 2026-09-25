// The outer End's advancements that are checked every tick: Great View From Up Here (vanilla ServerPlayer's
// levitationStartPos and CriteriaTriggers.LEVITATION: how far the player has floated from where a Levitation took
// hold, which sticks until the effect wears off), and The City at the End of the Game (vanilla's location trigger,
// every 20 ticks: inside a piece of an end city).

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { PlayerAdvancements } from './advancements';
import { inEndCity } from './endCities';

/**
 * vanilla ServerPlayer.levitationStartPos: set when Levitation is added (a longer or stronger one arriving on top of it
 * changes nothing), cleared when it's gone
 */
const levitationStart = new WeakMap<Player, number>();

export function tickOuterEndProgress(level: Level, p: Player, adv: PlayerAdvancements): void {
  if (level.gameTime % 20 === 0 && level.dim.id === 'the_end' && inEndCity(level.seed, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))
    adv.trigger('structure', { structures: ['end_city'] });
  if (p.hasEffect('levitation')) {
    let y0 = levitationStart.get(p);
    if (y0 === undefined) levitationStart.set(p, (y0 = p.y));
    adv.trigger('levitation', { levitation: { dy: Math.abs(p.y - y0) } });
  } else levitationStart.delete(p);
}
