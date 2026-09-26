// The polar bear (vanilla PolarBear extends Animal, NeutralMob): big and white, on the snowy plains, the ice spikes and
// the frozen oceans' ice, in ones and twos, the second a cub. Left alone it leaves you alone, but near a cub a bear
// comes for you, and one you hurt stays angry at you for twenty to forty seconds; before it swipes it rears up on its
// hind legs with a growl of warning. A cub runs when it's hurt, and the grown bears about come to its defence. It
// swims well, won't be bred, and hunts foxes. Cod or salmon when it dies.

import { Animal } from './animals';
import type { Level } from '../game/level';
import { type LootEntry, type SpawnGroup, type SpawnReason } from './mob';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import { FollowParentGoal } from './animals';
import {
  FloatGoal, HurtByTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, NearestAttackableMobGoal, NearestAttackablePlayerGoal,
  PanicGoal, RandomLookAroundGoal, RandomStrollGoal,
} from './ai/goals';
import { AABB } from '../core/aabb';
import type { Player } from './player';

/** vanilla STAND_ANIMATION_TICKS */
const STAND_TICKS = 6;

export class PolarBear extends Animal {
  readonly type = 'polar_bear';
  protected adultWidth = 1.4;
  protected adultHeight = 1.4;
  /** vanilla DATA_STANDING_ID: up on its hind legs, about to strike */
  standing = false;
  /** vanilla clientSideStandAnimation (and the last tick's): 0 on all fours to 6 reared right up */
  standAnim = 0;
  standAnimO = 0;
  private warningSoundTicks = 0;
  /** vanilla NeutralMob: ticks of anger left, and at whom */
  angerTime = 0;
  angerTarget: Entity | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(1.4, 1.4);
    this.maxHealth = this.health = 30;
    this.followRange = 20;
    this.moveSpeedAttr = 0.25;
    this.attackDamage = 6;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new PolarBearMeleeAttackGoal(this));
    this.goalSelector.addGoal(1, new PolarBearPanicGoal(this));
    this.goalSelector.addGoal(4, new FollowParentGoal(this, 1.25));
    this.goalSelector.addGoal(5, new RandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(7, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new PolarBearHurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new PolarBearAttackPlayersGoal(this));
    this.targetSelector.addGoal(3, new AngryAtPlayerGoal(this));
    this.targetSelector.addGoal(4, new NearestAttackableMobGoal(this, (e) => e.type === 'fox', true, 10));
  }

  /** vanilla: nothing it will eat to be bred */
  isFood(): boolean {
    return false;
  }
  makeBaby(): Animal {
    return new PolarBear(this.level);
  }

  /** vanilla AgeableMobGroupData(1.0): after the first of a pack, every one a cub */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    g.ageable ??= { size: 0, babyChance: 1 };
    super.finalizeSpawn(reason, g);
  }

  /** vanilla getWaterSlowDown: a strong swimmer */
  override waterSlowDown(): number {
    return 0.98;
  }

  // --- anger (vanilla NeutralMob) ----------------------------------------------------------------------------

  isAngryAt(e: Entity): boolean {
    return e instanceof LivingEntity && this.canAttack(e) && e === this.angerTarget;
  }
  /** vanilla startPersistentAngerTimer: TimeUtil.rangeOfSeconds(20, 39) */
  private startAngerTimer(): void {
    this.angerTime = 400 + this.random.nextInt(381);
  }
  stopBeingAngry(): void {
    this.lastHurtByMob = null;
    this.angerTarget = null;
    this.setTarget(null);
    this.angerTime = 0;
  }
  /** vanilla NeutralMob.updatePersistentAnger */
  private updateAnger(): void {
    const t = this.target;
    if ((!t || !t.isAlive) && this.angerTarget && this.angerTarget.type !== 'player') {
      this.stopBeingAngry();
      return;
    }
    if (t && t !== this.angerTarget) {
      this.angerTarget = t;
      this.startAngerTimer();
    }
    if (this.angerTime > 0 && (!t || t.type !== 'player') && --this.angerTime === 0) this.stopBeingAngry();
  }

  // --- ticking ------------------------------------------------------------------------------------------------

  override tick(): void {
    super.tick();
    this.standAnimO = this.standAnim;
    this.standAnim = Math.max(0, Math.min(STAND_TICKS, this.standAnim + (this.standing ? 1 : -1)));
    if (this.warningSoundTicks > 0) this.warningSoundTicks--;
    this.updateAnger();
  }

  /** vanilla getStandingAnimationScale: how far up it has reared, 0 to 1 */
  standingScale(p: number): number {
    return (this.standAnimO + (this.standAnim - this.standAnimO) * p) / STAND_TICKS;
  }

  /** vanilla playWarningSound: its growl as it rears, no more than every two seconds */
  playWarningSound(): void {
    if (this.warningSoundTicks <= 0) {
      this.playSound('entity.polar_bear.warning', this.soundVolume(), this.voicePitch());
      this.warningSoundTicks = 40;
    }
  }

  // --- sounds and loot ----------------------------------------------------------------------------------------

  override ambientSound(): string {
    return this.isBaby() ? 'entity.polar_bear.ambient_baby' : 'entity.polar_bear.ambient';
  }
  override hurtSound(): string {
    return 'entity.polar_bear.hurt';
  }
  override deathSound(): string {
    return 'entity.polar_bear.death';
  }
  protected override playStepSound(): void {
    this.playSound('entity.polar_bear.step', 0.15, 1);
  }

  /** vanilla loot table entities/polar_bear: cod three times in four, else salmon; none to two, cooked if it burned */
  override lootTable(): LootEntry[] {
    return [this.random.nextInt(4) < 3 ? { item: 'cod', min: 0, max: 2, cooked: 'cooked_cod' } : { item: 'salmon', min: 0, max: 2, cooked: 'cooked_salmon' }];
  }

  // --- saving -------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), AngerTime: this.angerTime };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.angerTime = Math.max(0, Number(d.AngerTime ?? 0) || 0);
  }
}

