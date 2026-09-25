// Tinted item model layers (vanilla item models' layer0 / layer1 with ItemColors): leather's dye on the piece under
// its untinted overlay, a potion's colour on the liquid under the bottle, a tipped arrow's on the head under the shaft.

import type { Item, ItemStack } from './item';
import { isDyeable, dyedColor, DEFAULT_LEATHER_COLOR } from './dyedColor';
import { BASE_POTION_COLOR, contentsOf, potionColor } from './potions';
import { starTint } from './fireworks';

export interface ItemLayers {
  /** the model's layer textures, bottom to top (a missing one is skipped) */
  layers: string[];
  /** the layer ItemColors tints (vanilla tintindex 0: layer0) */
  tinted: number;
  /** its colour when the stack doesn't say */
  defaultTint: number;
}

const POTIONS = new Set(['potion', 'splash_potion', 'lingering_potion']);

/** the item's layers when it has a tinted one, else null (a single untinted sprite) */
export function itemLayers(it: Item): ItemLayers | null {
  if (isDyeable(it)) return { layers: [it.texture!, `${it.texture}_overlay`], tinted: 0, defaultTint: DEFAULT_LEATHER_COLOR };
  if (POTIONS.has(it.id)) return { layers: ['potion_overlay', it.texture!], tinted: 0, defaultTint: BASE_POTION_COLOR };
  if (it.id === 'tipped_arrow') return { layers: ['tipped_arrow_head', 'tipped_arrow_base'], tinted: 0, defaultTint: BASE_POTION_COLOR };
  // (fireworks) models/item/firework_star.json: the grey star, its middle (layer1) in the explosion's colours
  if (it.id === 'firework_star') return { layers: ['firework_star', 'firework_star_overlay'], tinted: 1, defaultTint: 0x8a8a8a };
  return null;
}

/** the colour this stack gives its tinted layer (vanilla ItemColors: DyedItemColor, PotionContents.getColor) */
export function layerTint(s: ItemStack): number {
  if (isDyeable(s.item)) return dyedColor(s);
  if (s.item.id === 'firework_star') return starTint(s);
  return potionColor(contentsOf(s));
}
