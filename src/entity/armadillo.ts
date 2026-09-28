// (remaining mobs: the armadillo) The armadillo (vanilla 1.21 Armadillo and ArmadilloAi). It lives in the savannas
// (in twos and threes) and the badlands (ones and twos), on grass, red sand, coarse dirt or the badlands' terracotta,
// in the light. It ambles about, looks at players now and then, follows a spider eye (which breeds it and grows its
// young), and its young keep near the grown ones. Anything undead, a player sprinting or riding, or whatever last hurt
// it, coming within seven blocks across and two up or down makes it roll up into a ball: it stops, curls up over half
// a second and hits the ground; rolled up, it peeks out now and then while the danger's still there, and once four
// seconds have gone by with nothing to fear it starts unrolling, and a second and a half later is out again (fear
// coming back rolls it straight up again). A blow from anything living rolls it up too, and a blow while it's rolled
// up does half of what it would less half a heart. Fire, lava, cactus, lightning, freezing or a hot floor sends it
// running instead (rolled up, it comes out to run); in the water, on a lead or riding, it doesn't roll up. Every five
// to ten minutes a grown one sheds a scute, and a brush brushes one off it whenever it's held to it (wearing the brush
// 16). Rolled up, it takes no food.
//
// Its brain is vanilla's (entity/ai/brain.ts, with the shared behaviours of ai/brainBehaviors.ts): the core, idle and
// panic activities; the panic one (rolled up) whenever danger was detected lately and it isn't running. Drawn by
// render/armadilloRenderer.ts, from its state and the three animations it plays (rolling up, peeking, rolling out).

import { Animal } from './animals';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { Behavior, Brain, doNothing, oneShot, runOne, type BehaviorControl } from './ai/brain';
import {
  animalMakeLove, animalPanic, babyFollowAdult, countDownCooldown, followTemptation, lookAtPlayerSometimes, lookAtTargetSink, moveToTargetSink,
  PANIC_ENVIRONMENTAL_CAUSES, randomLookAround, randomStroll, senseHurtBy, senseNearestAdult, senseNearestLiving, senseTempting, SensorClock,
  setWalkTargetFromLookTarget, swim, type Tracker, type WalkTarget,
} from './ai/brainBehaviors';
import { ItemStack } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { wrapDegrees } from '../core/math';

type Activity = 'core' | 'idle' | 'panic';

/** vanilla Armadillo.ArmadilloState */
export type ArmadilloState = 'idle' | 'rolling' | 'scared' | 'unrolling';

/** vanilla ArmadilloState: whether it's threatened (isThreatened), and its animation's length in ticks (animationDuration) */
const STATES: Record<ArmadilloState, { threatened: boolean; duration: number }> = {
  idle: { threatened: false, duration: 0 },
  rolling: { threatened: true, duration: 10 },
  scared: { threatened: true, duration: 50 },
  unrolling: { threatened: true, duration: 30 },
};

/** vanilla ArmadilloState.fromName: an unknown name is idle */
export function armadilloState(name: string): ArmadilloState {
  return Object.prototype.hasOwnProperty.call(STATES, name) ? (name as ArmadilloState) : 'idle';
}

/**
 * vanilla ArmadilloState.shouldHideInShell: drawn as a ball — rolling up, after its first five ticks; rolled up; and
 * unrolling, till its last four
 */
export function hidesInShell(s: ArmadilloState, inStateTicks: number): boolean {
  if (s === 'rolling') return inStateTicks > 5;
  if (s === 'scared') return true;
  if (s === 'unrolling') return inStateTicks < 26;
  return false;
}

