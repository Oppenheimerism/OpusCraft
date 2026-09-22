// Screens and widgets (vanilla-style buttons, sliders, cycle buttons, edit boxes).

import type { GuiGraphics } from './guiGraphics';
import type { Game } from '../game/game';

export abstract class Widget {
  visible = true;
  active = true;
  focused = false;
  tooltip: string | undefined = undefined;
  constructor(public x: number, public y: number, public w: number, public h: number) {}
  isMouseOver(mx: number, my: number): boolean {
    return this.visible && mx >= this.x && my >= this.y && mx < this.x + this.w && my < this.y + this.h;
  }
  abstract render(g: GuiGraphics, mx: number, my: number): void;
  mouseClicked(_mx: number, _my: number, _b: number): boolean {
    return false;
  }
  mouseReleased(_mx: number, _my: number, _b: number): boolean {
    return false;
  }
  mouseDragged(_mx: number, _my: number): boolean {
    return false;
  }
  keyPressed(_e: KeyboardEvent): boolean {
    return false;
  }
  charTyped(_ch: string): boolean {
    return false;
  }
}

export let playClick: () => void = () => {};
export function setClickSound(f: () => void): void {
  playClick = f;
}

export class Button extends Widget {
  constructor(x: number, y: number, w: number, h: number, public label: string, public onPress: (b: Button) => void, tooltip?: string) {
    super(x, y, w, h);
    this.tooltip = tooltip;
  }
  render(g: GuiGraphics, mx: number, my: number): void {
    if (!this.visible) return;
    const hover = this.isMouseOver(mx, my) || this.focused;
    const sprite = !this.active ? 'button_disabled' : hover ? 'button_highlighted' : 'button';
    if (!g.nineSlice(sprite, this.x, this.y, this.w, this.h, 3)) {
      g.fill(this.x, this.y, this.x + this.w, this.y + this.h, this.active ? (hover ? 0xff8b8b8b : 0xff6f6f6f) : 0xff2c2c2c);
    }
    const color = this.active ? 0xffffff : 0xa0a0a0;
    g.scrollingText(this.label, this.x + this.w / 2, this.x + 2, this.y, this.x + this.w - 2, this.y + this.h, color);
  }
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (b !== 0 || !this.active || !this.isMouseOver(mx, my)) return false;
    playClick();
    this.onPress(this);
    return true;
  }
}

/** 20x20 button showing a sprite icon (title screen language/accessibility) */
export class IconButton extends Button {
  constructor(x: number, y: number, public icon: string, onPress: (b: Button) => void, tooltip?: string) {
    super(x, y, 20, 20, '', onPress, tooltip);
  }
  override render(g: GuiGraphics, mx: number, my: number): void {
    if (!this.visible) return;
    const hover = this.isMouseOver(mx, my) || this.focused;
    const sprite = !this.active ? 'button_disabled' : hover ? 'button_highlighted' : 'button';
    if (!g.nineSlice(sprite, this.x, this.y, this.w, this.h, 3)) g.fill(this.x, this.y, this.x + this.w, this.y + this.h, 0xff6f6f6f);
    g.sprite(this.icon, this.x + 2, this.y + 2, 15, 15, 0, 0, 15, 15, this.active ? 1 : 0.5);
  }
}

export class CycleButton<T> extends Button {
  index: number;
  constructor(x: number, y: number, w: number, h: number, public prefix: string, public values: T[], initial: T, public format: (v: T) => string, public onChange: (v: T) => void) {
    super(x, y, w, h, '', () => {}, undefined);
    this.index = Math.max(0, values.indexOf(initial));
    this.updateLabel();
    this.onPress = () => {
      this.index = (this.index + 1) % this.values.length;
      this.updateLabel();
      this.onChange(this.values[this.index]);
    };
  }
  updateLabel(): void {
    this.label = this.prefix ? `${this.prefix}: ${this.format(this.values[this.index])}` : this.format(this.values[this.index]);
  }
  get value(): T {
    return this.values[this.index];
  }
}

