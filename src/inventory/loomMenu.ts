// The loom's menu (vanilla LoomMenu): a banner and a dye in, and a banner pattern if the charge needs one; the
// patterns the loom offers are listed, and the one picked is woven onto a copy of the banner in the dye's colour.
// Taking it uses one banner and one dye; a banner with six layers takes no more.

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { stillValidAt, type BlockPos } from './stonecutterMenu';
import { NO_ITEM_REQUIRED, PATTERN_ITEMS, MAX_LOOM_LAYERS, bannerColorOf } from '../world/bannerPatterns';

/** vanilla BannerItem */
export function isBannerItem(s: ItemStack): boolean {
  return !s.item.id.includes('_wall_') && bannerColorOf(s.item.id) !== null;
}

/** vanilla DyeItem: the dye's colour (null for anything else) */
export function dyeColor(s: ItemStack | null): string | null {
  const m = s ? /^(.*)_dye$/.exec(s.item.id) : null;
  return m && m[1] !== '' ? m[1] : null;
}

/** vanilla BannerPatternItem */
export function isPatternItem(s: ItemStack): boolean {
  return s.item.id in PATTERN_ITEMS;
}

class InputSlot extends Slot {
  constructor(c: SimpleContainer, i: number, x: number, y: number, private readonly accepts: (s: ItemStack) => boolean, private readonly icon: string) {
    super(c, i, x, y);
  }
  override mayPlace(s: ItemStack): boolean {
    return this.accepts(s);
  }
  /** (vanilla LoomScreen draws these in its background: container/slot/banner, dye, banner_pattern) */
  override noItemIcon(): string {
    return this.icon;
  }
}

class LoomResultSlot extends Slot {
  constructor(private readonly menu: LoomMenu, c: SimpleContainer, x: number, y: number) {
    super(c, 0, x, y);
  }
  override mayPlace(): boolean {
    return false;
  }
  /** vanilla: a banner and a dye used; the choice forgotten if either runs out; the loom's sound, once a tick */
  override onTake(p: Player, s: ItemStack): void {
    const m = this.menu;
    m.bannerSlot.remove(1);
    m.dyeSlot.remove(1);
    if (!m.bannerSlot.hasItem() || !m.dyeSlot.hasItem()) m.selectedBannerPatternIndex = -1;
    const [x, y, z] = m.pos;
    const t = p.level.gameTime;
    if (m.lastSoundTime !== t) {
      p.level.sound.play('ui.loom.take_result', x + 0.5, y + 0.5, z + 0.5, 1, 1);
      m.lastSoundTime = t;
    }
    super.onTake(p, s);
  }
}

export class LoomMenu extends ContainerMenu {
  readonly inputContainer = new SimpleContainer(3);
  readonly outputContainer = new SimpleContainer(1);
  /** vanilla selectedBannerPatternIndex DataSlot (-1: none) */
  selectedBannerPatternIndex = -1;
  /** the patterns on offer, in the loom's order */
  selectablePatterns: string[] = [];
  lastSoundTime = -1;
  readonly bannerSlot: Slot;
  readonly dyeSlot: Slot;
  readonly patternSlot: Slot;
  readonly resultSlot: Slot;
  /** vanilla slotUpdateListener: the screen hears either container change */
  slotUpdateListener: () => void = () => {};

