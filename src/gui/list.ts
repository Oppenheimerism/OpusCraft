// Scrollable selection lists (vanilla AbstractSelectionList) and the options
// list used by option sub-screens (OptionsList: rows of one or two widgets).

import type { GuiGraphics } from './guiGraphics';
import { Widget } from './screen';

export abstract class ScrollList<E> extends Widget {
  entries: E[] = [];
  scroll = 0;
  selected: E | null = null;
  focusedList = false;
  private draggingBar = false;
  private lastClickTime = 0;
  private lastClickIndex = -1;
  /** use the in-world list background variant */
  inWorld = false;

  constructor(x: number, y: number, w: number, h: number, public itemHeight: number, public rowWidth: number) {
    super(x, y, w, h);
  }

  get bottom(): number {
    return this.y + this.h;
  }

  rowLeft(): number {
    return this.x + Math.floor(this.w / 2) - Math.floor(this.rowWidth / 2) + 2;
  }

  rowRight(): number {
    return this.rowLeft() + this.rowWidth;
  }

  rowTop(i: number): number {
    return this.y + 4 - Math.floor(this.scroll) + i * this.itemHeight;
  }

  maxScroll(): number {
    return Math.max(0, this.entries.length * this.itemHeight - (this.h - 4));
  }

  clampScroll(): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), this.scroll));
  }

  scrollbarX(): number {
    return this.rowRight() + 6 + 2;
  }

  entryAt(mx: number, my: number): number {
    const left = this.rowLeft() - 2, right = this.rowRight() - 2;
    if (mx < left || mx >= right + 4 || my < this.y || my >= this.bottom) return -1;
    const rel = my - this.y - 4 + Math.floor(this.scroll);
    const i = Math.floor(rel / this.itemHeight);
    return rel >= 0 && i < this.entries.length ? i : -1;
  }

  ensureVisible(i: number): void {
    const top = this.rowTop(i);
    if (top - 4 < this.y) this.scroll -= this.y - top + 4;
    const bot = top + this.itemHeight;
    if (bot > this.bottom) this.scroll += bot - this.bottom + 4;
    this.clampScroll();
  }

  abstract renderEntry(g: GuiGraphics, e: E, i: number, left: number, top: number, width: number, height: number, mx: number, my: number, hovered: boolean): void;

  onEntryClicked(_e: E, _i: number, _mx: number, _my: number, _button: number, _double: boolean): boolean {
    return true;
  }

  /** selection outline like vanilla renderSelection */
  selectable = true;

  render(g: GuiGraphics, mx: number, my: number): void {
    this.clampScroll();
    // list background + separators
    g.tile(this.inWorld ? 'inworld_menu_list_background' : 'menu_list_background', 0, this.y, this.x + this.w, this.h, 1, 2);
    g.tile(this.inWorld ? 'inworld_header_separator' : 'header_separator', 0, this.y - 2, this.x + this.w, 2);
    g.tile(this.inWorld ? 'inworld_footer_separator' : 'footer_separator', 0, this.bottom, this.x + this.w, 2);
    g.pushClip(this.x, this.y, this.x + this.w, this.bottom);
    const left = this.rowLeft();
    const hoverIdx = this.entryAt(mx, my);
    for (let i = 0; i < this.entries.length; i++) {
      const top = this.rowTop(i);
      const bot = top + this.itemHeight;
      if (bot < this.y || top > this.bottom) continue;
      const e = this.entries[i];
      if (this.selectable && this.selected === e) {
        const x0 = this.x + Math.floor((this.w - this.rowWidth) / 2), x1 = this.x + Math.floor((this.w + this.rowWidth) / 2);
        const h = this.itemHeight - 4;
        g.fill(x0, top - 2, x1, top + h + 2, this.focusedList ? 0xffffffff : 0xff808080);
        g.fill(x0 + 1, top - 1, x1 - 1, top + h + 1, 0xff000000);
      }
      this.renderEntry(g, e, i, left, top, this.rowWidth - 4, this.itemHeight - 4, mx, my, hoverIdx === i);
    }
    g.popClip();
    // scrollbar
    const max = this.maxScroll();
    if (max > 0) {
      const sx = this.scrollbarX();
      const total = this.entries.length * this.itemHeight + 4;
      let bh = Math.floor((this.h * this.h) / total);
      bh = Math.max(32, Math.min(this.h - 8, bh));
      let by = Math.floor((Math.floor(this.scroll) * (this.h - bh)) / max) + this.y;
      if (by < this.y) by = this.y;
      if (!g.nineSlice('list_scroller_background', sx, this.y, 6, this.h, 1)) g.fill(sx, this.y, sx + 6, this.bottom, 0xa0000000);
      if (!g.nineSlice('list_scroller', sx, by, 6, bh, 1)) g.fill(sx, by, sx + 6, by + bh, 0xffc0c0c0);
    }
  }

  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (mx < this.x || mx >= this.x + this.w || my < this.y || my >= this.bottom) {
      this.focusedList = false;
      return false;
    }
    const sx = this.scrollbarX();
    if (this.maxScroll() > 0 && mx >= sx && mx < sx + 6 && b === 0) {
      this.draggingBar = true;
      this.dragTo(my);
      return true;
    }
    const i = this.entryAt(mx, my);
    if (i < 0) return false;
    const now = performance.now();
    const dbl = i === this.lastClickIndex && now - this.lastClickTime < 250;
    this.lastClickTime = now;
    this.lastClickIndex = i;
    this.focusedList = true;
    if (this.selectable) this.selected = this.entries[i];
    return this.onEntryClicked(this.entries[i], i, mx, my, b, dbl);
  }

  private dragTo(my: number): void {
    const max = this.maxScroll();
    const total = this.entries.length * this.itemHeight + 4;
    const bh = Math.max(32, Math.min(this.h - 8, Math.floor((this.h * this.h) / total)));
    const f = (my - this.y - bh / 2) / Math.max(1, this.h - bh);
    this.scroll = f * max;
    this.clampScroll();
  }

  override mouseDragged(mx: number, my: number): boolean {
    void mx;
    if (!this.draggingBar) return false;
    this.dragTo(my);
    return true;
  }

  override mouseReleased(): boolean {
    const was = this.draggingBar;
    this.draggingBar = false;
    return was;
  }

  mouseScrolled(delta: number): void {
    this.scroll -= (delta * this.itemHeight) / 2;
    this.clampScroll();
  }
}

