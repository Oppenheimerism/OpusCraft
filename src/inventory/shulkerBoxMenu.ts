// vanilla ShulkerBoxMenu: a chest's three rows over the player's inventory (the chest's screen draws it), whose slots
// take anything that can go inside a container item — so not another shulker box (vanilla ShulkerBoxSlot).

import { Slot } from './container';
import { ChestMenu } from './menus';
import type { Player } from '../entity/player';
import type { Item, ItemStack } from '../item/item';
import type { ShulkerBoxBlockEntity } from '../world/shulkerBoxEntity';
import { isShulkerBox } from '../world/blocksShulker';

/** vanilla Item.canFitInsideContainerItems: every item but the shulker boxes */
export function canFitInsideContainerItems(it: Item): boolean {
  return !isShulkerBox(it.id);
}

/** vanilla ShulkerBoxSlot */
export class ShulkerBoxSlot extends Slot {
  override mayPlace(s: ItemStack): boolean {
    return canFitInsideContainerItems(s.item);
  }
}

export class ShulkerBoxMenu extends ChestMenu {
  constructor(player: Player, readonly box: ShulkerBoxBlockEntity, title: string) {
    super(player, box, title);
    // (the chest's slots, where the box's own go, made shulker box slots)
    for (let i = 0; i < 27; i++) {
      const s = this.slots[i];
      const b = new ShulkerBoxSlot(s.container, s.slot, s.x, s.y);
      b.index = i;
      this.slots[i] = b;
    }
  }
}
