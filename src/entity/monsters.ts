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
import { BLOCKS, STATE_BLOCK, FLAGS, F_OPAQUE, F_FULL_COLLISION, F_AIR, F_COLLIDE, F_WATER } from '../world/block';
import { Arrow } from './arrow';
import { explode } from '../game/explosion';
import { clipBlocks } from '../game/raycast';
import { canSurvive } from '../game/blockRules';
import { AABB } from '../core/aabb';
import { PathType } from './ai/pathfinder';
import { MoveControl, MoveOp, rotlerp } from './ai/controls';
import { reducedTickDelay } from './ai/goal';

const DIFFICULTY_ID: Record<string, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

export abstract class Monster extends Mob {
  protected override swimSplashSound(): string {
    return 'entity.hostile.splash';
  }

  protected override swimHighSpeedSplashSound(): string {
    return 'entity.hostile.splash';
  }

  /** vanilla Monster.isPreventingPlayerRest: hostile mobs nearby stop you sleeping */
  isPreventingPlayerRest(_p: Entity): boolean {
    return this.isAlive;
  }
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
  /** vanilla EntityType ridingOffset(-0.7) (halved for babies) */
  override vehicleAttachmentY(): number {
    return this.baby ? 0.35 : 0.7;
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
  /** vanilla EntityType ridingOffset(-0.7) */
  override vehicleAttachmentY(): number {
    return 0.7;
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


// ---------------------------------------------------------------------------
// Enderman (vanilla EnderMan): stare aggro, teleporting, block carrying

/** vanilla #enderman_holdable */
const HOLDABLE = new Set([
  'grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'sand', 'red_sand', 'gravel', 'dandelion', 'poppy', 'blue_orchid',
  'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley',
  'brown_mushroom', 'red_mushroom', 'tnt', 'cactus', 'clay', 'pumpkin', 'carved_pumpkin', 'melon', 'moss_block', 'mud',
]);

export function isLookingAt(p: Player, e: Entity, eyeY: number): boolean {
  const head = p.inventory.armor[3];
  if (head && head.item.id === 'carved_pumpkin') return false;
  const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
  const lx = -Math.sin(yr) * Math.cos(pr), ly = -Math.sin(pr), lz = Math.cos(yr) * Math.cos(pr);
  let vx = e.x - p.x, vy = eyeY - (p.y + p.eyeHeight), vz = e.z - p.z;
  const d0 = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (d0 < 1e-6) return false;
  vx /= d0;
  vy /= d0;
  vz /= d0;
  return lx * vx + ly * vy + lz * vz > 1 - 0.025 / d0;
}

class EndermanFreezeWhenLookedAtGoal extends Goal {
  private target: Player | null = null;
  constructor(readonly e: Enderman) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  canUse(): boolean {
    const t = this.e.target;
    if (!t || t.type !== 'player') return false;
    this.target = t as Player;
    if (this.e.distanceToSqr(t.x, t.y, t.z) > 256) return false;
    return isLookingAt(this.target, this.e, this.e.y + this.e.eyeHeight) && this.target.hasLineOfSight(this.e);
  }
  override start(): void {
    this.e.navigation.stop();
  }
  override tick(): void {
    const t = this.target!;
    this.e.lookControl.setLookAt(t.x, t.y + t.eyeHeight, t.z);
  }
}

class EndermanLookForPlayerGoal extends NearestAttackablePlayerGoal {
  private pending: Player | null = null;
  private aggroTime = 0;
  private teleportTime = 0;
  private current: Player | null = null;
  constructor(readonly e: Enderman) {
    super(e, false);
  }
  override canUse(): boolean {
    const p = this.e.level.player;
    this.pending = null;
    if (!p || !this.e.canAttack(p)) return false;
    if (this.e.distanceToSqr(p.x, p.y, p.z) > this.e.followRange * this.e.followRange) return false;
    if (isLookingAt(p, this.e, this.e.y + this.e.eyeHeight) && p.hasLineOfSight(this.e)) this.pending = p;
    return this.pending !== null;
  }
  override start(): void {
    this.aggroTime = this.adjustedTickDelay(5);
    this.teleportTime = 0;
  }
  override stop(): void {
    this.pending = null;
    this.current = null;
    super.stop();
  }
  override canContinueToUse(): boolean {
    if (this.pending) {
      if (!isLookingAt(this.pending, this.e, this.e.y + this.e.eyeHeight)) return false;
      this.e.lookAtEntity(this.pending, 10, 10);
      return true;
    }
    if (this.current && this.e.canAttack(this.current)) return true;
    return super.canContinueToUse();
  }
  override tick(): void {
    if (this.pending) {
      if (--this.aggroTime <= 0) {
        this.current = this.pending;
        this.pending = null;
        this.e.setTarget(this.current);
        this.e.playStareSound();
      }
      return;
    }
    const t = this.current;
    if (t) {
      if (isLookingAt(t, this.e, this.e.y + this.e.eyeHeight)) {
        if (t.distanceToSqr(this.e.x, this.e.y, this.e.z) < 16) this.e.teleport();
        this.teleportTime = 0;
      } else if (t.distanceToSqr(this.e.x, this.e.y, this.e.z) > 256 && this.teleportTime++ >= this.adjustedTickDelay(30) && this.e.teleportTowards(t)) {
        this.teleportTime = 0;
      }
    }
  }
}

class EndermanTakeBlockGoal extends Goal {
  constructor(readonly e: Enderman) {
    super();
  }
  canUse(): boolean {
    if (this.e.carried) return false;
    if (!this.e.level.gameRules.mobGriefing) return false;
    return this.e.random.nextInt(reducedTickDelay(20)) === 0;
  }
  override tick(): void {
    const e = this.e, r = e.random, lvl = e.level;
    const i = Math.floor(e.x - 2 + r.nextDouble() * 4), j = Math.floor(e.y + r.nextDouble() * 3), k = Math.floor(e.z - 2 + r.nextDouble() * 4);
    const st = lvl.world.getState(i, j, k);
    const name = BLOCKS[STATE_BLOCK[st]].name;
    if (!HOLDABLE.has(name)) return;
    // line of sight from the enderman's column to the block
    const hit = clipBlocks(lvl.world, Math.floor(e.x) + 0.5, j + 0.5, Math.floor(e.z) + 0.5, i + 0.5, j + 0.5, k + 0.5);
    if (hit && (hit.x !== i || hit.y !== j || hit.z !== k)) return;
    lvl.setBlock(i, j, k, 0);
    e.carried = BLOCKS[STATE_BLOCK[st]].defaultState;
  }
}

class EndermanLeaveBlockGoal extends Goal {
  constructor(readonly e: Enderman) {
    super();
  }
  canUse(): boolean {
    if (!this.e.carried) return false;
    if (!this.e.level.gameRules.mobGriefing) return false;
    return this.e.random.nextInt(reducedTickDelay(2000)) === 0;
  }
  override tick(): void {
    const e = this.e, r = e.random, lvl = e.level, w = lvl.world;
    const i = Math.floor(e.x - 1 + r.nextDouble() * 2), j = Math.floor(e.y + r.nextDouble() * 2), k = Math.floor(e.z - 1 + r.nextDouble() * 2);
    const target = w.getState(i, j, k), below = w.getState(i, j - 1, k);
    if (!(FLAGS[target] & F_AIR) || FLAGS[below] & F_AIR) return;
    if (BLOCKS[STATE_BLOCK[below]].name === 'bedrock' || !(FLAGS[below] & F_FULL_COLLISION)) return;
    if (!canSurvive(w, i, j, k, e.carried)) return;
    if (lvl.getEntities(new AABB(i, j, k, i + 1, j + 1, k + 1), undefined, e).length) return;
    lvl.setBlock(i, j, k, e.carried);
    e.carried = 0;
  }
}

export class Enderman extends Monster {
  readonly type = 'enderman';
  carried = 0;
  creepy = false;
  private targetChangeTime = 0;
  private lastStareSound = -1000;
  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 2.9);
    this.maxHealth = this.health = 40;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 7;
    this.followRange = 64;
    this.stepHeight = 1;
    this.setPathfindingMalus(PathType.WATER, -1);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new EndermanFreezeWhenLookedAtGoal(this));
    this.goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false));
    this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 1.0, 0));
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    this.goalSelector.addGoal(10, new EndermanLeaveBlockGoal(this));
    this.goalSelector.addGoal(11, new EndermanTakeBlockGoal(this));
    this.targetSelector.addGoal(1, new EndermanLookForPlayerGoal(this));
    this.targetSelector.addGoal(2, new HurtByTargetGoal(this));
  }
  override get eyeHeight(): number {
    return 2.55;
  }
  override setTarget(e: LivingEntity | null): void {
    super.setTarget(e);
    if (!e) {
      this.targetChangeTime = 0;
      this.creepy = false;
      this.moveSpeedAttr = 0.3;
    } else {
      this.targetChangeTime = this.tickCount;
      this.creepy = true;
      this.moveSpeedAttr = 0.45;
    }
  }
  playStareSound(): void {
    if (this.tickCount >= this.lastStareSound + 400) {
      this.lastStareSound = this.tickCount;
      this.playSound('entity.enderman.stare', 2.5, 1);
    }
  }
  override aiStep(): void {
    // portal particles (client)
    for (let i = 0; i < 2; i++) {
      const r = this.random;
      this.level.particles.spawn?.('portal', this.x + (r.nextDouble() - 0.5) * this.width, this.y + r.nextDouble() * this.height - 0.25, this.z + (r.nextDouble() - 0.5) * this.width, (r.nextDouble() - 0.5) * 2, -r.nextDouble(), (r.nextDouble() - 0.5) * 2);
    }
    // vanilla isSensitiveToWater
    if (this.isAlive && this.isInWaterOrRainNow()) this.hurt(1, 'drown');
    super.aiStep();
  }
  protected override customServerAiStep(): void {
    if (this.level.isDay() && this.tickCount >= this.targetChangeTime + 600) {
      const f = this.lightMagic();
      if (f > 0.5 && this.level.canSeeSky(Math.floor(this.x), Math.floor(this.y + this.eyeHeight), Math.floor(this.z)) && this.random.nextFloat() * 30 < (f - 0.4) * 2) {
        this.setTarget(null);
        this.teleport();
      }
    }
  }
  teleport(): boolean {
    if (!this.isAlive) return false;
    const x = this.x + (this.random.nextDouble() - 0.5) * 64;
    const y = this.y + (this.random.nextInt(64) - 32);
    const z = this.z + (this.random.nextDouble() - 0.5) * 64;
    return this.teleportTo(x, y, z);
  }
  teleportTowards(t: Entity): boolean {
    let vx = this.x - t.x, vy = this.y + this.height * 0.5 - (t.y + t.eyeHeight), vz = this.z - t.z;
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= l;
    vy /= l;
    vz /= l;
    const x = this.x + (this.random.nextDouble() - 0.5) * 8 - vx * 16;
    const y = this.y + (this.random.nextInt(16) - 8) - vy * 16;
    const z = this.z + (this.random.nextDouble() - 0.5) * 8 - vz * 16;
    return this.teleportTo(x, y, z);
  }
  /** vanilla EnderMan.teleport(x,y,z) + LivingEntity.randomTeleport */
  private teleportTo(x: number, y: number, z: number): boolean {
    const w = this.level.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    let by = Math.floor(y);
    if (!w.isLoaded(bx, bz)) return false;
    while (by > -64 && !(FLAGS[w.getState(bx, by, bz)] & F_COLLIDE)) by--;
    const below = w.getState(bx, by, bz);
    if (!(FLAGS[below] & F_COLLIDE) || FLAGS[below] & F_WATER) return false;
    const ox = this.x, oy = this.y, oz = this.z;
    this.setPos(bx + 0.5, by + 1, bz + 0.5);
    if (!this.isFree(this.bb)) {
      this.setPos(ox, oy, oz);
      return false;
    }
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.navigation.stop();
    for (let i = 0; i < 128; i++) {
      const d = i / 127, r = this.random;
      const px = ox + (this.x - ox) * d + (r.nextDouble() - 0.5) * this.width * 2;
      const py = oy + (this.y - oy) * d + r.nextDouble() * this.height;
      const pz = oz + (this.z - oz) * d + (r.nextDouble() - 0.5) * this.width * 2;
      this.level.particles.spawn?.('portal', px, py, pz, (r.nextFloat() - 0.5) * 0.2, (r.nextFloat() - 0.5) * 0.2, (r.nextFloat() - 0.5) * 0.2);
    }
    this.level.sound.play('entity.enderman.teleport', ox, oy, oz, 1, 1);
    this.playSound('entity.enderman.teleport', 1, 1);
    return true;
  }
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (source === 'arrow' || (direct && direct !== attacker)) {
      // projectiles never hit endermen: they teleport away
      for (let i = 0; i < 64; i++) if (this.teleport()) return false;
      return false;
    }
    const ok = super.hurt(amount, source, attacker, direct);
    if (!(attacker instanceof Mob || (attacker && attacker.type === 'player')) && this.random.nextInt(10) !== 0) this.teleport();
    return ok;
  }
  override ambientSound(): string {
    return this.creepy ? 'entity.enderman.scream' : 'entity.enderman.ambient';
  }
  override hurtSound(): string {
    return 'entity.enderman.hurt';
  }
  override deathSound(): string {
    return 'entity.enderman.death';
  }
  override lootTable(): LootEntry[] {
    return [{ item: 'ender_pearl', min: 0, max: 1 }];
  }
  protected override dropLoot(byPlayer: boolean): void {
    super.dropLoot(byPlayer);
    if (this.carried) {
      const it = ITEMS.get(BLOCKS[STATE_BLOCK[this.carried]].name);
      if (it) this.spawnAtLocation(new ItemStack(it, 1));
      this.carried = 0;
    }
  }
  protected override saveData(): Record<string, number | string | boolean> {
    return { carried: this.carried ? BLOCKS[STATE_BLOCK[this.carried]].name : '' };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    const n = String(d.carried ?? '');
    const b = n ? BLOCKS.find((x) => x.name === n) : undefined;
    this.carried = b ? b.defaultState : 0;
  }
}

