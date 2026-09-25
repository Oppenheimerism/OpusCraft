// The drowned (vanilla Drowned): a zombie that lives under water. It spawns in rivers, oceans and dripstone caves, and
// a zombie held under water long enough becomes one. By day it keeps to the water; at night it swims up and wanders
// ashore after its prey. It swims after anything in the water with it (a player out of the water only at night), and
// the few that carry a trident throw it from up to ten blocks off. Now and then one holds a nautilus shell.

import { Zombie, ZombieAttackGoal, ZOMBIE_TYPES, DIFFICULTY_ID, Monster } from './monsters';
import type { Level } from '../game/level';
import type { LootEntry } from './mob';
import { LivingEntity } from './living';
import { Goal, Flag } from './ai/goal';
import { MoveControl, MoveOp, rotlerp } from './ai/controls';
import { PathNavigation, WaterBoundPathNavigation } from './ai/navigation';
import { PathType } from './ai/pathfinder';
import {
  HurtByTargetGoal, MoveToBlockGoal, NearestAttackableMobGoal, NearestAttackablePlayerGoal, RandomStrollGoal, RangedAttackGoal,
  defaultRandomPosTowards, type RangedAttacker,
} from './ai/goals';
import { ItemStack } from '../item/item';
import { ThrownTrident } from './thrownTrident';
import { COLLISION, FLAGS, F_AIR, F_OPAQUE, F_FULL_COLLISION, BLOCKS, STATE_BLOCK } from '../world/block';
import { fluidType, FLUID_WATER } from '../world/fluids';
import { SEA_LEVEL } from '../world/constants';
import type { DifficultyInstance } from '../game/difficulty';
import type { SpawnReason } from './mob';

export class Drowned extends Zombie implements RangedAttacker {
  override readonly type: string = 'drowned';
  /** vanilla searchingForLand: swimming up to go ashore */
  searchingForLand = false;
  private readonly waterNavigation: WaterBoundPathNavigation;
  readonly groundNavigation: PathNavigation;

  constructor(level: Level) {
    super(level);
    this.moveControl = new DrownedMoveControl(this);
    this.setPathfindingMalus(PathType.WATER, 0);
    this.groundNavigation = this.ownNavigation;
    this.waterNavigation = new WaterBoundPathNavigation(this);
  }

