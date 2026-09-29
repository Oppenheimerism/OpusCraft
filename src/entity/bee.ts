// (remaining mobs: the bee) The bee (vanilla 1.21 Bee): a small striped flyer that lives in a bee nest or a beehive
// (game/beehive.ts), up to three to a hive. By day it drifts about near home, finds a flower within a few blocks and
// hovers over it for twenty seconds or more, then comes back dusted with pollen and goes in to make honey; on the way it
// may grow a crop under it (up to ten). At night, in the rain, or after three minutes finding nothing it goes home too.
// Flowers tempt it and breed two of them. It's neutral: hurt one, or take honey from its hive, break its hive, and it
// and the bees about go for you, its eyes red; its sting poisons (ten seconds on normal, eighteen on hard, none on easy),
// costs it its stinger, and it dies within the minute. It drowns after a second under water, never takes fall damage,
// and hums as it goes, higher the younger it is.

import { Animal, TemptGoal, BreedGoal, FollowParentGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, Mob } from './mob';
import { angryAtData, angryAtFrom } from './mob';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import { Goal, Flag } from './ai/goal';
import { FloatGoal, HurtByTargetGoal, MeleeAttackGoal, NearestAttackablePlayerGoal, hoverRandomPos, airAndWaterRandomPos, airRandomPosTowards } from './ai/goals';
import { FlyingPathNavigation, type PathNavigation } from './ai/navigation';
import { FlyingMoveControl, LookControl } from './ai/controls';
import { PathType, type Path } from './ai/pathfinder';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import { MIN_Y, MAX_Y } from '../world/constants';
import { BeehiveBlockEntity, isHive, isNight, parsePos } from '../game/beehive';
import { boneMealParticles, performBoneMeal } from '../game/boneMeal';
import { doPostAttackEffects } from '../game/enchantEffects';
import { AABB } from '../core/aabb';

type Pos = [number, number, number];

/**
 * vanilla #flowers (the bees' food, #bee_food, and what they pollinate), as far as the game has them: the small
 * flowers, the tall ones, flowering azalea (and its leaves), the mangrove propagule, cherry leaves, pink petals, the
 * chorus flower and the spore blossom
 */
export const FLOWERS = new Set([
  'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy',
  'cornflower', 'lily_of_the_valley', 'wither_rose', 'torchflower', 'sunflower', 'lilac', 'peony', 'rose_bush', 'pitcher_plant',
  'flowering_azalea_leaves', 'flowering_azalea', 'mangrove_propagule', 'cherry_leaves', 'pink_petals', 'chorus_flower', 'spore_blossom',
]);

/** vanilla Bee.TICKS_PER_FLAP: Mth.ceil(1.4959966) */
const TICKS_PER_FLAP = 2;

/** vanilla BlockPos.closerThan: within `d` of the block, block to block */
function closerThan(a: Pos, b: Pos, d: number): boolean {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < d * d;
}

/** vanilla BeePollinateGoal's VALID_POLLINATION_BLOCKS: a flower, not waterlogged, a sunflower only at its top */
function isPollinationBlock(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  if (!FLOWERS.has(b.name)) return false;
  if (b.propIndex('waterlogged') >= 0 && b.get(st, 'waterlogged')) return false;
  return b.name !== 'sunflower' || b.get(st, 'half') === 'upper';
}

