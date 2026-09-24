// 2D GUI drawing on the overlay canvas, in vanilla "GUI pixels" (scaled by
// the GUI scale), with sprite, nine-slice, bitmap text and item icon helpers.

import type { TexImage } from '../textures/tex';
import type { FontData } from '../textures/font';
import type { ItemStack } from '../item/item';
import { crossbowTexture } from '../item/crossbow';

export const COLOR_CODES: Record<string, number> = {
  '0': 0x000000, '1': 0x0000aa, '2': 0x00aa00, '3': 0x00aaaa, '4': 0xaa0000, '5': 0xaa00aa, '6': 0xffaa00, '7': 0xaaaaaa,
  '8': 0x555555, '9': 0x5555ff, a: 0x55ff55, b: 0x55ffff, c: 0xff5555, d: 0xff55ff, e: 0xffff55, f: 0xffffff,
};

/** vanilla Window.calculateScale */
export function autoGuiScale(fbW: number, fbH: number, setting: number): number {
  let i = 1;
  while (i !== setting && i < fbW && i < fbH && fbW / (i + 1) >= 320 && fbH / (i + 1) >= 240) i++;
  return i;
}

export class SpriteSheet {
  readonly canvases = new Map<string, HTMLCanvasElement>();
  constructor(private readonly gens: Record<string, () => TexImage>) {}
  get(name: string): HTMLCanvasElement | null {
    let c = this.canvases.get(name);
    if (c) return c;
    const g = this.gens[name];
    if (!g) return null;
    let t: TexImage;
    try {
      t = g();
    } catch (e) {
      console.warn('gui sprite failed', name, e);
      return null;
    }
    c = document.createElement('canvas');
    c.width = t.w;
    c.height = t.h;
    const ctx = c.getContext('2d')!;
    const id = new ImageData(new Uint8ClampedArray(t.data), t.w, t.h);
    ctx.putImageData(id, 0, 0);
    this.canvases.set(name, c);
    return c;
  }
}

export class BitmapFont {
  private readonly atlas: HTMLCanvasElement;
  private readonly glyphs = new Map<string, { x: number; w: number }>();
  private readonly tinted = new Map<number, HTMLCanvasElement>();
  readonly lineHeight = 9;

  constructor(font: FontData) {
    const chars = Object.keys(font.glyphs);
    let x = 0;
    for (const ch of chars) {
      const g = font.glyphs[ch];
      const w = g[0]?.length ?? 0;
      this.glyphs.set(ch, { x, w });
      x += w + 1;
    }
    this.atlas = document.createElement('canvas');
    this.atlas.width = Math.max(1, x);
    this.atlas.height = 8;
    const ctx = this.atlas.getContext('2d')!;
    const img = ctx.createImageData(this.atlas.width, 8);
    for (const ch of chars) {
      const g = font.glyphs[ch];
      const pos = this.glyphs.get(ch)!;
      for (let y = 0; y < 8; y++) {
        const row = g[y] ?? '';
        for (let i = 0; i < row.length; i++) {
          if (row[i] !== '#') continue;
          const o = (y * this.atlas.width + pos.x + i) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private tint(color: number): HTMLCanvasElement {
    let c = this.tinted.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = this.atlas.width;
    c.height = this.atlas.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.atlas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, c.width, c.height);
    this.tinted.set(color, c);
    return c;
  }

  charWidth(ch: string): number {
    const g = this.glyphs.get(ch) ?? this.glyphs.get('?');
    return g ? g.w + 1 : 6;
  }

  width(s: string): number {
    let w = 0;
    let bold = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '§' && i + 1 < s.length) {
        const code = s[++i].toLowerCase();
        if (code === 'l') bold = true;
        else if (code === 'r' || COLOR_CODES[code] !== undefined) bold = false;
        continue;
      }
      w += this.charWidth(ch) + (bold ? 1 : 0);
    }
    return w;
  }

  /** Draw text; supports §-color codes. Coordinates in GUI pixels. */
  draw(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: number, scale: number, alpha = 1): void {
    let cx = x;
    let col = color;
    let bold = false;
    let italic = false;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '§' && i + 1 < s.length) {
        const code = s[++i].toLowerCase();
        // vanilla: a colour code also resets formatting; §l is bold, §o italic, §r resets everything
        if (COLOR_CODES[code] !== undefined) {
          col = COLOR_CODES[code];
          bold = false;
          italic = false;
        } else if (code === 'l') bold = true;
        else if (code === 'o') italic = true;
        else if (code === 'r') {
          col = color;
          bold = false;
          italic = false;
        }
        continue;
      }
      const g = this.glyphs.get(ch) ?? this.glyphs.get('?');
      if (!g) {
        cx += 6;
        continue;
      }
      if (g.w > 0 && ch !== ' ') {
        const src = this.tint(col & 0xffffff);
        const py = Math.round((y - 0) * scale);
        // vanilla BakedGlyph italic: the top leans 1 px right and the bottom 1 px left
        if (italic) {
          ctx.save();
          ctx.transform(1, 0, -0.25, 1, scale + 0.25 * py, 0);
        }
        ctx.drawImage(src, g.x, 0, g.w, 8, Math.round(cx * scale), py, g.w * scale, 8 * scale);
        // vanilla bold: the glyph again one pixel to the right
        if (bold) ctx.drawImage(src, g.x, 0, g.w, 8, Math.round((cx + 1) * scale), py, g.w * scale, 8 * scale);
        if (italic) ctx.restore();
      }
      cx += g.w + 1 + (bold ? 1 : 0);
    }
    ctx.globalAlpha = prevAlpha;
  }
}

