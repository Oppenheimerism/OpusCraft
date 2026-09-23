// Hostile mobs (vanilla Monster / Zombie / Skeleton / Creeper / Spider) and
// their combat goals.

import { Mob, LootEntry, MobCategory } from './mob';
import type { Level } from '../game/level';
import { Goal, Flag } from './ai/goal';
import {
  FloatGoal, WaterAvoidingRandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal, MeleeAttackGoal,
  NearestAttackablePlayerGoal, HurtByTargetGoal, RestrictSunGoal, FleeSunGoal, LeapAtTargetGoal,
} from './ai/goals';
import type { LivingEntity } from './living';
import type { Player } from './player';
import type { Entity } from './entity';
import { ItemStack, ITEMS } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, F_OPAQUE, F_FULL_COLLISION } from '../world/block';
import { Arrow } from './arrow';
import { explode } from '../game/explosion';

const DIFFICULTY_ID: Record<string, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

export abstract class Monster extends Mob {
  readonly category: MobCategory = 'monster';

  constructor(level: Level) {
    super(level);
    this.xpReward = 5;
  }

  override aiStep(): void {
    // vanilla Monster.updateNoActionTime: bright light makes monsters "bored" (despawn sooner)
    if (this.lightMagic() > 0.5) this.noActionTime += 2;
    super.aiStep();
  }

  override shouldDespawnInPeaceful(): boolean {
    return true;
  }

  /** vanilla Monster.getWalkTargetValue: darker is better */
  override walkTargetValue(x: number, y: number, z: number): number {
    return 0.5 - this.level.brightness(x, y, z);
  }

  /** vanilla Monster.isDarkEnoughToSpawn */
  static isDarkEnoughToSpawn(level: Level, x: number, y: number, z: number, rand: () => number): boolean {
    const l = level.world.getLight(x, y, z);
    if (l >> 4 > Math.floor(rand() * 32)) return false;
    if ((l & 15) > 0) return false;
    const j = level.isThundering() ? level.rawBrightness(x, y, z, 10) : level.rawBrightness(x, y, z);
    return Math.floor(rand() * 8) >= j;
  }

  /** vanilla Monster.checkMonsterSpawnRules (without the light test for spawners/commands) */
  static checkMonsterSpawn(level: Level, x: number, y: number, z: number, rand: () => number): boolean {
    if (level.difficulty === 'peaceful') return false;
    if (!Monster.isDarkEnoughToSpawn(level, x, y, z, rand)) return false;
    return validSpawnBlock(level, x, y - 1, z);
  }

  override hurtSound(): string | null {
    return null;
  }
}

/** vanilla BlockState.isValidSpawn for ordinary monsters: sturdy top face, not glass/leaves/ice/bedrock */
export function validSpawnBlock(level: Level, x: number, y: number, z: number): boolean {
  const st = level.world.getState(x, y, z);
  const f = FLAGS[st];
  if (!(f & F_OPAQUE) || !(f & F_FULL_COLLISION)) return false;
  const n = BLOCKS[STATE_BLOCK[st]].name;
  if (n === 'bedrock' || n === 'barrier' || n.endsWith('ice') || n === 'magma_block' || n.endsWith('glass')) return false;
  return true;
}

// ---------------------------------------------------------------------------

class ZombieAttackGoal extends MeleeAttackGoal {
  private raiseArmTicks = 0;
  constructor(readonly zombie: Zombie, speed: number, followEvenIfNotSeen: boolean) {
    super(zombie, speed, followEvenIfNotSeen);
  }
  override start(): void {
    super.start();
    this.raiseArmTicks = 0;
  }
  override stop(): void {
    super.stop();
    this.zombie.aggressive = false;
  }
  override tick(): void {
    super.tick();
    this.raiseArmTicks++;
    this.zombie.aggressive = this.raiseArmTicks >= 5 && this.ticksUntilNextAttack < this.attackInterval() / 2;
  }
}

