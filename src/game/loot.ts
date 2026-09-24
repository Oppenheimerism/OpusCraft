// Chest loot tables (vanilla data/minecraft/loot_table/chests/*.json) and
// LootTable.fill: rolled stacks are split and scattered over random empty slots.

import { Rand } from '../core/rng';
import { ItemStack, ITEMS } from '../item/item';
import { RANDOM_LOOT_ENCHANTMENTS } from '../item/enchantments';
import { selectEnchantment } from '../item/enchantHelper';
import type { SimpleContainer } from '../inventory/container';

interface LootEntry {
  item: string;
  weight: number;
  /** set_count uniform range */
  count?: [number, number];
  /** enchant_randomly from #on_random_loot (books become enchanted books) */
  enchant?: boolean;
  /** enchant_with_levels from #on_random_loot: enchanted as a table would at this level */
  levels?: number;
}

interface LootPool {
  rolls: number | [number, number];
  entries: LootEntry[];
}

const e = (item: string, weight: number, count?: [number, number], enchant?: boolean): LootEntry => ({ item, weight, count, enchant });
/** an entry with enchant_with_levels */
const lv = (item: string, weight: number, levels: number): LootEntry => ({ item, weight, levels });

export const LOOT_TABLES: Record<string, LootPool[]> = {
  'chests/simple_dungeon': [
    {
      rolls: [1, 3],
      entries: [
        e('saddle', 20), e('golden_apple', 15), e('enchanted_golden_apple', 2), e('music_disc_otherside', 2), e('music_disc_13', 15),
        e('music_disc_cat', 15), e('name_tag', 20), e('golden_horse_armor', 10), e('iron_horse_armor', 15), e('diamond_horse_armor', 5),
        e('book', 10, undefined, true),
      ],
    },
    {
      rolls: [1, 4],
      entries: [
        e('iron_ingot', 10, [1, 4]), e('gold_ingot', 5, [1, 4]), e('bread', 20), e('wheat', 20, [1, 4]), e('bucket', 10),
        e('redstone', 15, [1, 4]), e('coal', 15, [1, 4]), e('melon_seeds', 10, [2, 4]), e('pumpkin_seeds', 10, [2, 4]), e('beetroot_seeds', 10, [2, 4]),
      ],
    },
    { rolls: 3, entries: [e('bone', 10, [1, 8]), e('gunpowder', 10, [1, 8]), e('rotten_flesh', 10, [1, 8]), e('string', 10, [1, 8])] },
  ],
  // ('' is an empty entry; items the game doesn't have yet roll nothing too)
  'chests/abandoned_mineshaft': [
    {
      rolls: 1,
      entries: [e('golden_apple', 20), e('enchanted_golden_apple', 1), e('name_tag', 30), e('book', 10, undefined, true), e('iron_pickaxe', 5), e('', 5)],
    },
    {
      rolls: [2, 4],
      entries: [
        e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]), e('lapis_lazuli', 5, [4, 9]), e('diamond', 3, [1, 2]),
        e('coal', 10, [3, 8]), e('bread', 15, [1, 3]), e('glow_berries', 15, [3, 6]), e('melon_seeds', 10, [2, 4]), e('pumpkin_seeds', 10, [2, 4]),
        e('beetroot_seeds', 10, [2, 4]),
      ],
    },
    { rolls: 3, entries: [e('rail', 20, [4, 8]), e('powered_rail', 5, [1, 4]), e('detector_rail', 5, [1, 4]), e('activator_rail', 5, [1, 4]), e('torch', 15, [1, 16])] },
  ],
  'chests/nether_bridge': [
    {
      rolls: [2, 4],
      entries: [
        e('diamond', 5, [1, 3]), e('iron_ingot', 5, [1, 5]), e('gold_ingot', 15, [1, 3]), e('golden_sword', 5), e('golden_chestplate', 5),
        e('flint_and_steel', 5), e('nether_wart', 5, [3, 7]), e('saddle', 10), e('golden_horse_armor', 8), e('iron_horse_armor', 5),
        e('diamond_horse_armor', 3), e('obsidian', 2, [2, 4]),
      ],
    },
    { rolls: 1, entries: [e('', 14), e('rib_armor_trim_smithing_template', 1)] },
  ],
  // temples
  'chests/desert_pyramid': [
    {
      rolls: [2, 4],
      entries: [
        e('diamond', 5, [1, 3]), e('iron_ingot', 15, [1, 5]), e('gold_ingot', 15, [2, 7]), e('emerald', 15, [1, 3]), e('bone', 25, [4, 6]),
        e('spider_eye', 25, [1, 3]), e('rotten_flesh', 25, [3, 7]), e('saddle', 20), e('iron_horse_armor', 15), e('golden_horse_armor', 10),
        e('diamond_horse_armor', 5), e('book', 20, undefined, true), e('golden_apple', 20), e('enchanted_golden_apple', 2), e('', 15),
      ],
    },
    { rolls: 4, entries: [e('bone', 10, [1, 8]), e('gunpowder', 10, [1, 8]), e('rotten_flesh', 10, [1, 8]), e('string', 10, [1, 8]), e('sand', 10, [1, 8])] },
    { rolls: 1, entries: [e('', 6), e('dune_armor_trim_smithing_template', 1, [2, 2])] },
  ],
  'chests/igloo_chest': [
    {
      rolls: [2, 8],
      entries: [
        e('apple', 15, [1, 3]), e('coal', 15, [1, 4]), e('gold_nugget', 10, [1, 3]), e('stone_axe', 2), e('rotten_flesh', 10), e('emerald', 1),
        e('wheat', 10, [2, 3]),
      ],
    },
    { rolls: 1, entries: [e('golden_apple', 1)] },
  ],
  'chests/jungle_temple': [
    {
      rolls: [2, 6],
      entries: [
        e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 15, [2, 7]), e('bamboo', 15, [1, 3]), e('emerald', 2, [1, 3]),
        e('bone', 20, [4, 6]), e('rotten_flesh', 16, [3, 7]), e('saddle', 3), e('iron_horse_armor', 1), e('golden_horse_armor', 1),
        e('diamond_horse_armor', 1), lv('book', 1, 30),
      ],
    },
    { rolls: 1, entries: [e('', 2), e('wild_armor_trim_smithing_template', 1, [2, 2])] },
  ],
  'chests/jungle_temple_dispenser': [{ rolls: [1, 2], entries: [e('arrow', 30, [2, 7])] }],
  // strongholds: the chest corridors' altars, the storeroom crossings and the libraries
  'chests/stronghold_corridor': [
    {
      rolls: [2, 3],
      entries: [
        e('ender_pearl', 10), e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]),
        e('bread', 15, [1, 3]), e('apple', 15, [1, 3]), e('iron_pickaxe', 5), e('iron_sword', 5), e('iron_chestplate', 5), e('iron_helmet', 5),
        e('iron_leggings', 5), e('iron_boots', 5), e('golden_apple', 1), e('saddle', 1), e('iron_horse_armor', 1), e('golden_horse_armor', 1),
        e('diamond_horse_armor', 1), e('music_disc_otherside', 1), lv('book', 1, 30),
      ],
    },
    { rolls: 1, entries: [e('', 9), e('eye_armor_trim_smithing_template', 1)] },
  ],
  'chests/stronghold_crossing': [
    {
      rolls: [1, 4],
      entries: [
        e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]), e('coal', 10, [3, 8]), e('bread', 15, [1, 3]),
        e('apple', 15, [1, 3]), e('iron_pickaxe', 1), lv('book', 1, 30),
      ],
    },
    { rolls: 1, entries: [e('', 9), e('eye_armor_trim_smithing_template', 1)] },
  ],
  'chests/stronghold_library': [
    { rolls: [2, 10], entries: [e('book', 20, [1, 3]), e('paper', 20, [2, 7]), e('map', 1), e('compass', 1), lv('book', 10, 30)] },
    { rolls: 1, entries: [e('eye_armor_trim_smithing_template', 1)] },
  ],
  // villages (chests/village/*)
  'chests/village/village_weaponsmith': [
    {
      rolls: [3, 8],
      entries: [
        e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('bread', 15, [1, 3]), e('apple', 15, [1, 3]),
        e('iron_pickaxe', 5), e('iron_sword', 5), e('iron_chestplate', 5), e('iron_helmet', 5), e('iron_leggings', 5), e('iron_boots', 5),
        e('obsidian', 5, [3, 7]), e('oak_sapling', 5, [3, 7]), e('saddle', 3), e('iron_horse_armor', 1), e('golden_horse_armor', 1), e('diamond_horse_armor', 1),
      ],
    },
  ],
  'chests/village/village_toolsmith': [
    {
      rolls: [3, 8],
      entries: [
        e('diamond', 1, [1, 3]), e('iron_ingot', 5, [1, 5]), e('gold_ingot', 1, [1, 3]), e('bread', 15, [1, 3]), e('iron_pickaxe', 1),
        e('coal', 1, [1, 3]), e('stick', 20, [1, 3]), e('iron_shovel', 5),
      ],
    },
  ],
  'chests/village/village_armorer': [{ rolls: [1, 5], entries: [e('iron_ingot', 2, [1, 3]), e('bread', 4, [1, 4]), e('iron_helmet', 1), e('emerald', 1)] }],
  'chests/village/village_cartographer': [
    { rolls: [1, 5], entries: [e('map', 10, [1, 3]), e('paper', 15, [1, 5]), e('compass', 5), e('bread', 15, [1, 4]), e('stick', 5, [1, 2])] },
  ],
  'chests/village/village_mason': [
    {
      rolls: [1, 5],
      entries: [
        e('clay_ball', 1, [1, 3]), e('flower_pot', 1), e('stone', 2), e('stone_bricks', 2), e('bread', 4, [1, 4]), e('yellow_dye', 1),
        e('smooth_stone', 1), e('emerald', 1),
      ],
    },
  ],
  'chests/village/village_shepherd': [
    {
      rolls: [1, 5],
      entries: [
        e('white_wool', 6, [1, 8]), e('black_wool', 3, [1, 3]), e('gray_wool', 2, [1, 3]), e('brown_wool', 2, [1, 3]), e('light_gray_wool', 2, [1, 3]),
        e('emerald', 1), e('shears', 1), e('wheat', 6, [1, 6]),
      ],
    },
  ],
  'chests/village/village_butcher': [
    { rolls: [1, 5], entries: [e('emerald', 1), e('porkchop', 6, [1, 3]), e('wheat', 6, [1, 3]), e('beef', 6, [1, 3]), e('mutton', 6, [1, 3]), e('coal', 3, [1, 3])] },
  ],
  'chests/village/village_fletcher': [
    { rolls: [1, 5], entries: [e('emerald', 1), e('arrow', 2, [1, 3]), e('feather', 6, [1, 3]), e('egg', 2, [1, 3]), e('flint', 6, [1, 3]), e('stick', 6, [1, 3])] },
  ],
  'chests/village/village_fisher': [
    {
      rolls: [1, 5],
      entries: [
        e('emerald', 1), e('cod', 2, [1, 3]), e('salmon', 1, [1, 3]), e('water_bucket', 1, [1, 3]), e('barrel', 1, [1, 3]), e('wheat_seeds', 3, [1, 3]),
        e('coal', 2, [1, 3]),
      ],
    },
  ],
  'chests/village/village_tannery': [
    {
      rolls: [1, 5],
      entries: [
        e('leather', 1, [1, 3]), e('leather_chestplate', 2), e('leather_boots', 2), e('leather_helmet', 2), e('bread', 5, [1, 4]), e('leather_leggings', 2),
        e('saddle', 1), e('emerald', 1, [1, 4]),
      ],
    },
  ],
  'chests/village/village_temple': [
    {
      rolls: [3, 8],
      entries: [
        e('redstone', 2, [1, 4]), e('bread', 7, [1, 4]), e('rotten_flesh', 7, [1, 4]), e('lapis_lazuli', 1, [1, 4]), e('gold_ingot', 1, [1, 4]),
        e('emerald', 1, [1, 4]),
      ],
    },
  ],
  'chests/village/village_plains_house': [
    {
      rolls: [3, 8],
      entries: [
        e('gold_nugget', 1, [1, 3]), e('dandelion', 2), e('poppy', 1), e('potato', 10, [1, 5]), e('bread', 10, [1, 4]), e('apple', 10, [1, 5]),
        e('book', 1), e('feather', 1), e('emerald', 2, [1, 4]), e('oak_sapling', 5, [1, 2]),
      ],
    },
  ],
  'chests/village/village_taiga_house': [
    {
      rolls: [3, 8],
      entries: [
        e('iron_nugget', 1, [1, 5]), e('fern', 2), e('large_fern', 2), e('potato', 10, [1, 7]), e('sweet_berries', 5, [1, 7]), e('bread', 10, [1, 4]),
        e('pumpkin_seeds', 5, [1, 5]), e('pumpkin_pie', 1), e('emerald', 2, [1, 4]), e('spruce_sapling', 5, [1, 5]), e('spruce_sign', 1),
        e('spruce_log', 10, [1, 5]),
      ],
    },
  ],
  'chests/village/village_savanna_house': [
    {
      rolls: [3, 8],
      entries: [
        e('gold_nugget', 1, [1, 3]), e('short_grass', 5), e('tall_grass', 5), e('bread', 10, [1, 4]), e('wheat_seeds', 10, [1, 5]), e('emerald', 2, [1, 4]),
        e('acacia_sapling', 10, [1, 2]), e('saddle', 1), e('torch', 1, [1, 2]), e('bucket', 1),
      ],
    },
  ],
  'chests/village/village_snowy_house': [
    {
      rolls: [3, 8],
      entries: [
        e('blue_ice', 1), e('snow_block', 4), e('potato', 10, [1, 7]), e('bread', 10, [1, 4]), e('beetroot_seeds', 10, [1, 5]), e('beetroot_soup', 1),
        e('furnace', 1), e('emerald', 1, [1, 4]), e('snowball', 10, [1, 7]), e('coal', 5, [1, 4]),
      ],
    },
  ],
  'chests/village/village_desert_house': [
    {
      rolls: [3, 8],
      entries: [
        e('clay_ball', 1), e('green_dye', 1), e('cactus', 10, [1, 4]), e('wheat', 10, [1, 7]), e('bread', 10, [1, 4]), e('book', 1),
        e('dead_bush', 2, [1, 3]), e('emerald', 1, [1, 3]),
      ],
    },
  ],
};

