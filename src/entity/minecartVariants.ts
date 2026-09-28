// (minecarts) The hopper, TNT and furnace minecarts (vanilla MinecartHopper, MinecartTNT and MinecartFurnace).
//
// A hopper minecart has a hopper's five slots and fills them as it goes: each tick it takes one item out of the
// bottom of a container in the block over it, or failing a container, picks up an item lying above it or beside it
// (it has no cooldown). A powered activator rail switches it off until it passes an unpowered one. Its items spill
// out when it breaks; a hopper under the rail takes them out of it.
//
// A TNT minecart lights with a hiss when it runs over a powered activator rail, or is set alight (fire, lava) or
// caught in a blast, and goes off four seconds later, harder the faster it's going; running into something fast,
// hit by a burning arrow or dropped three blocks or more, it goes off at once. Broken at speed (or by fire) it lights
// with a short fuse instead of dropping. Its blast leaves the rails (and what's under them) be.
//
// A furnace minecart burns coal or charcoal (three minutes a lump, up to 32000 ticks) and pushes itself along the
// track away from whoever fuelled it, smoking and lit, at up to 4 m/s (3 in water).

import { AbstractMinecart, AbstractMinecartContainer, registerMinecartType } from './minecart';
import { ItemEntity } from './itemEntity';
import type { Entity } from './entity';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import type { Level } from '../game/level';
import { AABB } from '../core/aabb';
import { getBlock } from '../world/block';
import { DOWN } from '../world/dir';
import { isRail } from '../game/rails';
import { explode } from '../game/explosion';
// (loaded before dispenser.ts, which it loads: hopper.ts adds to dispenser.ts's list of containers as it loads, so
// dispenser.ts, which leads round to hopper.ts, has to be loaded by way of it, not first)
import '../game/redstone/hopper';
import { containerAt, insertItem, slotsOf, takeOneFrom, type InsertTarget } from '../game/redstone/dispenser';

// ---------------------------------------------------------------------------
// the hopper minecart

/** vanilla Hopper.SUCK_AABB, over the cart (vanilla getLevelY: half a block up): from 11 pixels up to two blocks */
const SUCK_MIN_Y = 11 / 16, SUCK_MAX_Y = 2;

/** vanilla HopperBlockEntity.addItem(Container, ItemEntity): as much of it as fits; true if it all went in */
function addItem(into: InsertTarget, e: ItemEntity): boolean {
  if (e.removed || !e.stack || e.stack.count <= 0) return false;
  const left = insertItem(into, e.stack.copy(), null);
  if (!left) {
    e.stack.count = 0;
    e.remove();
    return true;
  }
  e.stack = left;
  return false;
}

export class MinecartHopper extends AbstractMinecartContainer {
  readonly type = 'hopper_minecart';
  /** vanilla enabled (Enabled): off while it's been over a powered activator rail */
  enabled = true;
  /** the cart as what the items go into (vanilla's Hopper as a Container) */
  private readonly into: InsertTarget;

  constructor(level: Level) {
    super(level, 5);
    this.into = { container: this.container };
  }

  dropItem(): string {
    return 'hopper_minecart';
  }

  /** vanilla getDefaultDisplayBlockState: a hopper (pointing down), a pixel up */
  override displayState(): number {
    return getBlock('hopper').defaultState;
  }

  override displayOffset(): number {
    return 1;
  }

  /** vanilla activateMinecart: on while the rail isn't powered */
  override activateMinecart(_x: number, _y: number, _z: number, powered: boolean): void {
    this.enabled = !powered;
  }

  override tick(): void {
    super.tick();
    if (!this.removed && this.enabled) this.suckInItems();
  }

  /**
   * vanilla MinecartHopper.suckInItems: what a hopper takes in from over it (suckFromAbove), else an item lying right
   * beside it
   */
  suckInItems(): boolean {
    if (this.suckFromAbove()) return true;
    for (const e of this.itemsIn(this.bb.inflate(0.25, 0, 0.25))) if (addItem(this.into, e)) return true;
    return false;
  }

  /**
   * vanilla HopperBlockEntity.suckInItems, for a hopper that isn't on the block grid (nothing over it blocks it): one
   * item out of the bottom of the container in the block a block and a half over it; with none there, an item lying
   * in the two blocks over it
   */
  private suckFromAbove(): boolean {
    const source = containerAt(this.level, Math.floor(this.x), Math.floor(this.y + 1.5), Math.floor(this.z));
    if (source) {
      for (const i of slotsOf(source, DOWN)) if (takeOneFrom(source, i, this.into)) return true;
      return false;
    }
    const above = new AABB(this.x - 0.5, this.y + SUCK_MIN_Y, this.z - 0.5, this.x + 0.5, this.y + SUCK_MAX_Y, this.z + 0.5);
    for (const e of this.itemsIn(above)) if (addItem(this.into, e)) return true;
    return false;
  }