  /** vanilla Drowned.addBehaviourGoals */
  protected override addBehaviourGoals(): void {
    this.goalSelector.addGoal(1, new DrownedGoToWaterGoal(this, 1.0));
    this.goalSelector.addGoal(2, new DrownedTridentAttackGoal(this, 1.0, 40, 10));
    this.goalSelector.addGoal(2, new DrownedAttackGoal(this, 1.0, false));
    this.goalSelector.addGoal(5, new DrownedGoToBeachGoal(this, 1.0));
    this.goalSelector.addGoal(6, new DrownedSwimUpGoal(this, 1.0, SEA_LEVEL));
    this.goalSelector.addGoal(7, new RandomStrollGoal(this, 1.0));
    // (it won't turn on another drowned for hurting it)
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this, (by) => by instanceof Drowned).setAlertOthers('zombified_piglin'));
    this.targetSelector.addGoal(2, new DrownedTargetPlayerGoal(this));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'villager' || e.type === 'wandering_trader', false));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'iron_golem', true));
    // (Stage 5: ocean) and axolotls
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'axolotl', true));
  }

  /**
   * vanilla Drowned.finalizeSpawn: a zombie's, and 3% of the time a nautilus shell in its other hand, which it always
   * drops
   */
  override finalizeSpawn(reason?: SpawnReason): void {
    super.finalizeSpawn(reason);
    if (!this.offHand && this.level.random.nextFloat() < 0.03) {
      this.setItemSlot('offhand', ItemStack.of('nautilus_shell'));
      this.setGuaranteedDrop('offhand');
    }
  }

  /** vanilla Drowned.populateDefaultEquipmentSlots: no armour; one in ten has a trident (5 in 8) or a fishing rod */
  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    if (this.random.nextFloat() > 0.9) {
      const i = this.random.nextInt(16);
      this.setItemSlot('mainhand', ItemStack.of(i < 10 ? 'trident' : 'fishing_rod'));
    }
  }

  /** vanilla canReplaceCurrentItem: never gives up a nautilus shell; a trident only for a less worn one; always takes a trident */
  override canReplaceCurrentItem(s: ItemStack, cur: ItemStack | null): boolean {
    if (cur?.item.id === 'nautilus_shell') return false;
    if (cur?.item.id === 'trident') return s.item.id === 'trident' && s.damage < cur.damage;
    return s.item.id === 'trident' || super.canReplaceCurrentItem(s, cur);
  }

  protected override supportsBreakDoorGoal(): boolean {
    return false;
  }
  /** vanilla convertsInWater: it's what zombies turn into */
  protected override underWaterConversion(): null {
    return null;
  }

  /** vanilla okTarget: by day, only something in the water */
  okTarget(t: LivingEntity | null): boolean {
    return !!t && (!this.level.isDay() || t.inWater);
  }

  /** vanilla wantsToSwim: going ashore, or after something in the water */
  wantsToSwim(): boolean {
    if (this.searchingForLand) return true;
    const t = this.target;
    return !!t && t.inWater;
  }

  /** vanilla Drowned.updateSwimming: under water (isUnderWater: its eyes too) and wanting to swim, it swims, and paths through the water */
  protected override updateSwimming(): void {
    if (this.isAlive && this.inWater && this.eyeFluid === FLUID_WATER && this.wantsToSwim()) {
      this.ownNavigation = this.waterNavigation;
      this.swimming = true;
    } else {
      this.ownNavigation = this.groundNavigation;
      this.swimming = false;
    }
  }

  override isVisuallySwimming(): boolean {
    return this.swimming;
  }

  /** vanilla isPushedByFluid: not while it swims */
  override isPushedByFluid(): boolean {
    return !this.swimming;
  }

  /** vanilla Drowned.travel: swimming, it drifts on what its move control gives it (no gravity, 10% drag a tick) */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater && this.wantsToSwim()) {
      this.moveRelative(0.01, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
    } else super.travel(sx, sy, sz);
  }

  /** vanilla closeToNextPos: within two blocks of where its path ends */
  closeToNextPos(): boolean {
    const p = this.navigation.path;
    if (!p) return false;
    const t = p.target;
    return this.distanceToSqr(t.x, t.y, t.z) < 4;
  }

  /**
   * vanilla Drowned.performRangedAttack: a trident of its own (one nobody can pick up), thrown at a third of the way up
   * the target, aimed a little high for the distance, at 1.6 blocks a tick, surer the harder the difficulty
   */
  performRangedAttack(target: LivingEntity, _power: number): void {
    const t = new ThrownTrident(this.level, this, ItemStack.of('trident'));
    const d0 = target.x - this.x;
    const d1 = target.y + target.height / 3 - t.y;
    const d2 = target.z - this.z;
    const d3 = Math.sqrt(d0 * d0 + d2 * d2);
    t.shoot(d0, d1 + d3 * 0.2, d2, 1.6, 14 - (DIFFICULTY_ID[this.level.difficulty] ?? 2) * 4);
    this.playSound('entity.drowned.shoot', 1, 1 / (this.random.nextFloat() * 0.4 + 0.8));
    this.level.addEntity(t);
  }

  /** vanilla checkSpawnObstruction: water is no obstruction */
  override checkSpawnObstruction(): boolean {
    return true;
  }
  /** vanilla SpawnPlacements IN_WATER, for a reinforcement */
  protected override reinforcementPlacementOk(x: number, y: number, z: number): boolean {
    return isInWaterPositionOk(this.level, x, y, z);
  }
  /** vanilla checkDrownedSpawnRules for a reinforcement: water where it comes and under it, somewhere dark enough */
  protected override reinforcementSpawnRules(x: number, y: number, z: number): boolean {
    return drownedSpawnConditions(this.level, x, y, z, () => this.level.random.nextFloat());
  }

  // (it gurgles under water)
  override ambientSound(): string {
    return this.inWater ? 'entity.drowned.ambient_water' : 'entity.drowned.ambient';
  }
  override hurtSound(): string {
    return this.inWater ? 'entity.drowned.hurt_water' : 'entity.drowned.hurt';
  }
  override deathSound(): string {
    return this.inWater ? 'entity.drowned.death_water' : 'entity.drowned.death';
  }
  override stepSound(): string {
    return 'entity.drowned.step';
  }
  /** vanilla Entity.playSwimSound with getSwimSound entity.drowned.swim: louder the faster it swims */
  protected override playSwimSound(): void {
    const v = Math.min(1, Math.sqrt(this.dx * this.dx * 0.2 + this.dy * this.dy + this.dz * this.dz * 0.2) * 0.35);
    this.level.sound.play('entity.drowned.swim', this.x, this.y, this.z, v, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.4);
  }

  /** vanilla entities/drowned: rotten flesh, and when a player kills it, sometimes a copper ingot */
  override lootTable(): LootEntry[] {
    return [
      { item: 'rotten_flesh', min: 0, max: 2 },
      { item: 'copper_ingot', min: 1, max: 1, player: true, chance: 0.11, lootingChance: [0.13, 0.02], noLooting: true },
    ];
  }
}

