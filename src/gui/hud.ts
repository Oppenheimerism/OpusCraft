// In-game HUD (vanilla Gui.render layout).

import type { GuiGraphics } from './guiGraphics';
import type { Game } from '../game/game';
import { debugLines } from '../render/overlay';
import { FLUID_WATER } from '../world/fluids';

export class Hud {
  private tickCount = 0;
  private lastHealth = 20;
  private displayHealth = 20;
  private healthBlinkTime = 0;
  private lastHealthTime = 0;
  private toolHighlightTimer = 0;
  private lastSelected = -1;
  private lastSelectedItem: string | null = null;
  vignetteBrightness = 1;
  private readonly rand = { next: () => Math.random() };
  chat: { text: string; time: number }[] = [];
  title: { text: string; sub: string; time: number } | null = null;
  actionBar: { text: string; time: number } | null = null;

  tick(game: Game): void {
    this.tickCount++;
    const p = game.player;
    const inv = p.inventory;
    const cur = inv.selectedItem;
    const id = cur ? cur.item.id : null;
    if (inv.selected !== this.lastSelected || id !== this.lastSelectedItem) {
      if (id) this.toolHighlightTimer = 40;
      else this.toolHighlightTimer = 0;
      this.lastSelected = inv.selected;
      this.lastSelectedItem = id;
    } else if (this.toolHighlightTimer > 0) this.toolHighlightTimer--;
    // vignette brightness (vanilla uses light level at the player)
    // vanilla Gui.updateVignetteBrightness: raw brightness (sky minus sky darkening) through the light curve
    const l = game.world.getLight(Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z));
    const raw = Math.max((l >> 4) - game.skyDarkenInt(), l & 15);
    const fl = Math.max(0, raw) / 15;
    const bright = fl / (4 - 3 * fl);
    const f = Math.max(0, Math.min(1, 1 - bright));
    this.vignetteBrightness += (f - this.vignetteBrightness) * 0.01;
    if (this.actionBar && --this.actionBar.time <= 0) this.actionBar = null;
    if (this.title && --this.title.time <= 0) this.title = null;
  }

  addChat(text: string, tick: number): void {
    this.chat.push({ text, time: tick });
    if (this.chat.length > 100) this.chat.shift();
  }

  render(g: GuiGraphics, game: Game, partial: number, chatOpen: boolean): void {
    const p = game.player;
    const W = g.width, H = g.height;
    if (p.gameMode === 'spectator') {
      this.renderCrosshair(g, game);
      return;
    }
    const cx = Math.floor(W / 2);
    // crosshair
    if (!game.showDebug || true) this.renderCrosshair(g, game);
    // hotbar
    g.sprite('hotbar', cx - 91, H - 22, 182, 22);
    g.sprite('hotbar_selection', cx - 91 - 1 + p.inventory.selected * 20, H - 22 - 1, 24, 23);
    for (let i = 0; i < 9; i++) {
      const s = p.inventory.main[i];
      if (!s) continue;
      const x = cx - 90 + i * 20 + 2, y = H - 16 - 3;
      g.item(s.item.id, x, y);
      g.itemDecorations(s.count, s.damage, s.item.maxDamage, x, y);
    }
    const survival = p.gameMode === 'survival' || p.gameMode === 'adventure';
    if (survival) {
      this.renderXp(g, game, cx);
      this.renderHealthFood(g, game, cx, H);
    }
    // selected item name
    if (this.toolHighlightTimer > 0 && p.inventory.selectedItem) {
      const name = p.inventory.selectedItem.item.name;
      const alpha = Math.min(255, Math.floor((this.toolHighlightTimer * 256) / 10)) / 255;
      const w = g.textWidth(name);
      const x = Math.floor((W - w) / 2);
      let y = H - 59;
      if (!survival) y += 14;
      g.text(name, x, y, 0xffffff, true, alpha);
    }
    // action bar
    if (this.actionBar) {
      const a = Math.min(1, this.actionBar.time / 20);
      g.centered(this.actionBar.text, cx, H - 68, 0xffffff, true);
      void a;
    }
    this.renderChat(g, game, chatOpen);
    if (game.showDebug) this.renderDebug(g, game);
    void partial;
  }

  private renderCrosshair(g: GuiGraphics, game: Game): void {
    const ctx = g.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    if (!g.sprite('crosshair', Math.floor((g.width - 15) / 2), Math.floor((g.height - 15) / 2), 15, 15)) {
      g.fill(g.width / 2 - 4, g.height / 2 - 0.5, g.width / 2 + 5, g.height / 2 + 0.5, 0xffffffff);
    }
    ctx.restore();
    // attack indicator (vanilla default: crosshair mode)
    const p = game.player;
    const f = p.attackStrengthScale(0);
    if (f < 1) {
      const x = Math.floor(g.width / 2 - 8), y = Math.floor(g.height / 2 - 7 + 16);
      const w = Math.floor(f * 17);
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      g.fill(x, y, x + 16, y + 4, 0x80ffffff);
      g.fill(x, y, x + Math.min(16, w), y + 4, 0xffffffff);
      ctx.restore();
    }
  }

  private renderXp(g: GuiGraphics, game: Game, cx: number): void {
    const p = game.player;
    const x = cx - 91, y = g.height - 32 + 3;
    g.sprite('experience_bar_background', x, y, 182, 5);
    const k = Math.floor(p.xpProgress * 183);
    if (k > 0) g.sprite('experience_bar_progress', x, y, k, 5, 0, 0, k, 5);
    if (p.xpLevel > 0) {
      const s = String(p.xpLevel);
      const tx = Math.floor((g.width - g.textWidth(s)) / 2), ty = g.height - 31 - 4;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.text(s, tx + ox, ty + oy, 0x000000, false);
      g.text(s, tx, ty, 0x80ff20, false);
    }
  }

  private renderHealthFood(g: GuiGraphics, game: Game, cx: number, H: number): void {
    const p = game.player;
    const health = Math.ceil(p.health);
    const tick = this.tickCount;
    // blink on damage/heal
    if (health < this.lastHealth && p.invulnerableTime > 0) {
      this.lastHealthTime = tick;
      this.healthBlinkTime = tick + 20;
    } else if (health > this.lastHealth && p.invulnerableTime > 0) {
      this.lastHealthTime = tick;
      this.healthBlinkTime = tick + 10;
    }
    if (tick - this.lastHealthTime > 20) {
      this.lastHealth = health;
      this.displayHealth = health;
      this.lastHealthTime = tick;
    }
    this.lastHealth = health;
    const blink = this.healthBlinkTime > tick && Math.floor((this.healthBlinkTime - tick) / 3) % 2 === 1;
    const lx = cx - 91, rx = cx + 91, y = H - 39;
    const maxH = Math.max(p.maxHealth, Math.max(this.displayHealth, health));
    const absorb = Math.ceil(p.absorption);
    const rows = Math.ceil((maxH + absorb) / 2 / 10);
    const rowH = Math.max(10 - (rows - 2), 3);
    const armorY = y - (rows - 1) * rowH - 10;
    // armor
    const armor = p.inventory.armorValue();
    if (armor > 0)
      for (let i = 0; i < 10; i++) {
        const x = lx + i * 8;
        if (i * 2 + 1 < armor) g.sprite('armor_full', x, armorY, 9, 9);
        else if (i * 2 + 1 === armor) g.sprite('armor_half', x, armorY, 9, 9);
        else g.sprite('armor_empty', x, armorY, 9, 9);
      }
    // hearts
    const n = Math.ceil(maxH / 2);
    const na = Math.ceil(absorb / 2);
    const hardcore = false;
    for (let l = n + na - 1; l >= 0; l--) {
      const row = Math.floor(l / 10), col = l % 10;
      const hx = lx + col * 8;
      let hy = y - row * rowH;
      if (health + absorb <= 4) hy += Math.floor(this.rand.next() * 2);
      g.sprite(blink ? 'heart_container_blinking' : 'heart_container', hx, hy, 9, 9);
      const i2 = l * 2;
      if (l >= n) {
        const a = i2 - n * 2;
        if (a < absorb) g.sprite(a + 1 === absorb ? 'heart_absorbing_half' : 'heart_absorbing_full', hx, hy, 9, 9);
        continue;
      }
      if (blink && i2 < this.displayHealth) g.sprite(i2 + 1 === this.displayHealth ? 'heart_half_blinking' : 'heart_full_blinking', hx, hy, 9, 9);
      if (i2 < health) g.sprite(i2 + 1 === health ? (hardcore ? 'heart_hardcore_half' : 'heart_half') : hardcore ? 'heart_hardcore_full' : 'heart_full', hx, hy, 9, 9);
    }
    // food
    const food = p.food.level;
    for (let i = 0; i < 10; i++) {
      let fy = y;
      if (p.food.saturation <= 0 && tick % (food * 3 + 1) === 0) fy = y + Math.floor(this.rand.next() * 3) - 1;
      const fx = rx - i * 8 - 9;
      g.sprite('food_empty', fx, fy, 9, 9);
      if (i * 2 + 1 < food) g.sprite('food_full', fx, fy, 9, 9);
      if (i * 2 + 1 === food) g.sprite('food_half', fx, fy, 9, 9);
    }
    // air
    const maxAir = 300;
    if (p.eyeFluid === FLUID_WATER || p.air < maxAir) {
      const ay = y - 10;
      const full = Math.ceil(((p.air - 2) * 10) / maxAir);
      const partial = Math.ceil((p.air * 10) / maxAir) - full;
      for (let i = 0; i < full + partial; i++) {
        const bx = rx - i * 8 - 9;
        g.sprite(i < full ? 'air' : 'air_bursting', bx, ay, 9, 9);
      }
    }
  }

  private renderChat(g: GuiGraphics, game: Game, open: boolean): void {
    const now = game.ticks;
    const lines = this.chat.slice(-100);
    const maxLines = open ? 20 : 10;
    let y = g.height - 40;
    let shown = 0;
    for (let i = lines.length - 1; i >= 0 && shown < maxLines; i--) {
      const m = lines[i];
      const age = now - m.time;
      if (!open && age >= 200) break;
      let op = 1;
      if (!open) {
        op = 1 - age / 200;
        op = Math.min(1, Math.max(0, op * 10));
        op *= op;
      }
      if (op <= 0.05) continue;
      g.fill(0, y - 9, 320 + 4, y, Math.floor(op * 0.5 * 255) << 24);
      g.text(m.text, 2, y - 8, 0xffffff, true, op);
      y -= 9;
      shown++;
    }
  }

  private renderDebug(g: GuiGraphics, game: Game): void {
    const lines = debugLines(game);
    let y = 2;
    for (const l of lines) {
      if (l) {
        const w = g.textWidth(l);
        g.fill(1, y - 1, 2 + w + 1, y + 8, 0x90505050);
        g.text(l, 2, y, 0xe0e0e0, false);
      }
      y += 9;
    }
    // right column
    const r = rightDebugLines(game);
    y = 2;
    for (const l of r) {
      if (l) {
        const w = g.textWidth(l);
        const x = g.width - 2 - w;
        g.fill(x - 1, y - 1, x + w + 1, y + 8, 0x90505050);
        g.text(l, x, y, 0xe0e0e0, false);
      }
      y += 9;
    }
  }
}

function rightDebugLines(game: Game): string[] {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const used = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
  const max = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : 0;
  const lines = [
    `Java: 21.0.7 64bit`,
    mem ? `Mem: ${Math.round((used / max) * 100)}% ${used}/${max}MB` : 'Mem: n/a',
    `Allocation rate: 0MB /s`,
    `Allocated: ${Math.round((used / Math.max(1, max)) * 100)}% ${used}MB`,
    ``,
    `CPU: ${navigator.hardwareConcurrency}x`,
    ``,
    `Display: ${game.canvas.width}x${game.canvas.height} (WebGL2)`,
  ];
  const h = game.interaction.hit;
  if (h) {
    const blocks = game.world.getState(h.x, h.y, h.z);
    lines.push('', `§nTargeted Block: ${h.x}, ${h.y}, ${h.z}`, blockDesc(blocks));
  }
  return lines;
}

import { BLOCKS, STATE_BLOCK } from '../world/block';
function blockDesc(st: number): string {
  const b = BLOCKS[STATE_BLOCK[st]];
  return 'minecraft:' + b.name;
}
