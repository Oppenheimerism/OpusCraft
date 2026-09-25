// What rides on a player's shoulders (vanilla Player's ShoulderEntityLeft / ShoulderEntityRight): kept as saved
// records while it's up there, brought back to life by whoever knows every kind (game/spawner.ts), and a parrot's
// chatter from up there (entity/parrot.ts). Its own module, so the player needn't import either.

import type { SavedEntity } from './mob';
import type { Entity } from './entity';
import type { Level } from '../game/level';

export const shoulderHooks: {
  /** the record back as an entity (not yet added to the level) */
  load: ((d: SavedEntity, level: Level) => Entity | null) | null;
  /** vanilla Player.playShoulderEntityAmbientSound, for the record of what sits on `e`'s shoulder */
  ambient: ((e: Entity, d: SavedEntity) => void) | null;
} = { load: null, ambient: null };
