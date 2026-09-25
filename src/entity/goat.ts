// Goats (M8; vanilla Goat and GoatAi, 1.21). They live high in the mountains (frozen peaks, jagged peaks and snowy
// slopes, in ones to threes, on stone, snow, packed ice, gravel or grass in the light); one in fifty is a screaming
// goat, with its own screams for every sound, and a baby of one screams too half the time. Grown ones have two horns
// (a tenth are born with one). They wander, look at players now and then, follow wheat (which breeds them and grows
// their kids), and every half minute to minute look for a ledge within five blocks across and up or down that they
// couldn't walk to, eye it for two seconds and leap there. Every 30 seconds to 5 minutes (a screaming goat's 5 to 15
// seconds) one picks something it can see — a player or any other mob but a goat — walks off four to seven blocks
// in line with it, lowers its head for a second and charges: whatever it hits is hurt and thrown back (hard, unless
// it's a kid; half as hard behind a shield), and nothing hit angers; charging into a log, stone, packed ice or an iron,
// coal, copper or emerald ore snaps one of its horns off, a goat horn for the taking (one of the four regular calls,
// or the four screaming ones, always the same for the same goat). A bucket milks a grown one. Falls hurt it 10 less.
//
// Its brain is vanilla's (entity/ai/brain.ts, with the shared behaviours of ai/brainBehaviors.ts and the long jumps
// of ai/longJump.ts): the core, idle, long-jump and ram activities, the first of ram, long jump and idle that may run.

