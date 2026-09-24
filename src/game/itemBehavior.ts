// Per-item behaviour hooks (vanilla Item.useOn / Item.use overrides), for items
// whose code lives with what they belong to (the End's eyes of ender and end
// crystals). Interaction asks here before its own built-in item uses.

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import type { BlockHit } from './raycast';

/** vanilla InteractionResult, as far as the caller cares: done (and the hand swings), failed (nothing else is tried), or pass */
export type UseResult = 'success' | 'fail' | 'pass';

export interface ItemBehavior {
  /** vanilla Item.useOn: used on the block the player looks at */
  useOn?(level: Level, p: Player, stack: ItemStack, hit: BlockHit): UseResult;
  /** vanilla Item.use: used in the air (or after useOn passed) */
  use?(level: Level, p: Player, stack: ItemStack): UseResult;
  /** vanilla Item.inventoryTick: every tick it's in a player's inventory (`selected`: its slot's index is the hotbar's pick) */
  inventoryTick?(level: Level, p: Player, stack: ItemStack, slot: number, selected: boolean): void;
  /** vanilla Item.onCraftedBy: taken from a crafting result (a map zoomed out or locked becomes a new map) */
  onCraftedBy?(level: Level, p: Player, stack: ItemStack): void;
}

const ITEM_BEHAVIORS = new Map<string, ItemBehavior>();

/** add hooks to an item (merged with any it already has) */
export function registerItemBehavior(id: string, b: ItemBehavior): void {
  ITEM_BEHAVIORS.set(id, { ...ITEM_BEHAVIORS.get(id), ...b });
}

export function itemBehaviorOf(id: string): ItemBehavior | undefined {
  return ITEM_BEHAVIORS.get(id);
}

/** vanilla ItemStack.onCraftedBy */
export function craftedBy(p: Player, stack: ItemStack): void {
  ITEM_BEHAVIORS.get(stack.item.id)?.onCraftedBy?.(p.level, p, stack);
}
