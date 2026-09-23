// Enchantments (vanilla data/minecraft/enchantment/*.json): display names,
// level ranges and the tags loot functions pick from. Only the data layer for
// now; the effects arrive with enchanting tables and anvils.

export interface EnchantmentDef {
  id: string;
  name: string;
  maxLevel: number;
  /** red tooltip line (vanilla #curse) */
  curse?: boolean;
  /** vanilla #on_random_loot (enchant_randomly without options) */
  randomLoot: boolean;
}

// prettier-ignore
const DEFS: [string, string, number, ('curse' | 'no_loot')?][] = [
  ['protection', 'Protection', 4], ['fire_protection', 'Fire Protection', 4], ['feather_falling', 'Feather Falling', 4],
  ['blast_protection', 'Blast Protection', 4], ['projectile_protection', 'Projectile Protection', 4], ['respiration', 'Respiration', 3],
  ['aqua_affinity', 'Aqua Affinity', 1], ['thorns', 'Thorns', 3], ['depth_strider', 'Depth Strider', 3], ['frost_walker', 'Frost Walker', 2],
  ['binding_curse', 'Curse of Binding', 1, 'curse'], ['soul_speed', 'Soul Speed', 3, 'no_loot'], ['swift_sneak', 'Swift Sneak', 3, 'no_loot'],
  ['sharpness', 'Sharpness', 5], ['smite', 'Smite', 5], ['bane_of_arthropods', 'Bane of Arthropods', 5], ['knockback', 'Knockback', 2],
  ['fire_aspect', 'Fire Aspect', 2], ['looting', 'Looting', 3], ['sweeping_edge', 'Sweeping Edge', 3], ['efficiency', 'Efficiency', 5],
  ['silk_touch', 'Silk Touch', 1], ['unbreaking', 'Unbreaking', 3], ['fortune', 'Fortune', 3], ['power', 'Power', 5], ['punch', 'Punch', 2],
  ['flame', 'Flame', 1], ['infinity', 'Infinity', 1], ['luck_of_the_sea', 'Luck of the Sea', 3], ['lure', 'Lure', 3],
  ['loyalty', 'Loyalty', 3], ['impaling', 'Impaling', 5], ['riptide', 'Riptide', 3], ['channeling', 'Channeling', 1],
  ['multishot', 'Multishot', 1], ['quick_charge', 'Quick Charge', 3], ['piercing', 'Piercing', 4], ['density', 'Density', 5],
  ['breach', 'Breach', 4], ['wind_burst', 'Wind Burst', 3, 'no_loot'], ['mending', 'Mending', 1], ['vanishing_curse', 'Curse of Vanishing', 1, 'curse'],
];

export const ENCHANTMENTS = new Map<string, EnchantmentDef>();
for (const [id, name, maxLevel, flag] of DEFS) ENCHANTMENTS.set(id, { id, name, maxLevel, curse: flag === 'curse' || undefined, randomLoot: flag !== 'no_loot' });

/** vanilla #on_random_loot, in registry order */
export const RANDOM_LOOT_ENCHANTMENTS: EnchantmentDef[] = [...ENCHANTMENTS.values()].filter((e) => e.randomLoot);

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** vanilla Enchantment.getFullname: the numeral is left out only for single-level enchantments at level 1 */
export function enchantmentLine(id: string, level: number): { text: string; curse: boolean } {
  const e = ENCHANTMENTS.get(id);
  const name = e?.name ?? id;
  const showLevel = level !== 1 || (e?.maxLevel ?? 1) !== 1;
  return { text: showLevel ? `${name} ${ROMAN[level] ?? `enchantment.level.${level}`}` : name, curse: !!e?.curse };
}
