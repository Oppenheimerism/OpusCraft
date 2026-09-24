// Potions (vanilla Potion and Potions, PotionContents, PotionBrewing, and the potion items' names and tooltips,
// 1.21): the registry of potions with their effects, a stack's contents (the minecraft:potion_contents component,
// ItemTag.potion), its colour, name and tooltip lines, the creative tabs' stacks, and the brewing stand's mixes.

import { MOB_EFFECTS, MobEffectInstance, loadEffect, type EffectModifier } from '../entity/effects';
import { ITEMS, ItemStack, getItem, type Item, type PotionContents } from './item';

export interface Potion {
  readonly id: string;
  /** vanilla Potion.name: the base its long_ and strong_ forms share, which names them all */
  readonly name: string;
  /** [effect, duration in ticks, amplifier] */
  readonly effects: readonly (readonly [string, number, number])[];
}

/** vanilla BuiltInRegistries.POTION, in registration order (the creative tabs list them so) */
export const POTIONS = new Map<string, Potion>();

function potion(id: string, name: string | null, ...effects: [string, number, number?][]): void {
  POTIONS.set(id, { id, name: name ?? id, effects: effects.map(([e, d, a]) => [e, d, a ?? 0] as const) });
}

// vanilla Potions
potion('water', null);
potion('mundane', null);
potion('thick', null);
potion('awkward', null);
potion('night_vision', null, ['night_vision', 3600]);
potion('long_night_vision', 'night_vision', ['night_vision', 9600]);
potion('invisibility', null, ['invisibility', 3600]);
potion('long_invisibility', 'invisibility', ['invisibility', 9600]);
potion('leaping', null, ['jump_boost', 3600]);
potion('long_leaping', 'leaping', ['jump_boost', 9600]);
potion('strong_leaping', 'leaping', ['jump_boost', 1800, 1]);
potion('fire_resistance', null, ['fire_resistance', 3600]);
potion('long_fire_resistance', 'fire_resistance', ['fire_resistance', 9600]);
potion('swiftness', null, ['speed', 3600]);
potion('long_swiftness', 'swiftness', ['speed', 9600]);
potion('strong_swiftness', 'swiftness', ['speed', 1800, 1]);
potion('slowness', null, ['slowness', 1800]);
potion('long_slowness', 'slowness', ['slowness', 4800]);
potion('strong_slowness', 'slowness', ['slowness', 400, 3]);
potion('turtle_master', 'turtle_master', ['slowness', 400, 3], ['resistance', 400, 2]);
potion('long_turtle_master', 'turtle_master', ['slowness', 800, 3], ['resistance', 800, 2]);
potion('strong_turtle_master', 'turtle_master', ['slowness', 400, 5], ['resistance', 400, 3]);
potion('water_breathing', null, ['water_breathing', 3600]);
potion('long_water_breathing', 'water_breathing', ['water_breathing', 9600]);
potion('healing', null, ['instant_health', 1]);
potion('strong_healing', 'healing', ['instant_health', 1, 1]);
potion('harming', null, ['instant_damage', 1]);
potion('strong_harming', 'harming', ['instant_damage', 1, 1]);
potion('poison', null, ['poison', 900]);
potion('long_poison', 'poison', ['poison', 1800]);
potion('strong_poison', 'poison', ['poison', 432, 1]);
potion('regeneration', null, ['regeneration', 900]);
potion('long_regeneration', 'regeneration', ['regeneration', 1800]);
potion('strong_regeneration', 'regeneration', ['regeneration', 450, 1]);
potion('strength', null, ['strength', 3600]);
potion('long_strength', 'strength', ['strength', 9600]);
potion('strong_strength', 'strength', ['strength', 1800, 1]);
potion('weakness', null, ['weakness', 1800]);
potion('long_weakness', 'weakness', ['weakness', 4800]);
potion('luck', 'luck', ['luck', 6000]);
potion('slow_falling', null, ['slow_falling', 1800]);
potion('long_slow_falling', 'slow_falling', ['slow_falling', 4800]);
potion('wind_charged', 'wind_charged', ['wind_charged', 3600]);
potion('weaving', 'weaving', ['weaving', 3600]);
potion('oozing', 'oozing', ['oozing', 3600]);
potion('infested', 'infested', ['infested', 3600]);

