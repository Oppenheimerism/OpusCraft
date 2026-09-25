// Vanilla's common brain behaviours and sensors (net.minecraft.world.entity.ai.behavior and ai.sensing, 1.21), shared
// by the mobs with brains (entity/ai/brain.ts): the axolotl's and the goat's (M9: and the frog's and tadpole's). The
// memories are fields on the mob (null, or -1, where it has none); each factory makes one behaviour for one mob's
// brain, as vanilla builds one per brain.

import type { Entity } from '../entity';
import { LivingEntity } from '../living';
import type { Mob } from '../mob';
import type { Player } from '../player';
import type { Animal } from '../animals';
import type { ItemStack } from '../../item/item';
import type { Rand } from '../../core/rng';
import { Behavior, oneShot, type BehaviorControl } from './brain';
import type { Path } from './pathfinder';
import { defaultRandomPosTowards, landRandomPos } from './goals';
import { randomSwimmablePos } from '../fish';
import { FLAGS, F_WATER } from '../../world/block';

export type Pos = [number, number, number];

/** vanilla PositionTracker: an EntityTracker (at its eyes, or its feet) or a BlockPosTracker */
export type Tracker = { entity: Entity; eye: boolean } | { pos: Pos };
/** vanilla WalkTarget */
export interface WalkTarget {
  t: Tracker;
  speed: number;
  closeEnough: number;
}

/** the memories every brain here keeps (vanilla LOOK_TARGET, WALK_TARGET, CANT_REACH_WALK_TARGET_SINCE and the two lists of the living) */
export interface BrainMemories {
  lookTarget: Tracker | null;
  walkTarget: WalkTarget | null;
  cantReachWalkTargetSince: number;
  /** NEAREST_LIVING_ENTITIES, and those of them it can see (NEAREST_VISIBLE_LIVING_ENTITIES), nearest first */
  nearestLiving: LivingEntity[];
  visibleLiving: LivingEntity[];
  /** ATTACK_TARGET, seen however hard it is to see */
  attackTarget?: LivingEntity | null;
  /** IS_PANICKING */
  isPanicking?: boolean;
}
export type BrainMob = Mob & BrainMemories;

/** (M9: frogs) those of one tempted by food held out to it (a tadpole's too: it never has a partner to breed with) */
export interface TemptedMemories extends BrainMemories {
  temptingPlayer: Player | null;
  temptationCooldown: number;
  isTempted: boolean;
  breedTarget: Animal | null;
}
/** and those of an animal that's tempted by food, breeds, and keeps its young by the grown ones */
export interface AnimalMemories extends TemptedMemories {
  nearestVisibleAdult: Animal | null;
}
export type BrainAnimal = Animal & AnimalMemories;

/** vanilla NearestLivingEntitySensor's reach and Sensor's targeting range */
export const SENSE_RANGE = 16;

/** vanilla #panic_causes (with #panic_environmental_causes): what sets an animal panicking */
export const PANIC_CAUSES = new Set([
  'cactus', 'freeze', 'hotFloor', 'inFire', 'campfire', 'lava', 'lightningBolt', 'onFire', 'arrow', 'dragonBreath', 'explosion', 'fireball',
  'fireworks', 'indirectMagic', 'magic', 'mob', 'mobProjectile', 'player', 'playerExplosion', 'sonicBoom', 'sting', 'thrown', 'trident',
  'unattributedFireball', 'windCharge', 'wither', 'witherSkull',
]);

/** vanilla PositionTracker.currentBlockPosition */
export function trackerBlock(t: Tracker): Pos {
  return 'pos' in t ? t.pos : [Math.floor(t.entity.x), Math.floor(t.entity.y), Math.floor(t.entity.z)];
}
/** vanilla PositionTracker.currentPosition: an entity's feet or eyes, a block's middle */
export function trackerPos(t: Tracker): Pos {
  if ('pos' in t) return [t.pos[0] + 0.5, t.pos[1] + 0.5, t.pos[2] + 0.5];
  return [t.entity.x, t.entity.y + (t.eye ? t.entity.eyeHeight : 0), t.entity.z];
}
/** vanilla EntityTracker */
export const at = (e: Entity, eye: boolean): Tracker => ({ entity: e, eye });