export class Bee extends Animal {
  readonly type = 'bee';
  protected adultWidth = 0.7;
  protected adultHeight = 0.6;
  /** vanilla DATA_FLAGS_ID's flags: carrying nectar, stung (its stinger gone), rolling as it attacks */
  hasNectar = false;
  hasStung = false;
  rolling = false;
  /** vanilla NeutralMob: ticks of anger left (DATA_REMAINING_ANGER_TIME), and at whom */
  angerTime = 0;
  angerTarget: LivingEntity | null = null;
  /** vanilla hivePos and savedFlowerPos */
  hivePos: Pos | null = null;
  savedFlowerPos: Pos | null = null;
  /** vanilla rollAmount and rollAmountO (worked out on each game from `rolling`, so kept where the host doesn't send them) */
  readonly roll = { amount: 0, amountO: 0 };
  /**
   * what only the host's tick counts (kept in one record, which isn't sent to guests): vanilla timeSinceSting,
   * ticksWithoutNectarSinceExitingHive, stayOutOfHiveCountdown, numCropsGrownSincePollination,
   * remainingCooldownBeforeLocatingNewHive and ...NewFlower, underWaterTicks
   */
  readonly clock = { timeSinceSting: 0, ticksWithoutNectar: 0, stayOutOfHive: 0, cropsGrown: 0, hiveCooldown: 0, flowerCooldown: 0, underWater: 0 };
  pollinateGoal: BeePollinateGoal | null = null;
  goToHiveGoal: BeeGoToHiveGoal | null = null;
  goToKnownFlowerGoal: BeeGoToKnownFlowerGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.7, 0.6);
    this.maxHealth = this.health = 10;
    this.flyingSpeedAttr = 0.6;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 2;
    this.followRange = 48;
    this.moveControl = new FlyingMoveControl(this, 20, true);
    (this as { lookControl: LookControl }).lookControl = new BeeLookControl(this);
    this.setPathfindingMalus(PathType.DANGER_FIRE, -1);
    this.setPathfindingMalus(PathType.WATER, -1);
    this.setPathfindingMalus(PathType.WATER_BORDER, 16);
    this.setPathfindingMalus(PathType.COCOA, -1);
    this.setPathfindingMalus(PathType.FENCE, -1);
    // (vanilla remainingCooldownBeforeLocatingNewFlower = Mth.nextInt(random, 20, 60))
    this.clock.flowerCooldown = 20 + this.random.nextInt(41);
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new BeeAttackGoal(this, 1.4, true));
    this.goalSelector.addGoal(1, new BeeEnterHiveGoal(this));
    this.goalSelector.addGoal(2, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(3, new TemptGoal(this, 1.25, FLOWERS));
    this.pollinateGoal = new BeePollinateGoal(this);
    this.goalSelector.addGoal(4, this.pollinateGoal);
    this.goalSelector.addGoal(5, new FollowParentGoal(this, 1.25));
    this.goalSelector.addGoal(5, new BeeLocateHiveGoal(this));
    this.goToHiveGoal = new BeeGoToHiveGoal(this);
    this.goalSelector.addGoal(5, this.goToHiveGoal);
    this.goToKnownFlowerGoal = new BeeGoToKnownFlowerGoal(this);
    this.goalSelector.addGoal(6, this.goToKnownFlowerGoal);
    this.goalSelector.addGoal(7, new BeeGrowCropGoal(this));
    this.goalSelector.addGoal(8, new BeeWanderGoal(this));
    this.goalSelector.addGoal(9, new FloatGoal(this));
    this.targetSelector.addGoal(1, new BeeHurtByOtherGoal(this).setAlertOthers());
    this.targetSelector.addGoal(2, new BeeBecomeAngryTargetGoal(this));
    // (vanilla ResetUniversalAngerTargetGoal: only with the universalAnger game rule)
    this.targetSelector.addGoal(3, new ResetUniversalAngerTargetGoal(this));
  }

  /** vanilla createNavigation: through the air to where there's something under it, never opening doors, not floating */
  protected override createNavigation(): PathNavigation {
    const n = new BeeNavigation(this);
    n.canOpenDoors = false;
    n.canFloat = false;
    return n;
  }

  override get eyeHeight(): number {
    return this.isBaby() ? 0.15 : 0.3;
  }

  override isFlyingAnimal(): boolean {
    return true;
  }

  /** vanilla isFlying: off the ground */
  isFlying(): boolean {
    return !this.onGround;
  }

  /** vanilla getWalkTargetValue: open air is best, anything else nothing */
  override walkTargetValue(x: number, y: number, z: number): number {
    return FLAGS[this.level.world.getState(x, y, z)] & F_AIR ? 10 : 0;
  }

  // --- food and breeding -----------------------------------------------------------------------------------------

  /** vanilla isFood: #bee_food (the flowers) */
  isFood(s: ItemStack): boolean {
    return FLOWERS.has(s.item.id);
  }

  makeBaby(): Animal {
    return new Bee(this.level);
  }

  // --- nectar, the hive, flowers -----------------------------------------------------------------------------------

  /** vanilla setHasNectar (taking nectar on, the count since it last had any starts again) */
  setHasNectar(v: boolean): void {
    if (v) this.clock.ticksWithoutNectar = 0;
    this.hasNectar = v;
  }

  /** vanilla dropOffNectar: its nectar left in the hive */
  dropOffNectar(): void {
    this.setHasNectar(false);
    this.clock.cropsGrown = 0;
  }

  /** vanilla stayOutOfHiveCountdown */
  get stayOutOfHiveCountdown(): number {
    return this.clock.stayOutOfHive;
  }
  set stayOutOfHiveCountdown(v: number) {
    this.clock.stayOutOfHive = v;
  }

  /** vanilla blockPosition */
  blockPos(): Pos {
    return [Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)];
  }

  /** vanilla Bee.closerThan */
  closerThan(p: Pos, d: number): boolean {
    return closerThan(p, this.blockPos(), d);
  }

  /** vanilla isTooFarAway: 32 blocks or more from it */
  isTooFarAway(p: Pos): boolean {
    return !this.closerThan(p, 32);
  }

  /** vanilla isHiveValid: a hive (its block entity there) not too far off */
  isHiveValid(): boolean {
    const h = this.hivePos;
    if (!h || this.isTooFarAway(h)) return false;
    return this.level.world.getBlockEntity(h[0], h[1], h[2]) instanceof BeehiveBlockEntity;
  }

  /** vanilla doesHiveHaveSpace */
  doesHiveHaveSpace(p: Pos): boolean {
    const be = this.level.world.getBlockEntity(p[0], p[1], p[2]);
    return be instanceof BeehiveBlockEntity && !be.isFull();
  }

  /** vanilla isHiveNearFire */
  private isHiveNearFire(): boolean {
    const h = this.hivePos;
    if (!h) return false;
    const be = this.level.world.getBlockEntity(h[0], h[1], h[2]);
    return be instanceof BeehiveBlockEntity && be.isFireNearby(this.level);
  }

  /** vanilla isFlowerValid: a flower there, where the world is loaded */
  isFlowerValid(p: Pos): boolean {
    return this.level.world.isLoaded(p[0], p[2]) && FLOWERS.has(BLOCKS[STATE_BLOCK[this.level.world.getState(p[0], p[1], p[2])]].name);
  }

  /**
   * vanilla wantsToEnterHive: free to (not kept out, not pollinating, not stung, nothing to go for) and tired of
   * looking (three minutes without nectar), or it's raining, or night, or it has nectar to leave; not with fire by
   * its hive
   */
  wantsToEnterHive(): boolean {
    if (this.clock.stayOutOfHive > 0 || this.pollinateGoal?.isPollinating() || this.hasStung || this.target) return false;
    const go = this.clock.ticksWithoutNectar > 3600 || this.level.isRaining() || isNight(this.level) || this.hasNectar;
    return go && !this.isHiveNearFire();
  }

  /**
   * vanilla pathfindRandomlyTowards: a random point in the air on the way to `p` (6 or 8 blocks out, half the
   * distance when nearer than 15 blocks as the bee flies block to block; 4 up or down when it's 3 or more above or
   * below), with a short search
   */
  pathfindRandomlyTowards(p: Pos): void {
    const tx = p[0] + 0.5, ty = p[1], tz = p[2] + 0.5;
    const b = this.blockPos();
    const j = Math.trunc(ty) - b[1];
    const yOff = j > 2 ? 4 : j < -2 ? -4 : 0;
    let k = 6, l = 8;
    const i1 = Math.abs(b[0] - p[0]) + Math.abs(b[1] - p[1]) + Math.abs(b[2] - p[2]);
    if (i1 < 15) {
      k = Math.trunc(i1 / 2);
      l = Math.trunc(i1 / 2);
    }
    const q = airRandomPosTowards(this, k, l, yOff, tx, tz, Math.PI / 10);
    if (q) {
      this.navigation.maxVisitedMultiplier = 0.5;
      this.navigation.moveTo(q[0] + 0.5, q[1], q[2] + 0.5, 1.0);
    }
  }

  // --- anger (vanilla NeutralMob) --------------------------------------------------------------------------------

  isAngry(): boolean {
    return this.angerTime > 0;
  }
  /** vanilla NeutralMob.isAngryAt: a player it could go for, the one it's angry at (any, under universal anger) */
  isAngryAt(e: LivingEntity): boolean {
    if (!this.canAttack(e)) return false;
    if (e.type === 'player' && this.level.gameRules.universalAnger && this.isAngry() && !this.angerTarget) return true;
    return e === this.angerTarget;
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
  /**
   * vanilla NeutralMob.updatePersistentAnger(level, false): whatever it goes for it's angry at, and the anger wears off
   * even while it's after a player
   */
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
    if (this.angerTime > 0 && --this.angerTime === 0) this.stopBeingAngry();
  }
  /** vanilla NeutralMob.forgetCurrentTargetAndRefreshUniversalAnger */
  forgetTargetAndRefreshUniversalAnger(): void {
    this.lastHurtByMob = null;
    this.setTarget(null);
    this.angerTarget = null;
    this.startAngerTimer();
  }

  // --- stinging --------------------------------------------------------------------------------------------------

  /**
   * vanilla doHurtTarget: a sting of its attack damage (whole points); a living thing stung is poisoned for 10 seconds
   * on normal, 18 on hard, and the bee loses its stinger, its anger spent
   */
  override doHurtTarget(target: Entity): boolean {
    const ok = target.hurt(Math.trunc(this.attackDamage), 'sting', this);
    if (!ok) return false;
    // (vanilla EnchantmentHelper.doPostAttackEffects: the target's thorns)
    doPostAttackEffects(target, this, null, true);
    if (target instanceof LivingEntity) {
      const d = this.level.difficulty;
      const secs = d === 'normal' ? 10 : d === 'hard' ? 18 : 0;
      if (secs > 0) target.addEffect(new MobEffectInstance(MOB_EFFECTS.poison, secs * 20, 0), this);
      this.lastHurtMob = target;
    }
    this.hasStung = true;
    this.stopBeingAngry();
    this.playSound('entity.bee.sting', 1, 1);
    return true;
  }

  /** vanilla Bee.hurt: hurt, it stops pollinating */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    if (!this.level.isClientSide) this.pollinateGoal?.stopPollinating();
    return super.hurt(amount, source, attacker, direct);
  }

  // --- ticking ---------------------------------------------------------------------------------------------------

  /**
   * vanilla Bee.tick: with nectar, now and then a speck or two of it falls (vanilla draws them where the crops it's
   * grown aren't known: always), and the roll eases in or out
   */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.hasNectar && this.random.nextFloat() < 0.05) {
      const n = this.random.nextInt(2) + 1;
      for (let i = 0; i < n; i++) {
        const x = this.x - 0.3 + Math.random() * 0.6, z = this.z - 0.3 + Math.random() * 0.6;
        this.level.particles.spawn?.('falling_nectar', x, this.y + this.height * 0.5, z, 0, 0, 0);
      }
    }
    this.updateRollAmount();
  }

  /** a guest's copy: its roll from the host's `rolling` */
  override animateMirror(): void {
    super.animateMirror();
    this.updateRollAmount();
  }

  /** vanilla updateRollAmount */
  private updateRollAmount(): void {
    const r = this.roll;
    r.amountO = r.amount;
    r.amount = this.rolling ? Math.min(1, r.amount + 0.2) : Math.max(0, r.amount - 0.24);
  }

  /** vanilla getRollAmount */
  rollAmount(partial: number): number {
    return this.roll.amountO + (this.roll.amount - this.roll.amountO) * partial;
  }

  /**
   * vanilla customServerAiStep: a second under water and it drowns a point at a time; stung, it dies before long (each
   * fifth tick one chance in what's left of its minute); the time without nectar; the anger wearing off
   */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    const c = this.clock;
    if (this.inWater) c.underWater++;
    else c.underWater = 0;
    if (c.underWater > 20) this.hurt(1, 'drown');
    if (this.hasStung) {
      c.timeSinceSting++;
      if (c.timeSinceSting % 5 === 0 && this.random.nextInt(Math.max(1, Math.min(1200, 1200 - c.timeSinceSting))) === 0) this.hurt(this.health, 'generic');
    }
    if (!this.hasNectar) c.ticksWithoutNectar++;
    this.updateAnger();
  }

  /**
   * vanilla Bee.aiStep: its countdowns; it rolls while angry and after something within two blocks; each second its
   * hive is forgotten if it's gone or too far
   */
  override aiStep(): void {
    super.aiStep();
    if (this.level.isClientSide) return;
    const c = this.clock;
    if (c.stayOutOfHive > 0) c.stayOutOfHive--;
    if (c.hiveCooldown > 0) c.hiveCooldown--;
    if (c.flowerCooldown > 0) c.flowerCooldown--;
    const t = this.target;
    this.rolling = this.isAngry() && !this.hasStung && !!t && t.distanceToSqr(this.x, this.y, this.z) < 4;
    if (this.tickCount % 20 === 0 && !this.isHiveValid()) this.hivePos = null;
  }

  /** vanilla jumpInLiquid: it rises out of water only slowly */
  protected override jumpInLiquid(): void {
    this.dy += 0.01;
  }

  /** vanilla checkFallDamage: none */
  protected override checkFallDamage(_dy: number, _onGround: boolean): void {
    this.fallDistance = 0;
  }

  /** vanilla isFlapping: every other tick while it flies (a FLAP game event each time) */
  protected override isFlapping(): boolean {
    return this.isFlying() && this.tickCount % TICKS_PER_FLAP === 0;
  }

  /** vanilla getLeashOffset: half its eyes' height up, a fifth of its width ahead */
  override leashOffset(): [number, number, number] {
    return [0, 0.5 * this.eyeHeight, this.width * 0.2];
  }

  // --- sounds and loot -------------------------------------------------------------------------------------------

  /** vanilla getAmbientSound: none (its hum is its loop, audio/beeSounds.ts) */
  override ambientSound(): string | null {
    return null;
  }
  override hurtSound(): string {
    return 'entity.bee.hurt';
  }
  override deathSound(): string {
    return 'entity.bee.death';
  }
  override soundVolume(): number {
    return 0.4;
  }
  /** vanilla playStepSound: nothing */
  protected override playStepSound(): void {}

  /** vanilla loot table entities/bee: nothing */
  override lootTable(): LootEntry[] {
    return [];
  }

  // --- saving ----------------------------------------------------------------------------------------------------

  /**
   * vanilla addAdditionalSaveData: hive_pos and flower_pos, HasNectar, HasStung, TicksSincePollination,
   * CannotEnterHiveTicks, CropsGrownSincePollination, its anger; and (vanilla Entity) NoGravity when it hovers
   */
  protected override saveData(): Record<string, number | string | boolean> {
    const c = this.clock;
    const d: Record<string, number | string | boolean> = {
      ...super.saveData(),
      HasNectar: this.hasNectar,
      HasStung: this.hasStung,
      TicksSincePollination: c.ticksWithoutNectar,
      CannotEnterHiveTicks: c.stayOutOfHive,
      CropsGrownSincePollination: c.cropsGrown,
    };
    if (this.hivePos) d.hive_pos = this.hivePos.join(',');
    if (this.savedFlowerPos) d.flower_pos = this.savedFlowerPos.join(',');
    Object.assign(d, { AngerTime: this.angerTime, ...(this.angerTime > 0 ? angryAtData(this.angerTarget) : {}) });
    d.NoGravity = this.noGravityFlag;
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const c = this.clock;
    this.hivePos = typeof d.hive_pos === 'string' ? parsePos(d.hive_pos) : null;
    this.savedFlowerPos = typeof d.flower_pos === 'string' ? parsePos(d.flower_pos) : null;
    this.setHasNectar(d.HasNectar === true);
    this.hasStung = d.HasStung === true;
    c.ticksWithoutNectar = Number(d.TicksSincePollination ?? 0) || 0;
    c.stayOutOfHive = Number(d.CannotEnterHiveTicks ?? 0) || 0;
    c.cropsGrown = Number(d.CropsGrownSincePollination ?? 0) || 0;
    this.angerTime = Math.max(0, Number(d.AngerTime ?? 0) || 0);
    this.angerTarget = this.angerTime > 0 && typeof d.AngryAt === 'string' ? angryAtFrom(this.level, d) : null;
    this.noGravityFlag = d.NoGravity === true;
  }

  /** /summon's hive_pos:[I;x,y,z] and flower_pos:[I;x,y,z] (vanilla NbtUtils.readBlockPos) */
  readEntityData(nbt: string): void {
    for (const k of ['hive_pos', 'flower_pos'] as const) {
      const m = new RegExp(`${k}\\s*:\\s*\\[\\s*(?:I\\s*;)?\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\]`, 'i').exec(nbt);
      if (!m) continue;
      const p: Pos = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (k === 'hive_pos') this.hivePos = p;
      else this.savedFlowerPos = p;
    }
  }
}