/** vanilla Mth.nextInt(random, lo, hi) */
const between = (r: Rand, lo: number, hi: number) => (lo >= hi ? lo : lo + r.nextInt(hi - lo + 1));

/** vanilla EnchantRandomlyFunction on a book */
function enchantRandomly(stack: ItemStack, r: Rand): ItemStack {
  const ench = RANDOM_LOOT_ENCHANTMENTS[r.nextInt(RANDOM_LOOT_ENCHANTMENTS.length)];
  const level = between(r, 1, ench.maxLevel);
  if (stack.item.id === 'book') return new ItemStack(ITEMS.get('enchanted_book')!, stack.count, 0, { stored: { [ench.id]: level } });
  return new ItemStack(stack.item, stack.count, stack.damage, { ...stack.tag, enchantments: { ...stack.tag?.enchantments, [ench.id]: level } });
}

/** vanilla EnchantWithLevelsFunction (EnchantmentHelper.enchantItem): a book becomes an enchanted book */
function enchantWithLevels(stack: ItemStack, levels: number, r: Rand): ItemStack {
  const m: Record<string, number> = {};
  for (const x of selectEnchantment(r, stack, levels, RANDOM_LOOT_ENCHANTMENTS)) m[x.def.id] = x.level;
  if (stack.item.id === 'book') return new ItemStack(ITEMS.get('enchanted_book')!, stack.count, 0, { stored: m });
  return new ItemStack(stack.item, stack.count, stack.damage, { ...stack.tag, enchantments: { ...stack.tag?.enchantments, ...m } });
}