// ---------------------------------------------------------------------------
// Slime (vanilla Slime): jumping movement, splitting, contact damage

class SlimeMoveControl extends MoveControl {
  yRot = 0;
  jumpDelay = 0;
  aggressive = false;
  constructor(readonly slime: Slime) {
    super(slime);
    this.yRot = (slime.yaw * 180) / Math.PI;
  }
  setDirection(yRot: number, aggressive: boolean): void {
    this.yRot = yRot;
    this.aggressive = aggressive;
  }
  setWantedMovement(speed: number): void {
    this.speedModifier = speed;
    this.operation = MoveOp.MOVE_TO;
  }
  override tick(): void {
    const m = this.slime;
    m.yaw = rotlerp(m.yaw, this.yRot, 90);
    m.headYaw = m.yaw;
    m.bodyYaw = m.yaw;
    if (this.operation !== MoveOp.MOVE_TO) {
      m.zza = 0;
      return;
    }
    this.operation = MoveOp.WAIT;
    if (m.onGround) {
      m.setSpeed(this.speedModifier * m.moveSpeedAttr);
      if (this.jumpDelay-- <= 0) {
        this.jumpDelay = m.jumpDelay();
        if (this.aggressive) this.jumpDelay = Math.floor(this.jumpDelay / 3);
        m.jumpControl.jump();
        m.playSound(m.size === 1 ? 'entity.slime.jump_small' : 'entity.slime.jump', m.soundVolume(), ((m.random.nextFloat() - m.random.nextFloat()) * 0.2 + 1) * 0.8);
      } else {
        m.xxa = 0;
        m.zza = 0;
        m.setSpeed(0);
      }
    } else m.setSpeed(this.speedModifier * m.moveSpeedAttr);
  }
}