// ---------------------------------------------------------------------------
// its controls

/** vanilla Bee's FlyingPathNavigation: a stable destination has something under it; it holds still while pollinating */
class BeeNavigation extends FlyingPathNavigation {
  constructor(readonly bee: Bee) {
    super(bee);
  }
  override isStableDestination(x: number, y: number, z: number): boolean {
    return !(FLAGS[this.mob.level.world.getState(x, y - 1, z)] & F_AIR);
  }
  override tick(): void {
    if (!this.bee.pollinateGoal?.isPollinating()) super.tick();
  }
}

/** vanilla Bee.BeeLookControl: an angry bee doesn't turn its head; over a flower its pitch is kept */
class BeeLookControl extends LookControl {
  override tick(): void {
    if (!(this.mob as Bee).isAngry()) super.tick();
  }
  protected override resetXRotOnTick(): boolean {
    return !(this.mob as Bee).pollinateGoal?.isPollinating();
  }
}

// ---------------------------------------------------------------------------
// its goals

/** vanilla Bee.BaseBeeGoal: none of them while it's angry */
abstract class BaseBeeGoal extends Goal {
  constructor(readonly bee: Bee) {
    super();
  }
  abstract canBeeUse(): boolean;
  abstract canBeeContinueToUse(): boolean;
  canUse(): boolean {
    return this.canBeeUse() && !this.bee.isAngry();
  }
  override canContinueToUse(): boolean {
    return this.canBeeContinueToUse() && !this.bee.isAngry();
  }
}