ZOMBIE_TYPES.drowned = (l) => new Drowned(l);

/** vanilla SpawnPlacementTypes.IN_WATER: water, with nothing solid on top */
export function isInWaterPositionOk(level: Level, x: number, y: number, z: number): boolean {
  const w = level.world;
  const above = FLAGS[w.getState(x, y + 1, z)];
  return fluidType(w.getState(x, y, z)) === FLUID_WATER && !(above & F_OPAQUE && above & F_FULL_COLLISION);
}

/**
 * vanilla Drowned.checkDrownedSpawnRules, what every drowned needs (all a reinforcement does): water where it comes and
 * under it, somewhere dark enough, and not in peaceful
 */
export function drownedSpawnConditions(level: Level, x: number, y: number, z: number, rand: () => number): boolean {
  const w = level.world;
  if (fluidType(w.getState(x, y - 1, z)) !== FLUID_WATER) return false;
  return level.difficulty !== 'peaceful' && Monster.isDarkEnoughToSpawn(level, x, y, z, rand) && fluidType(w.getState(x, y, z)) === FLUID_WATER;
}

/**
 * vanilla Drowned.checkDrownedSpawnRules for a natural spawn: in a river (#more_frequent_drowned_spawns) one try in
 * 15, anywhere else one in 40 and only five or more below sea level
 */
export function drownedNaturalSpawnRules(level: Level, x: number, y: number, z: number, river: boolean, rand: { nextInt(n: number): number; nextFloat(): number }): boolean {
  if (fluidType(level.world.getState(x, y - 1, z)) !== FLUID_WATER) return false;
  if (river) return rand.nextInt(15) === 0 && drownedSpawnConditions(level, x, y, z, () => rand.nextFloat());
  return rand.nextInt(40) === 0 && y < SEA_LEVEL - 5 && drownedSpawnConditions(level, x, y, z, () => rand.nextFloat());
}

// ---------------------------------------------------------------------------
// goals

/** vanilla NearestAttackableTargetGoal<Player> with okTarget: a player in sight (by day only one in the water) */
class DrownedTargetPlayerGoal extends NearestAttackablePlayerGoal {
  constructor(readonly drowned: Drowned) {
    super(drowned, true, 10);
  }
  protected override extraCondition(): boolean {
    return this.drowned.okTarget(this.drowned.level.player);
  }
}

/** vanilla DrownedAttackGoal: a zombie's, only while the target's fair game (see okTarget) */
class DrownedAttackGoal extends ZombieAttackGoal {
  constructor(readonly drowned: Drowned, speed: number, followEvenIfNotSeen: boolean) {
    super(drowned, speed, followEvenIfNotSeen);
  }
  override canUse(): boolean {
    return super.canUse() && this.drowned.okTarget(this.drowned.target);
  }
  override canContinueToUse(): boolean {
    return super.canContinueToUse() && this.drowned.okTarget(this.drowned.target);
  }
}

/**
 * vanilla DrownedTridentAttackGoal: with a trident, it closes to ten blocks and throws one every two seconds, held up
 * ready to throw (and so aggressive) the while
 */
class DrownedTridentAttackGoal extends RangedAttackGoal {
  constructor(readonly drowned: Drowned, speed: number, interval: number, radius: number) {
    super(drowned, speed, interval, interval, radius);
  }
  override canUse(): boolean {
    return super.canUse() && this.drowned.mainHand?.item.id === 'trident';
  }
  override start(): void {
    super.start();
    this.drowned.aggressive = true;
    this.drowned.startUsingItem();
  }
  override stop(): void {
    super.stop();
    this.drowned.stopUsingItem();
    this.drowned.aggressive = false;
  }
}