/** vanilla PotionContents.BASE_POTION_COLOR (-13083194): water, and anything without a visible effect */
export const BASE_POTION_COLOR = 0x385dc6;

/** the items that carry potion contents */
export const POTION_ITEMS = ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow'];

/** vanilla PotionContents.createItemStack: a new stack of `item` holding `potion` */
export function potionStack(item: string | Item, potion: string, count = 1): ItemStack {
  return new ItemStack(typeof item === 'string' ? getItem(item) : item, count, 0, { potion: { potion } });
}

/** the stack's potion contents (vanilla getOrDefault(POTION_CONTENTS, EMPTY)) */
export function contentsOf(s: ItemStack | null | undefined): PotionContents | undefined {
  return s?.tag?.potion;
}

/** the potion's own effects, as new instances */
export function potionEffects(id: string | undefined): MobEffectInstance[] {
  const p = id ? POTIONS.get(id) : undefined;
  if (!p) return [];
  return p.effects.flatMap(([e, d, a]) => (MOB_EFFECTS[e] ? [new MobEffectInstance(MOB_EFFECTS[e], d, a)] : []));
}

/** vanilla PotionContents.getAllEffects: the potion's, then the custom ones */
export function allEffects(c: PotionContents | undefined): MobEffectInstance[] {
  if (!c) return [];
  const out = potionEffects(c.potion);
  for (const d of c.customEffects ?? []) {
    const e = loadEffect(d);
    if (e) out.push(e);
  }
  return out;
}

/**
 * vanilla PotionContents.getColorOptional: the effects' colours averaged, each weighed by its level (amplifier + 1);
 * only visible ones count; null when there are none
 */
export function effectsColor(effects: readonly MobEffectInstance[]): number | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (const e of effects) {
    if (!e.visible) continue;
    const c = e.effect.color, k = e.amplifier + 1;
    r += k * ((c >> 16) & 255);
    g += k * ((c >> 8) & 255);
    b += k * (c & 255);
    n += k;
  }
  return n ? (Math.floor(r / n) << 16) | (Math.floor(g / n) << 8) | Math.floor(b / n) : null;
}

const PLAIN_COLOR = new Map<string, number>();

/** vanilla PotionContents.getColor: the custom colour, water's blue, or the effects' */
export function potionColor(c: PotionContents | undefined): number {
  if (c?.customColor !== undefined) return c.customColor & 0xffffff;
  if (c?.potion === 'water') return BASE_POTION_COLOR;
  // (a potion without custom effects is always the same colour: drawn often, worked out once)
  const plain = c?.potion !== undefined && !c.customEffects?.length ? c.potion : null;
  const known = plain !== null ? PLAIN_COLOR.get(plain) : undefined;
  if (known !== undefined) return known;
  const col = effectsColor(allEffects(c)) ?? BASE_POTION_COLOR;
  if (plain !== null) PLAIN_COLOR.set(plain, col);
  return col;
}

// ---------------------------------------------------------------------------
// names (vanilla Potion.getName → item.minecraft.<item>.effect.<name>)

/** what "Potion of X" calls each potion base */
const EFFECT_NAMES: Record<string, string> = {
  night_vision: 'Night Vision', invisibility: 'Invisibility', leaping: 'Leaping', fire_resistance: 'Fire Resistance',
  swiftness: 'Swiftness', slowness: 'Slowness', turtle_master: 'the Turtle Master', water_breathing: 'Water Breathing',
  healing: 'Healing', harming: 'Harming', poison: 'Poison', regeneration: 'Regeneration', strength: 'Strength',
  weakness: 'Weakness', luck: 'Luck', slow_falling: 'Slow Falling', levitation: 'Levitation', wind_charged: 'Wind Charging',
  weaving: 'Weaving', oozing: 'Oozing', infested: 'Infestation',
};

