// Enchantments (vanilla 1.21 data/minecraft/enchantment/*.json): display names,
// weights, cost ranges, anvil costs, the items they fit (supported / primary
// items tags), exclusive sets, the slots they work in, and the enchantment tags
// (#in_enchanting_table, #on_random_loot, #curse, #tooltip_order).

import type { Item } from './item';

/** vanilla EquipmentSlotGroup of an enchantment's "slots" */
export type EnchantSlots = 'mainhand' | 'armor' | 'feet' | 'legs' | 'chest' | 'head' | 'any';

export interface EnchantmentDef {
  id: string;
  name: string;
  maxLevel: number;
  /** red tooltip line (vanilla #curse) */
  curse?: boolean;
  /** vanilla #on_random_loot (enchant_randomly without options) */
  randomLoot: boolean;
  /** vanilla #in_enchanting_table (= #non_treasure) */
  table: boolean;
  weight: number;
  /** vanilla min_cost / max_cost: base + per_level_above_first × (level - 1) */
  minCost: [number, number];
  maxCost: [number, number];
  anvilCost: number;
  /** vanilla supported_items: what the enchantment can go on (anvils, /enchant) */
  supported: (it: Item) => boolean;
  /** vanilla primary_items: what the enchanting table offers it for (defaults to supported_items) */
  primary?: (it: Item) => boolean;
  /** vanilla exclusive_set (a tag of enchantments this one can't be combined with) */
  exclusive?: string;
  slots: EnchantSlots;
}

// vanilla #minecraft:enchantable/* item tags, for the items the game has
const TOOL = (...types: string[]) => (it: Item) => !!it.tool && types.includes(it.tool.type);
const ARMOR = (slot?: string) => (it: Item) => !!it.armor && (!slot || it.armor.slot === slot);
export const ENCHANTABLE = {
  armor: ARMOR(),
  foot_armor: ARMOR('feet'),
  leg_armor: ARMOR('legs'),
  chest_armor: ARMOR('chest'),
  head_armor: ARMOR('head'),
  /** armour pieces, elytra, skulls and carved pumpkins */
  equippable: (it: Item) => !!it.armor || it.id === 'carved_pumpkin',
  sword: TOOL('sword'),
  /** swords and axes */
  sharp_weapon: TOOL('sword', 'axe'),
  /** sharp weapons and maces */
  weapon: TOOL('sword', 'axe'),
  /** swords and maces */
  fire_aspect: TOOL('sword'),
  /** axes, pickaxes, shovels, hoes and shears */
  mining: TOOL('pickaxe', 'axe', 'shovel', 'hoe', 'shears'),
  mining_loot: TOOL('pickaxe', 'axe', 'shovel', 'hoe'),
  bow: (it: Item) => it.id === 'bow',
  crossbow: (it: Item) => it.id === 'crossbow',
  trident: (_it: Item) => false,
  mace: (_it: Item) => false,
  fishing: (it: Item) => it.id === 'fishing_rod',
  /** everything that takes damage */
  durability: (it: Item) => !!it.armor || !!it.tool || it.id === 'bow' || it.id === 'crossbow' || it.id === 'flint_and_steel' || it.id === 'fishing_rod',
  vanishing: (it: Item) => ENCHANTABLE.durability(it) || it.id === 'compass' || it.id === 'recovery_compass' || it.id === 'carved_pumpkin',
};
const E = ENCHANTABLE;

type Def = [id: string, name: string, max: number, weight: number, min: [number, number], maxC: [number, number], anvil: number, slots: EnchantSlots, supported: (it: Item) => boolean, extra?: { primary?: (it: Item) => boolean; exclusive?: string; treasure?: boolean; curse?: boolean; noLoot?: boolean }];

