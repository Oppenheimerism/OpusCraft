// The warden (vanilla Warden, 1.21). Blind, it hears: every vibration within 16 blocks of its head (the game events
// of #warden_can_listen, as far as wool lets them through) makes its tendrils twitch and angers it at whoever made
// it (a shot's owner a little, twice as much the second time); so does bumping into it, being sniffed out, and
// above all hurting it. Its anger at each of them (entity/wardenAnger.ts) cools a point a second; angry enough (80)
// at someone it may target, it roars, then goes after them: a blow of 30 that knocks back and knocks a shield down,
// or, when it hasn't hit them for a while, a sonic boom from its chest that no armour, enchantment, shield or wall
// stops. Otherwise it makes for where it was disturbed, sniffs the air, and wanders. Every six seconds darkness pulses
// from it for the players within 20 blocks; its heart beats faster the angrier it is. Summoned by a shrieker it
// comes up out of the ground (a shrieker's fourth warning: summonWarden), and after a minute undisturbed digs back
// down. Nothing hurts it while it does either. 500 health; no fire burns it and nothing knocks it back; it drops a
// sculk catalyst and 5 experience. Its brain is entity/wardenAi.ts; its looks render/wardenRenderer.ts.

import { Monster } from './monsters';
import { LivingEntity } from './living';
import { DYNAMIC_COLLISION, type Entity } from './entity';
import type { Player } from './player';
import type { Level } from '../game/level';
import type { SpawnGroup, SpawnReason, LootEntry } from './mob';
import { SensorClock, type Pos, type Tracker, type WalkTarget } from './ai/brainBehaviors';
import { PathNavigation } from './ai/navigation';
import { PathType, WalkNodeEvaluator, type Node, type NodeEvaluator } from './ai/pathfinder';
import { AngerManagement, angerLevelOf, AMBIENT_SOUND, LISTENING_SOUND, MINIMUM_ANGER, type AngerLevel } from './wardenAnger';
import {
  ACTIVITY_ORDER, EMERGE_DURATION, DIGGING_COOLDOWN, SAVED_MEMORIES, SONIC_BOOM_COOLDOWN, Memories, activityValid, eraseActivityMemories,
  makeWardenBrain, senseWardenEntities, setDigCooldown, setDisturbanceLocation, setSonicBoomCooldown, type WardenActivity, type WardenMemory,
} from './wardenAi';
import { VibrationData, VibrationListener, tickVibrations, type VibrationUser } from '../game/vibrations';
import { registerEntityListener } from '../game/gameEventDispatcher';
import { GAME_EVENT_TAGS, type GameEventName, type GameEventContext } from '../game/gameEvents';
import { applyDarknessAround, shriekerHooks } from '../game/sculkShrieker';
import { COLLISION, FLAGS, F_AIR, STATE_BLOCK } from '../world/block';
import { DYNAMIC_SHAPE, collisionFaceFull, dynamicCollision } from '../world/dynamicShapes';
import { UP } from '../world/dir';
import { wrapDegrees } from '../core/math';
import { AABB } from '../core/aabb';

/** vanilla Pose, as far as a warden takes one */
export type WardenPose = 'standing' | 'emerging' | 'digging' | 'roaring' | 'sniffing';

