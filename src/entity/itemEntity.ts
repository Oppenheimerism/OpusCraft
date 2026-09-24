// Dropped item entity (vanilla ItemEntity physics, pickup, merging).

import { Entity } from './entity';
import { ItemStack } from '../item/item';
import type { Level } from '../game/level';
import type { Player } from './player';

export class ItemEntity extends Entity {
  readonly type = 'item';
  pickupDelay = 10;
  age = 0;
  health = 5;
  bobOffset = Math.random() * Math.PI * 2;
  /** who threw it (vanilla ItemEntity.thrower: a player's Q or click-out drop) */
  thrower: Entity | null = null;

  constructor(level: Level, public stack: ItemStack) {
    super(level);
    this.setSize(0.25, 0.25);
  }

  static drop(level: Level, x: number, y: number, z: number, stack: ItemStack): ItemEntity {
    // vanilla Block.popResource: random offset within the block, random motion
    const e = new ItemEntity(level, stack);
    const h = 0.25 / 2;
    const px = x + 0.5 + (Math.random() - 0.5) * 0.5;
    const py = y + 0.5 + (Math.random() - 0.5) * 0.5 - h;
    const pz = z + 0.5 + (Math.random() - 0.5) * 0.5;
    e.moveTo(px, py, pz, Math.random() * 360, 0);
    e.dx = Math.random() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = Math.random() * 0.2 - 0.1;
    level.addEntity(e);
    return e;
  }

  override tick(): void {
    this.baseTick();
    if (this.pickupDelay > 0 && this.pickupDelay !== 32767) this.pickupDelay--;
    const inWaterTop = this.inWater && this.fluidHeightWater > 0.1;
    if (inWaterTop) {
      // float up (vanilla setUnderwaterMovement)
      this.dx *= 0.99;
      this.dy += this.dy < 0.06 ? 5.0e-4 : 0;
      this.dz *= 0.99;
    } else if (this.inLava) {
      this.dx *= 0.95;
      this.dy += this.dy < 0.06 ? 5.0e-4 : 0;
      this.dz *= 0.95;
    } else {
      this.dy -= 0.04;
    }
    if (!this.onGround || this.dx * this.dx + this.dz * this.dz > 1e-5 || (this.tickCount + this.id) % 4 === 0) {
      this.move(this.dx, this.dy, this.dz);
      let f = 0.98;
      if (this.onGround) f = this.blockFriction() * 0.98;
      this.dx *= f;
      this.dy *= 0.98;
      this.dz *= f;
      if (this.onGround && this.dy < 0) this.dy *= -0.5;
    }
    this.age++;
    if (this.age >= 6000) this.remove();
    // merge with nearby identical stacks
    if (this.tickCount % 40 === 0) this.tryMerge();
    // pickup
    const p = this.level.player;
    if (p && p.health > 0 && this.pickupDelay === 0 && p.gameMode !== 'spectator') {
      const bb = p.bb.inflate(1, 0.5, 1);
      if (bb.intersects(this.bb)) this.playerTouch(p);
    }
  }

  private tryMerge(): void {
    for (const e of this.level.entities) {
      if (e === this || e.removed || !(e instanceof ItemEntity)) continue;
      if (Math.abs(e.x - this.x) > 0.5 || Math.abs(e.y - this.y) > 0.5 || Math.abs(e.z - this.z) > 0.5) continue;
      if (!e.stack.sameItem(this.stack)) continue;
      if (e.stack.count + this.stack.count > this.stack.maxStack) continue;
      e.stack.count += this.stack.count;
      e.pickupDelay = Math.max(e.pickupDelay, this.pickupDelay);
      e.age = Math.min(e.age, this.age);
      this.remove();
      return;
    }
  }

  /** vanilla ItemEntity.hurt: fire, lava, cacti and explosions wear the item away */
  override hurt(amount: number, source: string): boolean {
    if (this.removed) return false;
    if (this.stack.item.id === 'nether_star' && (source === 'explosion' || source === 'playerExplosion')) return false;
    this.health = Math.floor(this.health - amount);
    if (this.health <= 0) this.remove();
    return true;
  }

  /** vanilla ItemEntity.playerTouch: into the inventory if any of it fits (in creative it all goes regardless) */
  playerTouch(p: Player): void {
    const before = this.stack.count;
    const rem = p.inventory.add(this.stack, p.gameMode === 'creative');
    if (rem >= before) return;
    p.take(this, before);
    this.stack.count = rem;
    if (rem <= 0) this.remove();
  }

  /** vanilla ItemEntity.copy: where it lies, as it looks now (what a pickup shows flying off) */
  copy(): ItemEntity {
    const e = new ItemEntity(this.level, this.stack.copy());
    e.moveTo(this.x, this.y, this.z, this.yaw, this.pitch);
    e.age = this.age;
    e.bobOffset = this.bobOffset;
    return e;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
