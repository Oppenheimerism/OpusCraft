// A sign's editor (vanilla AbstractSignEditScreen, SignEditScreen and HangingSignEditScreen, with TextFieldHelper):
// the sign drawn big in the middle (a sign's board, and its stick if it stands, at 62.5 times a model's size; a
// hanging sign's picture at 4.5 times), its four lines on it in the text's colour, a blinking cursor (an underscore at
// a line's end) and the selection; up and down (or Enter) change line, the rest edit the line as a text field does,
// no wider than the sign's lines (90 pixels, 60 on a hanging sign). Done (or Escape, or walking away, or the sign
// going) closes it and sends the side's lines to be checked and written (game/signs.ts updateSignText; a guest's to
// its host). While it's open the sign shows what's typed, in this game only.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { Screen, Button } from '../screen';
import { TextFieldHelper, copyToClipboard, readClipboard, hasControlDown } from './book';
import { BLOCKS, STATE_BLOCK } from '../../world/block';
import { signOf, type SignWood } from '../../world/blocksSigns';
import { SignBlockEntity, SIGN_TEXT_COLORS, canInteractWithBlock, type SignText } from '../../world/signBlockEntity';
import { setSignEditorHook, setSignPreview, updateSignText } from '../../game/signs';
import { signDarkColor } from '../../render/signRenderer';
import { signTexture, hangingSignGuiTexture } from '../../textures/signs';
import { textWidth } from '../../textures/font';
import type { TexImage } from '../../textures/tex';

/** vanilla SignEditScreen.MAGIC_SCALE_NUMBER: the sign model's scale on screen */
const SIGN_SCALE = 62.500004;
/** vanilla SignEditScreen.MAGIC_TEXT_SCALE */
const SIGN_TEXT_SCALE = 0.9765628;
/** vanilla HangingSignEditScreen.MAGIC_BACKGROUND_SCALE */
const HANGING_SCALE = 4.5;

const canvases = new Map<string, HTMLCanvasElement>();
function canvasOf(key: string, make: () => TexImage): HTMLCanvasElement {
  let c = canvases.get(key);
  if (!c) {
    const t = make();
    c = document.createElement('canvas');
    c.width = t.w;
    c.height = t.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
    canvases.set(key, c);
  }
  return c;
}

export class SignEditScreen extends Screen {
  /** the side's lines as they're being edited */
  readonly messages: string[];
  private text: SignText;
  /** the line being edited */
  line = 0;
  private frame = 0;
  readonly field: TextFieldHelper;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  private readonly wood: SignWood;
  private readonly kind: 'sign' | 'wall_sign' | 'hanging_sign' | 'wall_hanging_sign';
  private readonly lineHeight: number;
  private readonly maxWidth: number;
  private sent = false;

  constructor(game: Game, be: SignBlockEntity, readonly front: boolean) {
    const st = game.level.getState(be.x, be.y, be.z);
    const s = signOf(BLOCKS[STATE_BLOCK[st]].name) ?? { wood: 'oak' as const, kind: 'sign' as const };
    const hanging = s.kind === 'hanging_sign' || s.kind === 'wall_hanging_sign';
    super(game, hanging ? 'Edit Hanging Sign Message' : 'Edit Sign Message');
    this.x = be.x;
    this.y = be.y;
    this.z = be.z;
    this.wood = s.wood;
    this.kind = s.kind;
    this.lineHeight = be.textLineHeight;
    this.maxWidth = be.maxTextLineWidth;
    this.text = be.getText(front);
    this.messages = [...this.text.messages];
    this.field = new TextFieldHelper(() => this.messages[this.line], (m) => this.setMessage(m), (m) => textWidth(m) <= this.maxWidth);
    this.field.setCursorToEnd();
  }

  private get hanging(): boolean {
    return this.kind === 'hanging_sign' || this.kind === 'wall_hanging_sign';
  }

  init(): void {
    this.add(new Button(Math.floor(this.width / 2) - 100, Math.floor(this.height / 4) + 144, 200, 20, 'Done', () => this.onDone()));
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override titleY(): number {
    return 40;
  }

  /** vanilla isValid: the sign's still there and the player near enough to edit it */
  private isValid(): boolean {
    const g = this.game, p = g.player;
    if (!p || p.removed || p.health <= 0) return false;
    const be = g.level.world.getBlockEntity(this.x, this.y, this.z);
    return be instanceof SignBlockEntity && !be.removed && canInteractWithBlock(p, this.x, this.y, this.z, 4);
  }

  override tick(): void {
    this.frame++;
    if (!this.isValid()) this.onDone();
  }

  private setMessage(m: string): void {
    this.messages[this.line] = m;
    this.text = this.text.setMessage(this.line, m);
    setSignPreview(this.x, this.y, this.z, this.front, this.text);
  }

  private onDone(): void {
    this.game.setScreen(null);
  }

  override onClose(): void {
    this.onDone();
  }

  /** vanilla removed: the lines go to be written (ServerboundSignUpdatePacket) */
  override removed(): void {
    setSignPreview(this.x, this.y, this.z, this.front, null);
    if (this.sent) return;
    this.sent = true;
    const g = this.game;
    const lines = [...this.messages];
    if (g.client) g.client.signUpdate(this.x, this.y, this.z, this.front, lines);
    else if (g.player) updateSignText(g.level, g.player, this.x, this.y, this.z, this.front, lines);
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowUp') {
      this.line = (this.line - 1) & 3;
      this.field.setCursorToEnd();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      this.line = (this.line + 1) & 3;
      this.field.setCursorToEnd();
      return true;
    }
    if (this.fieldKeyPressed(e)) return true;
    return super.keyPressed(e);
  }