export class Slider extends Widget {
  dragging = false;
  constructor(x: number, y: number, w: number, h: number, public value: number, public label: (v: number) => string, public onChange: (v: number) => void, public onRelease?: (v: number) => void) {
    super(x, y, w, h);
  }
  render(g: GuiGraphics, mx: number, my: number): void {
    const hover = this.isMouseOver(mx, my) || this.dragging;
    if (!g.nineSlice(hover ? 'slider_highlighted' : 'slider', this.x, this.y, this.w, this.h, 3)) g.fill(this.x, this.y, this.x + this.w, this.y + this.h, 0xff000000);
    const hx = this.x + Math.round(this.value * (this.w - 8));
    if (!g.nineSlice(hover ? 'slider_handle_highlighted' : 'slider_handle', hx, this.y, 8, this.h, 3)) g.fill(hx, this.y, hx + 8, this.y + this.h, 0xffc6c6c6);
    g.scrollingText(this.label(this.value), this.x + this.w / 2, this.x + 2, this.y, this.x + this.w - 2, this.y + this.h, this.active ? 0xffffff : 0xa0a0a0);
  }
  private setFromMouse(mx: number): void {
    const v = Math.max(0, Math.min(1, (mx - (this.x + 4)) / (this.w - 8)));
    if (v !== this.value) {
      this.value = v;
      this.onChange(v);
    }
  }
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (b !== 0 || !this.isMouseOver(mx, my)) return false;
    this.dragging = true;
    this.setFromMouse(mx);
    return true;
  }
  override mouseDragged(mx: number): boolean {
    if (!this.dragging) return false;
    this.setFromMouse(mx);
    return true;
  }
  override mouseReleased(): boolean {
    if (!this.dragging) return false;
    this.dragging = false;
    playClick();
    this.onRelease?.(this.value);
    return true;
  }
}

export class EditBox extends Widget {
  value = '';
  cursor = 0;
  maxLength = 32;
  private blink = 0;
  hint = '';
  onChange: ((v: string) => void) | null = null;
  bordered = true;
  constructor(x: number, y: number, w: number, h: number, initial = '') {
    super(x, y, w, h);
    this.value = initial;
    this.cursor = initial.length;
  }
  render(g: GuiGraphics, mx: number, my: number): void {
    this.blink++;
    if (this.bordered) {
      const hover = this.focused || this.isMouseOver(mx, my);
      if (!g.nineSlice(hover && this.focused ? 'text_field_highlighted' : 'text_field', this.x, this.y, this.w, this.h, 1)) {
        g.fill(this.x - 1, this.y - 1, this.x + this.w + 1, this.y + this.h + 1, this.focused ? 0xffffffff : 0xffa0a0a0);
        g.fill(this.x, this.y, this.x + this.w, this.y + this.h, 0xff000000);
      }
    }
    const tx = this.bordered ? this.x + 4 : this.x;
    const ty = this.bordered ? this.y + Math.floor((this.h - 8) / 2) : this.y;
    if (!this.value && this.hint && !this.focused) g.text(this.hint, tx, ty, 0x808080, true);
    g.text(this.value, tx, ty, 0xe0e0e0, true);
    if (this.focused && Math.floor(this.blink / 6) % 2 === 0) {
      const cx = tx + g.textWidth(this.value.slice(0, this.cursor));
      if (this.cursor >= this.value.length) g.text('_', cx, ty, 0xd0d0d0, true);
      else g.fill(cx, ty - 1, cx + 1, ty + 9, 0xffd0d0d0);
    }
  }
  override mouseClicked(mx: number, my: number, b: number): boolean {
    this.focused = this.isMouseOver(mx, my);
    return this.focused && b === 0;
  }
  override keyPressed(e: KeyboardEvent): boolean {
    if (!this.focused) return false;
    if (e.key === 'Backspace') {
      if (this.cursor > 0) {
        this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
        this.cursor--;
        this.onChange?.(this.value);
      }
      return true;
    }
    if (e.key === 'Delete') {
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
      this.onChange?.(this.value);
      return true;
    }
    if (e.key === 'ArrowLeft') {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (e.key === 'ArrowRight') {
      this.cursor = Math.min(this.value.length, this.cursor + 1);
      return true;
    }
    if (e.key === 'Home') {
      this.cursor = 0;
      return true;
    }
    if (e.key === 'End') {
      this.cursor = this.value.length;
      return true;
    }
    return false;
  }
  override charTyped(ch: string): boolean {
    if (!this.focused) return false;
    if (ch.length !== 1 || ch < ' ' || ch === '§') return false;
    if (this.value.length >= this.maxLength) return true;
    this.value = this.value.slice(0, this.cursor) + ch + this.value.slice(this.cursor);
    this.cursor++;
    this.onChange?.(this.value);
    return true;
  }
}

export class Label extends Widget {
  constructor(x: number, y: number, public text: string, public color = 0xffffff, public center = true) {
    super(x, y, 0, 9);
  }
  render(g: GuiGraphics): void {
    if (this.center) g.centered(this.text, this.x, this.y, this.color, true);
    else g.text(this.text, this.x, this.y, this.color, true);
  }
}

export abstract class Screen {
  width = 0;
  height = 0;
  widgets: Widget[] = [];
  parent: Screen | null = null;

