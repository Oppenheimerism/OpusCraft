// A dispenser's or dropper's menu (vanilla DispenserMenu, MenuType.GENERIC_3x3): its nine slots as a 3x3 grid in the
// middle, over the player's inventory; shift-click moves between the two.

import { ContainerMenu, Slot, PlayerContainer } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import type { DispenserBlockEntity } from '../game/redstone/dispenser';

export class DispenserMenu extends ContainerMenu {
  constructor(player: Player, readonly dispenser: DispenserBlockEntity) {
    super(player);
    const c = dispenser.container;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.addSlot(new Slot(c, j + i * 3, 62 + j * 18, 17 + i * 18));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  /** vanilla Container.stillValidBlockEntity: the same block entity still there, and the player within reach of it */
  override stillValid(p: Player): boolean {
    const be = this.dispenser;
    if (be.removed || p.level.world.getBlockEntity(be.x, be.y, be.z) !== be) return false;
    return p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) <= 64;
  }

  /** vanilla quickMoveStack: out of the grid into the inventory (hotbar end first), in from the inventory */
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index < 9) {
      if (!this.moveItemStackTo(s, 9, 45, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, 9, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return before;
  }
}