// ---------------------------------------------------------------------------
// goals

/** vanilla PolarBearMeleeAttackGoal: close enough, it rears up and growls as the swipe comes round, and drops to strike */
class PolarBearMeleeAttackGoal extends MeleeAttackGoal {
  constructor(readonly bear: PolarBear) {
    super(bear, 1.25, true);
  }
  protected override checkAndPerformAttack(tg: LivingEntity): void {
    const b = this.bear;
    if (this.ticksUntilNextAttack <= 0 && b.isWithinMeleeAttackRange(tg) && b.sensing.hasLineOfSight(tg)) {
      this.ticksUntilNextAttack = this.attackInterval();
      b.doHurtTarget(tg);
      b.standing = false;
    } else if (b.distanceToSqr(tg.x, tg.y, tg.z) < (tg.width + 3) * (tg.width + 3)) {
      if (this.ticksUntilNextAttack <= 0) {
        b.standing = false;
        this.ticksUntilNextAttack = this.attackInterval();
      }
      if (this.ticksUntilNextAttack <= 10) {
        b.standing = true;
        b.playWarningSound();
      }
    } else {
      this.ticksUntilNextAttack = this.attackInterval();
      b.standing = false;
    }
  }
  override stop(): void {
    this.bear.standing = false;
    super.stop();
  }
}

/** vanilla PolarBearPanicGoal: only a hurt cub runs, or a bear on fire */
class PolarBearPanicGoal extends PanicGoal {
  constructor(bear: PolarBear) {
    super(bear, 2.0);
  }
  protected override shouldPanic(): boolean {
    return (this.mob.lastHurtByMob !== null && this.mob.isBaby()) || this.mob.isOnFire();
  }
}

/** vanilla PolarBearHurtByTargetGoal: a hurt cub calls the grown bears about, and leaves the fighting to them */
class PolarBearHurtByTargetGoal extends HurtByTargetGoal {
  constructor(readonly bear: PolarBear) {
    super(bear);
  }
  override start(): void {
    super.start();
    if (this.bear.isBaby()) {
      this.alertOthers();
      this.stop();
    }
  }
  protected override alertOther(o: PolarBear, target: LivingEntity): void {
    if (o instanceof PolarBear && !o.isBaby()) super.alertOther(o, target);
  }
}

/** vanilla PolarBearAttackPlayersGoal: a grown bear with a cub within 8 blocks goes for a player in half its range */
class PolarBearAttackPlayersGoal extends NearestAttackablePlayerGoal {
  constructor(readonly bear: PolarBear) {
    super(bear, true, 20);
  }
  protected override extraCondition(): boolean {
    const b = this.bear;
    if (b.isBaby()) return false;
    const box = new AABB(b.bb.minX - 8, b.bb.minY - 4, b.bb.minZ - 8, b.bb.maxX + 8, b.bb.maxY + 4, b.bb.maxZ + 8);
    return b.level.getEntities(box, (e) => e instanceof PolarBear && e.isBaby()).length > 0;
  }
  protected override followDistance(): number {
    return super.followDistance() * 0.5;
  }
}

/** vanilla NearestAttackableTargetGoal(Player, 10, true, false, this::isAngryAt) */
class AngryAtPlayerGoal extends NearestAttackablePlayerGoal {
  constructor(readonly bear: PolarBear) {
    super(bear, true);
  }
  protected override acceptsPlayer(p: Player): boolean {
    return this.bear.isAngryAt(p);
  }
}
