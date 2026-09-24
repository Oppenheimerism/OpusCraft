// vanilla EnchantmentHelper: enchantment levels on items and equipment, the
// enchanting table's cost and selection rolls, and the gameplay effects that
// vanilla 1.21 expresses as enchantment effect components (damage, knockback,
// damage protection, item damage, repair with XP, attributes...).

import type { JavaRandom } from '../core/rng';
import { ENCHANTMENTS, EnchantmentDef, EnchantSlots, TABLE_ENCHANTMENTS, areCompatible, isPrimaryItem, maxCost, minCost } from './enchantments';
import type { Item, ItemStack } from './item';

/** what the enchanting rolls draw from: the table's java.util.Random, or a mob's own random (spawn equipment) */
export interface EnchantRandom {
  nextInt(n: number): number;
  nextFloat(): number;
}

// ---------------------------------------------------------------------------
// levels

/** level of an enchantment on a stack (enchanted books store theirs instead: those don't count) */
export function levelOf(s: ItemStack | null | undefined, id: string): number {
  return s?.tag?.enchantments?.[id] ?? 0;
}

/** vanilla EnchantmentHelper.getEnchantmentsForCrafting: an enchanted book's stored enchantments, else the item's */
export function craftingEnchants(s: ItemStack): Record<string, number> {
  return (s.item.id === 'enchanted_book' ? s.tag?.stored : s.tag?.enchantments) ?? {};
}

/** vanilla EnchantmentHelper.hasAnyEnchantments */
export function hasAnyEnchantments(s: ItemStack): boolean {
  return Object.keys(s.tag?.enchantments ?? {}).length > 0 || Object.keys(s.tag?.stored ?? {}).length > 0;
}

/** replace a stack's enchantments (stored ones for enchanted books), dropping the component when empty */
export function setCraftingEnchants(s: ItemStack, m: Record<string, number>): void {
  const key = s.item.id === 'enchanted_book' ? 'stored' : 'enchantments';
  const tag = s.tag ?? {};
  if (Object.keys(m).length) tag[key] = { ...m };
  else delete tag[key];
  s.tag = Object.keys(tag).length ? tag : null;
}

export type EquipSlot = 'mainhand' | 'offhand' | 'feet' | 'legs' | 'chest' | 'head';

interface EquipmentHolder {
  inventory?: { selectedItem: ItemStack | null; offhand: ItemStack | null; armor: (ItemStack | null)[] };
  mainHand?: ItemStack | null;
  /** (a piglin's: the gold it admires) */
  offHand?: ItemStack | null;
  /** a mob's armour slots: feet, legs, chest, head (vanilla Mob.armorItems) */
  armorItems?: (ItemStack | null)[];
}

/** a player's inventory, told apart from anything else by that name */
function playerInventory(h: EquipmentHolder): EquipmentHolder['inventory'] | null {
  const inv = h.inventory;
  return inv && Array.isArray(inv.armor) ? inv : null;
}

/** an entity's equipment in vanilla EquipmentSlot order: the hands, then the armour (a player's inventory, a mob's slots) */
export function equipment(e: unknown): [EquipSlot, ItemStack][] {
  const out: [EquipSlot, ItemStack][] = [];
  const h = e as EquipmentHolder;
  const push = (slot: EquipSlot, s: ItemStack | null | undefined) => {
    if (s && s.count > 0) out.push([slot, s]);
  };
  const inv = playerInventory(h);
  if (inv) {
    push('mainhand', inv.selectedItem);
    push('offhand', inv.offhand);
    push('feet', inv.armor[0]);
    push('legs', inv.armor[1]);
    push('chest', inv.armor[2]);
    push('head', inv.armor[3]);
  } else {
    push('mainhand', h.mainHand);
    push('offhand', h.offHand);
    const a = h.armorItems;
    if (a) {
      push('feet', a[0]);
      push('legs', a[1]);
      push('chest', a[2]);
      push('head', a[3]);
    }
  }
  return out;
}

/** vanilla EquipmentSlotGroup.test */
export function slotMatches(group: EnchantSlots, slot: EquipSlot): boolean {
  if (group === 'any') return true;
  if (group === 'armor') return slot === 'feet' || slot === 'legs' || slot === 'chest' || slot === 'head';
  return group === slot;
}

