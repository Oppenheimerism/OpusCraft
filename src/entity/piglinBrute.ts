// (bastions) The piglin brute (vanilla PiglinBrute + PiglinBruteAi): the bastion remnants' guards. Only a bastion
// brings them (no natural spawns, no spawners); each holds a golden axe and remembers where it was put (its HOME),
// wandering near it and walking back to it when it strays. Gold means nothing to a brute: it neither barters nor
// admires, picks up nothing but golden axes, and goes for any player within 12 blocks it can see, gold armour or
// not, and for wither skeletons and the wither; hit one, or a piglin near it, and the group round it joins in.
// Taken out of the Nether it turns into a zombified piglin after fifteen seconds, as a piglin does.
//
// Vanilla's brain has three activities: CORE (look, walk, stop being angry at the dead), IDLE (start attacking,
// look about, wander: stroll, walk up to a piglin or a brute, stroll home, stroll round home, rest) and FIGHT
// (drop a target that isn't the one it should fight or it can't reach, walk up to it, hit it every second). The port
// keeps that shape, as piglin.ts does: memories are fields with expiry times, behaviours are methods.

import type { SpawnReason, LootEntry } from './mob';
import type { Level } from '../game/level';
import type { DifficultyInstance } from '../game/difficulty';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { AbstractPiglin, Piglin } from './piglin';
import { defaultRandomPosTowards, landRandomPos } from './ai/goals';
import type { Path } from './ai/pathfinder';
import { ItemStack } from '../item/item';

/** vanilla Sensor: what a brute notices, within 16 */
const SENSE_RANGE = 16;
/** vanilla PiglinBruteAi: angry for 30 s, a blow a second, players within 12, home within 2 / too far past 100 / round it 5 */
const ANGER_TICKS = 600, MELEE_COOLDOWN = 20, TARGETING_RANGE = 12;
const HOME_CLOSE_ENOUGH = 2, HOME_TOO_FAR = 100, HOME_STROLL_AROUND = 5;
/** vanilla PiglinBruteAi.ACTIVITY_SOUND_LIKELIHOOD_PER_TICK */
const ACTIVITY_SOUND_CHANCE = 0.0125;
/** vanilla StrollToPoi and StrollAroundPoi: how often they set out (ticks) */
const STROLL_HOME_EVERY = 80, STROLL_ROUND_HOME_EVERY = 180;

interface WalkTarget {
  x: number;
  y: number;
  z: number;
  entity: Entity | null;
  speed: number;
  closeEnough: number;
}

type LookTarget = Entity | [number, number, number];

/** vanilla GlobalPos: a block in a dimension */
export interface Home {
  dim: string;
  x: number;
  y: number;
  z: number;
}

export type BruteActivity = 'fight' | 'idle';

export class PiglinBrute extends AbstractPiglin {
  readonly type = 'piglin_brute';
  activity: BruteActivity = 'idle';
  /** vanilla HOME: where it was when it was placed (PiglinBruteAi.initMemories) */
  home: Home | null = null;

  // memories (expiry in game ticks)
  private angryAt: LivingEntity | null = null;
  private angryUntil = 0;
  private attackCoolingUntil = 0;
  /** vanilla CANT_REACH_WALK_TARGET_SINCE (-1: absent) */
  private cantReachSince = -1;
  private walkTarget: WalkTarget | null = null;
  private lookTarget: LookTarget | null = null;

  // running behaviours
  private lookSinkUntil = 0;
  private sinkPath: Path | null = null;
  private sinkTarget: [number, number, number] | null = null;
  private sinkCooldown = 0;
  private idleLookBusyUntil = 0;
  private idleMoveBusyUntil = 0;
  /** vanilla StrollToPoi's and StrollAroundPoi's own clocks: not again before */
  private strollHomeAt = 0;
  private strollRoundHomeAt = 0;

  // sensor memories
  private visibleLiving: LivingEntity[] = [];
  private nearestVisiblePlayer: Player | null = null;
  private nemesis: LivingEntity | null = null;
  private nearbyAdultPiglins: AbstractPiglin[] = [];

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 50;
    this.moveSpeedAttr = 0.35;
    this.attackDamage = 7;
    this.xpReward = 20;
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  /** a brute is never a baby */
  override isBaby(): boolean {
    return false;
  }

