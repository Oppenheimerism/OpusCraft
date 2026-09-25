// The sea's loot (Stage 5: ocean; vanilla data/minecraft/loot_table/chests/shipwreck_*.json, underwater_ruin_*.json,
// buried_treasure.json and archaeology/ocean_ruin_*.json): the wrecks' supplies, treasure and maps, the ruins' chests
// (one in eleven of their last rolls a buried treasure map, see treasureMaps.ts), the buried treasure with its heart
// of the sea, and what the ruins' suspicious sand and gravel hold. ('' is an empty entry; items the game doesn't have
// yet, like bamboo, sniffer eggs and the coast armour trim, roll nothing.)

import { LOOT_TABLES } from './loot';
import { buriedTreasureMap } from './treasureMaps';

type LootPool = (typeof LOOT_TABLES)[string][number];
type LootEntry = LootPool['entries'][number];

const e = (item: string, weight: number, count?: [number, number], enchant?: boolean): LootEntry => ({ item, weight, count, enchant });
/** an empty map, turned into a buried treasure map (vanilla exploration_map and set_name) */
const treasureMap = (weight: number): LootEntry => ({ item: 'map', weight, apply: buriedTreasureMap });
/** vanilla coast_armor_trim_smithing_template (two of them), or nothing */
const coastTrim = (empty: number): LootPool => ({ rolls: 1, entries: [e('', empty), e('coast_armor_trim_smithing_template', 1, [2, 2])] });

LOOT_TABLES['chests/shipwreck_map'] = [
  { rolls: 1, entries: [treasureMap(1)] },
  { rolls: 3, entries: [e('compass', 1), e('map', 1), e('clock', 1), e('paper', 20, [1, 10]), e('feather', 10, [1, 5]), e('book', 5, [1, 5])] },
  coastTrim(5),
];

/** vanilla set_stew_effect in shipwreck_supply: a suspicious stew of one of these, for so many seconds */
const SUPPLY_STEW: LootEntry = {
  item: 'suspicious_stew',
  weight: 10,
  stewEffects: [['night_vision', 3, 7], ['jump_boost', 3, 7], ['weakness', 6, 10], ['blindness', 5, 8], ['poison', 10, 20], ['saturation', 7, 7]],
};

LOOT_TABLES['chests/shipwreck_supply'] = [
  {
    rolls: [3, 10],
    entries: [
      e('paper', 8, [1, 12]), e('potato', 7, [2, 6]), e('moss_block', 7, [1, 4]), e('poisonous_potato', 7, [2, 6]), e('carrot', 7, [4, 8]),
      e('wheat', 7, [8, 21]), SUPPLY_STEW, e('coal', 6, [2, 8]), e('rotten_flesh', 5, [5, 24]), e('pumpkin', 2, [1, 3]),
      e('bamboo', 2, [1, 3]), e('gunpowder', 3, [1, 5]), e('tnt', 1, [1, 2]), e('leather_helmet', 3, undefined, true),
      e('leather_chestplate', 3, undefined, true), e('leather_leggings', 3, undefined, true), e('leather_boots', 3, undefined, true),
    ],
  },
  coastTrim(2),
];

LOOT_TABLES['chests/shipwreck_treasure'] = [
  { rolls: [3, 6], entries: [e('iron_ingot', 90, [1, 5]), e('gold_ingot', 10, [1, 5]), e('emerald', 40, [1, 5]), e('diamond', 5), e('experience_bottle', 5)] },
  { rolls: [2, 5], entries: [e('iron_nugget', 50, [1, 10]), e('gold_nugget', 10, [1, 10]), e('lapis_lazuli', 20, [1, 10])] },
  coastTrim(5),
];

LOOT_TABLES['chests/underwater_ruin_small'] = [
  { rolls: [2, 8], entries: [e('coal', 10, [1, 4]), e('stone_axe', 2), e('rotten_flesh', 5), e('emerald', 1), e('wheat', 10, [2, 3])] },
  { rolls: 1, entries: [e('leather_chestplate', 1), e('golden_helmet', 1), e('fishing_rod', 5, undefined, true), treasureMap(10)] },
];

LOOT_TABLES['chests/underwater_ruin_big'] = [
  { rolls: [2, 8], entries: [e('coal', 10, [1, 4]), e('gold_nugget', 10, [1, 3]), e('emerald', 1), e('wheat', 10, [2, 3])] },
  {
    rolls: 1,
    entries: [e('golden_apple', 1), e('book', 5, undefined, true), e('leather_chestplate', 1), e('golden_helmet', 1), e('fishing_rod', 5, undefined, true), treasureMap(10)],
  },
];

LOOT_TABLES['chests/buried_treasure'] = [
  { rolls: 1, entries: [e('heart_of_the_sea', 1)] },
  { rolls: [5, 8], entries: [e('iron_ingot', 20, [1, 4]), e('gold_ingot', 10, [1, 4]), e('tnt', 5, [1, 2])] },
  { rolls: [1, 3], entries: [e('emerald', 5, [4, 8]), e('diamond', 5, [1, 2]), e('prismarine_crystals', 5, [1, 5])] },
  { rolls: [0, 1], entries: [e('leather_chestplate', 1), e('iron_sword', 1)] },
  { rolls: 2, entries: [e('cooked_cod', 1, [2, 4]), e('cooked_salmon', 1, [2, 4])] },
  // (vanilla set_potion: water breathing)
  { rolls: [0, 2], entries: [{ item: 'potion', weight: 1, apply: (s) => ((s.tag = { ...s.tag, potion: { potion: 'water_breathing' } }), s) }] },
];

LOOT_TABLES['archaeology/ocean_ruin_warm'] = [
  {
    rolls: 1,
    entries: [
      e('angler_pottery_sherd', 1), e('shelter_pottery_sherd', 1), e('snort_pottery_sherd', 1), e('sniffer_egg', 1), e('iron_axe', 1), e('emerald', 2),
      e('wheat', 2), e('wooden_hoe', 2), e('coal', 2), e('gold_nugget', 2),
    ],
  },
];

LOOT_TABLES['archaeology/ocean_ruin_cold'] = [
  {
    rolls: 1,
    entries: [
      e('blade_pottery_sherd', 1), e('explorer_pottery_sherd', 1), e('mourner_pottery_sherd', 1), e('plenty_pottery_sherd', 1), e('iron_axe', 1),
      e('emerald', 2), e('wheat', 2), e('wooden_hoe', 2), e('coal', 2), e('gold_nugget', 2),
    ],
  },
];
