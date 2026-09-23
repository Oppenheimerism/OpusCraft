// Screens of the enchanting table (vanilla EnchantmentScreen + EnchantmentNames),
// the anvil (AnvilScreen with its rename field) and the grindstone
// (GrindstoneScreen).

import type { Game } from '../../game/game';
import { EditBox } from '../screen';
import { BitmapFont, GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../../inventory/enchantMenus';
import { ItemStack } from '../../item/item';
import { ENCHANTMENTS, enchantmentLine } from '../../item/enchantments';
import { JavaRandom } from '../../core/rng';
import { SGA_FONT } from '../../textures/sga';
import { GuiBookRenderer } from '../../render/bookRenderer';
import '../../textures/enchantingGui';

/** vanilla EnchantmentNames.words */
const WORDS = [
  'the', 'elder', 'scrolls', 'klaatu', 'berata', 'niktu', 'xyzzy', 'bless', 'curse', 'light', 'darkness', 'fire', 'air', 'earth', 'water', 'hot',
  'dry', 'cold', 'wet', 'ignite', 'snuff', 'embiggen', 'twist', 'shorten', 'stretch', 'fiddle', 'destroy', 'imbue', 'galvanize', 'enchant', 'free',
  'limited', 'range', 'of', 'towards', 'inside', 'sphere', 'cube', 'self', 'other', 'ball', 'mental', 'physical', 'grow', 'shrink', 'demon',
  'elemental', 'spirit', 'animal', 'creature', 'beast', 'humanoid', 'undead', 'fresh', 'stale', 'phnglui', 'mglwnafh', 'cthulhu', 'rlyeh',
  'wgahnagl', 'fhtagn', 'baguette',
];

let sga: BitmapFont | null = null;
const sgaFont = () => (sga ??= new BitmapFont(SGA_FONT));

const sameStack = (a: ItemStack | null, b: ItemStack | null) => (!a && !b) || (!!a && !!b && a.sameItem(b) && a.count === b.count);

export class EnchantmentScreen extends AbstractContainerScreen<EnchantmentMenu> {
  /** vanilla EnchantmentNames' random, seeded from the enchantment seed every frame */
  private readonly names = new JavaRandom(0);
  private bookRenderer: GuiBookRenderer | null = null;
  private time = 0;
  private flip = 0;
  private oFlip = 0;
  private flipT = 0;
  private flipA = 0;
  private open = 0;
  private oOpen = 0;
  private last: ItemStack | null = null;

  constructor(game: Game, menu: EnchantmentMenu, title = 'Enchant') {
    super(game, menu, title);
  }

  override tick(): void {
    super.tick();
    this.tickBook();
  }

  /** vanilla EnchantmentScreen.tickBook: turn pages when the item changes, open while there are offers */
  private tickBook(): void {
    const s = this.menu.slots[0].item;
    if (!sameStack(s, this.last)) {
      this.last = s ? s.copy() : null;
      do this.flipT += Math.floor(Math.random() * 4) - Math.floor(Math.random() * 4);
      while (this.flip <= this.flipT + 1 && this.flip >= this.flipT - 1);
    }
    this.time++;
    this.oFlip = this.flip;
    this.oOpen = this.open;
    const any = this.menu.costs.some((c) => c !== 0);
    this.open = Math.max(0, Math.min(1, this.open + (any ? 0.2 : -0.2)));
    const f1 = Math.max(-0.2, Math.min(0.2, (this.flipT - this.flip) * 0.4));
    this.flipA += (f1 - this.flipA) * 0.9;
    this.flip += this.flipA;
  }

  /** vanilla EnchantmentNames.getRandomName: 3-4 words, cut to the width available */
  private randomName(maxWidth: number): string {
    const r = this.names;
    const n = r.nextInt(2) + 3;
    let s = '';
    for (let j = 0; j < n; j++) {
      if (j) s += ' ';
      s += WORDS[r.nextInt(WORDS.length)];
    }
    const f = sgaFont();
    let w = 0, out = '';
    for (const ch of s) {
      w += f.charWidth(ch);
      if (w > maxWidth) break;
      out += ch;
    }
    return out;
  }

  private renderBook(g: GuiGraphics, x: number, y: number, partial: number): void {
    this.bookRenderer ??= new GuiBookRenderer(this.game.gl, this.game.renderer.batch);
    const flip = this.oFlip + (this.flip - this.oFlip) * partial;
    const open = this.oOpen + (this.open - this.oOpen) * partial;
    const x1 = x + 8, y1 = y + 6, x2 = x + 58, y2 = y + 58;
    const c = this.bookRenderer.render(g.scale, x1, y1, x2, y2, x + 33, y + 31, flip, open);
    const ctx = g.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const t = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, t.e, t.f);
    ctx.drawImage(c, Math.round(x1 * g.scale), Math.round(y1 * g.scale));
    ctx.restore();
  }

  renderBg(g: GuiGraphics, mx: number, my: number, partial: number): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_enchanting_table', i, j, 176, 166);
    this.renderBook(g, i, j, partial);
    this.names.setSeed(this.menu.enchantmentSeed);
    const k = this.menu.goldCount();
    const p = this.game.player;
    const creative = p.gameMode === 'creative';
    for (let l = 0; l < 3; l++) {
      const i1 = i + 60, j1 = i1 + 20, y = j + 14 + 19 * l;
      const k1 = this.menu.costs[l];
      if (k1 === 0) {
        g.sprite('enchantment_slot_disabled', i1, y, 108, 19);
        continue;
      }
      const s = String(k1);
      const l1 = 86 - g.textWidth(s);
      const name = this.randomName(l1);
      let i2 = 0x685e4a;
      if ((k < l + 1 || p.xpLevel < k1) && !creative) {
        g.sprite('enchantment_slot_disabled', i1, y, 108, 19);
        g.sprite(`enchanting_level_${l + 1}_disabled`, i1 + 1, j + 15 + 19 * l, 16, 16);
        sgaFont().draw(g.ctx, name, j1, j + 16 + 19 * l, (i2 & 0xfefefe) >> 1, g.scale);
        i2 = 0x407f10;
      } else {
        const j2 = mx - (i + 60), k2 = my - y;
        if (j2 >= 0 && k2 >= 0 && j2 < 108 && k2 < 19) {
          g.sprite('enchantment_slot_highlighted', i1, y, 108, 19);
          i2 = 0xffff80;
        } else g.sprite('enchantment_slot', i1, y, 108, 19);
        g.sprite(`enchanting_level_${l + 1}`, i1 + 1, j + 15 + 19 * l, 16, 16);
        sgaFont().draw(g.ctx, name, j1, j + 16 + 19 * l, i2, g.scale);
        i2 = 0x80ff20;
      }
      g.text(s, j1 + 86 - g.textWidth(s), j + 16 + 19 * l + 7, i2, true);
    }
  }

  /** vanilla EnchantmentScreen.render: the clue tooltip over an offer */
  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    super.renderTooltip(g, mx, my);
    const p = this.game.player;
    const creative = p.gameMode === 'creative';
    const lapis = this.menu.goldCount();
    for (let j = 0; j < 3; j++) {
      const k = this.menu.costs[j];
      const clue = this.menu.enchantClue[j];
      const l = this.menu.levelClue[j];
      if (!clue || !ENCHANTMENTS.has(clue)) continue;
      const i1 = j + 1;
      const x = mx - this.leftPos - 60, y = my - this.topPos - (14 + 19 * j);
      if (!(x >= -1 && x < 108 + 1 && y >= -1 && y < 17 + 1) || k <= 0 || l < 0) continue;
      const lines = [`§7${enchantmentLine(clue, l).text}§f . . . ?`];
      if (!creative) {
        lines.push('');
        if (p.xpLevel < k) lines.push(`§cLevel Requirement: ${k}`);
        else {
          lines.push((lapis >= i1 ? '§7' : '§c') + (i1 === 1 ? '1 Lapis Lazuli' : `${i1} Lapis Lazuli`));
          lines.push('§7' + (i1 === 1 ? '1 Enchantment Level' : `${i1} Enchantment Levels`));
        }
      }
      g.tooltip(lines, mx, my);
      break;
    }
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    for (let k = 0; k < 3; k++) {
      const d0 = mx - (this.leftPos + 60), d1 = my - (this.topPos + 14 + 19 * k);
      if (d0 >= 0 && d1 >= 0 && d0 < 108 && d1 < 19 && this.menu.clickMenuButton(k)) return true;
    }
    return super.mouseClicked(mx, my, button);
  }
}

