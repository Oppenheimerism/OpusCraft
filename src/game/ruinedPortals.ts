// Ruined portals in the running game (the structure itself is world/gen/ruinedPortal.ts): /locate structure
// ruined_portal and its six other kinds, and the loot of their chests. Which kind a region has depends on the terrain
// and the biomes at the spot each kind picks, so the dimension's generator is made on the main thread the first
// time one is looked for, as the temples' is.

import { ChunkGenerator } from '../world/gen/generator';
import { NetherGenerator } from '../world/gen/nether';
import { PORTAL_IDS, type RuinedPortals } from '../world/gen/ruinedPortal';
import { LOOT_TABLES } from './loot';

/** vanilla loot_table/chests/ruined_portal */
LOOT_TABLES['chests/ruined_portal'] = [
  {
    rolls: [4, 8],
    entries: [
      { item: 'obsidian', weight: 40, count: [1, 2] }, { item: 'flint', weight: 40, count: [1, 4] }, { item: 'iron_nugget', weight: 40, count: [9, 18] },
      { item: 'flint_and_steel', weight: 40 }, { item: 'fire_charge', weight: 40 }, { item: 'golden_apple', weight: 15 },
      { item: 'gold_nugget', weight: 15, count: [4, 24] }, { item: 'golden_sword', weight: 15, enchant: true }, { item: 'golden_axe', weight: 15, enchant: true },
      { item: 'golden_hoe', weight: 15, enchant: true }, { item: 'golden_shovel', weight: 15, enchant: true }, { item: 'golden_pickaxe', weight: 15, enchant: true },
      { item: 'golden_boots', weight: 15, enchant: true }, { item: 'golden_chestplate', weight: 15, enchant: true }, { item: 'golden_helmet', weight: 15, enchant: true },
      { item: 'golden_leggings', weight: 15, enchant: true }, { item: 'glistering_melon_slice', weight: 5, count: [4, 12] }, { item: 'golden_horse_armor', weight: 5 },
      { item: 'light_weighted_pressure_plate', weight: 5 }, { item: 'golden_carrot', weight: 5, count: [4, 12] }, { item: 'clock', weight: 5 },
      { item: 'gold_ingot', weight: 5, count: [2, 8] }, { item: 'bell', weight: 1 }, { item: 'enchanted_golden_apple', weight: 1 },
      { item: 'gold_block', weight: 1, count: [1, 2] },
    ],
  },
];

let cached: { seed: string; overworld: RuinedPortals | null; nether: RuinedPortals | null } | null = null;

/** a dimension's ruined portals for a world seed (null in the End) */
export function ruinedPortalsFor(seed: string, dim: string): RuinedPortals | null {
  if (cached?.seed !== seed) cached = { seed, overworld: null, nether: null };
  if (dim === 'overworld') return (cached.overworld ??= new ChunkGenerator(seed).ruinedPortals);
  if (dim === 'the_nether') return (cached.nether ??= new NetherGenerator(seed).ruinedPortals);
  return null;
}

/** whether a structure id is one of the ruined portals */
export function isRuinedPortal(id: string): boolean {
  return id in PORTAL_IDS;
}

/** vanilla /locate structure for a ruined portal: the corner of the nearest one's start chunk, in this dimension */
export function locateRuinedPortal(seed: string, dim: string, id: string, x: number, z: number): [number, number] | null {
  const kind = PORTAL_IDS[id];
  return kind ? (ruinedPortalsFor(seed, dim)?.nearest(kind, x, z) ?? null) : null;
}
