// The advancements screen (vanilla AdvancementsScreen, AdvancementTab and
// AdvancementWidget): a window with a tab per advancement tree, each a
// draggable canvas of frames joined by lines, with hover details.

import type { Game } from '../../game/game';
import { Screen } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { KEYS } from '../../game/input';
import { ADVANCEMENTS, TABS, POSITIONS, AdvancementDef, rootOf } from '../../game/advancements';

const WIN_W = 252, WIN_H = 140;
const IN_W = 234, IN_H = 113;

interface Widget {
  a: AdvancementDef;
  x: number;
  y: number;
  parent: Widget | null;
  children: Widget[];
}

interface TabState {
  root: string;
  background: string;
  widgets: Map<string, Widget>;
  rootWidget: Widget;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scrollX: number;
  scrollY: number;
  centered: boolean;
}

/** vanilla AdvancementWidget.findOptimalLines */
function optimalLines(g: GuiGraphics, text: string, maxW: number): string[] {
  let best: string[] | null = null;
  let bestD = Infinity;
  for (const off of [0, 10, -10, 25, -25]) {
    const lines = text.split('\n').flatMap((p) => g.wrap(p, maxW - off));
    const w = Math.max(...lines.map((l) => g.textWidth(l)));
    const d = Math.abs(w - maxW);
    if (d <= 10) return lines;
    if (d < bestD) {
      bestD = d;
      best = lines;
    }
  }
  return best ?? [text];
}

export class AdvancementsScreen extends Screen {
  private tabs: TabState[] = [];
  private selected: TabState | null = null;
  private fade = 0;
  private dragging = false;
  private lastMx = 0;
  private lastMy = 0;
  private version = -1;

  constructor(game: Game) {
    super(game, '');
  }

  init(): void {
    this.rebuild();
  }

  override isPauseScreen(): boolean {
    return false;
  }

