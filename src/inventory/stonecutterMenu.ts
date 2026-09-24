// The stonecutter's menu (vanilla StonecutterMenu): a block in the input slot lists everything it cuts into; picking
// one puts it in the result slot, and each one taken cuts up one block.

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer } from './container';
import { ItemStack, type Item } from '../item/item';
import type { Player } from '../entity/player';
import { stonecuttingRecipesFor, hasStonecuttingRecipe, type StonecutterRecipe } from './stonecutting';

export type BlockPos = [number, number, number];

/** vanilla AbstractContainerMenu.stillValid(ContainerLevelAccess, player, block): the block is still there, within 8 blocks */
export function stillValidAt(p: Player, pos: BlockPos, block: string | ((name: string) => boolean)): boolean {
  const [x, y, z] = pos;
  const name = p.level.getBlockName(x, y, z);
  if (typeof block === 'string' ? name !== block : !block(name)) return false;
  return p.distanceToSqr(x + 0.5, y + 0.5, z + 0.5) <= 64;
}

/** vanilla ResultContainer's slot: taking from it always takes the whole stack */
export class TakeAllSlot extends Slot {
  override mayPlace(): boolean {
    return false;
  }
  override remove(): ItemStack | null {
    const it = this.item;
    this.set(null);
    return it;
  }
}

class StonecutterResultSlot extends TakeAllSlot {
  constructor(private readonly menu: StonecutterMenu, c: SimpleContainer, x: number, y: number) {
    super(c, 0, x, y);
  }
  /** vanilla: one input block goes, the same recipe is ready again, and the saw sounds (once a tick however many are taken) */
  override onTake(p: Player, s: ItemStack): void {
    const m = this.menu;
    const took = m.inputSlot.remove(1);
    if (took) m.setupResultSlot();
    const [x, y, z] = m.pos;
    const t = p.level.gameTime;
    if (m.lastSoundTime !== t) {
      p.level.sound.play('ui.stonecutter.take_result', x + 0.5, y + 0.5, z + 0.5, 1, 1);
      m.lastSoundTime = t;
    }
    super.onTake(p, s);
  }
}

export class StonecutterMenu extends ContainerMenu {
  readonly container = new SimpleContainer(1);
  readonly resultContainer = new SimpleContainer(1);
  /** vanilla selectedRecipeIndex DataSlot (-1: none) */
  selectedRecipeIndex = -1;
  recipes: StonecutterRecipe[] = [];
  /** the input's item the list was made for (vanilla `input`, compared by item only) */
  private input: Item | null = null;
  lastSoundTime = -1;
  readonly inputSlot: Slot;
  readonly resultSlot: Slot;
  /** vanilla slotUpdateListener: the screen hears the input change */
  slotUpdateListener: () => void = () => {};

  constructor(player: Player, readonly pos: BlockPos) {
    super(player);
    this.container.onChange = () => {
      this.slotsChanged();
      this.slotUpdateListener();
    };
    this.inputSlot = this.addSlot(new Slot(this.container, 0, 20, 33));
    this.resultSlot = this.addSlot(new StonecutterResultSlot(this, this.resultContainer, 143, 33));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  numRecipes(): number {
    return this.recipes.length;
  }

  /** vanilla hasInputItem: there's something in the input it cuts into */
  hasInputItem(): boolean {
    return this.inputSlot.hasItem() && this.recipes.length > 0;
  }

  override stillValid(p: Player): boolean {
    return stillValidAt(p, this.pos, 'stonecutter');
  }

  /** vanilla clickMenuButton: pick recipe `id` (an empty spot in the grid changes nothing) */
  clickMenuButton(id: number): boolean {
    if (id >= 0 && id < this.recipes.length) {
      this.selectedRecipeIndex = id;
      this.setupResultSlot();
    }
    return true;
  }

  /** vanilla slotsChanged: a different item in the input starts the list afresh */
  slotsChanged(): void {
    const s = this.inputSlot.item;
    const it = s ? s.item : null;
    if (it !== this.input) {
      this.input = it;
      this.recipes = [];
      this.selectedRecipeIndex = -1;
      this.resultContainer.items[0] = null;
      if (s) this.recipes = stonecuttingRecipesFor(s);
    }
  }

  /** vanilla setupResultSlot */
  setupResultSlot(): void {
    const r = this.selectedRecipeIndex >= 0 ? this.recipes[this.selectedRecipeIndex] : undefined;
    this.resultContainer.items[0] = r && this.inputSlot.hasItem() ? ItemStack.of(r.result, r.count) : null;
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.resultContainer;
  }

  /** vanilla StonecutterMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 1) {
      if (!this.moveItemStackTo(s, 2, 38, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index === 0) {
      if (!this.moveItemStackTo(s, 2, 38, false)) return null;
    } else if (hasStonecuttingRecipe(s)) {
      if (!this.moveItemStackTo(s, 0, 1, false)) return null;
    } else if (index >= 2 && index < 29) {
      if (!this.moveItemStackTo(s, 29, 38, false)) return null;
    } else if (index >= 29 && index < 38 && !this.moveItemStackTo(s, 2, 29, false)) return null;
    if (s.count <= 0) slot.set(null);
    slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla removed: the result is thrown away, the input goes back to the player */
  override removed(): void {
    super.removed();
    this.resultContainer.items[0] = null;
    this.clearContainer(this.container);
  }
}
