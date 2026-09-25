// Woodland mansions in the running game (the structure itself is world/gen/mansion.ts): /locate structure mansion,
// and the loot of the mansion's chests. Whether a mansion stands in a region needs the terrain (none is built where
// the ground is below y 60), so the Overworld's generator is made on the main thread the first time one is looked
// for, as the temples' is.

import { ChunkGenerator } from '../world/gen/generator';
import type { WoodlandMansions } from '../world/gen/mansion';
import { LOOT_TABLES } from './loot';

/** vanilla loot_table/chests/woodland_mansion ('' is its empty entry; items the game doesn't have yet roll nothing) */
LOOT_TABLES['chests/woodland_mansion'] = [
  {
    rolls: [1, 3],
    entries: [
      { item: 'lead', weight: 20 }, { item: 'golden_apple', weight: 15 }, { item: 'enchanted_golden_apple', weight: 2 }, { item: 'music_disc_13', weight: 15 },
      { item: 'music_disc_cat', weight: 15 }, { item: 'name_tag', weight: 20 }, { item: 'chainmail_chestplate', weight: 10 }, { item: 'diamond_hoe', weight: 15 },
      { item: 'diamond_chestplate', weight: 5 }, { item: 'book', weight: 10, enchant: true },
    ],
  },
  {
    rolls: [1, 4],
    entries: [
      { item: 'iron_ingot', weight: 10, count: [1, 4] }, { item: 'gold_ingot', weight: 5, count: [1, 4] }, { item: 'bread', weight: 20 }, { item: 'wheat', weight: 20, count: [1, 4] },
      { item: 'bucket', weight: 10 }, { item: 'redstone', weight: 15, count: [1, 4] }, { item: 'coal', weight: 15, count: [1, 4] },
      { item: 'melon_seeds', weight: 10, count: [2, 4] }, { item: 'pumpkin_seeds', weight: 10, count: [2, 4] }, { item: 'beetroot_seeds', weight: 10, count: [2, 4] },
    ],
  },
  {
    rolls: 3,
    entries: [
      { item: 'bone', weight: 10, count: [1, 8] }, { item: 'gunpowder', weight: 10, count: [1, 8] }, { item: 'rotten_flesh', weight: 10, count: [1, 8] },
      { item: 'string', weight: 10, count: [1, 8] },
    ],
  },
  { rolls: 1, entries: [{ item: '', weight: 1 }, { item: 'vex_armor_trim_smithing_template', weight: 1, count: [2, 2] }] },
];

let cached: { seed: string; mansions: WoodlandMansions } | null = null;

/** the Overworld's woodland mansions for a world seed */
export function mansionsFor(seed: string): WoodlandMansions {
  if (cached?.seed !== seed) cached = { seed, mansions: new ChunkGenerator(seed).mansions };
  return cached.mansions;
}

/** vanilla /locate structure mansion: the corner of the nearest one's start chunk */
export function locateMansion(seed: string, x: number, z: number): [number, number] | null {
  return mansionsFor(seed).nearest(x, z);
}
