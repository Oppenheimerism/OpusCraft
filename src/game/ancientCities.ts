// Ancient cities in the running game (the structure itself is world/gen/ancientCity.ts): /locate structure
// ancient_city, and the loot of the city's chests and of its ice box. Whether a city stands in a region needs the
// underground biome at its centre (it's only built where that's the deep dark), so the Overworld's generator is made on
// the main thread the first time one is looked for, as the mansions' is.

import { ChunkGenerator } from '../world/gen/generator';
import type { AncientCities } from '../world/gen/ancientCity';
import { ItemStack, ITEMS } from '../item/item';
import type { Rand } from '../core/rng';
import { LOOT_TABLES } from './loot';

/** vanilla SetItemDamageFunction: the durability left, a fraction drawn from the range */
const damaged = (lo: number, hi: number) => (s: ItemStack, r: Rand): ItemStack => {
  const f = lo + r.nextFloat() * (hi - lo);
  if (s.item.maxDamage > 0) s.damage = Math.floor((1 - f) * s.item.maxDamage);
  return s;
};

/** vanilla EnchantRandomlyFunction with only Swift Sneak to choose from: a book of it, at any of its levels */
const swiftSneak = (s: ItemStack, r: Rand): ItemStack => new ItemStack(ITEMS.get('enchanted_book')!, s.count, 0, { stored: { swift_sneak: 1 + r.nextInt(3) } });

/** vanilla SetPotionFunction: strong_regeneration (Regeneration II) */
const regeneration = (s: ItemStack): ItemStack => ((s.tag = { ...s.tag, potion: { potion: 'strong_regeneration' } }), s);

/** vanilla loot_table/chests/ancient_city ('' is its empty entry) */
LOOT_TABLES['chests/ancient_city'] = [
  {
    rolls: [5, 10],
    entries: [
      { item: 'enchanted_golden_apple', weight: 1, count: [1, 2] }, { item: 'music_disc_otherside', weight: 1 }, { item: 'compass', weight: 2, count: [1, 3] },
      { item: 'sculk_catalyst', weight: 2, count: [1, 2] }, { item: 'name_tag', weight: 2 }, { item: 'diamond_hoe', weight: 2, levels: [30, 50], apply: damaged(0.8, 1) },
      { item: 'lead', weight: 2 }, { item: 'diamond_horse_armor', weight: 2 }, { item: 'saddle', weight: 2 }, { item: 'music_disc_13', weight: 2 },
      { item: 'music_disc_cat', weight: 2 }, { item: 'diamond_leggings', weight: 2, levels: [30, 50] }, { item: 'book', weight: 3, apply: swiftSneak },
      { item: 'sculk', weight: 3, count: [4, 10] }, { item: 'sculk_sensor', weight: 3, count: [1, 3] }, { item: 'candle', weight: 3, count: [1, 4] },
      { item: 'amethyst_shard', weight: 3, count: [1, 15] }, { item: 'experience_bottle', weight: 3, count: [1, 3] }, { item: 'glow_berries', weight: 3, count: [1, 15] },
      { item: 'iron_leggings', weight: 3, levels: [20, 39] }, { item: 'echo_shard', weight: 4, count: [1, 3] }, { item: 'disc_fragment_5', weight: 4, count: [1, 3] },
      { item: 'potion', weight: 5, count: [1, 3], apply: regeneration }, { item: 'book', weight: 5, levels: 30 }, { item: 'bone', weight: 5, count: [1, 15] },
      { item: 'soul_torch', weight: 5, count: [1, 15] }, { item: 'coal', weight: 7, count: [6, 15] },
    ],
  },
  {
    rolls: 1,
    entries: [{ item: '', weight: 75 }, { item: 'ward_armor_trim_smithing_template', weight: 4, count: [2, 2] }, { item: 'silence_armor_trim_smithing_template', weight: 1, count: [2, 2] }],
  },
];

/** vanilla loot_table/chests/ancient_city_ice_box */
LOOT_TABLES['chests/ancient_city_ice_box'] = [
  {
    rolls: [4, 10],
    entries: [
      { item: 'suspicious_stew', weight: 1, count: [2, 6], stewEffects: [['night_vision', 7, 10], ['blindness', 5, 7]] }, { item: 'golden_carrot', weight: 1, count: [1, 10] },
      { item: 'baked_potato', weight: 1, count: [1, 10] }, { item: 'packed_ice', weight: 2, count: [2, 6] }, { item: 'snowball', weight: 4, count: [2, 6] },
    ],
  },
];

let cached: { seed: string; cities: AncientCities } | null = null;

/** the Overworld's ancient cities for a world seed */
export function ancientCitiesFor(seed: string): AncientCities {
  if (cached?.seed !== seed) cached = { seed, cities: new ChunkGenerator(seed).ancientCities };
  return cached.cities;
}

/** vanilla /locate structure ancient_city: the corner of the nearest one's start chunk */
export function locateAncientCity(seed: string, x: number, z: number): [number, number] | null {
  return ancientCitiesFor(seed).nearest(x, z);
}
