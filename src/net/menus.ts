// Menus over the wire (vanilla MenuType, ContainerData and ClientboundMerchantOffersPacket): which kind of menu the
// host opened for a guest, the numbers each kind shows besides its slots (a furnace's flame and arrow, an enchanting
// table's offers, a stonecutter's pick), and a trader's offers as sent. Both ends go through here, so the numbers mean
// the same things on each.

import type { Value } from './codec';
import { ITEM, type MenuKind } from './protocol';
import { itemToWire, itemFromHost } from './items';
import type { ContainerMenu } from '../inventory/container';
import { CraftingMenu, FurnaceMenu, ChestMenu, BrewingStandMenu } from '../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../inventory/enchantMenus';
import { MerchantMenu } from '../inventory/merchantMenu';
import { StonecutterMenu } from '../inventory/stonecutterMenu';
import { SmithingMenu } from '../inventory/smithingMenu';
import { LoomMenu } from '../inventory/loomMenu';
import { CartographyTableMenu } from '../inventory/cartographyMenu';
import { LecternMenu } from '../inventory/lecternMenu';
import { DispenserMenu } from '../inventory/dispenserMenu';
import { HopperMenu } from '../inventory/hopperMenu';
import { CrafterMenu } from '../inventory/crafterMenu';
import { HorseInventoryMenu } from '../inventory/horseMenu';
import { ShulkerBoxMenu } from '../inventory/shulkerBoxMenu';
// (the beacon)
import { BeaconMenu, encodePower, decodePower } from '../inventory/beaconMenu';
import { MerchantOffer } from '../entity/trading';
import { ENCHANTMENTS } from '../item/enchantments';
import { entityDisplayName } from '../game/spawner';
import type { ItemStack } from '../item/item';

/** the kind of menu `m` is, as a guest makes its own copy of it (null: one a guest can't be shown) */
export function menuKind(m: ContainerMenu): MenuKind | null {
  if (m instanceof CraftingMenu) return 'crafting';
  if (m instanceof FurnaceMenu) return m.furnace.id;
  // (a shulker box's before a chest's: it is one, with slots of its own)
  if (m instanceof ShulkerBoxMenu) return 'shulker_box';
  if (m instanceof ChestMenu) return 'chest';
  if (m instanceof BrewingStandMenu) return 'brewing_stand';
  if (m instanceof EnchantmentMenu) return 'enchantment';
  if (m instanceof AnvilMenu) return 'anvil';
  if (m instanceof GrindstoneMenu) return 'grindstone';
  if (m instanceof MerchantMenu) return 'merchant';
  if (m instanceof StonecutterMenu) return 'stonecutter';
  if (m instanceof SmithingMenu) return 'smithing';
  if (m instanceof LoomMenu) return 'loom';
  if (m instanceof CartographyTableMenu) return 'cartography';
  if (m instanceof LecternMenu) return 'lectern';
  if (m instanceof DispenserMenu) return m.dispenser.id;
  if (m instanceof HopperMenu) return 'hopper';
  if (m instanceof CrafterMenu) return 'crafter';
  if (m instanceof HorseInventoryMenu) return 'horse';
  // (the beacon)
  if (m instanceof BeaconMenu) return 'beacon';
  return null;
}

/** the name over the menu, where it's the container's own (a chest's or barrel's, a named box's, a trader's) */
export function menuTitle(m: ContainerMenu): string {
  if (m instanceof ChestMenu) return m.title;
  // ((minecarts) a hopper minecart's name over its hopper menu)
  if (m instanceof HopperMenu) return m.title;
  if (m instanceof MerchantMenu) return entityDisplayName(m.trader);
  if (m instanceof HorseInventoryMenu) return entityDisplayName(m.horse);
  return '';
}

/** what else a guest needs to make its copy (a horse's: which horse, and how many columns its chest has) */
export function menuExtra(m: ContainerMenu): Record<string, Value> {
  if (m instanceof HorseInventoryMenu) return { entity: m.horse.id, columns: m.columns };
  return {};
}

/** a data value for the wire: a whole number that fits in 32 bits */
function int32(v: number): number {
  return Number.isFinite(v) ? Math.max(-0x80000000, Math.min(0x7fffffff, Math.trunc(v))) : 0;
}

let enchantIds: string[] | null = null;
/** the enchantments by number (the same list at both ends: they run the same build) */
function enchantmentIds(): string[] {
  return (enchantIds ??= [...ENCHANTMENTS.keys()]);
}

/**
 * vanilla ContainerData: the numbers `m` shows besides its slots, as the host has them. A furnace's burn and cook
 * times; a brewing stand's brew time and fuel; an enchanting table's three costs, its seed (the glyphs), the
 * enchantment each offer hints at and its level; an anvil's cost; the stonecutter's and loom's pick; a lectern's
 * page; a crafter's switched-off slots and whether it's powered; (the beacon) a beacon's tiers and powers
 */
