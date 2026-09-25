// Villager trading (vanilla MerchantOffer, MerchantOffers and VillagerTrades): what each profession buys and sells
// at each of its five levels. An offer's first price rises with demand (how much more it was bought than it had
// in stock, as of the last restock) and falls with the buyer's standing; each offer can be used a few times
// between restocks. Listings for items the game doesn't have yet come out empty, and the villager draws another
// (as vanilla does with a listing that can't make an offer).

import { ItemStack, ITEMS, saveStack, loadStack, type SavedStack } from '../item/item';
import { applyDyes } from '../item/dyedColor';
import { selectEnchantment, type EnchantRandom } from '../item/enchantHelper';
import { ENCHANTMENTS, TABLE_ENCHANTMENTS } from '../item/enchantments';
import { DYES } from '../world/blocksExtra';
import { POTIONS, isBrewablePotion, potionStack } from '../item/potions';
import type { Rand } from '../core/rng';
import type { Mob } from './mob';
import type { Player } from './player';

/** one side of a trade's price (vanilla ItemCost): an item and how many */
export interface ItemCost {
  id: string;
  count: number;
}

/** vanilla MerchantOffer */
export class MerchantOffer {
  uses = 0;
  /** vanilla specialPriceDiff: this buyer's discount (negative) or surcharge */
  specialPriceDiff = 0;
  demand = 0;
  rewardExp = true;

  constructor(
    readonly baseCostA: ItemCost,
    readonly costB: ItemCost | null,
    readonly result: ItemStack,
    readonly maxUses: number,
    readonly xp: number,
    readonly priceMultiplier: number,
  ) {}

  /** vanilla getCostA: the first price, raised by demand (never below one or above a stack) */
  costA(): ItemStack {
    const i = this.baseCostA.count;
    const j = Math.max(0, Math.floor(Math.fround(i * this.demand * Math.fround(this.priceMultiplier))));
    const s = ItemStack.of(this.baseCostA.id, 1);
    s.count = Math.max(1, Math.min(s.maxStack, i + j + this.specialPriceDiff));
    return s;
  }

  costBStack(): ItemStack | null {
    return this.costB ? ItemStack.of(this.costB.id, this.costB.count) : null;
  }

  isOutOfStock(): boolean {
    return this.uses >= this.maxUses;
  }

  /** vanilla updateDemand: how far past its stock it was bought since the last restock */
  updateDemand(): void {
    this.demand = this.demand + this.uses - (this.maxUses - this.uses);
  }

  resetUses(): void {
    this.uses = 0;
  }

  /** vanilla needsRestock */
  needsRestock(): boolean {
    return this.uses > 0;
  }

  /** vanilla addToSpecialPriceDiff */
  addToSpecialPriceDiff(n: number): void {
    this.specialPriceDiff += n;
  }

  /** vanilla satisfiedBy: the two payment slots hold enough of the right things */
  satisfiedBy(a: ItemStack | null, b: ItemStack | null): boolean {
    const ca = this.costA();
    if (!matches(a, ca.item.id) || (a?.count ?? 0) < ca.count) return false;
    if (!this.costB) return !b || b.isEmpty();
    return matches(b, this.costB.id) && (b?.count ?? 0) >= this.costB.count;
  }

  /** vanilla take: pay for one trade out of the payment slots (false if they can't pay) */
  take(a: ItemStack | null, b: ItemStack | null): boolean {
    if (!this.satisfiedBy(a, b)) return false;
    a!.count -= this.costA().count;
    if (this.costB && b) b.count -= this.costB.count;
    return true;
  }

  save(): SavedOffer {
    return {
      a: this.baseCostA, b: this.costB, result: saveStack(this.result), uses: this.uses, maxUses: this.maxUses, xp: this.xp,
      mul: this.priceMultiplier, demand: this.demand, diff: this.specialPriceDiff, rewardExp: this.rewardExp,
    };
  }

  static load(d: SavedOffer): MerchantOffer | null {
    const result = loadStack(d.result);
    if (!result || !ITEMS.has(d.a.id) || (d.b && !ITEMS.has(d.b.id))) return null;
    const o = new MerchantOffer(d.a, d.b, result, d.maxUses, d.xp, d.mul);
    o.uses = d.uses;
    o.demand = d.demand;
    o.specialPriceDiff = d.diff;
    o.rewardExp = d.rewardExp;
    return o;
  }
}

