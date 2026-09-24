// Hoglins and zoglins (vanilla Hoglin, HoglinAi, HoglinBase, Zoglin). The hoglin is the crimson forest's boar: a
// breedable animal that charges any player it sees, tossing them with its tusks, backs off from warped fungus and
// portals, and has its herd join a fight. Taken out of the Nether it shakes for fifteen seconds and rots into a
// zoglin, which goes for anything alive nearby except creepers and its own kind.
// Both run vanilla's brain (sensors every 20 ticks, memories with expiry, FIGHT / AVOID / IDLE activities) here as
// a few goals plus the memory bookkeeping in customServerAiStep.

import { Mob, LootEntry, MobCategory, type SpawnGroup, type SpawnReason } from './mob';
import type { Level } from '../game/level';
import { Goal, Flag } from './ai/goal';
import { landRandomPos, defaultRandomPosAway } from './ai/goals';
import type { Path } from './ai/pathfinder';
import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Player } from './player';
import { Animal, BreedGoal } from './animals';
import { Monster } from './monsters';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import type { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { doPostAttackEffects } from '../game/enchantEffects';

/** vanilla Sensor.TARGETING_RANGE */
const SENSE_RANGE = 16;
/** vanilla #hoglin_repellents */
const REPELLENTS = new Set(['warped_fungus', 'potted_warped_fungus', 'nether_portal', 'respawn_anchor']);

type Brute = Hoglin | Zoglin;

// ---------------------------------------------------------------------------
// vanilla HoglinBase

/** vanilla HoglinBase.hurtAndThrowTarget: an adult bites for half its damage plus 0..damage-1 more and tosses you */
function hurtAndThrowTarget(m: Mob, target: LivingEntity): boolean {
  const f1 = m.attackDamage;
  const f = !m.isBaby() && Math.floor(f1) > 0 ? f1 / 2 + m.random.nextInt(Math.floor(f1)) : f1;
  const ok = target.hurt(f, 'mob', m);
  if (ok) {
    doPostAttackEffects(target, m, m.mainHand, true);
    m.lastHurtMob = target;
    if (!m.isBaby()) throwTarget(m, target);
  }
  return ok;
}

/**
 * vanilla HoglinBase.throwTarget: attack knockback less the target's resistance, 0.2-0.7 of it away from the
 * hoglin and up to half of it upwards; the throw is turned by nextInt(21) - 10, handed to Vec3.yRot, which takes
 * radians, so you fly off to the side at any angle at all
 */
function throwTarget(m: Mob, target: LivingEntity): void {
  const d2 = m.attackKnockback - target.knockbackResistance();
  if (d2 <= 0) return;
  const d3 = target.x - m.x, d4 = target.z - m.z;
  const f = m.random.nextInt(21) - 10;
  const d5 = d2 * (m.random.nextFloat() * 0.5 + 0.2);
  const l = Math.sqrt(d3 * d3 + d4 * d4);
  const vx = l < 1e-5 ? 0 : (d3 / l) * d5, vz = l < 1e-5 ? 0 : (d4 / l) * d5;
  const c = Math.cos(f), s = Math.sin(f);
  const d6 = d2 * m.random.nextFloat() * 0.5;
  target.push(vx * c + vz * s, d6, vz * c - vx * s);
}

/** vanilla BehaviorUtils.getNearestTarget: whichever of the two is closer */
function nearestOf(m: Mob, a: LivingEntity | null, b: LivingEntity): LivingEntity {
  if (!a) return b;
  return m.distanceToSqr(a.x, a.y, a.z) < m.distanceToSqr(b.x, b.y, b.z) ? a : b;
}

/** vanilla TargetingConditions.test: range scaled by the target's visibility (at least 2), and seen */
function inSenseRange(m: Mob, e: LivingEntity, ignoreSight: boolean): boolean {
  const r = ignoreSight ? SENSE_RANGE : Math.max(SENSE_RANGE * e.visibilityPercent(m), 2);
  if (m.distanceToSqr(e.x, e.y, e.z) > r * r) return false;
  return ignoreSight || m.sensing.hasLineOfSight(e);
}

/** vanilla NearestLivingEntitySensor: living things within 16 blocks, nearest first, those it can see */
function senseVisibleLiving(m: Mob): LivingEntity[] {
  const r = SENSE_RANGE;
  const list = m.level.getEntities(m.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, m) as LivingEntity[];
  const p = m.level.player;
  if (p && p.isAlive && !list.includes(p) && p.bb.intersects(m.bb.inflate(r, r, r))) list.push(p);
  const d = (e: LivingEntity) => m.distanceToSqr(e.x, e.y, e.z);
  list.sort((a, b) => d(a) - d(b));
  return list.filter((e) => !(e.type === 'player' && (e as Player).gameMode === 'spectator') && inSenseRange(m, e, false));
}

// ---------------------------------------------------------------------------
// behaviours

/**
 * vanilla FIGHT activity: SetWalkTargetFromAttackTargetIfTargetOutOfReach(1.0) walks at the target until it's in
 * reach and seen, then MeleeAttack strikes every 40 ticks (15 for a baby)
 */
class BruteMeleeGoal extends Goal {
  /** vanilla ATTACK_COOLING_DOWN */
  private cooldown = 0;
  private recalc = 0;
  private px = 0;
  private py = 0;
  private pz = 0;
  constructor(readonly mob: Brute) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.mob.target;
    return !!t && t.isAlive;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override start(): void {
    this.recalc = 0;
  }
  override stop(): void {
    this.mob.navigation.stop();
  }
  override tick(): void {
    const m = this.mob, t = m.target;
    if (this.cooldown > 0) this.cooldown--;
    if (!t) return;
    const seen = m.sensing.hasLineOfSight(t);
    const inReach = m.isWithinMeleeAttackRange(t);
    m.lookControl.setLookAtEntity(t);
    if (!seen || !inReach) {
      // (MoveToTargetSink paths again once the target has moved two blocks)
      const moved = (t.x - this.px) ** 2 + (t.y - this.py) ** 2 + (t.z - this.pz) ** 2 > 4;
      if (--this.recalc <= 0 || moved || m.navigation.isDone()) {
        this.recalc = 10;
        this.px = t.x;
        this.py = t.y;
        this.pz = t.z;
        const path = m.navigation.createPathToEntity(t, 0);
        m.noteReach(path);
        m.navigation.moveToPath(path, 1);
      }
    } else {
      m.navigation.stop();
      m.cantReachSince = -1;
    }
    if (this.cooldown <= 0 && inReach && seen) {
      this.cooldown = m.isBaby() ? 15 : 40;
      m.swing();
      m.doHurtTarget(t);
    }
  }
}

/**
 * vanilla HoglinAi.createIdleMovementBehaviors: RunOne of RandomStroll(0.4) ×2, SetWalkTargetFromLookTarget(0.4, 3) ×2
 * and DoNothing(30..60) ×1, tried again as soon as the last walk is done, so they're rarely still
 */
class BruteStrollGoal extends Goal {
  private idle = 0;
  private wx = 0;
  private wy = 0;
  private wz = 0;
  /** walking up to what it's looking at: it stops three blocks short */
  private toLook = false;
  constructor(readonly mob: Brute) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.target) return false;
    this.toLook = false;
    if (this.idle > 0) {
      this.idle -= 2;
      return false;
    }
    const k = m.random.nextInt(5);
    if (k < 2) {
      const p = landRandomPos(m, 10, 7);
      if (!p) return false;
      [this.wx, this.wy, this.wz] = [p[0] + 0.5, p[1], p[2] + 0.5];
      return true;
    }
    if (k < 4) {
      const l = m.lookTarget;
      if (!l || !l.isAlive || m.distanceToSqr(l.x, l.y, l.z) <= 9) return false;
      [this.wx, this.wy, this.wz] = [l.x, l.y, l.z];
      this.toLook = true;
      return true;
    }
    this.idle = 30 + m.random.nextInt(31);
    return false;
  }
  override canContinueToUse(): boolean {
    const m = this.mob;
    if (this.toLook && m.distanceToSqr(this.wx, this.wy, this.wz) <= 9) return false;
    return !m.navigation.isDone() && !m.target;
  }
  override start(): void {
    this.mob.navigation.moveTo(this.wx, this.wy, this.wz, 0.4);
  }
  override stop(): void {
    this.mob.navigation.stop();
  }
}