/** vanilla LootTable.getRandomItems (stacks over the max size are split) */
export function rollLoot(table: string, r: Rand): ItemStack[] {
  const out: ItemStack[] = [];
  for (const pool of LOOT_TABLES[table] ?? []) {
    const rolls = typeof pool.rolls === 'number' ? pool.rolls : between(r, pool.rolls[0], pool.rolls[1]);
    const total = pool.entries.reduce((a, x) => a + x.weight, 0);
    for (let i = 0; i < rolls; i++) {
      let k = r.nextInt(total);
      const entry = pool.entries.find((x) => (k -= x.weight) < 0)!;
      const it = ITEMS.get(entry.item);
      if (!it) continue;
      let stack = new ItemStack(it, entry.count ? between(r, entry.count[0], entry.count[1]) : 1);
      if (entry.enchant) stack = enchantRandomly(stack, r);
      if (entry.levels) stack = enchantWithLevels(stack, entry.levels, r);
      while (stack.count > stack.maxStack) out.push(stack.split(stack.maxStack));
      out.push(stack);
    }
  }
  return out;
}

/** vanilla Util.shuffle */
function shuffle<T>(a: T[], r: Rand): void {
  for (let i = a.length; i > 1; i--) {
    const j = r.nextInt(i);
    [a[i - 1], a[j]] = [a[j], a[i - 1]];
  }
}

/** vanilla LootTable.fill: split stacks while there are spare slots, then scatter over random empty slots */
export function fillContainer(c: SimpleContainer, table: string, seed: number): void {
  const r = new Rand(seed, 0x100f);
  const items = rollLoot(table, r);
  const slots: number[] = [];
  for (let i = 0; i < c.size; i++) if (!c.items[i]) slots.push(i);
  shuffle(slots, r);
  // shuffleAndSplitItems
  const splittable: ItemStack[] = [];
  for (let i = items.length - 1; i >= 0; i--)
    if (items[i].count > 1) {
      splittable.push(items[i]);
      items.splice(i, 1);
    }
  splittable.reverse();
  while (slots.length - items.length - splittable.length > 0 && splittable.length) {
    const s = splittable.splice(between(r, 0, splittable.length - 1), 1)[0];
    const part = s.split(between(r, 1, Math.floor(s.count / 2)));
    for (const x of [s, part]) {
      if (x.count > 1 && r.nextBool()) splittable.push(x);
      else items.push(x);
    }
  }
  items.push(...splittable);
  shuffle(items, r);
  for (const s of items) {
    if (!slots.length) break;
    c.items[slots.pop()!] = s;
  }
  c.changed();
}