/** vanilla DrownedGoToWaterGoal: by day, out of the water, it heads for some within ten blocks */
class DrownedGoToWaterGoal extends Goal {
  private wx = 0;
  private wy = 0;
  private wz = 0;
  constructor(readonly drowned: Drowned, readonly speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const d = this.drowned;
    if (!d.level.isDay() || d.inWater) return false;
    const p = this.waterPos();
    if (!p) return false;
    [this.wx, this.wy, this.wz] = p;
    return true;
  }
  override canContinueToUse(): boolean {
    return !this.drowned.navigation.isDone();
  }
  override start(): void {
    this.drowned.navigation.moveTo(this.wx, this.wy, this.wz, this.speed);
  }
  /** vanilla getWaterPos: ten tries at a water block (not a waterlogged one) round about */
  private waterPos(): [number, number, number] | null {
    const d = this.drowned, r = d.random;
    const bx = Math.floor(d.x), by = Math.floor(d.y), bz = Math.floor(d.z);
    for (let i = 0; i < 10; i++) {
      const x = bx + r.nextInt(20) - 10, y = by + 2 - r.nextInt(8), z = bz + r.nextInt(20) - 10;
      if (BLOCKS[STATE_BLOCK[d.level.world.getState(x, y, z)]].name === 'water') return [x + 0.5, y, z + 0.5];
    }
    return null;
  }
}

/** vanilla DrownedGoToBeachGoal: at night, up near the surface, it makes for land it can stand on */
class DrownedGoToBeachGoal extends MoveToBlockGoal {
  constructor(readonly drowned: Drowned, speed: number) {
    super(drowned, speed, 8, 2);
  }
  override canUse(): boolean {
    const d = this.drowned;
    return super.canUse() && !d.level.isDay() && d.inWater && d.y >= SEA_LEVEL - 3;
  }
  /** a block to stand on with two of air above it */
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.drowned.level.world;
    if (!(FLAGS[w.getState(x, y + 1, z)] & F_AIR) || !(FLAGS[w.getState(x, y + 2, z)] & F_AIR)) return false;
    const boxes = COLLISION[w.getState(x, y, z)];
    return !!boxes && boxes.some((b) => b[0] <= 0 && b[2] <= 0 && b[3] >= 1 && b[5] >= 1 && b[4] >= 1);
  }
  override start(): void {
    const d = this.drowned;
    d.searchingForLand = false;
    d.ownNavigation = d.groundNavigation;
    super.start();
  }
}

/** vanilla DrownedSwimUpGoal: at night, deep down, it swims up towards the surface a few blocks at a time */
class DrownedSwimUpGoal extends Goal {
  private stuck = false;
  constructor(readonly drowned: Drowned, readonly speed: number, readonly seaLevel: number) {
    super();
  }
  canUse(): boolean {
    const d = this.drowned;
    return !d.level.isDay() && d.inWater && d.y < this.seaLevel - 2;
  }
  override canContinueToUse(): boolean {
    return this.canUse() && !this.stuck;
  }
  override tick(): void {
    const d = this.drowned;
    if (d.y < this.seaLevel - 1 && (d.navigation.isDone() || d.closeToNextPos())) {
      const p = defaultRandomPosTowards(d, 4, 8, d.x, d.z, Math.PI / 2);
      if (!p) {
        this.stuck = true;
        return;
      }
      d.navigation.moveTo(p[0] + 0.5, p[1], p[2] + 0.5, this.speed);
    }
  }
  override start(): void {
    this.drowned.searchingForLand = true;
    this.stuck = false;
  }
  override stop(): void {
    this.drowned.searchingForLand = false;
  }
}

/**
 * vanilla DrownedMoveControl: swimming, it turns to where it's headed and is pushed along (upwards too, gently, when
 * its target is above it or it's making for land); otherwise it walks as a zombie does, sinking a little faster
 */
class DrownedMoveControl extends MoveControl {
  constructor(readonly drowned: Drowned) {
    super(drowned);
  }
  override tick(): void {
    const d = this.drowned, t = d.target;
    if (d.wantsToSwim() && d.inWater) {
      if ((t && t.y > d.y) || d.searchingForLand) d.dy += 0.002;
      if (this.operation !== MoveOp.MOVE_TO || d.navigation.isDone()) {
        d.setSpeed(0);
        return;
      }
      const d0 = this.wantedX - d.x, d2 = this.wantedZ - d.z;
      let d1 = this.wantedY - d.y;
      const d3 = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2) || 1;
      d1 /= d3;
      const f = (Math.atan2(d2, d0) * 180) / Math.PI - 90;
      d.yaw = rotlerp(d.yaw, f, 90);
      d.bodyYaw = d.yaw;
      const f1 = this.speedModifier * d.moveSpeedAttr;
      const f2 = d.speed + (f1 - d.speed) * 0.125;
      d.setSpeed(f2);
      d.dx += f2 * d0 * 0.005;
      d.dy += f2 * d1 * 0.1;
      d.dz += f2 * d2 * 0.005;
    } else {
      if (!d.onGround) d.dy -= 0.008;
      super.tick();
    }
  }
}
