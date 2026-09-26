// What the creative tabs list (vanilla CreativeModeTabs' displayItems): the creative screen's grid, and what a host takes
// a guest's creative inventory to be picked from (net/items.ts).

import { ItemStack, Item, getItem } from './item';
import { ENCHANTMENTS } from './enchantments';

/**
 * vanilla CreativeModeTabs.generateEnchantmentBookTypesOnlyMaxLevel / AllLevels: an enchanted book for each
 * enchantment in registry order (ids, alphabetically, for the data-driven registry), at its maximum level or at
 * every level
 */
export function enchantedBooks(allLevels: boolean): ItemStack[] {
  const out: ItemStack[] = [];
  for (const id of [...ENCHANTMENTS.keys()].sort()) {
    const max = ENCHANTMENTS.get(id)!.maxLevel;
    for (let l = allLevels ? 1 : max; l <= max; l++) out.push(new ItemStack(getItem('enchanted_book'), 1, 0, { stored: { [id]: l } }));
  }
  return out;
}

/** an item's creative stacks: one of it, or its variants (vanilla generatePotionEffectTypes: a potion of each kind) */
export function stacksOf(it: Item): ItemStack[] {
  return it.creativeStacks?.() ?? [new ItemStack(it, 1)];
}
