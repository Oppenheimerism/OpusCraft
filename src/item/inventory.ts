// Player inventory: 36 main slots (0-8 hotbar), 4 armor, 1 offhand.

import { ItemStack } from './item';

export class Inventory {
  readonly main: (ItemStack | null)[] = new Array(36).fill(null);
  readonly armor: (ItemStack | null)[] = new Array(4).fill(null); // feet, legs, chest, head
  offhand: ItemStack | null = null;
  selected = 0;
  /** incremented on every change (for UI refresh) */
  version = 0;

  get selectedItem(): ItemStack | null {
    return this.main[this.selected];
  }

  setSelectedItem(s: ItemStack | null): void {
    this.main[this.selected] = s && s.count > 0 ? s : null;
    this.version++;
  }

  getSlot(i: number): ItemStack | null {
    return this.main[i];
  }

  setSlot(i: number, s: ItemStack | null): void {
    this.main[i] = s && s.count > 0 ? s : null;
    this.version++;
  }

  /**
   * vanilla Inventory.add: as much as fits, returning what's left — into stacks with room (the selected one, then the
   * offhand, then the rest in order), then empty slots; every stack that takes some bounces in the hotbar for 5
   * ticks. `infinite` (vanilla hasInfiniteMaterials, creative): when nothing fits it all goes anyway
   */
  add(stack: ItemStack, infinite = false): number {
    let remaining = stack.count;
    const merge = (s: ItemStack | null): void => {
      if (remaining <= 0 || !s || !s.sameItem(stack) || s.count >= s.maxStack) return;
      const n = Math.min(remaining, s.maxStack - s.count);
      s.count += n;
      s.popTime = 5;
      remaining -= n;
    };
    merge(this.main[this.selected]);
    merge(this.offhand);
    for (let i = 0; i < 36; i++) merge(this.main[i]);
    for (let i = 0; i < 36 && remaining > 0; i++) {
      if (this.main[i]) continue;
      const n = Math.min(remaining, stack.maxStack);
      const s = stack.copyWithCount(n);
      s.popTime = 5;
      this.main[i] = s;
      remaining -= n;
    }
    if (infinite && remaining === stack.count) remaining = 0;
    this.version++;
    return remaining;
  }

  /** vanilla Inventory.tick → ItemStack.inventoryTick: the bounces wind down */
  tick(): void {
    for (const s of this.main) if (s && s.popTime > 0) s.popTime--;
    for (const s of this.armor) if (s && s.popTime > 0) s.popTime--;
    if (this.offhand && this.offhand.popTime > 0) this.offhand.popTime--;
  }

  /** Remove `count` from the selected slot. */
  consumeSelected(count = 1): void {
    const s = this.main[this.selected];
    if (!s) return;
    s.count -= count;
    if (s.count <= 0) this.main[this.selected] = null;
    this.version++;
  }

  findSlot(pred: (s: ItemStack) => boolean): number {
    for (let i = 0; i < 36; i++) {
      const s = this.main[i];
      if (s && pred(s)) return i;
    }
    return -1;
  }

  clear(): void {
    this.main.fill(null);
    this.armor.fill(null);
    this.offhand = null;
    this.version++;
  }

  armorValue(): number {
    let v = 0;
    for (const a of this.armor) if (a?.item.armor) v += a.item.armor.defense;
    return v;
  }
}