import { Animal } from './animals';
import type { Level } from '../game/level';
import type { SpawnGroup, SpawnReason } from './mob';
import { LivingEntity } from './living';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { isDamageSourceBlocked } from './shield';
import { Behavior, Brain, doNothing, runOne, type BehaviorControl } from './ai/brain';
import {
  animalMakeLove, animalPanic, at, babyFollowAdult, countDownCooldown, followTemptation, lookAtPlayerSometimes, lookAtTargetSink, moveToTargetSink,
  randomStroll, senseHurtBy, senseNearestAdult, senseNearestLiving, senseTempting, SensorClock, setWalkTargetFromLookTarget, swim, trackerPos,
  type Pos, type Tracker, type WalkTarget,
} from './ai/brainBehaviors';
import { longJumpMidJump, longJumpToRandomPos, sampleRange } from './ai/longJump';
import { ITEMS, ItemStack } from '../item/item';
import { JavaRandom, type Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { doPostAttackEffects } from '../game/enchantEffects';
import { goatHornStack, REGULAR_GOAT_HORNS, SCREAMING_GOAT_HORNS } from '../game/goatHorn';

type Activity = 'core' | 'idle' | 'long_jump' | 'ram';

/** vanilla GoatAi.TIME_BETWEEN_LONG_JUMPS */
const TIME_BETWEEN_LONG_JUMPS: [number, number] = [600, 1200];
/** vanilla GoatAi.TIME_BETWEEN_RAMS and TIME_BETWEEN_RAMS_SCREAMER */
const TIME_BETWEEN_RAMS: [number, number] = [600, 6000];
const TIME_BETWEEN_RAMS_SCREAMER: [number, number] = [100, 300];
/** vanilla GoatAi.RAM_MIN_DISTANCE, RAM_MAX_DISTANCE and RAM_PREPARE_TIME */
const RAM_MIN = 4;
const RAM_MAX = 7;
const RAM_PREPARE = 20;
/** vanilla Goat.GOAT_SCREAMING_CHANCE and UNIHORN_CHANCE */
const SCREAMING_CHANCE = 0.02;
const UNIHORN_CHANCE = 0.1;
/** vanilla Goat.GOAT_FALL_DAMAGE_REDUCTION */
const FALL_DAMAGE_REDUCTION = 10;

/** vanilla #goats_spawnable_on (with #animals_spawnable_on): where they spawn, and the ledges they'd rather leap to */
export const GOATS_SPAWNABLE_ON = new Set(['grass_block', 'stone', 'snow', 'snow_block', 'packed_ice', 'gravel']);
/** vanilla #snaps_goat_horn (with #overworld_natural_logs): what a charging goat's horn snaps on */
export const SNAPS_GOAT_HORN = new Set([
  'acacia_log', 'birch_log', 'oak_log', 'jungle_log', 'spruce_log', 'dark_oak_log', 'mangrove_log', 'cherry_log',
  'stone', 'packed_ice', 'iron_ore', 'coal_ore', 'copper_ore', 'emerald_ore',
]);

const blockOf = (e: { x: number; y: number; z: number }): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
const samePos = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Java's UUID.hashCode, for the seed that picks a goat's horn */
function uuidHash(u: string): number {
  const h = u.replace(/-/g, '').padStart(32, '0');
  const w = (i: number): number => parseInt(h.slice(i * 8, i * 8 + 8), 16) | 0;
  return w(0) ^ w(2) ^ w(1) ^ w(3);
}

/** vanilla GoatAi.initMemories: a long jump and a ram each a while off */
function initMemories(g: Goat, r: Rand): void {
  g.longJumpCooldown = sampleRange(r, TIME_BETWEEN_LONG_JUMPS);
  g.ramCooldown = sampleRange(r, TIME_BETWEEN_RAMS);
}

/**
 * vanilla GoatAi.RAM_TARGET_CONDITIONS (TargetingConditions.forCombat, no range): a living thing it may attack, in
 * sight, anything but a goat
 */
function ramTargetable(g: Goat, e: LivingEntity): boolean {
  if (e === g || !e.isAlive || e.removed || e.type === 'goat') return false;
  if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
  return g.canAttack(e) && g.sensing.hasLineOfSight(e);
}

// ---------------------------------------------------------------------------
// the ram (vanilla PrepareRamNearestTarget and RamTarget)

/** vanilla PrepareRamNearestTarget.isWalkableBlock: solid underfoot, and somewhere it would happily walk */
function walkable(g: Goat, x: number, y: number, z: number): boolean {
  return g.navigation.isStableDestination(x, y, z) && g.malus(g.navigation.staticTypeAt(x, y, z)) === 0;
}

/**
 * vanilla PrepareRamNearestTarget(cooldown on failing, 4, 7, 1.25, RAM_TARGET_CONDITIONS, 20, prepare sound), up to
 * eight seconds: the nearest thing it sees that it may ram; it walks (at 1.25) to the nearest spot it can reach 4 to
 * 7 blocks off from it in a straight line north, east, south or west over open, walkable ground, and there, eyes on
 * it, lowers its head; a second on, it marks the far edge of the target's block to charge through (with the prepare
 * sound). The target moving on, it picks a new spot; finding none, it gives up until its shortest wait is over
 */
function prepareRamNearestTarget(): BehaviorControl<Goat> {
  let cand: { start: Pos; targetPos: Pos; target: LivingEntity } | null = null;
  let reachedAt = -1;
  /** vanilla calculateRammingStartPosition */
  const startPosition = (g: Goat, t: LivingEntity): Pos | null => {
    const [tx, ty, tz] = blockOf(t);
    if (!walkable(g, tx, ty, tz)) return null;
    const list: Pos[] = [];
    // (vanilla Direction.Plane.HORIZONTAL: north, east, south, west)
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      let x = tx, z = tz;
      for (let i = 0; i < RAM_MAX; i++) {
        x += dx;
        z += dz;
        if (!walkable(g, x, ty, z)) {
          x -= dx;
          z -= dz;
          break;
        }
      }
      if (Math.abs(x - tx) + Math.abs(z - tz) >= RAM_MIN) list.push([x, ty, z]);
    }
    const [gx, gy, gz] = blockOf(g);
    const d = (p: Pos) => (p[0] - gx) ** 2 + (p[1] - gy) ** 2 + (p[2] - gz) ** 2;
    list.sort((a, b) => d(a) - d(b));
    return list.find((p) => g.navigation.createPath(p[0], p[1], p[2], 0)?.canReach()) ?? null;
  };
  const choose = (g: Goat, t: LivingEntity): void => {
    reachedAt = -1;
    const s = startPosition(g, t);
    cand = s ? { start: s, targetPos: blockOf(t), target: t } : null;
  };
  return new Behavior<Goat>({
    min: 160,
    max: 160,
    canStart: (g) => g.ramCooldown < 0 && g.ramTarget === null,
    start: (g) => {
      const t = g.visibleLiving.find((e) => ramTargetable(g, e));
      if (t) choose(g, t);
    },
    canStillUse: () => cand !== null && cand.target.isAlive,
    tick: (g, now) => {
      const c = cand;
      if (!c) return;
      g.walkTarget = { t: { pos: c.start }, speed: 1.25, closeEnough: 0 };
      g.lookTarget = at(c.target, true);
      if (!samePos(blockOf(c.target), c.targetPos)) {
        // (entity event 59: the head comes up again)
        g.isLoweringHead = false;
        g.navigation.stop();
        choose(g, c.target);
        return;
      }
      const b = blockOf(g);
      if (!samePos(b, c.start)) return;
      // (entity event 58: the head goes down)
      g.isLoweringHead = true;
      if (reachedAt < 0) reachedAt = now;
      if (now - reachedAt >= RAM_PREPARE) {
        // vanilla getEdgeOfBlock: the far side of the target's block
        g.ramTarget = [c.targetPos[0] + 0.5 + 0.5 * Math.sign(c.targetPos[0] - b[0]), c.targetPos[1], c.targetPos[2] + 0.5 + 0.5 * Math.sign(c.targetPos[2] - b[2])];
        g.playSound(g.screaming ? 'entity.goat.screaming.prepare_ram' : 'entity.goat.prepare_ram', 1, g.voicePitch());
        cand = null;
      }
    },
    stop: (g) => {
      if (g.ramTarget) return;
      g.isLoweringHead = false;
      g.ramCooldown = (g.screaming ? TIME_BETWEEN_RAMS_SCREAMER : TIME_BETWEEN_RAMS)[0];
    },
  });
}