export interface SavedOffer {
  a: ItemCost;
  b: ItemCost | null;
  result: SavedStack;
  uses: number;
  maxUses: number;
  xp: number;
  mul: number;
  demand: number;
  diff: number;
  rewardExp: boolean;
}

/** vanilla ItemCost.test: the right item (the price names only the item, so any damage or enchantments will do) */
function matches(s: ItemStack | null, id: string): boolean {
  return !!s && !s.isEmpty() && s.item.id === id;
}

// ---------------------------------------------------------------------------
// Listings (vanilla VillagerTrades.ItemListing and its kinds)

/** what a villager needs to make an offer from a listing */
export interface Trader {
  random: Rand;
  /** vanilla VillagerType of the trader (the fisherman's boat; a wandering trader has none) */
  villagerType?: string;
}

/** vanilla VillagerTrades.ItemListing: an offer, or null when it can't make one */
export type ItemListing = (t: Trader) => MerchantOffer | null;

const has = (id: string): boolean => ITEMS.has(id);

/** vanilla EmeraldForItems: `cost` of an item for an emerald */
function emeraldForItems(id: string, cost: number, maxUses: number, xp: number): ItemListing {
  return () => (has(id) ? new MerchantOffer({ id, count: cost }, null, ItemStack.of('emerald', 1), maxUses, xp, 0.05) : null);
}

/** vanilla ItemsForEmeralds: `count` of an item for `emeralds` */
function itemsForEmeralds(id: string, emeralds: number, count: number, maxUses: number, xp: number, mul = 0.05): ItemListing {
  return () => (has(id) ? new MerchantOffer({ id: 'emerald', count: emeralds }, null, ItemStack.of(id, count), maxUses, xp, mul) : null);
}

/** vanilla ItemsAndEmeraldsToItems: some of one thing and emeralds for some of another (the fisherman's cooking) */
function itemsAndEmeraldsToItems(from: string, fromCount: number, emeralds: number, to: string, toCount: number, maxUses: number, xp: number, mul: number): ItemListing {
  return () => (has(from) && has(to) ? new MerchantOffer({ id: 'emerald', count: emeralds }, { id: from, count: fromCount }, ItemStack.of(to, toCount), maxUses, xp, mul) : null);
}

/** vanilla EnchantedItemForEmeralds: a tool, weapon or armour enchanted at level 5-19, for its base price plus that level */
function enchantedItemForEmeralds(id: string, baseCost: number, maxUses: number, xp: number, mul = 0.05): ItemListing {
  return (t) => {
    if (!has(id)) return null;
    const i = 5 + t.random.nextInt(15);
    const s = ItemStack.of(id, 1);
    const m: Record<string, number> = {};
    for (const e of selectEnchantment(t.random as EnchantRandom, s, i, TABLE_ENCHANTMENTS)) m[e.def.id] = e.level;
    if (Object.keys(m).length) s.tag = { ...(s.tag ?? {}), enchantments: m };
    return new MerchantOffer({ id: 'emerald', count: Math.min(baseCost + i, 64) }, null, s, maxUses, xp, mul);
  };
}

/**
 * vanilla TippedArrowForItemsAndEmeralds: arrows and emeralds for as many arrows tipped with a random potion (one
 * with effects, that can be brewed)
 */
function tippedArrowForItemsAndEmeralds(from: string, fromCount: number, to: string, toCount: number, emeralds: number, maxUses: number, xp: number): ItemListing {
  return (t) => {
    if (!has(from) || !has(to)) return null;
    const list = [...POTIONS.values()].filter((p) => p.effects.length > 0 && isBrewablePotion(p.id));
    const potion = list[t.random.nextInt(list.length)];
    return new MerchantOffer({ id: 'emerald', count: emeralds }, { id: from, count: fromCount }, potionStack(to, potion.id, toCount), maxUses, xp, 0.05);
  };
}

/** vanilla #tradeable enchantments: every one the table gives, plus the two curses, frost walker and mending */
const TRADEABLE = [...TABLE_ENCHANTMENTS, ...['binding_curse', 'vanishing_curse', 'frost_walker', 'mending'].map((id) => ENCHANTMENTS.get(id)!)];
/** vanilla #double_trade_price: the treasure enchantments */
const DOUBLE_PRICE = new Set(['binding_curse', 'vanishing_curse', 'frost_walker', 'mending', 'soul_speed', 'swift_sneak', 'wind_burst']);

