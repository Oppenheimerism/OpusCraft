// Container screens (vanilla AbstractContainerScreen and subclasses):
// slot rendering/highlight, carried item, drag-splitting, tooltips, keys.

import type { Game } from '../../game/game';
import { Screen, Button } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { ContainerMenu, Slot, canItemQuickReplace, quickCraftPlaceCount, quickcraftMask, ClickType } from '../../inventory/container';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu } from '../../inventory/menus';
import { ItemStack, RARITY_COLOR } from '../../item/item';
import { enchantmentLine, tooltipOrder } from '../../item/enchantments';
import { KEYS } from '../../game/input';
import { RecipeBookComponent } from '../recipeBookComponent';
import { MobEffectInstance, compareEffects, effectDisplayName, formatEffectDuration } from '../../entity/effects';

const LABEL = 0x404040;

/** vanilla ItemStack.getTooltipLines: name in its rarity colour (italic when renamed), component lines, attribute modifiers */
export function itemTooltip(s: ItemStack): string[] {
  const it = s.item;
  const rarity = s.rarity();
  const italic = s.tag?.customName !== undefined ? '§o' : '';
  const lines = [rarity === 'common' ? `${italic}${s.displayName()}` : `§${RARITY_COLOR[rarity]}${italic}${s.displayName()}`];
  if (it.lore) for (const l of it.lore) lines.push(`§7${l}`);
  // stored then held enchantments, each in #tooltip_order (ItemEnchantments.addToTooltip)
  for (const ench of [s.tag?.stored, s.tag?.enchantments])
    if (ench)
      for (const [id, lvl] of tooltipOrder(ench)) {
        const e = enchantmentLine(id, lvl);
        lines.push((e.curse ? '§c' : '§7') + e.text);
      }
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
  if (it.tool || it.attackDamage !== 1 || it.attackSpeed !== 4) {
    if (it.tool || it.attackDamage > 1) {
      lines.push('', '§7When in Main Hand:', `§2 ${fmt(it.attackDamage)} Attack Damage`, `§2 ${fmt(it.attackSpeed)} Attack Speed`);
    }
  }
  if (it.armor) {
    const slotName = { head: 'Head', chest: 'Body', legs: 'Legs', feet: 'Feet' }[it.armor.slot];
    lines.push('', `§7When on ${slotName}:`, `§9+${it.armor.defense} Armor`);
    if (it.armor.toughness) lines.push(`§9+${it.armor.toughness} Armor Toughness`);
  }
  return lines;
}

export abstract class AbstractContainerScreen<M extends ContainerMenu> extends Screen {
  imageWidth = 176;
  imageHeight = 166;
  leftPos = 0;
  topPos = 0;
  titleLabelX = 8;
  titleLabelY = 6;
  inventoryLabelX = 8;
  inventoryLabelY = 72;
  showInventoryLabel = true;
  hoveredSlot: Slot | null = null;
  protected isQuickCrafting = false;
  protected quickCraftingType = 0;
  protected quickCraftingButton = 0;
  protected readonly quickCraftSlots = new Set<Slot>();
  protected quickCraftingRemainder = 0;
  private skipNextRelease = false;
  private doubleclick = false;
  private lastClickSlot: Slot | null = null;
  private lastClickTime = 0;
  private lastClickButton = -1;
  private lastQuickMoved: ItemStack | null = null;
  private quickCraftStart: Slot | null = null;
  /** the recipe book beside crafting grids and furnaces */
  protected book: RecipeBookComponent | null = null;

  constructor(game: Game, public menu: M, title: string) {
    super(game, title);
  }

  init(): void {
    this.book?.init(this.width, this.height);
    this.leftPos = this.book ? this.book.leftPos(this.imageWidth) : Math.floor((this.width - this.imageWidth) / 2);
    this.topPos = Math.floor((this.height - this.imageHeight) / 2);
    this.inventoryLabelY = this.imageHeight - 94;
  }

  /** the green book button: open/close the recipe book and slide the container */
  protected addRecipeBookButton(dx: number, y: number): void {
    const b = this.add(new RecipeBookButton(this.leftPos + dx, y, () => {
      this.book?.toggle();
      this.leftPos = this.book ? this.book.leftPos(this.imageWidth) : this.leftPos;
      b.x = this.leftPos + dx;
    }));
  }

  override isPauseScreen(): boolean {
    return false;
  }

  abstract renderBg(g: GuiGraphics, mx: number, my: number, partial: number): void;

  override renderBackground(g: GuiGraphics): void {
    this.game.renderTransparentBackground(g);
  }