// ---------------------------------------------------------------------------
// Anvil

/** vanilla EditBox as the anvil uses it: unbordered, white text that scrolls to keep the cursor in view */
class NameBox extends EditBox {
  editable = true;
  private displayPos = 0;
  private focusedAt = performance.now();
  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h);
    this.bordered = false;
    this.maxLength = 50;
  }
  setValue(v: string): void {
    this.value = v.slice(0, this.maxLength);
    this.cursor = this.value.length;
    this.onChange?.(this.value);
  }
  override render(g: GuiGraphics): void {
    const f = g.font;
    if (this.cursor < this.displayPos) this.displayPos = this.cursor;
    while (this.displayPos < this.cursor && f.width(this.value.slice(this.displayPos, this.cursor)) > this.w) this.displayPos++;
    let shown = '';
    for (const ch of this.value.slice(this.displayPos)) {
      if (f.width(shown + ch) > this.w) break;
      shown += ch;
    }
    const color = 0xffffff;
    g.text(shown, this.x, this.y, color, true);
    if (!this.focused || !this.editable) return;
    if (Math.floor((performance.now() - this.focusedAt) / 300) % 2 !== 0) return;
    const cx = this.x + f.width(this.value.slice(this.displayPos, this.cursor));
    if (this.cursor < this.value.length || this.value.length >= this.maxLength) g.fill(cx, this.y - 1, cx + 1, this.y + 1 + 9, 0xffd0d0d0);
    else g.text('_', cx, this.y, color, true);
  }
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (!this.isMouseOver(mx, my) || !this.editable) return false;
    if (!this.focused) this.focusedAt = performance.now();
    this.focused = true;
    return b === 0;
  }
  override keyPressed(e: KeyboardEvent): boolean {
    if (!this.editable) return false;
    return super.keyPressed(e);
  }
  override charTyped(ch: string): boolean {
    if (!this.editable) return false;
    return super.charTyped(ch);
  }
}