/** vanilla Warden.VIBRATION_COOLDOWN_TICKS: two seconds deaf after a vibration */
const VIBRATION_COOLDOWN_TICKS = 40;
/** vanilla Warden.TIME_TO_USE_MELEE_UNTIL_SONIC_BOOM: ten seconds of fighting a new target before the sonic boom */
const TIME_TO_USE_MELEE_UNTIL_SONIC_BOOM = 200;
/** vanilla Warden.DARKNESS_RADIUS and DARKNESS_INTERVAL */
const DARKNESS_RADIUS = 20;
const DARKNESS_INTERVAL = 120;
/** vanilla Warden.ANGERMANAGEMENT_TICK_DELAY */
const ANGER_TICK_DELAY = 20;
/** vanilla Warden.DEFAULT_ANGER, PROJECTILE_ANGER, ON_HURT_ANGER_BOOST and RECENT_PROJECTILE_TICK_THRESHOLD */
const DEFAULT_ANGER = 35;
const PROJECTILE_ANGER = 10;
const ON_HURT_ANGER_BOOST = 20;
const RECENT_PROJECTILE_TICK_THRESHOLD = 100;
/** vanilla Warden.TOUCH_COOLDOWN_TICKS */
const TOUCH_COOLDOWN_TICKS = 20;
/** vanilla Warden.DIG_PARTICLES_AMOUNT, DIG_PARTICLES_DURATION (seconds) and DIG_PARTICLES_OFFSET */
const DIG_PARTICLES_AMOUNT = 30;
const DIG_PARTICLES_DURATION = 4.5;
const DIG_PARTICLES_OFFSET = 0.7;
/** vanilla Warden.PROJECTILE_ANGER_DISTANCE */
const PROJECTILE_ANGER_DISTANCE = 30;
/** vanilla VibrationUser.GAME_EVENT_LISTENER_RANGE */
const LISTENER_RANGE = 16;
/** vanilla EntityType.WARDEN's size (0.9 by 2.9), and its eyes (0.85 of the height), where it listens from */
const WIDTH = 0.9;
const HEIGHT = 2.9;
const EYE_HEIGHT = HEIGHT * 0.85;
/** vanilla Entity.blocksBuilding, besides living things: minecarts, boats and rafts, primed TNT, falling blocks, end crystals */
const BLOCKS_BUILDING = /^(tnt|falling_block|end_crystal|.*minecart|.*_boat|.*_raft)$/;

const blockOf = (e: { x: number; y: number; z: number }): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];

/** vanilla Warden.VibrationUser: its ear at its eyes, 16 blocks round, for #warden_can_listen */
class WardenVibrationUser implements VibrationUser {
  readonly radius = LISTENER_RANGE;
  readonly listenable = GAME_EVENT_TAGS.warden_can_listen;
  readonly canTriggerAvoidVibration = true;

  constructor(private readonly w: Warden) {}

  /** vanilla EntityPositionSource(warden, its eye height when made): always its standing eyes, digging or not */
  position(): [number, number, number] | null {
    const w = this.w;
    return [w.x, w.y + EYE_HEIGHT, w.z];
  }

  /** vanilla canReceiveVibration: alive, not deaf from the last one, not digging or emerging, and not someone it can't target */
  canReceive(_level: Level, _x: number, _y: number, _z: number, _event: GameEventName, ctx: GameEventContext): boolean {
    const w = this.w;
    if (w.health <= 0 || w.mem.has('vibration_cooldown') || w.isDiggingOrEmerging()) return false;
    const e = ctx.entity;
    return !(e instanceof LivingEntity) || w.canTargetEntity(e);
  }

  /**
   * vanilla onReceiveVibration: two seconds deaf, its tendrils twitch and click; angrier at whoever made it — at a
   * shot's owner within 30 blocks a little (10), or the full 35 if they shot again within five seconds (and then it
   * heads for them, not where the shot landed) — and, unless it's angry, it goes to see (if nobody it's angrier at
   * is in its mind)
   */
  onReceive(_level: Level, x: number, y: number, z: number, _event: GameEventName, entity: Entity | null, owner: Entity | null): void {
    const w = this.w;
    if (w.health <= 0) return;
    w.mem.set('vibration_cooldown', true, VIBRATION_COOLDOWN_TICKS);
    // (vanilla entity event 61)
    w.tendrilAnimation = 10;
    w.playSound('entity.warden.tendril_clicks', 5, w.voicePitch());
    let p: Pos = [x, y, z];
    if (owner) {
      if (w.distanceToSqr(owner.x, owner.y, owner.z) < PROJECTILE_ANGER_DISTANCE * PROJECTILE_ANGER_DISTANCE) {
        if (w.mem.has('recent_projectile')) {
          if (w.canTargetEntity(owner)) p = blockOf(owner);
          w.increaseAngerAt(owner);
        } else w.increaseAngerAt(owner, PROJECTILE_ANGER, true);
      }
      w.mem.set('recent_projectile', true, RECENT_PROJECTILE_TICK_THRESHOLD);
    } else w.increaseAngerAt(entity);
    if (w.angerLevel() !== 'angry') {
      const top = w.anger.getActiveEntity();
      if (owner || !top || top === entity) setDisturbanceLocation(w, p);
    }
  }
}

