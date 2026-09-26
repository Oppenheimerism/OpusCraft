// (bastions) The bastion remnants' chests (1.21; vanilla data/minecraft/loot_table/chests/bastion_*.json): the
// treasure room's (netherite, ancient debris, diamond gear, the netherite upgrade template every time), the bridge's
// (a lodestone every time), the hoglin stables' (diamond tools, a saddle, gold, crimson things), and every other
// chest's (bastion_other: tools, arrows, the Snout banner pattern, Pigstep, soul speed). All four may hold the snout
// armour trim template (one time in twelve) and, but for the treasure, the netherite upgrade template (one in ten).

import type { Rand } from '../core/rng';
import { ITEMS, ItemStack } from '../item/item';
import { ENCHANTMENTS, RANDOM_LOOT_ENCHANTMENTS, canEnchant } from '../item/enchantments';
import { LOOT_TABLES } from './loot';

type LootPool = (typeof LOOT_TABLES)[string][number];
type LootEntry = LootPool['entries'][number];
type Fn = (s: ItemStack, r: Rand) => ItemStack;

/** an item entry: its weight, a set_count range, and its other functions in vanilla's order */
const e = (item: string, weight: number, count?: [number, number], ...fns: Fn[]): LootEntry => ({
  item, weight, count, apply: fns.length ? (s, r) => fns.reduce((acc, f) => f(acc, r), s) : undefined,
});
/** vanilla EmptyLootItem */
const empty = (weight: number): LootEntry => ({ item: '', weight });

/** vanilla SetItemDamageFunction: this much of its durability left (uniform `lo`-`hi`) */
function damaged(lo: number, hi: number): Fn {
  return (s, r) => {
    const left = lo + r.nextFloat() * (hi - lo);
    if (s.item.maxDamage) s.damage = Math.floor((1 - Math.max(0, Math.min(1, left))) * s.item.maxDamage);
    return s;
  };
}

/**
 * vanilla EnchantRandomlyFunction: one of the `ids` (by default any #on_random_loot enchantment) that the item can
 * have (a book takes any, and becomes an enchanted book), at a level from 1 to its most; left as it is when none fits
 */
function enchanted(ids?: string[]): Fn {
  return (s, r) => {
    const book = s.item.id === 'book';
    const pool = ids ? ids.map((id) => ENCHANTMENTS.get(id)!).filter(Boolean) : RANDOM_LOOT_ENCHANTMENTS;
    const options = book ? pool : pool.filter((x) => canEnchant(x, s.item));
    if (!options.length) return s;
    const ench = options[r.nextInt(options.length)];
    const level = ench.maxLevel > 1 ? 1 + r.nextInt(ench.maxLevel) : 1;
    if (book) return new ItemStack(ITEMS.get('enchanted_book')!, s.count, 0, { stored: { [ench.id]: level } });
    return new ItemStack(s.item, s.count, s.damage, { ...s.tag, enchantments: { ...s.tag?.enchantments, [ench.id]: level } });
  };
}

const ench = enchanted();
const soulSpeed = enchanted(['soul_speed']);

/** the two templates' pools, at the end of every bastion chest */
const SNOUT: LootPool = { rolls: 1, entries: [empty(11), e('snout_armor_trim_smithing_template', 1)] };
const UPGRADE: LootPool = { rolls: 1, entries: [empty(9), e('netherite_upgrade_smithing_template', 1)] };

LOOT_TABLES['chests/bastion_treasure'] = [
  {
    rolls: 3,
    entries: [
      e('netherite_ingot', 15), e('ancient_debris', 10), e('netherite_scrap', 8), e('ancient_debris', 4, [2, 2]),
      e('diamond_sword', 6, undefined, damaged(0.8, 1), ench), e('diamond_chestplate', 6, undefined, damaged(0.8, 1), ench),
      e('diamond_helmet', 6, undefined, damaged(0.8, 1), ench), e('diamond_leggings', 6, undefined, damaged(0.8, 1), ench),
      e('diamond_boots', 6, undefined, damaged(0.8, 1), ench),
      e('diamond_sword', 6), e('diamond_chestplate', 5), e('diamond_helmet', 5), e('diamond_boots', 5), e('diamond_leggings', 5),
      e('diamond', 5, [2, 6]), e('enchanted_golden_apple', 2),
    ],
  },
  {
    rolls: [3, 4],
    entries: [
      e('spectral_arrow', 1, [12, 25]), e('gold_block', 1, [2, 5]), e('iron_block', 1, [2, 5]), e('gold_ingot', 1, [3, 9]), e('iron_ingot', 1, [3, 9]),
      e('crying_obsidian', 1, [3, 5]), e('quartz', 1, [8, 23]), e('gilded_blackstone', 1, [5, 15]), e('magma_cream', 1, [3, 8]),
    ],
  },
  SNOUT,
  { rolls: 1, entries: [e('netherite_upgrade_smithing_template', 1)] },
];

