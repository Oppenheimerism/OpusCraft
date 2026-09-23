// Arrows (vanilla AbstractArrow / Arrow): flight, sticking into blocks,
// entity hits with velocity-scaled damage, critical arrows, the bow's enchantments, pickup.

import { Entity } from './entity';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import { clipBlocks } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { AABB } from '../core/aabb';
import { COLLISION } from '../world/block';
import { ItemStack, ITEMS } from '../item/item';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { damageBonus, levelOf } from '../item/enchantHelper';
import { doPostAttackEffects } from '../game/enchantEffects';

const RAD = 180 / Math.PI;

export type Pickup = 'disallowed' | 'allowed' | 'creative_only';

export class Arrow extends Entity {
  readonly type = 'arrow';
  owner: Entity | null = null;
  private leftOwner = false;
  inGround = false;
  inGroundTime = 0;
  life = 0;
  shakeTime = 0;
  private lastState = -1;
  baseDamage = 2;
  crit = false;
  pickup: Pickup = 'disallowed';
  /** vanilla firedFromWeapon: the bow it was shot from (power, punch) */
  weapon: ItemStack | null = null;
  private readonly rnd = Math.random;

  constructor(level: Level, owner?: LivingEntity | null) {
    super(level);
    this.setSize(0.5, 0.5);
    if (owner) {
      this.owner = owner;
      this.moveTo(owner.x, owner.y + owner.eyeHeight - 0.1, owner.z, owner.yaw, owner.pitch);
      if (owner.type === 'player') this.pickup = 'allowed';
    }
  }

  override get eyeHeight(): number {
    return 0.13;
  }