  constructor(public game: Game, public title: string) {}

  /** (Re)build widgets for the given GUI size */
  initScreen(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.widgets = [];
    this.init();
  }

  abstract init(): void;

  add<T extends Widget>(w: T): T {
    this.widgets.push(w);
    return w;
  }

  isPauseScreen(): boolean {
    return true;
  }

  shouldCloseOnEsc(): boolean {
    return true;
  }

  tick(): void {}

  renderBackground(g: GuiGraphics): void {
    this.game.renderMenuBackground(g, this);
  }

  render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    if (this.title) g.centered(this.title, this.width / 2, this.titleY(), 0xffffff, true);
    this.renderTooltip(g, mx, my);
    void partial;
  }

  /** tooltip of the hovered widget (vanilla: wrapped at 170px, shown above/below cursor) */
  renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    const w = this.hoveredWidget(mx, my);
    if (!w || !w.tooltip) return;
    g.tooltip(g.wrap(w.tooltip, 170), mx, my, true);
  }

  hoveredWidget(mx: number, my: number): Widget | null {
    for (let i = this.widgets.length - 1; i >= 0; i--) {
      const w = this.widgets[i];
      const sub = (w as unknown as { widgetAt?: (x: number, y: number) => Widget | null }).widgetAt;
      if (sub) {
        const r = sub.call(w, mx, my);
        if (r) return r;
        continue;
      }
      if (w.visible && w.isMouseOver(mx, my)) return w;
    }
    return null;
  }

  titleY(): number {
    return 15;
  }

  mouseClicked(mx: number, my: number, button: number): boolean {
    for (const w of this.widgets) if (w instanceof EditBox) w.focused = false;
    for (const w of this.widgets) if (w.visible && w.mouseClicked(mx, my, button)) return true;
    return false;
  }
  mouseReleased(mx: number, my: number, button: number): boolean {
    for (const w of this.widgets) if (w.mouseReleased(mx, my, button)) return true;
    return false;
  }
  mouseDragged(mx: number, my: number): boolean {
    for (const w of this.widgets) if (w.mouseDragged(mx, my)) return true;
    return false;
  }
  mouseScrolled(mx: number, my: number, d: number): boolean {
    for (const w of this.widgets) {
      const ms = (w as unknown as { mouseScrolled?: (d: number) => void }).mouseScrolled;
      if (ms && w.isMouseOver(mx, my)) {
        ms.call(w, d);
        return true;
      }
    }
    return false;
  }
  keyPressed(e: KeyboardEvent): boolean {
    for (const w of this.widgets) if (w.keyPressed(e)) return true;
    if (e.key === 'Escape' && this.shouldCloseOnEsc()) {
      this.onClose();
      return true;
    }
    return false;
  }
  charTyped(ch: string): boolean {
    for (const w of this.widgets) if (w.charTyped(ch)) return true;
    return false;
  }

  onClose(): void {
    this.game.setScreen(this.parent);
  }

  removed(): void {}
}