/** vanilla Armadillo.BABY_SCALE: a baby's size (and its model's) against a grown one's */
export const ARMADILLO_BABY_SCALE = 0.6;
/** vanilla SCARE_CHECK_INTERVAL: how long danger it's sensed is remembered (DANGER_DETECTED_RECENTLY), in ticks */
const SCARE_MEMORY = 80;
/** vanilla SensorType.ARMADILLO_SCARE_DETECTED's scan rate: it looks for danger every five ticks */
const SCARE_SCAN_RATE = 5;
/** vanilla SCARE_DISTANCE_HORIZONTAL / SCARE_DISTANCE_VERTICAL */
const SCARE_H = 7;
const SCARE_V = 2;
/** vanilla ArmadilloBallUp.DANGER_DETECTED_RECENTLY_DANGER_THRESHOLD: the danger is still about (sensed within the last five ticks) */
const DANGER_THRESHOLD = 75;
/** vanilla ArmadilloBallUp.BALL_UP_STAY_IN_STATE: the longest it keeps at being rolled up in one go (five minutes) */
const BALL_UP_STAY = 6000;

/** vanilla #armadillo_spawnable_on (with #animals_spawnable_on and #badlands_terracotta) */
export const ARMADILLO_SPAWNABLE_ON = new Set([
  'grass_block', 'terracotta', 'white_terracotta', 'yellow_terracotta', 'orange_terracotta', 'red_terracotta', 'brown_terracotta', 'light_gray_terracotta',
  'red_sand', 'coarse_dirt',
]);

/** vanilla Armadillo.checkArmadilloSpawnRules: on #armadillo_spawnable_on, in light over 8 (Animal.isBrightEnoughToSpawn) */
export function armadilloSpawnRulesOk(level: Level, x: number, y: number, z: number): boolean {
  return ARMADILLO_SPAWNABLE_ON.has(BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name) && level.rawBrightness(x, y, z, 0) > 8;
}

/** one of its animations (vanilla AnimationState): the tick it started (-1: stopped), and how far it was put forward */
export interface ArmadilloAnim {
  start: number;
  ff: number;
}

// ---------------------------------------------------------------------------
// the brain (vanilla ArmadilloAi)

/**
 * vanilla BehaviorBuilder.triggerIf(not scared, …) round the idle walks, and ArmadilloAi's own MoveToTargetSink: none of
 * it while it's rolled up (or rolling up or out)
 */
function unlessScared(b: BehaviorControl<Armadillo>): BehaviorControl<Armadillo> {
  return {
    get status() {
      return b.status;
    },
    set status(v) {
      b.status = v;
    },
    tryStart: (a, now) => !a.isScared() && b.tryStart(a, now),
    tickOrStop: (a, now) => b.tickOrStop(a, now),
    doStop: (a, now) => b.doStop(a, now),
  };
}

/** vanilla ArmadilloAi.ARMADILLO_ROLLING_OUT: with no danger remembered any more, a rolled-up one comes out */
function rollingOut(): BehaviorControl<Armadillo> {
  return oneShot<Armadillo>((a) => {
    if (a.dangerTimeUntilExpiry() > 0 || !a.isScared()) return false;
    a.rollOut();
    return true;
  });
}

/**
 * vanilla ArmadilloAi.ArmadilloBallUp (up to five minutes at a time, on the ground to start): it rolls up; ten ticks on
 * it's a ball (and lands with a thump if it's on the ground). While danger is still about it peeks out now and then
 * (2.5 seconds plus 5 to 20 between, the wait picked afresh each time the danger comes or goes); with the danger
 * forgotten all but a second and a half, it starts unrolling (and rolls back up if the danger comes back before it's
 * out). Stopping, it comes out if it can't stay rolled up
 */