/** vanilla Warden.createNavigation's path finder: a step counts only for how far across it goes, not up or down */
class WardenNodeEvaluator extends WalkNodeEvaluator {
  /** vanilla PathFinder.distance → Node.distanceToXZ */
  stepDistance(a: Node, b: Node): number {
    const dx = b.x - a.x, dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}

/** vanilla Warden.createNavigation: a GroundPathNavigation through open doors, its steps measured across */
class WardenPathNavigation extends PathNavigation {
  private readonly wardenNodes = new WardenNodeEvaluator();
  protected override pathEvaluator(): NodeEvaluator {
    this.wardenNodes.canFloat = this.canFloat;
    return this.wardenNodes;
  }
}

export class Warden extends Monster {
  readonly type = 'warden';
  /** vanilla Pose */
  pose: WardenPose = 'standing';
  /**
   * vanilla emergeAnimationState, diggingAnimationState, roarAnimationState, sniffAnimationState, attackAnimationState
   * and sonicBoomAnimationState: the tick each last started, -1 while it's never been (render/wardenRenderer.ts)
   */
  emergeAnimStart = -1;
  diggingAnimStart = -1;
  roarAnimStart = -1;
  sniffAnimStart = -1;
  attackAnimStart = -1;
  sonicBoomAnimStart = -1;
  /** vanilla tendrilAnimation (ten ticks of twitching from a vibration) and heartAnimation (ten from a beat), with their last tick's */
  tendrilAnimation = 0;
  tendrilAnimationO = 0;
  heartAnimation = 0;
  heartAnimationO = 0;
  /** vanilla CLIENT_ANGER_LEVEL: its anger as last told (once a second): how fast its heart beats */
  clientAngerLevel = 0;
  /** vanilla angerManagement */
  anger: AngerManagement;
  /** vanilla vibrationData and its listener (vanilla DynamicGameEventListener) */
  readonly vibration = new VibrationData();
  private readonly vibrationUser = new WardenVibrationUser(this);
  readonly listener = new VibrationListener(this.vibrationUser, this.vibration);
  /** the level its listener is on the register of */
  private listeningIn: Level | null = null;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none; the rest in `mem`
  readonly mem = new Memories<WardenMemory>();
  lookTarget: Tracker | null = null;
  /** LOOK_TARGET's time left, while it's the one it was given with one (setDisturbanceLocation's) */
  private lookTargetExpiry: { t: Tracker; ttl: number } | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  attackTarget: LivingEntity | null = null;
  roarTarget: LivingEntity | null = null;
  /** NEAREST_ATTACKABLE (WardenEntitySensor) */
  nearestAttackable: LivingEntity | null = null;

  private readonly brain = makeWardenBrain();
  /** vanilla Sensor timing, for its WardenEntitySensor */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(WIDTH, HEIGHT);
    // vanilla Warden.createAttributes
    this.maxHealth = this.health = 500;
    this.moveSpeedAttr = 0.3;
    this.kbResist = 1;
    this.attackKnockback = 1.5;
    this.attackDamage = 30;
    this.followRange = 24;
    this.xpReward = 5;
    this.navigation.canFloat = true;
    // (vanilla also: powder snow 8 and unpassable rails 0, which paths here don't tell apart)
    this.setPathfindingMalus(PathType.DAMAGE_OTHER, 8);
    this.setPathfindingMalus(PathType.LAVA, 8);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, 0);
    this.setPathfindingMalus(PathType.DANGER_FIRE, 0);
    this.anger = new AngerManagement((e) => this.canTargetEntity(e));
    this.sensors = new SensorClock(this.random, 1);
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  protected override createNavigation(): PathNavigation {
    return new WardenPathNavigation(this);
  }

  // --- its pose and size --------------------------------------------------------

  /**
   * vanilla setPose, and onSyncedDataUpdated(DATA_POSE): the pose's animation starts over (none ever stops but the
   * roar, cut short by a blow); digging or emerging it's a block tall (vanilla getDefaultDimensions)
   */
  setPose(p: WardenPose): void {
    if (this.pose === p) return;
    this.pose = p;
    if (p === 'emerging') this.emergeAnimStart = this.tickCount;
    else if (p === 'digging') this.diggingAnimStart = this.tickCount;
    else if (p === 'roaring') this.roarAnimStart = this.tickCount;
    else if (p === 'sniffing') this.sniffAnimStart = this.tickCount;
    this.setSize(WIDTH, this.isDiggingOrEmerging() ? 1 : HEIGHT);
  }

