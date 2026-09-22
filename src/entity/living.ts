// LivingEntity: vanilla travel() physics, jumping, health, hurt/death.

import { Entity } from './entity';
import { FLUID_WATER } from '../world/fluids';
import { wrapDegrees } from '../core/math';

export abstract class LivingEntity extends Entity {
  health = 20;
  maxHealth = 20;
  hurtTime = 0;
  hurtDuration = 10;
  deathTime = 0;
  lastHurt = 0;
  /** strafe (left +), vertical, forward inputs */
  xxa = 0;
  yya = 0;
  zza = 0;
  jumping = false;
  noJumpDelay = 0;
  speed = 0.1; // movement speed attribute (base)
  sprinting = false;
  bodyYaw = 0;
  bodyYawO = 0;
  headYaw = 0;
  headYawO = 0;
  /** limb swing animation */
  walkAnimSpeed = 0;
  walkAnimSpeedO = 0;
  walkAnimPos = 0;
  attackAnim = 0;
  attackAnimO = 0;
  swingTime = 0;
  swinging = false;
  absorption = 0;
  protected noActionTime = 0;
  lastHurtByPlayerTime = 0;

  constructor(level: Entity['level']) {
    super(level);
    this.stepHeight = 0.6;
  }

  get isAlive(): boolean {
    return !this.removed && this.health > 0;
  }

  /** effective movement speed (sprint modifier +30%) */
  movementSpeed(): number {
    return this.speed * (this.sprinting ? 1.3 : 1);
  }

  flyingSpeed(): number {
    return this.sprinting ? 0.025999999 : 0.02;
  }

  jumpPower(): number {
    return 0.42 * this.blockJumpFactor();
  }

  blockJumpFactor(): number {
    return 1;
  }

