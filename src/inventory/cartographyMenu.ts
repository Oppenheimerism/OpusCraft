// The cartography table's menu (vanilla CartographyTableMenu): a filled map, and paper to zoom it out, an empty map
// to copy it onto, or a glass pane to lock it. The result is the map (two of it for a copy), told what to become;
// taking it uses one of each input and does it (MapItem.onCraftedPostProcess), with the table's sound.

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { stillValidAt, TakeAllSlot, type BlockPos } from './stonecutterMenu';
import { getSavedData } from '../game/maps';
import { craftedBy } from '../game/itemBehavior';

/** the second slot's items */
function isAdditional(s: ItemStack): boolean {
  const id = s.item.id;
  return id === 'paper' || id === 'map' || id === 'glass_pane';
}

class FilterSlot extends Slot {
  constructor(c: SimpleContainer, i: number, x: number, y: number, private readonly accepts: (s: ItemStack) => boolean) {
    super(c, i, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return this.accepts(s);
  }
}

class CartographyResultSlot extends TakeAllSlot {
  constructor(private readonly menu: CartographyTableMenu, c: SimpleContainer, x: number, y: number) {
    super(c, 0, x, y);
  }
  /** vanilla: one of each input used, the map made what it was to be, and the table's sound (once a tick) */
  override onTake(p: Player, s: ItemStack): void {
    const m = this.menu;
    m.mapSlot.remove(1);
    m.additionalSlot.remove(1);
    craftedBy(p, s);
    const [x, y, z] = m.pos;
    const t = p.level.gameTime;
    if (m.lastSoundTime !== t) {
      p.level.sound.play('ui.cartography_table.take_result', x + 0.5, y + 0.5, z + 0.5, 1, 1);
      m.lastSoundTime = t;
    }
    super.onTake(p, s);
  }
}

/** vanilla ItemStack.matches */
function matches(a: ItemStack | null, b: ItemStack | null): boolean {
  if (!a || !b) return !a && !b;
  return a.count === b.count && a.sameItem(b);
}

export class CartographyTableMenu extends ContainerMenu {
  readonly container = new SimpleContainer(2);
  readonly resultContainer = new SimpleContainer(1);
  lastSoundTime = -1;
  readonly mapSlot: Slot;
  readonly additionalSlot: Slot;
  readonly resultSlot: Slot;

  constructor(player: Player, readonly pos: BlockPos) {
    super(player);
    // (vanilla: either container changing looks again at what's in)
    this.container.onChange = () => this.slotsChanged();
    this.resultContainer.onChange = () => this.slotsChanged();
    this.mapSlot = this.addSlot(new FilterSlot(this.container, 0, 15, 15, (s) => s.item.id === 'filled_map'));
    this.additionalSlot = this.addSlot(new FilterSlot(this.container, 1, 15, 52, isAdditional));
    this.resultSlot = this.addSlot(new CartographyResultSlot(this, this.resultContainer, 145, 39));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  override stillValid(p: Player): boolean {
    return stillValidAt(p, this.pos, 'cartography_table');
  }

  /** vanilla slotsChanged: with both inputs in, the result is worked out; a result left without them goes */
  slotsChanged(): void {
    const map = this.container.items[0], add = this.container.items[1], res = this.resultContainer.items[0];
    if (!res || (map && add)) {
      if (map && add) this.setupResultSlot(map, add, res);
    } else this.resultContainer.items[0] = null;
  }

  /**
   * vanilla setupResultSlot: paper zooms out an unlocked map short of scale 4, a glass pane locks an unlocked one, an
   * empty map makes two of it; anything else, nothing. (A map with no data leaves the result as it was.)
   */
  private setupResultSlot(map: ItemStack, add: ItemStack, current: ItemStack | null): void {
    const d = getSavedData(map, this.player.level);
    if (!d) return;
    let out: ItemStack;
    const id = add.item.id;
    if (id === 'paper' && !d.locked && d.scale < 4) {
      out = map.copyWithCount(1);
      out.tag = { ...out.tag, mapPostProcessing: 'scale' };
    } else if (id === 'glass_pane' && !d.locked) {
      out = map.copyWithCount(1);
      out.tag = { ...out.tag, mapPostProcessing: 'lock' };
    } else if (id === 'map') out = map.copyWithCount(2);
    else {
      this.resultContainer.items[0] = null;
      return;
    }
    // (vanilla ResultContainer.setItem: no change is announced)
    if (!matches(out, current)) this.resultContainer.items[0] = out;
  }

  override canTakeItemForPickAll(s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.resultContainer && super.canTakeItemForPickAll(s, slot);
  }

  /** vanilla CartographyTableMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 2) {
      craftedBy(p, s);
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index !== 1 && index !== 0) {
      if (s.item.id === 'filled_map') {
        if (!this.moveItemStackTo(s, 0, 1, false)) return null;
      } else if (!isAdditional(s)) {
        if (index >= 3 && index < 30) {
          if (!this.moveItemStackTo(s, 30, 39, false)) return null;
        } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
      } else if (!this.moveItemStackTo(s, 1, 2, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    if (s.count <= 0) slot.set(null);
    slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla removed: the result was only ever a preview; the map and what was with it go back */
  override removed(): void {
    super.removed();
    this.resultContainer.items[0] = null;
    this.clearContainer(this.container);
  }
}