/** vanilla Bee.BeeAttackGoal: a melee attack while it's angry and still has its stinger */
class BeeAttackGoal extends MeleeAttackGoal {
  override canUse(): boolean {
    const b = this.mob as Bee;
    return super.canUse() && b.isAngry() && !b.hasStung;
  }
  override canContinueToUse(): boolean {
    const b = this.mob as Bee;
    return super.canContinueToUse() && b.isAngry() && !b.hasStung;
  }
}

/** vanilla Bee.BeeBecomeAngryTargetGoal: NearestAttackableTargetGoal<Player>(10, true, false, isAngryAt), while angry and armed */
class BeeBecomeAngryTargetGoal extends NearestAttackablePlayerGoal {
  constructor(readonly bee: Bee) {
    super(bee, true, 10);
  }
  protected override acceptsPlayer(p: Player): boolean {
    return this.bee.isAngryAt(p);
  }
  override canUse(): boolean {
    return this.beeCanTarget() && super.canUse();
  }
  override canContinueToUse(): boolean {
    if (this.beeCanTarget() && this.mob.target) return super.canContinueToUse();
    this.targetMob = null;
    return false;
  }
  private beeCanTarget(): boolean {
    return this.bee.isAngry() && !this.bee.hasStung;
  }
}

/** vanilla Bee.BeeHurtByOtherGoal: only while angry; bees about join in only if this one can see who did it */
class BeeHurtByOtherGoal extends HurtByTargetGoal {
  override canContinueToUse(): boolean {
    return (this.mob as Bee).isAngry() && super.canContinueToUse();
  }
  protected override alertOther(o: Mob, target: LivingEntity): void {
    if (o instanceof Bee && this.mob.hasLineOfSight(target)) o.setTarget(target);
  }
}

