// Item-specific tooltip lines (vanilla Item.appendHoverText, and what ItemStack.getTooltipLines puts around it before
// the enchantments: a map's id ahead of it, an armour trim after it), registered by the items they belong to.

import type { ItemStack } from './item';

type Lines = (s: ItemStack) => string[];

const HOVER = new Map<string, Lines>();
const BEFORE: Lines[] = [];
const AFTER: Lines[] = [];

/** vanilla Item.appendHoverText for one item (hidden by minecraft:hide_additional_tooltip) */
export function registerHoverText(id: string, f: Lines): void {
  HOVER.set(id, f);
}

/** lines any stack may have from its components: ahead of the item's own (the map id) or after them (the trim) */
export function registerComponentTooltip(where: 'before' | 'after', f: Lines): void {
  (where === 'before' ? BEFORE : AFTER).push(f);
}

/** the lines between the name and the enchantments, as vanilla getTooltipLines orders them */
export function hoverText(s: ItemStack): string[] {
  const out: string[] = [];
  for (const f of BEFORE) out.push(...f(s));
  if (!s.tag?.hideAdditional) out.push(...(HOVER.get(s.item.id)?.(s) ?? []));
  for (const f of AFTER) out.push(...f(s));
  return out;
}