// in registry order (vanilla Enchantments bootstrap)
// prettier-ignore
const DEFS: Def[] = [
  ['protection', 'Protection', 4, 10, [1, 11], [12, 11], 1, 'armor', E.armor, { exclusive: 'armor' }],
  ['fire_protection', 'Fire Protection', 4, 5, [10, 8], [18, 8], 2, 'armor', E.armor, { exclusive: 'armor' }],
  ['feather_falling', 'Feather Falling', 4, 5, [5, 6], [11, 6], 2, 'feet', E.foot_armor],
  ['blast_protection', 'Blast Protection', 4, 2, [5, 8], [13, 8], 4, 'armor', E.armor, { exclusive: 'armor' }],
  ['projectile_protection', 'Projectile Protection', 4, 5, [3, 6], [9, 6], 2, 'armor', E.armor, { exclusive: 'armor' }],
  ['respiration', 'Respiration', 3, 2, [10, 10], [40, 10], 4, 'head', E.head_armor],
  ['aqua_affinity', 'Aqua Affinity', 1, 2, [1, 0], [41, 0], 4, 'head', E.head_armor],
  ['thorns', 'Thorns', 3, 1, [10, 20], [60, 20], 8, 'armor', E.armor, { primary: E.chest_armor }],
  ['depth_strider', 'Depth Strider', 3, 2, [10, 10], [25, 10], 4, 'feet', E.foot_armor, { exclusive: 'boots' }],
  ['frost_walker', 'Frost Walker', 2, 2, [10, 10], [25, 10], 4, 'feet', E.foot_armor, { exclusive: 'boots', treasure: true }],
  ['binding_curse', 'Curse of Binding', 1, 1, [25, 0], [50, 0], 8, 'armor', E.equippable, { treasure: true, curse: true }],
  ['soul_speed', 'Soul Speed', 3, 1, [10, 10], [25, 10], 8, 'feet', E.foot_armor, { treasure: true, noLoot: true }],
  ['swift_sneak', 'Swift Sneak', 3, 1, [25, 25], [75, 25], 8, 'legs', E.leg_armor, { treasure: true, noLoot: true }],
  ['sharpness', 'Sharpness', 5, 10, [1, 11], [21, 11], 1, 'mainhand', E.sharp_weapon, { primary: E.sword, exclusive: 'damage' }],
  ['smite', 'Smite', 5, 5, [5, 8], [25, 8], 2, 'mainhand', E.weapon, { primary: E.sword, exclusive: 'damage' }],
  ['bane_of_arthropods', 'Bane of Arthropods', 5, 5, [5, 8], [25, 8], 2, 'mainhand', E.weapon, { primary: E.sword, exclusive: 'damage' }],
  ['knockback', 'Knockback', 2, 5, [5, 20], [55, 20], 2, 'mainhand', E.sword],
  ['fire_aspect', 'Fire Aspect', 2, 2, [10, 20], [60, 20], 4, 'mainhand', E.fire_aspect],
  ['looting', 'Looting', 3, 2, [15, 9], [65, 9], 4, 'mainhand', E.sword],
  ['sweeping_edge', 'Sweeping Edge', 3, 2, [5, 9], [20, 9], 4, 'mainhand', E.sword],
  ['efficiency', 'Efficiency', 5, 10, [1, 10], [51, 10], 1, 'mainhand', E.mining],
  ['silk_touch', 'Silk Touch', 1, 1, [15, 0], [65, 0], 8, 'mainhand', E.mining_loot, { exclusive: 'mining' }],
  ['unbreaking', 'Unbreaking', 3, 5, [5, 8], [55, 8], 2, 'any', E.durability],
  ['fortune', 'Fortune', 3, 2, [15, 9], [65, 9], 4, 'mainhand', E.mining_loot, { exclusive: 'mining' }],
  ['power', 'Power', 5, 10, [1, 10], [16, 10], 1, 'mainhand', E.bow],
  ['punch', 'Punch', 2, 2, [12, 20], [37, 20], 4, 'mainhand', E.bow],
  ['flame', 'Flame', 1, 2, [20, 0], [50, 0], 4, 'mainhand', E.bow],
  ['infinity', 'Infinity', 1, 1, [20, 0], [50, 0], 8, 'mainhand', E.bow, { exclusive: 'bow' }],
  ['luck_of_the_sea', 'Luck of the Sea', 3, 2, [15, 9], [65, 9], 4, 'mainhand', E.fishing],
  ['lure', 'Lure', 3, 2, [15, 9], [65, 9], 4, 'mainhand', E.fishing],
  ['loyalty', 'Loyalty', 3, 5, [12, 7], [50, 0], 2, 'mainhand', E.trident],
  ['impaling', 'Impaling', 5, 2, [1, 8], [21, 8], 4, 'mainhand', E.trident, { exclusive: 'damage' }],
  ['riptide', 'Riptide', 3, 2, [17, 7], [50, 0], 4, 'mainhand', E.trident, { exclusive: 'riptide' }],
  ['channeling', 'Channeling', 1, 1, [25, 0], [50, 0], 8, 'mainhand', E.trident],
  ['multishot', 'Multishot', 1, 2, [20, 0], [50, 0], 4, 'mainhand', E.crossbow, { exclusive: 'crossbow' }],
  ['quick_charge', 'Quick Charge', 3, 5, [12, 20], [50, 0], 2, 'mainhand', E.crossbow],
  ['piercing', 'Piercing', 4, 10, [1, 10], [50, 0], 1, 'mainhand', E.crossbow, { exclusive: 'crossbow' }],
  ['density', 'Density', 5, 5, [5, 8], [25, 8], 2, 'mainhand', E.mace, { exclusive: 'damage' }],
  ['breach', 'Breach', 4, 2, [15, 9], [65, 9], 4, 'mainhand', E.mace, { exclusive: 'damage' }],
  ['wind_burst', 'Wind Burst', 3, 2, [15, 9], [65, 9], 4, 'mainhand', E.mace, { treasure: true, noLoot: true }],
  ['mending', 'Mending', 1, 2, [25, 25], [75, 25], 4, 'any', E.durability, { treasure: true }],
  ['vanishing_curse', 'Curse of Vanishing', 1, 1, [25, 0], [50, 0], 8, 'any', E.vanishing, { treasure: true, curse: true }],
];