/**
 * vanilla ResetUniversalAngerTargetGoal(bee, true): under universal anger, when it's hurt it forgets whom it was after
 * and stays angry at every player; the bees about with it too (alertOthersOfSameType)
 */
class ResetUniversalAngerTargetGoal extends Goal {
  private lastHurtByPlayerTimestamp = 0;
  constructor(readonly bee: Bee) {
    super();
  }
  canUse(): boolean {
    return !!this.bee.level.gameRules.universalAnger && this.wasHurtByPlayer();
  }
  private wasHurtByPlayer(): boolean {
    const b = this.bee;
    return b.lastHurtByMob?.type === 'player' && b.lastHurtByMobTimestamp > this.lastHurtByPlayerTimestamp;
  }
  override start(): void {
    const b = this.bee;
    this.lastHurtByPlayerTimestamp = b.lastHurtByMobTimestamp;
    b.forgetTargetAndRefreshUniversalAnger();
    // (vanilla getNearbyMobsOfSameType: AABB.unitCubeFromLowerCorner(position).inflate(followRange, 10, followRange))
    const d = b.followRange;
    const box = new AABB(b.x - d, b.y - 10, b.z - d, b.x + 1 + d, b.y + 11, b.z + 1 + d);
    for (const e of b.level.getEntities(box, (e) => e instanceof Bee && e !== b)) (e as Bee).forgetTargetAndRefreshUniversalAnger();
    super.start();
  }
}