  /** vanilla isDiggingOrEmerging */
  isDiggingOrEmerging(): boolean {
    return this.pose === 'digging' || this.pose === 'emerging';
  }

  // --- its memories -------------------------------------------------------------

  /** vanilla setMemoryWithExpiry(LOOK_TARGET, ...) */
  setLookTargetWithExpiry(t: Tracker, ttl: number): void {
    this.lookTarget = t;
    this.lookTargetExpiry = { t, ttl };
  }

  /** vanilla Brain.forgetOutdatedMemories */
  private forgetOutdatedMemories(): void {
    this.mem.tick();
    const x = this.lookTargetExpiry;
    if (!x) return;
    if (this.lookTarget !== x.t) this.lookTargetExpiry = null;
    else if (x.ttl <= 0) {
      this.lookTarget = null;
      this.lookTargetExpiry = null;
    } else x.ttl--;
  }

  activity(): WardenActivity | null {
    return this.brain.activeNonCore();
  }

  // --- anger --------------------------------------------------------------------

  /**
   * vanilla canTargetEntity: a living thing in its level, not a player in creative or spectator, an armour stand or
   * another warden, and not dead
   */
  canTargetEntity(e: Entity | null | undefined): e is LivingEntity {
    if (!(e instanceof LivingEntity) || e.level !== this.level) return false;
    if (e.type === 'player') {
      const gm = (e as Player).gameMode;
      if (gm === 'creative' || gm === 'spectator') return false;
    }
    return e.type !== 'armor_stand' && e.type !== 'warden' && e.health > 0;
  }

  /** vanilla getAngerLevel: by its anger at its target (or, with none, the most it has at anyone) */
  angerLevel(): AngerLevel {
    return angerLevelOf(this.activeAnger());
  }

  /** vanilla getActiveAnger */
  private activeAnger(): number {
    return this.anger.getActiveAnger(this.attackTarget);
  }

  /** vanilla getEntityAngryAt: angry, the one it's angriest at that it may target */
  getEntityAngryAt(): LivingEntity | null {
    return this.angerLevel() === 'angry' ? this.anger.getActiveEntity() : null;
  }

  /** vanilla clearAnger */
  clearAnger(e: Entity): void {
    this.anger.clearAnger(e);
  }

  /**
   * vanilla increaseAngerAt: angrier at `e` (if it may target them), another minute before it digs away; a player
   * it grows angry at takes over from a target that isn't one; and it lets out its listening sound (unless roaring)
   */
  increaseAngerAt(e: Entity | null, offset = DEFAULT_ANGER, playListeningSound = true): void {
    if (!this.canTargetEntity(e)) return;
    setDigCooldown(this);
    const notAtPlayer = this.attackTarget?.type !== 'player';
    const i = this.anger.increaseAnger(e, offset);
    if (e.type === 'player' && notAtPlayer && angerLevelOf(i) === 'angry') this.attackTarget = null;
    if (playListeningSound) this.playListeningSound();
  }

  /** vanilla playListeningSound */
  private playListeningSound(): void {
    if (this.pose !== 'roaring') this.playSound(LISTENING_SOUND[this.angerLevel()], 10, this.voicePitch());
  }

  /** vanilla setAttackTarget: after `t` now (no longer roaring at anyone), the sonic boom ten seconds off */
  setAttackTarget(t: LivingEntity): void {
    this.roarTarget = null;
    this.attackTarget = t;
    this.cantReachWalkTargetSince = -1;
    setSonicBoomCooldown(this, TIME_TO_USE_MELEE_UNTIL_SONIC_BOOM);
  }

  // --- being hurt, and hurting ----------------------------------------------------

  /**
   * vanilla Warden.hurt: unless digging or emerging, a hit angers it greatly at whoever dealt it (100), and with no
   * target it goes after them if they hit it themselves or from within 5 blocks
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (!this.isDiggingOrEmerging()) {
      const e = attacker ?? null;
      this.increaseAngerAt(e, MINIMUM_ANGER.angry + ON_HURT_ANGER_BOOST, false);
      // (vanilla DamageSource.isDirect: the one to blame did it themselves)
      const isDirect = !direct || direct === attacker;
      if (!this.attackTarget && e instanceof LivingEntity && (isDirect || this.distanceToSqr(e.x, e.y, e.z) < 25)) this.setAttackTarget(e);
    }
    return ok;
  }

  /** vanilla isInvulnerableTo: nothing hurts it while it digs or emerges (but the void and /kill) */
  override isInvulnerableTo(source: string): boolean {
    return (this.isDiggingOrEmerging() && source !== 'void' && source !== 'genericKill') || super.isInvulnerableTo(source);
  }