/** vanilla SetEntityLookTargetSometimes(8, 30..60) with LookAtTargetSink(45, 90): now and then eye the nearest thing */
class BruteLookGoal extends Goal {
  private ticker = 0;
  private lookTime = 0;
  constructor(readonly mob: Brute) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    const m = this.mob;
    if ((this.ticker -= 2) > 0) return false;
    this.ticker = 30 + m.random.nextInt(31);
    const e = m.visibleLiving.find((v) => v.isAlive && m.distanceToSqr(v.x, v.y, v.z) <= 64 && !m.passengers.includes(v));
    m.lookTarget = e ?? null;
    return !!e;
  }
  override canContinueToUse(): boolean {
    const l = this.mob.lookTarget;
    return this.lookTime > 0 && !!l && l.isAlive && this.mob.sensing.hasLineOfSight(l);
  }
  override start(): void {
    this.lookTime = 45 + this.mob.random.nextInt(46);
  }
  override stop(): void {
    this.mob.lookTarget = null;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    this.lookTime--;
    const l = this.mob.lookTarget;
    if (l) this.mob.lookControl.setLookAtEntity(l);
  }
}

/**
 * vanilla SetWalkTargetAwayFrom: while `from` is within `dist` blocks walk to a random spot away from it
 * (LandRandomPos.getPosAway(16, 7))
 */