function ballUp(): BehaviorControl<Armadillo> {
  let nextPeekTimer = 0;
  let dangerWasAround = false;
  // (vanilla pickNextPeekTimer: nextIntBetweenInclusive(100, 400))
  const pickNextPeekTimer = (a: Armadillo): number => STATES.scared.duration + 100 + a.random.nextInt(301);
  return new Behavior<Armadillo>({
    min: BALL_UP_STAY,
    max: BALL_UP_STAY,
    canStart: (a) => a.onGround,
    start: (a) => a.rollUp(),
    canStillUse: (a) => STATES[a.state].threatened,
    tick: (a) => {
      if (nextPeekTimer > 0) nextPeekTimer--;
      if (a.shouldSwitchToScaredState()) {
        a.switchToState('scared');
        // (vanilla level.playSound(null, blockPosition(), ARMADILLO_LAND): at its block's middle)
        if (a.onGround) a.level.sound.play('entity.armadillo.land', Math.floor(a.x) + 0.5, Math.floor(a.y) + 0.5, Math.floor(a.z) + 0.5, 1, 1);
        return;
      }
      const l = a.dangerTimeUntilExpiry();
      const around = l > DANGER_THRESHOLD;
      if (around !== dangerWasAround) nextPeekTimer = pickNextPeekTimer(a);
      dangerWasAround = around;
      if (a.state === 'scared') {
        if (nextPeekTimer === 0 && a.onGround && around) {
          a.peek();
          nextPeekTimer = pickNextPeekTimer(a);
        }
        if (l < STATES.unrolling.duration) {
          a.makeSound('entity.armadillo.unroll_start');
          a.switchToState('unrolling');
        }
      } else if (a.state === 'unrolling' && l > STATES.unrolling.duration) a.switchToState('scared');
    },
    stop: (a) => {
      if (!a.canStayRolledUp()) a.rollOut();
    },
  });
}

/** vanilla ArmadilloAi.makeBrain: the core, idle and panic (scared) activities */
function makeBrain(): Brain<Armadillo, Activity> {
  const b = new Brain<Armadillo, Activity>('idle', ['core']);
  b.add('core', [
    [0, swim<Armadillo>(0.8)],
    // vanilla ArmadilloPanic(2): only what's in #panic_environmental_causes sets it running, and it comes out first
    [0, animalPanic<Armadillo>(2, { causes: PANIC_ENVIRONMENTAL_CAUSES, start: (a) => a.rollOut() })],
    [0, lookAtTargetSink<Armadillo>(45, 90)],
    [0, unlessScared(moveToTargetSink<Armadillo>())],
    [0, countDownCooldown<Armadillo>((a) => a.temptationCooldown, (a, v) => (a.temptationCooldown = v))],
    [0, countDownCooldown<Armadillo>((a) => a.gazeCooldown, (a, v) => (a.gazeCooldown = v))],
    [0, rollingOut()],
  ]);
  b.add('idle', [
    [0, lookAtPlayerSometimes<Armadillo>(6, 30, 60)],
    [1, animalMakeLove<Armadillo>(1, 1)],
    [
      2,
      runOne<Armadillo>([
        [followTemptation<Armadillo>(() => 1.25, (a) => (a.isBaby() ? 1 : 2)), 1],
        [unlessScared(babyFollowAdult<Armadillo>(5, 16, () => 1.25)), 1],
      ]),
    ],
    [3, randomLookAround<Armadillo>(150, 250, 30, 0, 0)],
    [
      4,
      runOne<Armadillo>(
        [
          [unlessScared(randomStroll<Armadillo>(1)), 1],
          [unlessScared(setWalkTargetFromLookTarget<Armadillo>(() => true, () => 1, 3)), 1],
          [doNothing<Armadillo>(30, 60), 1],
        ],
        (a) => a.walkTarget === null,
      ),
    ],
  ]);
  // (vanilla initScaredActivity: Activity.PANIC while DANGER_DETECTED_RECENTLY is there and IS_PANICKING isn't)
  b.add('panic', [[0, ballUp()]], (a) => a.dangerTimeUntilExpiry() > 0 && !a.isPanicking);
  return b;
}

// ---------------------------------------------------------------------------

export class Armadillo extends Animal {
  readonly type = 'armadillo';
  protected adultWidth = 0.7;
  protected adultHeight = 0.65;
  /** vanilla ARMADILLO_STATE */
  state: ArmadilloState = 'idle';
  /**
   * (vanilla entity event 64, to the client: it peeks out) how many times it has, which a guest's copy watches for a
   * change (render/armadilloRenderer.ts plays the peek)
   */
  peeks = 0;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  nearestVisibleAdult: Armadillo | null = null;
  /** HURT_BY (the damage, for two seconds) and HURT_BY_ENTITY */
  hurtBy: string | null = null;
  hurtByEntity: LivingEntity | null = null;
  temptingPlayer: Player | null = null;
  isTempted = false;
  breedTarget: Armadillo | null = null;
  isPanicking = false;