export class Zombie extends Monster {
  readonly type: string = 'zombie';
  baby = false;
  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.23;
    this.attackDamage = 3;
    this.baseArmor = 2;
    this.followRange = 35;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    this.goalSelector.addGoal(2, new ZombieAttackGoal(this, 1.0, false));
    this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
  }
  override isBaby(): boolean {
    return this.baby;
  }
  setBaby(b: boolean): void {
    this.baby = b;
    this.setSize(b ? 0.3 : 0.6, b ? 0.975 : 1.95);
    this.moveSpeedAttr = b ? 0.23 * 1.5 : 0.23;
  }
  override get eyeHeight(): number {
    return this.baby ? 0.93 : 1.74;
  }
  override experienceReward(): number {
    const x = super.experienceReward();
    return this.baby ? Math.floor(x * 2.5) : x;
  }
  override aiStep(): void {
    if (this.isAlive && this.isSunBurnTick()) this.igniteForSeconds(8);
    super.aiStep();
  }
  override doHurtTarget(target: Entity): boolean {
    const ok = super.doHurtTarget(target);
    if (ok) {
      const d = DIFFICULTY_ID[this.level.difficulty] ?? 2;
      if (this.isOnFire() && this.random.nextFloat() < d * 0.3) target.igniteForSeconds(2 * d);
    }
    return ok;
  }
  override finalizeSpawn(): void {
    if (this.random.nextFloat() < 0.05) this.setBaby(true);
    const hard = this.level.difficulty === 'hard';
    if (this.random.nextFloat() < (hard ? 0.05 : 0.01)) {
      const it = ITEMS.get(this.random.nextInt(3) === 0 ? 'iron_sword' : 'iron_shovel');
      if (it) this.mainHand = new ItemStack(it, 1);
    }
  }
  override ambientSound(): string {
    return 'entity.zombie.ambient';
  }
  override hurtSound(): string {
    return 'entity.zombie.hurt';
  }
  override deathSound(): string {
    return 'entity.zombie.death';
  }
  override stepSound(): string {
    return 'entity.zombie.step';
  }
  override lootTable(): LootEntry[] {
    const rare = ['iron_ingot', 'carrot', 'potato'][this.random.nextInt(3)];
    return [
      { item: 'rotten_flesh', min: 0, max: 2 },
      { item: rare, min: 1, max: 1, player: true, chance: 0.025 },
    ];
  }
  protected override saveData(): Record<string, number | string | boolean> {
    return { baby: this.baby };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    if (d.baby) this.setBaby(true);
  }
}

// ---------------------------------------------------------------------------

/** vanilla BowItem.getPowerForTime */
export function bowPower(ticks: number): number {
  let f = ticks / 20;
  f = (f * f + f * 2) / 3;
  return Math.min(f, 1);
}