class WalkAwayGoal extends Goal {
  private wx = 0;
  private wy = 0;
  private wz = 0;
  constructor(readonly mob: Hoglin, readonly from: () => [number, number, number] | null, readonly speed: number, readonly dist: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const a = this.from(), m = this.mob;
    if (!a || m.distanceToSqr(a[0], a[1], a[2]) >= this.dist * this.dist) return false;
    const p = defaultRandomPosAway(m, 16, 7, a[0], a[1], a[2]);
    if (!p) return false;
    [this.wx, this.wy, this.wz] = [p[0] + 0.5, p[1], p[2] + 0.5];
    return true;
  }
  override canContinueToUse(): boolean {
    return !!this.from() && !this.mob.navigation.isDone();
  }
  override start(): void {
    this.mob.navigation.moveTo(this.wx, this.wy, this.wz, this.speed);
  }
  override stop(): void {
    this.mob.navigation.stop();
  }
}

/** vanilla BabyFollowAdult(5..16, 0.6): a piglet keeps within five blocks of the nearest grown hoglin in sight */
class BabyFollowAdultGoal extends Goal {
  private adult: Hoglin | null = null;
  private recalc = 0;
  constructor(readonly mob: Hoglin) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    if (!m.isBaby() || m.target || m.avoidTarget) return false;
    const a = m.visibleLiving.find((e) => e instanceof Hoglin && !e.isBaby()) as Hoglin | undefined;
    if (!a) return false;
    const d = m.distanceToSqr(a.x, a.y, a.z);
    if (d >= 17 * 17 || d < 25) return false;
    this.adult = a;
    return true;
  }
  override canContinueToUse(): boolean {
    const a = this.adult, m = this.mob;
    return !!a && a.isAlive && m.isBaby() && !m.target && m.distanceToSqr(a.x, a.y, a.z) > 16;
  }
  override start(): void {
    this.recalc = 0;
  }
  override stop(): void {
    this.adult = null;
    this.mob.navigation.stop();
  }
  override tick(): void {
    const a = this.adult;
    if (!a) return;
    this.mob.lookControl.setLookAtEntity(a);
    if (--this.recalc <= 0) {
      this.recalc = this.adjustedTickDelay(10);
      this.mob.navigation.moveToEntity(a, 0.6);
    }
  }
}

/** vanilla AnimalMakeLove(HOGLIN, 0.6); while it runs the hoglin has a BREED_TARGET and won't pick a fight */
class HoglinMakeLoveGoal extends BreedGoal {
  constructor(readonly hoglin: Hoglin) {
    super(hoglin, 0.6);
  }
  override start(): void {
    super.start();
    this.hoglin.breeding = true;
  }
  override stop(): void {
    super.stop();
    this.hoglin.breeding = false;
  }
}