  renderLabels(g: GuiGraphics): void {
    g.text(this.title, this.titleLabelX, this.titleLabelY, LABEL, false);
    if (this.showInventoryLabel) g.text('Inventory', this.inventoryLabelX, this.inventoryLabelY, LABEL, false);
  }

  override tick(): void {
    if (!this.menu.stillValid(this.game.player) || this.game.player.health <= 0) this.onClose();
    this.book?.tick();
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    // vanilla: on narrow screens the open recipe book replaces the container
    if (this.book?.visible && this.book.widthTooNarrow) {
      this.renderBackground(g);
      this.renderBg(g, mx, my, partial);
      this.book.render(g, mx, my, partial);
      this.book.renderTooltip(g, mx, my);
      return;
    }
    this.renderBackground(g);
    this.renderBg(g, mx, my, partial);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    const L = this.leftPos, T = this.topPos;
    g.pushTransform(L, T);
    this.hoveredSlot = null;
    for (const slot of this.menu.slots) {
      if (!slot.isActive()) continue;
      const hovered = this.isHovering(slot, mx, my);
      if (hovered) {
        this.hoveredSlot = slot;
        if (slot.isHighlightable()) g.sprite('slot_highlight_back', slot.x - 4, slot.y - 4, 24, 24);
      }
      this.renderSlot(g, slot);
      if (hovered && slot.isHighlightable()) g.sprite('slot_highlight_front', slot.x - 4, slot.y - 4, 24, 24);
    }
    this.renderLabels(g);
    let carried = this.menu.carried;
    if (carried) {
      let countText: string | null = null;
      if (this.isQuickCrafting && this.quickCraftSlots.size > 1) {
        carried = carried.copyWithCount(this.quickCraftingRemainder);
        if (carried.count <= 0) countText = '§e0';
      }
      const x = mx - L - 8, y = my - T - 8;
      g.stack(carried, x, y);
      if (countText) g.text(countText, x + 17 - g.textWidth(countText), y + 9, 0xffffff, true);
      else g.itemDecorations(carried.count, carried.damage, carried.item.maxDamage, x, y);
    }
    g.popTransform();
    this.renderEffects(g, mx, my);
    if (this.book) {
      this.book.render(g, mx, my, partial);
      this.book.renderGhost(g, L, T);
    }
    if (!this.book?.renderTooltip(g, mx, my)) this.renderTooltip(g, mx, my);
  }

  /** vanilla EffectRenderingInventoryScreen: room right of the panel to list the active effects */
  canSeeEffects(): boolean {
    return false;
  }