  constructor(player: Player, readonly pos: BlockPos) {
    super(player);
    this.inputContainer.onChange = () => {
      this.slotsChanged();
      this.slotUpdateListener();
    };
    this.outputContainer.onChange = () => this.slotUpdateListener();
    this.bannerSlot = this.addSlot(new InputSlot(this.inputContainer, 0, 13, 26, isBannerItem, 'slot_banner'));
    this.dyeSlot = this.addSlot(new InputSlot(this.inputContainer, 1, 33, 26, (s) => dyeColor(s) !== null, 'slot_dye'));
    this.patternSlot = this.addSlot(new InputSlot(this.inputContainer, 2, 23, 45, isPatternItem, 'slot_banner_pattern'));
    this.resultSlot = this.addSlot(new LoomResultSlot(this, this.outputContainer, 143, 58));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  override stillValid(p: Player): boolean {
    return stillValidAt(p, this.pos, 'loom');
  }

  /** vanilla clickMenuButton: pick the pattern at `id` in the list */
  clickMenuButton(id: number): boolean {
    if (id >= 0 && id < this.selectablePatterns.length) {
      this.selectedBannerPatternIndex = id;
      this.setupResultSlot(this.selectablePatterns[id]);
      return true;
    }
    return false;
  }

  /** vanilla getSelectablePatterns: #no_item_required with no pattern item in, else the pattern item's own */
  private patternsFor(pattern: ItemStack | null): string[] {
    if (!pattern) return NO_ITEM_REQUIRED;
    const p = PATTERN_ITEMS[pattern.item.id];
    return p ? [p.pattern] : [];
  }

  /**
   * vanilla slotsChanged: with a banner and a dye in, the list for the pattern slot; the pick kept if it's still
   * there (the only one is picked for you); a banner already six layers deep makes nothing
   */
  slotsChanged(): void {
    const banner = this.bannerSlot.item, dye = this.dyeSlot.item, pattern = this.patternSlot.item;
    if (!banner || !dye) {
      this.outputContainer.items[0] = null;
      this.outputContainer.changed();
      this.selectablePatterns = [];
      this.selectedBannerPatternIndex = -1;
      return;
    }
    const i = this.selectedBannerPatternIndex;
    const valid = i >= 0 && i < this.selectablePatterns.length;
    const old = this.selectablePatterns;
    this.selectablePatterns = this.patternsFor(pattern);
    let chosen: string | null;
    if (this.selectablePatterns.length === 1) {
      this.selectedBannerPatternIndex = 0;
      chosen = this.selectablePatterns[0];
    } else if (!valid) {
      this.selectedBannerPatternIndex = -1;
      chosen = null;
    } else {
      const j = this.selectablePatterns.indexOf(old[i]);
      chosen = j >= 0 ? old[i] : null;
      this.selectedBannerPatternIndex = j;
    }
    if (chosen !== null && (banner.tag?.patterns?.length ?? 0) < MAX_LOOM_LAYERS) this.setupResultSlot(chosen);
    else {
      if (chosen !== null) this.selectedBannerPatternIndex = -1;
      this.outputContainer.items[0] = null;
      this.outputContainer.changed();
    }
  }

  /** vanilla setupResultSlot: one of the banner, the pattern added on top in the dye's colour */
  private setupResultSlot(pattern: string): void {
    const banner = this.bannerSlot.item, dye = this.dyeSlot.item;
    let out: ItemStack | null = null;
    const color = dyeColor(dye);
    if (banner && color) {
      out = banner.copyWithCount(1);
      out.tag = { ...(out.tag ?? {}), patterns: [...(out.tag?.patterns ?? []), { pattern, color }] };
    }
    const cur = this.outputContainer.items[0];
    // (vanilla ItemStack.matches: only a different result is put in)
    if (!(out && cur && cur.count === out.count && cur.sameItem(out)) && !(out === null && cur === null)) {
      this.outputContainer.items[0] = out;
      this.outputContainer.changed();
    }
  }

  /** vanilla LoomMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === this.resultSlot.index) {
      if (!this.moveItemStackTo(s, 4, 40, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index !== this.dyeSlot.index && index !== this.bannerSlot.index && index !== this.patternSlot.index) {
      if (isBannerItem(s)) {
        if (!this.moveItemStackTo(s, this.bannerSlot.index, this.bannerSlot.index + 1, false)) return null;
      } else if (dyeColor(s) !== null) {
        if (!this.moveItemStackTo(s, this.dyeSlot.index, this.dyeSlot.index + 1, false)) return null;
      } else if (isPatternItem(s)) {
        if (!this.moveItemStackTo(s, this.patternSlot.index, this.patternSlot.index + 1, false)) return null;
      } else if (index >= 4 && index < 31) {
        if (!this.moveItemStackTo(s, 31, 40, false)) return null;
      } else if (index >= 31 && index < 40 && !this.moveItemStackTo(s, 4, 31, false)) return null;
    } else if (!this.moveItemStackTo(s, 4, 40, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla removed: what's in the three input slots goes back to the player (the result was only ever a preview) */
  override removed(): void {
    super.removed();
    this.clearContainer(this.inputContainer);
  }
}
