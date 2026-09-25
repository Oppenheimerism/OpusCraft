// The trial chambers' loot (1.21; vanilla data/minecraft/loot_table/spawners/*, chests/trial_chambers/* and
// equipment/*): what a trial spawner throws out once its trial is won (food and potions or a trial key; an ominous
// one more of both, or an ominous trial key), what an ominous spawner drops on the players (lingering potions,
// arrows, fire charges and wind charges), what a vault gives for its key (a rare or common roll, one to three more
// common ones, and sometimes something unique), and what an ominous spawner's mobs are armed with. ('' is an empty
// entry; items the game doesn't have yet, like the armour trim templates, roll nothing.)

import type { Rand } from '../core/rng';
import { ITEMS, ItemStack } from '../item/item';
import { ENCHANTMENTS, canEnchant } from '../item/enchantments';
import { LOOT_TABLES } from './loot';

type LootPool = (typeof LOOT_TABLES)[string][number];
type LootEntry = LootPool['entries'][number];

const e = (item: string, weight: number, count?: [number, number]): LootEntry => ({ item, weight, count });
/** vanilla NestedLootTable.lootTableReference */
const nested = (table: string, weight = 1): LootEntry => ({ item: '', weight, table });
/** vanilla enchant_with_levels (#on_random_loot) */
const levels = (item: string, weight: number, lv: number | [number, number]): LootEntry => ({ item, weight, levels: lv });

/** vanilla set_potion */
const potion = (id: string) => (s: ItemStack): ItemStack => {
  s.tag = { ...s.tag, potion: { potion: id } };
  return s;
};
const withPotion = (item: string, weight: number, id: string, count?: [number, number]): LootEntry => ({ item, weight, count, apply: potion(id) });

/**
 * vanilla EnchantRandomlyFunction with its `options`: one of them at random (a book takes any, anything else only one
 * it can have) at a level from 1 to its most, a book becoming an enchanted book; left as it is when none fits
 */
function enchantOneOf(ids: string[]) {
  return (s: ItemStack, r: Rand): ItemStack => {
    const book = s.item.id === 'book';
    const options = ids.map((id) => ENCHANTMENTS.get(id)).filter((x) => x && (book || canEnchant(x, s.item)));
    if (!options.length) return s;
    const ench = options[r.nextInt(options.length)]!;
    const level = 1 + r.nextInt(ench.maxLevel);
    if (book) return new ItemStack(ITEMS.get('enchanted_book')!, s.count, 0, { stored: { [ench.id]: level } });
    return new ItemStack(s.item, s.count, s.damage, { ...s.tag, enchantments: { ...s.tag?.enchantments, [ench.id]: level } });
  };
}

/** vanilla SetEnchantmentsFunction: these at these levels (a book becoming an enchanted book) */
function setEnchantments(m: Record<string, number>) {
  return (s: ItemStack): ItemStack => {
    const known = Object.fromEntries(Object.entries(m).filter(([id]) => ENCHANTMENTS.has(id)));
    if (s.item.id === 'book') return new ItemStack(ITEMS.get('enchanted_book')!, s.count, 0, { stored: known });
    return new ItemStack(s.item, s.count, s.damage, { ...s.tag, enchantments: { ...s.tag?.enchantments, ...known } });
  };
}

/** vanilla SetItemDamageFunction: this much of its durability left (uniform `lo`-`hi`) */
function damaged(lo: number, hi: number) {
  return (s: ItemStack, r: Rand): ItemStack => {
    const left = lo + r.nextFloat() * (hi - lo);
    if (s.item.maxDamage) s.damage = Math.floor((1 - Math.max(0, Math.min(1, left))) * s.item.maxDamage);
    return s;
  };
}

/** vanilla SetOminousBottleAmplifierFunction: Bad Omen of a level from `lo` + 1 to `hi` + 1 */
function ominousAmplifier(lo: number, hi: number) {
  return (s: ItemStack, r: Rand): ItemStack => {
    s.tag = { ...s.tag, ominousAmplifier: lo + r.nextInt(hi - lo + 1) };
    return s;
  };
}

/** vanilla SetComponentsFunction(TRIM): a copper armour trim of the pattern (the game draws no trims yet: data only) */
const trimmed = (pattern: string) => (s: ItemStack): ItemStack => {
  s.tag = { ...s.tag, trim: { pattern, material: 'copper' } };
  return s;
};

