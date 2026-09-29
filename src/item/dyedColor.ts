// Leather armour colours (vanilla DyedItemColor, the minecraft:dyed_color component, and #dyeable).

import type { Item, ItemStack } from './item';
import { DYE } from '../textures/dyes';

/** vanilla DyedItemColor.LEATHER_COLOR (-6265536): undyed leather */
export const DEFAULT_LEATHER_COLOR = 0xa06540;

/** vanilla #dyeable (leather armour and leather horse armour; (remaining mobs: the armadillo) and wolf armour) */
export function isDyeable(it: Item): boolean {
  return it.id === 'leather_helmet' || it.id === 'leather_chestplate' || it.id === 'leather_leggings' || it.id === 'leather_boots' || it.id === 'leather_horse_armor' || it.id === 'wolf_armor';
}

/** vanilla DyeItem: one of the sixteen dyes, by its colour name */
export function dyeColorName(it: Item): string | null {
  if (!it.id.endsWith('_dye')) return null;
  const c = it.id.slice(0, -4);
  return DYE[c] ? c : null;
}

/** vanilla DyedItemColor.getOrDefault: the stack's dyed colour, or the default */
export function dyedColor(s: ItemStack, def = DEFAULT_LEATHER_COLOR): number {
  return s.tag?.dyedColor ?? def;
}

/**
 * vanilla DyedItemColor.applyDyes: the average of the old colour (if any) and each dye's texture diffuse colour,
 * brightened back to the average of their brightest channels
 */
export function applyDyes(stack: ItemStack, dyes: string[]): ItemStack | null {
  if (!isDyeable(stack.item)) return null;
  const out = stack.copyWithCount(1);
  let r = 0, g = 0, b = 0, max = 0, n = 0;
  const cur = out.tag?.dyedColor;
  if (cur !== undefined) {
    const cr = (cur >> 16) & 255, cg = (cur >> 8) & 255, cb = cur & 255;
    max += Math.max(cr, cg, cb);
    r += cr;
    g += cg;
    b += cb;
    n++;
  }
  for (const d of dyes) {
    const c = DYE[d].dye;
    const dr = (c >> 16) & 255, dg = (c >> 8) & 255, db = c & 255;
    max += Math.max(dr, dg, db);
    r += dr;
    g += dg;
    b += db;
    n++;
  }
  let l3 = Math.trunc(r / n), i4 = Math.trunc(g / n), k4 = Math.trunc(b / n);
  const f = Math.fround(max / n);
  const f1 = Math.max(l3, i4, k4);
  // (float)x * f / f1, truncated
  l3 = Math.trunc(Math.fround(Math.fround(l3 * f) / f1));
  i4 = Math.trunc(Math.fround(Math.fround(i4 * f) / f1));
  k4 = Math.trunc(Math.fround(Math.fround(k4 * f) / f1));
  const tag = out.tag ?? {};
  tag.dyedColor = (l3 << 16) | (i4 << 8) | k4;
  // (show_in_tooltip is kept from the stack; a fresh colour shows)
  out.tag = tag;
  return out;
}