  private itemsIn(box: AABB): ItemEntity[] {
    return this.level.getEntities(box, (e) => e instanceof ItemEntity && !e.removed) as ItemEntity[];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Enabled: this.enabled };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.enabled = d.Enabled !== false;
  }
}

// ---------------------------------------------------------------------------
// the TNT minecart

/** vanilla MinecartTNT's fuse once lit (80 ticks) */
const FUSE = 80;
/** vanilla #is_fire and #is_explosion: the damage that lights it (damageSourceIgnitesTnt) */
const IGNITES = new Set(['inFire', 'onFire', 'lava', 'hotFloor', 'campfire', 'fireball', 'unattributedFireball', 'explosion', 'playerExplosion', 'fireworks', 'badRespawnPoint']);
/** the entities that are vanilla Projectiles (whose burning sets it off at once) */
const PROJECTILES = new Set(['arrow', 'spectral_arrow', 'trident', 'snowball', 'egg', 'ender_pearl', 'potion', 'experience_bottle', 'fireball', 'small_fireball', 'dragon_fireball', 'wither_skull', 'firework_rocket', 'llama_spit', 'shulker_bullet', 'wind_charge', 'breeze_wind_charge']);

export class MinecartTNT extends AbstractMinecart {
  readonly type = 'tnt_minecart';
  /** vanilla fuse (TNTFuse): ticks till it goes off, -1 while it isn't lit */
  fuse = -1;
  /** who set it off, for the blast's credit (a burning arrow's shooter; game/explosion.ts reads an `owner`) */
  owner: Entity | null = null;

  dropItem(): string {
    return 'tnt_minecart';
  }

  /** vanilla getDefaultDisplayBlockState: a block of TNT */
  override displayState(): number {
    return getBlock('tnt').defaultState;
  }

  /** vanilla isPrimed */
  isPrimed(): boolean {
    return this.fuse > -1;
  }

  /** vanilla primeFuse: lit, four seconds to go, with the TNT's hiss */
  primeFuse(): void {
    this.fuse = FUSE;
    this.level.sound.play('entity.tnt.primed', this.x, this.y, this.z, 1, 1);
  }

  /** vanilla tick: the fuse burns down (smoking), and at 0 it goes off; running into something at speed, it goes off */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.fuse > 0) {
      this.fuse--;
      this.level.particles.spawn?.('smoke', this.x, this.y + 0.5, this.z, 0, 0, 0);
    } else if (this.fuse === 0) this.explode(this.dx * this.dx + this.dz * this.dz);
    if (!this.removed && this.horizontalCollision) {
      const d = this.dx * this.dx + this.dz * this.dz;
      if (d >= 0.01) this.explode(d);
    }
  }

  /** vanilla hurt: a burning projectile sets it off at once (its blast credited to the shooter), before the blow counts */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (direct && PROJECTILES.has(direct.type) && direct.isOnFire()) {
      this.owner = attacker && attacker !== direct ? attacker : null;
      this.explode(direct.dx * direct.dx + direct.dy * direct.dy + direct.dz * direct.dz);
    }
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla shouldSourceDestroy: fire and blasts break it (so it lights) whatever its damage */
  protected override shouldSourceDestroy(source: string): boolean {
    return IGNITES.has(source);
  }

  /** vanilla destroy: broken at rest (not by fire or a blast), it drops as an item; else it lights with a short fuse */
  override destroy(source?: string): void {
    const d = this.dx * this.dx + this.dz * this.dz;
    if (!(source !== undefined && IGNITES.has(source)) && !(d >= 0.01)) {
      super.destroy(source);
      return;
    }
    if (this.fuse < 0) {
      this.primeFuse();
      this.fuse = this.level.random.nextInt(20) + this.level.random.nextInt(20);
    }
  }

  /** vanilla explode: power 4, and up to 1.5 × its speed (at most 5) more, as TNT's (every block drops) */
  explode(speedSq: number): void {
    if (this.level.isClientSide || this.removed) return;
    const d0 = Math.min(Math.sqrt(speedSq), 5);
    explode(this.level, this, this.x, this.y, this.z, 4 + this.level.random.nextFloat() * 1.5 * d0, false, 'tnt');
    this.remove();
  }

  /** vanilla causeFallDamage: landing from three blocks or more sets it off (harder the higher) */
  protected override causeFallDamage(dist: number): void {
    if (dist >= 3) {
      const f = dist / 10;
      this.explode(f * f);
    }
    super.causeFallDamage(dist);
  }

  /** vanilla activateMinecart: a powered activator rail lights it */
  override activateMinecart(_x: number, _y: number, _z: number, powered: boolean): void {
    if (powered && this.fuse < 0) this.primeFuse();
  }

  /**
   * vanilla getBlockExplosionResistance / shouldBlockExplode, once it's lit (game/explosion.ts): the rails, and the
   * blocks under rails, neither stop its blast nor are blown up by it
   */
  explosionSpares(x: number, y: number, z: number, st: number): boolean {
    return this.isPrimed() && (isRail(st) || isRail(this.level.getState(x, y + 1, z)));
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { TNTFuse: this.fuse };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    if (typeof d.TNTFuse === 'number') this.fuse = d.TNTFuse;
  }
}