/** vanilla #exclusive_set/* tags */
const EXCLUSIVE_SETS: Record<string, string[]> = {
  armor: ['protection', 'blast_protection', 'fire_protection', 'projectile_protection'],
  boots: ['frost_walker', 'depth_strider'],
  bow: ['infinity', 'mending'],
  crossbow: ['multishot', 'piercing'],
  damage: ['sharpness', 'smite', 'bane_of_arthropods', 'impaling', 'density', 'breach'],
  mining: ['fortune', 'silk_touch'],
  riptide: ['loyalty', 'channeling'],
};

export const ENCHANTMENTS = new Map<string, EnchantmentDef>();
for (const [id, name, maxLevel, weight, minCost, maxCost, anvilCost, slots, supported, x = {}] of DEFS) {
  ENCHANTMENTS.set(id, {
    id, name, maxLevel, weight, minCost, maxCost, anvilCost, slots, supported, primary: x.primary, exclusive: x.exclusive,
    curse: x.curse || undefined, randomLoot: !x.noLoot, table: !x.treasure,
  });
}

/** vanilla #on_random_loot, in registry order */
export const RANDOM_LOOT_ENCHANTMENTS: EnchantmentDef[] = [...ENCHANTMENTS.values()].filter((e) => e.randomLoot);
/** vanilla #in_enchanting_table (#non_treasure), in the tag's order */
export const TABLE_ENCHANTMENTS: EnchantmentDef[] = [...ENCHANTMENTS.values()].filter((e) => e.table);

/** vanilla #tooltip_order: enchantments are listed in this order, then any others */
export const TOOLTIP_ORDER = [
  'binding_curse', 'vanishing_curse', 'riptide', 'channeling', 'wind_burst', 'frost_walker', 'sharpness', 'smite', 'bane_of_arthropods',
  'impaling', 'power', 'density', 'breach', 'piercing', 'sweeping_edge', 'multishot', 'fire_aspect', 'flame', 'knockback', 'punch',
  'protection', 'blast_protection', 'fire_protection', 'projectile_protection', 'feather_falling', 'fortune', 'looting', 'silk_touch',
  'luck_of_the_sea', 'efficiency', 'quick_charge', 'lure', 'respiration', 'aqua_affinity', 'soul_speed', 'swift_sneak', 'depth_strider',
  'thorns', 'loyalty', 'unbreaking', 'infinity', 'mending',
];

/** vanilla Enchantment.getMinCost / getMaxCost (LevelBasedValue.perLevel) */
export const minCost = (e: EnchantmentDef, level: number): number => e.minCost[0] + e.minCost[1] * (level - 1);
export const maxCost = (e: EnchantmentDef, level: number): number => e.maxCost[0] + e.maxCost[1] * (level - 1);

/** vanilla Enchantment.canEnchant: supported_items */
export function canEnchant(e: EnchantmentDef, it: Item): boolean {
  return e.supported(it);
}

/** vanilla Enchantment.isPrimaryItem: supported and in primary_items (when set) */
export function isPrimaryItem(e: EnchantmentDef, it: Item): boolean {
  return e.supported(it) && (!e.primary || e.primary(it));
}

/** vanilla Enchantment.areCompatible: different, and neither lists the other in its exclusive set */
export function areCompatible(a: string, b: string): boolean {
  if (a === b) return false;
  const ea = ENCHANTMENTS.get(a), eb = ENCHANTMENTS.get(b);
  if (ea?.exclusive && EXCLUSIVE_SETS[ea.exclusive]?.includes(b)) return false;
  if (eb?.exclusive && EXCLUSIVE_SETS[eb.exclusive]?.includes(a)) return false;
  return true;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** vanilla Enchantment.getFullname: the numeral is left out only for single-level enchantments at level 1 */
export function enchantmentLine(id: string, level: number): { text: string; curse: boolean } {
  const e = ENCHANTMENTS.get(id);
  const name = e?.name ?? id;
  const showLevel = level !== 1 || (e?.maxLevel ?? 1) !== 1;
  return { text: showLevel ? `${name} ${ROMAN[level] ?? `enchantment.level.${level}`}` : name, curse: !!e?.curse };
}

/** enchantments of a map in vanilla tooltip order (ItemEnchantments.addToTooltip) */
export function tooltipOrder(m: Record<string, number>): [string, number][] {
  const out: [string, number][] = [];
  for (const id of TOOLTIP_ORDER) if (m[id] > 0) out.push([id, m[id]]);
  for (const [id, lvl] of Object.entries(m)) if (!TOOLTIP_ORDER.includes(id) && lvl > 0) out.push([id, lvl]);
  return out;
}
