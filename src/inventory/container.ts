// Containers, slots and the vanilla AbstractContainerMenu click logic
// (pickup, quick move, swap, clone, throw, pickup-all and drag "quick craft").

import { ItemStack } from '../item/item';
import type { Player } from '../entity/player';

export const isEmpty = (s: ItemStack | null | undefined): s is null | undefined => !s || s.count <= 0;
const norm = (s: ItemStack | null): ItemStack | null => (isEmpty(s) ? null : s);
/** vanilla isSameItemSameComponents (enchantments, names and repair costs must match to stack or merge) */
const same = (a: ItemStack | null, b: ItemStack | null): boolean => !!a && !!b && a.sameItem(b);

export interface Container {
  readonly size: number;
  get(i: number): ItemStack | null;
  set(i: number, s: ItemStack | null): void;
  changed(): void;
  maxStackSize?: number;
}

export class SimpleContainer implements Container {
  readonly items: (ItemStack | null)[];
  onChange: (() => void) | null = null;
  constructor(readonly size: number) {
    this.items = new Array(size).fill(null);
  }
  get(i: number): ItemStack | null {
    return this.items[i];
  }
  set(i: number, s: ItemStack | null): void {
    this.items[i] = norm(s);
    this.changed();
  }
  changed(): void {
    this.onChange?.();
  }
  /** remove all items (returns them) */
  removeAll(): ItemStack[] {
    const out = this.items.filter((s): s is ItemStack => !isEmpty(s));
    this.items.fill(null);
    this.changed();
    return out;
  }
}

/** Player inventory as a container: 0-35 main (0-8 hotbar), 36-39 armor (feet..head), 40 offhand */
export class PlayerContainer implements Container {
  readonly size = 41;
  constructor(readonly player: Player) {}
  get inv() {
    return this.player.inventory;
  }
  get(i: number): ItemStack | null {
    if (i < 36) return this.inv.main[i];
    if (i < 40) return this.inv.armor[i - 36];
    return this.inv.offhand;
  }
  set(i: number, s: ItemStack | null): void {
    s = norm(s);
    if (i < 36) this.inv.main[i] = s;
    else if (i < 40) this.inv.armor[i - 36] = s;
    else this.inv.offhand = s;
    this.changed();
  }
  changed(): void {
    this.inv.version++;
  }
}

export class Slot {
  index = -1;
  constructor(readonly container: Container, readonly slot: number, public x: number, public y: number) {}
  get item(): ItemStack | null {
    return this.container.get(this.slot);
  }
  hasItem(): boolean {
    return !isEmpty(this.item);
  }
  set(s: ItemStack | null): void {
    this.container.set(this.slot, s);
  }
  setChanged(): void {
    this.container.changed();
  }
  mayPlace(_s: ItemStack): boolean {
    return true;
  }
  mayPickup(_p: Player): boolean {
    return true;
  }
  isActive(): boolean {
    return true;
  }
  maxStackSize(s?: ItemStack): number {
    const c = this.container.maxStackSize ?? 64;
    return s ? Math.min(c, s.maxStack) : c;
  }
  /** sprite shown when empty (armor silhouettes) */
  noItemIcon(): string | null {
    return null;
  }
  isHighlightable(): boolean {
    return true;
  }
  allowModification(p: Player): boolean {
    const it = this.item;
    return this.mayPickup(p) && (!it || this.mayPlace(it));
  }
  onTake(_p: Player, _s: ItemStack): void {
    this.setChanged();
  }
  /** called when an item crafted in bulk via shift-click */
  onQuickCraft(_now: ItemStack, _before: ItemStack): void {}
  remove(n: number): ItemStack | null {
    const it = this.item;
    if (!it) return null;
    const out = it.split(n);
    if (it.count <= 0) this.set(null);
    else this.setChanged();
    return norm(out);
  }
  tryRemove(count: number, decrement: number, p: Player): ItemStack | null {
    if (!this.mayPickup(p)) return null;
    const it = this.item;
    if (!it) return null;
    if (!this.allowModification(p) && decrement < it.count) return null;
    const got = this.remove(Math.min(count, decrement));
    return got;
  }
  safeTake(count: number, decrement: number, p: Player): ItemStack | null {
    const got = this.tryRemove(count, decrement, p);
    if (got) this.onTake(p, got);
    return got;
  }
  /** insert up to `increment` from stack; returns what is left in `stack` */
  safeInsert(stack: ItemStack | null, increment: number): ItemStack | null {
    if (isEmpty(stack) || !this.mayPlace(stack)) return stack ?? null;
    const cur = this.item;
    const n = Math.min(Math.min(increment, stack.count), this.maxStackSize(stack) - (cur?.count ?? 0));
    if (n <= 0) return stack;
    if (!cur) this.set(stack.split(n));
    else if (same(cur, stack)) {
      stack.count -= n;
      cur.count += n;
      this.set(cur);
    }
    return norm(stack);
  }
}