/** vanilla Bee.BeeEnterHiveGoal: within 2 blocks of its hive and wanting in, it goes in (or forgets a full hive) */
class BeeEnterHiveGoal extends BaseBeeGoal {
  canBeeUse(): boolean {
    const b = this.bee, h = b.hivePos;
    if (!h || !b.wantsToEnterHive()) return false;
    // (vanilla BlockPos.closerToCenterThan(position, 2): from the block's middle)
    if ((h[0] + 0.5 - b.x) ** 2 + (h[1] + 0.5 - b.y) ** 2 + (h[2] + 0.5 - b.z) ** 2 >= 4) return false;
    const be = b.level.world.getBlockEntity(h[0], h[1], h[2]);
    if (be instanceof BeehiveBlockEntity) {
      if (!be.isFull()) return true;
      b.hivePos = null;
    }
    return false;
  }
  canBeeContinueToUse(): boolean {
    return false;
  }
  override start(): void {
    const b = this.bee, h = b.hivePos;
    if (!h) return;
    const be = b.level.world.getBlockEntity(h[0], h[1], h[2]);
    if (be instanceof BeehiveBlockEntity) be.addOccupant(b.level, b);
  }
}

/** vanilla Bee.BeeLocateHiveGoal: wanting in with no hive, every 10 seconds it looks for one with room within 20 blocks */
class BeeLocateHiveGoal extends BaseBeeGoal {
  canBeeUse(): boolean {
    const b = this.bee;
    return b.clock.hiveCooldown === 0 && !b.hivePos && b.wantsToEnterHive();
  }
  canBeeContinueToUse(): boolean {
    return false;
  }
  override start(): void {
    const b = this.bee;
    b.clock.hiveCooldown = 200;
    const list = this.findNearbyHivesWithSpace();
    if (!list.length) return;
    for (const p of list) {
      if (!b.goToHiveGoal?.isTargetBlacklisted(p)) {
        b.hivePos = p;
        return;
      }
    }
    b.goToHiveGoal?.clearBlacklist();
    b.hivePos = list[0];
  }
  /** vanilla findNearbyHivesWithSpace: the hives (#bee_home points) within 20 with room, nearest first */
  private findNearbyHivesWithSpace(): Pos[] {
    const b = this.bee, [x, y, z] = b.blockPos();
    return b.level.poi
      .findAll(x, y, z, 20, (k) => k === 'bee_nest' || k === 'beehive', false)
      .map((p): Pos => [p[0], p[1], p[2]])
      .filter((p) => b.doesHiveHaveSpace(p));
  }
}

/**
 * vanilla Bee.BeeGoToHiveGoal: wanting in, it makes for its hive: from further than 16 blocks by random hops its way,
 * nearer by a proper path; half a minute on the way, no path or stuck for 3 seconds, and it gives up on that hive
 * (the last three it gave up on it won't choose again while there are others)
 */
export class BeeGoToHiveGoal extends BaseBeeGoal {
  travellingTicks: number;
  readonly blacklistedTargets: Pos[] = [];
  private lastPath: Path | null = null;
  private ticksStuck = 0;
  constructor(bee: Bee) {
    super(bee);
    this.flags = Flag.MOVE;
    this.travellingTicks = bee.level.random.nextInt(10);
  }
  canBeeUse(): boolean {
    const b = this.bee, h = b.hivePos;
    return !!h && !b.isTooFarAway(h) && !b.hasRestriction() && b.wantsToEnterHive() && !this.hasReachedTarget(h) && isHive(b.level.getState(h[0], h[1], h[2]));
  }
  canBeeContinueToUse(): boolean {
    return this.canBeeUse();
  }
  override start(): void {
    this.travellingTicks = 0;
    this.ticksStuck = 0;
  }
  override stop(): void {
    this.travellingTicks = 0;
    this.ticksStuck = 0;
    this.bee.navigation.stop();
    this.bee.navigation.maxVisitedMultiplier = 1;
  }
  override tick(): void {
    const b = this.bee, h = b.hivePos;
    if (!h) return;
    this.travellingTicks++;
    if (this.travellingTicks > this.adjustedTickDelay(600)) this.dropAndBlacklistHive();
    else if (!b.navigation.isInProgress()) {
      if (!b.closerThan(h, 16)) {
        if (b.isTooFarAway(h)) this.dropHive();
        else b.pathfindRandomlyTowards(h);
      } else if (!this.pathfindDirectlyTowards(h)) this.dropAndBlacklistHive();
      else if (this.lastPath && b.navigation.path?.sameAs(this.lastPath)) {
        if (++this.ticksStuck > 60) {
          this.dropHive();
          this.ticksStuck = 0;
        }
      } else this.lastPath = b.navigation.path;
    }
  }
  /**
   * vanilla pathfindDirectlyTowards: a long search to the hive itself (near enough within a block when it's within 3,
   * else 2); false if there's no way there
   */
  private pathfindDirectlyTowards(p: Pos): boolean {
    const n = this.bee.navigation;
    n.maxVisitedMultiplier = 10;
    n.moveTo(p[0], p[1], p[2], 1.0, this.bee.closerThan(p, 3) ? 1 : 2);
    return !!n.path && n.path.canReach();
  }
  isTargetBlacklisted(p: Pos): boolean {
    return this.blacklistedTargets.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]);
  }
  private blacklistTarget(p: Pos): void {
    this.blacklistedTargets.push(p);
    while (this.blacklistedTargets.length > 3) this.blacklistedTargets.shift();
  }
  clearBlacklist(): void {
    this.blacklistedTargets.length = 0;
  }
  private dropAndBlacklistHive(): void {
    if (this.bee.hivePos) this.blacklistTarget(this.bee.hivePos);
    this.dropHive();
  }
  private dropHive(): void {
    this.bee.hivePos = null;
    this.bee.clock.hiveCooldown = 200;
  }
  /** vanilla hasReachedTarget: within 2 blocks, or its path there done */
  private hasReachedTarget(p: Pos): boolean {
    const b = this.bee;
    if (b.closerThan(p, 2)) return true;
    const path = b.navigation.path;
    return !!path && path.target.x === p[0] && path.target.y === p[1] && path.target.z === p[2] && path.canReach() && path.isDone();
  }
}