/** vanilla BlockPos.withinManhattan: out from the middle a Manhattan step at a time (each z one way, then the other) */
export function* withinManhattan(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Generator<Pos> {
  for (let depth = 0; depth <= rx + ry + rz; depth++) {
    const mx = Math.min(rx, depth);
    for (let x = -mx; x <= mx; x++) {
      const my = Math.min(ry, depth - Math.abs(x));
      for (let y = -my; y <= my; y++) {
        const z = depth - Math.abs(x) - Math.abs(y);
        if (z > rz) continue;
        yield [cx + x, cy + y, cz + z];
        if (z !== 0) yield [cx + x, cy + y, cz - z];
      }
    }
  }
}

/** vanilla PathfinderMob.isPanicking */
export const isPanicking = (e: object): boolean => (e as { isPanicking?: boolean }).isPanicking === true;

/** vanilla EntityTracker.isVisibleBy: a living thing alive and among those it sees; a place or anything else, always */
export function isVisibleBy(m: BrainMemories, t: Tracker): boolean {
  if ('pos' in t || !(t.entity instanceof LivingEntity)) return true;
  return t.entity.isAlive && m.visibleLiving.includes(t.entity);
}

/**
 * vanilla Sensor.isEntityTargetable / isEntityAttackable (TargetingConditions with range 16): alive, no spectator,
 * within 16 (less the harder it is to see, unless it's the attack target), in sight; `combat`: one it may attack
 */
export function isEntityTargetable(m: BrainMob, e: LivingEntity, combat = false): boolean {
  if (!e.isAlive || e.removed || e === m) return false;
  if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
  if (combat && !m.canAttack(e)) return false;
  const r = e === m.attackTarget ? SENSE_RANGE : Math.max(SENSE_RANGE * e.visibilityPercent(m), 2);
  if (e.distanceToSqr(m.x, m.y, m.z) > r * r) return false;
  return m.sensing.hasLineOfSight(e);
}

// ---------------------------------------------------------------------------
// the sensors

/** vanilla Sensor's timing: each of a brain's sensors once a second, each at its own random point in the second */
export class SensorClock {
  private readonly t: number[] = [];
  constructor(r: Rand, n: number) {
    for (let i = 0; i < n; i++) this.t.push(r.nextInt(20));
  }
  /** true when sensor `i` is due (and then it waits another second) */
  due(i: number): boolean {
    if (--this.t[i] > 0) return false;
    this.t[i] = 20;
    return true;
  }
}

/** vanilla NearestLivingEntitySensor: the living things within 16 blocks, nearest first, and those of them it sees */
export function senseNearestLiving(m: BrainMob): void {
  const r = SENSE_RANGE;
  const near = m.level.getEntities(m.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, m) as LivingEntity[];
  near.sort((a, b) => a.distanceToSqr(m.x, m.y, m.z) - b.distanceToSqr(m.x, m.y, m.z));
  m.nearestLiving = near;
  m.visibleLiving = near.filter((e) => isEntityTargetable(m, e));
}

/** vanilla NearestAdultSensor: the nearest grown one of its kind that it sees */
export function senseNearestAdult(m: BrainAnimal): void {
  m.nearestVisibleAdult = (m.visibleLiving.find((e) => e.type === m.type && !(e as Animal).isBaby()) as Animal | undefined) ?? null;
}

/** vanilla HurtBySensor: what hurt it in the last two seconds, and who that was while they live and are here */
export function senseHurtBy(m: BrainMob & { hurtBy: string | null; hurtByEntity: LivingEntity | null }): void {
  const s = m.recentDamageSource();
  m.hurtBy = s;
  if (s !== null && m.lastDamageEntity instanceof LivingEntity) m.hurtByEntity = m.lastDamageEntity;
  const by = m.hurtByEntity;
  if (by && (!by.isAlive || by.level !== m.level)) m.hurtByEntity = null;
}

/** vanilla TemptingSensor: the nearest player within 10 (less if hard to see) holding its food, not riding it */
export function senseTempting(m: BrainMob & TemptedMemories, isFood: (s: ItemStack) => boolean): void {
  const p = m.level.player;
  const holds = (s: ItemStack | null) => !!s && isFood(s);
  const ok = p && p.isAlive && p.gameMode !== 'spectator' && p.vehicle !== m && p.distanceToSqr(m.x, m.y, m.z) <= (10 * p.visibilityPercent(m)) ** 2;
  m.temptingPlayer = ok && (holds(p.inventory.selectedItem) || holds(p.inventory.offhand)) ? p : null;
}

// ---------------------------------------------------------------------------
// the behaviours

/** vanilla LookAtTargetSink(min, max): eyes on the look target while it's in sight, then it's forgotten */
export function lookAtTargetSink<E extends BrainMob>(min: number, max: number): BehaviorControl<E> {
  return new Behavior<E>({
    min,
    max,
    canStart: (a) => a.lookTarget !== null,
    canStillUse: (a) => a.lookTarget !== null && isVisibleBy(a, a.lookTarget),
    tick: (a) => {
      const [x, y, z] = trackerPos(a.lookTarget!);
      a.lookControl.setLookAt(x, y, z);
    },
    stop: (a) => {
      a.lookTarget = null;
    },
  });
}

/**
 * vanilla MoveToTargetSink (150-250 ticks at a time): a path to the walk target (or, with none, to somewhere up to 10
 * off towards it), a new one when the target has moved more than two blocks; done on arriving (within its
 * close-enough Manhattan distance), or when the path runs out; stuck, it waits up to two seconds before trying again.
 * (trial chambers) `o`: vanilla MoveToTargetSink(min, max) and a subclass's own start and stop after its own (the
 * breeze's SlideToTargetSink)
 */
export function moveToTargetSink<E extends BrainMob>(o: { min?: number; max?: number; start?: (a: E) => void; stop?: (a: E) => void } = {}): BehaviorControl<E> {
  let cooldown = 0;
  let path: Path | null = null;
  let last: Pos | null = null;
  let speed = 0;
  const reached = (a: E, w: WalkTarget): boolean => {
    const [x, y, z] = trackerBlock(w.t);
    return Math.abs(x - Math.floor(a.x)) + Math.abs(y - Math.floor(a.y)) + Math.abs(z - Math.floor(a.z)) <= w.closeEnough;
  };
  const compute = (a: E, w: WalkTarget, now: number): boolean => {
    const [bx, by, bz] = trackerBlock(w.t);
    path = a.navigation.createPath(bx + 0.5, by, bz + 0.5, 0);
    speed = w.speed;
    if (reached(a, w)) {
      a.cantReachWalkTargetSince = -1;
      return false;
    }
    if (path?.canReach()) a.cantReachWalkTargetSince = -1;
    else if (a.cantReachWalkTargetSince < 0) a.cantReachWalkTargetSince = now;
    if (path) return true;
    const p = defaultRandomPosTowards(a, 10, 7, bx + 0.5, bz + 0.5, Math.PI / 2);
    if (!p) return false;
    path = a.navigation.createPath(p[0] + 0.5, p[1], p[2] + 0.5, 0);
    return path !== null;
  };
  return new Behavior<E>({
    min: o.min ?? 150,
    max: o.max ?? 250,
    canStart: (a, now) => {
      const w = a.walkTarget;
      if (!w) return false;
      if (cooldown > 0) {
        cooldown--;
        return false;
      }
      const done = reached(a, w);
      if (!done && compute(a, w, now)) {
        last = trackerBlock(w.t);
        return true;
      }
      a.walkTarget = null;
      if (done) a.cantReachWalkTargetSince = -1;
      return false;
    },
    start: (a) => {
      a.navigation.moveToPath(path, speed);
      o.start?.(a);
    },
    canStillUse: (a) => {
      const w = a.walkTarget;
      if (!path || !last || !w) return false;
      const spectator = 'entity' in w.t && (w.t.entity as { gameMode?: string }).gameMode === 'spectator';
      return !a.navigation.isDone() && !reached(a, w) && !spectator;
    },
    tick: (a, now) => {
      const p = a.navigation.path;
      if (path !== p) path = p;
      if (p && last) {
        const w = a.walkTarget!;
        const b = trackerBlock(w.t);
        if ((b[0] - last[0]) ** 2 + (b[1] - last[1]) ** 2 + (b[2] - last[2]) ** 2 > 4 && compute(a, w, now)) {
          last = b;
          a.navigation.moveToPath(path, speed);
        }
      }
    },
    stop: (a) => {
      const w = a.walkTarget;
      if (w && !reached(a, w) && a.navigation.isStuck) cooldown = a.level.random.nextInt(40);
      a.navigation.stop();
      a.walkTarget = null;
      path = null;
      o.stop?.(a);
    },
  });
}

/** vanilla CountDownCooldownTicks: a cooldown memory counting down to nothing */
export function countDownCooldown<E extends { random: Rand }>(get: (e: E) => number, set: (e: E, v: number) => void): BehaviorControl<E> {
  return new Behavior<E>({
    timesOut: false,
    canStart: (e) => get(e) >= 0,
    canStillUse: (e) => get(e) > 0,
    tick: (e) => set(e, get(e) - 1),
    stop: (e) => set(e, -1),
  });
}

/**
 * vanilla SetEntityLookTargetSometimes.create(PLAYER, range, min-max): with nothing to look at, now and then (every
 * `min` to `max` ticks that a player is within `range` and seen) it looks at that player
 */
export function lookAtPlayerSometimes<E extends BrainMob>(range: number, min: number, max: number): BehaviorControl<E> {
  let ticks = 0;
  return oneShot<E>((a) => {
    if (a.lookTarget) return false;
    const p = a.visibleLiving.find((e) => e.type === 'player' && e.distanceToSqr(a.x, a.y, a.z) <= range * range);
    if (!p) return false;
    // vanilla SetEntityLookTargetSometimes.Ticker.tickDownAndCheck
    if (ticks === 0) {
      ticks = min + a.random.nextInt(max - min + 1) - 1;
      return false;
    }
    if (--ticks !== 0) return false;
    a.lookTarget = at(p, true);
    return true;
  });
}

/** vanilla BehaviorUtils.lockGazeAndWalkToEachOther */
export function lockGazeAndWalkToEachOther(a: BrainMob, b: BrainMob, speed: number, dist: number): void {
  a.lookTarget = at(b, true);
  b.lookTarget = at(a, true);
  a.walkTarget = { t: at(b, false), speed, closeEnough: dist };
  b.walkTarget = { t: at(a, false), speed, closeEnough: dist };
}

/**
 * vanilla AnimalMakeLove(type, speed, close), up to 110 ticks: in love, with a partner of its kind in love in sight
 * (and neither panicking), the two come together, and 60-110 ticks on, within three blocks, have their baby
 */
export function animalMakeLove<E extends BrainAnimal>(speed = 1, close = 2): BehaviorControl<E> {
  let spawnAt = 0;
  const partner = (a: E): E | undefined => a.visibleLiving.find((e): e is E => e.type === a.type && a.canMate(e as unknown as Animal) && !isPanicking(e));
  return new Behavior<E>({
    min: 110,
    max: 110,
    canStart: (a) => !a.breedTarget && !isPanicking(a) && a.isInLove() && partner(a) !== undefined,
    start: (a, now) => {
      const p = partner(a)!;
      a.breedTarget = p;
      p.breedTarget = a;
      lockGazeAndWalkToEachOther(a, p, speed, close);
      spawnAt = now + 60 + a.random.nextInt(50);
    },
    canStillUse: (a, now) => {
      const p = a.breedTarget as E | null;
      return !!p && p.type === a.type && p.isAlive && a.canMate(p) && a.visibleLiving.includes(p) && now <= spawnAt && !isPanicking(a) && !isPanicking(p);
    },
    tick: (a, now) => {
      const p = a.breedTarget as E;
      lockGazeAndWalkToEachOther(a, p, speed, close);
      if (a.distanceToSqr(p.x, p.y, p.z) < 9 && now >= spawnAt) {
        a.spawnChildFromBreeding(p);
        a.breedTarget = null;
        p.breedTarget = null;
      }
    },
    stop: (a) => {
      a.breedTarget = null;
      a.walkTarget = null;
      a.lookTarget = null;
      spawnAt = 0;
    },
  });
}

/**
 * vanilla FollowTemptation: after the player holding its food (looking at them), up to `close` blocks off; losing
 * them (or breeding, or panicking), it pays no heed to food for five seconds
 */
export function followTemptation<E extends BrainMob & TemptedMemories>(speed: (a: E) => number, close = 2.5): BehaviorControl<E> {
  return new Behavior<E>({
    timesOut: false,
    canStart: (a) => a.temptationCooldown < 0 && a.temptingPlayer !== null && !a.breedTarget && !isPanicking(a),
    start: (a) => {
      a.isTempted = true;
    },
    canStillUse: (a) => a.temptingPlayer !== null && !a.breedTarget && !isPanicking(a),
    tick: (a) => {
      const p = a.temptingPlayer!;
      a.lookTarget = at(p, true);
      if (a.distanceToSqr(p.x, p.y, p.z) < close * close) a.walkTarget = null;
      else a.walkTarget = { t: at(p, false), speed: speed(a), closeEnough: 2 };
    },
    stop: (a) => {
      a.temptationCooldown = 100;
      a.isTempted = false;
      a.walkTarget = null;
      a.lookTarget = null;
    },
  });
}

/** vanilla BabyFollowAdult.create(min-max, speed): a baby keeps to the nearest grown one it sees, from `min` to `max` blocks off */
export function babyFollowAdult<E extends BrainAnimal>(min: number, max: number, speed: (a: E) => number): BehaviorControl<E> {
  return oneShot<E>((a) => {
    const adult = a.nearestVisibleAdult;
    if (!adult || a.walkTarget || !a.isBaby()) return false;
    const d = a.distanceToSqr(adult.x, adult.y, adult.z);
    if (d >= (max + 1) ** 2 || d < min * min) return false;
    a.lookTarget = at(adult, true);
    a.walkTarget = { t: at(adult, false), speed: speed(a), closeEnough: min - 1 };
    return true;
  });
}

/** vanilla RandomStroll.stroll(speed, mayStrollFromWater): somewhere on land up to ten blocks off */
export function randomStroll<E extends BrainMob>(speed: number, mayStrollFromWater = true): BehaviorControl<E> {
  return oneShot<E>((a) => {
    if (a.walkTarget || (!mayStrollFromWater && a.inWater)) return false;
    const p = landRandomPos(a, 10, 7);
    a.walkTarget = p ? { t: { pos: p }, speed, closeEnough: 0 } : null;
    return true;
  });
}

/** vanilla RandomStroll's SWIM_XY_DISTANCE_TIERS */
const SWIM_TIERS: [number, number][] = [[1, 1], [3, 3], [5, 5], [6, 5], [7, 7], [10, 7]];
const waterAt = (a: BrainMob, x: number, y: number, z: number): boolean => (FLAGS[a.level.world.getState(x, y, z)] & F_WATER) !== 0;

/**
 * vanilla RandomStroll.getTargetSwimPos: a random swimmable spot close by, then on along the same line further and
 * further out, the last one still in water
 */
function swimTargetPos(a: BrainMob): Pos | null {
  let v: Pos | null = null;
  let v2: Pos | null = null;
  for (const [h, vy] of SWIM_TIERS) {
    if (!v) {
      const p = randomSwimmablePos(a, h, vy);
      v2 = p ? [p[0] + 0.5, p[1], p[2] + 0.5] : null;
    } else {
      const dx: number = v[0] - a.x, dy: number = v[1] - a.y, dz: number = v[2] - a.z;
      const l: number = Math.sqrt(dx * dx + dy * dy + dz * dz);
      v2 = l < 1e-4 ? [a.x, a.y, a.z] : [a.x + (dx / l) * h, a.y + (dy / l) * vy, a.z + (dz / l) * h];
    }
    if (!v2 || !waterAt(a, Math.floor(v2[0]), Math.floor(v2[1]), Math.floor(v2[2]))) return v;
    v = v2;
  }
  return v2;
}

/** vanilla RandomStroll.swim(speed): in the water, off somewhere else in it (the axolotl's; M9: the frog's and the tadpole's) */
export function swimStroll<E extends BrainMob>(speed: number): BehaviorControl<E> {
  return oneShot<E>((a) => {
    if (a.walkTarget || !a.inWater) return false;
    const p = swimTargetPos(a);
    a.walkTarget = p ? { t: { pos: [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])] }, speed, closeEnough: 0 } : null;
    return true;
  });
}

