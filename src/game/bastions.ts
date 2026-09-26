// (bastions) Bastion remnants in the running game (the structure itself is world/gen/bastion.ts): /locate structure
// bastion_remnant, whether a block is inside one of a bastion's pieces (vanilla StructureManager
// .getStructureWithPieceAt, as the location predicate of "Those Were the Days" asks: checked every second, vanilla's
// location trigger), and the chests' loot tables (bastionLoot.ts). Laying a bastion out needs nothing but the seed and
// the Nether's biomes (its height is fixed and every piece is rigid), so the main thread works them out on its own,
// the same as the chunk workers do.

import { BastionRemnants } from '../world/gen/bastion';
import { worldSeed64 } from '../world/gen/jigsaw';
import type { BastionVariant } from '../world/gen/bastionTemplates';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { PlayerAdvancements } from './advancements';
import './bastionLoot';

let cached: { seed: string; bastions: BastionRemnants } | null = null;

/** the Nether's bastions for a level's world seed (sharing the level's fortresses: the two share their regions) */
export function bastionsOf(level: Level): BastionRemnants {
  const seed = String(level.seed);
  if (cached?.seed !== seed) cached = { seed, bastions: new BastionRemnants(worldSeed64(level.seed), level.fortresses()) };
  return cached.bastions;
}

/** vanilla /locate structure bastion_remnant: the corner of the nearest one's start chunk (rings of regions out) */
export function locateBastion(level: Level, x: number, z: number, variant: BastionVariant | null = null): [number, number] | null {
  return bastionsOf(level).nearest(x, z, 100, variant);
}

/** whether a block of the Nether is inside one of the pieces of a bastion */
export function inBastion(level: Level, x: number, y: number, z: number): boolean {
  return bastionsOf(level).pieceAt(Math.floor(x), Math.floor(y), Math.floor(z));
}

/** vanilla's location trigger, every 20 ticks: "Those Were the Days" when the player stands in a bastion */
export function tickBastionProgress(level: Level, p: Player, adv: PlayerAdvancements): void {
  if (level.gameTime % 20 === 0 && level.dim.id === 'the_nether' && inBastion(level, p.x, p.y, p.z))
    adv.trigger('structure', { structures: ['bastion_remnant'] });
}