/** the plain potions' names, per item: [potion, splash, lingering, tipped arrow] */
const PLAIN_NAMES: Record<string, [string, string, string, string]> = {
  water: ['Water Bottle', 'Splash Water Bottle', 'Lingering Water Bottle', 'Arrow of Splashing'],
  mundane: ['Mundane Potion', 'Mundane Splash Potion', 'Mundane Lingering Potion', 'Tipped Arrow'],
  thick: ['Thick Potion', 'Thick Splash Potion', 'Thick Lingering Potion', 'Tipped Arrow'],
  awkward: ['Awkward Potion', 'Awkward Splash Potion', 'Awkward Lingering Potion', 'Tipped Arrow'],
  empty: ['Uncraftable Potion', 'Splash Uncraftable Potion', 'Lingering Uncraftable Potion', 'Uncraftable Tipped Arrow'],
};
const PREFIX = ['Potion of ', 'Splash Potion of ', 'Lingering Potion of ', 'Arrow of '];

/** the name of `item` (potion, splash_potion, lingering_potion, tipped_arrow) holding these contents */
export function potionName(item: string, c: PotionContents | undefined): string {
  const k = Math.max(0, POTION_ITEMS.indexOf(item));
  const p = c?.potion !== undefined ? POTIONS.get(c.potion) : undefined;
  // (vanilla: a potion the registry doesn't know is named by its id, one that's missing is "empty")
  const base = p ? p.name : c?.potion !== undefined ? c.potion : 'empty';
  const plain = PLAIN_NAMES[base];
  if (plain) return plain[k];
  return PREFIX[k] + (EFFECT_NAMES[base] ?? base);
}

// ---------------------------------------------------------------------------
// tooltips (vanilla PotionContents.addPotionTooltip)