/** vanilla EnchantBookForEmeralds: a random tradeable enchantment at a random level, on a book, for emeralds and a book */
function enchantBookForEmeralds(xp: number): ItemListing {
  return (t) => {
    const r = t.random;
    const e = TRADEABLE[r.nextInt(TRADEABLE.length)];
    const level = e.maxLevel > 1 ? 1 + r.nextInt(e.maxLevel) : 1;
    const s = ItemStack.of('enchanted_book', 1);
    s.tag = { stored: { [e.id]: level } };
    let cost = 2 + r.nextInt(5 + level * 10) + 3 * level;
    if (DOUBLE_PRICE.has(e.id)) cost *= 2;
    return new MerchantOffer({ id: 'emerald', count: Math.min(cost, 64) }, { id: 'book', count: 1 }, s, 12, xp, 0.2);
  };
}

/** vanilla DyedArmorForEmeralds: leather dyed one to three random colours */
function dyedArmorForEmeralds(id: string, value: number, maxUses = 12, xp = 1): ItemListing {
  return (t) => {
    if (!has(id)) return null;
    const r = t.random;
    const dyes = [DYES[r.nextInt(16)]];
    if (r.nextFloat() > 0.7) dyes.push(DYES[r.nextInt(16)]);
    if (r.nextFloat() > 0.8) dyes.push(DYES[r.nextInt(16)]);
    const s = applyDyes(ItemStack.of(id, 1), dyes) ?? ItemStack.of(id, 1);
    return new MerchantOffer({ id: 'emerald', count: value }, null, s, maxUses, xp, 0.2);
  };
}

/** vanilla EmeraldsForVillagerTypeItem: the fisherman's boat, of his village's wood */
function emeraldsForVillagerTypeItem(cost: number, maxUses: number, xp: number, byType: Record<string, string>): ItemListing {
  return (t) => {
    const id = t.villagerType ? byType[t.villagerType] : undefined;
    return id && has(id) ? new MerchantOffer({ id, count: cost }, null, ItemStack.of('emerald', 1), maxUses, xp, 0.05) : null;
  };
}

const each = <T>(xs: readonly T[], f: (x: T) => ItemListing): ItemListing[] => xs.map(f);