/** vanilla RamTarget.hasRammedHornBreakingBlock: the block a step ahead of it, at its feet or its head, snaps horns */
function rammedHornBreakingBlock(g: Goat): boolean {
  const l = Math.hypot(g.dx, g.dz);
  const x = Math.floor(g.x + (l < 1e-5 ? 0 : g.dx / l)), y = Math.floor(g.y), z = Math.floor(g.z + (l < 1e-5 ? 0 : g.dz / l));
  const w = g.level.world;
  const snaps = (yy: number) => SNAPS_GOAT_HORN.has(BLOCKS[STATE_BLOCK[w.getState(x, yy, z)]].name);
  return snaps(y) || snaps(y + 1);
}

/**
 * vanilla RamTarget(ram cooldown, RAM_TARGET_CONDITIONS, 3, knockback, impact sound, horn break sound), up to ten
 * seconds: it charges (at 3) through the marked spot; the first thing in its way that it may ram is hurt by its attack
 * damage (a goat's ram, which angers nothing) and thrown back away from it — 2.5 times (a kid's once) its speed's
 * worth, give or take a quarter a level of speed or slowness it has, half as far off a shield; charging into a block
 * that snaps horns, one of its horns snaps off (with its crack). Either, or arriving, ends the charge: the head comes
 * up, and it waits 30 seconds to 5 minutes (a screaming goat 5 to 15 seconds) before the next
 */
