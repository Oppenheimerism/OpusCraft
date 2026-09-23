// Chest loot tables (vanilla data/minecraft/loot_table/chests/*.json) and
// LootTable.fill: rolled stacks are split and scattered over random empty slots.

import { Rand } from '../core/rng';
import { ItemStack, ITEMS } from '../item/item';
import { RANDOM_LOOT_ENCHANTMENTS } from '../item/enchantments';
import type { SimpleContainer } from '../inventory/container';

interface LootEntry {
  item: string;
  weight: number;
  /** set_count uniform range */
  count?: [number, number];
  /** enchant_randomly from #on_random_loot (books become enchanted books) */
  enchant?: boolean;
}

interface LootPool {
  rolls: number | [number, number];
  entries: LootEntry[];
}

const e = (item: string, weight: number, count?: [number, number], enchant?: boolean): LootEntry => ({ item, weight, count, enchant });

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