/** vanilla VillagerTrades.TRADES: per profession, the listings of levels 1 to 5 */
export const VILLAGER_TRADES: Record<string, ItemListing[][]> = {
  farmer: [
    [emeraldForItems('wheat', 20, 16, 2), emeraldForItems('potato', 26, 16, 2), emeraldForItems('carrot', 22, 16, 2), emeraldForItems('beetroot', 15, 16, 2), itemsForEmeralds('bread', 1, 6, 16, 1)],
    [emeraldForItems('pumpkin', 6, 12, 10), itemsForEmeralds('pumpkin_pie', 1, 4, 12, 5), itemsForEmeralds('apple', 1, 4, 16, 5)],
    [itemsForEmeralds('cookie', 3, 18, 12, 10), emeraldForItems('melon', 4, 12, 20)],
    // (the suspicious stews wait for the stew)
    [itemsForEmeralds('cake', 1, 1, 12, 15)],
    [itemsForEmeralds('golden_carrot', 3, 3, 12, 30), itemsForEmeralds('glistering_melon_slice', 4, 3, 12, 30)],
  ],
  fisherman: [
    [emeraldForItems('string', 20, 16, 2), emeraldForItems('coal', 10, 16, 2), itemsAndEmeraldsToItems('cod', 6, 1, 'cooked_cod', 6, 16, 1, 0.05), itemsForEmeralds('cod_bucket', 3, 1, 16, 1)],
    [emeraldForItems('cod', 15, 16, 10), itemsAndEmeraldsToItems('salmon', 6, 1, 'cooked_salmon', 6, 16, 5, 0.05), itemsForEmeralds('campfire', 2, 1, 12, 5)],
    [emeraldForItems('salmon', 13, 16, 20), enchantedItemForEmeralds('fishing_rod', 3, 3, 10, 0.2)],
    [emeraldForItems('tropical_fish', 6, 12, 30)],
    [
      emeraldForItems('pufferfish', 4, 12, 30),
      emeraldsForVillagerTypeItem(1, 12, 30, { plains: 'oak_boat', taiga: 'spruce_boat', snow: 'spruce_boat', desert: 'jungle_boat', jungle: 'jungle_boat', savanna: 'acacia_boat', swamp: 'dark_oak_boat' }),
    ],
  ],
  shepherd: [
    [emeraldForItems('white_wool', 18, 16, 2), emeraldForItems('brown_wool', 18, 16, 2), emeraldForItems('black_wool', 18, 16, 2), emeraldForItems('gray_wool', 18, 16, 2), itemsForEmeralds('shears', 2, 1, 12, 1)],
    [
      ...each(['white', 'gray', 'black', 'light_blue', 'lime'], (c) => emeraldForItems(`${c}_dye`, 12, 16, 10)),
      ...each(DYES, (c) => itemsForEmeralds(`${c}_wool`, 1, 1, 16, 5)),
      ...each(DYES, (c) => itemsForEmeralds(`${c}_carpet`, 1, 4, 16, 5)),
    ],
    [...each(['yellow', 'light_gray', 'orange', 'red', 'pink'], (c) => emeraldForItems(`${c}_dye`, 12, 16, 20)), ...each(DYES, (c) => itemsForEmeralds(`${c}_bed`, 3, 1, 12, 10))],
    [...each(['brown', 'purple', 'blue', 'green', 'magenta', 'cyan'], (c) => emeraldForItems(`${c}_dye`, 12, 16, 30)), ...each(DYES, (c) => itemsForEmeralds(`${c}_banner`, 3, 1, 12, 15))],
    [itemsForEmeralds('painting', 2, 3, 12, 30)],
  ],
  fletcher: [
    [emeraldForItems('stick', 32, 16, 2), itemsForEmeralds('arrow', 1, 16, 12, 1), itemsAndEmeraldsToItems('gravel', 10, 1, 'flint', 10, 12, 1, 0.05)],
    [emeraldForItems('flint', 26, 12, 10), itemsForEmeralds('bow', 2, 1, 12, 5)],
    [emeraldForItems('string', 14, 16, 20), itemsForEmeralds('crossbow', 3, 1, 12, 10)],
    [emeraldForItems('feather', 24, 16, 30), enchantedItemForEmeralds('bow', 2, 3, 15)],
    [emeraldForItems('tripwire_hook', 8, 12, 30), enchantedItemForEmeralds('crossbow', 3, 3, 15), tippedArrowForItemsAndEmeralds('arrow', 5, 'tipped_arrow', 5, 2, 12, 30)],
  ],
  librarian: [
    [emeraldForItems('paper', 24, 16, 2), enchantBookForEmeralds(1), itemsForEmeralds('bookshelf', 9, 1, 12, 1)],
    [emeraldForItems('book', 4, 12, 10), enchantBookForEmeralds(5), itemsForEmeralds('lantern', 1, 1, 12, 5)],
    [emeraldForItems('ink_sac', 5, 12, 20), enchantBookForEmeralds(10), itemsForEmeralds('glass', 1, 4, 12, 10)],
    [emeraldForItems('writable_book', 2, 12, 30), enchantBookForEmeralds(15), itemsForEmeralds('clock', 5, 1, 12, 15), itemsForEmeralds('compass', 4, 1, 12, 15)],
    [itemsForEmeralds('name_tag', 20, 1, 12, 30)],
  ],
  cartographer: [
    [emeraldForItems('paper', 24, 16, 2), itemsForEmeralds('map', 7, 1, 12, 1)],
    // (Stage 5: ocean) the ocean explorer map joins these in game/treasureMaps; the woodland and trial explorer maps
    // wait for mansions and trial chambers
    [emeraldForItems('glass_pane', 11, 16, 10)],
    [emeraldForItems('compass', 1, 12, 20)],
    [itemsForEmeralds('item_frame', 7, 1, 12, 15), ...each(DYES, (c) => itemsForEmeralds(`${c}_banner`, 3, 1, 12, 15))],
    [itemsForEmeralds('globe_banner_pattern', 8, 1, 12, 30)],
  ],
  cleric: [
    [emeraldForItems('rotten_flesh', 32, 16, 2), itemsForEmeralds('redstone', 1, 2, 12, 1)],
    [emeraldForItems('gold_ingot', 3, 12, 10), itemsForEmeralds('lapis_lazuli', 1, 1, 12, 5)],
    [emeraldForItems('rabbit_foot', 2, 12, 20), itemsForEmeralds('glowstone', 4, 1, 12, 10)],
    [emeraldForItems('turtle_scute', 4, 12, 30), emeraldForItems('glass_bottle', 9, 12, 30), itemsForEmeralds('ender_pearl', 5, 1, 12, 15)],
    [emeraldForItems('nether_wart', 22, 12, 30), itemsForEmeralds('experience_bottle', 3, 1, 12, 30)],
  ],
  armorer: [
    [emeraldForItems('coal', 15, 16, 2), itemsForEmeralds('iron_leggings', 7, 1, 12, 1, 0.2), itemsForEmeralds('iron_boots', 4, 1, 12, 1, 0.2), itemsForEmeralds('iron_helmet', 5, 1, 12, 1, 0.2), itemsForEmeralds('iron_chestplate', 9, 1, 12, 1, 0.2)],
    [emeraldForItems('iron_ingot', 4, 12, 10), itemsForEmeralds('bell', 36, 1, 12, 5, 0.2), itemsForEmeralds('chainmail_boots', 1, 1, 12, 5, 0.2), itemsForEmeralds('chainmail_leggings', 3, 1, 12, 5, 0.2)],
    [emeraldForItems('lava_bucket', 1, 12, 20), emeraldForItems('diamond', 1, 12, 20), itemsForEmeralds('chainmail_helmet', 1, 1, 12, 10, 0.2), itemsForEmeralds('chainmail_chestplate', 4, 1, 12, 10, 0.2), itemsForEmeralds('shield', 5, 1, 12, 10, 0.2)],
    [enchantedItemForEmeralds('diamond_leggings', 14, 3, 15, 0.2), enchantedItemForEmeralds('diamond_boots', 8, 3, 15, 0.2)],
    [enchantedItemForEmeralds('diamond_helmet', 8, 3, 30, 0.2), enchantedItemForEmeralds('diamond_chestplate', 16, 3, 30, 0.2)],
  ],
  weaponsmith: [
    [emeraldForItems('coal', 15, 16, 2), itemsForEmeralds('iron_axe', 3, 1, 12, 1, 0.2), enchantedItemForEmeralds('iron_sword', 2, 3, 1)],
    [emeraldForItems('iron_ingot', 4, 12, 10), itemsForEmeralds('bell', 36, 1, 12, 5, 0.2)],
    [emeraldForItems('flint', 24, 12, 20)],
    [emeraldForItems('diamond', 1, 12, 30), enchantedItemForEmeralds('diamond_axe', 12, 3, 15, 0.2)],
    [enchantedItemForEmeralds('diamond_sword', 8, 3, 30, 0.2)],
  ],
  toolsmith: [
    [emeraldForItems('coal', 15, 16, 2), itemsForEmeralds('stone_axe', 1, 1, 12, 1, 0.2), itemsForEmeralds('stone_shovel', 1, 1, 12, 1, 0.2), itemsForEmeralds('stone_pickaxe', 1, 1, 12, 1, 0.2), itemsForEmeralds('stone_hoe', 1, 1, 12, 1, 0.2)],
    [emeraldForItems('iron_ingot', 4, 12, 10), itemsForEmeralds('bell', 36, 1, 12, 5, 0.2)],
    [emeraldForItems('flint', 30, 12, 20), enchantedItemForEmeralds('iron_axe', 1, 3, 10, 0.2), enchantedItemForEmeralds('iron_shovel', 2, 3, 10, 0.2), enchantedItemForEmeralds('iron_pickaxe', 3, 3, 10, 0.2), itemsForEmeralds('diamond_hoe', 4, 1, 3, 10, 0.2)],
    [emeraldForItems('diamond', 1, 12, 30), enchantedItemForEmeralds('diamond_axe', 12, 3, 15, 0.2), enchantedItemForEmeralds('diamond_shovel', 5, 3, 15, 0.2)],
    [enchantedItemForEmeralds('diamond_pickaxe', 13, 3, 30, 0.2)],
  ],
  butcher: [
    [emeraldForItems('chicken', 14, 16, 2), emeraldForItems('porkchop', 7, 16, 2), emeraldForItems('rabbit', 4, 16, 2), itemsForEmeralds('rabbit_stew', 1, 1, 12, 1)],
    [emeraldForItems('coal', 15, 16, 2), itemsForEmeralds('cooked_porkchop', 1, 5, 16, 5), itemsForEmeralds('cooked_chicken', 1, 8, 16, 5)],
    [emeraldForItems('mutton', 7, 16, 20), emeraldForItems('beef', 10, 16, 20)],
    [emeraldForItems('dried_kelp_block', 10, 12, 30)],
    [emeraldForItems('sweet_berries', 10, 12, 30)],
  ],
  leatherworker: [
    [emeraldForItems('leather', 6, 16, 2), dyedArmorForEmeralds('leather_leggings', 3), dyedArmorForEmeralds('leather_chestplate', 7)],
    [emeraldForItems('flint', 26, 12, 10), dyedArmorForEmeralds('leather_helmet', 5, 12, 5), dyedArmorForEmeralds('leather_boots', 4, 12, 5)],
    [emeraldForItems('rabbit_hide', 9, 12, 20), dyedArmorForEmeralds('leather_chestplate', 7)],
    [emeraldForItems('turtle_scute', 4, 12, 30), dyedArmorForEmeralds('leather_horse_armor', 6, 12, 15)],
    [itemsForEmeralds('saddle', 6, 1, 12, 30, 0.2), dyedArmorForEmeralds('leather_helmet', 5, 12, 30)],
  ],
  mason: [
    [emeraldForItems('clay_ball', 10, 16, 2), itemsForEmeralds('brick', 1, 10, 16, 1)],
    [emeraldForItems('stone', 20, 16, 10), itemsForEmeralds('chiseled_stone_bricks', 1, 4, 16, 5)],
    [
      emeraldForItems('granite', 16, 16, 20), emeraldForItems('andesite', 16, 16, 20), emeraldForItems('diorite', 16, 16, 20), itemsForEmeralds('dripstone_block', 1, 4, 16, 10),
      itemsForEmeralds('polished_andesite', 1, 4, 16, 10), itemsForEmeralds('polished_diorite', 1, 4, 16, 10), itemsForEmeralds('polished_granite', 1, 4, 16, 10),
    ],
    [emeraldForItems('quartz', 12, 12, 30), ...each(DYES, (c) => itemsForEmeralds(`${c}_terracotta`, 1, 1, 12, 15)), ...each(DYES, (c) => itemsForEmeralds(`${c}_glazed_terracotta`, 1, 1, 12, 15))],
    [itemsForEmeralds('quartz_pillar', 1, 1, 12, 30), itemsForEmeralds('quartz_block', 1, 1, 12, 30)],
  ],
};