export function menuData(m: ContainerMenu): number[] {
  let d: number[] = [];
  if (m instanceof FurnaceMenu) {
    const f = m.furnace;
    d = [f.litTime, f.litDuration, f.cookingProgress, f.cookingTotalTime];
  } else if (m instanceof BrewingStandMenu) d = [m.stand.brewTime, m.stand.fuel];
  else if (m instanceof EnchantmentMenu) {
    const ids = enchantmentIds();
    d = [...m.costs, m.enchantmentSeed, ...m.enchantClue.map((c) => (c === null ? -1 : ids.indexOf(c))), ...m.levelClue];
  } else if (m instanceof AnvilMenu) d = [m.cost];
  else if (m instanceof StonecutterMenu) d = [m.selectedRecipeIndex];
  else if (m instanceof LoomMenu) d = [m.selectedBannerPatternIndex];
  else if (m instanceof LecternMenu) d = [m.lectern.page];
  else if (m instanceof CrafterMenu) d = [...m.crafter.disabled.map((off) => (off ? 1 : 0)), m.crafter.triggered ? 1 : 0];
  // ((the beacon) vanilla BeaconMenu's data: its tiers, and its powers by number)
  else if (m instanceof BeaconMenu) d = [m.levels, encodePower(m.primary), encodePower(m.secondary)];
  return d.map(int32);
}

/** (a guest) data value `i` of `m` from the host (vanilla AbstractContainerMenu.setData); false for one it hasn't */
export function applyMenuData(m: ContainerMenu, i: number, v: number): boolean {
  if (m instanceof FurnaceMenu) {
    const f = m.furnace;
    if (i === 0) f.litTime = v;
    else if (i === 1) f.litDuration = v;
    else if (i === 2) f.cookingProgress = v;
    else if (i === 3) f.cookingTotalTime = v;
    else return false;
  } else if (m instanceof BrewingStandMenu) {
    if (i === 0) m.stand.brewTime = v;
    else if (i === 1) m.stand.fuel = v;
    else return false;
  } else if (m instanceof EnchantmentMenu) {
    if (i < 3) m.costs[i] = v;
    else if (i === 3) m.enchantmentSeed = v;
    else if (i < 7) m.enchantClue[i - 4] = enchantmentIds()[v] ?? null;
    else if (i < 10) m.levelClue[i - 7] = v;
    else return false;
  } else if (m instanceof AnvilMenu && i === 0) m.cost = v;
  else if (m instanceof StonecutterMenu && i === 0) m.selectedRecipeIndex = v;
  else if (m instanceof LoomMenu && i === 0) m.selectedBannerPatternIndex = v;
  else if (m instanceof LecternMenu && i === 0) m.lectern.page = Math.max(0, v);
  else if (m instanceof CrafterMenu && i < 10) {
    if (i < 9) m.crafter.disabled[i] = v !== 0;
    else m.crafter.triggered = v !== 0;
  } else if (m instanceof BeaconMenu && i < 3) {
    // (the beacon)
    if (i === 0) m.beacon.levels = Math.max(0, Math.min(4, v));
    else if (i === 1) m.beacon.primary = decodePower(v);
    else m.beacon.secondary = decodePower(v);
  } else return false;
  return true;
}

/** a stack in a menu, for the wire: one the wire can't carry (a count past 127) goes as nothing rather than as bad data */
export function menuItem(s: ItemStack | null): Value {
  const v = itemToWire(s);
  return ITEM(v) ? v : null;
}

/**
 * a stack's key (playerState.stackKey) as a number (32-bit FNV-1a; 0 for nothing): what a guest says one of its slots
 * holds after a click, without sending the stack (vanilla HashedStack)
 */
export function keyHash(key: string): number {
  if (!key) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0 || 1;
}

/** (the host) what it keeps for a slot a guest said holds the stack of hash `h`, until it next looks (claimMatches) */
export function claimOf(h: number): string {
  return h === 0 ? '' : `#${h}`;
}

/** (the host) whether a slot holding the stack keyed `key` is what the guest has there, as the host last knew (`had`) */
export function claimMatches(had: string, key: string): boolean {
  return had === key || (had.charCodeAt(0) === 35 && had === `#${keyHash(key)}`);
}

/** a trader's offer for the wire (CB.MerchantOffers): its prices, what it gives, and how far it's been used */
export function offerToWire(o: MerchantOffer): Value {
  return [o.baseCostA.id, o.baseCostA.count, o.costB?.id ?? null, o.costB?.count ?? 0, menuItem(o.result), o.uses, o.maxUses, o.xp, o.priceMultiplier, int32(o.demand), int32(o.specialPriceDiff)];
}

/** (a guest) an offer from the host (of the shape protocol.ts checks): null if it names an item this game hasn't */
export function offerFromHost(v: Value): MerchantOffer | null {
  const [a, ac, b, bc, res, uses, maxUses, xp, mul, demand, diff] = v as [string, number, string | null, number, Value, number, number, number, number, number, number];
  const result = itemFromHost(res);
  if (!result || !itemFromHost([a, 1, 0, null]) || (b !== null && !itemFromHost([b, 1, 0, null]))) return null;
  const o = new MerchantOffer({ id: a, count: Math.max(1, ac) }, b === null ? null : { id: b, count: Math.max(1, bc) }, result, maxUses, xp, mul);
  o.uses = uses;
  o.demand = demand;
  o.specialPriceDiff = diff;
  return o;
}