  /** vanilla EntityType.WARDEN.fireImmune */
  override fireImmune(): boolean {
    return true;
  }

  /** vanilla canDisableShield: its blows knock a raised shield down */
  canDisableShield(): boolean {
    return true;
  }

  /** vanilla dampensVibrations: nothing hears its own going about */
  dampensVibrations(): boolean {
    return true;
  }

  /** vanilla ignoreExplosion: untouched by a blast while it digs or emerges */
  ignoreExplosion(): boolean {
    return this.isDiggingOrEmerging();
  }

  /**
   * vanilla Warden.doHurtTarget: its attack animation (the roar's cut short) and the impact's sound, the sonic boom
   * two seconds off, then the blow
   */
  override doHurtTarget(target: Entity): boolean {
    // (vanilla entity event 4)
    this.roarAnimStart = -1;
    this.attackAnimStart = this.tickCount;
    this.playSound('entity.warden.attack_impact', 10, this.voicePitch());
    setSonicBoomCooldown(this, SONIC_BOOM_COOLDOWN);
    return super.doHurtTarget(target);
  }

  // --- pushing ----------------------------------------------------------------------

  /** vanilla isPushable: not while it digs or emerges */
  override isPushable(): boolean {
    return !this.isDiggingOrEmerging() && super.isPushable();
  }

  /** vanilla LivingEntity.pushEntities, with the warden's doPush */
  protected override pushEntities(): void {
    for (const e of this.level.getEntities(this.bb, (o) => o.isPushable(), this)) this.doPush(e);
  }

  /** vanilla Warden.doPush: bumping into something angers it at them and turns it to them (once a second at most) */
  private doPush(e: Entity): void {
    if (!this.mem.has('touch_cooldown')) {
      this.mem.set('touch_cooldown', true, TOUCH_COOLDOWN_TICKS);
      this.increaseAngerAt(e);
      setDisturbanceLocation(this, blockOf(e));
    }
    e.pushAgainst(this);
  }

  /** vanilla canRide: it rides nothing */
  protected override canRide(): boolean {
    return false;
  }

  // --- where it goes, spawning and despawning ------------------------------------------

  /** vanilla getWalkTargetValue: anywhere will do (dark or light) */
  override walkTargetValue(): number {
    return 0;
  }

  /** vanilla removeWhenFarAway: never */
  override removeWhenFarAway(): boolean {
    return false;
  }

  /** vanilla checkSpawnObstruction: no liquid about it, nothing standing in the way, and room for it standing */
  override checkSpawnObstruction(): boolean {
    if (!super.checkSpawnObstruction()) return false;
    const inWay = this.level.getEntities(this.bb, (e) => !e.removed && (e instanceof LivingEntity || BLOCKS_BUILDING.test(e.type)), this);
    if (inWay.length) return false;
    // (vanilla EntityType.getDimensions().makeBoundingBox: its standing size, whatever its pose)
    return this.collisionBoxes(AABB.ofSize(this.x, this.y, this.z, WIDTH, HEIGHT)).length === 0;
  }

  /**
   * vanilla Warden.finalizeSpawn: a minute before it digs away; summoned by a shrieker it's coming up out of the
   * ground (for the emerge's 134 ticks), agitated
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.mem.set('dig_cooldown', true, DIGGING_COOLDOWN);
    if (reason === 'triggered') {
      this.setPose('emerging');
      this.mem.set('is_emerging', true, EMERGE_DURATION);
      this.playSound('entity.warden.agitated', 5, 1);
    }
    super.finalizeSpawn(reason, group);
  }

  // --- sounds ---------------------------------------------------------------------------

  override soundVolume(): number {
    return 4;
  }
  /** vanilla getAmbientSound: by how angry it is; none while it roars, digs or emerges */
  override ambientSound(): string | null {
    return this.pose !== 'roaring' && !this.isDiggingOrEmerging() ? AMBIENT_SOUND[this.angerLevel()] : null;
  }
  override hurtSound(): string {
    return 'entity.warden.hurt';
  }
  override deathSound(): string {
    return 'entity.warden.death';
  }
  /** vanilla playStepSound: its own heavy step, loud (10) */
  protected override playStepSound(): void {
    this.playSound('entity.warden.step', 10, 1);
  }
  /** vanilla nextStep: a step every 0.55 of the way */
  protected override nextStepDistance(): number {
    return this.moveDist + 0.55;
  }