/** vanilla EnchantmentHelper.getEnchantmentLevel(enchantment, entity): the highest level worn or held in its slots */
export function entityLevel(e: unknown, id: string): number {
  const def = ENCHANTMENTS.get(id);
  if (!def) return 0;
  let max = 0;
  for (const [slot, s] of equipment(e)) if (slotMatches(def.slots, slot)) max = Math.max(max, levelOf(s, id));
  return max;
}

/** levels summed over the enchantment's slots: attribute modifiers from each piece stack */
export function sumLevels(e: unknown, id: string): number {
  const def = ENCHANTMENTS.get(id);
  if (!def) return 0;
  let n = 0;
  for (const [slot, s] of equipment(e)) if (slotMatches(def.slots, slot)) n += levelOf(s, id);
  return n;
}

/** the item held in the main hand (vanilla getWeaponItem) */
export function weaponOf(e: unknown): ItemStack | null {
  const h = e as EquipmentHolder;
  const inv = playerInventory(h);
  return (inv ? inv.selectedItem : h.mainHand) ?? null;
}

// ---------------------------------------------------------------------------
// the enchanting table (vanilla EnchantmentHelper.getEnchantmentCost / selectEnchantment)

const TIER_VALUE: Record<string, number> = { wooden: 15, stone: 5, iron: 14, golden: 22, diamond: 10, netherite: 15 };
const ARMOR_VALUE: Record<string, number> = { leather: 15, chainmail: 12, iron: 9, golden: 25, diamond: 10, netherite: 15, turtle: 9 };

/** vanilla Item.getEnchantmentValue: tool tier / armour material enchantability, 1 for books, bows, crossbows, tridents and rods */
export function enchantmentValue(it: Item): number {
  if (it.id === 'book' || it.id === 'bow' || it.id === 'crossbow' || it.id === 'trident' || it.id === 'fishing_rod') return 1;
  const mat = it.id.split('_')[0];
  if (it.tool && it.tool.type !== 'shears') return TIER_VALUE[mat] ?? 0;
  if (it.armor) return ARMOR_VALUE[mat] ?? 0;
  return 0;
}

/** vanilla ItemStack.isEnchantable: a single unenchanted damageable item, or one book */
export function isEnchantable(s: ItemStack): boolean {
  if (s.item.id === 'book') return s.count === 1;
  return s.item.maxStack === 1 && s.item.maxDamage > 0 && !s.isEnchanted();
}

/** vanilla getEnchantmentCost: the level an offer costs, from the bookshelf count */
export function getEnchantmentCost(r: JavaRandom, slot: number, power: number, s: ItemStack): number {
  if (enchantmentValue(s.item) <= 0) return 0;
  if (power > 15) power = 15;
  const j = r.nextInt(8) + 1 + (power >> 1) + r.nextInt(power + 1);
  if (slot === 0) return Math.max(Math.floor(j / 3), 1);
  return slot === 1 ? Math.floor((j * 2) / 3) + 1 : Math.max(j, power * 2);
}

export interface EnchantmentInstance {
  def: EnchantmentDef;
  level: number;
}

/** vanilla getAvailableEnchantmentResults: the highest level of each enchantment whose cost window holds `level` */
export function availableResults(level: number, s: ItemStack, pool: EnchantmentDef[]): EnchantmentInstance[] {
  const out: EnchantmentInstance[] = [];
  const book = s.item.id === 'book';
  for (const e of pool) {
    if (!book && !isPrimaryItem(e, s.item)) continue;
    for (let i = e.maxLevel; i >= 1; i--) {
      if (level >= minCost(e, i) && level <= maxCost(e, i)) {
        out.push({ def: e, level: i });
        break;
      }
    }
  }
  return out;
}

/** vanilla WeightedRandom.getRandomItem */
function weightedPick(r: EnchantRandom, list: EnchantmentInstance[]): EnchantmentInstance | null {
  let total = 0;
  for (const x of list) total += x.def.weight;
  if (total <= 0) return null;
  let k = r.nextInt(total);
  for (const x of list) {
    k -= x.def.weight;
    if (k < 0) return x;
  }
  return null;
}