/** vanilla Bee.BeeGoToKnownFlowerGoal: two minutes without nectar, it makes its way back to the flower it knows */
export class BeeGoToKnownFlowerGoal extends BaseBeeGoal {
  travellingTicks: number;
  constructor(bee: Bee) {
    super(bee);
    this.flags = Flag.MOVE;
    this.travellingTicks = bee.level.random.nextInt(10);
  }
  canBeeUse(): boolean {
    const b = this.bee, f = b.savedFlowerPos;
    return !!f && !b.hasRestriction() && b.clock.ticksWithoutNectar > 2400 && b.isFlowerValid(f) && !b.closerThan(f, 2);
  }
  canBeeContinueToUse(): boolean {
    return this.canBeeUse();
  }
  override start(): void {
    this.travellingTicks = 0;
  }
  override stop(): void {
    this.travellingTicks = 0;
    this.bee.navigation.stop();
    this.bee.navigation.maxVisitedMultiplier = 1;
  }
  override tick(): void {
    const b = this.bee, f = b.savedFlowerPos;
    if (!f) return;
    this.travellingTicks++;
    if (this.travellingTicks > this.adjustedTickDelay(600)) b.savedFlowerPos = null;
    else if (!b.navigation.isInProgress()) {
      if (b.isTooFarAway(f)) b.savedFlowerPos = null;
      else b.pathfindRandomlyTowards(f);
    }
  }
}

/**
 * vanilla Bee.BeePollinateGoal: without nectar, out of the rain, a flower within 5 blocks (looked for every one to three
 * seconds, ten seconds after the last): it flies to it and hovers over it (0.6 above the block's bottom), shifting a
 * little now and then; after twenty seconds there it has nectar (one time in five it carries on a while), at thirty it
 * gives up. It buzzes over it now and then
 */
export class BeePollinateGoal extends BaseBeeGoal {
  private successfulPollinatingTicks = 0;
  private lastSoundPlayedTick = 0;
  private pollinating = false;
  private hoverPos: [number, number, number] | null = null;
  private pollinatingTicks = 0;
  constructor(bee: Bee) {
    super(bee);
    this.flags = Flag.MOVE;
  }
  canBeeUse(): boolean {
    const b = this.bee;
    if (b.clock.flowerCooldown > 0 || b.hasNectar || b.level.isRaining()) return false;
    const f = this.findNearbyFlower();
    if (f) {
      b.savedFlowerPos = f;
      b.navigation.moveTo(f[0] + 0.5, f[1] + 0.5, f[2] + 0.5, 1.2);
      return true;
    }
    b.clock.flowerCooldown = 20 + b.random.nextInt(41);
    return false;
  }
  canBeeContinueToUse(): boolean {
    const b = this.bee;
    if (!this.pollinating || !b.savedFlowerPos || b.level.isRaining()) return false;
    if (this.hasPollinatedLongEnough()) return b.random.nextFloat() < 0.2;
    if (b.tickCount % 20 === 0 && !b.isFlowerValid(b.savedFlowerPos)) {
      b.savedFlowerPos = null;
      return false;
    }
    return true;
  }
  private hasPollinatedLongEnough(): boolean {
    return this.successfulPollinatingTicks > 400;
  }
  isPollinating(): boolean {
    return this.pollinating;
  }
  stopPollinating(): void {
    this.pollinating = false;
  }
  override start(): void {
    this.successfulPollinatingTicks = 0;
    this.pollinatingTicks = 0;
    this.lastSoundPlayedTick = 0;
    this.pollinating = true;
    this.bee.clock.ticksWithoutNectar = 0;
  }
  override stop(): void {
    const b = this.bee;
    if (this.hasPollinatedLongEnough()) b.setHasNectar(true);
    this.pollinating = false;
    b.navigation.stop();
    b.clock.flowerCooldown = 200;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const b = this.bee, f = b.savedFlowerPos;
    this.pollinatingTicks++;
    if (this.pollinatingTicks > 600) {
      b.savedFlowerPos = null;
      return;
    }
    if (!f) return;
    const v: [number, number, number] = [f[0] + 0.5, f[1] + 0.6, f[2] + 0.5];
    if (Math.sqrt((v[0] - b.x) ** 2 + (v[1] - b.y) ** 2 + (v[2] - b.z) ** 2) > 1) {
      this.hoverPos = v;
      this.setWantedPos();
      return;
    }
    if (!this.hoverPos) this.hoverPos = v;
    const h = this.hoverPos;
    const there = Math.sqrt((b.x - h[0]) ** 2 + (b.y - h[1]) ** 2 + (b.z - h[2]) ** 2) <= 0.1;
    let move = true;
    if (!there && this.pollinatingTicks > 600) {
      b.savedFlowerPos = null;
      return;
    }
    if (there) {
      if (b.random.nextInt(25) === 0) {
        this.hoverPos = [v[0] + this.offset(), v[1], v[2] + this.offset()];
        b.navigation.stop();
      } else move = false;
      b.lookControl.setLookAt(v[0], v[1], v[2]);
    }
    if (move) this.setWantedPos();
    this.successfulPollinatingTicks++;
    if (b.random.nextFloat() < 0.05 && this.successfulPollinatingTicks > this.lastSoundPlayedTick + 60) {
      this.lastSoundPlayedTick = this.successfulPollinatingTicks;
      b.playSound('entity.bee.pollinate', 1, 1);
    }
  }
  private setWantedPos(): void {
    const h = this.hoverPos!;
    this.bee.moveControl.setWantedPosition(h[0], h[1], h[2], 0.35);
  }
  private offset(): number {
    return (this.bee.random.nextFloat() * 2 - 1) * 0.33333334;
  }
  /**
   * vanilla findNearestBlock(VALID_POLLINATION_BLOCKS, 5): its own layer first, then one below, one above, two
   * below...; within each, ring by ring out from its block, nearer rows first; the first flower within 5 blocks
   */
  private findNearbyFlower(): Pos | null {
    const b = this.bee, [bx, by, bz] = b.blockPos(), w = b.level.world;
    const distance = 5;
    for (let i = 0; i <= distance; i = i > 0 ? -i : 1 - i)
      for (let j = 0; j < distance; j++)
        for (let k = 0; k <= j; k = k > 0 ? -k : 1 - k)
          for (let l = k < j && k > -j ? j : 0; l <= j; l = l > 0 ? -l : 1 - l) {
            const p: Pos = [bx + k, by + i - 1, bz + l];
            if (p[1] < MIN_Y || p[1] >= MAX_Y) continue;
            if (closerThan([bx, by, bz], p, distance) && isPollinationBlock(w.getState(p[0], p[1], p[2]))) return p;
          }
    return null;
  }
}