// ---------------------------------------------------------------------------

export class Hoglin extends Animal {
  readonly type = 'hoglin';
  override readonly category: MobCategory = 'monster';
  protected adultWidth = 1.3964844;
  protected adultHeight = 1.4;
  protected override readonly brainAsGoals = true;
  /** vanilla attackAnimationRemainingTicks: the head swings up through a strike (HoglinModel.setupAnim) */
  attackAnimationRemainingTicks = 0;
  private timeInOverworld = 0;
  /** vanilla IsImmuneToZombification */
  immuneToZombification = false;
  /** vanilla CannotBeHunted (piglins leave it be) */
  cannotBeHunted = false;
  // brain memories
  avoidTarget: LivingEntity | null = null;
  private avoidUntil = 0;
  /** when the ATTACK_TARGET memory runs out (0: it doesn't) */
  private targetUntil = 0;
  private pacifiedUntil = 0;
  cantReachSince = -1;
  breeding = false;
  lookTarget: LivingEntity | null = null;
  /** vanilla NEAREST_REPELLENT */
  repellent: [number, number, number] | null = null;
  visibleLiving: LivingEntity[] = [];
  private visibleAdultHoglins: Hoglin[] = [];
  private visibleAdultPiglins = 0;
  private nearestAttackablePlayer: LivingEntity | null = null;
  private activity: 'idle' | 'fight' | 'avoid' = 'idle';
  private sensorTime: number;