/**
 * vanilla VillagerTrades.WANDERING_TRADER_TRADES (without the trade rebalance experiment): the wandering trader's
 * five picks from the first list (plants, flowers, dyes, coral, sand and the like) and one from the second, rarer one
 */
export const WANDERING_TRADER_TRADES: readonly [ItemListing[], ItemListing[]] = [
  [
    itemsForEmeralds('sea_pickle', 2, 1, 5, 1), itemsForEmeralds('slime_ball', 4, 1, 5, 1), itemsForEmeralds('glowstone', 2, 1, 5, 1), itemsForEmeralds('nautilus_shell', 5, 1, 5, 1),
    itemsForEmeralds('fern', 1, 1, 12, 1), itemsForEmeralds('sugar_cane', 1, 1, 8, 1), itemsForEmeralds('pumpkin', 1, 1, 4, 1), itemsForEmeralds('kelp', 3, 1, 12, 1), itemsForEmeralds('cactus', 3, 1, 8, 1),
    itemsForEmeralds('dandelion', 1, 1, 12, 1), itemsForEmeralds('poppy', 1, 1, 12, 1), itemsForEmeralds('blue_orchid', 1, 1, 8, 1), itemsForEmeralds('allium', 1, 1, 12, 1), itemsForEmeralds('azure_bluet', 1, 1, 12, 1),
    itemsForEmeralds('red_tulip', 1, 1, 12, 1), itemsForEmeralds('orange_tulip', 1, 1, 12, 1), itemsForEmeralds('white_tulip', 1, 1, 12, 1), itemsForEmeralds('pink_tulip', 1, 1, 12, 1),
    itemsForEmeralds('oxeye_daisy', 1, 1, 12, 1), itemsForEmeralds('cornflower', 1, 1, 12, 1), itemsForEmeralds('lily_of_the_valley', 1, 1, 7, 1),
    ...each(['wheat_seeds', 'beetroot_seeds', 'pumpkin_seeds', 'melon_seeds'], (id) => itemsForEmeralds(id, 1, 1, 12, 1)),
    ...each(['acacia', 'birch', 'dark_oak', 'jungle', 'oak', 'spruce', 'cherry'], (w) => itemsForEmeralds(`${w}_sapling`, 5, 1, 8, 1)),
    itemsForEmeralds('mangrove_propagule', 5, 1, 8, 1),
    ...each(['red', 'white', 'blue', 'pink', 'black', 'green', 'light_gray', 'magenta', 'yellow', 'gray', 'purple', 'light_blue', 'lime', 'orange', 'brown', 'cyan'], (c) => itemsForEmeralds(`${c}_dye`, 1, 3, 12, 1)),
    ...each(['brain', 'bubble', 'fire', 'horn', 'tube'], (c) => itemsForEmeralds(`${c}_coral_block`, 3, 1, 8, 1)),
    itemsForEmeralds('vine', 1, 1, 12, 1), itemsForEmeralds('brown_mushroom', 1, 1, 12, 1), itemsForEmeralds('red_mushroom', 1, 1, 12, 1), itemsForEmeralds('lily_pad', 1, 2, 5, 1),
    itemsForEmeralds('small_dripleaf', 1, 2, 5, 1), itemsForEmeralds('sand', 1, 8, 8, 1), itemsForEmeralds('red_sand', 1, 4, 6, 1), itemsForEmeralds('pointed_dripstone', 1, 2, 5, 1),
    itemsForEmeralds('rooted_dirt', 1, 2, 5, 1), itemsForEmeralds('moss_block', 1, 2, 5, 1),
  ],
  [
    itemsForEmeralds('tropical_fish_bucket', 5, 1, 4, 1), itemsForEmeralds('pufferfish_bucket', 5, 1, 4, 1), itemsForEmeralds('packed_ice', 3, 1, 6, 1),
    itemsForEmeralds('blue_ice', 6, 1, 6, 1), itemsForEmeralds('gunpowder', 1, 1, 8, 1), itemsForEmeralds('podzol', 3, 3, 6, 1),
  ],
];