const f32 = Math.fround;

/** vanilla selectEnchantment: enchantability bonus, ±15% spread, then weighted picks while nextInt(50) <= level (halving) */
export function selectEnchantment(r: EnchantRandom, s: ItemStack, level: number, pool: EnchantmentDef[]): EnchantmentInstance[] {
  const list: EnchantmentInstance[] = [];
  const i = enchantmentValue(s.item);
  if (i <= 0) return list;
  level += 1 + r.nextInt(Math.floor(i / 4) + 1) + r.nextInt(Math.floor(i / 4) + 1);
  const a = r.nextFloat(), b = r.nextFloat();
  const f = f32(f32(f32(a + b) - 1) * f32(0.15));
  level = Math.max(1, Math.floor(f32(level + f32(level * f)) + 0.5));
  let avail = availableResults(level, s, pool);
  if (avail.length) {
    const first = weightedPick(r, avail);
    if (first) list.push(first);
    while (r.nextInt(50) <= level) {
      if (list.length) {
        const last = list[list.length - 1].def.id;
        avail = avail.filter((x) => areCompatible(last, x.def.id));
      }
      if (!avail.length) break;
      const next = weightedPick(r, avail);
      if (next) list.push(next);
      level = Math.floor(level / 2);
    }
  }
  return list;
}

/**
 * vanilla EnchantmentHelper.enchantItemFromProvider(MOB_SPAWN_EQUIPMENT): EnchantmentsByCostWithDifficulty(
 * #on_mob_spawn_equipment, 5, 17), a cost of 5 to 5 + (int)(special × 17) drawn from the non-treasure enchantments;
 * each result upgrades what the item already has
 */
export function enchantMobSpawnEquipment(s: ItemStack, special: number, r: EnchantRandom): void {
  const max = 5 + Math.trunc(f32(special * 17));
  const cost = r.nextInt(max - 5 + 1) + 5;
  const m: Record<string, number> = { ...(s.tag?.enchantments ?? {}) };
  let any = false;
  for (const e of selectEnchantment(r, s, cost, TABLE_ENCHANTMENTS)) {
    m[e.def.id] = Math.max(m[e.def.id] ?? 0, e.level);
    any = true;
  }
  if (any) s.tag = { ...(s.tag ?? {}), enchantments: m };
}

// ---------------------------------------------------------------------------
// item damage (vanilla ItemStack.hurtAndBreak + unbreaking's item_damage effect)

/** vanilla processDurabilityChange: unbreaking cancels each point with chance L/(L+1) (armour: 0.4·L/(L+1)) */
export function durabilityChange(s: ItemStack, amount: number, rand: () => number = Math.random): number {
  const l = levelOf(s, 'unbreaking');
  if (l <= 0 || amount <= 0) return amount;
  const chance = s.item.armor ? f32(f32(2 + 2 * (l - 1)) / f32(10 + 5 * (l - 1))) : f32(f32(1 + (l - 1)) / f32(2 + (l - 1)));
  let removed = 0;
  for (let j = 0; j < amount; j++) if (f32(rand()) < chance) removed++;
  return amount - removed;
}