  constructor(level: Level) {
    super(level);
    this.setSize(1.3964844, 1.4);
    this.maxHealth = this.health = 40;
    this.moveSpeedAttr = 0.3;
    this.kbResist = 0.6;
    this.attackKnockback = 1;
    this.attackDamage = 6;
    this.xpReward = 5;
    this.sensorTime = this.random.nextInt(20);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new HoglinMakeLoveGoal(this));
    this.goalSelector.addGoal(1, new BruteMeleeGoal(this));
    // AVOID: SetWalkTargetAwayFrom.entity(AVOID_TARGET, 1.3, 15, false)
    this.goalSelector.addGoal(2, new WalkAwayGoal(this, () => (this.avoidTarget && !this.target ? [this.avoidTarget.x, this.avoidTarget.y, this.avoidTarget.z] : null), 1.3, 15));
    // IDLE: SetWalkTargetAwayFrom.pos(NEAREST_REPELLENT, 1.0, 8, true)
    this.goalSelector.addGoal(3, new WalkAwayGoal(this, () => (this.repellent && !this.target && !this.avoidTarget ? [this.repellent[0] + 0.5, this.repellent[1], this.repellent[2] + 0.5] : null), 1, 8));
    this.goalSelector.addGoal(4, new BabyFollowAdultGoal(this));
    this.goalSelector.addGoal(5, new BruteStrollGoal(this));
    this.goalSelector.addGoal(6, new BruteLookGoal(this));
  }

  /** vanilla EntityType.HOGLIN passengerAttachments(1.49375) (a baby piglin rides a piglet: half that) */
  override passengerAttachmentY(_p: Entity): number {
    return this.isBaby() ? 0.746875 : 1.49375;
  }

  /** vanilla AgeableMob.setAge, then Hoglin.ageBoundaryReached: a piglet bites for 0.5 and is worth 3 xp */
  override setAge(a: number): void {
    const was = this.isBaby();
    super.setAge(a);
    if (was !== this.isBaby()) {
      this.attackDamage = this.isBaby() ? 0.5 : 6;
      this.xpReward = this.isBaby() ? 3 : 5;
    }
  }
  /** vanilla Hoglin.finalizeSpawn: one in five is a piglet (and after a pack's first, the usual 1 in 20 more) */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    if (this.random.nextFloat() < 0.2) this.setAge(-24000);
    super.finalizeSpawn(reason, group);
  }
  /** vanilla Hoglin.isConverting: outside a piglin-safe dimension it rots */
  isConverting(): boolean {
    return !this.level.world.dim.piglinSafe && !this.immuneToZombification;
  }
  isPacified(): boolean {
    return this.level.gameTime < this.pacifiedUntil;
  }
  override canFallInLove(): boolean {
    return !this.isPacified() && super.canFallInLove();
  }
  isFood(s: ItemStack): boolean {
    return s.item.id === 'crimson_fungus';
  }
  /** vanilla getBreedOffspring: bred piglets never despawn */
  makeBaby(): Animal {
    const h = new Hoglin(this.level);
    h.persistenceRequired = true;
    return h;
  }
  /** vanilla Hoglin.mobInteract: once fed it stays */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const ok = super.interact(p, stack);
    if (ok) this.persistenceRequired = true;
    return ok;
  }
  /** vanilla Hoglin.removeWhenFarAway: unlike other animals it despawns */
  override removeWhenFarAway(): boolean {
    return true;
  }
  /** vanilla Hoglin.getWalkTargetValue: never near a repellent; crimson nylium is best */
  override walkTargetValue(x: number, y: number, z: number): number {
    const r = this.repellent;
    if (r && (r[0] - x) ** 2 + (r[1] - y) ** 2 + (r[2] - z) ** 2 < 64) return -1;
    return BLOCKS[STATE_BLOCK[this.level.world.getState(x, y - 1, z)]].name === 'crimson_nylium' ? 10 : 0;
  }
  override experienceReward(): number {
    return this.xpReward;
  }

  // --- combat ---------------------------------------------------------------

  override doHurtTarget(target: Entity): boolean {
    if (!(target instanceof LivingEntity)) return false;
    this.attackAnimationRemainingTicks = 10;
    this.playSound('entity.hoglin.attack', this.soundVolume(), this.voicePitch());
    this.onHitTarget(target);
    return hurtAndThrowTarget(this, target);
  }
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && attacker instanceof LivingEntity) this.wasHurtBy(attacker);
    return ok;
  }
  /** vanilla HoglinAi.wasHurtBy: a piglet runs, a grown one fights back and calls the herd */
  private wasHurtBy(e: LivingEntity): void {
    this.pacifiedUntil = 0;
    this.breeding = false;
    if (this.isBaby()) this.retreatFrom(e);
    else if ((this.activity !== 'avoid' || e.type !== 'piglin') && e.type !== 'hoglin' && !this.isOtherTargetMuchFurtherAway(e) && this.isEntityAttackable(e)) {
      this.setAttackTarget(e, true);
      this.broadcastAttackTarget(e);
    }
  }
  /** vanilla HoglinAi.onHitTarget: a grown hoglin's strike rallies the herd (unless it's losing to piglins) */
  private onHitTarget(t: LivingEntity): void {
    if (this.isBaby()) return;
    if (t.type === 'piglin' && this.piglinsOutnumberHoglins()) {
      this.setAvoidTarget(t);
      for (const h of this.visibleAdultHoglins) h.retreatFrom(t);
    } else this.broadcastAttackTarget(t);
  }
  /** vanilla HoglinAi.retreatFromNearestTarget */
  private retreatFrom(e: LivingEntity): void {
    this.setAvoidTarget(nearestOf(this, this.target, nearestOf(this, this.avoidTarget, e)));
  }
  /** vanilla HoglinAi.setAvoidTarget: forget the fight and flee for 5-20 s */
  private setAvoidTarget(e: LivingEntity): void {
    this.setTarget(null);
    this.targetUntil = 0;
    this.navigation.stop();
    this.avoidTarget = e;
    this.avoidUntil = this.level.gameTime + 100 + this.random.nextInt(301);
  }
  /** vanilla HoglinAi.setAttackTarget; one picked up from being hurt is forgotten after 10 s */
  setAttackTarget(e: LivingEntity, expires: boolean): void {
    this.cantReachSince = -1;
    this.breeding = false;
    this.setTarget(e);
    this.targetUntil = expires ? this.level.gameTime + 200 : 0;
  }
  /** vanilla HoglinAi.broadcastAttackTarget: every grown hoglin in sight turns on whichever is nearer it */
  private broadcastAttackTarget(e: LivingEntity): void {
    for (const h of this.visibleAdultHoglins) {
      if (h.removed || !h.isAlive || h.isPacified()) continue;
      h.setAttackTarget(nearestOf(h, h.target, e), true);
    }
  }
  private piglinsOutnumberHoglins(): boolean {
    return !this.isBaby() && this.visibleAdultPiglins > this.visibleAdultHoglins.length + 1;
  }
  /** vanilla BehaviorUtils.isOtherTargetMuchFurtherAwayThanCurrentAttackTarget (4 blocks of slack) */
  private isOtherTargetMuchFurtherAway(e: LivingEntity): boolean {
    const t = this.target;
    if (!t) return false;
    return e.distanceToSqr(this.x, this.y, this.z) > t.distanceToSqr(this.x, this.y, this.z) + 16;
  }
  /** vanilla Sensor.isEntityAttackable: its current target needn't be in sight */
  private isEntityAttackable(e: LivingEntity): boolean {
    return this.canAttack(e) && inSenseRange(this, e, e === this.target);
  }
  noteReach(path: Path | null): void {
    if (path && path.canReach()) this.cantReachSince = -1;
    else if (this.cantReachSince < 0) this.cantReachSince = this.level.gameTime;
  }

  // --- brain ----------------------------------------------------------------

  /** vanilla HoglinSpecificSensor: the nearest repellent (BlockPos.findClosestMatch 8 across, 4 up and down) and the herd */
  private sense(): void {
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const w = this.level.world;
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -8; dx <= 8; dx++)
        for (let dz = -8; dz <= 8; dz++) {
          const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (d >= bd) continue;
          if (!REPELLENTS.has(BLOCKS[STATE_BLOCK[w.getState(bx + dx, by + dy, bz + dz)]].name)) continue;
          bd = d;
          best = [bx + dx, by + dy, bz + dz];
        }
    this.repellent = best;
    this.visibleLiving = senseVisibleLiving(this);
    this.visibleAdultHoglins = [];
    this.visibleAdultPiglins = 0;
    for (const e of this.visibleLiving) {
      if (e instanceof Mob && e.isBaby()) continue;
      if (e instanceof Hoglin) this.visibleAdultHoglins.push(e);
      else if (e.type === 'piglin') this.visibleAdultPiglins++;
    }
    // PlayerSensor: NEAREST_VISIBLE_ATTACKABLE_PLAYER
    this.nearestAttackablePlayer = this.visibleLiving.find((e) => e.type === 'player' && this.isEntityAttackable(e)) ?? null;
  }

  /** vanilla Hoglin.customServerAiStep: the brain, HoglinAi.updateActivity, then the slow zombification */
  protected override customServerAiStep(): void {
    const gt = this.level.gameTime;
    if (--this.sensorTime <= 0) {
      this.sensorTime = 20;
      this.sense();
    }
    const av = this.avoidTarget;
    if (av && (gt >= this.avoidUntil || !av.isAlive || av.removed)) this.avoidTarget = null;
    // (AVOID's EraseMemoryIf(wantsToStopFleeing): a grown hoglin stops fleeing unless the piglins outnumber the herd)
    if (this.activity === 'avoid' && !this.isBaby() && !this.piglinsOutnumberHoglins()) this.avoidTarget = null;
    if (this.target && this.targetUntil > 0 && gt >= this.targetUntil) this.setTarget(null);
    const t = this.target;
    // FIGHT: StopAttackingIfTargetInvalid (it gives up after 10 s without a way to it), EraseMemoryIf(isBreeding)
    if (t && (!this.canAttack(t) || t.removed || (this.cantReachSince >= 0 && gt - this.cantReachSince > 200) || this.breeding)) this.setTarget(null);
    // IDLE and FIGHT: BecomePassiveIfMemoryPresent(NEAREST_REPELLENT, 200)
    if ((this.target || !this.avoidTarget) && this.repellent && !this.isPacified()) {
      this.pacifiedUntil = gt + 200;
      this.setTarget(null);
    }
    // IDLE: StartAttacking the nearest player it can see
    const p = this.nearestAttackablePlayer;
    if (!this.target && !this.avoidTarget && !this.isPacified() && !this.breeding && p && p.isAlive && this.canAttack(p)) {
      this.setAttackTarget(p, false);
    }
    // HoglinAi.updateActivity: the new activity's sound when it changes
    const act = this.target ? 'fight' : this.avoidTarget ? 'avoid' : 'idle';
    if (act !== this.activity) {
      this.activity = act;
      this.playSound(this.activitySound(), this.soundVolume(), this.voicePitch());
    }
    this.aggressive = !!this.target;
    if (this.isConverting()) {
      if (++this.timeInOverworld > 300) {
        this.playSound('entity.hoglin.converted_to_zombified', this.soundVolume(), this.voicePitch());
        this.finishConversion();
        return;
      }
    } else this.timeInOverworld = 0;
    super.customServerAiStep();
  }

  /** vanilla Hoglin.finishConversion (Mob.convertTo): a zoglin in its place, sick for ten seconds */
  private finishConversion(): void {
    const z = new Zoglin(this.level);
    z.moveTo(this.x, this.y, this.z, this.yaw, this.pitch);
    z.bodyYaw = z.bodyYawO = this.bodyYaw;
    z.headYaw = z.headYawO = this.headYaw;
    z.setBaby(this.isBaby());
    z.persistenceRequired = this.persistenceRequired;
    this.level.addEntity(z);
    z.addEffect(new MobEffectInstance(MOB_EFFECTS.nausea, 200, 0));
    this.remove();
  }

  override aiStep(): void {
    if (this.attackAnimationRemainingTicks > 0) this.attackAnimationRemainingTicks--;
    super.aiStep();
  }

  // --- sounds ---------------------------------------------------------------

  /** vanilla HoglinAi.getSoundForActivity */
  private activitySound(): string {
    if (this.activity === 'avoid' || this.isConverting()) return 'entity.hoglin.retreat';
    if (this.activity === 'fight') return 'entity.hoglin.angry';
    return this.repellent ? 'entity.hoglin.retreat' : 'entity.hoglin.ambient';
  }
  override ambientSound(): string {
    return this.activitySound();
  }
  override hurtSound(): string {
    return 'entity.hoglin.hurt';
  }
  override deathSound(): string {
    return 'entity.hoglin.death';
  }
  override stepSound(): string {
    return 'entity.hoglin.step';
  }
  protected override swimSplashSound(): string {
    return 'entity.hostile.splash';
  }

  /** vanilla entities/hoglin: 2-4 porkchops (cooked if it burned) and maybe some leather; piglets drop nothing */
  override lootTable(): LootEntry[] {
    if (this.isBaby()) return [];
    return [
      { item: 'porkchop', min: 2, max: 4, cooked: 'cooked_porkchop' },
      { item: 'leather', min: 0, max: 1 },
    ];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), timeInOverworld: this.timeInOverworld };
    if (this.immuneToZombification) d.immuneToZombification = true;
    if (this.cannotBeHunted) d.cannotBeHunted = true;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.immuneToZombification = !!d.immuneToZombification;
    this.cannotBeHunted = !!d.cannotBeHunted;
    this.timeInOverworld = Number(d.timeInOverworld ?? 0);
  }
}