  /**
   * what counts down every tick, only the host's to know (not sent to guests): the brain's TEMPTATION_COOLDOWN_TICKS,
   * GAZE_COOLDOWN_TICKS and DANGER_DETECTED_RECENTLY (its time to live; 0: none), the scare sensor's next look, and
   * the next scute (vanilla scuteTime)
   */
  private readonly timers = { temptation: -1, gaze: -1, danger: 0, scareSensor: 0, scuteTime: 0 };
  /**
   * what the drawing of it works out tick by tick (vanilla's client side: inStateTicks and the three AnimationStates,
   * peekReceivedClient), on the host from its own tick and on a guest's copy from animateMirror; not sent. The state and
   * peek count a guest's copy last saw (null, -1: none yet)
   */
  readonly anim = {
    inStateTicks: 0,
    rollOut: { start: -1, ff: 0 } as ArmadilloAnim,
    rollUp: { start: -1, ff: 0 } as ArmadilloAnim,
    peek: { start: -1, ff: 0 } as ArmadilloAnim,
    peekReceived: false,
    seenState: null as ArmadilloState | null,
    seenPeeks: -1,
  };
  /** (this game's hurt hands actuallyHurt only the damage's kind) the blow's cause, while it's being dealt */
  private readonly blow: { cause: Entity | null } = { cause: null };

  private readonly brain = makeBrain();
  /** vanilla Sensor timing, for its once-a-second sensors (nearest living, hurt by, temptations, nearest adult) */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(0.7, 0.65);
    // vanilla Armadillo.createAttributes: 12 health, speed 0.14
    this.maxHealth = this.health = 12;
    this.moveSpeedAttr = 0.14;
    this.ownNavigation.canFloat = true;
    this.sensors = new SensorClock(this.random, 4);
    this.timers.scareSensor = this.random.nextInt(SCARE_SCAN_RATE);
    this.timers.scuteTime = this.pickNextScuteDropTime();
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  // the brain's countdowns, kept out of what's sent (see timers)
  get temptationCooldown(): number {
    return this.timers.temptation;
  }
  set temptationCooldown(v: number) {
    this.timers.temptation = v;
  }
  get gazeCooldown(): number {
    return this.timers.gaze;
  }
  set gazeCooldown(v: number) {
    this.timers.gaze = v;
  }
  /** vanilla Brain.getTimeUntilExpiry(DANGER_DETECTED_RECENTLY): 0 when there's none */
  dangerTimeUntilExpiry(): number {
    return this.timers.danger;
  }
  /** vanilla setMemoryWithExpiry(DANGER_DETECTED_RECENTLY, true, 80) */
  dangerDetected(): void {
    this.timers.danger = SCARE_MEMORY;
  }
  /** (the ticks till its next scute, for tests and /summon's scute_time) */
  get scuteTime(): number {
    return this.timers.scuteTime;
  }
  set scuteTime(v: number) {
    this.timers.scuteTime = v;
  }

  isFood(s: ItemStack): boolean {
    // vanilla #armadillo_food
    return s.item.id === 'spider_eye';
  }

  override get eyeHeight(): number {
    return 0.26 * (this.isBaby() ? ARMADILLO_BABY_SCALE : 1);
  }

  /** vanilla getAgeScale: a baby's 0.6 of a grown one */
  override refreshSize(): void {
    const s = this.isBaby() ? ARMADILLO_BABY_SCALE : 1;
    this.setSize(0.7 * s, 0.65 * s);
  }

  // --- its state --------------------------------------------------------------

  /** vanilla isScared: anything but idle (rolling up, rolled up, rolling out) */
  isScared(): boolean {
    return this.state !== 'idle';
  }

  /** vanilla shouldHideInShell */
  shouldHideInShell(): boolean {
    return hidesInShell(this.state, this.anim.inStateTicks);
  }