// ---------------------------------------------------------------------------
// what a trial spawner throws out (vanilla TrialSpawnerConfig.lootTablesToEject)

LOOT_TABLES['spawners/trial_chamber/key'] = [{ rolls: 1, entries: [e('trial_key', 1)] }];
LOOT_TABLES['spawners/trial_chamber/consumables'] = [
  {
    rolls: 1,
    entries: [
      e('cooked_chicken', 3, [1, 3]), e('bread', 3, [1, 3]), e('baked_potato', 2, [1, 3]),
      withPotion('potion', 1, 'regeneration'), withPotion('potion', 1, 'swiftness'),
    ],
  },
];
LOOT_TABLES['spawners/ominous/trial_chamber/key'] = [{ rolls: 1, entries: [e('ominous_trial_key', 1)] }];
LOOT_TABLES['spawners/ominous/trial_chamber/consumables'] = [
  {
    rolls: 1,
    entries: [
      e('cooked_beef', 3, [1, 3]), e('baked_potato', 3, [2, 4]), e('golden_carrot', 2, [1, 2]),
      withPotion('potion', 1, 'regeneration'), withPotion('potion', 1, 'strength'),
    ],
  },
];

/**
 * vanilla spawners/trial_chamber/items_to_drop_when_ominous: one roll, made once per spot (TrialSpawnerData
 * .getDispensingItems), so each ominous spawner keeps dropping the same thing
 */
LOOT_TABLES['spawners/trial_chamber/items_to_drop_when_ominous'] = [
  {
    rolls: 1,
    entries: [
      withPotion('lingering_potion', 1, 'wind_charged'), withPotion('lingering_potion', 1, 'oozing'), withPotion('lingering_potion', 1, 'weaving'),
      withPotion('lingering_potion', 1, 'infested'), withPotion('lingering_potion', 1, 'strength'), withPotion('lingering_potion', 1, 'swiftness'),
      withPotion('lingering_potion', 1, 'slow_falling'), e('arrow', 1), withPotion('tipped_arrow', 1, 'poison'),
      withPotion('tipped_arrow', 1, 'strong_slowness'), e('fire_charge', 1), e('wind_charge', 1),
    ],
  },
];

// ---------------------------------------------------------------------------
// what a vault gives for its key (vanilla VaultConfig.lootTable: chests/trial_chambers/reward and reward_ominous)

