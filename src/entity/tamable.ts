// Tameable animals (vanilla TamableAnimal) and the goals they share: sitting when told to, following their owner
// (and turning up at its side when it gets too far ahead), fighting whoever hurts their owner or whoever their owner
// hurts, hunting only while wild, and panicking only at what the world does to them.

import { Animal } from './animals';
import type { Level } from '../game/level';
import { Goal, Flag } from './ai/goal';
import { PanicGoal, NearestAttackableMobGoal, TargetGoal } from './ai/goals';
import { PathType, WalkNodeEvaluator } from './ai/pathfinder';
import { LivingEntity } from './living';
import type { Player } from './player';
import type { Entity } from './entity';
import type { Mob } from './mob';
import { F_LEAVES, FLAGS } from '../world/block';
import { blockFree } from './dismount';
import { AABB } from '../core/aabb';

const probe = new WalkNodeEvaluator();

export abstract class TamableAnimal extends Animal {
  /** vanilla getOwnerUUID: whose it is */
  ownerUUID: string | null = null;
  /** vanilla isTame (DATA_FLAGS_ID bit 4) */
  tame = false;
  /** vanilla orderedToSit: told to stay (saved as Sitting) */
  orderedToSit = false;
  /** vanilla isInSittingPose (DATA_FLAGS_ID bit 1): actually sitting */
  inSittingPose = false;

  constructor(level: Level) {
    super(level);
  }

  /** vanilla TamableAnimal.handleLeashAtDistance: sitting, it isn't pulled along (the lead still snaps past ten blocks) */
  override handleLeashAtDistance(h: Entity, distance: number): boolean {
    if (this.inSittingPose) {
      if (distance > 10) this.dropLeash(true);
      return false;
    }
    return super.handleLeashAtDistance(h, distance);
  }

  isTame(): boolean {
    return this.tame;
  }

  /** vanilla setTame: a tamed animal gets its tame stats (applyTamingSideEffects) */
  setTame(tame: boolean, applySideEffects: boolean): void {
    this.tame = tame;
    if (applySideEffects) this.applyTamingSideEffects();
  }

  /** vanilla applyTamingSideEffects: the stats that come with being tamed (or wild) */
  protected applyTamingSideEffects(): void {}

  /** vanilla getOwner: its owner, if it's here */
  owner(): LivingEntity | null {
    const p = this.level.player;
    return this.ownerUUID !== null && p && p.uuid === this.ownerUUID ? p : null;
  }

  isOwnedBy(e: Entity | null): boolean {
    return !!e && e === this.owner();
  }

  /** vanilla TamableAnimal.tame: it's the player's now (the tame_animal trigger) */
  tameBy(p: Player): void {
    this.setTame(true, true);
    this.ownerUUID = p.uuid;
    this.level.onTamed?.(this, p);
  }

  /** the variant a taming trigger reports (vanilla TameAnimalTrigger's entity predicate) */
  variantId(): string | undefined {
    return undefined;
  }

  /** vanilla wantsToAttack: whether it would fight `target` for `owner` */
  wantsToAttack(_target: LivingEntity, _owner: LivingEntity): boolean {
    return true;
  }

  /** vanilla TamableAnimal.canAttack: never its owner */
  override canAttack(e: LivingEntity | null): boolean {
    return this.isOwnedBy(e) ? false : super.canAttack(e);
  }

  /** vanilla TamableAnimal.isAlliedTo: a tame animal is on its owner's side */
  isAlliedTo(e: Entity): boolean {
    if (this.isTame()) {
      const o = this.owner();
      if (e === o) return true;
    }
    return false;
  }

  /** vanilla spawnTamingParticles: seven hearts, or seven puffs of smoke */
  spawnTamingParticles(success: boolean): void {
    const r = this.random;
    for (let i = 0; i < 7; i++) {
      this.level.particles.spawn?.(
        success ? 'heart' : 'smoke',
        this.x + (2 * r.nextFloat() - 1) * this.width,
        this.y + r.nextFloat() * this.height + 0.5,
        this.z + (2 * r.nextFloat() - 1) * this.width,
        r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02,
      );
    }
  }

  // --- going to its owner (vanilla 1.21 TamableAnimal) ----------------------------------------------------------

  /** vanilla unableToMoveToOwner: told to sit, riding something, on a lead, or its owner is a spectator */
  unableToMoveToOwner(): boolean {
    const o = this.owner();
    return this.orderedToSit || !!this.vehicle || this.leashHolder !== null || (!!o && (o as Player).gameMode === 'spectator');
  }

  /** vanilla shouldTryTeleportToOwner: 12 blocks behind */
  shouldTryTeleportToOwner(): boolean {
    const o = this.owner();
    return !!o && this.distanceToSqr(o.x, o.y, o.z) >= 144;
  }

