// Items on the wire, [id, count, damage, tag or null] as saves have them; and what the host makes of a guest's creative
// inventory (vanilla ServerGamePacketListenerImpl.handleSetCreativeModeSlot): a real item, a count it stacks to, a damage
// it can take, and only a variant the creative tabs list, rebuilt from the host's own list rather than taken from the
// guest (plus the one kind of stack the pick-block key makes with data: a decorated pot's sherds).

import type { Value } from './codec';
import { ITEMS, ITEM_LIST, ItemStack, sameTag, cloneTag, type ItemTag } from '../item/item';
import { enchantedBooks, stacksOf } from '../item/creativeStacks';

/** `s` for the wire (the tag as saves keep it: plain data) */
export function itemToWire(s: ItemStack | null): Value {
  if (!s || s.count <= 0) return null;
  return [s.item.id, s.count, s.damage, (cloneTag(s.tag) as Value) ?? null];
}

/**
 * a stack from the host as the guest shows it (a player's held item, a block entity's): an item it doesn't know, or a
 * tag it can't read, comes out as nothing rather than as trouble
 */
export function itemFromHost(v: Value | undefined): ItemStack | null {
  if (!Array.isArray(v)) return null;
  const it = ITEMS.get(v[0] as string);
  if (!it) return null;
  try {
    return new ItemStack(it, v[1] as number, v[2] as number, cloneTag((v[3] as ItemTag | null) ?? null));
  } catch {
    return new ItemStack(it, v[1] as number, v[2] as number);
  }
}

/** the creative tabs' stacks with data, by item id (built once: potions, enchanted books, fireworks, goat horns...) */
let CREATIVE_TAGGED: Map<string, ItemStack[]> | null = null;
function creativeTagged(): Map<string, ItemStack[]> {
  if (CREATIVE_TAGGED) return CREATIVE_TAGGED;
  const m = new Map<string, ItemStack[]>();
  const add = (s: ItemStack) => {
    if (!s.tag) return;
    const list = m.get(s.item.id);
    if (list) list.push(s);
    else m.set(s.item.id, [s]);
  };
  for (const it of ITEM_LIST) if (it.id !== 'enchanted_book') for (const s of stacksOf(it)) add(s);
  for (const s of enchantedBooks(true)) add(s);
  return (CREATIVE_TAGGED = m);
}

/** vanilla DecoratedPotBlockEntity: a side is a brick or a pottery sherd */
function potSide(v: Value): boolean {
  return typeof v === 'string' && (v === 'brick' || (v.endsWith('_pottery_sherd') && ITEMS.has(v)));
}

/**
 * the stack the host puts in a guest's creative slot for `v` (already of the ITEM shape, protocol.ts): null for an
 * empty slot; 'bad' for an item that doesn't exist or a count or damage it can't have. Data that isn't a creative
 * variant's is left off (the guest keeps what it shows; the host's copy, which is what gets placed, has none)
 */
export function creativeItem(v: Value): ItemStack | null | 'bad' {
  if (v === null) return null;
  const [id, count, damage, tag] = v as [string, number, number, Record<string, Value> | null];
  const it = ITEMS.get(id);
  if (!it) return 'bad';
  if (count < 1 || count > Math.max(1, it.maxStack)) return 'bad';
  if (damage < 0 || damage > it.maxDamage) return 'bad';
  const s = new ItemStack(it, count, damage);
  if (!tag) return s;
  // (sameTag compares every component the game knows, and may trip over data of the wrong shape: then it's no match;
  // the tag used is the host's own copy)
  const same = (c: ItemStack) => {
    try {
      return sameTag(c.tag, tag as ItemTag);
    } catch {
      return false;
    }
  };
  const match = creativeTagged().get(id)?.find(same);
  if (match) s.tag = cloneTag(match.tag);
  else if (id === 'decorated_pot' && Object.keys(tag).length === 1 && Array.isArray(tag.potDecorations) && tag.potDecorations.length === 4 && tag.potDecorations.every(potSide))
    s.tag = { potDecorations: [...(tag.potDecorations as string[])] };
  return s;
}
