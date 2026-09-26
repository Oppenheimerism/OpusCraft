// The ocean (Stage 5), gathered here so the level loads it with one import: sponges and sea lanterns (./sponge), the
// buckets of fish (./fishBuckets), the wrecks', ruins' and buried treasure's loot (./oceanLoot), treasure and explorer
// maps (./treasureMaps), the conduit (./conduit), the turtle eggs (./turtleEggs), and the elder guardian's curse as
// the player meets it.

import './sponge';
import './fishBuckets';
import './oceanLoot';
import './treasureMaps';
import './conduit';
import './turtleEggs';
import type { Level } from './level';
import { guardianHooks } from '../entity/guardian';

/**
 * vanilla ClientboundGameEventPacket.GUARDIAN_ELDER_EFFECT as the client takes it: the elder guardian's ghostly face
 * (a MobAppearanceParticle: render/oceanRenderers.ts draws it for 30 ticks from `start`) and its moan
 */
export const elderAppearance: { level: Level | null; start: number } = { level: null, start: -1 };

guardianHooks.elderCurse = (p) => {
  // (sent to the cursed player alone: the face on this game's own screen only)
  if (p === p.level.player) {
    elderAppearance.level = p.level;
    elderAppearance.start = p.level.gameTime;
  }
  p.level.playSoundTo(p, 'entity.elder_guardian.curse', p.x, p.y, p.z, 1, 1);
};