/** vanilla hurtAndBreak: damage a stack (not for players with infinite materials); true when it broke (count shrunk) */
export function hurtAndBreak(s: ItemStack, amount: number, infinite = false, rand?: () => number): boolean {
  if (!s.item.maxDamage || infinite) return false;
  if (amount > 0) {
    amount = durabilityChange(s, amount, rand);
    if (amount <= 0) return false;
  }
  s.damage += amount;
  if (s.damage >= s.item.maxDamage) {
    s.count--;
    s.damage = 0;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// combat

/** vanilla #sensitive_to_bane_of_arthropods (#arthropod) */
const ARTHROPODS = new Set(['spider', 'cave_spider', 'bee', 'endermite', 'silverfish']);

/**
 * vanilla EnchantmentHelper.modifyDamage for a weapon: sharpness +0.5·L+0.5 on anything, smite +2.5·L on
 * #sensitive_to_smite (undead), bane of arthropods +2.5·L on arthropods
 */
export function damageBonus(weapon: ItemStack | null, target: { type: string; isUndead?: () => boolean }): number {
  if (!weapon?.tag?.enchantments) return 0;
  let f = 0;
  const sh = levelOf(weapon, 'sharpness');
  if (sh > 0) f += 1 + 0.5 * (sh - 1);
  const sm = levelOf(weapon, 'smite');
  if (sm > 0 && target.isUndead?.()) f += 2.5 * sm;
  const ba = levelOf(weapon, 'bane_of_arthropods');
  if (ba > 0 && ARTHROPODS.has(target.type)) f += 2.5 * ba;
  const im = levelOf(weapon, 'impaling');
  if (im > 0 && SENSITIVE_TO_IMPALING.has(target.type)) f += 2.5 * im;
  return f;
}

/** vanilla #sensitive_to_impaling: what lives in the water */
const SENSITIVE_TO_IMPALING = new Set(['axolotl', 'cod', 'dolphin', 'elder_guardian', 'glow_squid', 'guardian', 'pufferfish', 'salmon', 'squid', 'tadpole', 'tropical_fish', 'turtle']);

/** bane of arthropods' post-attack slowness IV for 1.5 to 1.5 + 0.5·(L-1) seconds (null when it doesn't apply) */
export function baneSlowness(weapon: ItemStack | null, target: { type: string }): number | null {
  const l = levelOf(weapon, 'bane_of_arthropods');
  if (l <= 0 || !ARTHROPODS.has(target.type)) return null;
  const max = 1.5 + 0.5 * (l - 1);
  return Math.round((Math.random() * (max - 1.5) + 1.5) * 20);
}

/** vanilla fire aspect post-attack: the victim burns for 4·L seconds */
export function fireAspectSeconds(weapon: ItemStack | null): number {
  const l = levelOf(weapon, 'fire_aspect');
  return l > 0 ? 4 * l : 0;
}

/** vanilla Player.SWEEPING_DAMAGE_RATIO from sweeping edge: L/(L+1) */
export function sweepingRatio(e: unknown): number {
  const l = entityLevel(e, 'sweeping_edge');
  return l > 0 ? l / (l + 1) : 0;
}

// ---------------------------------------------------------------------------
// protection and armour effects

const FIRE = new Set(['onFire', 'inFire', 'lava', 'hotFloor', 'fireball', 'campfire']);
const EXPLOSION = new Set(['explosion', 'playerExplosion', 'fireworks', 'badRespawnPoint']);
const PROJECTILE = new Set(['arrow', 'thrown', 'fireball', 'mobProjectile', 'trident', 'witherSkull']);
const FALL = new Set(['fall', 'stalagmite', 'enderPearl']);

/**
 * vanilla EnchantmentHelper.getDamageProtection: protection L, fire / blast / projectile protection 2·L on their
 * damage, feather falling 3·L on falls, summed over the armour worn (nothing blocks void and /kill damage)
 */
export function damageProtection(e: unknown, source: string): number {
  if (source === 'void' || source === 'genericKill') return 0;
  let f = 0;
  for (const [slot, s] of equipment(e)) {
    const m = s.tag?.enchantments;
    if (!m) continue;
    for (const id in m) {
      const def = ENCHANTMENTS.get(id);
      const l = m[id];
      if (!def || l <= 0 || !slotMatches(def.slots, slot)) continue;
      if (id === 'protection') f += l;
      else if (id === 'fire_protection' && FIRE.has(source)) f += 2 * l;
      else if (id === 'blast_protection' && EXPLOSION.has(source)) f += 2 * l;
      else if (id === 'projectile_protection' && PROJECTILE.has(source)) f += 2 * l;
      else if (id === 'feather_falling' && FALL.has(source)) f += 3 * l;
    }
  }
  return f;
}

/** vanilla CombatRules.getDamageAfterMagicAbsorb: 4% less per point, capped at 20 points (80%) */
export function damageAfterProtection(amount: number, protection: number): number {
  const f = Math.max(0, Math.min(20, protection));
  return amount * (1 - f / 25);
}

/** vanilla BURNING_TIME attribute: fire protection shortens burning by 15% per level worn */
export function burningTimeFactor(e: unknown): number {
  return Math.max(0, 1 - 0.15 * sumLevels(e, 'fire_protection'));
}

/** vanilla EXPLOSION_KNOCKBACK_RESISTANCE: blast protection resists 15% of blast knockback per level */
export function explosionKnockbackResistance(e: unknown): number {
  return Math.min(1, 0.15 * sumLevels(e, 'blast_protection'));
}

/** vanilla OXYGEN_BONUS (respiration level): air is kept with chance L/(L+1) */
export function oxygenBonus(e: unknown): number {
  return sumLevels(e, 'respiration');
}

/** vanilla WATER_MOVEMENT_EFFICIENCY from depth strider: L/3, at most 1 */
export function waterMovementEfficiency(e: unknown): number {
  return Math.min(1, f32(0.33333334) * sumLevels(e, 'depth_strider'));
}

/** vanilla SUBMERGED_MINING_SPEED: 0.2, times 5 with aqua affinity */
export function submergedMiningSpeed(e: unknown): number {
  return Math.min(20, 0.2 * (1 + 4 * sumLevels(e, 'aqua_affinity')));
}

/** vanilla MINING_EFFICIENCY from efficiency: L² + 1 (added when the tool is faster than bare hands) */
export function miningEfficiency(e: unknown): number {
  const l = entityLevel(e, 'efficiency');
  return l > 0 ? l * l + 1 : 0;
}

/** vanilla thorns: chance 15% per level for each worn piece */
export function thornsPieces(e: unknown): [EquipSlot, ItemStack, number][] {
  const out: [EquipSlot, ItemStack, number][] = [];
  for (const [slot, s] of equipment(e)) {
    const l = levelOf(s, 'thorns');
    if (l > 0 && slotMatches('armor', slot)) out.push([slot, s, l]);
  }
  return out;
}

/** vanilla curse of binding (prevent_armor_change) */
export function hasBinding(s: ItemStack | null | undefined): boolean {
  return levelOf(s, 'binding_curse') > 0;
}

/** vanilla curse of vanishing (prevent_equipment_drop) */
export function hasVanishing(s: ItemStack | null | undefined): boolean {
  return levelOf(s, 'vanishing_curse') > 0;
}

// ---------------------------------------------------------------------------
// mending (vanilla ExperienceOrb.repairPlayerItems)

/** a random damaged mending item worn or held soaks up the orb, 2 durability per point; returns the XP left over */
export function repairWithXp(e: unknown, value: number, rand: () => number = Math.random): number {
  const list: ItemStack[] = [];
  for (const [, s] of equipment(e)) if (s.damage > 0 && s.item.maxDamage > 0 && levelOf(s, 'mending') > 0) list.push(s);
  if (!list.length) return value;
  const s = list[Math.floor(rand() * list.length)];
  const i = Math.floor(value * 2);
  const j = Math.min(i, s.damage);
  s.damage -= j;
  if (j > 0) {
    const k = value - Math.floor((j * value) / i);
    if (k > 0) return repairWithXp(e, k, rand);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// looting (vanilla EnchantedCountIncreaseFunction / RandomChanceWithEnchantedBonus / equipment drops)

/** extra drops: round(L × uniform(0, 1)) */
export function lootingBonus(level: number, rand: () => number): number {
  return level > 0 ? Math.round(level * rand()) : 0;
}

// ---------------------------------------------------------------------------
// fortune (vanilla ApplyBonusCount formulas and BonusLevelTableCondition)

interface LootRandom {
  nextInt(n: number): number;
  next(): number;
}

/** ApplyBonusCount.OreDrops: count × (max(0, nextInt(L + 2) − 1) + 1) */
export function oreDrops(r: LootRandom, count: number, fortune: number): number {
  if (fortune <= 0) return count;
  return count * (Math.max(0, r.nextInt(fortune + 2) - 1) + 1);
}

/** ApplyBonusCount.UniformBonusCount: count + nextInt(multiplier·L + 1) */
export function uniformBonus(r: LootRandom, count: number, multiplier: number, fortune: number): number {
  return count + r.nextInt(multiplier * fortune + 1);
}

/** BonusLevelTableCondition: the chance for the fortune level (the last one for anything higher) */
export function tableBonus(r: LootRandom, chances: readonly number[], fortune: number): boolean {
  return r.next() < chances[Math.min(fortune, chances.length - 1)];
}