// ---------------------------------------------------------------------------
// the furnace minecart

/** vanilla MinecartFurnace: a lump's burn, and the most it holds */
const FUEL_PER_ITEM = 3600, MAX_FUEL = 32000;

export class MinecartFurnace extends AbstractMinecart {
  readonly type = 'furnace_minecart';
  /** vanilla fuel (Fuel): ticks of burning left */
  fuel = 0;
  /** vanilla xPush, zPush (PushX, PushZ): the way it pushes itself */
  xPush = 0;
  zPush = 0;
  /** vanilla DATA_ID_FUEL (hasFuel): lit, and smoking */
  lit = false;

  dropItem(): string {
    return 'furnace_minecart';
  }

  /** vanilla getDefaultDisplayBlockState: a furnace facing north, lit while it has fuel */
  override displayState(): number {
    return getBlock('furnace').state({ facing: 'north', lit: this.lit });
  }

  /** vanilla getMaxSpeed: 4 m/s, 3 in water */
  protected override maxSpeed(): number {
    return (this.inWater ? 3 : 4) / 20;
  }

  /** vanilla tick: the fuel burns down (and with none, it stops pushing); lit, it smokes now and then */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.fuel > 0) this.fuel--;
    if (this.fuel <= 0) {
      this.xPush = 0;
      this.zPush = 0;
    }
    this.lit = this.fuel > 0;
    if (this.lit && this.level.random.nextInt(4) === 0) this.level.particles.spawn?.('large_smoke', this.x, this.y + 0.8, this.z, 0, 0, 0);
  }

  /** vanilla moveAlongTrack: its push turned to the way the track took it */
  protected override moveAlongTrack(bx: number, by: number, bz: number, st: number): void {
    super.moveAlongTrack(bx, by, bz, st);
    const d2 = this.dx * this.dx + this.dz * this.dz;
    const d3 = this.xPush * this.xPush + this.zPush * this.zPush;
    if (d3 > 1e-4 && d2 > 0.001) {
      const d4 = Math.sqrt(d2), d5 = Math.sqrt(d3);
      this.xPush = (this.dx / d4) * d5;
      this.zPush = (this.dz / d4) * d5;
    }
  }

  /** vanilla applyNaturalSlowdown: pushing, it keeps four fifths of its speed and adds its push (a tenth in water); else 2% off */
  protected override applyNaturalSlowdown(): void {
    let d0 = this.xPush * this.xPush + this.zPush * this.zPush;
    if (d0 > 1e-7) {
      d0 = Math.sqrt(d0);
      this.xPush /= d0;
      this.zPush /= d0;
      const k = this.inWater ? 0.1 : 1;
      this.dx = (this.dx * 0.8 + this.xPush) * k;
      this.dz = (this.dz * 0.8 + this.zPush) * k;
      this.dy = 0;
    } else {
      this.dx *= 0.98;
      this.dy = 0;
      this.dz *= 0.98;
    }
    super.applyNaturalSlowdown();
  }

  /**
   * vanilla MinecartFurnace.interact: coal or charcoal adds three minutes' fuel (one used, none in creative) while it
   * has room; with fuel, it pushes off away from whoever clicked it. Always a success (the hand swings)
   */
  playerInteract(p: Player, stack: ItemStack | null): boolean {
    if (stack && (stack.item.id === 'coal' || stack.item.id === 'charcoal') && this.fuel + FUEL_PER_ITEM <= MAX_FUEL) {
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      this.fuel += FUEL_PER_ITEM;
    }
    if (this.fuel > 0) {
      this.xPush = this.x - p.x;
      this.zPush = this.z - p.z;
    }
    return true;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { PushX: this.xPush, PushZ: this.zPush, Fuel: this.fuel };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.xPush = Number(d.PushX ?? 0) || 0;
    this.zPush = Number(d.PushZ ?? 0) || 0;
    this.fuel = Math.max(0, Math.min(MAX_FUEL, Number(d.Fuel ?? 0) | 0));
    this.lit = this.fuel > 0;
  }
}

registerMinecartType('hopper_minecart', (l) => new MinecartHopper(l));
registerMinecartType('tnt_minecart', (l) => new MinecartTNT(l));
registerMinecartType('furnace_minecart', (l) => new MinecartFurnace(l));
