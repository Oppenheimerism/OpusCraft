// The smithing table's menu (vanilla SmithingMenu on ItemCombinerMenu): a template, a base and an addition make the
// result; taking it uses one of each, with the hammer's clink.

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { SMITHING, smithingRecipesFor, type SmithingRecipe } from './smithing';
import { stillValidAt, TakeAllSlot, type BlockPos } from './stonecutterMenu';

/** an input slot that takes what one of the recipes could use there */
class SmithingInputSlot extends Slot {
  constructor(c: SimpleContainer, i: number, x: number, y: number, private readonly accepts: (s: ItemStack) => boolean) {
    super(c, i, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return this.accepts(s);
  }
}

class SmithingResultSlot extends TakeAllSlot {
  constructor(private readonly menu: SmithingMenu, c: SimpleContainer, x: number, y: number) {
    super(c, 0, x, y);
  }
  override mayPickup(): boolean {
    return this.menu.mayPickup();
  }
  override onTake(p: Player, _s: ItemStack): void {
    this.menu.onTake(p);
  }
}

export class SmithingMenu extends ContainerMenu {
  readonly inputSlots = new SimpleContainer(3);
  readonly resultSlots = new SimpleContainer(1);
  /** vanilla selectedRecipe: the recipe the result last came from */
  private selectedRecipe: SmithingRecipe | null = null;
  /** the result changed (vanilla slotChanged for slot 3: the screen's armour stand) */
  onResultChanged: ((s: ItemStack | null) => void) | null = null;

  constructor(player: Player, readonly pos: BlockPos) {
    super(player);
    this.inputSlots.onChange = () => this.createResult();
    this.addSlot(new SmithingInputSlot(this.inputSlots, 0, 8, 48, (s) => SMITHING.some((r) => r.isTemplateIngredient(s))));
    this.addSlot(new SmithingInputSlot(this.inputSlots, 1, 26, 48, (s) => SMITHING.some((r) => r.isBaseIngredient(s))));
    this.addSlot(new SmithingInputSlot(this.inputSlots, 2, 44, 48, (s) => SMITHING.some((r) => r.isAdditionIngredient(s))));
    this.addSlot(new SmithingResultSlot(this, this.resultSlots, 98, 48));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  private input(): [ItemStack | null, ItemStack | null, ItemStack | null] {
    return [this.inputSlots.get(0), this.inputSlots.get(1), this.inputSlots.get(2)];
  }

  private setResult(s: ItemStack | null): void {
    this.resultSlots.items[0] = s;
    this.onResultChanged?.(s);
  }

  /** vanilla SmithingMenu.createResult: the first recipe that fits (no match leaves the last recipe chosen) */
  createResult(): void {
    const [t, b, a] = this.input();
    const list = smithingRecipesFor(t, b, a);
    if (!list.length) {
      this.setResult(null);
      return;
    }
    this.selectedRecipe = list[0];
    this.setResult(list[0].assemble(t, b, a));
  }

  /** vanilla mayPickup: the chosen recipe still fits */
  mayPickup(): boolean {
    const [t, b, a] = this.input();
    return !!this.selectedRecipe && this.selectedRecipe.matches(t, b, a);
  }

  /** vanilla SmithingMenu.onTake: one of each input used, and level event 1044 (the smithing table used) */
  onTake(p: Player): void {
    for (let i = 0; i < 3; i++) {
      const s = this.inputSlots.get(i);
      if (s) {
        s.count--;
        this.inputSlots.set(i, s);
      }
    }
    const [x, y, z] = this.pos;
    p.level.sound.play('block.smithing_table.use', x + 0.5, y + 0.5, z + 0.5, 1, p.level.random.nextFloat() * 0.1 + 0.9);
  }

  override stillValid(p: Player): boolean {
    return stillValidAt(p, this.pos, 'smithing_table');
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.resultSlots;
  }

  /** vanilla findSlotToQuickMoveTo: the first empty input slot a recipe would put the stack in */
  private slotToQuickMoveTo(s: ItemStack): number {
    for (const r of SMITHING) {
      const k = r.isTemplateIngredient(s) ? 0 : r.isBaseIngredient(s) ? 1 : r.isAdditionIngredient(s) ? 2 : -1;
      if (k >= 0 && !this.slots[k].hasItem()) return k;
    }
    return -1;
  }

  /** vanilla ItemCombinerMenu.quickMoveStack (inputs 0-2, result 3, inventory 4-30, hotbar 31-39) */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    const k = this.slotToQuickMoveTo(s);
    if (index === 3) {
      if (!this.moveItemStackTo(s, 4, 40, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index < 3) {
      if (!this.moveItemStackTo(s, 4, 40, false)) return null;
    } else if (k >= 0 && index >= 4 && index < 40) {
      if (!this.moveItemStackTo(s, k, 3, false)) return null;
    } else if (index >= 4 && index < 31) {
      if (!this.moveItemStackTo(s, 31, 40, false)) return null;
    } else if (index >= 31 && index < 40 && !this.moveItemStackTo(s, 4, 31, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla ItemCombinerMenu.removed: the inputs go back to the player (the result was only ever a preview) */
  override removed(): void {
    super.removed();
    this.clearContainer(this.inputSlots);
  }
}