export function canItemQuickReplace(slot: Slot | null, stack: ItemStack, sizeMatters: boolean): boolean {
  const empty = !slot || !slot.hasItem();
  if (!empty && same(stack, slot!.item)) return slot!.item!.count + (sizeMatters ? 0 : stack.count) <= stack.maxStack;
  return empty;
}

export function quickCraftPlaceCount(slots: Set<Slot>, type: number, stack: ItemStack): number {
  if (type === 0) return Math.floor(stack.count / slots.size);
  if (type === 1) return 1;
  return stack.maxStack;
}

export type ClickType = 'pickup' | 'quick_move' | 'swap' | 'clone' | 'throw' | 'quick_craft' | 'pickup_all';

export abstract class ContainerMenu {
  readonly slots: Slot[] = [];
  carried: ItemStack | null = null;
  private quickcraftStatus = 0;
  private quickcraftType = -1;
  private readonly quickcraftSlots = new Set<Slot>();

  constructor(readonly player: Player) {}

  addSlot<S extends Slot>(s: S): S {
    s.index = this.slots.length;
    this.slots.push(s);
    return s;
  }

  /** add the 27 + 9 player inventory slots at vanilla positions */
  addPlayerSlots(inv: Container, left: number, top: number): void {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c + r * 9 + 9, left + c * 18, top + r * 18));
    for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c, left + c * 18, top + 58));
  }

  abstract quickMoveStack(p: Player, index: number): ItemStack | null;

  stillValid(_p: Player): boolean {
    return true;
  }

  canTakeItemForPickAll(_s: ItemStack | null, _slot: Slot): boolean {
    return true;
  }

  canDragTo(_slot: Slot): boolean {
    return true;
  }

  /** vanilla moveItemStackTo: merge into matching stacks, then into one empty slot */
  moveItemStackTo(stack: ItemStack, start: number, end: number, reverse: boolean): boolean {
    let moved = false;
    let i = reverse ? end - 1 : start;
    if (stack.maxStack > 1) {
      while (stack.count > 0 && (reverse ? i >= start : i < end)) {
        const slot = this.slots[i];
        const it = slot.item;
        if (it && same(stack, it)) {
          const total = it.count + stack.count;
          const max = slot.maxStackSize(it);
          if (total <= max) {
            stack.count = 0;
            it.count = total;
            slot.setChanged();
            moved = true;
          } else if (it.count < max) {
            stack.count -= max - it.count;
            it.count = max;
            slot.setChanged();
            moved = true;
          }
        }
        i += reverse ? -1 : 1;
      }
    }
    if (stack.count > 0) {
      i = reverse ? end - 1 : start;
      while (reverse ? i >= start : i < end) {
        const slot = this.slots[i];
        if (!slot.hasItem() && slot.mayPlace(stack)) {
          const max = slot.maxStackSize(stack);
          slot.set(stack.split(Math.min(stack.count, max)));
          moved = true;
          break;
        }
        i += reverse ? -1 : 1;
      }
    }
    return moved;
  }

  private resetQuickCraft(): void {
    this.quickcraftStatus = 0;
    this.quickcraftSlots.clear();
  }

  /** vanilla AbstractContainerMenu.clicked (slotId -999 = outside the window) */
  clicked(slotId: number, button: number, type: ClickType): void {
    const p = this.player;
    const inv = p.inventory;
    if (type === 'quick_craft') {
      const prev = this.quickcraftStatus;
      this.quickcraftStatus = button & 3;
      if ((prev !== 1 || this.quickcraftStatus !== 2) && prev !== this.quickcraftStatus) this.resetQuickCraft();
      else if (isEmpty(this.carried)) this.resetQuickCraft();
      else if (this.quickcraftStatus === 0) {
        this.quickcraftType = (button >> 2) & 3;
        if (this.quickcraftType === 0 || this.quickcraftType === 1 || (this.quickcraftType === 2 && p.gameMode === 'creative')) {
          this.quickcraftStatus = 1;
          this.quickcraftSlots.clear();
        } else this.resetQuickCraft();
      } else if (this.quickcraftStatus === 1) {
        const slot = this.slots[slotId];
        const c = this.carried!;
        if (slot && canItemQuickReplace(slot, c, true) && slot.mayPlace(c) && (this.quickcraftType === 2 || c.count > this.quickcraftSlots.size) && this.canDragTo(slot)) this.quickcraftSlots.add(slot);
      } else if (this.quickcraftStatus === 2) {
        if (this.quickcraftSlots.size) {
          if (this.quickcraftSlots.size === 1) {
            const only = [...this.quickcraftSlots][0].index;
            const t = this.quickcraftType;
            this.resetQuickCraft();
            this.clicked(only, t, 'pickup');
            return;
          }
          const src = this.carried!.copy();
          let remaining = this.carried!.count;
          for (const slot of this.quickcraftSlots) {
            const c = this.carried!;
            if (canItemQuickReplace(slot, c, true) && slot.mayPlace(c) && (this.quickcraftType === 2 || c.count >= this.quickcraftSlots.size) && this.canDragTo(slot)) {
              const had = slot.item?.count ?? 0;
              const max = Math.min(src.maxStack, slot.maxStackSize(src));
              const n = Math.min(quickCraftPlaceCount(this.quickcraftSlots, this.quickcraftType, src) + had, max);
              remaining -= n - had;
              slot.set(src.copyWithCount(n));
            }
          }
          src.count = remaining;
          this.carried = norm(src);
        }
        this.resetQuickCraft();
      } else this.resetQuickCraft();
      return;
    }
    if (this.quickcraftStatus !== 0) {
      this.resetQuickCraft();
      return;
    }
    if ((type === 'pickup' || type === 'quick_move') && (button === 0 || button === 1)) {
      const primary = button === 0;
      if (slotId === -999) {
        if (this.carried) {
          if (primary) {
            p.dropItem(this.carried, true);
            this.carried = null;
          } else {
            p.dropItem(this.carried.split(1), true);
            this.carried = norm(this.carried);
          }
        }
        return;
      }
      if (type === 'quick_move') {
        if (slotId < 0) return;
        const slot = this.slots[slotId];
        if (!slot.mayPickup(p)) return;
        let moved = this.quickMoveStack(p, slotId);
        let guard = 0;
        while (moved && same(slot.item, moved) && guard++ < 64) moved = this.quickMoveStack(p, slotId);
        return;
      }
      if (slotId < 0) return;
      const slot = this.slots[slotId];
      const inSlot = slot.item;
      const carried = this.carried;
      if (!inSlot) {
        if (carried) this.carried = slot.safeInsert(carried, primary ? carried.count : 1);
      } else if (slot.mayPickup(p)) {
        if (!carried) {
          const n = primary ? inSlot.count : Math.floor((inSlot.count + 1) / 2);
          const got = slot.tryRemove(n, 2147483647, p);
          if (got) {
            this.carried = got;
            slot.onTake(p, got);
          }
        } else if (slot.mayPlace(carried)) {
          if (same(inSlot, carried)) this.carried = slot.safeInsert(carried, primary ? carried.count : 1);
          else if (carried.count <= slot.maxStackSize(carried)) {
            this.carried = inSlot;
            slot.set(carried);
          }
        } else if (same(inSlot, carried)) {
          const got = slot.tryRemove(inSlot.count, carried.maxStack - carried.count, p);
          if (got) {
            carried.count += got.count;
            slot.onTake(p, got);
          }
        }
      }
      slot.setChanged();
      return;
    }
    if (type === 'swap' && ((button >= 0 && button < 9) || button === 40)) {
      const hot = button === 40 ? inv.offhand : inv.main[button];
      const setHot = (s: ItemStack | null) => {
        if (button === 40) inv.offhand = norm(s);
        else inv.main[button] = norm(s);
        inv.version++;
      };
      const slot = this.slots[slotId];
      const inSlot = slot.item;
      if (!hot && !inSlot) return;
      if (!hot) {
        if (slot.mayPickup(p)) {
          setHot(inSlot);
          slot.set(null);
          slot.onTake(p, inSlot!);
        }
      } else if (!inSlot) {
        if (slot.mayPlace(hot)) {
          const max = slot.maxStackSize(hot);
          if (hot.count > max) slot.set(hot.split(max));
          else {
            setHot(null);
            slot.set(hot);
          }
        }
      } else if (slot.mayPickup(p) && slot.mayPlace(hot)) {
        const max = slot.maxStackSize(hot);
        if (hot.count > max) {
          slot.set(hot.split(max));
          slot.onTake(p, inSlot);
          const left = inv.add(inSlot);
          if (left > 0) p.dropItem(inSlot.copyWithCount(left), true);
        } else {
          setHot(inSlot);
          slot.set(hot);
          slot.onTake(p, inSlot);
        }
      }
      return;
    }
    if (type === 'clone' && p.gameMode === 'creative' && !this.carried && slotId >= 0) {
      const it = this.slots[slotId].item;
      if (it) this.carried = it.copyWithCount(it.maxStack);
      return;
    }
    if (type === 'throw' && !this.carried && slotId >= 0) {
      const slot = this.slots[slotId];
      const n = button === 0 ? 1 : slot.item?.count ?? 0;
      let got = slot.safeTake(n, 2147483647, p);
      if (got) p.dropItem(got, true);
      if (button === 1) {
        let guard = 0;
        while (got && same(slot.item, got) && guard++ < 64) {
          got = slot.safeTake(n, 2147483647, p);
          if (got) p.dropItem(got, true);
        }
      }
      return;
    }
    if (type === 'pickup_all' && slotId >= 0) {
      const slot = this.slots[slotId];
      const c = this.carried;
      if (c && (!slot.hasItem() || !slot.mayPickup(p))) {
        const start = button === 0 ? 0 : this.slots.length - 1;
        const step = button === 0 ? 1 : -1;
        for (let pass = 0; pass < 2; pass++) {
          for (let i = start; i >= 0 && i < this.slots.length && c.count < c.maxStack; i += step) {
            const s = this.slots[i];
            const it = s.item;
            if (it && canItemQuickReplace(s, c, true) && s.mayPickup(p) && this.canTakeItemForPickAll(c, s)) {
              if (pass !== 0 || it.count !== it.maxStack) {
                const got = s.safeTake(it.count, c.maxStack - c.count, p);
                if (got) c.count += got.count;
              }
            }
          }
        }
      }
    }
  }

  /** menu closed: carried stack goes back to the inventory (or is dropped) */
  removed(): void {
    if (this.carried) {
      this.giveBack(this.carried);
      this.carried = null;
    }
  }

  /** return every item of a temporary container to the player (crafting grids) */
  protected clearContainer(c: Container): void {
    for (let i = 0; i < c.size; i++) {
      const s = c.get(i);
      if (!s) continue;
      this.giveBack(s);
      c.set(i, null);
    }
  }

  /**
   * vanilla dropOrPlaceInInventory: a stack the closed menu held, back in the inventory (what won't fit dropped); all
   * of it dropped for a host's guest that has left or died (the game's own player's goes back, as it always has)
   */
  protected giveBack(s: ItemStack): void {
    const p = this.player;
    const left = p.disconnected || (p.remote && p.health <= 0) ? s.count : p.inventory.add(s);
    if (left > 0) p.dropItem(s.copyWithCount(left), false);
  }
}

/** encode a quick-craft (drag) click */
export function quickcraftMask(header: number, type: number): number {
  return (header & 3) | ((type & 3) << 2);
}