class RangedBowAttackGoal extends Goal {
  private attackTime = -1;
  private seeTime = 0;
  private strafingClockwise = false;
  private strafingBackwards = false;
  private strafingTime = -1;
  private readonly attackRadiusSqr: number;
  constructor(readonly mob: Skeleton, readonly speed: number, public attackIntervalMin: number, attackRadius: number) {
    super();
    this.attackRadiusSqr = attackRadius * attackRadius;
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  private holdingBow(): boolean {
    return this.mob.mainHand?.item.id === 'bow';
  }
  canUse(): boolean {
    return this.mob.target !== null && this.holdingBow();
  }
  override canContinueToUse(): boolean {
    return (this.canUse() || !this.mob.navigation.isDone()) && this.holdingBow();
  }
  override start(): void {
    this.mob.aggressive = true;
  }
  override stop(): void {
    this.mob.aggressive = false;
    this.seeTime = 0;
    this.attackTime = -1;
    this.mob.stopUsingItem();
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const m = this.mob;
    const t = m.target;
    if (!t) return;
    const d0 = m.distanceToSqr(t.x, t.y, t.z);
    const see = m.sensing.hasLineOfSight(t);
    if (see !== this.seeTime > 0) this.seeTime = 0;
    if (see) this.seeTime++;
    else this.seeTime--;
    if (d0 <= this.attackRadiusSqr && this.seeTime >= 20) {
      m.navigation.stop();
      this.strafingTime++;
    } else {
      m.navigation.moveToEntity(t, this.speed);
      this.strafingTime = -1;
    }
    if (this.strafingTime >= 20) {
      if (m.random.nextFloat() < 0.3) this.strafingClockwise = !this.strafingClockwise;
      if (m.random.nextFloat() < 0.3) this.strafingBackwards = !this.strafingBackwards;
      this.strafingTime = 0;
    }
    if (this.strafingTime > -1) {
      if (d0 > this.attackRadiusSqr * 0.75) this.strafingBackwards = false;
      else if (d0 < this.attackRadiusSqr * 0.25) this.strafingBackwards = true;
      m.moveControl.strafe(this.strafingBackwards ? -0.5 : 0.5, this.strafingClockwise ? 0.5 : -0.5);
      m.lookAtEntity(t, 30, 30);
    } else {
      m.lookControl.setLookAtEntity(t, 30, 30);
    }
    if (m.usingItem) {
      if (!see && this.seeTime < -60) m.stopUsingItem();
      else if (see) {
        const i = m.useItemTicks;
        if (i >= 20) {
          m.stopUsingItem();
          m.performRangedAttack(t, bowPower(i));
          this.attackTime = this.attackIntervalMin;
        }
      }
    } else if (--this.attackTime <= 0 && this.seeTime >= -60) {
      m.startUsingItem();
    }
  }
}

export class Skeleton extends Monster {
  readonly type = 'skeleton';
  private bowGoal: RangedBowAttackGoal | null = null;
  private meleeGoal: MeleeAttackGoal | null = null;
  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.99);
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.25;
    this.followRange = 16;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(2, new RestrictSunGoal(this));
    this.goalSelector.addGoal(3, new FleeSunGoal(this, 1.0));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(6, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
    this.reassessWeaponGoal();
  }
  /** vanilla AbstractSkeleton.reassessWeaponGoal */
  reassessWeaponGoal(): void {
    this.bowGoal ??= new RangedBowAttackGoal(this, 1.0, 20, 15);
    this.meleeGoal ??= new MeleeAttackGoal(this, 1.2, false);
    this.goalSelector.removeGoal(this.bowGoal);
    this.goalSelector.removeGoal(this.meleeGoal);
    if (this.mainHand?.item.id === 'bow') {
      this.bowGoal.attackIntervalMin = this.level.difficulty === 'hard' ? 20 : 40;
      this.goalSelector.addGoal(4, this.bowGoal);
    } else this.goalSelector.addGoal(4, this.meleeGoal);
  }
  override get eyeHeight(): number {
    return 1.74;
  }
  override aiStep(): void {
    if (this.isAlive && this.isSunBurnTick()) this.igniteForSeconds(8);
    super.aiStep();
  }
  override finalizeSpawn(): void {
    const bow = ITEMS.get('bow');
    if (bow) this.mainHand = new ItemStack(bow, 1);
  }
  /** vanilla AbstractSkeleton.performRangedAttack */
  performRangedAttack(t: LivingEntity, power: number): void {
    const a = new Arrow(this.level, this);
    a.setBaseDamageFromMob(power, DIFFICULTY_ID[this.level.difficulty] ?? 2);
    const d0 = t.x - this.x;
    const d1 = t.y + t.height / 3 - a.y;
    const d2 = t.z - this.z;
    const d3 = Math.sqrt(d0 * d0 + d2 * d2);
    a.shoot(d0, d1 + d3 * 0.2, d2, 1.6, 14 - (DIFFICULTY_ID[this.level.difficulty] ?? 2) * 4);
    this.playSound('entity.skeleton.shoot', 1, 1 / (this.random.nextFloat() * 0.4 + 0.8));
    this.level.addEntity(a);
  }
  override ambientSound(): string {
    return 'entity.skeleton.ambient';
  }
  override hurtSound(): string {
    return 'entity.skeleton.hurt';
  }
  override deathSound(): string {
    return 'entity.skeleton.death';
  }
  override stepSound(): string {
    return 'entity.skeleton.step';
  }
  override lootTable(): LootEntry[] {
    return [
      { item: 'arrow', min: 0, max: 2 },
      { item: 'bone', min: 0, max: 2 },
    ];
  }
}

// ---------------------------------------------------------------------------

class SwellGoal extends Goal {
  private target: LivingEntity | null = null;
  constructor(readonly creeper: Creeper) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const c = this.creeper, t = c.target;
    return c.swellDir > 0 || (t !== null && c.distanceToSqr(t.x, t.y, t.z) < 9);
  }
  override start(): void {
    this.creeper.navigation.stop();
    this.target = this.creeper.target;
  }
  override stop(): void {
    this.target = null;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const c = this.creeper, t = this.target;
    if (!t) c.swellDir = -1;
    else if (c.distanceToSqr(t.x, t.y, t.z) > 49) c.swellDir = -1;
    else if (!c.sensing.hasLineOfSight(t)) c.swellDir = -1;
    else c.swellDir = 1;
  }
}

