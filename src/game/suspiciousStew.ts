// (remaining mobs: the mooshroom) Suspicious stew from flowers: what each small flower puts in a stew (vanilla
// FlowerBlock's suspiciousStewEffects, SuspiciousEffectHolder), for a brown mooshroom fed one (entity/mooshroom.ts)
// and for crafting one (a bowl, a brown mushroom, a red mushroom and the flower: vanilla's suspicious_stew_from_*
// recipes). The creative tabs list one stew of each different effect, after the rabbit stew; in creative mode a
// stew's tooltip names its effects (vanilla SuspiciousStewItem.appendHoverText). The stews found in loot and eating
// one are game/loot.ts's and game/desertWells.ts's.

import { ITEMS, ItemStack, getItem } from '../item/item';
import { registerCustomRecipe } from '../inventory/customRecipes';
import { MOB_EFFECTS, MobEffectInstance } from '../entity/effects';
import { addPotionTooltip } from '../item/potions';
import { tooltipFlag } from '../item/hoverText';

export interface StewEffect {
  id: string;
  duration: number;
}

/**
 * vanilla Blocks' FlowerBlock(effect, seconds) for each small flower, the duration Mth.floor(seconds * 20) ticks
 * (1.20.2's: saturation 0.35 s, 7 ticks), in vanilla's item registry order (what the creative stews follow)
 */
const FLOWER_EFFECTS: [string, string, number][] = [
  ['dandelion', 'saturation', 7],
  ['poppy', 'night_vision', 100],
  ['blue_orchid', 'saturation', 7],
  ['allium', 'fire_resistance', 60],
  ['azure_bluet', 'blindness', 220],
  ['red_tulip', 'weakness', 140],
  ['orange_tulip', 'weakness', 140],
  ['white_tulip', 'weakness', 140],
  ['pink_tulip', 'weakness', 140],
  ['oxeye_daisy', 'regeneration', 140],
  ['cornflower', 'jump_boost', 100],
  ['lily_of_the_valley', 'poison', 220],
  ['wither_rose', 'wither', 140],
  ['torchflower', 'night_vision', 100],
];

/** vanilla ItemTags.SMALL_FLOWERS (what a brown mooshroom takes) */
export const SMALL_FLOWERS: ReadonlySet<string> = new Set(FLOWER_EFFECTS.map(([f]) => f));

/** vanilla SuspiciousEffectHolder.tryGet(item).getSuspiciousEffects(): what a flower puts in a stew, or null */
export function flowerStewEffects(item: string): StewEffect[] | null {
  const e = FLOWER_EFFECTS.find(([f]) => f === item);
  return e ? [{ id: e[1], duration: e[2] }] : null;
}

/** a suspicious stew with `effects` (vanilla DataComponents.SUSPICIOUS_STEW_EFFECTS) */
export function suspiciousStew(effects: readonly StewEffect[]): ItemStack {
  return new ItemStack(getItem('suspicious_stew'), 1, 0, { stewEffects: effects.map((e) => ({ ...e })) });
}

// vanilla suspicious_stew_from_<flower>: shapeless, a bowl, a brown mushroom, a red mushroom and the flower, nothing else
registerCustomRecipe({
  assemble(grid) {
    const ids = grid.filter((s): s is ItemStack => !!s && s.count > 0).map((s) => s.item.id);
    if (ids.length !== 4) return null;
    const rest = [...ids];
    for (const need of ['bowl', 'brown_mushroom', 'red_mushroom']) {
      const i = rest.indexOf(need);
      if (i < 0) return null;
      rest.splice(i, 1);
    }
    const effects = flowerStewEffects(rest[0]);
    return effects && ITEMS.has(rest[0]) ? suspiciousStew(effects) : null;
  },
});

const stew = ITEMS.get('suspicious_stew');
if (stew) {
  // vanilla CreativeModeTabs.generateSuspiciousStews: a stew for each flower that's in the game, the same ones once
  stew.creativeStacks = () => {
    const out: ItemStack[] = [], seen = new Set<string>();
    for (const [flower, id, duration] of FLOWER_EFFECTS) {
      if (!ITEMS.has(flower) || seen.has(`${id}:${duration}`)) continue;
      seen.add(`${id}:${duration}`);
      out.push(suspiciousStew([{ id, duration }]));
    }
    return out;
  };
  // vanilla SuspiciousStewItem.appendHoverText: in creative mode, its effects as a potion's ("No Effects" for none)
  const before = stew.hoverText;
  stew.hoverText = (s, lines) => {
    before?.(s, lines);
    if (!tooltipFlag.creative) return;
    const fx: MobEffectInstance[] = [];
    for (const e of s.tag?.stewEffects ?? []) {
      const m = MOB_EFFECTS[e.id];
      if (m) fx.push(new MobEffectInstance(m, e.duration, 0));
    }
    addPotionTooltip(fx, lines, 1);
  };
}
