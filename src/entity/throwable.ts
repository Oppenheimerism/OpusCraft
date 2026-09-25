// Thrown items (vanilla ThrowableItemProjectile: ThrownEgg, Snowball,
// ThrownEnderpearl): arc flight, entity/block hits and their effects.

import { Entity } from './entity';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import { clipBlocks, type SegmentHit } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { ItemStack, ITEMS } from '../item/item';
import { Chicken } from './animals';
import type { Player } from './player';
import { projectileShot, projectileLandedOn, projectileLandedAt } from '../game/vibrations';

const RAD = 180 / Math.PI;

export type ThrownKind = 'egg' | 'snowball' | 'ender_pearl' | 'potion';

export class ThrownItem extends Entity {
  readonly type: string;
  owner: Entity | null;
  private leftOwner = false;
  readonly stack: ItemStack;

  /** `stack`: what it looks like, and carries (a thrown potion's contents); by default one of the kind's item */
  constructor(level: Level, readonly kind: ThrownKind, owner: LivingEntity | null, stack?: ItemStack) {
    super(level);
    this.type = kind;
    this.owner = owner;
    this.setSize(0.25, 0.25);
    this.stack = stack ?? new ItemStack(ITEMS.get(kind === 'potion' ? 'splash_potion' : kind)!, 1);
    if (owner) this.moveTo(owner.x, owner.y + owner.eyeHeight - 0.1, owner.z, owner.yaw, owner.pitch);
  }

  /** vanilla getDefaultGravity: 0.03 for thrown items (a potion's 0.05) */
  protected gravity(): number {
    return 0.03;
  }

  /** vanilla Projectile.shootFromRotation: along the look, `zOff` degrees up, carrying the shooter's own motion */
  shootFromRotation(shooter: Entity, xRot: number, yRot: number, zOff: number, velocity: number, inaccuracy: number): void {
    const x = -Math.sin(yRot / RAD) * Math.cos(xRot / RAD);
    const y = -Math.sin((xRot + zOff) / RAD);
    const z = Math.cos(yRot / RAD) * Math.cos(xRot / RAD);
    this.shoot(x, y, z, velocity, inaccuracy);
    this.dx += shooter.x - shooter.xo;
    this.dy += shooter.onGround ? 0 : shooter.y - shooter.yo;
    this.dz += shooter.z - shooter.zo;
  }

  /** vanilla Projectile.shoot: off along (x, y, z) at `velocity`, a little astray (a triangle spread of `inaccuracy`) */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const tri = () => 0.0172275 * inaccuracy * (Math.random() - Math.random());
    x = (x / l + tri()) * velocity;
    y = (y / l + tri()) * velocity;
    z = (z / l + tri()) * velocity;
    this.dx = x;
    this.dy = y;
    this.dz = z;
    this.yaw = this.yawO = Math.atan2(x, z) * RAD;
    this.pitch = this.pitchO = Math.atan2(y, Math.sqrt(x * x + z * z)) * RAD;
  }

  override tick(): void {
    // (vanilla Projectile.tick: the throw is a game event)
    projectileShot(this);
    this.baseTick();
    // (held at an end gateway while the far side loads: nothing more this tick)
    if (this.level.inTransit.has(this)) return;
    if (!this.leftOwner) {
      const o = this.owner;
      this.leftOwner = !o || !o.bb.intersects(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1));
    }
    const w = this.level.world;
    const x0 = this.x, y0 = this.y, z0 = this.z;
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const bh = clipBlocks(w, x0, y0, z0, x1, y1, z1);
    if (bh) {
      x1 = bh.px;
      y1 = bh.py;
      z1 = bh.pz;
    }
    // entity hits (vanilla ProjectileUtil.getEntityHitResult, margin 0.3)
    let hit: Entity | null = null, best = Infinity;
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    for (const e of this.level.getEntities(box, (e) => (e instanceof LivingEntity || e.type === 'end_crystal' || e.type === 'ender_dragon' || e.type === 'item_frame' || e.type === 'glow_item_frame') && e.isPickable(), this)) {
      if (e === this.owner && !this.leftOwner) continue;
      if (e.type === 'player' && (e as Player).gameMode === 'spectator') continue;
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < best) {
        best = h.t;
        hit = e;
      }
    }
    if (hit) {
      this.onHitEntity(hit);
      projectileLandedOn(this, hit);
      this.onHit(hit.x, hit.y, hit.z, hit);
      return;
    }
    if (bh) {
      onProjectileHit(this.level, bh.x, bh.y, bh.z, bh, this);
      this.onHitBlock(bh);
      projectileLandedAt(this, bh.x, bh.y, bh.z);
      this.onHit(bh.px, bh.py, bh.pz, null);
      return;
    }
    // vanilla ThrowableProjectile.tick: what it's in has its say (an end gateway takes it through)
    this.checkInsideBlocks();
    if (this.removed) return;
    const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
    this.yaw = Math.atan2(this.dx, this.dz) * RAD;
    this.pitch = Math.atan2(this.dy, h) * RAD;
    let f = 0.99;
    if (this.inWater) f = 0.8;
    const nx = x1, ny = y1, nz = z1;
    this.dx *= f;
    this.dy *= f;
    this.dz *= f;
    this.dy -= this.gravity();
    this.setPos(nx, ny, nz);
  }

  protected onHitEntity(e: Entity): void {
    // snowballs hurt blazes for 3; everything else takes 0 (knockback + hurt flash)
    const dmg = this.kind === 'snowball' && e.type === 'blaze' ? 3 : 0;
    e.hurt(dmg, 'thrown', this.owner ?? this, this);
  }

  /** vanilla onHitBlock (after the block's own onProjectileHit) */
  protected onHitBlock(_hit: SegmentHit): void {}

  /** vanilla onHit: whatever it hit, `entity` when that was an entity */
  protected onHit(_x: number, _y: number, _z: number, _entity: Entity | null): void {
    const lvl = this.level;
    if (this.kind === 'egg') {
      // vanilla ThrownEgg.onHit: 1/8 chance of a chick (1/32 of those: four)
      if (Math.random() * 8 < 1) {
        const n = Math.random() * 32 < 1 ? 4 : 1;
        for (let j = 0; j < n; j++) {
          const c = new Chicken(lvl);
          c.setAge(-24000);
          c.moveTo(this.x, this.y, this.z, this.yaw, 0);
          lvl.addEntity(c);
        }
      }
      for (let i = 0; i < 8; i++) lvl.particles.spawn?.('item_egg', this.x, this.y, this.z, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
    } else if (this.kind === 'snowball') {
      for (let i = 0; i < 8; i++) lvl.particles.spawn?.('item_snowball', this.x, this.y, this.z, 0, 0, 0);
    } else if (this.kind === 'ender_pearl') {
      for (let i = 0; i < 32; i++) lvl.particles.spawn?.('portal', this.x, this.y + Math.random() * 2, this.z, Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
      const o = this.owner;
      if (o instanceof LivingEntity && o.isAlive) {
        // vanilla teleports to the pearl's position at the start of the impact tick
        o.moveTo(this.x, this.y, this.z, o.yaw, o.pitch);
        o.fallDistance = 0;
        o.dx = o.dy = o.dz = 0;
        o.hurt(5, 'fall');
        lvl.sound.play('entity.player.teleport', this.x, this.y, this.z, 1, 1);
      }
    }
    this.remove();
  }

  override hurt(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