class SlimeFloatGoal extends Goal {
  constructor(readonly s: Slime) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
    s.navigation.canFloat = true;
  }
  canUse(): boolean {
    return this.s.inWater || this.s.inLava;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    if (this.s.random.nextFloat() < 0.8) this.s.jumpControl.jump();
    (this.s.moveControl as SlimeMoveControl).setWantedMovement(1.2);
  }
}

class SlimeAttackGoal extends Goal {
  private tired = 0;
  constructor(readonly s: Slime) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.s.target;
    return !!t && t.isAlive && this.s.canAttack(t);
  }
  override start(): void {
    this.tired = reducedTickDelay(300);
  }
  override canContinueToUse(): boolean {
    const t = this.s.target;
    if (!t || !t.isAlive || !this.s.canAttack(t)) return false;
    return --this.tired > 0;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const t = this.s.target;
    if (t) this.s.lookAtEntity(t, 10, 10);
    (this.s.moveControl as SlimeMoveControl).setDirection(this.s.yaw, this.s.dealsDamage());
  }
}

class SlimeRandomDirectionGoal extends Goal {
  private chosen = 0;
  private next = 0;
  constructor(readonly s: Slime) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    return !this.s.target && (this.s.onGround || this.s.inWater || this.s.inLava);
  }
  override tick(): void {
    if (--this.next <= 0) {
      this.next = this.adjustedTickDelay(40 + this.s.random.nextInt(60));
      this.chosen = this.s.random.nextInt(360);
    }
    (this.s.moveControl as SlimeMoveControl).setDirection(this.chosen, false);
  }
}

