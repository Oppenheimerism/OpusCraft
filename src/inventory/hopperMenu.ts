// A hopper's menu (vanilla HopperMenu, MenuType.HOPPER): its five slots in a row over the player's inventory;
// shift-click moves between the two. ((minecarts) a hopper minecart's too, titled with its name.)

import { ContainerMenu, Slot, PlayerContainer } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import type { HopperBlockEntity } from '../game/redstone/hopper';
import type { ContainerEntity } from './menus';

export class HopperMenu extends ContainerMenu {
  /**
   * ((minecarts) what closing it does to what it's the menu of: a hopper minecart's CONTAINER_CLOSE, set by whoever
   * opened it (game/openMenu.ts))
   */
  onClosed: (() => void) | null = null;

  /** `title`: the container's display name ((minecarts) "Minecart with Hopper" for a hopper minecart's) */
  constructor(player: Player, readonly hopper: HopperBlockEntity | ContainerEntity, readonly title = 'Hopper') {
    super(player);
    const c = hopper.container;
    for (let i = 0; i < 5; i++) this.addSlot(new Slot(c, i, 44 + i * 18, 20));
    this.addPlayerSlots(new PlayerContainer(player), 8, 51);
  }

  /**
   * vanilla Container.stillValidBlockEntity: the same block entity still there, and the player within reach of it
   * ((minecarts) a hopper minecart's: vanilla isChestVehicleStillValid)
   */
  override stillValid(p: Player): boolean {
    const be = this.hopper;
    if ('containerStillValid' in be) return be.containerStillValid(p);
    if (be.removed || p.level.world.getBlockEntity(be.x, be.y, be.z) !== be) return false;
    return p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) <= 64;
  }

  override removed(): void {
    super.removed();
    const closed = this.onClosed;
    this.onClosed = null;
    closed?.();
  }

  /** vanilla quickMoveStack: out of the hopper into the inventory (hotbar end first), in from the inventory */
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index < 5) {
      if (!this.moveItemStackTo(s, 5, this.slots.length, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, 5, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return before;
  }
}