  override tick(): void {
    super.tick();
    this.aiStep();
    this.updateBodyRotation();
    this.updateWalkAnimation();
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.health <= 0) this.tickDeath();
    this.updateSwing();
  }

  protected updateSwing(): void {
    this.attackAnimO = this.attackAnim;
    const dur = this.swingDuration();
    if (this.swinging) {
      this.swingTime++;
      if (this.swingTime >= dur) {
        this.swingTime = 0;
        this.swinging = false;
      }
    } else this.swingTime = 0;
    this.attackAnim = this.swingTime / dur;
  }

  swingDuration(): number {
    return 6;
  }

  swing(): void {
    if (!this.swinging || this.swingTime >= this.swingDuration() / 2 || this.swingTime < 0) {
      this.swingTime = -1;
      this.swinging = true;
    }
  }

  protected tickDeath(): void {
    this.deathTime++;
    if (this.deathTime >= 20) this.remove();
  }

  aiStep(): void {
    if (this.noJumpDelay > 0) this.noJumpDelay--;
    if (Math.abs(this.dx) < 0.003) this.dx = 0;
    if (Math.abs(this.dy) < 0.003) this.dy = 0;
    if (Math.abs(this.dz) < 0.003) this.dz = 0;
    if (this.isImmobile()) {
      this.jumping = false;
      this.xxa = 0;
      this.zza = 0;
    } else this.serverAiStep();
    if (this.jumping) {
      const fh = this.inLava ? this.fluidHeightLava : this.fluidHeightWater;
      const inFluid = (this.inWater && fh > 0) || this.inLava;
      if (inFluid && (!this.onGround || fh > 0.4)) {
        this.jumpInLiquid();
      } else if ((this.onGround || (inFluid && fh <= 0.4)) && this.noJumpDelay === 0) {
        this.jumpFromGround();
        this.noJumpDelay = 10;
      }
    } else this.noJumpDelay = 0;
    this.xxa *= 0.98;
    this.zza *= 0.98;
    this.travel(this.xxa, this.yya, this.zza);
  }

  isImmobile(): boolean {
    return this.health <= 0;
  }

  /** AI / input hook (mob goals, player input) */
  protected serverAiStep(): void {}

  protected jumpInLiquid(): void {
    this.dy += 0.04;
  }

  jumpFromGround(): void {
    this.dy = this.jumpPower();
    if (this.sprinting) {
      const f = (this.yaw * Math.PI) / 180;
      this.dx += -Math.sin(f) * 0.2;
      this.dz += Math.cos(f) * 0.2;
    }
  }

  /** vanilla getInputVector + add to motion */
  protected moveRelative(amount: number, sx: number, sy: number, sz: number): void {
    const d0 = sx * sx + sy * sy + sz * sz;
    if (d0 < 1e-7) return;
    let len = 1;
    if (d0 > 1) len = Math.sqrt(d0);
    sx = (sx / len) * amount;
    sy = (sy / len) * amount;
    sz = (sz / len) * amount;
    const f = Math.sin((this.yaw * Math.PI) / 180), f1 = Math.cos((this.yaw * Math.PI) / 180);
    this.dx += sx * f1 - sz * f;
    this.dy += sy;
    this.dz += sz * f1 + sx * f;
  }

  protected gravity(): number {
    return 0.08;
  }

  travel(sx: number, sy: number, sz: number): void {
    const g = this.gravity();
    const falling = this.dy <= 0;
    if (this.inWater && this.isAffectedByFluids()) {
      const y0 = this.y;
      let slow = this.sprinting ? 0.9 : this.waterSlowDown();
      const f5 = 0.02;
      void slow;
      this.moveRelative(f5, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      if (this.horizontalCollision && this.onClimbable()) this.dy = 0.2;
      slow = this.sprinting ? 0.9 : this.waterSlowDown();
      this.dx *= slow;
      this.dy *= 0.8;
      this.dz *= slow;
      this.dy = this.fluidFallingAdjusted(g, falling, this.dy);
      if (this.horizontalCollision && this.isFree(this.bb.move(this.dx, this.dy + 0.6 - this.y + y0, this.dz))) this.dy = 0.3;
    } else if (this.inLava && this.isAffectedByFluids()) {
      const y0 = this.y;
      this.moveRelative(0.02, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      if (this.fluidHeightLava <= 0.4) {
        this.dx *= 0.5;
        this.dy *= 0.8;
        this.dz *= 0.5;
        this.dy = this.fluidFallingAdjusted(g, falling, this.dy);
      } else {
        this.dx *= 0.5;
        this.dy *= 0.5;
        this.dz *= 0.5;
      }
      if (g !== 0) this.dy += -g / 4;
      if (this.horizontalCollision && this.isFree(this.bb.move(this.dx, this.dy + 0.6 - this.y + y0, this.dz))) this.dy = 0.3;
    } else {
      const friction = this.blockFriction();
      const f3 = this.onGround ? friction * 0.91 : 0.91;
      const speed = this.onGround ? this.movementSpeed() * (0.21600002 / (friction * friction * friction)) : this.flyingSpeed();
      this.moveRelative(speed, sx, sy, sz);
      this.handleOnClimbable();
      this.move(this.dx, this.dy, this.dz);
      if ((this.horizontalCollision || this.jumping) && this.onClimbable()) this.dy = 0.2;
      let d2 = this.dy;
      if (!this.noGravity()) d2 -= g;
      this.dx *= f3;
      this.dy = d2 * 0.98;
      this.dz *= f3;
    }
  }

  noGravity(): boolean {
    return false;
  }

  protected handleOnClimbable(): void {
    if (!this.onClimbable()) return;
    this.fallDistance = 0;
    const lim = 0.15000000596046448;
    this.dx = Math.max(-lim, Math.min(lim, this.dx));
    this.dz = Math.max(-lim, Math.min(lim, this.dz));
    let d2 = Math.max(this.dy, -lim);
    if (d2 < 0 && this.isSuppressingSlidingDown()) d2 = 0;
    this.dy = d2;
  }

  protected isSuppressingSlidingDown(): boolean {
    return false;
  }

  protected fluidFallingAdjusted(g: number, falling: boolean, dy: number): number {
    if (g !== 0 && !this.sprinting) {
      if (falling && Math.abs(dy - 0.005) >= 0.003 && Math.abs(dy - g / 16) < 0.003) return -0.003;
      return dy - g / 16;
    }
    return dy;
  }

  waterSlowDown(): number {
    return 0.8;
  }

  isAffectedByFluids(): boolean {
    return true;
  }

  protected updateBodyRotation(): void {
    this.bodyYawO = this.bodyYaw;
    this.headYawO = this.headYaw;
    const d0 = this.x - this.xo, d1 = this.z - this.zo;
    const f = d0 * d0 + d1 * d1;
    let f1 = this.bodyYaw;
    if (f > 0.0025000002) {
      const f3 = (Math.atan2(d1, d0) * 180) / Math.PI - 90;
      f1 = f3;
    }
    if (this.attackAnim > 0) f1 = this.yaw;
    // vanilla tickHeadTurn
    const f2 = wrapDegrees(f1 - this.bodyYaw);
    this.bodyYaw += f2 * 0.3;
    let f4 = wrapDegrees(this.yaw - this.bodyYaw);
    if (Math.abs(f4) > 75) {
      this.bodyYaw = this.yaw - Math.sign(f4) * 75;
      f4 = wrapDegrees(this.yaw - this.bodyYaw);
    }
    this.headYaw = this.yaw;
  }

  protected updateWalkAnimation(): void {
    const dx = this.x - this.xo, dz = this.z - this.zo;
    const dist = Math.sqrt(dx * dx + dz * dz);
    let f = Math.min(dist * 4, 1);
    this.walkAnimSpeedO = this.walkAnimSpeed;
    this.walkAnimSpeed += (f - this.walkAnimSpeed) * 0.4;
    this.walkAnimPos += this.walkAnimSpeed;
    void f;
  }

  /** damage the entity; returns true if damage was applied */
  hurt(amount: number, _source: string, attacker?: Entity): boolean {
    if (this.health <= 0) return false;
    if (this.invulnerableTime > 10) {
      if (amount <= this.lastHurt) return false;
      this.applyDamage(amount - this.lastHurt);
      this.lastHurt = amount;
    } else {
      this.lastHurt = amount;
      this.invulnerableTime = 20;
      this.applyDamage(amount);
      this.hurtTime = this.hurtDuration = 10;
      if (attacker) {
        let kx = attacker.x - this.x, kz = attacker.z - this.z;
        while (kx * kx + kz * kz < 1e-4) {
          kx = (Math.random() - Math.random()) * 0.01;
          kz = (Math.random() - Math.random()) * 0.01;
        }
        this.knockback(0.4, kx, kz);
      }
      this.onHurt(_source);
    }
    if (this.health <= 0) this.die(_source);
    return true;
  }

  protected onHurt(_source: string): void {}

  protected applyDamage(amount: number): void {
    const a = Math.min(this.absorption, amount);
    this.absorption -= a;
    amount -= a;
    this.health = Math.max(0, this.health - amount);
  }

  knockback(strength: number, x: number, z: number): void {
    if (strength <= 0) return;
    const l = Math.sqrt(x * x + z * z);
    const kx = (x / l) * strength, kz = (z / l) * strength;
    this.dx = this.dx / 2 - kx;
    this.dz = this.dz / 2 - kz;
    this.dy = this.onGround ? Math.min(0.4, this.dy / 2 + strength) : this.dy;
  }

  die(_source: string): void {
    this.deathTime = 0;
  }

  heal(amount: number): void {
    if (this.health > 0) this.health = Math.min(this.maxHealth, this.health + amount);
  }

  protected override causeFallDamage(dist: number): void {
    const dmg = Math.ceil(dist - 3);
    if (dmg > 0) {
      this.onFallDamage(dmg, dist);
      this.hurt(dmg, 'fall');
    }
  }

  protected onFallDamage(_dmg: number, _dist: number): void {}

  isInFluidEye(): boolean {
    return this.eyeFluid === FLUID_WATER;
  }
}