/** Options list: rows of one (310 wide) or two (150 wide) widgets. */
export class OptionsList extends ScrollList<Widget[]> {
  constructor(width: number, top: number, height: number) {
    super(0, top, width, height, 25, 310);
    this.selectable = false;
  }

  addBig(w: Widget): void {
    w.w = 310;
    this.entries.push([w]);
  }

  addSmall(...ws: Widget[]): void {
    for (let i = 0; i < ws.length; i += 2) {
      const row = ws.slice(i, i + 2);
      for (const w of row) w.w = 150;
      this.entries.push(row);
    }
  }

  override rowLeft(): number {
    return Math.floor(this.w / 2) - 155;
  }

  override rowRight(): number {
    return Math.floor(this.w / 2) + 155;
  }

  override scrollbarX(): number {
    return Math.floor(this.w / 2) + 155 + 10;
  }

  renderEntry(g: GuiGraphics, row: Widget[], _i: number, _left: number, top: number, _w: number, _h: number, mx: number, my: number): void {
    const cx = Math.floor(this.w / 2);
    row.forEach((w, k) => {
      w.x = row.length === 1 ? cx - 155 : k === 0 ? cx - 155 : cx + 5;
      w.y = top;
      w.render(g, mx, my);
    });
  }

  private layoutAll(): void {
    this.entries.forEach((row, i) => {
      const top = this.rowTop(i);
      const cx = Math.floor(this.w / 2);
      row.forEach((w, k) => {
        w.x = row.length === 1 ? cx - 155 : k === 0 ? cx - 155 : cx + 5;
        w.y = top;
      });
    });
  }

  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (my < this.y || my >= this.bottom) return false;
    this.layoutAll();
    const sx = this.scrollbarX();
    if (this.maxScroll() > 0 && mx >= sx && mx < sx + 6) return super.mouseClicked(mx, my, b);
    for (const row of this.entries) for (const w of row) if (w.visible && w.mouseClicked(mx, my, b)) return true;
    return false;
  }

  override mouseDragged(mx: number, my: number): boolean {
    if (super.mouseDragged(mx, my)) return true;
    for (const row of this.entries) for (const w of row) if (w.mouseDragged(mx, my)) return true;
    return false;
  }

  override mouseReleased(mx?: number, my?: number, b?: number): boolean {
    if (super.mouseReleased()) return true;
    for (const row of this.entries) for (const w of row) if (w.mouseReleased(mx ?? 0, my ?? 0, b ?? 0)) return true;
    return false;
  }

  /** widget under the mouse (for tooltips) */
  widgetAt(mx: number, my: number): Widget | null {
    if (my < this.y || my >= this.bottom) return null;
    this.layoutAll();
    for (const row of this.entries) for (const w of row) if (w.isMouseOver(mx, my)) return w;
    return null;
  }
}