/**
 * vanilla Bee.BeeGrowCropGoal: with nectar and a hive, most ticks (not three in ten), one tick in 30 it grows the crop
 * one or two blocks under it a stage (a stem, a sweet berry bush; glow berries on cave vines), up to ten crops
 */
class BeeGrowCropGoal extends BaseBeeGoal {
  canBeeUse(): boolean {
    const b = this.bee;
    if (b.clock.cropsGrown >= 10) return false;
    if (b.random.nextFloat() < 0.3) return false;
    return b.hasNectar && b.isHiveValid();
  }
  canBeeContinueToUse(): boolean {
    return this.canBeeUse();
  }
  override tick(): void {
    const b = this.bee;
    if (b.random.nextInt(this.adjustedTickDelay(30)) !== 0) return;
    const level = b.level, [bx, by, bz] = b.blockPos();
    for (let i = 1; i <= 2; i++) {
      const y = by - i;
      const st = level.getState(bx, y, bz);
      const blk = BLOCKS[STATE_BLOCK[st]], n = blk.name;
      let grown: number | null = null;
      // (vanilla #bee_growables: #crops, sweet berries and cave vines)
      if (n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots') {
        const max = n === 'beetroots' ? 3 : 7, age = blk.get<number>(st, 'age');
        if (age < max) grown = blk.with(st, 'age', age + 1);
      } else if (n === 'melon_stem' || n === 'pumpkin_stem') {
        const age = blk.get<number>(st, 'age');
        if (age < 7) grown = blk.with(st, 'age', age + 1);
      } else if (n === 'sweet_berry_bush') {
        const age = blk.get<number>(st, 'age');
        if (age < 3) grown = blk.with(st, 'age', age + 1);
      } else if (n === 'cave_vines' || n === 'cave_vines_plant') performBoneMeal(level, bx, y, bz, st);
      if (grown !== null) {
        // (vanilla level event 2011: the bone meal's specks, 15 of them)
        boneMealParticles(level, bx, y, bz);
        level.setBlock(bx, y, bz, grown);
        b.clock.cropsGrown++;
      }
    }
  }
}

/**
 * vanilla Bee.BeeWanderGoal: done with where it was going, one time in ten it's off somewhere up to 8 blocks ahead
 * (or, 22 blocks or more from its hive, toward it), over something it could land on or else anywhere in the air
 */
class BeeWanderGoal extends Goal {
  constructor(readonly bee: Bee) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    return this.bee.navigation.isDone() && this.bee.random.nextInt(10) === 0;
  }
  override canContinueToUse(): boolean {
    return this.bee.navigation.isInProgress();
  }
  override start(): void {
    const p = this.findPos();
    if (p) this.bee.navigation.moveToPath(this.bee.navigation.createPath(p[0], p[1], p[2], 1), 1.0);
  }
  private findPos(): Pos | null {
    const b = this.bee;
    let vx: number, vz: number;
    const h = b.hivePos;
    if (h && b.isHiveValid() && !b.closerThan(h, 22)) {
      const dx = h[0] + 0.5 - b.x, dy = h[1] + 0.5 - b.y, dz = h[2] + 0.5 - b.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      vx = dx / len;
      vz = dz / len;
    } else {
      // (vanilla getViewVector(0): where it faces)
      const yr = (b.yaw * Math.PI) / 180, pr = (b.pitch * Math.PI) / 180;
      vx = -Math.sin(yr) * Math.cos(pr);
      vz = Math.cos(yr) * Math.cos(pr);
    }
    return hoverRandomPos(b, 8, 7, vx, vz, Math.PI / 2, 3, 1) ?? airAndWaterRandomPos(b, 8, 4, -2, vx, vz, Math.PI / 2);
  }
}