  /** the tabs and widgets of every visible advancement (vanilla ClientAdvancements listener) */
  private rebuild(): void {
    const adv = this.game.advancements;
    this.version = adv.version;
    const visible = adv.visible();
    const prev = new Map(this.tabs.map((t) => [t.root, t]));
    this.tabs = [];
    for (const t of TABS) {
      if (!visible.has(t.root)) continue;
      const widgets = new Map<string, Widget>();
      for (const id of visible) {
        const a = ADVANCEMENTS.get(id)!;
        if (rootOf(a).id !== t.root) continue;
        const pos = POSITIONS.get(id)!;
        widgets.set(id, { a, x: Math.floor(pos.x * 28), y: Math.floor(pos.y * 27), parent: null, children: [] });
      }
      for (const w of widgets.values()) {
        // vanilla: link to the nearest visible ancestor
        let p = w.a.parent;
        while (p && !widgets.has(p)) p = ADVANCEMENTS.get(p)?.parent ?? null;
        if (p) {
          w.parent = widgets.get(p)!;
          w.parent.children.push(w);
        }
      }
      const old = prev.get(t.root);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const w of widgets.values()) {
        minX = Math.min(minX, w.x);
        maxX = Math.max(maxX, w.x + 28);
        minY = Math.min(minY, w.y);
        maxY = Math.max(maxY, w.y + 27);
      }
      this.tabs.push({
        root: t.root, background: t.background, widgets, rootWidget: widgets.get(t.root)!, minX, maxX, minY, maxY,
        scrollX: old?.scrollX ?? 0, scrollY: old?.scrollY ?? 0, centered: old?.centered ?? false,
      });
    }
    this.selected = this.tabs.find((t) => t.root === this.selected?.root) ?? this.tabs[0] ?? null;
  }

  override tick(): void {
    if (this.game.advancements.version !== this.version) this.rebuild();
  }

  private origin(): [number, number] {
    return [Math.floor((this.width - WIN_W) / 2), Math.floor((this.height - WIN_H) / 2)];
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    const [ox, oy] = this.origin();
    this.renderBackground(g);
    this.renderInside(g, ox, oy);
    this.renderWindow(g, ox, oy);
    this.renderTooltips(g, mx, my, ox, oy);
    void partial;
  }

  override renderBackground(g: GuiGraphics): void {
    this.game.renderTransparentBackground(g);
  }

  private renderInside(g: GuiGraphics, ox: number, oy: number): void {
    const t = this.selected;
    const x = ox + 9, y = oy + 18;
    if (!t) {
      g.fill(x, y, x + IN_W, y + IN_H, 0xff000000);
      g.centered("There doesn't seem to be anything here...", x + 117, y + 56 - 4, 0xffffff, true);
      g.centered(':(', x + 117, y + IN_H - 9, 0xffffff, true);
      return;
    }
    if (!t.centered) {
      t.scrollX = 117 - (t.maxX + t.minX) / 2;
      t.scrollY = 56 - (t.maxY + t.minY) / 2;
      t.centered = true;
    }
    g.pushClip(x, y, x + IN_W, y + IN_H);
    const sx = Math.floor(t.scrollX), sy = Math.floor(t.scrollY);
    const k = sx % 16, l = sy % 16;
    for (let i = -1; i <= 15; i++) for (let j = -1; j <= 8; j++) g.sprite(t.background, x + k + 16 * i, y + l + 16 * j, 16, 16);
    this.drawConnectivity(g, t.rootWidget, x + sx, y + sy, true);
    this.drawConnectivity(g, t.rootWidget, x + sx, y + sy, false);
    for (const w of t.widgets.values()) this.drawWidget(g, w, x + sx, y + sy);
    g.popClip();
  }

  /** vanilla AdvancementWidget.drawConnectivity: black outline first, then white lines */
  private drawConnectivity(g: GuiGraphics, w: Widget, x: number, y: number, shadow: boolean): void {
    const p = w.parent;
    if (p) {
      const i = x + p.x + 13, j = x + p.x + 26 + 4, k = y + p.y + 13;
      const l = x + w.x + 13, i1 = y + w.y + 13;
      const c = shadow ? 0xff000000 : 0xffffffff;
      const h = (x0: number, x1: number, yy: number) => g.fill(Math.min(x0, x1), yy, Math.max(x0, x1) + 1, yy + 1, c);
      const v = (xx: number, y0: number, y1: number) => g.fill(xx, Math.min(y0, y1) + 1, xx + 1, Math.max(y0, y1), c);
      if (shadow) {
        h(j, i, k - 1);
        h(j + 1, i, k);
        h(j, i, k + 1);
        h(l, j - 1, i1 - 1);
        h(l, j - 1, i1);
        h(l, j - 1, i1 + 1);
        v(j - 1, i1, k);
        v(j + 1, i1, k);
      } else {
        h(j, i, k);
        h(l, j, i1);
        v(j, i1, k);
      }
    }
    for (const c of w.children) this.drawConnectivity(g, c, x, y, shadow);
  }

  private shown(w: Widget): boolean {
    return !w.a.hidden || this.game.advancements.isDone(w.a);
  }

  private drawWidget(g: GuiGraphics, w: Widget, x: number, y: number): void {
    if (!this.shown(w)) return;
    const done = this.game.advancements.percent(w.a) >= 1;
    g.sprite(`advancements_${w.a.frame}_frame_${done ? 'obtained' : 'unobtained'}`, x + w.x + 3, y + w.y, 26, 26);
    g.item(w.a.icon, x + w.x + 8, y + w.y + 5);
  }

  private renderWindow(g: GuiGraphics, ox: number, oy: number): void {
    g.sprite('advancements_window', ox, oy, WIN_W, WIN_H);
    if (this.tabs.length > 1) {
      this.tabs.forEach((t, i) => {
        const [tx, ty] = this.tabPos(ox, oy, i);
        const kind = i === 0 ? 'left' : i === 7 ? 'right' : 'middle';
        g.sprite(`advancements_tab_above_${kind}${t === this.selected ? '_selected' : ''}`, tx, ty, 28, 32);
      });
      this.tabs.forEach((t, i) => {
        const [tx, ty] = this.tabPos(ox, oy, i);
        g.item(ADVANCEMENTS.get(t.root)!.icon, tx + 6, ty + 9);
      });
    }
    g.text('Advancements', ox + 8, oy + 6, 0x404040, false);
  }

  /** vanilla AdvancementTabType.ABOVE */
  private tabPos(ox: number, oy: number, i: number): [number, number] {
    return [ox + 32 * i, oy - 32 + 4];
  }

  private renderTooltips(g: GuiGraphics, mx: number, my: number, ox: number, oy: number): void {
    const t = this.selected;
    if (t) {
      const x = ox + 9, y = oy + 18;
      const rx = mx - x, ry = my - y;
      g.fill(x, y, x + IN_W, y + IN_H, Math.floor(this.fade * 255) << 24);
      let hovered = false;
      const sx = Math.floor(t.scrollX), sy = Math.floor(t.scrollY);
      if (rx > 0 && rx < IN_W && ry > 0 && ry < IN_H) {
        for (const w of t.widgets.values()) {
          if (!this.shown(w)) continue;
          const wx = sx + w.x, wy = sy + w.y;
          if (rx >= wx && rx <= wx + 26 && ry >= wy && ry <= wy + 26) {
            hovered = true;
            this.drawHover(g, w, x + sx, y + sy);
            break;
          }
        }
      }
      this.fade = hovered ? Math.min(0.3, this.fade + 0.02) : Math.max(0, this.fade - 0.04);
    }
    if (this.tabs.length > 1) {
      this.tabs.forEach((tab, i) => {
        const [tx, ty] = this.tabPos(ox, oy, i);
        if (mx > tx && mx < tx + 28 && my > ty && my < ty + 32) g.tooltip([ADVANCEMENTS.get(tab.root)!.title], mx, my, true);
      });
    }
  }

  /** vanilla AdvancementWidget.drawHover: title bar (filled by progress) and description */
  private drawHover(g: GuiGraphics, w: Widget, x: number, y: number): void {
    const adv = this.game.advancements;
    const a = w.a;
    const title = a.title;
    const progressText = adv.progressText(a);
    const reqs = progressText ? Number(progressText.split('/')[1]) : 1;
    const digits = String(reqs).length;
    const extra = reqs > 1 ? g.textWidth('  ') + g.textWidth('0') * digits * 2 + g.textWidth('/') : 0;
    let lw = 29 + g.textWidth(title) + extra;
    const color = a.frame === 'challenge' ? '§5' : '§a';
    const desc = optimalLines(g, a.description, lw).map((l) => color + l);
    for (const l of desc) lw = Math.max(lw, g.textWidth(l));
    const width = lw + 3 + 5;

    // vanilla: too close to the right edge → the bar extends to the left
    const flip = x - 9 + w.x + width + 26 >= this.width;
    const f = adv.percent(a);
    let j = Math.floor(f * width);
    let t1: string, t2: string, tf: string;
    if (f >= 1) {
      j = Math.floor(width / 2);
      t1 = t2 = tf = 'obtained';
    } else if (j < 2) {
      j = Math.floor(width / 2);
      t1 = t2 = tf = 'unobtained';
    } else if (j > width - 2) {
      j = Math.floor(width / 2);
      t1 = t2 = 'obtained';
      tf = 'unobtained';
    } else {
      t1 = 'obtained';
      t2 = tf = 'unobtained';
    }
    const k = width - j;
    const l = y + w.y;
    const i1 = flip ? x + w.x - width + 26 + 6 : x + w.x;
    const j1 = 32 + desc.length * 9;
    const up = IN_H - (l - (this.origin()[1] + 18)) - 26 <= 6 + desc.length * 9;
    if (desc.length) g.nineSlice('advancements_title_box', i1, up ? l + 26 - j1 : l, width, j1, 10);
    g.sprite(`advancements_box_${t1}`, i1, l, j, 26, 0, 0, j, 26);
    g.sprite(`advancements_box_${t2}`, i1 + j, l, k, 26, 200 - k, 0, k, 26);
    g.sprite(`advancements_${a.frame}_frame_${tf}`, x + w.x + 3, y + w.y, 26, 26);
    if (flip) {
      g.text(title, i1 + 5, y + w.y + 9, 0xffffff, true);
      if (progressText) g.text(progressText, x + w.x - g.textWidth(progressText), y + w.y + 9, 0xffffff, true);
    } else {
      g.text(title, x + w.x + 32, y + w.y + 9, 0xffffff, true);
      if (progressText) g.text(progressText, x + w.x + width - g.textWidth(progressText) - 5, y + w.y + 9, 0xffffff, true);
    }
    desc.forEach((line, n) => {
      const ly = up ? l + 26 - j1 + 7 + n * 9 : y + w.y + 9 + 17 + n * 9;
      g.text(line, i1 + 5, ly, 0xaaaaaa, false);
    });
    g.item(a.icon, x + w.x + 8, y + w.y + 5);
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    if (button === 0 && this.tabs.length > 1) {
      const [ox, oy] = this.origin();
      for (let i = 0; i < this.tabs.length; i++) {
        const [tx, ty] = this.tabPos(ox, oy, i);
        if (mx > tx && mx < tx + 28 && my > ty && my < ty + 32) {
          this.selected = this.tabs[i];
          return true;
        }
      }
    }
    if (button === 0) {
      this.dragging = true;
      this.lastMx = mx;
      this.lastMy = my;
    }
    return super.mouseClicked(mx, my, button);
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    this.dragging = false;
    return super.mouseReleased(mx, my, button);
  }

  /** vanilla AdvancementTab.scroll */
  override mouseDragged(mx: number, my: number): boolean {
    const t = this.selected;
    if (this.dragging && t) {
      const dx = mx - this.lastMx, dy = my - this.lastMy;
      if (t.maxX - t.minX > IN_W) t.scrollX = Math.max(-(t.maxX - IN_W), Math.min(0, t.scrollX + dx));
      if (t.maxY - t.minY > IN_H) t.scrollY = Math.max(-(t.maxY - IN_H), Math.min(0, t.scrollY + dy));
    }
    this.lastMx = mx;
    this.lastMy = my;
    return true;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (e.code === (this.game.opts.keys.advancements ?? KEYS.advancements)) {
      this.game.setScreen(null);
      return true;
    }
    return super.keyPressed(e);
  }
}