export interface IconSource {
  /** draws an item icon for `id` into ctx at pixel coords (already scaled) */
  drawIcon(ctx: CanvasRenderingContext2D, id: string, px: number, py: number, size: number): boolean;
  /** adds the enchantment glint over the icon drawn at the same spot */
  drawGlint?(ctx: CanvasRenderingContext2D, id: string, px: number, py: number, size: number): void;
}

/** stacks drawn by something other than their icon (vanilla BlockEntityWithoutLevelRenderer's items: banners) */
type StackIconHook = (g: GuiGraphics, s: ItemStack, x: number, y: number) => boolean;
let stackIconHook: StackIconHook | null = null;

export function setStackIconHook(f: StackIconHook | null): void {
  stackIconHook = f;
}

export class GuiGraphics {
  scale = 1;
  width = 1;
  height = 1;
  constructor(readonly ctx: CanvasRenderingContext2D, readonly sprites: SpriteSheet, readonly font: BitmapFont, public icons: IconSource | null) {}

  setup(pixelW: number, pixelH: number, scale: number): void {
    this.scale = scale;
    this.width = Math.ceil(pixelW / scale);
    this.height = Math.ceil(pixelH / scale);
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
  }

  clear(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  }

  /** fill rect in GUI coords with ARGB color */
  fill(x0: number, y0: number, x1: number, y1: number, argb: number): void {
    const a = ((argb >>> 24) & 255) / 255;
    if (a <= 0) return;
    const c = this.ctx;
    c.fillStyle = `rgba(${(argb >> 16) & 255},${(argb >> 8) & 255},${argb & 255},${a})`;
    const s = this.scale;
    c.fillRect(Math.round(x0 * s), Math.round(y0 * s), Math.round((x1 - x0) * s), Math.round((y1 - y0) * s));
  }

  fillGradient(x0: number, y0: number, x1: number, y1: number, top: number, bottom: number): void {
    const c = this.ctx;
    const s = this.scale;
    const g = c.createLinearGradient(0, y0 * s, 0, y1 * s);
    const css = (v: number) => `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${((v >>> 24) & 255) / 255})`;
    g.addColorStop(0, css(top));
    g.addColorStop(1, css(bottom));
    c.fillStyle = g;
    c.fillRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
  }

  /** blit a sprite (or sub-rect) at GUI coords */
  sprite(name: string, x: number, y: number, w?: number, h?: number, sx = 0, sy = 0, sw?: number, sh?: number, alpha = 1): boolean {
    const img = this.sprites.get(name);
    if (!img) return false;
    const s = this.scale;
    const W = w ?? img.width, H = h ?? img.height;
    const c = this.ctx;
    const pa = c.globalAlpha;
    c.globalAlpha = pa * alpha;
    c.drawImage(img, sx, sy, sw ?? W, sh ?? H, Math.round(x * s), Math.round(y * s), W * s, H * s);
    c.globalAlpha = pa;
    return true;
  }