  /** vanilla EffectRenderingInventoryScreen.renderEffects (screens that list effects override canSeeEffects) */
  protected renderEffects(g: GuiGraphics, mx: number, my: number): void {
    const x = this.leftPos + this.imageWidth + 2;
    const effects = this.game.player.activeEffects;
    if (!this.canSeeEffects() || !effects.size) return;
    // wide enough for names and times, otherwise icons with a tooltip
    const large = this.width - x >= 120;
    const list: MobEffectInstance[] = [...effects.values()].sort(compareEffects);
    const k = list.length > 5 ? Math.floor(132 / (list.length - 1)) : 33;
    list.forEach((_inst, i) => g.sprite(large ? 'effect_background_large' : 'effect_background_small', x, this.topPos + i * k, large ? 120 : 32, 32));
    list.forEach((inst, i) => g.sprite('mob_effect_' + inst.id, x + (large ? 6 : 7), this.topPos + i * k + 7, 18, 18));
    if (large) {
      list.forEach((inst, i) => {
        g.text(effectDisplayName(inst), x + 28, this.topPos + i * k + 6, 0xffffff, true);
        g.text(formatEffectDuration(inst), x + 28, this.topPos + i * k + 16, 0x7f7f7f, true);
      });
    } else if (mx >= x && mx <= x + 33) {
      let h: MobEffectInstance | null = null;
      for (let i = 0; i < list.length; i++) if (my >= this.topPos + i * k && my <= this.topPos + i * k + k) h = list[i];
      if (h) g.tooltip([effectDisplayName(h), '§f' + formatEffectDuration(h)], mx, my);
    }
  }

  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    if (!this.menu.carried && this.hoveredSlot?.hasItem()) {
      g.tooltip(itemTooltip(this.hoveredSlot.item!), mx, my);
      return;
    }
    super.renderTooltip(g, mx, my);
  }

  protected renderSlot(g: GuiGraphics, slot: Slot): void {
    const x = slot.x, y = slot.y;
    let stack = slot.item;
    let dragHighlight = false;
    let countText: string | null = null;
    const carried = this.menu.carried;
    if (this.isQuickCrafting && this.quickCraftSlots.has(slot) && carried) {
      if (this.quickCraftSlots.size === 1) return this.drawStack(g, slot, stack, null, false);
      if (canItemQuickReplace(slot, carried, true) && this.menu.canDragTo(slot)) {
        dragHighlight = true;
        const max = Math.min(carried.maxStack, slot.maxStackSize(carried));
        const had = slot.item?.count ?? 0;
        let n = quickCraftPlaceCount(this.quickCraftSlots, this.quickCraftingType, carried) + had;
        if (n > max) {
          n = max;
          countText = `§e${max}`;
        }
        stack = carried.copyWithCount(n);
      } else {
        this.quickCraftSlots.delete(slot);
        this.recalculateQuickCraftRemaining();
      }
    }
    if (!stack) {
      const icon = slot.noItemIcon();
      if (icon) g.sprite(icon, x, y, 16, 16);
    }
    if (dragHighlight) g.fill(x, y, x + 16, y + 16, 0x80ffffff);
    this.drawStack(g, slot, stack, countText, dragHighlight);
  }

  private drawStack(g: GuiGraphics, _slot: Slot, stack: ItemStack | null, countText: string | null, _drag: boolean): void {
    if (!stack) return;
    const x = _slot.x, y = _slot.y;
    g.stack(stack, x, y);
    if (countText) g.text(countText, x + 17 - g.textWidth(countText), y + 9, 0xffffff, true);
    else g.itemDecorations(stack.count, stack.damage, stack.item.maxDamage, x, y);
  }

  protected isHovering(slot: Slot, mx: number, my: number): boolean {
    if (this.book?.visible && this.book.widthTooNarrow) return false;
    const x = mx - this.leftPos, y = my - this.topPos;
    return x >= slot.x - 1 && x < slot.x + 16 + 1 && y >= slot.y - 1 && y < slot.y + 16 + 1;
  }

  protected findSlot(mx: number, my: number): Slot | null {
    for (const s of this.menu.slots) if (s.isActive() && this.isHovering(s, mx, my)) return s;
    return null;
  }

  protected hasClickedOutside(mx: number, my: number): boolean {
    if (this.book?.isOverBook(mx, my)) return false;
    return mx < this.leftPos || my < this.topPos || mx >= this.leftPos + this.imageWidth || my >= this.topPos + this.imageHeight;
  }

  protected slotClicked(slot: Slot | null, slotId: number, button: number, type: ClickType): void {
    if (slot) slotId = slot.index;
    this.menu.clicked(slotId, button, type);
    this.book?.slotClicked(slot);
  }

  private recalculateQuickCraftRemaining(): void {
    const c = this.menu.carried;
    if (!c || !this.isQuickCrafting) return;
    if (this.quickCraftingType === 2) {
      this.quickCraftingRemainder = c.maxStack;
      return;
    }
    this.quickCraftingRemainder = c.count;
    for (const slot of this.quickCraftSlots) {
      const had = slot.item?.count ?? 0;
      const max = Math.min(c.maxStack, slot.maxStackSize(c));
      const n = Math.min(quickCraftPlaceCount(this.quickCraftSlots, this.quickCraftingType, c) + had, max);
      this.quickCraftingRemainder -= n - had;
    }
  }

  private shiftDown(): boolean {
    return this.game.input.isDown('ShiftLeft') || this.game.input.isDown('ShiftRight');
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    if (this.book?.mouseClicked(mx, my, button)) return true;
    if (super.mouseClicked(mx, my, button)) return true;
    if (this.book?.visible && this.book.widthTooNarrow) return true;
    const creative = this.game.player.gameMode === 'creative';
    // browser buttons (0 left, 1 middle, 2 right) → vanilla (0 left, 1 right, 2 middle)
    const btn = button === 0 ? 0 : button === 2 ? 1 : 2;
    const pick = btn === 2 && creative;
    const slot = this.findSlot(mx, my);
    const now = performance.now();
    this.doubleclick = this.lastClickSlot === slot && now - this.lastClickTime < 250 && this.lastClickButton === btn;
    this.skipNextRelease = false;
    if (btn !== 0 && btn !== 1 && !pick) return true;
    const outside = this.hasClickedOutside(mx, my);
    let id = slot ? slot.index : -1;
    if (outside) id = -999;
    if (id !== -1 && !this.isQuickCrafting) {
      if (!this.menu.carried) {
        if (pick) this.slotClicked(slot, id, 0, 'clone');
        else {
          const shift = id !== -999 && this.shiftDown();
          let type: ClickType = 'pickup';
          if (shift) {
            this.lastQuickMoved = slot?.item ? slot.item.copy() : null;
            type = 'quick_move';
          } else if (id === -999) type = 'throw';
          this.slotClicked(slot, id, btn, type);
        }
        this.skipNextRelease = true;
      } else {
        this.isQuickCrafting = true;
        this.quickCraftingButton = pick ? 2 : btn;
        this.quickCraftSlots.clear();
        this.quickCraftingType = pick ? 2 : btn;
        this.quickCraftStart = slot;
      }
    }
    this.lastClickSlot = slot;
    this.lastClickTime = now;
    this.lastClickButton = btn;
    return true;
  }

  override mouseDragged(mx: number, my: number): boolean {
    super.mouseDragged(mx, my);
    const slot = this.findSlot(mx, my);
    const c = this.menu.carried;
    const ok = (s: Slot | null): s is Slot => !!s && !!c && (c.count > this.quickCraftSlots.size || this.quickCraftingType === 2) && canItemQuickReplace(s, c, true) && s.mayPlace(c) && this.menu.canDragTo(s);
    // include the slot the drag started on even if the first move event lands elsewhere
    if (this.isQuickCrafting && !this.quickCraftSlots.size && this.quickCraftStart !== slot && ok(this.quickCraftStart)) this.quickCraftSlots.add(this.quickCraftStart);
    if (this.isQuickCrafting && ok(slot)) {
      this.quickCraftSlots.add(slot);
      this.recalculateQuickCraftRemaining();
    }
    return true;
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    super.mouseReleased(mx, my, button);
    const btn = button === 0 ? 0 : button === 2 ? 1 : 2;
    const slot = this.findSlot(mx, my);
    const outside = this.hasClickedOutside(mx, my);
    let id = slot ? slot.index : -1;
    if (outside) id = -999;
    if (this.doubleclick && slot && btn === 0 && this.menu.canTakeItemForPickAll(null, slot)) {
      if (this.shiftDown()) {
        const q = this.lastQuickMoved;
        if (q)
          for (const s2 of this.menu.slots)
            if (s2.mayPickup(this.game.player) && s2.hasItem() && s2.container === slot.container && canItemQuickReplace(s2, q, true)) this.slotClicked(s2, s2.index, btn, 'quick_move');
      } else this.slotClicked(slot, id, btn, 'pickup_all');
      this.doubleclick = false;
      this.lastClickTime = 0;
    } else {
      if (this.isQuickCrafting && this.quickCraftingButton !== btn) {
        this.isQuickCrafting = false;
        this.quickCraftSlots.clear();
        this.skipNextRelease = true;
        return true;
      }
      if (this.skipNextRelease) {
        this.skipNextRelease = false;
        return true;
      }
      if (this.isQuickCrafting && this.quickCraftSlots.size) {
        this.slotClicked(null, -999, quickcraftMask(0, this.quickCraftingType), 'quick_craft');
        for (const s of this.quickCraftSlots) this.slotClicked(s, s.index, quickcraftMask(1, this.quickCraftingType), 'quick_craft');
        this.slotClicked(null, -999, quickcraftMask(2, this.quickCraftingType), 'quick_craft');
      } else if (this.menu.carried) {
        if (btn === 2 && this.game.player.gameMode === 'creative') this.slotClicked(slot, id, 0, 'clone');
        else if (btn === 0 || btn === 1) {
          const shift = id !== -999 && this.shiftDown();
          if (shift) this.lastQuickMoved = slot?.item ? slot.item.copy() : null;
          if (id !== -1) this.slotClicked(slot, id, btn, shift ? 'quick_move' : 'pickup');
        }
      }
    }
    if (!this.menu.carried) this.lastClickTime = 0;
    this.isQuickCrafting = false;
    return true;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (this.book?.keyPressed(e)) return true;
    if (e.key === 'Escape' || e.code === KEYS.inventory) {
      this.onClose();
      return true;
    }
    const h = this.hoveredSlot;
    if (!this.menu.carried && h) {
      if (e.code === KEYS.swapHands) {
        this.slotClicked(h, h.index, 40, 'swap');
        return true;
      }
      for (let i = 0; i < 9; i++)
        if (e.code === KEYS[`hotbar${i + 1}` as keyof typeof KEYS]) {
          this.slotClicked(h, h.index, i, 'swap');
          return true;
        }
    }
    if (h?.hasItem() && e.code === KEYS.drop) {
      this.slotClicked(h, h.index, e.ctrlKey || e.metaKey ? 1 : 0, 'throw');
      return true;
    }
    return super.keyPressed(e);
  }

  override charTyped(ch: string): boolean {
    return this.book?.charTyped(ch) ?? false;
  }

  override onClose(): void {
    this.game.setScreen(null);
  }

  override removed(): void {
    this.menu.removed();
  }
}

