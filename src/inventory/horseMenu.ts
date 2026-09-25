// A horse's, donkey's, mule's or llama's inventory (vanilla HorseInventoryMenu): the saddle slot, the armour slot (a
// horse's armour, a llama's carpet), and the chest as three rows of five (a llama's: of its strength), over the
// player's inventory. Shift-click sends armour
// and a saddle to their slots and anything else into the chest.

import { ContainerMenu, Slot, PlayerContainer, type Container } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { AbstractChestedHorse, type AbstractHorse } from '../entity/horse';

/** vanilla HorseInventoryMenu's saddle slot: a saddle, on a horse that'll take one */
class SaddleSlot extends Slot {
  constructor(private readonly horse: AbstractHorse, x: number, y: number) {
    super(horse.inventory, 0, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return s.item.id === 'saddle' && !this.hasItem() && this.horse.isSaddleable();
  }
  override isActive(): boolean {
    return this.horse.isSaddleable();
  }
  /** (vanilla AbstractHorse.containerChanged: the saddle sound as one goes on) */
  override set(s: ItemStack | null): void {
    if (s && !this.hasItem()) this.horse.equipSaddle(s, true);
    else super.set(s);
  }
}

/** vanilla ArmorSlot for EquipmentSlot.BODY: the horse's armour, one at a time */
class BodyArmorSlot extends Slot {
  constructor(private readonly horse: AbstractHorse, x: number, y: number) {
    super(horse.inventory, 1, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return this.horse.isArmor(s);
  }
  override isActive(): boolean {
    return this.horse.canWearArmor();
  }
  override maxStackSize(): number {
    return 1;
  }
  /** (with the armour sound as it goes on) */
  override set(s: ItemStack | null): void {
    this.horse.setArmor(s);
  }
}

export class HorseInventoryMenu extends ContainerMenu {
  /** vanilla getInventoryColumns: a chest's five, else none */
  readonly columns: number;
  /** the horse's slots in the menu (the saddle, the armour, and the chest's) */
  private readonly horseSlots: number;

  constructor(player: Player, readonly horse: AbstractHorse) {
    super(player);
    const c: Container = horse.inventory;
    this.addSlot(new SaddleSlot(horse, 8, 18));
    this.addSlot(new BodyArmorSlot(horse, 8, 36));
    this.columns = horse instanceof AbstractChestedHorse && horse.hasChest ? horse.inventoryColumns() : 0;
    for (let k = 0; k < 3 && this.columns > 0; k++) for (let l = 0; l < this.columns; l++) this.addSlot(new Slot(c, 2 + l + k * this.columns, 80 + l * 18, 18 + k * 18));
    this.horseSlots = this.slots.length;
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  /** vanilla stillValid: it's alive, the chest's still on (or off), and within four blocks' reach */
  override stillValid(p: Player): boolean {
    const h = this.horse;
    const chest = h instanceof AbstractChestedHorse && h.hasChest ? h.inventoryColumns() : 0;
    if (!h.isAlive || h.removed || chest !== this.columns) return false;
    return p.distanceToSqr(h.x, h.y, h.z) <= (4 + h.width / 2 + 1) ** 2;
  }

  /**
   * vanilla quickMoveStack: from the horse into the inventory (hotbar end first); from the inventory, armour to its
   * slot, a saddle to its slot, else into the chest, else between the inventory and the hotbar
   */
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const before = s.copy();
    const i = this.horseSlots;
    if (index < i) {
      if (!this.moveItemStackTo(s, i, this.slots.length, true)) return null;
    } else if (this.slots[1].mayPlace(s) && !this.slots[1].hasItem()) {
      if (!this.moveItemStackTo(s, 1, 2, false)) return null;
    } else if (this.slots[0].mayPlace(s)) {
      if (!this.moveItemStackTo(s, 0, 1, false)) return null;
    } else if (i <= 2 || !this.moveItemStackTo(s, 2, i, false)) {
      // (vanilla stops there, whatever moved: returning nothing ends a shift-click's repeats)
      const j = i + 27, k = j + 9;
      const moved = index >= j && index < k ? this.moveItemStackTo(s, i, j, false) : index >= i && index < j ? this.moveItemStackTo(s, j, k, false) : false;
      if (moved && s.count <= 0) slot.set(null);
      else if (moved) slot.setChanged();
      return null;
    }
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return before;
  }
}
