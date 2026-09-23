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

  /** Add as much as possible; returns remaining count. Hotbar first like vanilla. */
  add(stack: ItemStack): number {
    let remaining = stack.count;
    // merge into existing stacks (selected, offhand, then slots in order)
    const order = [this.selected, ...Array.from({ length: 36 }, (_, i) => i).filter((i) => i !== this.selected)];
    for (const i of order) {
      const s = this.main[i];
      if (!s || !s.sameItem(stack) || s.count >= s.maxStack) continue;
      const n = Math.min(remaining, s.maxStack - s.count);
      s.count += n;
      remaining -= n;
      if (remaining <= 0) break;
    }
    if (remaining > 0) {
      for (let i = 0; i < 36 && remaining > 0; i++) {
        if (this.main[i]) continue;
        const n = Math.min(remaining, stack.maxStack);
        this.main[i] = stack.copyWithCount(n);
        remaining -= n;
      }
    }
    this.version++;
    return remaining;
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