/**
 * vanilla Merchant: what the trading menu needs of whoever it trades with, a villager or a wandering trader (a
 * mob, so the menu can tell it's still there and near)
 */
export interface Merchant extends Mob {
  tradingPlayer: Player | null;
  /** vanilla VillagerData level: 1 (novice) to 5 (master); a wandering trader's is 1 */
  merchantLevel: number;
  /** vanilla getVillagerXp */
  xp: number;
  /** vanilla getOffers: made the first time they're asked for */
  getOffers(): MerchantOffer[];
  /** vanilla notifyTrade: an offer was taken */
  notifyTrade(o: MerchantOffer): void;
  /** vanilla notifyTradeUpdated: a yes or a no as the payment slots fill */
  notifyTradeUpdated(s: ItemStack | null): void;
  /** vanilla showProgressBar: its level and experience bar in the menu (not a wandering trader's) */
  showProgressBar(): boolean;
  /** vanilla canRestock: an offer out of stock comes back (a wandering trader's never do) */
  canRestock(): boolean;
  stopTrading(): void;
}

/**
 * vanilla AbstractVillager.addOffersFromItemListings: up to `n` offers from different listings, drawn at random
 * (a listing that can't make an offer is dropped without counting)
 */
export function addOffersFromListings(offers: MerchantOffer[], listings: readonly ItemListing[], n: number, t: Trader): void {
  const left = [...listings];
  let i = 0;
  while (i < n && left.length) {
    const o = left.splice(t.random.nextInt(left.length), 1)[0](t);
    if (!o) continue;
    offers.push(o);
    i++;
  }
}
