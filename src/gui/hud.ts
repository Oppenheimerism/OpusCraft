// In-game HUD (vanilla Gui.render layout).

import type { GuiGraphics } from './guiGraphics';
import { LivingEntity } from '../entity/living';
import type { RideableJumping } from '../entity/player';
import type { Game } from '../game/game';
import { debugLines } from '../render/overlay';
import { FLUID_WATER } from '../world/fluids';
import { RARITY_COLOR, type ItemStack } from '../item/item';
import { compareEffects } from '../entity/effects';
import { BossHealthOverlay } from './bossOverlay';
import { bossBarsShownTo } from '../game/bossBars';
import { hsvToRgb } from '../core/math';
// (Stage 4: totems)
import { renderItemActivation, tickItemActivation } from './itemActivation';
// (spyglass)
import { renderSpyglassOverlay } from './spyglassOverlay';

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
  /** `animate`: vanilla animateOverlayMessageColor (a jukebox's "Now Playing", cycling through the colours) */
  actionBar: { text: string; time: number; animate?: boolean } | null = null;
  /** vanilla Gui.bossOverlay: the ender dragon's bar, a raid's */
  readonly bossOverlay = new BossHealthOverlay();

  /** vanilla Gui.setOverlayMessage (the action bar above the hotbar) */
  setOverlayMessage(text: string, animate = false): void {
    this.actionBar = { text, time: 60, animate };
  }

  /** (jukebox) vanilla Gui.setNowPlaying: record.nowPlaying, "Now Playing: <the song's description>", in cycling colours */
  setNowPlaying(description: string): void {
    this.setOverlayMessage(`Now Playing: ${description}`, true);
  }

  tick(game: Game): void {
    this.tickCount++;
    tickItemActivation();
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
    // (Stage 4: raids) and the raids' bars; (guests' boss bars) whatever boss event shows its bar to this game's own
    // player, a guest's host's among them (game/bossBars.ts); (the wither) its bars are a source there too
    this.bossOverlay.update(bossBarsShownTo(game.level, game.level.player, game.opts.renderDistance));
    this.bossOverlay.tickDarken();
  }

  addChat(text: string, tick: number): void {
    this.chat.push({ text, time: tick });
    if (this.chat.length > 100) this.chat.shift();
  }

  render(g: GuiGraphics, game: Game, partial: number, chatOpen: boolean): void {
    const p = game.player;
    const W = g.width, H = g.height;
    // (spyglass) vanilla Gui.renderCameraOverlays: the scope's view while scoping, first
    renderSpyglassOverlay(g, p, game.thirdPerson === 0);
    // (powder snow) vanilla Gui.renderCameraOverlays: frost round the screen's edges as the player freezes
    if (p.ticksFrozen > 0) g.sprite('powder_snow_outline', 0, 0, W, H, 0, 0, 256, 256, p.percentFrozen());
    // (Stage 4: totems) vanilla GameRenderer.renderItemActivation, drawn just before the HUD
    renderItemActivation(g, partial);
    if (p.gameMode === 'spectator') {
      if (!game.fingerAims()) this.renderCrosshair(g, game);
      this.renderEffects(g, game);
      this.bossOverlay.render(g);
      return;
    }
    const cx = Math.floor(W / 2);
    // crosshair
    // (fingers that touch the world where it is have none, as Bedrock's: game/touch.ts)
    if (!game.fingerAims()) this.renderCrosshair(g, game);
    // hotbar
    g.sprite('hotbar', cx - 91, H - 22, 182, 22);
    g.sprite('hotbar_selection', cx - 91 - 1 + p.inventory.selected * 20, H - 22 - 1, 24, 23);
    // vanilla Gui.renderItemHotbar: what the offhand holds sits in its own slot on the off arm's side
    const off = p.inventory.offhand;
    const offLeft = game.opts.mainHand !== 'left';
    if (off) g.sprite(offLeft ? 'hotbar_offhand_left' : 'hotbar_offhand_right', offLeft ? cx - 91 - 29 : cx + 91, H - 23, 29, 24);
    const slot = (s: ItemStack, x: number, y: number) => {
      // vanilla Gui.renderSlot: a stack that just took items in bounces, squeezed narrow and tall
      const pop = s.popTime - partial;
      if (pop > 0) {
        const f1 = 1 + pop / 5;
        g.pushScaleAbout(x + 8, y + 12, 1 / f1, (f1 + 1) / 2);
      }
      g.stack(s, x, y, p.useItem === s ? p.ticksUsingItem() : -1);
      if (pop > 0) g.popTransform();
      g.itemDecorations(s.count, s.damage, s.item.maxDamage, x, y);
      // vanilla item cooldown overlay (ender pearls, a knocked-down shield): the part of the cooldown left
      const cd = p.cooldowns.get(s.item.id);
      if (cd) {
        const f = Math.max(0, Math.min(1, (cd - partial) / (p.cooldownTotals.get(s.item.id) ?? 20)));
        const i1 = y + Math.floor(16 * (1 - f));
        g.fill(x, i1, x + 16, i1 + Math.ceil(16 * f), 0x7fffffff);
      }
    };
    for (let i = 0; i < 9; i++) {
      const s = p.inventory.main[i];
      if (s) slot(s, cx - 90 + i * 20 + 2, H - 16 - 3);
    }
    if (off) slot(off, offLeft ? cx - 91 - 26 : cx + 91 + 10, H - 16 - 3);
    const survival = p.gameMode === 'survival' || p.gameMode === 'adventure';
    // vanilla Gui.renderHotbarAndDecorations: on a mount that leaps, its jump bar in place of the experience bar (in
    // creative too); the mount's hearts whether or not the player's show
    const mount = p.jumpableVehicle();
    if (mount) this.renderJumpMeter(g, game, cx, mount);
    else if (survival) this.renderXp(g, game, cx);
    if (survival) this.renderHealthFood(g, game, cx, H);
    else this.renderVehicleHealth(g, game, cx + 91, H - 39);
    // selected item name
    if (this.toolHighlightTimer > 0 && p.inventory.selectedItem) {
      // vanilla Gui.renderSelectedItemName: coloured by rarity, italic when renamed
      const sel = p.inventory.selectedItem, rarity = sel.rarity();
      const italic = sel.tag?.customName !== undefined ? '§o' : '';
      const name = rarity === 'common' ? `${italic}${sel.displayName()}` : `§${RARITY_COLOR[rarity]}${italic}${sel.displayName()}`;
      const alpha = Math.min(255, Math.floor((this.toolHighlightTimer * 256) / 10)) / 255;
      const w = g.textWidth(name);
      const x = Math.floor((W - w) / 2);
      let y = H - 59;
      if (!survival) y += 14;
      g.text(name, x, y, 0xffffff, true, alpha);
    }
    this.renderEffects(g, game);
    this.bossOverlay.render(g);
    // vanilla Gui sleep overlay: darkens over 100 ticks asleep, clears over 10 after waking
    if (p.sleepCounter > 0) {
      let f = p.sleepCounter / 100;
      if (f > 1) f = 1 - (p.sleepCounter - 100) / 10;
      g.fill(0, 0, W, H, ((Math.floor(220 * f) << 24) | 0x101020) >>> 0);
    }
    // action bar
    // vanilla Gui overlay message: fades over its last 20 ticks
    if (this.actionBar) {
      const a = Math.min(255, Math.floor(((this.actionBar.time - partial) * 255) / 20));
      if (a > 8) {
        const w = g.textWidth(this.actionBar.text);
        // (jukebox) vanilla renderOverlayMessage: an animated one's colour is Mth.hsvToRgb(f / 50, 0.7, 0.6)
        const color = this.actionBar.animate ? hsvToRgb((this.actionBar.time - partial) / 50, 0.7, 0.6) : 0xffffff;
        g.text(this.actionBar.text, cx - Math.floor(w / 2), H - 72, color, true, a / 255);
      }
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
    const t = game.interaction.entityHit;
    const full = f >= 1 && !!t && t instanceof LivingEntity && t.isAlive && p.attackStrengthDelay() > 5;
    if (full) {
      // crosshair_attack_indicator_full: a small sword under the crosshair
      const x = Math.floor(g.width / 2 - 8), y = Math.floor(g.height / 2 - 7 + 16);
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      const px = (a: number, b: number) => g.fill(x + a, y + b, x + a + 1, y + b + 1, 0xffffffff);
      for (let i = 0; i < 6; i++) px(9 - i, 2 + i);
      for (let i = 0; i < 5; i++) px(10 - i, 2 + i);
      px(3, 6);
      px(4, 8);
      px(5, 9);
      px(2, 9);
      px(3, 10);
      ctx.restore();
    } else if (f < 1) {
      const x = Math.floor(g.width / 2 - 8), y = Math.floor(g.height / 2 - 7 + 16);
      const w = Math.floor(f * 17);
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      g.fill(x, y, x + 16, y + 4, 0x80ffffff);
      g.fill(x, y, x + Math.min(16, w), y + 4, 0xffffffff);
      ctx.restore();
    }
  }

  /** vanilla Gui.renderJumpMeter: the charge of the leap, filling as jump is held */
  private renderJumpMeter(g: GuiGraphics, game: Game, cx: number, mount: RideableJumping): void {
    const x = cx - 91, y = g.height - 32 + 3;
    g.sprite('jump_bar_background', x, y, 182, 5);
    const k = Math.floor(game.player.jumpRidingScale * 183);
    if (mount.jumpCooldown() > 0) g.sprite('jump_bar_cooldown', x, y, 182, 5);
    else if (k > 0) g.sprite('jump_bar_progress', x, y, k, 5, 0, 0, k, 5);
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

  /**
   * vanilla Gui.renderVehicleHealth: riding something alive, its hearts (up to 30) in rows of ten from the right edge
   * `rx`, stacking upwards from `y`, where the food bar would be; how many
   */
  private renderVehicleHealth(g: GuiGraphics, game: Game, rx: number, y: number): number {
    const p = game.player;
    const mount = p.vehicle instanceof LivingEntity ? p.vehicle : null;
    // (vanilla getVehicleMaxHearts)
    const mountHearts = mount ? Math.min(30, Math.floor((mount.maxHealth + 0.5) / 2)) : 0;
    if (!mount || mountHearts === 0) return 0;
    const mh = Math.ceil(mount.health);
    for (let left = mountHearts, j1 = 0, vy = y; left > 0; j1 += 20, vy -= 10) {
      const k = Math.min(left, 10);
      left -= k;
      for (let l1 = 0; l1 < k; l1++) {
        const hx = rx - l1 * 8 - 9;
        g.sprite('heart_vehicle_container', hx, vy, 9, 9);
        if (l1 * 2 + 1 + j1 < mh) g.sprite('heart_vehicle_full', hx, vy, 9, 9);
        if (l1 * 2 + 1 + j1 === mh) g.sprite('heart_vehicle_half', hx, vy, 9, 9);
      }
    }
    return mountHearts;
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
    // vanilla Gui.renderPlayerHealth: regeneration sends a bump along the hearts
    const regenHeart = p.hasEffect('regeneration') ? tick % Math.ceil(maxH + 5) : -1;
    // vanilla Gui.HeartType.forPlayer
    const type = p.hasEffect('poison') ? 'poisoned' : p.hasEffect('wither') ? 'withered' : '';
    // armor
    const armor = p.inventory.armorValue();
    if (armor > 0)
      for (let i = 0; i < 10; i++) {
        const x = lx + i * 8;
        if (i * 2 + 1 < armor) g.sprite('armor_full', x, armorY, 9, 9);
        else if (i * 2 + 1 === armor) g.sprite('armor_half', x, armorY, 9, 9);
        else g.sprite('armor_empty', x, armorY, 9, 9);
      }
    // hearts (vanilla Gui.renderHearts)
    const n = Math.ceil(maxH / 2);
    const na = Math.ceil(absorb / 2);
    const hardcore = false;
    const heart = (kind: string, half: boolean, blinking: boolean) => `heart${kind ? '_' + kind : ''}${hardcore ? '_hardcore' : ''}_${half ? 'half' : 'full'}${blinking ? '_blinking' : ''}`;
    for (let l = n + na - 1; l >= 0; l--) {
      const row = Math.floor(l / 10), col = l % 10;
      const hx = lx + col * 8;
      let hy = y - row * rowH;
      if (health + absorb <= 4) hy += Math.floor(this.rand.next() * 2);
      if (l < n && l === regenHeart) hy -= 2;
      g.sprite(blink ? 'heart_container_blinking' : 'heart_container', hx, hy, 9, 9);
      const i2 = l * 2;
      if (l >= n) {
        // absorption hearts turn black too while withering
        const a = i2 - n * 2;
        if (a < absorb) g.sprite(heart(type === 'withered' ? type : 'absorbing', a + 1 === absorb, false), hx, hy, 9, 9);
        continue;
      }
      if (blink && i2 < this.displayHealth) g.sprite(heart(type, i2 + 1 === this.displayHealth, true), hx, hy, 9, 9);
      if (i2 < health) g.sprite(heart(type, i2 + 1 === health, false), hx, hy, 9, 9);
    }
    const mountHearts = this.renderVehicleHealth(g, game, rx, y);
    if (mountHearts === 0) {
      // food (vanilla Gui.renderFood: green shanks while hungry)
      const food = p.food.level;
      const hunger = p.hasEffect('hunger') ? '_hunger' : '';
      for (let i = 0; i < 10; i++) {
        let fy = y;
        if (p.food.saturation <= 0 && tick % (food * 3 + 1) === 0) fy = y + Math.floor(this.rand.next() * 3) - 1;
        const fx = rx - i * 8 - 9;
        g.sprite('food_empty' + hunger, fx, fy, 9, 9);
        if (i * 2 + 1 < food) g.sprite('food_full' + hunger, fx, fy, 9, 9);
        if (i * 2 + 1 === food) g.sprite('food_half' + hunger, fx, fy, 9, 9);
      }
    }
    // air (above the mount's hearts if they stack higher)
    const maxAir = 300;
    if (p.eyeFluid === FLUID_WATER || p.air < maxAir) {
      const ay = y - 10 - Math.max(0, Math.ceil(mountHearts / 10) - 1) * 10;
      const full = Math.ceil(((p.air - 2) * 10) / maxAir);
      const partial = Math.ceil((p.air * 10) / maxAir) - full;
      for (let i = 0; i < full + partial; i++) {
        const bx = rx - i * 8 - 9;
        g.sprite(i < full ? 'air' : 'air_bursting', bx, ay, 9, 9);
      }
    }
  }

  /**
   * vanilla Gui.renderEffects: beneficial effects along the top-right edge, the rest in a row below,
   * longest first from the right; they fade and blink through their last 10 seconds. Hidden while an
   * inventory screen lists them beside itself.
   */
  private renderEffects(g: GuiGraphics, game: Game): void {
    const p = game.player;
    if (!p.activeEffects.size) return;
    if ((game.screen as { canSeeEffects?(): boolean } | null)?.canSeeEffects?.()) return;
    const icons: [string, number, number, number][] = [];
    let good = 0, bad = 0;
    // vanilla Ordering.natural().reverse()
    for (const inst of [...p.activeEffects.values()].sort((x, y) => compareEffects(y, x))) {
      if (!inst.showIcon) continue;
      let x = g.width, y = 1;
      if (inst.effect.category === 'beneficial') x -= 25 * ++good;
      else {
        x -= 25 * ++bad;
        y += 26;
      }
      let a = 1;
      if (inst.ambient) g.sprite('effect_background_ambient', x, y, 24, 24);
      else {
        g.sprite('effect_background', x, y, 24, 24);
        if (inst.endsWithin(200)) {
          const k = inst.duration, l = 10 - Math.trunc(k / 20);
          a = Math.max(0, Math.min(0.5, (k / 10 / 5) * 0.5)) + Math.cos((k * Math.PI) / 5) * Math.max(0, Math.min(0.25, (l / 10) * 0.25));
        }
      }
      icons.push(['mob_effect_' + inst.id, x + 3, y + 3, a]);
    }
    for (const [name, x, y, a] of icons) g.sprite(name, x, y, 18, 18, 0, 0, 18, 18, Math.max(0, a));
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
