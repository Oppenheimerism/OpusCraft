// The recipe book panel (vanilla RecipeBookComponent, RecipeBookPage,
// RecipeButton, RecipeBookTabButton, OverlayRecipeComponent and GhostRecipe)
// shown beside the inventory, crafting table and furnace screens.

import type { Game } from '../game/game';
import type { GuiGraphics } from './guiGraphics';
import { EditBox, playClick } from './screen';
import { itemTooltip } from './screens/container';
import type { Slot } from '../inventory/container';
import { CraftingMenuBase, FurnaceMenu, recipeTarget } from '../inventory/menus';
import { ItemStack, ITEMS } from '../item/item';
import { fuelTime } from '../inventory/recipes';
import {
  BookType, BookCategory, BookRecipe, RecipeCollection, BOOK_TABS, BOOK_BY_ID, collections, fits, countItems, assign, placeRecipe, gridCells,
} from '../inventory/recipeBook';

/** vanilla gui.recipebook.toggleRecipes.* */
const FILTER_TEXT: Record<BookType, string> = { crafting: 'Showing Craftable', furnace: 'Showing Smeltable', smoker: 'Showing Smokable', blast_furnace: 'Showing Blastable' };

const W = 147, H = 166;
const PER_PAGE = 20;

interface CollectionView {
  c: RecipeCollection;
  known: BookRecipe[];
  craftable: Set<BookRecipe>;
}

interface Ghost {
  /** [slot x, slot y, alternatives] — the first entry is the result */
  entries: [number, number, string[]][];
}

export class RecipeBookComponent {
  private width = 0;
  private height = 0;
  widthTooNarrow = false;
  private xOffset = 86;
  private tab: BookCategory;
  private page = 0;
  private views: CollectionView[] = [];
  private readonly search = new EditBox(0, 0, 81, 14, '');
  private lastSearch = '';
  private invVersion = -1;
  private time = 0;
  private ghost: Ghost | null = null;
  /** right-click popup of a collection's recipes */
  private overlay: { x: number; y: number; cols: number; buttons: { x: number; y: number; r: BookRecipe; craftable: boolean }[] } | null = null;
  /** tab icon bounce for categories with new recipes */
  private readonly tabAnim = new Map<BookCategory, number>();
  private readonly buttonAnim = new Map<string, number>();
  private ignoreTextInput = false;

  constructor(private readonly game: Game, readonly type: BookType, private readonly menu: CraftingMenuBase | FurnaceMenu) {
    this.tab = BOOK_TABS[type][0].category;
    this.search.maxLength = 50;
    this.search.hint = 'Search...';
  }

  private get book() {
    return this.game.recipeBook;
  }

  get visible(): boolean {
    return this.book.open[this.type];
  }

  private get gridW(): number {
    return this.menu instanceof CraftingMenuBase ? this.menu.gridW : 1;
  }

  /** vanilla RecipeBookComponent.init */
  init(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.widthTooNarrow = width < 379;
    this.xOffset = this.widthTooNarrow ? 0 : 86;
    const [x, y] = this.origin();
    this.search.x = x + 25;
    this.search.y = y + 13;
    this.search.w = 81;
    this.search.h = 14;
    this.invVersion = -1;
    this.refresh(false);
    this.startTabAnimations();
  }

  private origin(): [number, number] {
    return [Math.floor((this.width - W) / 2) - this.xOffset, Math.floor((this.height - H) / 2)];
  }

  /** vanilla updateScreenPosition: where the container sits with the book open */
  leftPos(imageWidth: number): number {
    if (this.visible && !this.widthTooNarrow) return 177 + Math.floor((this.width - imageWidth - 200) / 2);
    return Math.floor((this.width - imageWidth) / 2);
  }

  toggle(): void {
    this.book.open[this.type] = !this.book.open[this.type];
    if (!this.visible) this.search.focused = false;
    this.invVersion = -1;
    this.refresh(false);
  }

  tick(): void {
    if (!this.visible) return;
    const v = this.game.player.inventory.version;
    if (v !== this.invVersion) {
      this.invVersion = v;
      this.refresh(false);
    }
  }

  // -------------------------------------------------------------------------
  // collections

  private avail(): Map<string, number> {
    const cells: (ItemStack | null)[] = [];
    if (this.menu instanceof CraftingMenuBase) cells.push(...this.menu.craft.items);
    return countItems([...this.game.player.inventory.main, ...cells]);
  }