  /** vanilla Projectile.shoot */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const tri = () => 0.0172275 * inaccuracy * (this.rnd() - this.rnd());
    const vx = (x / l + tri()) * velocity, vy = (y / l + tri()) * velocity, vz = (z / l + tri()) * velocity;
    this.dx = vx;
    this.dy = vy;
    this.dz = vz;
    const h = Math.sqrt(vx * vx + vz * vz);
    this.yaw = Math.atan2(vx, vz) * RAD;
    this.pitch = Math.atan2(vy, h) * RAD;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
  }

  /** vanilla Projectile.shootFromRotation (adds the shooter's motion) */
  shootFromRotation(shooter: Entity, xRot: number, yRot: number, zOff: number, velocity: number, inaccuracy: number): void {
    const f = -Math.sin(yRot / RAD) * Math.cos(xRot / RAD);
    const f1 = -Math.sin((xRot + zOff) / RAD);
    const f2 = Math.cos(yRot / RAD) * Math.cos(xRot / RAD);
    this.shoot(f, f1, f2, velocity, inaccuracy);
    this.dx += shooter.x - shooter.xo;
    this.dz += shooter.z - shooter.zo;
    if (!shooter.onGround) this.dy += shooter.y - shooter.yo;
  }

  /** vanilla setBaseDamageFromMob */
  setBaseDamageFromMob(velocity: number, difficulty: number): void {
    this.baseDamage = velocity * 2 + difficulty * 0.11 + 0.57425 * (this.rnd() - this.rnd());
  }

  override tick(): void {
    this.baseTick();
    const w = this.level.world;
    if (this.pitchO === 0 && this.yawO === 0) {
      const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      this.yaw = this.yawO = Math.atan2(this.dx, this.dz) * RAD;
      this.pitch = this.pitchO = Math.atan2(this.dy, h) * RAD;
    }
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const st = w.getState(bx, by, bz);
    const boxes = COLLISION[st];
    if (boxes && boxes.length) {
      for (const b of boxes) {
        if (new AABB(bx + b[0], by + b[1], bz + b[2], bx + b[3], by + b[4], bz + b[5]).contains(this.x, this.y, this.z)) {
          this.inGround = true;
          break;
        }
      }
    }
    if (this.shakeTime > 0) this.shakeTime--;
    if (this.inWater) this.clearFire();
    if (this.inGround) {
      if (this.lastState !== st && this.shouldFall()) {
        this.inGround = false;
        this.dx *= this.rnd() * 0.2;
        this.dy *= this.rnd() * 0.2;
        this.dz *= this.rnd() * 0.2;
        this.life = 0;
      } else if (++this.life >= 1200) this.remove();
      this.inGroundTime++;
      return;
    }
    this.inGroundTime = 0;
    if (!this.leftOwner) this.leftOwner = this.checkLeftOwner();
    const x0 = this.x, y0 = this.y, z0 = this.z;
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const blockHit = clipBlocks(w, x0, y0, z0, x1, y1, z1);
    if (blockHit) {
      x1 = blockHit.px;
      y1 = blockHit.py;
      z1 = blockHit.pz;
    }
    const ent = this.findHitEntity(x0, y0, z0, x1, y1, z1);
    if (ent) this.onHitEntity(ent);
    else if (blockHit) {
      onProjectileHit(this.level, blockHit.x, blockHit.y, blockHit.z);
      this.onHitBlock(blockHit.px, blockHit.py, blockHit.pz, w.getState(blockHit.x, blockHit.y, blockHit.z));
    }
    if (this.removed) return;
    const vx = this.dx, vy = this.dy, vz = this.dz;
    if (this.crit) {
      for (let i = 0; i < 4; i++) this.level.particles.spawn?.('crit', this.x + (vx * i) / 4, this.y + (vy * i) / 4, this.z + (vz * i) / 4, -vx, -vy + 0.2, -vz);
    }
    const nx = this.x + vx, ny = this.y + vy, nz = this.z + vz;
    const h = Math.sqrt(vx * vx + vz * vz);
    this.yaw = lerpRotation(this.yawO, Math.atan2(vx, vz) * RAD);
    this.pitch = lerpRotation(this.pitchO, Math.atan2(vy, h) * RAD);
    let f = 0.99;
    if (this.inWater) {
      for (let j = 0; j < 4; j++) this.level.particles.spawn?.('bubble', nx - vx * 0.25, ny - vy * 0.25, nz - vz * 0.25, vx, vy, vz);
      f = 0.6;
    }
    this.dx *= f;
    this.dy *= f;
    this.dz *= f;
    this.dy -= 0.05;
    this.setPos(nx, ny, nz);
    // vanilla: an arrow flying through fire catches alight; water and rain put it out
    this.checkInsideBlocks();
    if (this.isInWaterOrRainNow()) this.clearFire();
  }

  private shouldFall(): boolean {
    const b = new AABB(this.x - 0.06, this.y - 0.06, this.z - 0.06, this.x + 0.06, this.y + 0.06, this.z + 0.06);
    return this.collisionBoxes(b).length === 0;
  }

  private checkLeftOwner(): boolean {
    const o = this.owner;
    if (!o) return true;
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    return !o.bb.intersects(box);
  }

  private canHit(e: Entity): boolean {
    if (!(e instanceof LivingEntity) || !e.isPickable()) return false;
    if (e === this.owner && !this.leftOwner) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    return true;
  }

  private findHitEntity(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Entity | null {
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.level.getEntities(box, (e) => this.canHit(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (!h) continue;
      if (h.t < bd) {
        bd = h.t;
        best = e;
      }
    }
    return best;
  }

  private onHitEntity(e: Entity): void {
    const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy + this.dz * this.dz);
    // vanilla EnchantmentHelper.modifyDamage with the bow: power (+0.5·L + 0.5 for arrows) and any damage enchantment
    let base = this.baseDamage;
    const power = levelOf(this.weapon, 'power');
    if (this.weapon) base += damageBonus(this.weapon, e) + (power > 0 ? 0.5 * power + 0.5 : 0);
    let dmg = Math.ceil(Math.max(0, speed * base));
    if (this.crit) dmg = Math.min(dmg + Math.floor(this.rnd() * (Math.floor(dmg / 2) + 2)), 2147483647);
    const owner = this.owner;
    if (owner instanceof LivingEntity && e instanceof LivingEntity) owner.lastHurtMob = e;
    const fire = e.remainingFireTicks;
    if (this.isOnFire() && e.type !== 'enderman') e.igniteForSeconds(5);
    if (e.hurt(dmg, 'arrow', owner ?? this, this)) {
      if (owner && owner === this.level.player) this.level.onPlayerArrowHit?.(e);
      if (e.type === 'enderman') return;
      if (e instanceof LivingEntity) {
        this.doKnockback(e);
        // the victim's thorns hurt the shooter
        doPostAttackEffects(e, owner, this.weapon, false);
      }
      this.level.sound.play('entity.arrow.hit', this.x, this.y, this.z, 1, 1.2 / (this.rnd() * 0.2 + 0.9));
      this.remove();
    } else {
      e.remainingFireTicks = fire;
      // deflect
      this.dx *= -0.1;
      this.dy *= -0.1;
      this.dz *= -0.1;
      this.yaw += 180;
      this.yawO += 180;
      if (this.dx * this.dx + this.dy * this.dy + this.dz * this.dz < 1e-7) {
        if (this.pickup === 'allowed') this.dropAsItem();
        this.remove();
      }
    }
  }

  /** vanilla AbstractArrow.doKnockback: punch pushes along the flight, 0.6 per level, less knockback resistance */
  private doKnockback(e: LivingEntity): void {
    const f = levelOf(this.weapon, 'punch');
    if (f <= 0) return;
    const d1 = Math.max(0, 1 - e.knockbackResistance());
    const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
    if (h > 0 && d1 > 0) e.push((this.dx / h) * f * 0.6 * d1, 0.1, (this.dz / h) * f * 0.6 * d1);
  }

  private dropAsItem(): void {
    const it = ITEMS.get('arrow');
    if (!it) return;
    const e = new ItemEntity(this.level, new ItemStack(it, 1));
    e.moveTo(this.x, this.y + 0.1, this.z, Math.random() * 360, 0);
    e.dx = Math.random() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = Math.random() * 0.2 - 0.1;
    this.level.addEntity(e);
  }

  private onHitBlock(px: number, py: number, pz: number, st: number): void {
    this.lastState = st;
    const vx = px - this.x, vy = py - this.y, vz = pz - this.z;
    this.dx = vx;
    this.dy = vy;
    this.dz = vz;
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    this.setPos(this.x - (vx / l) * 0.05, this.y - (vy / l) * 0.05, this.z - (vz / l) * 0.05);
    this.level.sound.play('entity.arrow.hit', this.x, this.y, this.z, 1, 1.2 / (this.rnd() * 0.2 + 0.9));
    this.inGround = true;
    this.shakeTime = 7;
    this.crit = false;
  }

  /** vanilla AbstractArrow.playerTouch */
  playerTouch(p: Player): boolean {
    if (!this.inGround || this.shakeTime > 0) return false;
    let ok = false;
    if (this.pickup === 'allowed') {
      const it = ITEMS.get('arrow');
      ok = !!it && p.inventory.add(new ItemStack(it, 1)) === 0;
    } else if (this.pickup === 'creative_only') ok = p.gameMode === 'creative';
    if (ok) this.remove();
    return ok;
  }
}

/** vanilla Projectile.lerpRotation */
function lerpRotation(prev: number, cur: number): number {
  while (cur - prev < -180) prev -= 360;
  while (cur - prev >= 180) prev += 360;
  return prev + (cur - prev) * 0.2;
}