function ramTarget(): BehaviorControl<Goat> {
  let dir: [number, number] = [0, 0];
  const finish = (g: Goat): void => {
    g.isLoweringHead = false;
    g.ramCooldown = sampleRange(g.level.random, g.screaming ? TIME_BETWEEN_RAMS_SCREAMER : TIME_BETWEEN_RAMS);
    g.ramTarget = null;
  };
  return new Behavior<Goat>({
    min: 200,
    max: 200,
    canStart: (g) => g.ramCooldown < 0 && g.ramTarget !== null,
    canStillUse: (g) => g.ramTarget !== null,
    start: (g) => {
      const [bx, , bz] = blockOf(g);
      const t = g.ramTarget!;
      const dx = bx - t[0], dz = bz - t[2], l = Math.hypot(dx, dz);
      dir = l < 1e-5 ? [0, 0] : [dx / l, dz / l];
      g.walkTarget = { t: { pos: blockOf({ x: t[0], y: t[1], z: t[2] }) }, speed: 3, closeEnough: 0 };
    },
    tick: (g) => {
      const hit = g.level.getEntities(g.bb, (e) => e instanceof LivingEntity && ramTargetable(g, e), g) as LivingEntity[];
      if (hit.length) {
        const t = hit[0];
        if (t.hurt(g.attackDamage, 'mobAttackNoAggro', g)) doPostAttackEffects(t, g, g.mainHand, true);
        const f = 0.25 * (g.effectAmp('speed') + 1 - (g.effectAmp('slowness') + 1));
        const f1 = Math.min(3, Math.max(0.2, g.speed * 1.65)) + f;
        const f2 = isDamageSourceBlocked(t, 'mobAttackNoAggro', g) ? 0.5 : 1;
        t.knockback(f2 * f1 * (g.isBaby() ? 1 : 2.5), dir[0], dir[1]);
        finish(g);
        g.playSound(g.screaming ? 'entity.goat.screaming.ram_impact' : 'entity.goat.ram_impact', 1, 1);
      } else if (rammedHornBreakingBlock(g)) {
        g.playSound(g.screaming ? 'entity.goat.screaming.ram_impact' : 'entity.goat.ram_impact', 1, 1);
        if (g.dropHorn()) g.playSound(g.screaming ? 'entity.goat.screaming.horn_break' : 'entity.goat.horn_break', 1, 1);
        finish(g);
      } else {
        const w = g.walkTarget, r = g.ramTarget;
        if (!w || !r) finish(g);
        else {
          const p = trackerPos(w.t);
          if ((p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2 < 0.25 * 0.25) finish(g);
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// the brain

/** vanilla GoatAi.makeBrain */
function makeBrain(): Brain<Goat, Activity> {
  const b = new Brain<Goat, Activity>('idle', ['core']);
  b.add('core', [
    [0, swim<Goat>(0.8)],
    [0, animalPanic<Goat>(2)],
    [0, lookAtTargetSink<Goat>(45, 90)],
    [0, moveToTargetSink<Goat>()],
    [0, countDownCooldown<Goat>((g) => g.temptationCooldown, (g, v) => (g.temptationCooldown = v))],
    [0, countDownCooldown<Goat>((g) => g.longJumpCooldown, (g, v) => (g.longJumpCooldown = v))],
    [0, countDownCooldown<Goat>((g) => g.ramCooldown, (g, v) => (g.ramCooldown = v))],
  ]);
  b.add(
    'idle',
    [
      [0, lookAtPlayerSometimes<Goat>(6, 30, 60)],
      [0, animalMakeLove<Goat>(1, 2)],
      [1, followTemptation<Goat>(() => 1.25)],
      [2, babyFollowAdult<Goat>(5, 16, () => 1.25)],
      [3, runOne<Goat>([[randomStroll<Goat>(1), 2], [setWalkTargetFromLookTarget<Goat>(() => true, () => 1, 3), 2], [doNothing<Goat>(30, 60), 1]])],
    ],
    (g) => g.ramTarget === null && !g.longJumpMidJump,
  );
  b.add(
    'long_jump',
    [
      [0, longJumpMidJump<Goat>(TIME_BETWEEN_LONG_JUMPS, () => 'entity.goat.step')],
      [
        1,
        longJumpToRandomPos<Goat>({
          between: TIME_BETWEEN_LONG_JUMPS,
          maxHeight: 5,
          maxWidth: 5,
          velocity: 3.5714288,
          sound: (g) => (g.screaming ? 'entity.goat.screaming.long_jump' : 'entity.goat.long_jump'),
          preferred: { on: (n) => GOATS_SPAWNABLE_ON.has(n), chance: 0.5 },
        }),
      ],
    ],
    (g) => !g.temptingPlayer && !g.breedTarget && !g.walkTarget && g.longJumpCooldown < 0,
  );
  b.add('ram', [[0, ramTarget()], [1, prepareRamNearestTarget()]], (g) => !g.temptingPlayer && !g.breedTarget && g.ramCooldown < 0);
  return b;
}

// ---------------------------------------------------------------------------

export class Goat extends Animal {
  readonly type = 'goat';
  protected adultWidth = 0.9;
  protected adultHeight = 1.3;
  /** vanilla DATA_IS_SCREAMING_GOAT */
  screaming = false;
  /** vanilla DATA_HAS_LEFT_HORN / DATA_HAS_RIGHT_HORN */
  hasLeftHorn = true;
  hasRightHorn = true;
  /** vanilla isLoweringHead (entity events 58 and 59) and lowerHeadTick: its head going down to ram, a tick at a time */
  isLoweringHead = false;
  lowerHeadTick = 0;
  /** vanilla Pose.LONG_JUMPING: pulled small in the air */
  longJumping = false;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  nearestVisibleAdult: Goat | null = null;
  /** HURT_BY (the damage, for two seconds) and HURT_BY_ENTITY */
  hurtBy: string | null = null;
  hurtByEntity: LivingEntity | null = null;
  temptingPlayer: Player | null = null;
  temptationCooldown = -1;
  isTempted = false;
  breedTarget: Goat | null = null;
  isPanicking = false;
  longJumpCooldown = -1;
  longJumpMidJump = false;
  ramCooldown = -1;
  /** RAM_TARGET: the point it charges through */
  ramTarget: Pos | null = null;

  private readonly brain = makeBrain();
  /** vanilla Sensor timing, for its sensors (nearest living, nearest adult, hurt by, tempting) */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 1.3);
    // vanilla Goat.createAttributes: 10 health, speed 0.2, 2 attack damage
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.2;
    this.attackDamage = 2;
    this.ownNavigation.canFloat = true;
    this.sensors = new SensorClock(this.random, 4);
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  isFood(s: ItemStack): boolean {
    // vanilla #goat_food
    return s.item.id === 'wheat';
  }

  override maxHeadYRot(): number {
    return 15;
  }

  /** vanilla Goat.ageBoundaryReached: a kid has no horns and butts for 1; grown, both horns and 2 */
  protected override ageBoundaryReached(): void {
    if (this.isBaby()) {
      this.attackDamage = 1;
      this.removeHorns();
    } else {
      this.attackDamage = 2;
      this.addHorns();
    }
  }

  override refreshSize(): void {
    const s = this.isBaby() ? 0.5 : 1, k = this.longJumping ? 0.7 : 1;
    this.setSize(0.9 * s * k, 1.3 * s * k);
  }

  /** vanilla setPose(LONG_JUMPING) / setPose(STANDING) */
  setLongJumping(on: boolean): void {
    this.longJumping = on;
    this.refreshSize();
  }

  /** vanilla Goat.LONG_JUMPING_DIMENSIONS, a kid's half */
  longJumpSize(): [number, number] {
    const s = this.isBaby() ? 0.5 : 1;
    return [0.9 * 0.7 * s, 1.3 * 0.7 * s];
  }

  protected override fallDamageReduction(): number {
    return FALL_DAMAGE_REDUCTION;
  }

  /** vanilla getRammingXHeadRot: up to 30 degrees down, over a second */
  rammingXHeadRot(): number {
    return ((this.lowerHeadTick / 20) * 30 * Math.PI) / 180;
  }

  addHorns(): void {
    this.hasLeftHorn = this.hasRightHorn = true;
  }

  removeHorns(): void {
    this.hasLeftHorn = this.hasRightHorn = false;
  }

  /**
   * vanilla createHorn: one of the regular horns (a screaming goat's, the screaming ones), the same one for the same
   * goat (RandomSource.create(its UUID's hashCode), java.util.Random's sequence)
   */
  createHorn(): ItemStack {
    const list = this.screaming ? SCREAMING_GOAT_HORNS : REGULAR_GOAT_HORNS;
    return goatHornStack(list[new JavaRandom(uuidHash(this.uuid)).nextInt(list.length)]);
  }

  /** vanilla dropHorn: one horn (a random one of two) snaps off and pops out as a goat horn; none left, nothing */
  dropHorn(): boolean {
    const l = this.hasLeftHorn, r = this.hasRightHorn;
    if (!l && !r) return false;
    if (!l) this.hasRightHorn = false;
    else if (!r) this.hasLeftHorn = false;
    else if (this.random.nextBool()) this.hasLeftHorn = false;
    else this.hasRightHorn = false;
    const e = new ItemEntity(this.level, this.createHorn());
    const rnd = this.random;
    e.moveTo(this.x, this.y, this.z, rnd.nextFloat() * 360, 0);
    e.dx = -0.2 + rnd.nextFloat() * 0.4;
    e.dy = 0.3 + rnd.nextFloat() * 0.4;
    e.dz = -0.2 + rnd.nextFloat() * 0.4;
    e.pickupDelay = 0;
    this.level.addEntity(e);
    return true;
  }

  // --- the brain ------------------------------------------------------------

  activity(): Activity | null {
    return this.brain.activeNonCore();
  }

  /** vanilla Brain.tickSensors: each of its sensors once a second */
  private sense(): void {
    const c = this.sensors;
    if (c.due(0)) senseNearestLiving(this);
    if (c.due(1)) senseNearestAdult(this);
    if (c.due(2)) senseHurtBy(this);
    if (c.due(3)) senseTempting(this, (s) => this.isFood(s));
  }

  /** vanilla Goat.customServerAiStep: its brain, then the first of ram, long jump and idle that may be */
  protected override customServerAiStep(): void {
    this.sense();
    this.brain.tick(this, this.level.gameTime);
    this.brain.setActiveActivityToFirstValid(['ram', 'long_jump', 'idle'], this);
    super.customServerAiStep();
  }

  /** vanilla Goat.aiStep: the head lowers a tick at a time, and comes up twice as fast */
  override aiStep(): void {
    this.lowerHeadTick = Math.max(0, Math.min(20, this.lowerHeadTick + (this.isLoweringHead ? 1 : -2)));
    super.aiStep();
  }

  // --- spawning, breeding, milking -------------------------------------------

  /**
   * vanilla Goat.finalizeSpawn: its cooldowns, one in fifty a screamer, horns (or none, a kid), a tenth of the grown
   * ones with just one
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const r = this.level.random;
    initMemories(this, r);
    this.screaming = r.nextDouble() < SCREAMING_CHANCE;
    this.ageBoundaryReached();
    if (!this.isBaby() && r.nextFloat() < UNIHORN_CHANCE) {
      if (r.nextBool()) this.hasLeftHorn = false;
      else this.hasRightHorn = false;
    }
    super.finalizeSpawn(reason, group);
  }

  /** vanilla getBreedOffspring: a kid screaming if the parent it takes after does (or one in fifty anyway) */
  makeBaby(partner: Animal): Goat {
    const g = new Goat(this.level);
    const r = this.level.random;
    initMemories(g, r);
    const parent = r.nextBool() ? this : partner;
    g.screaming = (parent instanceof Goat && parent.screaming) || r.nextDouble() < SCREAMING_CHANCE;
    return g;
  }

  /** vanilla Goat.mobInteract: a bucket milks a grown one (its milking sound at the player); else feeding, as any animal */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (stack && stack.item.id === 'bucket' && !this.isBaby()) {
      this.level.sound.play(this.screaming ? 'entity.goat.screaming.milk' : 'entity.goat.milk', p.x, p.y, p.z, 1, 1);
      const milk = new ItemStack(ITEMS.get('milk_bucket')!, 1);
      if (p.gameMode === 'creative') {
        if (!p.inventory.main.some((s) => s?.item.id === 'milk_bucket')) p.inventory.add(milk);
      } else if (stack.count === 1) p.inventory.setSelectedItem(milk);
      else {
        p.inventory.consumeSelected(1);
        if (p.inventory.add(milk) > 0) p.dropItem(milk, false);
      }
      return true;
    }
    return super.interact(p, stack);
  }

  /** vanilla Goat.checkGoatSpawnRules: on #goats_spawnable_on, in the light */
  static checkGoatSpawnRules(level: Level, x: number, y: number, z: number): boolean {
    return GOATS_SPAWNABLE_ON.has(BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name) && level.rawBrightness(x, y, z, 0) > 8;
  }

  // --- sounds -----------------------------------------------------------------

  private sound(s: string): string {
    return this.screaming ? `entity.goat.screaming.${s}` : `entity.goat.${s}`;
  }
  override ambientSound(): string {
    return this.sound('ambient');
  }
  override hurtSound(): string {
    return this.sound('hurt');
  }
  override deathSound(): string {
    return this.sound('death');
  }
  override stepSound(): string {
    return 'entity.goat.step';
  }
  /** vanilla Goat.mobInteract: its eating sound when fed, a little higher or lower each time */
  protected override playEatSound(): void {
    this.playSound(this.sound('eat'), 1, 0.8 + this.level.random.nextFloat() * 0.4);
  }

  // --- saving -------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return {
      ...super.saveData(),
      IsScreamingGoat: this.screaming,
      HasLeftHorn: this.hasLeftHorn,
      HasRightHorn: this.hasRightHorn,
      // (its brain's memories that vanilla keeps: the cooldowns)
      LongJumpCooldown: this.longJumpCooldown,
      RamCooldown: this.ramCooldown,
      TemptationCooldown: this.temptationCooldown,
    };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.IsScreamingGoat !== undefined) this.screaming = d.IsScreamingGoat === true;
    if (d.HasLeftHorn !== undefined) this.hasLeftHorn = d.HasLeftHorn === true;
    if (d.HasRightHorn !== undefined) this.hasRightHorn = d.HasRightHorn === true;
    if (typeof d.LongJumpCooldown === 'number') this.longJumpCooldown = d.LongJumpCooldown;
    if (typeof d.RamCooldown === 'number') this.ramCooldown = d.RamCooldown;
    if (typeof d.TemptationCooldown === 'number') this.temptationCooldown = d.TemptationCooldown;
  }
}
