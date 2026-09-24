// The stonecutter's screen (vanilla StonecutterScreen): the recipes as a grid of four columns and three rows beside
// the input, scrolled a row at a time by the bar at its side or the wheel.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen, itemTooltip } from './container';
import type { StonecutterMenu } from '../../inventory/stonecutterMenu';
import { ItemStack } from '../../item/item';
import '../../textures/jobSiteGui';

const COLUMNS = 4;
const ROWS = 3;
const RECIPES_X = 52;
const RECIPES_Y = 14;

export class StonecutterScreen extends AbstractContainerScreen<StonecutterMenu> {
  private scrollOffs = 0;
  private scrolling = false;
  private startIndex = 0;
  private displayRecipes = false;

  constructor(game: Game, menu: StonecutterMenu) {
    super(game, menu, 'Stonecutter');
    menu.slotUpdateListener = () => this.containerChanged();
    this.titleLabelY--;
  }

  renderBg(g: GuiGraphics, mx: number, my: number): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_stonecutter', i, j, 176, 166);
    const k = Math.trunc(41 * this.scrollOffs);
    g.sprite(this.isScrollBarActive() ? 'stonecutter_scroller' : 'stonecutter_scroller_disabled', i + 119, j + 15 + k, 12, 15);
    const l = i + RECIPES_X, t = j + RECIPES_Y;
    const last = this.startIndex + COLUMNS * ROWS;
    this.renderButtons(g, mx, my, l, t, last);
    this.renderRecipes(g, l, t, last);
  }

  /** vanilla renderButtons: the selected recipe pressed in, the one under the mouse lit */
  private renderButtons(g: GuiGraphics, mx: number, my: number, x: number, y: number, last: number): void {
    for (let i = this.startIndex; i < last && i < this.menu.numRecipes(); i++) {
      const j = i - this.startIndex;
      const k = x + (j % COLUMNS) * 16;
      const i1 = y + Math.floor(j / COLUMNS) * 18 + 2;
      let sprite = 'stonecutter_recipe';
      if (i === this.menu.selectedRecipeIndex) sprite = 'stonecutter_recipe_selected';
      else if (mx >= k && my >= i1 && mx < k + 16 && my < i1 + 18) sprite = 'stonecutter_recipe_highlighted';
      g.sprite(sprite, k, i1 - 1, 16, 18);
    }
  }

  private renderRecipes(g: GuiGraphics, x: number, y: number, last: number): void {
    const list = this.menu.recipes;
    for (let i = this.startIndex; i < last && i < list.length; i++) {
      const j = i - this.startIndex;
      const r = list[i];
      // (vanilla renderItem: the icon alone, no count)
      g.stack(ItemStack.of(r.result, r.count), x + (j % COLUMNS) * 16, y + Math.floor(j / COLUMNS) * 18 + 2);
    }
  }

  /** vanilla renderTooltip: over a recipe, its result */
  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    super.renderTooltip(g, mx, my);
    if (!this.displayRecipes) return;
    const i = this.leftPos + RECIPES_X, j = this.topPos + RECIPES_Y;
    const last = this.startIndex + COLUMNS * ROWS;
    const list = this.menu.recipes;
    for (let l = this.startIndex; l < last && l < list.length; l++) {
      const i1 = l - this.startIndex;
      const j1 = i + (i1 % COLUMNS) * 16, k1 = j + Math.floor(i1 / COLUMNS) * 18 + 2;
      if (mx >= j1 && mx < j1 + 16 && my >= k1 && my < k1 + 18) g.tooltip(itemTooltip(ItemStack.of(list[l].result, list[l].count)), mx, my);
    }
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    this.scrolling = false;
    if (this.displayRecipes) {
      const i = this.leftPos + RECIPES_X, j = this.topPos + RECIPES_Y;
      const last = this.startIndex + COLUMNS * ROWS;
      for (let l = this.startIndex; l < last; l++) {
        const i1 = l - this.startIndex;
        const d0 = mx - (i + (i1 % COLUMNS) * 16), d1 = my - (j + Math.floor(i1 / COLUMNS) * 18);
        if (d0 >= 0 && d1 >= 0 && d0 < 16 && d1 < 18 && this.menu.clickMenuButton(l)) {
          // (SimpleSoundInstance.forUI: a quarter volume)
          this.game.sound.playUI('ui.stonecutter.select_recipe', 0.25, 1);
          return true;
        }
      }
      const sx = this.leftPos + 119, sy = this.topPos + 9;
      if (mx >= sx && mx < sx + 12 && my >= sy && my < sy + 54) this.scrolling = true;
    }
    return super.mouseClicked(mx, my, button);
  }

  override mouseDragged(mx: number, my: number): boolean {
    if (this.scrolling && this.isScrollBarActive()) {
      const i = this.topPos + RECIPES_Y, j = i + 54;
      this.scrollOffs = Math.max(0, Math.min(1, (my - i - 7.5) / (j - i - 15)));
      this.startIndex = Math.trunc(this.scrollOffs * this.offscreenRows() + 0.5) * COLUMNS;
      return true;
    }
    return super.mouseDragged(mx, my);
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    this.scrolling = false;
    return super.mouseReleased(mx, my, button);
  }

  override mouseScrolled(_mx: number, _my: number, d: number): boolean {
    if (this.isScrollBarActive()) {
      const i = this.offscreenRows();
      this.scrollOffs = Math.max(0, Math.min(1, this.scrollOffs - d / i));
      this.startIndex = Math.trunc(this.scrollOffs * i + 0.5) * COLUMNS;
    }
    return true;
  }

  private isScrollBarActive(): boolean {
    return this.displayRecipes && this.menu.numRecipes() > COLUMNS * ROWS;
  }

  private offscreenRows(): number {
    return Math.floor((this.menu.numRecipes() + COLUMNS - 1) / COLUMNS) - ROWS;
  }

  /** vanilla containerChanged: the list shows while the input cuts into something; a new input scrolls back up */
  private containerChanged(): void {
    this.displayRecipes = this.menu.hasInputItem();
    if (!this.displayRecipes) {
      this.scrollOffs = 0;
      this.startIndex = 0;
    }
  }
}