export class AnvilScreen extends AbstractContainerScreen<AnvilMenu> {
  private name!: NameBox;
  private lastInput: ItemStack | null = null;

  constructor(game: Game, menu: AnvilMenu) {
    super(game, menu, 'Repair & Name');
    this.titleLabelX = 60;
  }

  override init(): void {
    super.init();
    const prev = this.name?.value ?? '';
    this.name = this.add(new NameBox(this.leftPos + 62, this.topPos + 24, 103, 12));
    this.name.onChange = (v) => this.onNameChanged(v);
    this.name.value = prev;
    this.name.cursor = prev.length;
    this.name.editable = this.menu.slots[0].hasItem();
    this.name.focused = this.name.editable;
  }

  /** vanilla AnvilScreen.onNameChanged: the item's own name counts as no rename */
  private onNameChanged(v: string): void {
    const s = this.menu.slots[0].item;
    if (!s) return;
    this.menu.setItemName(s.tag?.customName === undefined && v === s.displayName() ? '' : v);
  }

  /** vanilla AnvilScreen.slotChanged for the first input */
  private checkInput(): void {
    const s = this.menu.slots[0].item;
    if (sameStack(s, this.lastInput)) return;
    this.lastInput = s ? s.copy() : null;
    this.name.editable = !!s;
    this.name.setValue(s ? s.displayName() : '');
    this.name.focused = !!s;
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.checkInput();
    super.render(g, mx, my, partial);
  }

  renderBg(g: GuiGraphics): void {
    const L = this.leftPos, T = this.topPos;
    g.sprite('container_anvil', L, T, 176, 166);
    g.sprite(this.menu.slots[0].hasItem() ? 'anvil_text_field' : 'anvil_text_field_disabled', L + 59, T + 20, 110, 16);
    if ((this.menu.slots[0].hasItem() || this.menu.slots[1].hasItem()) && !this.menu.slots[2].hasItem()) g.sprite('anvil_error', L + 99, T + 45, 28, 21);
  }

  /** vanilla AnvilScreen.renderLabels: the level cost, red when it can't be paid or is too expensive */
  override renderLabels(g: GuiGraphics): void {
    super.renderLabels(g);
    const i = this.menu.cost;
    if (i <= 0) return;
    let j = 0x80ff20;
    let text: string | null;
    const creative = this.game.player.gameMode === 'creative';
    if (i >= 40 && !creative) {
      text = 'Too Expensive!';
      j = 0xff6060;
    } else if (!this.menu.slots[2].hasItem()) text = null;
    else {
      text = `Enchantment Cost: ${i}`;
      if (!this.menu.slots[2].mayPickup(this.game.player)) j = 0xff6060;
    }
    if (text === null) return;
    const k = this.imageWidth - 8 - g.textWidth(text) - 2;
    g.fill(k - 2, 67, this.imageWidth - 8, 79, 0x4f000000);
    g.text(text, k, 69, j, true);
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    // vanilla: clicking slots leaves the name field focused
    const was = this.name.focused;
    const r = super.mouseClicked(mx, my, button);
    if (!this.name.isMouseOver(mx, my)) this.name.focused = was && this.name.editable;
    return r;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.onClose();
      return true;
    }
    // vanilla: the name field swallows keys (so E doesn't close the screen) while it's focused; printable keys
    // go on to charTyped
    if (this.name.focused && this.name.editable) {
      if (this.name.keyPressed(e)) return true;
      return e.key.length !== 1;
    }
    return super.keyPressed(e);
  }

  override charTyped(ch: string): boolean {
    return this.name.charTyped(ch) || super.charTyped(ch);
  }
}

// ---------------------------------------------------------------------------
// Grindstone

export class GrindstoneScreen extends AbstractContainerScreen<GrindstoneMenu> {
  constructor(game: Game, menu: GrindstoneMenu) {
    super(game, menu, 'Repair & Disenchant');
  }

  renderBg(g: GuiGraphics): void {
    const L = this.leftPos, T = this.topPos;
    g.sprite('container_grindstone', L, T, 176, 166);
    if ((this.menu.slots[0].hasItem() || this.menu.slots[1].hasItem()) && !this.menu.slots[2].hasItem()) g.sprite('grindstone_error', L + 92, T + 31, 28, 21);
  }
}