  /** vanilla entities/warden: a sculk catalyst, however it died */
  override lootTable(): LootEntry[] {
    return [{ item: 'sculk_catalyst', min: 1, max: 1, noLooting: true }];
  }

  // --- ticking -----------------------------------------------------------------------------

  /**
   * vanilla Warden.tick: its vibrations, and (named, or riding) no digging away; then, as the client shows it, the
   * heart beating (every two seconds calm, down to every half second angry), the tendrils and heart easing off, and
   * the ground breaking up round it for the first four and a half seconds of digging or emerging
   */
  override tick(): void {
    // (vanilla DynamicGameEventListener: it listens from wherever it goes, once it's in the level)
    if (this.listeningIn !== this.level && !this.removed) {
      registerEntityListener(this.level, this, this.listener);
      this.listeningIn = this.level;
    }
    tickVibrations(this.level, this.vibration, this.vibrationUser);
    if (this.persistenceRequired || this.requiresCustomPersistence()) setDigCooldown(this);
    super.tick();
    if (this.removed) return;
    if (this.tickCount % this.heartBeatDelay() === 0) {
      this.heartAnimation = 10;
      this.level.sound.play('entity.warden.heartbeat', this.x, this.y, this.z, 5, this.voicePitch());
    }
    this.tendrilAnimationO = this.tendrilAnimation;
    if (this.tendrilAnimation > 0) this.tendrilAnimation--;
    this.heartAnimationO = this.heartAnimation;
    if (this.heartAnimation > 0) this.heartAnimation--;
    if (this.pose === 'emerging') this.diggingParticles(this.emergeAnimStart);
    else if (this.pose === 'digging') this.diggingParticles(this.diggingAnimStart);
  }

  /** vanilla getHeartBeatDelay */
  private heartBeatDelay(): number {
    const f = this.clientAngerLevel / MINIMUM_ANGER.angry;
    return 40 - Math.floor(Math.min(Math.max(f, 0), 1) * 30);
  }

  /** vanilla getTendrilAnimation / getHeartAnimation: 0 to 1, between ticks */
  tendrilAnimationAt(partial: number): number {
    return (this.tendrilAnimationO + (this.tendrilAnimation - this.tendrilAnimationO) * partial) / 10;
  }
  heartAnimationAt(partial: number): number {
    return (this.heartAnimationO + (this.heartAnimation - this.heartAnimationO) * partial) / 10;
  }

  /** vanilla clientDiggingParticles: 30 bits of what it stands on a tick, within 0.7 of it */
  private diggingParticles(start: number): void {
    if (start < 0 || (this.tickCount - start) * 50 >= DIG_PARTICLES_DURATION * 1000) return;
    const bx = Math.floor(this.x), by = Math.floor(this.y - 1e-5), bz = Math.floor(this.z);
    const st = this.level.world.getState(bx, by, bz);
    // (vanilla RenderShape.INVISIBLE: nothing shows of air)
    if (FLAGS[st] & F_AIR) return;
    const r = this.random, o = DIG_PARTICLES_OFFSET;
    for (let i = 0; i < DIG_PARTICLES_AMOUNT; i++) {
      const px = this.x + r.nextFloat() * 2 * o - o, pz = this.z + r.nextFloat() * 2 * o - o;
      this.level.particles.blockParticle?.(px, this.y, pz, 0, 0, 0, st, bx, by, bz);
    }
  }

  /**
   * vanilla Warden.customServerAiStep: its brain (memories running out, then its sensor once a second, then the
   * behaviours), a pulse of darkness every six seconds, its anger cooling once a second, then what it does next
   */
  protected override customServerAiStep(): void {
    this.forgetOutdatedMemories();
    if (this.sensors.due(0)) senseWardenEntities(this);
    this.brain.tick(this, this.level.gameTime);
    if ((this.tickCount + this.id) % DARKNESS_INTERVAL === 0) applyDarknessAround(this.level, this.x, this.y, this.z, this, DARKNESS_RADIUS);
    if (this.tickCount % ANGER_TICK_DELAY === 0) {
      this.anger.tick(this.level, (e) => this.canTargetEntity(e));
      this.clientAngerLevel = this.activeAnger();
    }
    this.updateActivity();
    // (vanilla getTarget: the brain's ATTACK_TARGET)
    this.target = this.attackTarget;
    super.customServerAiStep();
  }