  /** vanilla shouldSwitchToScaredState: rolling up, and done with it */
  shouldSwitchToScaredState(): boolean {
    return this.state === 'rolling' && this.anim.inStateTicks > STATES.rolling.duration;
  }

  /** vanilla switchToState (and onSyncedDataUpdated: a new state starts its count again) */
  switchToState(s: ArmadilloState): void {
    if (this.state === s) return;
    this.state = s;
    this.anim.inStateTicks = 0;
  }

  /** vanilla rollUp: not already, it stops where it is, loses interest in love and rolls up */
  rollUp(): void {
    if (this.isScared()) return;
    // (vanilla Mob.stopInPlace)
    this.navigation.stop();
    this.xxa = 0;
    this.yya = 0;
    this.setSpeed(0);
    this.inLove = 0;
    this.level.gameEvent('entity_action', this.x, this.y, this.z, { entity: this });
    this.makeSound('entity.armadillo.roll');
    this.switchToState('rolling');
  }

  /** vanilla rollOut: rolled up (or rolling up or out), it's out at once */
  rollOut(): void {
    if (!this.isScared()) return;
    this.level.gameEvent('entity_action', this.x, this.y, this.z, { entity: this });
    this.makeSound('entity.armadillo.unroll_finish');
    this.switchToState('idle');
  }

  /**
   * (vanilla ArmadilloBallUp: level.broadcastEntityEvent(this, 64)) it peeks out: the client plays the peek and its
   * sound (here the host's own drawing at once, a guest's copy when it sees the count change)
   */
  peek(): void {
    this.peeks++;
    this.anim.peekReceived = true;
    this.playSound('entity.armadillo.peek', 1, 1);
  }

  /** vanilla canStayRolledUp: not running, in water or lava, on a lead, riding or ridden */
  canStayRolledUp(): boolean {
    return !this.isPanicking && !this.inWater && !this.inLava && !this.isLeashed() && !this.vehicle && !this.isVehicle();
  }

  /**
   * vanilla isScaredBy: within seven blocks across and two up or down of it — anything undead, whatever last hurt it,
   * or a player (not a spectator) sprinting or riding
   */
  isScaredBy(e: LivingEntity): boolean {
    if (!this.bb.inflate(SCARE_H, SCARE_V, SCARE_H).intersects(e.bb)) return false;
    if (e.isUndead()) return true;
    if (this.lastHurtByMob === e) return true;
    if (e.type === 'player') return (e as Player).gameMode !== 'spectator' && (e.sprinting || !!e.vehicle);
    return false;
  }

  // --- the brain ----------------------------------------------------------------

  activity(): Activity | null {
    return this.brain.activeNonCore();
  }

  /**
   * vanilla Brain.tickSensors: nearest living, hurt by, temptations and nearest adult once a second; the scare sensor
   * (vanilla MobSensor(5, isScaredBy, canStayRolledUp, DANGER_DETECTED_RECENTLY, 80)) every five ticks: danger for four
   * seconds if anything of the nearest living scares it, none at all if it can't stay rolled up
   */
  private sense(): void {
    const c = this.sensors;
    if (c.due(0)) senseNearestLiving(this);
    if (c.due(1)) senseHurtBy(this);
    if (c.due(2)) senseTempting(this, (s) => this.isFood(s));
    if (c.due(3)) senseNearestAdult(this);
    if (--this.timers.scareSensor <= 0) {
      this.timers.scareSensor = SCARE_SCAN_RATE;
      if (!this.canStayRolledUp()) this.timers.danger = 0;
      else if (this.nearestLiving.some((e) => this.isScaredBy(e))) this.dangerDetected();
    }
  }