export class Creeper extends Monster {
  readonly type = 'creeper';
  swell = 0;
  oldSwell = 0;
  swellDir = -1;
  readonly maxSwell = 30;
  explosionRadius = 3;
  ignited = false;
  powered = false;
  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.7);
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.25;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(2, new SwellGoal(this));
    this.goalSelector.addGoal(4, new MeleeAttackGoal(this, 1.0, false));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.8));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(6, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new NearestAttackablePlayerGoal(this, true));
    this.targetSelector.addGoal(2, new HurtByTargetGoal(this));
  }
  override maxFallDistance(): number {
    return this.target ? 3 + Math.floor(this.health - 1) : 3;
  }
  protected override causeFallDamage(dist: number): void {
    super.causeFallDamage(dist);
    this.swell = Math.min(this.swell + dist * 1.5, this.maxSwell - 5);
  }
  override tick(): void {
    if (this.isAlive) {
      this.oldSwell = this.swell;
      if (this.ignited) this.swellDir = 1;
      if (this.swellDir > 0 && this.swell === 0) this.playSound('entity.creeper.primed', 1, 0.5);
      this.swell += this.swellDir;
      if (this.swell < 0) this.swell = 0;
      if (this.swell >= this.maxSwell) {
        this.swell = this.maxSwell;
        this.explodeCreeper();
      }
    }
    super.tick();
  }
  /** vanilla Creeper.getSwelling */
  swelling(p: number): number {
    return (this.oldSwell + (this.swell - this.oldSwell) * p) / (this.maxSwell - 2);
  }
  private explodeCreeper(): void {
    const f = this.powered ? 2 : 1;
    this.dead = true;
    explode(this.level, this, this.x, this.y, this.z, this.explosionRadius * f, false, 'mob');
    this.remove();
  }
  /** flint and steel ignites the creeper */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (!stack || (stack.item.id !== 'flint_and_steel' && stack.item.id !== 'fire_charge')) return false;
    this.level.sound.play(stack.item.id === 'fire_charge' ? 'item.firecharge.use' : 'item.flintandsteel.use', this.x, this.y, this.z, 1, this.random.nextFloat() * 0.4 + 0.8);
    this.ignited = true;
    if (p.gameMode !== 'creative') {
      if (stack.item.maxDamage) {
        stack.damage++;
        if (stack.damage >= stack.item.maxDamage) p.inventory.setSelectedItem(null);
      } else p.inventory.consumeSelected(1);
      p.inventory.version++;
    }
    return true;
  }
  override hurtSound(): string {
    return 'entity.creeper.hurt';
  }
  override deathSound(): string {
    return 'entity.creeper.death';
  }
  override lootTable(): LootEntry[] {
    return [{ item: 'gunpowder', min: 0, max: 2 }];
  }
}

// ---------------------------------------------------------------------------

class SpiderAttackGoal extends MeleeAttackGoal {
  override canContinueToUse(): boolean {
    const f = this.mob.lightMagic();
    if (f >= 0.5 && this.mob.random.nextInt(100) === 0) {
      this.mob.setTarget(null);
      return false;
    }
    return super.canContinueToUse();
  }
}

class SpiderTargetGoal extends NearestAttackablePlayerGoal {
  protected override extraCondition(): boolean {
    return this.mob.lightMagic() < 0.5;
  }
}

export class Spider extends Monster {
  readonly type = 'spider';
  constructor(level: Level) {
    super(level);
    this.setSize(1.4, 0.9);
    this.maxHealth = this.health = 16;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 2;
    this.followRange = 16;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(3, new LeapAtTargetGoal(this, 0.4));
    this.goalSelector.addGoal(4, new SpiderAttackGoal(this, 1.0, true));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.8));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(6, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new SpiderTargetGoal(this, true));
  }
  override get eyeHeight(): number {
    return 0.65;
  }
  /** vanilla Spider: climbs whenever pushing against a wall */
  override onClimbable(): boolean {
    return this.horizontalCollision;
  }
  override ambientSound(): string {
    return 'entity.spider.ambient';
  }
  override hurtSound(): string {
    return 'entity.spider.hurt';
  }
  override deathSound(): string {
    return 'entity.spider.death';
  }
  override stepSound(): string {
    return 'entity.spider.step';
  }
  override lootTable(): LootEntry[] {
    return [
      { item: 'string', min: 0, max: 2 },
      { item: 'spider_eye', min: -1, max: 1, player: true },
    ];
  }
}

