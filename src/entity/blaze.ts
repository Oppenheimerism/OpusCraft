// The blaze (vanilla Blaze): the fortress's guardian, a smoking head in a whirl of glowing rods. It drifts down
// slowly and hops up to face a target above it; once it has you in sight it flares up for three seconds, then
// looses three small fireballs a quarter second apart and cools off for five. Up close it just burns you.
// Water hurts it, and a struck blaze calls the others about.

import { LootEntry } from './mob';
import type { Level } from '../game/level';
import { Goal, Flag } from './ai/goal';
import { HurtByTargetGoal, LookAtPlayerGoal, NearestAttackablePlayerGoal, RandomLookAroundGoal, WaterAvoidingRandomStrollGoal } from './ai/goals';
import { PathType } from './ai/pathfinder';
import type { LivingEntity } from './living';
import { Monster } from './monsters';
import { SmallFireball } from './fireball';

/** vanilla Blaze.BlazeAttackGoal */
class BlazeAttackGoal extends Goal {
  private attackStep = 0;
  private attackTime = 0;
  private lastSeen = 0;
  constructor(readonly blaze: Blaze) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.blaze.target;
    return !!t && t.isAlive && this.blaze.canAttack(t);
  }
  override start(): void {
    this.attackStep = 0;
  }
  override stop(): void {
    this.blaze.charged = false;
    this.lastSeen = 0;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    this.attackTime--;
    const b = this.blaze, t = b.target;
    if (!t) return;
    const seen = b.sensing.hasLineOfSight(t);
    this.lastSeen = seen ? 0 : this.lastSeen + 1;
    const d2 = b.distanceToSqr(t.x, t.y, t.z);
    if (d2 < 4) {
      if (!seen) return;
      if (this.attackTime <= 0) {
        this.attackTime = 20;
        b.doHurtTarget(t);
      }
      b.moveControl.setWantedPosition(t.x, t.y, t.z, 1);
    } else if (d2 < b.followRange * b.followRange && seen) {
      const ex = t.x - b.x, ey = t.y + t.height * 0.5 - (b.y + b.height * 0.5), ez = t.z - b.z;
      if (this.attackTime <= 0) {
        this.attackStep++;
        if (this.attackStep === 1) {
          this.attackTime = 60;
          b.charged = true;
        } else if (this.attackStep <= 4) {
          this.attackTime = 6;
        } else {
          this.attackTime = 100;
          this.attackStep = 0;
          b.charged = false;
        }
        if (this.attackStep > 1) {
          // aimed at you, with a spread that widens with distance
          const h = Math.sqrt(Math.sqrt(d2)) * 0.5;
          const r = b.random;
          b.level.sound.play('entity.blaze.shoot', b.x, b.y, b.z, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
          const fb = new SmallFireball(b.level, b, ex + r.triangle(2.297 * h), ey, ez + r.triangle(2.297 * h));
          fb.setPos(b.x, b.y + b.height * 0.5 + 0.5, b.z);
          b.level.addEntity(fb);
        }
      }
      b.lookControl.setLookAtEntity(t, 10, 10);
    } else if (this.lastSeen < 5) {
      b.moveControl.setWantedPosition(t.x, t.y, t.z, 1);
    }
  }
}

/** vanilla HurtByTargetGoal.setAlertOthers: every blaze about with nothing to fight joins in */
class BlazeHurtByTargetGoal extends HurtByTargetGoal {
  constructor(readonly blaze: Blaze) {
    super(blaze);
  }
  override start(): void {
    super.start();
    const b = this.blaze, t = b.target;
    if (!t) return;
    const r = b.followRange;
    for (const e of b.level.entities) {
      if (e === b || !(e instanceof Blaze) || e.removed || e.target) continue;
      if (Math.abs(e.x - Math.floor(b.x) - 0.5) > r + 0.5 || Math.abs(e.z - Math.floor(b.z) - 0.5) > r + 0.5 || Math.abs(e.y - Math.floor(b.y) - 0.5) > 10.5) continue;
      e.setTarget(t);
    }
  }
}

export class Blaze extends Monster {
  readonly type = 'blaze';
  /** vanilla DATA_FLAGS_ID bit 0: flared up to shoot (it shows as burning) */
  charged = false;
  private allowedHeightOffset = 0.5;
  private nextHeightOffsetChangeTick = 0;
  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.8);
    this.maxHealth = this.health = 20;
    this.attackDamage = 6;
    this.moveSpeedAttr = 0.23;
    this.followRange = 48;
    this.xpReward = 10;
    this.setPathfindingMalus(PathType.WATER, -1);
    this.setPathfindingMalus(PathType.LAVA, 8);
    this.setPathfindingMalus(PathType.DANGER_FIRE, 0);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, 0);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(4, new BlazeAttackGoal(this));
    // (MoveTowardsRestrictionGoal: blazes have no home to stay by)
    this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 1, 0));
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new BlazeHurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
  }
  override fireImmune(): boolean {
    return true;
  }
  /** vanilla Blaze.isOnFire: it looks alight while flared up */
  override isOnFire(): boolean {
    return this.charged;
  }
  /** vanilla getLightLevelDependentMagicValue: always 1, so it's always "bored" in the light and despawns sooner */
  override lightMagic(): number {
    return 1;
  }
  protected override causeFallDamage(_dist: number): void {}
  override ambientSound(): string {
    return 'entity.blaze.ambient';
  }
  override hurtSound(): string {
    return 'entity.blaze.hurt';
  }
  override deathSound(): string {
    return 'entity.blaze.death';
  }
  protected override makesStepSounds(): boolean {
    return false;
  }
  /** vanilla entities/blaze: a rod, only for a player's kill */
  override lootTable(): LootEntry[] {
    return [{ item: 'blaze_rod', min: 0, max: 1, player: true }];
  }
  override aiStep(): void {
    // falls gently
    if (!this.onGround && this.dy < 0) this.dy *= 0.6;
    const r = this.random;
    if (r.nextInt(24) === 0) this.level.sound.play('entity.blaze.burn', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1 + r.nextFloat(), r.nextFloat() * 0.7 + 0.3);
    for (let i = 0; i < 2; i++) {
      this.level.particles.spawn?.('large_smoke', this.x + (r.nextDouble() * 2 - 1) * this.width * 0.5, this.y + r.nextDouble() * this.height, this.z + (r.nextDouble() * 2 - 1) * this.width * 0.5, 0, 0, 0);
    }
    // vanilla isSensitiveToWater
    if (this.isAlive && this.isInWaterOrRainNow()) this.hurt(1, 'drown');
    super.aiStep();
  }
  override isSensitiveToWater(): boolean {
    return true;
  }
  protected override customServerAiStep(): void {
    // every five seconds a new height to keep above its target (triangular about 0.5, up to ±6.9)
    if (--this.nextHeightOffsetChangeTick <= 0) {
      this.nextHeightOffsetChangeTick = 100;
      this.allowedHeightOffset = 0.5 + this.random.triangle(6.891);
    }
    const t: LivingEntity | null = this.target;
    if (t && t.y + t.eyeHeight > this.y + this.eyeHeight + this.allowedHeightOffset && this.canAttack(t)) this.dy += (0.3 - this.dy) * 0.3;
    super.customServerAiStep();
  }
}