  tryToTeleportToOwner(): void {
    const o = this.owner();
    if (o) this.teleportToAroundBlockPos(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z));
  }

  /** vanilla teleportToAroundBlockPos: ten tries at a spot 2-3 blocks off (a block up or down) */
  private teleportToAroundBlockPos(x: number, y: number, z: number): void {
    const r = this.random;
    for (let i = 0; i < 10; i++) {
      const j = r.nextInt(7) - 3, k = r.nextInt(7) - 3;
      if (Math.abs(j) >= 2 || Math.abs(k) >= 2) {
        const l = r.nextInt(3) - 1;
        if (this.maybeTeleportTo(x + j, y + l, z + k)) return;
      }
    }
  }

  private maybeTeleportTo(x: number, y: number, z: number): boolean {
    if (!this.canTeleportTo(x, y, z)) return false;
    this.moveTo(x + 0.5, y, z + 0.5, this.yaw, this.pitch);
    this.navigation.stop();
    return true;
  }

  /** vanilla canFlyToOwner: a parrot may land on leaves */
  protected canFlyToOwner(): boolean {
    return false;
  }

  /** vanilla canTeleportTo: somewhere walkable, not onto leaves, and room for it there */
  private canTeleportTo(x: number, y: number, z: number): boolean {
    probe.prepare(this.level.world, this as unknown as Mob);
    const t = probe.staticType(x, y, z);
    probe.done();
    if (t !== PathType.WALKABLE) return false;
    if (!this.canFlyToOwner() && FLAGS[this.level.world.getState(x, y - 1, z)] & F_LEAVES) return false;
    const dx = x - Math.floor(this.x), dy = y - Math.floor(this.y), dz = z - Math.floor(this.z);
    const b = this.bb;
    return blockFree(this.level, new AABB(b.minX + dx, b.minY + dy, b.minZ + dz, b.maxX + dx, b.maxY + dy, b.maxZ + dz));
  }

  // --- dying and saving ------------------------------------------------------------------------------------------

  /** vanilla TamableAnimal.die: its owner hears how it died */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    const o = this.owner();
    super.die(source, attacker);
    if (o && this.level.gameRules.showDeathMessages) this.level.onTamedDeath?.(this, source);
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), Sitting: this.orderedToSit };
    if (this.ownerUUID !== null) d.Owner = this.ownerUUID;
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.Owner === 'string') {
      this.ownerUUID = d.Owner;
      this.setTame(true, false);
    }
    this.orderedToSit = d.Sitting === true;
    this.inSittingPose = this.orderedToSit;
  }
}

// ---------------------------------------------------------------------------
// goals

/** vanilla SitWhenOrderedToGoal: a tame animal on the ground sits while told to (and stays sitting without an owner) */
export class SitWhenOrderedToGoal extends Goal {
  constructor(readonly mob: TamableAnimal) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  override canContinueToUse(): boolean {
    return this.mob.orderedToSit;
  }
  canUse(): boolean {
    const m = this.mob;
    if (!m.isTame() || m.inWater || !m.onGround) return false;
    const o = m.owner();
    if (!o) return true;
    return m.distanceToSqr(o.x, o.y, o.z) < 144 && o.lastHurtByMob !== null ? false : m.orderedToSit;
  }
  override start(): void {
    this.mob.navigation.stop();
    this.mob.inSittingPose = true;
  }
  override stop(): void {
    this.mob.inSittingPose = false;
  }
}

/**
 * vanilla FollowOwnerGoal: once `startDistance` behind its owner it heads after it (water no bother) until within
 * `stopDistance`; twelve blocks behind, it turns up beside it instead
 */
export class FollowOwnerGoal extends Goal {
  private owner: LivingEntity | null = null;
  private timeToRecalcPath = 0;
  private oldWaterCost = 0;
  constructor(readonly tamable: TamableAnimal, readonly speed: number, readonly startDistance: number, readonly stopDistance: number) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.tamable;
    const o = t.owner();
    if (!o || t.unableToMoveToOwner()) return false;
    if (t.distanceToSqr(o.x, o.y, o.z) < this.startDistance * this.startDistance) return false;
    this.owner = o;
    return true;
  }
  override canContinueToUse(): boolean {
    const t = this.tamable, o = this.owner!;
    if (t.navigation.isDone() || t.unableToMoveToOwner()) return false;
    return !(t.distanceToSqr(o.x, o.y, o.z) <= this.stopDistance * this.stopDistance);
  }
  override start(): void {
    this.timeToRecalcPath = 0;
    this.oldWaterCost = this.tamable.malus(PathType.WATER);
    this.tamable.setPathfindingMalus(PathType.WATER, 0);
  }
  override stop(): void {
    this.owner = null;
    this.tamable.navigation.stop();
    this.tamable.setPathfindingMalus(PathType.WATER, this.oldWaterCost);
  }
  override tick(): void {
    const t = this.tamable, o = this.owner!;
    const teleport = t.shouldTryTeleportToOwner();
    if (!teleport) t.lookControl.setLookAtEntity(o, 10, t.maxHeadXRot());
    if (--this.timeToRecalcPath <= 0) {
      this.timeToRecalcPath = this.adjustedTickDelay(10);
      if (teleport) t.tryToTeleportToOwner();
      else t.navigation.moveToEntity(o, this.speed);
    }
  }
}