  /** nine-slice sprite with uniform border (vanilla gui sprite scaling "nine_slice") */
  nineSlice(name: string, x: number, y: number, w: number, h: number, border: number, alpha = 1): boolean {
    const img = this.sprites.get(name);
    if (!img) return false;
    const iw = img.width, ih = img.height, b = border;
    const s = this.scale, c = this.ctx;
    const pa = c.globalAlpha;
    c.globalAlpha = pa * alpha;
    const draw = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
      c.drawImage(img, sx, sy, sw, sh, Math.round(dx * s), Math.round(dy * s), Math.round((dx + dw) * s) - Math.round(dx * s), Math.round((dy + dh) * s) - Math.round(dy * s));
    };
    const cw = iw - 2 * b, ch = ih - 2 * b;
    // corners
    draw(0, 0, b, b, x, y, b, b);
    draw(iw - b, 0, b, b, x + w - b, y, b, b);
    draw(0, ih - b, b, b, x, y + h - b, b, b);
    draw(iw - b, ih - b, b, b, x + w - b, y + h - b, b, b);
    // edges (tiled like vanilla)
    for (let tx = b; tx < w - b; tx += cw) {
      const tw = Math.min(cw, w - b - tx);
      draw(b, 0, tw, b, x + tx, y, tw, b);
      draw(b, ih - b, tw, b, x + tx, y + h - b, tw, b);
    }
    for (let ty = b; ty < h - b; ty += ch) {
      const th = Math.min(ch, h - b - ty);
      draw(0, b, b, th, x, y + ty, b, th);
      draw(iw - b, b, b, th, x + w - b, y + ty, b, th);
    }
    for (let ty = b; ty < h - b; ty += ch)
      for (let tx = b; tx < w - b; tx += cw) {
        const tw = Math.min(cw, w - b - tx), th = Math.min(ch, h - b - ty);
        draw(b, b, tw, th, x + tx, y + ty, tw, th);
      }
    c.globalAlpha = pa;
    return true;
  }

  /** set a transform (GUI coords) for subsequent drawing; pair with popTransform */
  pushTransform(tx: number, ty: number, rotDeg = 0, scale = 1): void {
    const c = this.ctx;
    c.save();
    c.translate(tx * this.scale, ty * this.scale);
    if (rotDeg) c.rotate((rotDeg * Math.PI) / 180);
    if (scale !== 1) c.scale(scale, scale);
  }

  popTransform(): void {
    this.ctx.restore();
  }

  /** scale what's drawn about a GUI point, x and y apart, until popTransform */
  pushScaleAbout(px: number, py: number, sx: number, sy: number): void {
    const c = this.ctx, s = this.scale;
    c.save();
    c.translate(px * s, py * s);
    c.scale(sx, sy);
    c.translate(-px * s, -py * s);
  }

  /** multiply alpha of everything drawn until popAlpha */
  pushAlpha(a: number): void {
    this.ctx.save();
    this.ctx.globalAlpha *= a;
  }

  popAlpha(): void {
    this.ctx.restore();
  }

  /** clip drawing to a GUI rect until popClip */
  pushClip(x0: number, y0: number, x1: number, y1: number): void {
    const c = this.ctx, s = this.scale;
    c.save();
    c.beginPath();
    c.rect(Math.round(x0 * s), Math.round(y0 * s), Math.round((x1 - x0) * s), Math.round((y1 - y0) * s));
    c.clip();
  }

  popClip(): void {
    this.ctx.restore();
  }

  /** split text into lines no wider than maxW (vanilla StringSplitter, word based) */
  wrap(text: string, maxW: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const cand = line ? line + ' ' + w : w;
        if (this.font.width(cand) <= maxW || !line) line = cand;
        else {
          out.push(line);
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }

  /** tile a sprite over a rect; `texel` = GUI pixels per texture pixel */
  tile(name: string, x: number, y: number, w: number, h: number, alpha = 1, texel = 1): void {
    const img = this.sprites.get(name);
    if (!img) return;
    const tw0 = img.width * texel, th0 = img.height * texel;
    for (let ty = 0; ty < h; ty += th0)
      for (let tx = 0; tx < w; tx += tw0) {
        const tw = Math.min(tw0, w - tx), th = Math.min(th0, h - ty);
        this.sprite(name, x + tx, y + ty, tw, th, 0, 0, tw / texel, th / texel, alpha);
      }
  }

  text(s: string, x: number, y: number, color = 0xffffff, shadow = true, alpha = 1): number {
    if (shadow) this.font.draw(this.ctx, s, x + 1, y + 1, shadowOf(color), this.scale, alpha);
    this.font.draw(this.ctx, s, x, y, color, this.scale, alpha);
    return x + this.font.width(s);
  }

  /** vanilla AbstractWidget.renderScrollingString: centered, or scrolling back and forth when too wide */
  scrollingText(s: string, cx: number, x0: number, y0: number, x1: number, y1: number, color: number): void {
    const w = this.font.width(s);
    const ty = Math.floor((y0 + y1 - 9) / 2) + 1;
    const avail = x1 - x0;
    if (w > avail) {
      const l = w - avail;
      const t = performance.now() / 1000;
      const period = Math.max(l * 0.5, 3);
      const f = Math.sin((Math.PI / 2) * Math.cos((Math.PI * 2 * t) / period)) / 2 + 0.5;
      const off = f * l;
      this.pushClip(x0, y0, x1, y1);
      this.text(s, x0 - Math.floor(off), ty, color, true);
      this.popClip();
    } else {
      const c = Math.max(x0 + w / 2, Math.min(x1 - w / 2, cx));
      this.centered(s, c, ty, color, true);
    }
  }

  centered(s: string, cx: number, y: number, color = 0xffffff, shadow = true): void {
    this.text(s, cx - Math.floor(this.font.width(s) / 2), y, color, shadow);
  }

  textWidth(s: string): number {
    return this.font.width(s);
  }

  item(id: string, x: number, y: number): boolean {
    if (!this.icons) return false;
    return this.icons.drawIcon(this.ctx, id, Math.round(x * this.scale), Math.round(y * this.scale), 16 * this.scale);
  }

  /**
   * an item stack's icon, with the enchantment glint when it has one (vanilla renderItem + foil); `ticksUsing`:
   * how long the player has been using this very stack (-1: not in use), for the model overrides that
   * follow it (vanilla renders GUI items with the player as the entity: a crossbow drawn in the hotbar)
   */
  stack(s: ItemStack, x: number, y: number, ticksUsing = -1): boolean {
    if (stackIconHook?.(this, s, x, y)) return true;
    let id = s.item.id === 'crossbow' ? crossbowTexture(s, ticksUsing) ?? s.item.id : s.item.id;
    // (a dyed stack's colour tints its icon: vanilla ItemColors, DyedItemColor)
    if (s.tag?.dyedColor !== undefined) id += `#${s.tag.dyedColor.toString(16)}`;
    const ok = this.item(id, x, y);
    if (ok && s.hasGlint()) this.icons?.drawGlint?.(this.ctx, id, Math.round(x * this.scale), Math.round(y * this.scale), 16 * this.scale);
    return ok;
  }

  /** stack count / durability decorations (vanilla renderItemDecorations) */
  itemDecorations(count: number, damage: number, maxDamage: number, x: number, y: number): void {
    if (maxDamage > 0 && damage > 0) {
      const frac = Math.max(0, 1 - damage / maxDamage);
      const w = Math.round(13 * frac);
      const hue = Math.max(0, frac) / 3;
      const rgb = hsv(hue, 1, 1);
      this.fill(x + 2, y + 13, x + 15, y + 15, 0xff000000);
      this.fill(x + 2, y + 13, x + 2 + w, y + 14, 0xff000000 | rgb);
    }
    if (count > 1) {
      const s = String(count);
      this.text(s, x + 19 - 2 - this.font.width(s), y + 6 + 3, 0xffffff, true);
    }
  }

  tooltip(lines: string[], mx: number, my: number, plain = false): void {
    if (!lines.length) return;
    let w = 0;
    for (const l of lines) w = Math.max(w, this.font.width(l));
    let x = mx + 12, y = my - 12;
    if (plain) {
      // widget tooltips: all lines white, 10px spacing
      const h = lines.length * 10 - 2;
      if (x + w + 4 > this.width) x = Math.max(4, mx - 16 - w);
      if (y + h + 6 > this.height) y = this.height - h - 6;
      if (y < 4) y = 4;
      this.tooltipBox(x, y, w, h);
      lines.forEach((l, i) => this.text(l, x, y + i * 10, 0xffffff, true));
      return;
    }
    const h = lines.length === 1 ? 8 : 8 + 2 + (lines.length - 1) * 10;
    if (x + w + 4 > this.width) x = Math.max(4, mx - 16 - w);
    if (y + h + 6 > this.height) y = this.height - h - 6;
    if (y < 4) y = 4;
    this.tooltipBox(x, y, w, h);
    let ty = y;
    lines.forEach((l, i) => {
      this.text(l, x, ty, i === 0 ? 0xffffff : 0xaaaaaa, true);
      ty += i === 0 ? 12 : 10;
    });
  }

  private tooltipBox(x: number, y: number, w: number, h: number): void {
    // vanilla tooltip background: dark purple-bordered box
    const bg = 0xf0100010, b0 = 0x505000ff, b1 = 0x5028007f;
    this.fill(x - 3, y - 4, x + w + 3, y - 3, bg);
    this.fill(x - 3, y + h + 3, x + w + 3, y + h + 4, bg);
    this.fill(x - 3, y - 3, x + w + 3, y + h + 3, bg);
    this.fill(x - 4, y - 3, x - 3, y + h + 3, bg);
    this.fill(x + w + 3, y - 3, x + w + 4, y + h + 3, bg);
    this.fillGradient(x - 3, y - 3 + 1, x - 3 + 1, y + h + 3 - 1, b0, b1);
    this.fillGradient(x + w + 2, y - 3 + 1, x + w + 3, y + h + 3 - 1, b0, b1);
    this.fill(x - 3, y - 3, x + w + 3, y - 3 + 1, b0);
    this.fill(x - 3, y + h + 2, x + w + 3, y + h + 3, b1);
  }
}

export function shadowOf(color: number): number {
  return ((color & 0xfcfcfc) >> 2) & 0xffffff;
}

function hsv(h: number, s: number, v: number): number {
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}