class SlimeKeepOnJumpingGoal extends Goal {
  constructor(readonly s: Slime) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  canUse(): boolean {
    return true;
  }
  override tick(): void {
    (this.s.moveControl as SlimeMoveControl).setWantedMovement(1);
  }
}

export class Slime extends Monster {
  /** vanilla Slime is not a Monster: slimes never keep you awake */
  override isPreventingPlayerRest(_p: Entity): boolean {
    return false;
  }
  readonly type = 'slime';
  size = 1;
  squish = 0;
  oSquish = 0;
  targetSquish = 0;
  private wasOnGround = false;
  constructor(level: Level) {
    super(level);
    this.moveControl = new SlimeMoveControl(this);
    this.setSlimeSize(1, true);
  }
  setSlimeSize(size: number, resetHealth: boolean): void {
    const i = Math.max(1, Math.min(127, size));
    this.size = i;
    this.setSize(0.52 * i, 0.52 * i);
    this.maxHealth = i * i;
    this.moveSpeedAttr = 0.2 + 0.1 * i;
    this.attackDamage = i;
    if (resetHealth) this.health = this.maxHealth;
    this.xpReward = i;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new SlimeFloatGoal(this));
    this.goalSelector.addGoal(2, new SlimeAttackGoal(this));
    this.goalSelector.addGoal(3, new SlimeRandomDirectionGoal(this));
    this.goalSelector.addGoal(5, new SlimeKeepOnJumpingGoal(this));
    this.targetSelector.addGoal(1, new NearestAttackablePlayerGoal(this, true));
  }
  override get eyeHeight(): number {
    return 0.625 * 0.52 * this.size;
  }
  jumpDelay(): number {
    return this.random.nextInt(20) + 10;
  }
  dealsDamage(): boolean {
    return this.size > 1;
  }
  override soundVolume(): number {
    return 0.4 * this.size;
  }
  override jumpFromGround(): void {
    this.dy = this.jumpPower();
  }
  override tick(): void {
    this.squish += (this.targetSquish - this.squish) * 0.5;
    this.oSquish = this.squish;
    super.tick();
    if (this.removed) return;
    if (this.onGround && !this.wasOnGround) {
      const f = this.width * 2, f1 = f / 2;
      for (let i = 0; i < f * 16; i++) {
        const a = this.random.nextFloat() * Math.PI * 2, r = this.random.nextFloat() * 0.5 + 0.5;
        this.level.particles.spawn?.('item_slime', this.x + Math.sin(a) * f1 * r, this.y, this.z + Math.cos(a) * f1 * r, 0, 0, 0);
      }
      this.playSound(this.size === 1 ? 'entity.slime.squish_small' : 'entity.slime.squish', this.soundVolume(), ((this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1) / 0.8);
      this.targetSquish = -0.5;
    } else if (!this.onGround && this.wasOnGround) this.targetSquish = 1;
    this.wasOnGround = this.onGround;
    this.targetSquish *= 0.6;
  }
  /** vanilla Slime.playerTouch → dealDamage */
  touchPlayer(p: Player): void {
    if (!this.dealsDamage() || !this.isAlive) return;
    if (this.isWithinMeleeAttackRange(p) && this.hasLineOfSight(p)) {
      if (p.hurt(this.attackDamage, 'mob', this)) this.playSound('entity.slime.attack', 1, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
    }
  }
  override finalizeSpawn(): void {
    let i = this.random.nextInt(3);
    const mul = this.level.difficulty === 'hard' ? 1 : 0;
    if (i < 2 && this.random.nextFloat() < 0.5 * mul) i++;
    this.setSlimeSize(1 << i, true);
  }
  override hurtSound(): string {
    return this.size === 1 ? 'entity.slime.hurt_small' : 'entity.slime.hurt';
  }
  override deathSound(): string {
    return this.size === 1 ? 'entity.slime.death_small' : 'entity.slime.death';
  }
  override lootTable(): LootEntry[] {
    return this.size === 1 ? [{ item: 'slime_ball', min: 0, max: 2 }] : [];
  }
  /** vanilla Slime.remove: split into 2-4 smaller slimes */
  override remove(): void {
    if (!this.removed && this.size > 1 && this.health <= 0) {
      const f1 = this.width / 2, j = this.size / 2, k = 2 + this.random.nextInt(3);
      for (let l = 0; l < k; l++) {
        const f2 = ((l % 2) - 0.5) * f1, f3 = (Math.floor(l / 2) - 0.5) * f1;
        const s = new Slime(this.level);
        s.setSlimeSize(j, true);
        s.persistenceRequired = this.persistenceRequired;
        s.moveTo(this.x + f2, this.y + 0.5, this.z + f3, this.random.nextFloat() * 360, 0);
        this.level.addEntity(s);
      }
    }
    super.remove();
  }
  protected override saveData(): Record<string, number | string | boolean> {
    return { size: this.size };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.setSlimeSize(Number(d.size ?? 1), false);
  }
  /** vanilla checkSlimeSpawnRules (swamp surface at night, or slime chunks below y=40) */
  static checkSlimeSpawn(level: Level, x: number, y: number, z: number, rand: () => number, slimeChunk: boolean, swamp: boolean, moon: number): boolean {
    if (level.difficulty === 'peaceful') return false;
    if (swamp && y > 50 && y < 70 && rand() < 0.5 && rand() < moon && level.rawBrightness(x, y, z) <= Math.floor(rand() * 8)) return validSpawnBlock(level, x, y - 1, z);
    if (Math.floor(rand() * 10) === 0 && slimeChunk && y < 40) return validSpawnBlock(level, x, y - 1, z);
    return false;
  }
}