/** vanilla TargetGoal.canAttack with TargetingConditions.DEFAULT: alive, attackable and in its sight */
function canTarget(m: Mob, t: LivingEntity | null): t is LivingEntity {
  return !!t && t.isAlive && m.canAttack(t) && m.sensing.hasLineOfSight(t);
}

/** vanilla OwnerHurtByTargetGoal: whatever last hurt its owner (unless it's sitting) */
export class OwnerHurtByTargetGoal extends TargetGoal {
  private ownerLastHurtBy: LivingEntity | null = null;
  private timestamp = 0;
  constructor(readonly tameAnimal: TamableAnimal) {
    super(tameAnimal, false);
  }
  canUse(): boolean {
    const t = this.tameAnimal;
    if (!t.isTame() || t.orderedToSit) return false;
    const o = t.owner();
    if (!o) return false;
    this.ownerLastHurtBy = o.lastHurtByMob;
    return o.lastHurtByMobTimestamp !== this.timestamp && canTarget(t, this.ownerLastHurtBy) && t.wantsToAttack(this.ownerLastHurtBy, o);
  }
  override start(): void {
    this.mob.setTarget(this.ownerLastHurtBy);
    const o = this.tameAnimal.owner();
    if (o) this.timestamp = o.lastHurtByMobTimestamp;
    super.start();
  }
}

/** vanilla OwnerHurtTargetGoal: whatever its owner last hurt (unless it's sitting) */
export class OwnerHurtTargetGoal extends TargetGoal {
  private ownerLastHurt: LivingEntity | null = null;
  private timestamp = 0;
  constructor(readonly tameAnimal: TamableAnimal) {
    super(tameAnimal, false);
  }
  canUse(): boolean {
    const t = this.tameAnimal;
    if (!t.isTame() || t.orderedToSit) return false;
    const o = t.owner();
    if (!o) return false;
    this.ownerLastHurt = o.lastHurtMob;
    return o.lastHurtMobTimestamp !== this.timestamp && canTarget(t, this.ownerLastHurt) && t.wantsToAttack(this.ownerLastHurt, o);
  }
  override start(): void {
    this.mob.setTarget(this.ownerLastHurt);
    const o = this.tameAnimal.owner();
    if (o) this.timestamp = o.lastHurtMobTimestamp;
    super.start();
  }
}

/** vanilla NonTameRandomTargetGoal: hunting, only while wild */
export class NonTameRandomTargetGoal extends NearestAttackableMobGoal {
  constructor(readonly tamable: TamableAnimal, test: (e: LivingEntity) => boolean, mustSee: boolean) {
    super(tamable, test, mustSee);
  }
  override canUse(): boolean {
    return !this.tamable.isTame() && super.canUse();
  }
}

/**
 * vanilla TamableAnimal.TamableAnimalPanicGoal with DamageTypeTags.PANIC_ENVIRONMENTAL_CAUSES: it only runs from
 * what the world does to it (fire, lava, cactus, freezing, lightning...), and turns up by its owner if it's far behind;
 * without the tag (`environmentalOnly` false: the parrot's) it runs from whatever hurts it, as any animal does
 */
export class TamableAnimalPanicGoal extends PanicGoal {
  constructor(readonly tamable: TamableAnimal, speed: number, readonly environmentalOnly = true) {
    super(tamable, speed);
  }
  protected override shouldPanic(): boolean {
    if (!this.environmentalOnly) return super.shouldPanic();
    const s = this.tamable.recentDamageSource();
    return s !== null && ENVIRONMENTAL.has(s);
  }
  override tick(): void {
    const t = this.tamable;
    if (!t.unableToMoveToOwner() && t.shouldTryTeleportToOwner()) t.tryToTeleportToOwner();
    super.tick();
  }
}

/** vanilla #panic_environmental_causes */
const ENVIRONMENTAL = new Set(['cactus', 'freeze', 'hotFloor', 'inFire', 'lava', 'lightningBolt', 'onFire']);