LOOT_TABLES['chests/trial_chambers/reward_common'] = [
  {
    rolls: 1,
    entries: [
      e('arrow', 4, [2, 8]), withPotion('tipped_arrow', 4, 'poison', [2, 8]), e('emerald', 4, [2, 4]), e('wind_charge', 4, [1, 3]),
      e('iron_ingot', 4, [1, 2]), e('honey_bottle', 4, [1, 2]), { item: 'ominous_bottle', weight: 2, apply: ominousAmplifier(0, 1) },
      e('wind_charge', 1, [4, 12]), e('diamond', 1, [1, 2]),
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward_rare'] = [
  {
    rolls: 1,
    entries: [
      e('emerald', 3, [2, 4]), { item: 'shield', weight: 3, apply: damaged(0.5, 1) }, levels('bow', 3, [5, 15]), levels('crossbow', 2, [5, 20]),
      levels('iron_axe', 2, [5, 15]), levels('iron_chestplate', 2, [5, 15]), e('golden_carrot', 2, [1, 2]),
      { item: 'book', weight: 2, apply: enchantOneOf(['sharpness', 'bane_of_arthropods', 'efficiency', 'fortune', 'silk_touch', 'feather_falling']) },
      { item: 'book', weight: 2, apply: enchantOneOf(['riptide', 'loyalty', 'channeling', 'impaling', 'mending']) },
      levels('diamond_chestplate', 1, [5, 15]), levels('diamond_axe', 1, [5, 15]),
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward_unique'] = [
  {
    rolls: 1,
    entries: [
      e('golden_apple', 4), e('bolt_armor_trim_smithing_template', 3), e('guster_banner_pattern', 2), e('music_disc_precipice', 2), e('trident', 1),
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward'] = [
  { rolls: 1, entries: [nested('chests/trial_chambers/reward_rare', 8), nested('chests/trial_chambers/reward_common', 2)] },
  { rolls: [1, 3], entries: [nested('chests/trial_chambers/reward_common')] },
  { rolls: 1, chance: 0.25, entries: [nested('chests/trial_chambers/reward_unique')] },
];

LOOT_TABLES['chests/trial_chambers/reward_ominous_common'] = [
  {
    rolls: 1,
    entries: [
      e('emerald', 5, [4, 10]), e('wind_charge', 4, [8, 12]), withPotion('tipped_arrow', 3, 'strong_slowness', [4, 12]), e('diamond', 2, [2, 3]),
      { item: 'ominous_bottle', weight: 1, apply: ominousAmplifier(2, 4) },
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward_ominous_rare'] = [
  {
    rolls: 1,
    entries: [
      e('emerald_block', 5), e('iron_block', 4), levels('crossbow', 4, [5, 20]), e('golden_apple', 3), levels('diamond_axe', 3, [10, 20]),
      levels('diamond_chestplate', 3, [10, 20]),
      { item: 'book', weight: 2, apply: enchantOneOf(['knockback', 'punch', 'smite', 'looting', 'multishot']) },
      { item: 'book', weight: 2, apply: enchantOneOf(['breach', 'density']) },
      { item: 'book', weight: 2, apply: setEnchantments({ wind_burst: 1 }) },
      e('diamond_block', 1),
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward_ominous_unique'] = [
  {
    rolls: 1,
    entries: [
      e('enchanted_golden_apple', 3), e('flow_armor_trim_smithing_template', 3), e('flow_banner_pattern', 2), e('music_disc_creator', 1), e('heavy_core', 1),
    ],
  },
];
LOOT_TABLES['chests/trial_chambers/reward_ominous'] = [
  { rolls: 1, entries: [nested('chests/trial_chambers/reward_ominous_rare', 8), nested('chests/trial_chambers/reward_ominous_common', 2)] },
  { rolls: [1, 3], entries: [nested('chests/trial_chambers/reward_ominous_common')] },
  { rolls: 1, chance: 0.75, entries: [nested('chests/trial_chambers/reward_ominous_unique')] },
];

// ---------------------------------------------------------------------------
// what an ominous trial spawner's mobs wear and carry (vanilla VanillaEquipmentLoot; never dropped: their spawn data's
// slot drop chances are 0)

/** vanilla trialChamberEquipment: a helmet and a chestplate, each half the time, with the pattern's copper trim */
const armourSet = (helmet: string, chestplate: string, pattern: string): LootPool[] => [
  { rolls: 1, chance: 0.5, entries: [{ item: helmet, weight: 1, apply: trimmed(pattern) }] },
  { rolls: 1, chance: 0.5, entries: [{ item: chestplate, weight: 1, apply: trimmed(pattern) }] },
];
LOOT_TABLES['equipment/trial_chamber/chainmail'] = armourSet('chainmail_helmet', 'chainmail_chestplate', 'bolt');
LOOT_TABLES['equipment/trial_chamber/iron'] = armourSet('iron_helmet', 'iron_chestplate', 'flow');
LOOT_TABLES['equipment/trial_chamber/diamond'] = armourSet('diamond_helmet', 'diamond_chestplate', 'flow');
LOOT_TABLES['equipment/trial_chamber'] = [
  {
    rolls: 1,
    entries: [nested('equipment/trial_chamber/chainmail', 4), nested('equipment/trial_chamber/iron', 2), nested('equipment/trial_chamber/diamond', 1)],
  },
];
LOOT_TABLES['equipment/trial_chamber_melee'] = [
  {
    rolls: 1,
    entries: [
      e('iron_sword', 4), { item: 'iron_sword', weight: 1, apply: setEnchantments({ sharpness: 1 }) },
      { item: 'iron_sword', weight: 1, apply: setEnchantments({ knockback: 1 }) }, e('diamond_sword', 1),
    ],
  },
  { rolls: 1, entries: [nested('equipment/trial_chamber')] },
];
LOOT_TABLES['equipment/trial_chamber_ranged'] = [
  {
    rolls: 1,
    entries: [e('bow', 2), { item: 'bow', weight: 1, apply: setEnchantments({ power: 1 }) }, { item: 'bow', weight: 1, apply: setEnchantments({ punch: 1 }) }],
  },
  { rolls: 1, entries: [nested('equipment/trial_chamber')] },
];