  /** vanilla TextFieldHelper.keyPressed */
  private fieldKeyPressed(e: KeyboardEvent): boolean {
    const f = this.field, ctrl = hasControlDown(e), shift = e.shiftKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ctrl && !shift && !e.altKey) {
      if (key === 'a') {
        f.selectAll();
        return true;
      }
      if (key === 'c') {
        copyToClipboard(f.copy());
        return true;
      }
      if (key === 'v') {
        readClipboard((s) => f.paste(s));
        return true;
      }
      if (key === 'x') {
        copyToClipboard(f.cut());
        return true;
      }
    }
    switch (e.key) {
      case 'Backspace':
        f.removeFromCursor(-1, ctrl);
        return true;
      case 'Delete':
        f.removeFromCursor(1, ctrl);
        return true;
      case 'ArrowLeft':
        f.moveBy(-1, shift, ctrl);
        return true;
      case 'ArrowRight':
        f.moveBy(1, shift, ctrl);
        return true;
      case 'Home':
        f.setCursorToStart(shift);
        return true;
      case 'End':
        f.setCursorToEnd(shift);
        return true;
    }
    return false;
  }

  override charTyped(ch: string): boolean {
    this.field.charTyped(ch);
    return true;
  }

  override renderBackground(g: GuiGraphics): void {
    this.game.renderTransparentBackground(g);
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    this.renderSign(g);
  }

  private blit(g: GuiGraphics, c: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    const s = g.scale;
    g.ctx.imageSmoothingEnabled = false;
    g.ctx.drawImage(c, sx, sy, sw, sh, dx * s, dy * s, dw * s, dh * s);
  }

  /** vanilla renderSign: the sign (offsetSign, renderSignBackground), then its text */
  private renderSign(g: GuiGraphics): void {
    const cx = this.width / 2;
    let cy: number, textScale: number;
    if (this.hanging) {
      // vanilla HangingSignEditScreen: its picture, 16 pixels at 4.5 times, 13 up from the text's middle
      cy = 125;
      const c = canvasOf(`hanging:${this.wood}`, () => hangingSignGuiTexture(this.wood));
      const half = 8 * HANGING_SCALE;
      this.blit(g, c, 0, 0, 16, 16, cx - half, cy - 13 - half, 2 * half, 2 * half);
      textScale = 1;
    } else {
      // vanilla SignEditScreen: the model's front at 62.5 times, 31 down; a wall sign's (no stick) 35 lower
      const standing = this.kind === 'sign';
      cy = 90 + (standing ? 0 : 35);
      const k = SIGN_SCALE / 16, by = cy + 31;
      const c = canvasOf(`sign:${this.wood}`, () => signTexture(this.wood));
      this.blit(g, c, 2, 2, 24, 12, cx - 12 * k, by - 14 * k, 24 * k, 12 * k);
      if (standing) this.blit(g, c, 2, 16, 2, 14, cx - k, by - 2 * k, 2 * k, 14 * k);
      textScale = SIGN_TEXT_SCALE;
    }
    g.pushTransform(cx, cy, 0, textScale);
    this.renderSignText(g);
    g.popTransform();
  }

  /** vanilla renderSignText */
  private renderSignText(g: GuiGraphics): void {
    const t = this.text;
    const color = t.glowing ? SIGN_TEXT_COLORS[t.color] : signDarkColor(t);
    const blink = Math.floor(this.frame / 6) % 2 === 0;
    const cursor = this.field.cursorPos, sel = this.field.selectionPos;
    const top = Math.trunc((4 * this.lineHeight) / 2);
    const m = this.line * this.lineHeight - top;
    for (let n = 0; n < this.messages.length; n++) {
      const s = this.messages[n];
      const x0 = Math.trunc(-g.textWidth(s) / 2);
      g.text(s, x0, n * this.lineHeight - top, color, false);
      if (n === this.line && cursor >= 0 && blink && cursor >= s.length) {
        g.text('_', g.textWidth(s.slice(0, Math.max(Math.min(cursor, s.length), 0))) - Math.trunc(g.textWidth(s) / 2), m, color, false);
      }
    }
    const s = this.messages[this.line];
    const w = g.textWidth(s);
    const p = g.textWidth(s.slice(0, Math.max(Math.min(cursor, s.length), 0))) - Math.trunc(w / 2);
    if (blink && cursor < s.length) g.fill(p, m - 1, p + 1, m + this.lineHeight, 0xff000000 | color);
    if (sel !== cursor) {
      const a = Math.min(cursor, sel), b = Math.max(cursor, sel);
      const u = g.textWidth(s.slice(0, a)) - Math.trunc(w / 2), v = g.textWidth(s.slice(0, b)) - Math.trunc(w / 2);
      // (vanilla guiTextHighlight: blue, inverting what's under it)
      g.fill(Math.min(u, v), m, Math.max(u, v), m + this.lineHeight, 0x800000ff);
    }
  }
}

/** the sign editor, for whichever player opens it: the game's own on its screen, a guest's player's on its guest's */
export function installSignScreens(game: Game): void {
  setSignEditorHook((p, be, front) => {
    if (p !== game.player) {
      game.server?.openSignEditor(p, be, front);
      return;
    }
    game.setScreen(new SignEditScreen(game, be, front));
  });
}