  setBaby(_b: boolean): void {}

  /** vanilla PiglinBrute.finalizeSpawn: its home where it stands (PiglinBruteAi.initMemories), a golden axe in hand */
  override finalizeSpawn(_reason: SpawnReason): void {
    this.home = { dim: this.level.world.dim.id, x: Math.floor(this.x), y: Math.floor(this.y), z: Math.floor(this.z) };
    this.populateDefaultEquipmentSlots(this.spawnDifficulty());
  }

  /** vanilla PiglinBrute.populateDefaultEquipmentSlots */
  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    this.setItemSlot('mainhand', ItemStack.of('golden_axe'));
  }

  /** vanilla PiglinBrute.canHunt: never */
  canHunt(): boolean {
    return false;
  }

  /** vanilla PiglinBrute.wantsToPickUp: a golden axe and nothing else */
  override wantsToPickUp(s: ItemStack): boolean {
    return s.item.id === 'golden_axe' && super.wantsToPickUp(s);
  }

  private get now(): number {
    return this.level.gameTime;
  }

  angryTarget(): LivingEntity | null {
    return this.angryUntil > this.now ? this.angryAt : null;
  }

  // --- sensing (vanilla NearestLivingEntitySensor, PlayerSensor, PiglinBruteSpecificSensor) -----------------------

  /** vanilla Sensor.isEntityTargetable: within 16 (less for a sneaking or invisible player), and seen */
  private targetable(e: LivingEntity, ignoreSight = false): boolean {
    if (!e.isAlive || e.removed) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    const r = ignoreSight ? SENSE_RANGE : Math.max(SENSE_RANGE * e.visibilityPercent(this), 2);
    if (e.distanceToSqr(this.x, this.y, this.z) > r * r) return false;
    return ignoreSight || this.sensing.hasLineOfSight(e);
  }

  /** vanilla Sensor.isEntityAttackable (TargetingConditions.forCombat) */
  private attackable(e: LivingEntity, ignoreSight = false): boolean {
    return this.targetable(e, ignoreSight) && this.canAttack(e);
  }

  private sense(): void {
    const r = SENSE_RANGE;
    const near = this.level.getEntities(this.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, this) as LivingEntity[];
    near.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    this.visibleLiving = near.filter((e) => this.targetable(e));
    this.nearestVisiblePlayer = this.nearestVisibleAttackablePlayer = null;
    this.nemesis = null;
    for (const e of this.visibleLiving) {
      if (e.type === 'player') {
        this.nearestVisiblePlayer ??= e as Player;
        if (!this.nearestVisibleAttackablePlayer && this.canAttack(e)) this.nearestVisibleAttackablePlayer = e as Player;
      } else if (!this.nemesis && (e.type === 'wither_skeleton' || e.type === 'wither')) this.nemesis = e;
    }
    this.nearbyAdultPiglins = near.filter((e): e is AbstractPiglin => e instanceof AbstractPiglin && e.isAdult());
  }

  // --- the brain ------------------------------------------------------------

  protected override customServerAiStep(): void {
    this.brainTick();
    this.updateActivity();
    // vanilla PiglinBruteAi.maybePlayActivitySound: now and then, a fighting brute's angry snort
    if (this.level.random.nextFloat() < ACTIVITY_SOUND_CHANCE) this.playActivitySound();
    super.customServerAiStep();
  }

  private brainTick(): void {
    const now = this.now;
    if (this.angryUntil <= now) this.angryAt = null;
    if ((this.tickCount + this.id) % 20 === 0 || this.tickCount === 1) this.sense();
    const t0 = this.target;
    if (t0 && t0.removed && !t0.dead) this.setTarget(null);

    // ---- CORE: LookAtTargetSink(45, 90), MoveToTargetSink, StopBeingAngryIfTargetDead ----
    this.lookAtTargetSink();
    this.moveToTargetSink();
    const angry = this.angryTarget();
    if (angry && (angry.dead || angry.health <= 0) && (angry.type !== 'player' || this.level.gameRules.forgiveDeadPlayers)) this.angryAt = null;

    if (this.activity === 'fight') this.fight();
    else {
      // ---- IDLE ----
      this.startAttacking();
      this.idleLook();
      this.idleMove();
      // SetLookAndInteract(player, 4)
      const p = this.nearestVisiblePlayer;
      if (p && !this.lookTarget && p.distanceToSqr(this.x, this.y, this.z) <= 16) this.lookTarget = p;
    }
  }

  /** vanilla PiglinBruteAi.updateActivity: FIGHT while it has a target, else IDLE; the change voiced */
  private updateActivity(): void {
    const before = this.activity;
    const next: BruteActivity = this.target ? 'fight' : 'idle';
    if (before !== next) {
      // (FIGHT is addActivityAndRemoveMemoryWhenStopped(ATTACK_TARGET))
      if (before === 'fight') this.setTarget(null);
      this.activity = next;
      this.playActivitySound();
    }
    this.aggressive = !!this.target;
  }

  /** vanilla PiglinBruteAi.playActivitySound: the angry sound, while fighting */
  private playActivitySound(): void {
    if (this.activity === 'fight') this.playSound('entity.piglin_brute.angry', this.soundVolume(), this.voicePitch());
  }

  // --- behaviours -----------------------------------------------------------

  /** vanilla RunOne: a weighted shuffle, then the first that will start */
  private runOne(options: [number, () => boolean][]): void {
    const r = this.random;
    const order = options.map(([w, f]) => ({ k: -Math.pow(r.nextFloat(), 1 / w), f }));
    order.sort((a, b) => a.k - b.k);
    for (const o of order) if (o.f()) return;
  }

  /** vanilla SetEntityLookTarget: with nothing to look at, the nearest seen within `range` that fits */
  private lookAtNearest(pred: (e: LivingEntity) => boolean, range: number): boolean {
    if (this.lookTarget) return false;
    const e = this.visibleLiving.find((e) => e.distanceToSqr(this.x, this.y, this.z) <= range * range && pred(e));
    if (!e) return false;
    this.lookTarget = e;
    return true;
  }

  /** vanilla LookAtTargetSink(45, 90) */
  private lookAtTargetSink(): void {
    const lt = this.lookTarget;
    if (!lt) {
      this.lookSinkUntil = 0;
      return;
    }
    if (!Array.isArray(lt) && (lt.removed || (lt instanceof LivingEntity && !this.visibleLiving.includes(lt) && lt !== this.target))) {
      this.lookTarget = null;
      this.lookSinkUntil = 0;
      return;
    }
    if (this.lookSinkUntil === 0) this.lookSinkUntil = this.now + 45 + this.random.nextInt(46);
    else if (this.now >= this.lookSinkUntil) {
      this.lookTarget = null;
      this.lookSinkUntil = 0;
      return;
    }
    if (Array.isArray(lt)) this.lookControl.setLookAt(lt[0] + 0.5, lt[1] + 0.5, lt[2] + 0.5);
    else this.lookControl.setLookAt(lt.x, lt.y + (lt instanceof LivingEntity ? lt.eyeHeight : lt.height * 0.85), lt.z);
  }

  private setWalkTarget(x: number, y: number, z: number, speed: number, closeEnough: number, entity: Entity | null = null): void {
    this.walkTarget = { x, y, z, entity, speed, closeEnough };
  }

  private walkTargetBlock(w: WalkTarget): [number, number, number] {
    if (w.entity) [w.x, w.y, w.z] = [w.entity.x, w.entity.y, w.entity.z];
    return [Math.floor(w.x), Math.floor(w.y), Math.floor(w.z)];
  }

  private reachedWalkTarget(w: WalkTarget): boolean {
    const [bx, by, bz] = this.walkTargetBlock(w);
    return Math.abs(bx - Math.floor(this.x)) + Math.abs(by - Math.floor(this.y)) + Math.abs(bz - Math.floor(this.z)) <= w.closeEnough;
  }

  /** vanilla MoveToTargetSink.tryComputePath (with no way at all, somewhere up to 10 off towards it) */
  private tryComputePath(w: WalkTarget): boolean {
    const [bx, by, bz] = this.walkTargetBlock(w);
    const nav = this.navigation;
    this.sinkPath = nav.createPath(bx + 0.5, by, bz + 0.5, 0);
    if (this.reachedWalkTarget(w)) this.cantReachSince = -1;
    else {
      if (this.sinkPath?.canReach()) this.cantReachSince = -1;
      else if (this.cantReachSince < 0) this.cantReachSince = this.now;
      if (this.sinkPath) return true;
      const p = defaultRandomPosTowards(this, 10, 7, bx + 0.5, bz + 0.5, Math.PI / 2);
      if (p) {
        this.sinkPath = nav.createPath(p[0] + 0.5, p[1], p[2] + 0.5, 0);
        return !!this.sinkPath;
      }
    }
    return false;
  }

  /** vanilla MoveToTargetSink */
  private moveToTargetSink(): void {
    const w = this.walkTarget, nav = this.navigation;
    if (this.sinkTarget) {
      if (!w || (w.entity && w.entity.removed) || nav.isDone() || this.reachedWalkTarget(w)) {
        if (w && !this.reachedWalkTarget(w) && nav.isStuck) this.sinkCooldown = this.random.nextInt(40);
        nav.stop();
        this.walkTarget = null;
        this.sinkPath = null;
        this.sinkTarget = null;
        return;
      }
      const [bx, by, bz] = this.walkTargetBlock(w), l = this.sinkTarget;
      if ((bx - l[0]) ** 2 + (by - l[1]) ** 2 + (bz - l[2]) ** 2 > 4 && this.tryComputePath(w)) {
        this.sinkTarget = [bx, by, bz];
        nav.moveToPath(this.sinkPath, w.speed);
      }
      return;
    }
    if (!w) return;
    if (this.sinkCooldown > 0) {
      this.sinkCooldown--;
      return;
    }
    const reached = this.reachedWalkTarget(w);
    if (!reached && this.tryComputePath(w)) {
      this.sinkTarget = this.walkTargetBlock(w);
      nav.moveToPath(this.sinkPath, w.speed);
    } else {
      this.walkTarget = null;
      if (reached) this.cantReachSince = -1;
    }
  }

  /** vanilla StartAttacking(findNearestValidAttackTarget) */
  private startAttacking(): void {
    if (this.target) return;
    const t = this.findNearestValidAttackTarget();
    if (t && this.canAttack(t)) {
      this.setTarget(t);
      this.cantReachSince = -1;
    }
  }

  /**
   * vanilla PiglinBruteAi.findNearestValidAttackTarget: what it's angry at (if it may be fought, seen or not), else
   * the nearest player it sees and may fight within 12 blocks, else a wither skeleton or the wither it sees
   */
  private findNearestValidAttackTarget(): LivingEntity | null {
    const angry = this.angryTarget();
    if (angry && this.attackable(angry, true)) return angry;
    const p = this.nearestVisibleAttackablePlayer;
    if (p && p.distanceToSqr(this.x, this.y, this.z) < TARGETING_RANGE * TARGETING_RANGE) return p;
    return this.nemesis;
  }

  /**
   * vanilla PiglinBruteAi.createIdleLookBehaviors: RunOne(look at a player, a piglin, a brute or anything within 8,
   * or 30-60 ticks of nothing)
   */
  private idleLook(): void {
    if (this.idleLookBusyUntil > this.now) return;
    this.runOne([
      [1, () => this.lookAtNearest((e) => e.type === 'player', 8)],
      [1, () => this.lookAtNearest((e) => e instanceof Piglin, 8)],
      [1, () => this.lookAtNearest((e) => e instanceof PiglinBrute, 8)],
      [1, () => this.lookAtNearest(() => true, 8)],
      [1, () => ((this.idleLookBusyUntil = this.now + 30 + this.random.nextInt(31)), true)],
    ]);
  }

  /**
   * vanilla PiglinBruteAi.createIdleMovementBehaviors: RunOne(stroll at 0.6 (2), up to a piglin within 8 (2), up to
   * a brute within 8 (2), stroll home (2), stroll round home (2), or 30-60 ticks of nothing (1))
   */
  private idleMove(): void {
    if (this.idleMoveBusyUntil > this.now) return;
    this.runOne([
      [2, () => this.stroll()],
      [2, () => this.interactWith((e) => e instanceof Piglin)],
      [2, () => this.interactWith((e) => e instanceof PiglinBrute)],
      [2, () => this.strollToHome()],
      [2, () => this.strollAroundHome()],
      [1, () => ((this.idleMoveBusyUntil = this.now + 30 + this.random.nextInt(31)), true)],
    ]);
  }

  /** vanilla RandomStroll.stroll(0.6): with nowhere to go, a random spot on land within 10 (7 up and down) */
  private stroll(): boolean {
    if (this.walkTarget) return false;
    const p = landRandomPos(this, 10, 7);
    if (p) this.setWalkTarget(p[0] + 0.5, p[1], p[2] + 0.5, 0.6, 0);
    return true;
  }

  /** vanilla InteractWith.of(type, 8, INTERACTION_TARGET, 0.6, 2): up to the nearest one within 8 */
  private interactWith(pred: (e: LivingEntity) => boolean): boolean {
    if (this.walkTarget || !this.visibleLiving.some(pred)) return false;
    const e = this.visibleLiving.find((e) => pred(e) && e.distanceToSqr(this.x, this.y, this.z) <= 64);
    if (e) {
      this.lookTarget = e;
      this.setWalkTarget(e.x, e.y, e.z, 0.6, 2, e);
    }
    return true;
  }

  /** is home in this dimension, and within `d` of it */
  private homeWithin(d: number): boolean {
    const h = this.home;
    if (!h || h.dim !== this.level.world.dim.id) return false;
    return (h.x + 0.5 - this.x) ** 2 + (h.y + 0.5 - this.y) ** 2 + (h.z + 0.5 - this.z) ** 2 < d * d;
  }

  /**
   * vanilla StrollToPoi.create(HOME, 0.6, 2, 100): within 100 blocks of home, every 4 s it sets off back there (to
   * within 2); further off it has given it up
   */
  private strollToHome(): boolean {
    if (!this.homeWithin(HOME_TOO_FAR)) return false;
    if (this.now <= this.strollHomeAt) return true;
    const h = this.home!;
    this.setWalkTarget(h.x + 0.5, h.y, h.z + 0.5, 0.6, HOME_CLOSE_ENOUGH);
    this.strollHomeAt = this.now + STROLL_HOME_EVERY;
    return true;
  }

  /** vanilla StrollAroundPoi.create(HOME, 0.6, 5): within 5 of home, every 9 s a stroll to a spot within 8 (6 up and down) */
  private strollAroundHome(): boolean {
    if (!this.homeWithin(HOME_STROLL_AROUND)) return false;
    if (this.now <= this.strollRoundHomeAt) return true;
    const p = landRandomPos(this, 8, 6);
    this.walkTarget = p ? { x: p[0] + 0.5, y: p[1], z: p[2] + 0.5, entity: null, speed: 0.6, closeEnough: 1 } : null;
    this.strollRoundHomeAt = this.now + STROLL_ROUND_HOME_EVERY;
    return true;
  }

  // ---- FIGHT ----

  private fight(): void {
    const now = this.now, tg = this.target;
    if (!tg) return;
    // StopAttackingIfTargetInvalid: dead, not to be fought, tired of trying to reach it, or not the one to fight
    if (!tg.isAlive || !this.canAttack(tg) || (this.cantReachSince >= 0 && now - this.cantReachSince > 200) || this.findNearestValidAttackTarget() !== tg) {
      this.setTarget(null);
      return;
    }
    const seen = this.visibleLiving.includes(tg);
    // SetWalkTargetFromAttackTargetIfTargetOutOfReach(1.0)
    if (seen && this.isWithinMeleeAttackRange(tg)) this.walkTarget = null;
    else {
      this.lookTarget = tg;
      const w = this.walkTarget;
      if (w && w.entity === tg) w.speed = 1;
      else this.setWalkTarget(tg.x, tg.y, tg.z, 1, 0, tg);
    }
    // MeleeAttack(20)
    if (this.attackCoolingUntil <= now && seen && this.isWithinMeleeAttackRange(tg)) {
      this.lookTarget = tg;
      this.swing();
      this.doHurtTarget(tg);
      this.attackCoolingUntil = now + MELEE_COOLDOWN;
    }
  }

  // --- anger ----------------------------------------------------------------

  /** vanilla PiglinAi.setAngerTarget for a brute: angry for 30 s (at a player under universalAnger, at every player) */
  setAngerTarget(t: LivingEntity): void {
    if (!this.attackable(t, true)) return;
    this.cantReachSince = -1;
    this.angryAt = t;
    this.angryUntil = this.now + ANGER_TICKS;
  }

  /** vanilla PiglinAi.broadcastAngerTarget: the grown piglins and brutes about take it up if it's no further than theirs */
  private broadcastAngerTarget(t: LivingEntity): void {
    for (const p of this.nearbyAdultPiglins) {
      if (p.removed || p === this) continue;
      if (t.type === 'hoglin' && (!p.canHunt() || (t as LivingEntity & { cannotBeHunted?: boolean }).cannotBeHunted)) continue;
      const cur = p.angryTarget();
      const nearest = cur && p.distanceToSqr(cur.x, cur.y, cur.z) < p.distanceToSqr(t.x, t.y, t.z) ? cur : t;
      if (!cur || cur !== nearest) p.setAngerTarget(nearest);
    }
  }

  /** vanilla PiglinBrute.hurt → PiglinBruteAi.wasHurtBy: PiglinAi.maybeRetaliate, unless a piglin or a brute hit it */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && attacker instanceof LivingEntity && attacker !== this && !(attacker instanceof AbstractPiglin)) this.maybeRetaliate(attacker);
    return ok;
  }

  /** vanilla PiglinAi.maybeRetaliate (a brute has no AVOID activity) */
  private maybeRetaliate(t: LivingEntity): void {
    if (!this.attackable(t, true)) return;
    // (BehaviorUtils.isOtherTargetMuchFurtherAwayThanCurrentAttackTarget, 4 blocks)
    const cur = this.target;
    if (cur && t.distanceToSqr(this.x, this.y, this.z) > cur.distanceToSqr(this.x, this.y, this.z) + 16) return;
    if (t.type === 'player' && this.level.gameRules.universalAnger) {
      this.setAngerTarget(this.nearestVisibleAttackablePlayer ?? t);
      // broadcastUniversalAnger
      for (const p of this.nearbyAdultPiglins) if (p !== this && p.nearestVisibleAttackablePlayer) p.setAngerTarget(p.nearestVisibleAttackablePlayer);
    } else {
      this.setAngerTarget(t);
      this.broadcastAngerTarget(t);
    }
  }

  /** vanilla PiglinBrute.getArmPose: the axe raised while it's aggressive, else nothing */
  armPose(): 'attacking_with_melee_weapon' | 'default' {
    return this.aggressive && !!this.mainHand?.item.tool ? 'attacking_with_melee_weapon' : 'default';
  }

  // --- the rest --------------------------------------------------------------

  override lootTable(): LootEntry[] {
    return [];
  }
  override ambientSound(): string {
    return 'entity.piglin_brute.ambient';
  }
  override hurtSound(): string {
    return 'entity.piglin_brute.hurt';
  }
  override deathSound(): string {
    return 'entity.piglin_brute.death';
  }
  override stepSound(): string {
    return 'entity.piglin_brute.step';
  }
  protected convertedSound(): string {
    return 'entity.piglin_brute.converted_to_zombified';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const h = this.home;
    return {
      ...super.saveData(),
      timeInOverworld: this.timeInOverworld,
      immune: this.immuneToZombification,
      ...(h ? { home: `${h.dim} ${h.x} ${h.y} ${h.z}` } : {}),
    };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.timeInOverworld = Number(d.timeInOverworld ?? 0);
    this.immuneToZombification = d.immune === true;
    if (typeof d.home === 'string') {
      const [dim, x, y, z] = d.home.split(' ');
      this.home = { dim, x: Number(x), y: Number(y), z: Number(z) };
    }
  }
}