// ---------------------------------------------------------------------------

export class InventoryScreen extends AbstractContainerScreen<InventoryMenu> {
  constructor(game: Game, menu: InventoryMenu) {
    super(game, menu, 'Crafting');
    this.titleLabelX = 97;
  }
  override init(): void {
    this.book ??= new RecipeBookComponent(this.game, 'crafting', this.menu);
    super.init();
    this.addRecipeBookButton(104, Math.floor(this.height / 2) - 22);
  }
  override renderLabels(g: GuiGraphics): void {
    g.text(this.title, this.titleLabelX, this.titleLabelY, LABEL, false);
  }
  override canSeeEffects(): boolean {
    return this.width - (this.leftPos + this.imageWidth + 2) >= 32;
  }
  renderBg(g: GuiGraphics, mx: number, my: number): void {
    g.sprite('container_inventory', this.leftPos, this.topPos);
    this.game.renderEntityInInventory(g, this.leftPos + 26, this.topPos + 8, this.leftPos + 75, this.topPos + 78, 30, 0.0625, mx, my);
  }
}

class RecipeBookButton extends Button {
  constructor(x: number, y: number, onPress: () => void) {
    super(x, y, 20, 18, '', onPress);
  }
  override render(g: GuiGraphics, mx: number, my: number): void {
    g.sprite(this.isMouseOver(mx, my) ? 'recipe_book_button_highlighted' : 'recipe_book_button', this.x, this.y, 20, 18);
  }
}