const POTENCY = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** vanilla MobEffectUtil.formatDuration: the duration scaled by the item's factor, mm:ss (hh:mm:ss past an hour) */
export function formatScaledDuration(e: MobEffectInstance, factor: number): string {
  if (e.isInfinite()) return '∞';
  let s = Math.floor(Math.floor(e.duration * factor) / 20);
  let m = Math.floor(s / 60);
  s %= 60;
  const h = Math.floor(m / 60);
  m %= 60;
  const two = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${two(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** vanilla ItemAttributeModifiers.ATTRIBUTE_MODIFIER_FORMAT (#.##) */
function decimal(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/**
 * vanilla PotionContents.addPotionTooltip: each effect ("Name II (mm:ss)", blue when it's good or neutral, red
 * when harmful; no time for one that's over within a second), "No Effects" when there are none, then the
 * attribute changes they make under "When Applied:". `factor` scales the durations as the item gives them:
 * 1 drunk or splashed, 0.25 from a lingering cloud, 0.125 on an arrow.
 */
export function addPotionTooltip(effects: readonly MobEffectInstance[], lines: string[], factor: number): void {
  const mods: [EffectModifier, number][] = [];
  for (const e of effects) {
    let t = e.effect.name;
    for (const m of e.effect.modifiers ?? []) mods.push([m, e.amplifier]);
    if (e.amplifier > 0) t += ' ' + (POTENCY[e.amplifier] ?? `potion.potency.${e.amplifier}`);
    if (!e.endsWithin(20)) t += ` (${formatScaledDuration(e, factor)})`;
    lines.push((e.effect.category === 'harmful' ? '§c' : '§9') + t);
  }
  if (!effects.length) lines.push('§7No Effects');
  if (!mods.length) return;
  lines.push('', '§5When Applied:');
  for (const [m, amp] of mods) {
    const amount = m.amount * (amp + 1);
    const shown = decimal(Math.abs(m.multiplied ? amount * 100 : amount)) + (m.multiplied ? '%' : '');
    if (amount > 0) lines.push(`§9+${shown} ${m.attribute}`);
    else if (amount < 0) lines.push(`§c-${shown} ${m.attribute}`);
  }
}

/** vanilla's per-item duration factors in their tooltips */
const TOOLTIP_FACTOR: Record<string, number> = { potion: 1, splash_potion: 1, lingering_potion: 0.25, tipped_arrow: 0.125 };

// the items' names, tooltips and creative stacks
for (const id of POTION_ITEMS) {
  const it = ITEMS.get(id);
  if (!it) continue;
  it.stackName = (s) => potionName(id, contentsOf(s));
  it.hoverText = (s, lines) => {
    // (vanilla: only a stack that has the component shows anything)
    const c = contentsOf(s);
    if (c) addPotionTooltip(allEffects(c), lines, TOOLTIP_FACTOR[id]);
  };
  // vanilla CreativeModeTabs.generatePotionEffectTypes: one stack per potion, in registry order
  it.creativeStacks = () => [...POTIONS.keys()].map((p) => potionStack(it, p));
}

// ---------------------------------------------------------------------------
// brewing (vanilla PotionBrewing.addVanillaMixes)

/** vanilla PotionBrewing containers: what a potion slot brews in */
const CONTAINERS = new Set(['potion', 'splash_potion', 'lingering_potion']);
/** [from item, ingredient, to item] */
const CONTAINER_MIXES: [string, string, string][] = [];
/** [from potion, ingredient, to potion] */
const POTION_MIXES: [string, string, string][] = [];

{
  const containerMix = (from: string, ing: string, to: string) => CONTAINER_MIXES.push([from, ing, to]);
  const mix = (from: string, ing: string, to: string) => POTION_MIXES.push([from, ing, to]);
  /** vanilla addStartMix: in water it only makes a mundane potion, in an awkward one the real thing */
  const startMix = (ing: string, to: string) => {
    mix('water', ing, 'mundane');
    mix('awkward', ing, to);
  };
  containerMix('potion', 'gunpowder', 'splash_potion');
  containerMix('splash_potion', 'dragon_breath', 'lingering_potion');
  mix('water', 'glowstone_dust', 'thick');
  mix('water', 'redstone', 'mundane');
  mix('water', 'nether_wart', 'awkward');
  startMix('breeze_rod', 'wind_charged');
  startMix('slime_block', 'oozing');
  startMix('stone', 'infested');
  startMix('cobweb', 'weaving');
  mix('awkward', 'golden_carrot', 'night_vision');
  mix('night_vision', 'redstone', 'long_night_vision');
  mix('night_vision', 'fermented_spider_eye', 'invisibility');
  mix('long_night_vision', 'fermented_spider_eye', 'long_invisibility');
  mix('invisibility', 'redstone', 'long_invisibility');
  startMix('magma_cream', 'fire_resistance');
  mix('fire_resistance', 'redstone', 'long_fire_resistance');
  startMix('rabbit_foot', 'leaping');
  mix('leaping', 'redstone', 'long_leaping');
  mix('leaping', 'glowstone_dust', 'strong_leaping');
  mix('leaping', 'fermented_spider_eye', 'slowness');
  mix('long_leaping', 'fermented_spider_eye', 'long_slowness');
  mix('slowness', 'redstone', 'long_slowness');
  mix('slowness', 'glowstone_dust', 'strong_slowness');
  mix('awkward', 'turtle_helmet', 'turtle_master');
  mix('turtle_master', 'redstone', 'long_turtle_master');
  mix('turtle_master', 'glowstone_dust', 'strong_turtle_master');
  mix('swiftness', 'fermented_spider_eye', 'slowness');
  mix('long_swiftness', 'fermented_spider_eye', 'long_slowness');
  startMix('sugar', 'swiftness');
  mix('swiftness', 'redstone', 'long_swiftness');
  mix('swiftness', 'glowstone_dust', 'strong_swiftness');
  mix('awkward', 'pufferfish', 'water_breathing');
  mix('water_breathing', 'redstone', 'long_water_breathing');
  startMix('glistering_melon_slice', 'healing');
  mix('healing', 'glowstone_dust', 'strong_healing');
  mix('healing', 'fermented_spider_eye', 'harming');
  mix('strong_healing', 'fermented_spider_eye', 'strong_harming');
  mix('harming', 'glowstone_dust', 'strong_harming');
  mix('poison', 'fermented_spider_eye', 'harming');
  mix('long_poison', 'fermented_spider_eye', 'harming');
  mix('strong_poison', 'fermented_spider_eye', 'strong_harming');
  startMix('spider_eye', 'poison');
  mix('poison', 'redstone', 'long_poison');
  mix('poison', 'glowstone_dust', 'strong_poison');
  startMix('ghast_tear', 'regeneration');
  mix('regeneration', 'redstone', 'long_regeneration');
  mix('regeneration', 'glowstone_dust', 'strong_regeneration');
  startMix('blaze_powder', 'strength');
  mix('strength', 'redstone', 'long_strength');
  mix('strength', 'glowstone_dust', 'strong_strength');
  mix('water', 'fermented_spider_eye', 'weakness');
  mix('weakness', 'redstone', 'long_weakness');
  mix('awkward', 'phantom_membrane', 'slow_falling');
  mix('slow_falling', 'redstone', 'long_slow_falling');
  // (the mixes with an ingredient the game doesn't have — a slime block — can't happen)
  for (const list of [CONTAINER_MIXES, POTION_MIXES]) {
    const ok = list.filter(([, ing]) => ITEMS.has(ing));
    list.length = 0;
    list.push(...ok);
  }
}

/** vanilla PotionBrewing.isContainer */
export function isBrewingContainer(s: ItemStack | null | undefined): boolean {
  return !!s && CONTAINERS.has(s.item.id);
}

/** vanilla PotionBrewing.isIngredient: something that brews into a container or a potion */
export function isBrewingIngredient(s: ItemStack | null | undefined): boolean {
  if (!s) return false;
  const id = s.item.id;
  return CONTAINER_MIXES.some((m) => m[1] === id) || POTION_MIXES.some((m) => m[1] === id);
}

/** vanilla PotionBrewing.isBrewablePotion: some mix makes it */
export function isBrewablePotion(id: string): boolean {
  return POTION_MIXES.some((m) => m[2] === id);
}

/** vanilla PotionBrewing.hasMix: `input` (a potion slot's) brews with `reagent` */
export function hasMix(input: ItemStack | null, reagent: ItemStack | null): boolean {
  if (!input || !reagent || !isBrewingContainer(input)) return false;
  const ing = reagent.item.id;
  if (CONTAINER_MIXES.some(([from, i]) => from === input.item.id && i === ing)) return true;
  const p = contentsOf(input)?.potion;
  return p !== undefined && POTION_MIXES.some(([from, i]) => from === p && i === ing);
}

/**
 * vanilla PotionBrewing.mix(ingredient, potion): what the potion slot's stack becomes — a new stack of the new
 * container or potion (only the potion carries over: names, colours and custom effects are lost), or the same stack
 * when nothing comes of it
 */
export function brewMix(reagent: ItemStack, input: ItemStack | null): ItemStack | null {
  if (!input) return input;
  const p = contentsOf(input)?.potion;
  if (p === undefined) return input;
  const ing = reagent.item.id;
  for (const [from, i, to] of CONTAINER_MIXES) if (input.item.id === from && i === ing) return potionStack(to, p);
  for (const [from, i, to] of POTION_MIXES) if (from === p && i === ing) return potionStack(input.item, to);
  return input;
}
