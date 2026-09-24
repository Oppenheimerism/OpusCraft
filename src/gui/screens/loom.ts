// The loom's screen (vanilla LoomScreen): the patterns on offer as a grid of four by four little banners (each
// pattern in white on grey), scrolled a row at a time; the banner as it will come out shown large beside them, or a
// warning when it can take no more layers.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import type { LoomMenu } from '../../inventory/loomMenu';
import type { BannerLayer, ItemStack } from '../../item/item';
import { flagFront, bannerKey, FLAG_W, FLAG_H } from '../../textures/bannerTextures';
import { bannerColorOf, MAX_LOOM_LAYERS } from '../../world/bannerPatterns';
import '../../textures/jobSiteGui';

const PATTERN_COLUMNS = 4;
const PATTERN_ROWS = 4;
const PATTERN_IMAGE_SIZE = 14;
const SCROLLER_FULL_HEIGHT = 56;
const PATTERNS_X = 60;
const PATTERNS_Y = 13;

/** each design's flag front, drawn once (the screens come and go, the pictures stay) */
const flags = new Map<string, HTMLCanvasElement>();

function flagCanvas(base: string, layers: readonly BannerLayer[]): HTMLCanvasElement {
  const key = bannerKey(base, layers);
  let c = flags.get(key);
  if (!c) {
    const t = flagFront(base, layers);
    c = document.createElement('canvas');
    c.width = t.w;
    c.height = t.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
    flags.set(key, c);
  }
  return c;
}

/** a flag's front drawn w×h GUI pixels at (x, y) (vanilla draws the flag model face on, lit flat) */
function drawFlag(g: GuiGraphics, c: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const s = g.scale;
  g.ctx.imageSmoothingEnabled = false;
  g.ctx.drawImage(c, 0, 0, FLAG_W, FLAG_H, Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s));
}

/** vanilla ItemStack.matches */
function matches(a: ItemStack | null, b: ItemStack | null): boolean {
  if (!a || !b) return !a && !b;
  return a.count === b.count && a.sameItem(b);
}

export class LoomScreen extends AbstractContainerScreen<LoomMenu> {
  /** the result's layers and base colour (null: nothing to show) */
  private resultBanner: { base: string; layers: BannerLayer[] } | null = null;
  private bannerStack: ItemStack | null = null;
  private dyeStack: ItemStack | null = null;
  private patternStack: ItemStack | null = null;
  private displayPatterns = false;
  private hasMaxPatterns = false;
  private scrollOffs = 0;
  private scrolling = false;
  private startRow = 0;

  constructor(game: Game, menu: LoomMenu) {
    super(game, menu, 'Loom');
    menu.slotUpdateListener = () => this.containerChanged();
    this.titleLabelY -= 2;
  }

  private totalRowCount(): number {
    return Math.ceil(this.menu.selectablePatterns.length / PATTERN_COLUMNS);
  }

