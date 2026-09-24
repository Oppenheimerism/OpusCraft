// The outer End's advancements that are checked every tick: Great View From Up Here (vanilla ServerPlayer's
// levitationStartPos and CriteriaTriggers.LEVITATION: how far the player has floated from where a Levitation took
// hold, which sticks until the effect wears off).

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { PlayerAdvancements } from './advancements';

/**
 * vanilla ServerPlayer.levitationStartPos: set when Levitation is added (a longer or stronger one arriving on top of it
 * changes nothing), cleared when it's gone
 */
const levitationStart = new WeakMap<Player, number>();

export function tickOuterEndProgress(_level: Level, p: Player, adv: PlayerAdvancements): void {
  if (p.hasEffect('levitation')) {
    let y0 = levitationStart.get(p);
    if (y0 === undefined) levitationStart.set(p, (y0 = p.y));
    adv.trigger('levitation', { levitation: { dy: Math.abs(p.y - y0) } });
  } else levitationStart.delete(p);
}
