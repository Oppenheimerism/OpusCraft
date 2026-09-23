// LivingEntity: vanilla travel() physics, jumping, health, hurt/death.

import { Entity } from './entity';
import { FLUID_WATER } from '../world/fluids';
import { wrapDegrees } from '../core/math';
import { FLAGS, F_AIR, F_OPAQUE, F_FULL_COLLISION, BLOCKS, STATE_BLOCK } from '../world/block';
import { clipBlocks } from '../game/raycast';

/** damage sources that ignore armor (vanilla #bypasses_armor) */
const BYPASSES_ARMOR = new Set(['onFire', 'inWall', 'drown', 'starve', 'fall', 'void', 'genericKill', 'magic', 'generic', 'cramming', 'flyIntoWall']);
/** damage sources that never knock back (vanilla #no_knockback) */
const NO_KNOCKBACK = new Set(['explosion', 'playerExplosion', 'fall', 'drown', 'starve', 'onFire', 'inFire', 'lava', 'inWall', 'void', 'genericKill', 'magic', 'cactus', 'sweetBerryBush', 'generic']);
export const FIRE_SOURCES = new Set(['onFire', 'inFire', 'lava', 'hotFloor', 'fireball']);

/** vanilla CombatRules.getDamageAfterAbsorb */
export function damageAfterArmor(damage: number, armor: number, toughness: number): number {
  const f = 2 + toughness / 4;
  const f1 = Math.max(armor * 0.2, Math.min(20, armor - damage / f));
  return damage * (1 - f1 / 25);
}

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
  noActionTime = 0;
  lastHurtByPlayerTime = 0;
  /** vanilla hurtDir: yaw of the damage source relative to facing (camera tilt) */
  hurtDir = 0;
  /** vanilla lastHurtByMob (cleared after 100 ticks) */
  lastHurtByMob: LivingEntity | null = null;
  lastHurtByMobTimestamp = 0;
  lastHurtByPlayer: LivingEntity | null = null;
  lastHurtMob: LivingEntity | null = null;
  /** who dealt the killing blow and how (death messages, loot) */
  killer: Entity | null = null;
  deathSource = '';
  dead = false;

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

  override baseTick(): void {
    super.baseTick();
    this.bodyYawO = this.bodyYaw;
    this.headYawO = this.headYaw;
    if (this.health > 0 && this.isInWall()) this.hurt(1, 'inWall');
    if (this.lastHurtByPlayerTime > 0) this.lastHurtByPlayerTime--;
    else this.lastHurtByPlayer = null;
    if (this.lastHurtMob && !this.lastHurtMob.isAlive) this.lastHurtMob = null;
    if (this.lastHurtByMob) {
      if (!this.lastHurtByMob.isAlive || this.tickCount - this.lastHurtByMobTimestamp > 100) this.lastHurtByMob = null;
    }
  }

  /** vanilla isInWall: eyes inside a suffocating block */
  isInWall(): boolean {
    if (this.noPhysics) return false;
    const f = this.width * 0.8;
    const ey = this.y + this.eyeHeight;
    const x0 = Math.floor(this.x - f / 2), x1 = Math.floor(this.x + f / 2);
    const z0 = Math.floor(this.z - f / 2), z1 = Math.floor(this.z + f / 2);
    const y0 = Math.floor(ey - 5e-7), y1 = Math.floor(ey + 5e-7);
    const w = this.level.world;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const fl = FLAGS[w.getState(x, y, z)];
          if (fl & F_OPAQUE && fl & F_FULL_COLLISION) return true;
        }
    return false;
  }

  /** vanilla LivingEntity.hasLineOfSight: eye-to-eye collider clip */
  hasLineOfSight(e: Entity): boolean {
    const ex = this.x, ey = this.y + this.eyeHeight, ez = this.z;
    const tx = e.x, ty = e instanceof LivingEntity ? e.y + e.eyeHeight : (e.bb.minY + e.bb.maxY) / 2, tz = e.z;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez;
    if (dx * dx + dy * dy + dz * dz > 128 * 128) return false;
    return clipBlocks(this.level.world, ex, ey, ez, tx, ty, tz) === null;
  }

  setLastHurtByMob(e: LivingEntity | null): void {
    this.lastHurtByMob = e;
    this.lastHurtByMobTimestamp = this.tickCount;
  }

  override isPickable(): boolean {
    return !this.removed && this.health > 0;
  }

  override isPushable(): boolean {
    return this.isAlive;
  }

  /** vanilla pushEntities → doPush: overlapping pushable entities (mobs, minecarts) get pushed apart */
  protected pushEntities(): void {
    const list = this.level.getEntities(this.bb, (e) => e.isPushable(), this);
    for (const e of list) e.pushAgainst(this);
  }

  /** vanilla LivingEntity.stopRiding: step off where the vehicle says */
  override stopRiding(): void {
    const v = this.vehicle;
    super.stopRiding();
    if (v && v !== this.vehicle) this.dismountVehicle(v);
  }

  /** vanilla dismountVehicle: if the vehicle is gone, stays put (no lower than the vehicle was) */
  dismountVehicle(v: Entity): void {
    if (this.removed) return;
    const [x, y, z] = v.removed ? [this.x, Math.max(this.y, v.y), this.z] : v.dismountLocation(this);
    this.moveTo(x, y, z);
  }

  /** bounding-box heights this can get off in, best first (vanilla getDismountPoses) */
  dismountHeights(): number[] {
    return [this.height];
  }

  /** got off in the pose of that height (vanilla setPose) */
  setDismountHeight(_h: number): void {}

  override rideTick(): void {
    super.rideTick();
    this.fallDistance = 0;
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
    this.pushEntities();
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

  /** damage sources this entity ignores */
  isInvulnerableTo(_source: string): boolean {
    return false;
  }

  armorValue(): number {
    return 0;
  }

  armorToughness(): number {
    return 0;
  }

  /** wear armor pieces (players) */
  protected hurtArmor(_amount: number): void {}

  knockbackResistance(): number {
    return 0;
  }

  /** vanilla LivingEntity.checkFallDamage: a hard landing kicks up a burst of the block below */
  protected override checkFallDamage(dy: number, onGround: boolean): void {
    if (onGround && this.fallDistance > 3 && !this.inWater) {
      const bx = Math.floor(this.x), by = Math.floor(this.y - 0.2), bz = Math.floor(this.z);
      const st = this.level.world.getState(bx, by, bz);
      if (!(FLAGS[st] & F_AIR)) {
        const f = Math.ceil(this.fallDistance - 3);
        const count = Math.floor(150 * Math.min(0.2 + f / 15, 2.5));
        const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
        for (let i = 0; i < count; i++) this.level.particles.blockParticle?.(this.x, this.y, this.z, gauss() * 0.15, gauss() * 0.15, gauss() * 0.15, st, bx, by, bz);
      }
    }
    super.checkFallDamage(dy, onGround);
  }

  /** vanilla SweetBerryBushBlock.entityInside: slows, and pricks anything that moves in a grown bush */
  protected override insideBerryBush(st: number): void {
    if (this.type === 'fox' || this.type === 'bee') return;
    this.makeStuckInBlock(0.8, 0.75, 0.8);
    if (BLOCKS[STATE_BLOCK[st]].get<number>(st, 'age') > 0 && (this.xo !== this.x || this.zo !== this.z)) {
      const mx = Math.abs(this.x - this.xo), mz = Math.abs(this.z - this.zo);
      if (mx >= 0.003 || mz >= 0.003) this.hurt(1, 'sweetBerryBush');
    }
  }

  /**
   * vanilla LivingEntity.hurt: invulnerability frames, armor, knockback, hurt/death
   * sounds. `attacker` is the entity responsible, `direct` the projectile if any.
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source) || this.removed || this.health <= 0) return false;
    if (FIRE_SOURCES.has(source) && this.fireImmune()) return false;
    this.noActionTime = 0;
    if (amount < 0) amount = 0;
    let fresh = true;
    if (this.invulnerableTime > 10 && source !== 'genericKill' && source !== 'void') {
      if (amount <= this.lastHurt) return false;
      this.actuallyHurt(source, amount - this.lastHurt);
      this.lastHurt = amount;
      fresh = false;
    } else {
      this.lastHurt = amount;
      this.invulnerableTime = 20;
      this.actuallyHurt(source, amount);
      this.hurtTime = this.hurtDuration = 10;
    }
    if (attacker instanceof LivingEntity && attacker !== this) {
      this.setLastHurtByMob(attacker);
      if (attacker.type === 'player') {
        this.lastHurtByPlayerTime = 100;
        this.lastHurtByPlayer = attacker;
      }
    }
    if (fresh) {
      this.hurtDir = 0;
      if (!NO_KNOCKBACK.has(source) && (attacker || direct)) {
        let kx: number, kz: number;
        if (direct && direct !== attacker) {
          kx = -direct.dx;
          kz = -direct.dz;
        } else {
          kx = attacker!.x - this.x;
          kz = attacker!.z - this.z;
        }
        this.knockback(0.4, kx, kz);
        // vanilla indicateDamage
        this.hurtDir = (Math.atan2(kz, kx) * 180) / Math.PI - this.yaw;
      }
      this.onHurt(source);
    }
    if (this.health <= 0) {
      this.killer = attacker ?? null;
      this.deathSource = source;
      if (fresh) this.playDeathSound();
      this.die(source, attacker ?? null);
    } else if (fresh) this.playHurtSound(source);
    return true;
  }

  protected actuallyHurt(source: string, amount: number): void {
    if (!BYPASSES_ARMOR.has(source)) {
      this.hurtArmor(amount);
      amount = damageAfterArmor(amount, this.armorValue(), this.armorToughness());
    }
    this.applyDamage(amount);
  }

  protected playHurtSound(_source: string): void {}
  protected playDeathSound(): void {}

  protected onHurt(_source: string): void {}

  protected applyDamage(amount: number): void {
    const a = Math.min(this.absorption, amount);
    this.absorption -= a;
    amount -= a;
    this.health = Math.max(0, this.health - amount);
  }

  knockback(strength: number, x: number, z: number): void {
    strength *= 1 - this.knockbackResistance();
    if (strength <= 0) return;
    while (x * x + z * z < 1e-5) {
      x = (Math.random() - Math.random()) * 0.01;
      z = (Math.random() - Math.random()) * 0.01;
    }
    const l = Math.sqrt(x * x + z * z);
    const kx = (x / l) * strength, kz = (z / l) * strength;
    this.dx = this.dx / 2 - kx;
    this.dz = this.dz / 2 - kz;
    this.dy = this.onGround ? Math.min(0.4, this.dy / 2 + strength) : this.dy;
  }

  die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
    this.level.onEntityDied?.(this, source, attacker);
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