  private categoryCollections(cat: BookCategory): RecipeCollection[] {
    const all = collections(this.type);
    if (cat.endsWith('_search')) return all;
    return all.filter((c) => c.category === cat);
  }

  private view(c: RecipeCollection, avail: Map<string, number>): CollectionView {
    const gw = this.gridW;
    const known = c.recipes.filter((r) => this.book.known.has(r.id) && fits(r, gw, gw));
    const craftable = new Set(known.filter((r) => assign(r, avail, 1)));
    return { c, known, craftable };
  }

  /** vanilla updateCollections */
  private refresh(resetPage: boolean): void {
    const avail = this.avail();
    const q = this.search.value.trim().toLowerCase();
    this.views = this.categoryCollections(this.tab)
      .map((c) => this.view(c, avail))
      .filter((v) => v.known.length)
      .filter((v) => !q || v.known.some((r) => (ITEMS.get(r.result)?.name ?? r.result).toLowerCase().includes(q)))
      .filter((v) => !this.book.filtering[this.type] || v.craftable.size);
    const pages = this.totalPages();
    if (resetPage || this.page >= pages) this.page = 0;
    // vanilla recipesShown: what's on the page is no longer new
    for (const v of this.views.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE)) {
      if (v.known.some((r) => this.book.highlight.has(r.id))) this.buttonAnim.set(v.c.key, 15);
      for (const r of v.known) this.book.highlight.delete(r.id);
    }
  }

  private totalPages(): number {
    return Math.max(1, Math.ceil(this.views.length / PER_PAGE));
  }

  /** vanilla RecipeBookTabButton.updateVisibility: tabs of categories with known recipes */
  private visibleTabs(): { category: BookCategory; icons: string[] }[] {
    const gw = this.gridW;
    return BOOK_TABS[this.type].filter(
      (t) => t.category.endsWith('_search') || this.categoryCollections(t.category).some((c) => c.recipes.some((r) => this.book.known.has(r.id) && fits(r, gw, gw))),
    );
  }

  private startTabAnimations(): void {
    for (const t of BOOK_TABS[this.type]) {
      if (t.category.endsWith('_search')) continue;
      if (this.categoryCollections(t.category).some((c) => c.recipes.some((r) => this.book.highlight.has(r.id)))) this.tabAnim.set(t.category, 15);
    }
  }

  /** craftable recipes first, then the rest unless filtering (vanilla getOrderedRecipes) */
  private ordered(v: CollectionView): BookRecipe[] {
    const a = v.known.filter((r) => v.craftable.has(r));
    if (!this.book.filtering[this.type]) a.push(...v.known.filter((r) => !v.craftable.has(r)));
    return a;
  }

  // -------------------------------------------------------------------------
  // rendering

  render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    if (!this.visible) return;
    this.time += partial;
    const [x, y] = this.origin();
    g.sprite('recipe_book_background', x, y, W, H);
    this.search.render(g, mx, my);
    // tabs
    const tabs = this.visibleTabs();
    tabs.forEach((t, i) => {
      const tx = x - 30, ty = y + 3 + 27 * i;
      const sel = t.category === this.tab;
      const anim = this.tabAnim.get(t.category) ?? 0;
      if (anim > 0) {
        const f = 1 + 0.1 * Math.sin((anim / 15) * Math.PI);
        g.pushTransform(tx + 8, ty + 12, 0, 1);
        g.ctx.scale(1, f);
        g.ctx.translate(-(tx + 8) * g.scale, -(ty + 12) * g.scale);
        this.tabAnim.set(t.category, anim - partial);
      }
      g.sprite(sel ? 'recipe_book_tab_selected' : 'recipe_book_tab', sel ? tx - 2 : tx, ty, 35, 27);
      const s = sel ? -2 : 0;
      if (t.icons.length === 1) g.item(t.icons[0], tx + 9 + s, ty + 5);
      else {
        g.item(t.icons[0], tx + 3 + s, ty + 5);
        g.item(t.icons[1], tx + 14 + s, ty + 5);
      }
      if (anim > 0) g.popTransform();
    });
    // filter toggle
    const fx = x + 110, fy = y + 12;
    const hoverF = mx >= fx && my >= fy && mx < fx + 26 && my < fy + 16;
    g.sprite(`recipe_book_filter_${this.book.filtering[this.type] ? 'enabled' : 'disabled'}${hoverF ? '_highlighted' : ''}`, fx, fy, 26, 16);
    // page of recipe buttons
    const start = this.page * PER_PAGE;
    this.views.slice(start, start + PER_PAGE).forEach((v, k) => {
      const bx = x + 11 + 25 * (k % 5), by = y + 31 + 25 * Math.floor(k / 5);
      this.renderButton(g, v, bx, by, partial);
    });
    const pages = this.totalPages();
    if (pages > 1) {
      if (this.page > 0) {
        const hover = mx >= x + 38 && my >= y + 137 && mx < x + 50 && my < y + 154;
        g.sprite(hover ? 'recipe_book_page_backward_highlighted' : 'recipe_book_page_backward', x + 38, y + 137, 12, 17);
      }
      if (this.page < pages - 1) {
        const hover = mx >= x + 93 && my >= y + 137 && mx < x + 105 && my < y + 154;
        g.sprite(hover ? 'recipe_book_page_forward_highlighted' : 'recipe_book_page_forward', x + 93, y + 137, 12, 17);
      }
      const s = `${this.page + 1}/${pages}`;
      g.text(s, x - Math.floor(g.textWidth(s) / 2) + 73, y + 141, 0xffffff, false);
    }
    this.renderOverlay(g, mx, my);
  }

  private renderButton(g: GuiGraphics, v: CollectionView, bx: number, by: number, partial: number): void {
    const list = this.ordered(v);
    if (!list.length) return;
    const many = list.length > 1;
    const sprite = `recipe_book_slot_${many ? 'many_' : ''}${v.craftable.size ? 'craftable' : 'uncraftable'}`;
    const anim = this.buttonAnim.get(v.c.key) ?? 0;
    if (anim > 0) {
      const f = 1 + 0.1 * Math.sin((anim / 15) * Math.PI);
      g.pushTransform(bx + 8, by + 12, 0, f);
      g.ctx.translate(-(bx + 8) * g.scale, -(by + 12) * g.scale);
      this.buttonAnim.set(v.c.key, anim - partial);
    }
    g.sprite(sprite, bx, by, 25, 25);
    const r = list[Math.floor(this.time / 30) % list.length];
    let off = 4;
    // several recipes for the same item: a second copy peeks out behind
    if (many && list.every((q) => q.result === list[0].result)) {
      g.item(r.result, bx + off + 1, by + off + 1);
      off--;
    }
    g.item(r.result, bx + off, by + off);
    if (anim > 0) g.popTransform();
  }

  private renderOverlay(g: GuiGraphics, mx: number, my: number): void {
    const o = this.overlay;
    if (!o) return;
    const rows = Math.ceil(o.buttons.length / o.cols);
    g.nineSlice('recipe_book_overlay_recipe', o.x, o.y, Math.min(o.buttons.length, o.cols) * 25 + 8, rows * 25 + 8, 4);
    const furnace = this.type !== 'crafting';
    for (const b of o.buttons) {
      const hover = mx >= b.x && my >= b.y && mx < b.x + 24 && my < b.y + 24;
      const base = furnace ? 'recipe_book_furnace_overlay' : 'recipe_book_crafting_overlay';
      g.sprite(`${base}${b.craftable ? '' : '_disabled'}${hover ? '_highlighted' : ''}`, b.x, b.y, 24, 24);
      // ingredients drawn at 3/8 size in their 6x6 grid cells (vanilla OverlayRecipeButton)
      const cells: [number, number, Set<string>][] = [];
      if (furnace) cells.push([2, 2, b.r.slots[0]!]);
      else for (const [cell, k] of gridCells(b.r, 3, 3)) cells.push([2 + (cell % 3) * 7, 2 + Math.floor(cell / 3) * 7, b.r.slots[k]!]);
      for (const [px, py, alts] of cells) {
        const list = [...alts];
        const id = list[Math.floor(this.time / 30) % list.length];
        g.pushTransform(b.x + px, b.y + py, 0, 0.375);
        g.item(id, 0, 0);
        g.popTransform();
      }
    }
  }

  /** vanilla GhostRecipe.render (called with the container's origin) */
  renderGhost(g: GuiGraphics, leftPos: number, topPos: number): void {
    const gh = this.ghost;
    if (!gh) return;
    gh.entries.forEach(([sx, sy, alts], i) => {
      const x = leftPos + sx, y = topPos + sy;
      if (i === 0) g.fill(x - 4, y - 4, x + 20, y + 20, 0x30ff0000);
      else g.fill(x, y, x + 16, y + 16, 0x30ff0000);
      const id = alts[Math.floor(this.time / 30) % alts.length];
      g.item(id, x, y);
      g.fill(x, y, x + 16, y + 16, 0x30ffffff);
    });
  }

  renderTooltip(g: GuiGraphics, mx: number, my: number): boolean {
    if (!this.visible) return false;
    const [x, y] = this.origin();
    if (this.overlay) return false;
    // recipe buttons
    const start = this.page * PER_PAGE;
    const vs = this.views.slice(start, start + PER_PAGE);
    for (let k = 0; k < vs.length; k++) {
      const bx = x + 11 + 25 * (k % 5), by = y + 31 + 25 * Math.floor(k / 5);
      if (mx < bx || my < by || mx >= bx + 25 || my >= by + 25) continue;
      const list = this.ordered(vs[k]);
      const r = list[Math.floor(this.time / 30) % list.length];
      const lines = itemTooltip(ItemStack.of(r.result));
      if (list.length > 1) lines.push('§fRight Click for More');
      g.tooltip(lines, mx, my);
      return true;
    }
    const fx = x + 110, fy = y + 12;
    if (mx >= fx && my >= fy && mx < fx + 26 && my < fy + 16) {
      const f = this.book.filtering[this.type];
      g.tooltip([f ? FILTER_TEXT[this.type] : 'Showing All'], mx, my, true);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // input

  mouseClicked(mx: number, my: number, button: number): boolean {
    if (!this.visible || this.game.player.gameMode === 'spectator') return false;
    const [x, y] = this.origin();
    if (this.overlay) {
      const o = this.overlay;
      for (const b of o.buttons) {
        if (mx >= b.x && my >= b.y && mx < b.x + 24 && my < b.y + 24 && button === 0) {
          this.place(b.r);
          this.overlay = null;
          return true;
        }
      }
      // any click closes the popup
      this.overlay = null;
      return true;
    }
    // recipe buttons
    const start = this.page * PER_PAGE;
    const vs = this.views.slice(start, start + PER_PAGE);
    for (let k = 0; k < vs.length; k++) {
      const bx = x + 11 + 25 * (k % 5), by = y + 31 + 25 * Math.floor(k / 5);
      if (mx < bx || my < by || mx >= bx + 25 || my >= by + 25) continue;
      const list = this.ordered(vs[k]);
      if (button === 0) {
        playClick();
        this.place(list[Math.floor(this.time / 30) % list.length]);
      } else if (button === 2 && list.length > 1) this.openOverlay(vs[k], bx, by, x + Math.floor(W / 2), y + 13 + Math.floor(H / 2));
      return true;
    }
    // page arrows
    const pages = this.totalPages();
    if (button === 0 && pages > 1) {
      if (this.page > 0 && mx >= x + 38 && my >= y + 137 && mx < x + 50 && my < y + 154) {
        playClick();
        this.page--;
        this.refresh(false);
        return true;
      }
      if (this.page < pages - 1 && mx >= x + 93 && my >= y + 137 && mx < x + 105 && my < y + 154) {
        playClick();
        this.page++;
        this.refresh(false);
        return true;
      }
    }
    // filter
    if (button === 0 && mx >= x + 110 && my >= y + 12 && mx < x + 136 && my < y + 28) {
      playClick();
      this.book.filtering[this.type] = !this.book.filtering[this.type];
      this.refresh(false);
      return true;
    }
    // tabs
    const tabs = this.visibleTabs();
    for (let i = 0; i < tabs.length; i++) {
      const tx = x - 30, ty = y + 3 + 27 * i;
      if (mx >= tx && my >= ty && mx < tx + 35 && my < ty + 27) {
        if (tabs[i].category !== this.tab) {
          playClick();
          this.tab = tabs[i].category;
          this.refresh(true);
        }
        return true;
      }
    }
    // search box
    if (this.search.mouseClicked(mx, my, button)) return true;
    this.search.focused = false;
    return false;
  }

  /** vanilla hasClickedOutside: clicks on the book don't throw items */
  isOverBook(mx: number, my: number): boolean {
    if (!this.visible) return false;
    const [x, y] = this.origin();
    if (mx >= x && my >= y && mx < x + W && my < y + H) return true;
    const tabs = this.visibleTabs();
    return mx >= x - 32 && mx < x && my >= y + 3 && my < y + 3 + 27 * tabs.length;
  }

  keyPressed(e: KeyboardEvent): boolean {
    this.ignoreTextInput = false;
    if (!this.visible) return false;
    if (e.key === 'Escape') {
      if (this.overlay) {
        this.overlay = null;
        return true;
      }
      return false;
    }
    if (this.search.keyPressed(e)) {
      this.searchChanged();
      return true;
    }
    if (this.search.focused) return true;
    // vanilla: the chat key jumps into the search box
    if (e.code === this.game.opts.keys.chat) {
      this.ignoreTextInput = true;
      this.search.focused = true;
      return true;
    }
    return false;
  }

  charTyped(ch: string): boolean {
    if (this.ignoreTextInput || !this.visible) return false;
    if (this.search.charTyped(ch)) {
      this.searchChanged();
      return true;
    }
    return false;
  }

  private searchChanged(): void {
    const v = this.search.value.toLowerCase();
    if (v !== this.lastSearch) {
      this.lastSearch = v;
      this.refresh(true);
    }
  }

  /** a slot of the container was clicked: the ghost recipe goes away */
  slotClicked(slot: Slot | null): void {
    if (slot && this.isGridSlot(slot)) this.ghost = null;
  }

  private isGridSlot(slot: Slot): boolean {
    if (this.menu instanceof CraftingMenuBase) return slot.container === this.menu.craft || slot.container === this.menu.result;
    return slot.container === this.menu.furnace.container;
  }

  // -------------------------------------------------------------------------
  // placing

  private openOverlay(v: CollectionView, bx: number, by: number, x0: number, y0: number): void {
    const list = this.ordered(v);
    const cols = list.length <= 16 ? 4 : 5;
    const rows = Math.ceil(list.length / cols);
    let x = bx, y = by;
    const f = x + Math.min(list.length, cols) * 25, f1 = x0 + 50;
    if (f > f1) x -= 25 * Math.floor((f - f1) / 25);
    const f2 = y + rows * 25, f3 = y0 + 50;
    if (f2 > f3) y -= 25 * Math.ceil((f2 - f3) / 25);
    const f5 = y0 - 100;
    if (y < f5) y -= 25 * Math.ceil((y - f5) / 25);
    this.overlay = {
      x, y, cols,
      buttons: list.map((r, j) => ({ x: x + 4 + 25 * (j % cols), y: y + 5 + 25 * Math.floor(j / cols), r, craftable: v.craftable.has(r) })),
    };
  }

  /** vanilla handlePlaceRecipe → ServerPlaceRecipe (ghost recipe when you lack the items) */
  private place(r: BookRecipe): void {
    const shift = this.game.input.isDown('ShiftLeft') || this.game.input.isDown('ShiftRight');
    this.ghost = null;
    // (a guest's grid is the host's to fill: it does, and says if the recipe's to be shown in outline)
    if (this.game.client) {
      this.game.client.placeRecipe(this.menu, r.id, shift);
      this.invVersion = -1;
      return;
    }
    const res = placeRecipe(recipeTarget(this.game.player, this.menu), r, shift);
    if (!res.placed && res.ghost) this.setupGhost(r);
    this.invVersion = -1;
  }

  /** (a guest) vanilla handlePlaceGhostRecipe: the host says the recipe clicked is to be shown in outline */
  ghostRecipe(id: string): void {
    const r = BOOK_BY_ID.get(id);
    if (r) this.setupGhost(r);
  }

  /** vanilla setupGhostRecipe */
  private setupGhost(r: BookRecipe): void {
    const slots = this.menu.slots;
    const entries: [number, number, string[]][] = [];
    if (this.menu instanceof CraftingMenuBase) {
      const res = slots[0];
      entries.push([res.x, res.y, [r.result]]);
      for (const [cell, k] of gridCells(r, this.gridW, this.gridW)) {
        const s = slots[1 + cell];
        entries.push([s.x, s.y, [...r.slots[k]!]]);
      }
    } else {
      entries.push([slots[2].x, slots[2].y, [r.result]]);
      if (!slots[1].item) entries.push([slots[1].x, slots[1].y, [...ITEMS.keys()].filter((id) => fuelTime(ItemStack.of(id)) > 0)]);
      entries.push([slots[0].x, slots[0].y, [...r.slots[0]!]]);
    }
    this.ghost = { entries };
  }
}
