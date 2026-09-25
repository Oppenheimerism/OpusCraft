// A crafter's menu (1.21; vanilla CrafterMenu, MenuType.CRAFTER_3x3): its nine slots as a 3x3 grid, the player's
// inventory under them, and on the right what the grid would make, to look at only (NonInteractiveResultSlot).
// A switched-off slot takes nothing (CrafterSlot); switching slots is the screen's (gui/screens/crafter.ts).

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer, type Container } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { crafterCraft, type CrafterBlockEntity } from '../game/crafter';

/** vanilla CrafterSlot: nothing goes into it while it's switched off */
export class CrafterSlot extends Slot {
  constructor(private readonly menu: CrafterMenu, c: Container, i: number, x: number, y: number) {
    super(c, i, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return !this.menu.isSlotDisabled(this.slot) && super.mayPlace(s);
  }
}

/** vanilla NonInteractiveResultSlot: shows what would be made; nothing can be taken from it or put in it */
export class CrafterResultSlot extends Slot {
  override mayPlace(): boolean {
    return false;
  }
  override mayPickup(): boolean {
    return false;
  }
  override isHighlightable(): boolean {
    return false;
  }
}

export class CrafterMenu extends ContainerMenu {
  /** vanilla resultContainer */
  readonly result = new SimpleContainer(1);
  readonly resultSlot: CrafterResultSlot;

  constructor(player: Player, readonly crafter: CrafterBlockEntity) {
    super(player);
    const c = crafter.container;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.addSlot(new CrafterSlot(this, c, j + i * 3, 26 + j * 18, 17 + i * 18));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
    this.resultSlot = this.addSlot(new CrafterResultSlot(this.result, 0, 134, 35));
    this.refreshRecipeResult();
  }

  isSlotDisabled(i: number): boolean {
    return this.crafter.isSlotDisabled(i);
  }

  /** vanilla setSlotState (and the server's handleContainerSlotStateChanged): a grid slot switched on or off */
  setSlotState(i: number, enabled: boolean): void {
    this.crafter.setSlotState(i, enabled);
  }

  /** vanilla isPowered: its redstone lit on the screen */
  get powered(): boolean {
    return this.crafter.triggered;
  }

  /** vanilla refreshRecipeResult: what the grid makes now (on every change: here after each click, and each tick) */
  refreshRecipeResult(): void {
    this.result.items[0] = crafterCraft(this.crafter.container.items)?.result ?? null;
  }

  override clicked(slotId: number, button: number, type: Parameters<ContainerMenu['clicked']>[2]): void {
    super.clicked(slotId, button, type);
    this.refreshRecipeResult();
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot !== this.resultSlot;
  }

  override canDragTo(slot: Slot): boolean {
    return slot !== this.resultSlot;
  }

  /** vanilla Container.stillValidBlockEntity: the same block entity still there, and the player within reach of it */
  override stillValid(p: Player): boolean {
    const be = this.crafter;
    if (be.removed || p.level.world.getBlockEntity(be.x, be.y, be.z) !== be) return false;
    return p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) <= 64;
  }

  /** vanilla quickMoveStack: out of the grid into the inventory (hotbar end first), in from the inventory (slots on) */
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    if (index >= 45) return null;
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index < 9) {
      if (!this.moveItemStackTo(s, 9, 45, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, 9, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    return before;
  }
}