  renderBg(g: GuiGraphics, mx: number, my: number): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_loom', i, j, 176, 166);
    const k = Math.trunc(41 * this.scrollOffs);
    g.sprite(this.displayPatterns ? 'loom_scroller' : 'loom_scroller_disabled', i + 119, j + 13 + k, 12, 15);
    const result = this.menu.resultSlot;
    if (this.resultBanner && !this.hasMaxPatterns) {
      drawFlag(g, flagCanvas(this.resultBanner.base, this.resultBanner.layers), i + 141, j + 8, 20, 40);
    } else if (this.hasMaxPatterns) {
      g.sprite('loom_error', i + result.x - 5, j + result.y - 5, 26, 26);
    }
    if (!this.displayPatterns) return;
    const x0 = i + PATTERNS_X, y0 = j + PATTERNS_Y;
    const list = this.menu.selectablePatterns;
    for (let row = 0; row < PATTERN_ROWS; row++)
      for (let col = 0; col < PATTERN_COLUMNS; col++) {
        const idx = (row + this.startRow) * PATTERN_COLUMNS + col;
        if (idx >= list.length) return;
        const x = x0 + col * PATTERN_IMAGE_SIZE, y = y0 + row * PATTERN_IMAGE_SIZE;
        const hover = mx >= x && my >= y && mx < x + PATTERN_IMAGE_SIZE && my < y + PATTERN_IMAGE_SIZE;
        const sprite = idx === this.menu.selectedBannerPatternIndex ? 'loom_pattern_selected' : hover ? 'loom_pattern_highlighted' : 'loom_pattern';
        g.sprite(sprite, x, y, PATTERN_IMAGE_SIZE, PATTERN_IMAGE_SIZE);
        // vanilla renderPattern: the flag at a quarter size, the pattern white on grey
        drawFlag(g, flagCanvas('gray', [{ pattern: list[idx], color: 'white' }]), x + 4, y + 2, 5, 10);
      }
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    this.scrolling = false;
    if (this.displayPatterns) {
      const i = this.leftPos + PATTERNS_X, j = this.topPos + PATTERNS_Y;
      for (let k = 0; k < PATTERN_ROWS; k++)
        for (let l = 0; l < PATTERN_COLUMNS; l++) {
          const d0 = mx - (i + l * PATTERN_IMAGE_SIZE), d1 = my - (j + k * PATTERN_IMAGE_SIZE);
          const idx = (k + this.startRow) * PATTERN_COLUMNS + l;
          if (d0 >= 0 && d1 >= 0 && d0 < PATTERN_IMAGE_SIZE && d1 < PATTERN_IMAGE_SIZE && this.menu.clickMenuButton(idx)) {
            // (SimpleSoundInstance.forUI: a quarter volume)
            this.game.sound.playUI('ui.loom.select_pattern', 0.25, 1);
            return true;
          }
        }
      const sx = this.leftPos + 119, sy = this.topPos + 9;
      if (mx >= sx && mx < sx + 12 && my >= sy && my < sy + SCROLLER_FULL_HEIGHT) this.scrolling = true;
    }
    return super.mouseClicked(mx, my, button);
  }

  override mouseDragged(mx: number, my: number): boolean {
    const off = this.totalRowCount() - PATTERN_ROWS;
    if (this.scrolling && this.displayPatterns && off > 0) {
      const top = this.topPos + PATTERNS_Y, bottom = top + SCROLLER_FULL_HEIGHT;
      this.scrollOffs = Math.max(0, Math.min(1, (my - top - 7.5) / (bottom - top - 15)));
      this.startRow = Math.max(Math.trunc(this.scrollOffs * off + 0.5), 0);
      return true;
    }
    return super.mouseDragged(mx, my);
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    this.scrolling = false;
    return super.mouseReleased(mx, my, button);
  }

  override mouseScrolled(_mx: number, _my: number, d: number): boolean {
    const off = this.totalRowCount() - PATTERN_ROWS;
    if (this.displayPatterns && off > 0) {
      this.scrollOffs = Math.max(0, Math.min(1, this.scrollOffs - d / off));
      this.startRow = Math.max(Math.trunc(this.scrollOffs * off + 0.5), 0);
    }
    return true;
  }

  /**
   * vanilla containerChanged: the result's picture; the grid shows while there's a banner that can take more and a
   * dye (and something on offer); the view goes back up when the list shrinks past it
   */
  private containerChanged(): void {
    const result = this.menu.resultSlot.item;
    const base = result ? bannerColorOf(result.item.id) : null;
    this.resultBanner = result && base ? { base, layers: result.tag?.patterns ?? [] } : null;
    const banner = this.menu.bannerSlot.item, dye = this.menu.dyeSlot.item, pattern = this.menu.patternSlot.item;
    this.hasMaxPatterns = (banner?.tag?.patterns?.length ?? 0) >= MAX_LOOM_LAYERS;
    if (this.hasMaxPatterns) this.resultBanner = null;
    if (!matches(banner, this.bannerStack) || !matches(dye, this.dyeStack) || !matches(pattern, this.patternStack)) {
      this.displayPatterns = !!banner && !!dye && !this.hasMaxPatterns && this.menu.selectablePatterns.length > 0;
    }
    if (this.startRow >= this.totalRowCount()) {
      this.startRow = 0;
      this.scrollOffs = 0;
    }
    this.bannerStack = banner?.copy() ?? null;
    this.dyeStack = dye?.copy() ?? null;
    this.patternStack = pattern?.copy() ?? null;
  }
}