/** vanilla SetWalkTargetFromLookTarget.create(canSet, speed, close): to what it's looking at, to within `close` blocks */
export function setWalkTargetFromLookTarget<E extends BrainMob>(canSet: (a: E) => boolean, speed: (a: E) => number, close: number): BehaviorControl<E> {
  return oneShot<E>((a) => {
    const t = a.lookTarget;
    if (a.walkTarget || !t || !canSet(a)) return false;
    a.walkTarget = { t, speed: speed(a), closeEnough: close };
    return true;
  });
}

/** vanilla Swim(chance): deep in water (or in lava), it paddles up, jumping `chance` of the ticks */
export function swim<E extends BrainMob>(chance: number): BehaviorControl<E> {
  const deep = (a: E): boolean => (a.inWater && a.fluidHeightWater > (a.eyeHeight < 0.4 ? 0 : 0.4)) || a.inLava;
  return new Behavior<E>({
    canStart: deep,
    canStillUse: deep,
    tick: (a) => {
      if (a.random.nextFloat() < chance) a.jumpControl.jump();
    },
  });
}

/**
 * vanilla AnimalPanic(speed): hurt by something that frightens it (#panic_causes), it runs about for five or six
 * seconds, somewhere up to five blocks off each time it gets there (to water nearby if it's on fire)
 */
export function animalPanic<E extends BrainMob & { hurtBy: string | null; isPanicking: boolean }>(speed: number): BehaviorControl<E> {
  // (vanilla lookForWater: the nearest water by Manhattan distance, five blocks round and one up or down)
  const waterNear = (a: E): Pos | null => {
    const bx = Math.floor(a.x), by = Math.floor(a.y), bz = Math.floor(a.z);
    for (const p of withinManhattan(bx, by, bz, 5, 1, 5)) if (FLAGS[a.level.world.getState(p[0], p[1], p[2])] & F_WATER) return p;
    return null;
  };
  return new Behavior<E>({
    min: 100,
    max: 120,
    canStart: (a) => (a.hurtBy !== null && PANIC_CAUSES.has(a.hurtBy)) || a.isPanicking,
    start: (a) => {
      a.isPanicking = true;
      a.navigation.stop();
    },
    canStillUse: () => true,
    tick: (a) => {
      if (!a.navigation.isDone()) return;
      const p = (a.isOnFire() ? waterNear(a) : null) ?? landRandomPos(a, 5, 4);
      if (p) a.walkTarget = { t: { pos: p }, speed, closeEnough: 0 };
    },
    stop: (a) => {
      a.isPanicking = false;
    },
  });
}