export class CraftingScreen extends AbstractContainerScreen<CraftingMenu> {
  constructor(game: Game, menu: CraftingMenu) {
    super(game, menu, 'Crafting');
    this.titleLabelX = 29;
  }
  override init(): void {
    this.book ??= new RecipeBookComponent(this.game, 'crafting', this.menu);
    super.init();
    this.addRecipeBookButton(5, Math.floor(this.height / 2) - 49);
  }
  renderBg(g: GuiGraphics): void {
    g.sprite('container_crafting_table', this.leftPos, this.topPos);
  }
}

export class FurnaceScreen extends AbstractContainerScreen<FurnaceMenu> {
  constructor(game: Game, menu: FurnaceMenu) {
    super(game, menu, 'Furnace');
    this.titleLabelX = Math.floor((176 - 0) / 2);
  }
  override init(): void {
    this.book ??= new RecipeBookComponent(this.game, 'furnace', this.menu);
    super.init();
    this.addRecipeBookButton(20, Math.floor(this.height / 2) - 49);
  }
  override renderLabels(g: GuiGraphics): void {
    g.text(this.title, Math.floor((this.imageWidth - g.textWidth(this.title)) / 2), this.titleLabelY, LABEL, false);
    g.text('Inventory', this.inventoryLabelX, this.inventoryLabelY, LABEL, false);
  }
  renderBg(g: GuiGraphics): void {
    const L = this.leftPos, T = this.topPos;
    g.sprite('container_furnace', L, T);
    const f = this.menu.furnace;
    if (f.isLit) {
      const k = Math.ceil(f.litProgress() * 13) + 1;
      g.sprite('furnace_lit_progress', L + 56, T + 36 + 14 - k, 14, k, 0, 14 - k, 14, k);
    }
    const l = Math.ceil(f.burnProgress() * 24);
    if (l > 0) g.sprite('furnace_burn_progress', L + 79, T + 34, l, 16, 0, 0, l, 16);
  }
}

export class ChestScreen extends AbstractContainerScreen<ChestMenu> {
  constructor(game: Game, menu: ChestMenu) {
    super(game, menu, menu.title);
    this.imageHeight = 114 + menu.rows * 18;
  }
  override removed(): void {
    super.removed();
    const c = this.menu.chest;
    if (!('containerStillValid' in c)) this.game.chestClosed(c);
  }
  renderBg(g: GuiGraphics): void {
    const L = this.leftPos, T = this.topPos, rows = this.menu.rows;
    g.sprite('container_generic_54', L, T, 176, rows * 18 + 17, 0, 0, 176, rows * 18 + 17);
    g.sprite('container_generic_54', L, T + rows * 18 + 17, 176, 96, 0, 126, 176, 96);
  }
}