  /**
   * vanilla Armadillo.customServerAiStep: its brain (memories aged, the sensors, the behaviours), then panic if it's
   * scared, else idle (ArmadilloAi.updateActivity); and a grown one alive sheds a scute when its time comes
   */
  protected override customServerAiStep(): void {
    // (vanilla Brain.forgetOutdatedMemories: DANGER_DETECTED_RECENTLY's time to live)
    if (this.timers.danger > 0) this.timers.danger--;
    this.sense();
    this.brain.tick(this, this.level.gameTime);
    this.brain.setActiveActivityToFirstValid(['panic', 'idle'], this);
    if (this.isAlive && !this.isBaby() && --this.timers.scuteTime <= 0) {
      const r = this.random;
      this.playSound('entity.armadillo.scute_drop', 1, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
      this.spawnAtLocation(ItemStack.of('armadillo_scute'));
      this.level.gameEvent('entity_place', this.x, this.y, this.z, { entity: this });
      this.timers.scuteTime = this.pickNextScuteDropTime();
    }
    super.customServerAiStep();
  }

  /** vanilla pickNextScuteDropTime: five to ten minutes */
  private pickNextScuteDropTime(): number {
    return this.random.nextInt(6000) + 6000;
  }

  /** vanilla Armadillo.tick: (the client's) its animations; rolled up, its head kept straight on; the state's count */
  override tick(): void {
    super.tick();
    this.setupAnimationStates();
    if (this.isScared()) this.clampHeadRotationToBody();
    this.anim.inStateTicks++;
  }

  /**
   * (a guest's copy) what vanilla's client does in its tick: a new state starts its count again (onSyncedDataUpdated),
   * a peek the host told of (entity event 64) plays, then as the host's own tick
   */
  override animateMirror(): void {
    super.animateMirror();
    const a = this.anim;
    if (this.state !== a.seenState) {
      a.seenState = this.state;
      a.inStateTicks = 0;
    }
    if (a.seenPeeks >= 0 && this.peeks !== a.seenPeeks) a.peekReceived = true;
    a.seenPeeks = this.peeks;
    this.setupAnimationStates();
    if (this.isScared()) this.clampHeadRotationToBody();
    a.inStateTicks++;
  }

  /**
   * vanilla setupAnimationStates: idle, none of its animations; rolling up, that one; rolled up, the peek (put straight
   * to its end as it rolls up, so it's shown as a ball, and played again when it peeks out); rolling out, that one
   */
  private setupAnimationStates(): void {
    const a = this.anim, t = this.tickCount;
    const stop = (s: ArmadilloAnim): void => void (s.start = -1);
    const start = (s: ArmadilloAnim): void => {
      s.start = t;
      s.ff = 0;
    };
    const startIfStopped = (s: ArmadilloAnim): void => {
      if (s.start < 0) start(s);
    };
    switch (this.state) {
      case 'idle':
        stop(a.rollOut);
        stop(a.rollUp);
        stop(a.peek);
        break;
      case 'rolling':
        stop(a.rollOut);
        startIfStopped(a.rollUp);
        stop(a.peek);
        break;
      case 'scared':
        stop(a.rollOut);
        stop(a.rollUp);
        if (a.peekReceived) {
          stop(a.peek);
          a.peekReceived = false;
        }
        if (a.inStateTicks === 0) {
          start(a.peek);
          a.peek.ff = STATES.scared.duration;
        } else startIfStopped(a.peek);
        break;
      case 'unrolling':
        startIfStopped(a.rollOut);
        stop(a.rollUp);
        stop(a.peek);
        break;
    }
  }

  /** vanilla Mob.clampHeadRotationToBody: its head turned no further from its body than it can */
  private clampHeadRotationToBody(): void {
    const f = this.maxHeadYRot(), g = this.headYaw;
    const h = wrapDegrees(this.bodyYaw - g);
    const i = Math.max(-f, Math.min(f, h));
    this.headYaw = g + h - i;
  }

  /** vanilla getMaxHeadYRot: rolled up (or rolling up or out), its head can't turn from its body at all */
  override maxHeadYRot(): number {
    return this.isScared() ? 0 : 32;
  }

  /** vanilla Armadillo.createBodyControl: rolled up, its body doesn't turn */
  protected override updateBodyRotation(): void {
    if (!this.isScared()) super.updateBodyRotation();
  }

  // --- being hurt -----------------------------------------------------------------

  /** vanilla Armadillo.hurt: rolled up, a blow does half what it would less half a heart (nothing, if that's below none) */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isScared()) amount = (amount - 1) / 2;
    const was = this.blow.cause;
    this.blow.cause = attacker ?? null;
    try {
      return super.hurt(amount, source, attacker, direct);
    } finally {
      this.blow.cause = was;
    }
  }

  /**
   * vanilla Armadillo.actuallyHurt: alive after it, a blow from anything living is danger (for four seconds) and rolls
   * it up if it can stay so; fire, lava, cactus and the like bring it out (to run)
   */
  protected override actuallyHurt(source: string, amount: number): void {
    super.actuallyHurt(source, amount);
    if (this.health <= 0) return;
    if (this.blow.cause instanceof LivingEntity) {
      this.dangerDetected();
      if (this.canStayRolledUp()) this.rollUp();
    } else if (PANIC_ENVIRONMENTAL_CAUSES.has(source)) this.rollOut();
  }

  // --- the brush, food and breeding -------------------------------------------------

  /**
   * vanilla Armadillo.mobInteract: a brush brushes a scute off a grown one (wearing the brush 16); rolled up, it takes
   * nothing (vanilla FAIL: the held item's own use goes on); else feeding, as any animal
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (stack?.item.id === 'brush' && this.brushOffScute()) {
      if (hurtAndBreak(stack, 16, p.gameMode === 'creative')) {
        p.inventory.setSelectedItem(null);
        this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
      }
      p.inventory.version++;
      return true;
    }
    if (this.isScared()) return false;
    return super.interact(p, stack);
  }

  /** vanilla brushOffScute: a grown one drops a scute, with the brush's sound */
  brushOffScute(): boolean {
    if (this.isBaby()) return false;
    this.spawnAtLocation(ItemStack.of('armadillo_scute'));
    this.level.gameEvent('entity_interact', this.x, this.y, this.z, { entity: this });
    this.playSound('entity.armadillo.brush', 1, 1);
    return true;
  }

  /** vanilla Armadillo.ageUp: a baby fed grows with its eating sound */
  override ageUp(seconds: number, forced: boolean): void {
    if (this.isBaby() && forced) this.makeSound('entity.armadillo.eat');
    super.ageUp(seconds, forced);
  }

  /** vanilla Armadillo.setInLove: with its eating sound */
  override setInLove(p: Player | null): void {
    super.setInLove(p);
    this.makeSound('entity.armadillo.eat');
  }

  /** vanilla Armadillo.canFallInLove: not while it's rolled up */
  override canFallInLove(): boolean {
    return super.canFallInLove() && !this.isScared();
  }

  /** vanilla getBreedOffspring */
  makeBaby(): Armadillo {
    return new Armadillo(this.level);
  }

  // --- sounds ---------------------------------------------------------------------

  /** vanilla Mob.makeSound: at its own volume and voice */
  makeSound(s: string): void {
    this.playSound(s, this.soundVolume(), this.voicePitch());
  }
  /** vanilla getAmbientSound: none while it's rolled up */
  override ambientSound(): string | null {
    return this.isScared() ? null : 'entity.armadillo.ambient';
  }
  /** vanilla getHurtSound: a duller knock rolled up */
  override hurtSound(): string {
    return this.isScared() ? 'entity.armadillo.hurt_reduced' : 'entity.armadillo.hurt';
  }
  override deathSound(): string {
    return 'entity.armadillo.death';
  }
  /** vanilla playStepSound: its own, quietly (Mob.playStepSound: 0.15) */
  override stepSound(): string {
    return 'entity.armadillo.step';
  }

  // --- saving -----------------------------------------------------------------------

  /** vanilla addAdditionalSaveData: its state and scute_time */
  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), state: this.state, scute_time: this.timers.scuteTime };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.switchToState(armadilloState(String(d.state ?? '')));
    if (typeof d.scute_time === 'number' && Number.isFinite(d.scute_time)) this.timers.scuteTime = Math.trunc(d.scute_time);
  }
}