// ---------------------------------------------------------------------------

export class Zoglin extends Monster {
  readonly type = 'zoglin';
  protected override readonly brainAsGoals = true;
  baby = false;
  attackAnimationRemainingTicks = 0;
  private targetUntil = 0;
  cantReachSince = -1;
  lookTarget: LivingEntity | null = null;
  visibleLiving: LivingEntity[] = [];
  private fighting = false;
  private sensorTime: number;

  constructor(level: Level) {
    super(level);
    this.setSize(1.3964844, 1.4);
    this.maxHealth = this.health = 40;
    this.moveSpeedAttr = 0.3;
    this.kbResist = 0.6;
    this.attackKnockback = 1;
    this.attackDamage = 6;
    this.xpReward = 5;
    this.sensorTime = this.random.nextInt(20);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new BruteMeleeGoal(this));
    this.goalSelector.addGoal(5, new BruteStrollGoal(this));
    this.goalSelector.addGoal(6, new BruteLookGoal(this));
  }
  override isBaby(): boolean {
    return this.baby;
  }
  /** vanilla Zoglin.setBaby: a baby is half size and bites for 0.5 */
  setBaby(b: boolean): void {
    this.baby = b;
    this.setSize(b ? 1.3964844 / 2 : 1.3964844, b ? 0.7 : 1.4);
    if (b) this.attackDamage = 0.5;
  }
  /** vanilla EntityType.ZOGLIN fireImmune() */
  override fireImmune(): boolean {
    return true;
  }
  /** vanilla #undead */
  override isUndead(): boolean {
    return true;
  }

  override doHurtTarget(target: Entity): boolean {
    if (!(target instanceof LivingEntity)) return false;
    this.attackAnimationRemainingTicks = 10;
    this.playSound('entity.zoglin.attack', this.soundVolume(), this.voicePitch());
    return hurtAndThrowTarget(this, target);
  }
  /** vanilla Zoglin.hurt: turns on whoever hit it, unless its current target is much nearer */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && attacker instanceof LivingEntity && this.canAttack(attacker)) {
      const t = this.target;
      if (!t || attacker.distanceToSqr(this.x, this.y, this.z) <= t.distanceToSqr(this.x, this.y, this.z) + 16) this.setAttackTarget(attacker, true);
    }
    return ok;
  }
  private setAttackTarget(e: LivingEntity, expires: boolean): void {
    this.cantReachSince = -1;
    this.setTarget(e);
    this.targetUntil = expires ? this.level.gameTime + 200 : 0;
  }
  /** vanilla Zoglin.isTargetable: anything but creepers and other zoglins */
  private isTargetable(e: LivingEntity): boolean {
    return e.type !== 'zoglin' && e.type !== 'creeper' && this.canAttack(e) && inSenseRange(this, e, e === this.target);
  }
  noteReach(path: Path | null): void {
    if (path && path.canReach()) this.cantReachSince = -1;
    else if (this.cantReachSince < 0) this.cantReachSince = this.level.gameTime;
  }

  /** vanilla Zoglin.customServerAiStep: the brain, then updateActivity (a growl on starting a fight) */
  protected override customServerAiStep(): void {
    const gt = this.level.gameTime;
    if (--this.sensorTime <= 0) {
      this.sensorTime = 20;
      this.visibleLiving = senseVisibleLiving(this);
    }
    if (this.target && this.targetUntil > 0 && gt >= this.targetUntil) this.setTarget(null);
    const t = this.target;
    if (t && (!this.canAttack(t) || t.removed || (this.cantReachSince >= 0 && gt - this.cantReachSince > 200))) this.setTarget(null);
    // IDLE: StartAttacking the nearest valid thing in sight
    if (!this.target) {
      const e = this.visibleLiving.find((v) => v.isAlive && !v.removed && this.isTargetable(v));
      if (e) this.setAttackTarget(e, false);
    }
    const fighting = !!this.target;
    if (fighting && !this.fighting) this.playSound('entity.zoglin.angry', this.soundVolume(), this.voicePitch());
    this.fighting = fighting;
    this.aggressive = fighting;
    super.customServerAiStep();
  }

  override aiStep(): void {
    if (this.attackAnimationRemainingTicks > 0) this.attackAnimationRemainingTicks--;
    super.aiStep();
  }

  override ambientSound(): string {
    return this.target ? 'entity.zoglin.angry' : 'entity.zoglin.ambient';
  }
  override hurtSound(): string {
    return 'entity.zoglin.hurt';
  }
  override deathSound(): string {
    return 'entity.zoglin.death';
  }
  override stepSound(): string {
    return 'entity.zoglin.step';
  }

  /** vanilla entities/zoglin: 1-3 rotten flesh */
  override lootTable(): LootEntry[] {
    if (this.isBaby()) return [];
    return [{ item: 'rotten_flesh', min: 1, max: 3 }];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return this.baby ? { baby: true } : {};
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    if (d.baby) this.setBaby(true);
  }
}