  /**
   * vanilla WardenAi.updateActivity: the first of emerge, dig, roar, fight, investigate, sniff and idle whose memories
   * are there; the activity it leaves forgets what it was about (vanilla eraseMemoriesForOtherActivitesThan)
   */
  private updateActivity(): void {
    const next = ACTIVITY_ORDER.find((a) => activityValid(this, a));
    const before = this.brain.activeNonCore();
    if (!next || next === before) return;
    if (before) eraseActivityMemories(this, before);
    this.brain.setActiveActivityIfPossible(next, this);
  }

  // --- saving ------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return {
      ...super.saveData(),
      anger: this.anger.save(),
      listener: this.vibration.save(),
      // (vanilla Brain: the memories kept with it)
      Brain: this.mem.save(),
    };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.anger === 'string') {
      this.anger = AngerManagement.load((e) => this.canTargetEntity(e), d.anger);
      this.clientAngerLevel = this.activeAnger();
    }
    this.vibration.load(typeof d.listener === 'string' ? d.listener : undefined);
    this.mem.load(d.Brain, SAVED_MEMORIES);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Summoning (vanilla SpawnUtil.trySpawnMob with Strategy.ON_TOP_OF_COLLIDER, as a shrieker calls it)

/** vanilla getCollisionShape(...).isEmpty(): nothing solid of the block at (x, y, z) */
function noCollisionAt(level: Level, x: number, y: number, z: number): boolean {
  const w = level.world, st = w.getState(x, y, z);
  const boxes = DYNAMIC_SHAPE[st] ? dynamicCollision(w, x, y, z, st) : (COLLISION[st] ?? DYNAMIC_COLLISION[STATE_BLOCK[st]]?.(w, x, y, z, st));
  return !boxes || boxes.length === 0;
}

/**
 * vanilla SpawnUtil.moveToPossibleSpawnPosition: from `yOffset` above (x, y, z) down to as far below, the first spot
 * standing on a block whose top is whole, with nothing solid in it; the height to stand at, or null
 */
function possibleSpawnHeight(level: Level, yOffset: number, x: number, y: number, z: number): number | null {
  for (let i = yOffset, py = y + yOffset; i >= -yOffset; i--) {
    py--;
    if (noCollisionAt(level, x, py + 1, z) && collisionFaceFull(level.world, x, py, z, UP)) return py + 1;
  }
  return null;
}

/**
 * vanilla SculkShriekerBlockEntity.trySummonWarden → SpawnUtil.trySpawnMob(WARDEN, TRIGGERED, pos, 20, 5, 6): twenty
 * tries at a spot up to five blocks across from the shrieker, standing on whatever's solid from six above to six
 * below it; there the warden is made (emerging, and agitated: each try that doesn't fit is heard too), and stays if
 * it fits: no liquid, nothing in the way, room for it to stand
 */
export function summonWarden(level: Level, x: number, y: number, z: number): Warden | null {
  const r = level.random;
  for (let i = 0; i < 20; i++) {
    const tx = x + r.nextInt(11) - 5, tz = z + r.nextInt(11) - 5;
    const ty = possibleSpawnHeight(level, 6, tx, y, tz);
    if (ty === null) continue;
    // vanilla EntityType.create(level, null, pos, TRIGGERED, false, false)
    const w = new Warden(level);
    w.moveTo(tx + 0.5, ty, tz + 0.5, wrapDegrees(r.nextFloat() * 360), 0);
    w.headYaw = w.headYawO = w.bodyYaw = w.bodyYawO = w.yaw;
    w.finalizeSpawn('triggered');
    w.playAmbientSound();
    if (w.checkSpawnRules() && w.checkSpawnObstruction()) {
      level.addEntity(w);
      return w;
    }
    w.remove();
  }
  return null;
}

shriekerHooks.summonWarden = (level, x, y, z) => summonWarden(level, x, y, z) !== null;