LOOT_TABLES['chests/bastion_other'] = [
  {
    rolls: 1,
    entries: [
      e('diamond_pickaxe', 6, undefined, ench), e('diamond_shovel', 6), e('crossbow', 6, undefined, damaged(0.1, 0.9), ench),
      e('ancient_debris', 12), e('netherite_scrap', 4), e('spectral_arrow', 10, [10, 22]), e('piglin_banner_pattern', 9),
      e('music_disc_pigstep', 5), e('golden_carrot', 12, [6, 17]), e('golden_apple', 9), e('book', 10, undefined, soulSpeed),
    ],
  },
  {
    rolls: 2,
    entries: [
      e('iron_sword', 2, undefined, damaged(0.1, 0.9), ench), e('iron_block', 2), e('golden_boots', 1, undefined, soulSpeed),
      e('golden_axe', 1, undefined, ench), e('gold_block', 2), e('crossbow', 1), e('gold_ingot', 2, [1, 6]), e('iron_ingot', 2, [1, 6]),
      e('golden_sword', 1), e('golden_chestplate', 1), e('golden_helmet', 1), e('golden_leggings', 1), e('golden_boots', 1),
      e('crying_obsidian', 2, [1, 5]),
    ],
  },
  {
    rolls: [3, 4],
    entries: [
      e('gilded_blackstone', 2, [1, 5]), e('chain', 1, [2, 10]), e('magma_cream', 2, [2, 6]), e('bone_block', 1, [3, 6]), e('iron_nugget', 1, [2, 8]),
      e('obsidian', 1, [4, 6]), e('gold_nugget', 1, [2, 8]), e('string', 1, [4, 6]), e('arrow', 2, [5, 17]), e('cooked_porkchop', 1),
    ],
  },
  SNOUT,
  UPGRADE,
];

LOOT_TABLES['chests/bastion_hoglin_stable'] = [
  {
    rolls: 1,
    entries: [
      e('diamond_shovel', 15, undefined, damaged(0.15, 0.8), ench), e('diamond_pickaxe', 12, undefined, damaged(0.15, 0.95), ench),
      e('netherite_scrap', 8), e('ancient_debris', 12), e('ancient_debris', 5, [2, 2]), e('saddle', 12), e('gold_block', 16, [2, 4]),
      e('golden_carrot', 10, [8, 17]), e('golden_apple', 9),
    ],
  },
  {
    rolls: [3, 4],
    entries: [
      e('golden_axe', 1, undefined, ench), e('crying_obsidian', 1, [1, 5]), e('glowstone', 1, [3, 6]), e('gilded_blackstone', 1, [2, 5]),
      e('soul_sand', 1, [2, 7]), e('crimson_nylium', 1, [2, 7]), e('gold_nugget', 1, [2, 8]), e('leather', 1, [1, 3]), e('arrow', 1, [5, 17]),
      e('string', 1, [3, 8]), e('porkchop', 1, [2, 5]), e('cooked_porkchop', 1, [2, 5]), e('crimson_fungus', 1, [2, 7]), e('crimson_roots', 1, [2, 7]),
    ],
  },
  SNOUT,
  UPGRADE,
];

LOOT_TABLES['chests/bastion_bridge'] = [
  { rolls: 1, entries: [e('lodestone', 1)] },
  {
    rolls: [1, 2],
    entries: [
      e('crossbow', 1, undefined, damaged(0.1, 0.5), ench), e('spectral_arrow', 1, [10, 28]), e('gilded_blackstone', 1, [8, 12]),
      e('crying_obsidian', 1, [3, 8]), e('gold_block', 1), e('gold_ingot', 1, [4, 9]), e('iron_ingot', 1, [4, 9]),
      e('golden_sword', 1, undefined, ench), e('golden_chestplate', 1, undefined, ench), e('golden_helmet', 1, undefined, ench),
      e('golden_leggings', 1, undefined, ench), e('golden_boots', 1, undefined, ench), e('golden_axe', 1, undefined, ench),
    ],
  },
  {
    rolls: [2, 4],
    entries: [e('string', 1, [1, 6]), e('leather', 1, [1, 3]), e('arrow', 1, [5, 17]), e('iron_nugget', 1, [2, 6]), e('gold_nugget', 1, [2, 6])],
  },
  SNOUT,
  UPGRADE,
];

/** the four bastion chests' loot tables */
export const BASTION_LOOT_TABLES = ['chests/bastion_treasure', 'chests/bastion_other', 'chests/bastion_hoglin_stable', 'chests/bastion_bridge'];
