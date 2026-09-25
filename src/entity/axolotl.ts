// Axolotls (Stage 5: ocean, M7; vanilla Axolotl and AxolotlAi, 1.21). They live in the lush caves' pools over clay,
// in fours to sixes: the first two of a group grown, the rest babies, all in the group's two of the four common
// colours (lucy, wild, gold and cyan); the blue is rare, one bred baby in 1200. In the water they swim about, turning
// smoothly; on land they crawl, slowly, and make for water within six blocks; out of water and rain they dry out after
// five minutes (then 2 damage a second), and a splash of water wets them again. They hunt fish and squid in the water
// within eight blocks (not for two minutes after a fight) and always go for drowned and guardians there; when a
// player finishes off what one is fighting, the player gets Regeneration (and loses Mining Fatigue). Hurt in the
// water, one may play dead for ten seconds, healing, while nothing attacks it. A bucket of tropical fish tempts them
// and breeds them (the water bucket comes back); a water bucket scoops one up, keeping its colour, age and hunting
// cooldown. They can be leashed, and there's a spawn egg.
//
// Their brain is vanilla's (entity/ai/brain.ts): the core, idle, fight and play-dead activities with vanilla's
// behaviours in vanilla's order, fed by its five sensors every second; the memories are fields.

import { Animal } from './animals';
import type { Level } from '../game/level';
import type { MobCategory, SpawnGroup, SpawnReason } from './mob';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { Behavior, Brain, GateBehavior, oneShot, runOne, type BehaviorControl } from './ai/brain';
import type { LookControl } from './ai/controls';
import { AmphibiousPathNavigation, type PathNavigation } from './ai/navigation';
import { PathType, type Path } from './ai/pathfinder';
import { defaultRandomPosTowards, landRandomPos } from './ai/goals';
import { SmoothSwimmingLookControl, SmoothSwimmingMoveControl } from './dolphin';
import { BUCKET_FISH, bucketMobPickup, randomSwimmablePos, type BucketEntityData, type Bucketable } from './fish';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER } from '../world/block';

type Pos = [number, number, number];
type Activity = 'core' | 'idle' | 'fight' | 'play_dead';

/** vanilla Axolotl.Variant, by id: the four common colours, then the rare blue */
export const AXOLOTL_VARIANTS = ['lucy', 'wild', 'gold', 'cyan', 'blue'] as const;
/** vanilla getMaxAirSupply: five minutes out of the water */
export const AXOLOTL_MAX_AIR = 6000;
/** vanilla REHYDRATE_AIR_SUPPLY */
const REHYDRATE_AIR = 1800;
/** vanilla TOTAL_PLAYDEAD_TIME */
const PLAY_DEAD_TIME = 200;
/** vanilla AxolotlAi.updateActivity: no hunting for two minutes after a fight */
const HUNTING_COOLDOWN = 2400;
/** vanilla #axolotl_always_hostiles */
const ALWAYS_HOSTILES = new Set(['drowned', 'guardian', 'elder_guardian']);
/** vanilla #axolotl_hunt_targets */
const HUNT_TARGETS = new Set(['tropical_fish', 'pufferfish', 'salmon', 'cod', 'squid', 'glow_squid', 'tadpole']);
/** vanilla #axolotl_food */
const AXOLOTL_FOOD = 'tropical_fish_bucket';
/** vanilla NearestLivingEntitySensor's reach (the follow range) and Sensor's targeting range */
const SENSE_RANGE = 16;

/** vanilla PositionTracker: an EntityTracker (at its eyes, or its feet) or a BlockPosTracker */
export type Tracker = { entity: Entity; eye: boolean } | { pos: Pos };
/** vanilla WalkTarget */
export interface WalkTarget {
  t: Tracker;
  speed: number;
  closeEnough: number;
}

/** vanilla PositionTracker.currentBlockPosition */
function trackerBlock(t: Tracker): Pos {
  return 'pos' in t ? t.pos : [Math.floor(t.entity.x), Math.floor(t.entity.y), Math.floor(t.entity.z)];
}
/** vanilla PositionTracker.currentPosition: an entity's feet or eyes, a block's middle */
function trackerPos(t: Tracker): Pos {
  if ('pos' in t) return [t.pos[0] + 0.5, t.pos[1] + 0.5, t.pos[2] + 0.5];
  return [t.entity.x, t.entity.y + (t.eye ? t.entity.eyeHeight : 0), t.entity.z];
}
const at = (e: Entity, eye: boolean): Tracker => ({ entity: e, eye });

/** vanilla AxolotlAi.getSpeedModifier: idling (and tempted), half speed in the water, crawling on land */
const idleSpeed = (a: Axolotl): number => (a.inWater ? 0.5 : 0.15);
/** vanilla getSpeedModifierChasing / getSpeedModifierFollowingAdult */
const chaseSpeed = (a: Axolotl): number => (a.inWater ? 0.6 : 0.15);

/** vanilla BlockPos.withinManhattan: out from the middle a Manhattan step at a time (each z one way, then the other) */
function* withinManhattan(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Generator<Pos> {
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

const waterFluidAt = (a: Axolotl, x: number, y: number, z: number): boolean => (FLAGS[a.level.world.getState(x, y, z)] & F_WATER) !== 0;

// ---------------------------------------------------------------------------
// the behaviours (vanilla ai.behavior), each made for one axolotl's brain

/** vanilla LookAtTargetSink(45, 90): eyes on the look target for 45-90 ticks while it's in sight, then it's forgotten */
function lookAtTargetSink(min: number, max: number): BehaviorControl<Axolotl> {
  return new Behavior<Axolotl>({
    min,
    max,
    canStart: (a) => a.lookTarget !== null,
    canStillUse: (a) => a.lookTarget !== null && a.canSee(a.lookTarget),
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
 * close-enough Manhattan distance), or when the path runs out; stuck, it waits up to two seconds before trying again
 */
function moveToTargetSink(): BehaviorControl<Axolotl> {
  let cooldown = 0;
  let path: Path | null = null;
  let last: Pos | null = null;
  let speed = 0;
  const reached = (a: Axolotl, w: WalkTarget): boolean => {
    const [x, y, z] = trackerBlock(w.t);
    return Math.abs(x - Math.floor(a.x)) + Math.abs(y - Math.floor(a.y)) + Math.abs(z - Math.floor(a.z)) <= w.closeEnough;
  };
  const compute = (a: Axolotl, w: WalkTarget, now: number): boolean => {
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
  return new Behavior<Axolotl>({
    min: 150,
    max: 250,
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
    },
  });
}

/** vanilla ValidatePlayDead: counts its play-dead ticks down; at the end it forgets who hurt it and idles again */
function validatePlayDead(): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    if (a.playDeadTicks < 0) return false;
    if (a.playDeadTicks <= 0) {
      a.playDeadTicks = -1;
      a.hurtByEntity = null;
      a.useDefaultActivity();
    } else a.playDeadTicks--;
    return true;
  });
}

/** vanilla CountDownCooldownTicks(TEMPTATION_COOLDOWN_TICKS) */
function countDownTemptationCooldown(): BehaviorControl<Axolotl> {
  return new Behavior<Axolotl>({
    timesOut: false,
    canStart: (a) => a.temptationCooldown >= 0,
    canStillUse: (a) => a.temptationCooldown > 0,
    tick: (a) => {
      a.temptationCooldown--;
    },
    stop: (a) => {
      a.temptationCooldown = -1;
    },
  });
}

/**
 * vanilla SetEntityLookTargetSometimes.create(PLAYER, 6, 30-60): with nothing to look at, now and then (every 30 to 60
 * ticks that a player is within six blocks and seen) it looks at that player
 */
function lookAtPlayerSometimes(range: number, min: number, max: number): BehaviorControl<Axolotl> {
  let ticks = 0;
  return oneShot<Axolotl>((a) => {
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
function lockGazeAndWalkToEachOther(a: Axolotl, b: Axolotl, speed: number, dist: number): void {
  a.lookTarget = at(b, true);
  b.lookTarget = at(a, true);
  a.walkTarget = { t: at(b, false), speed, closeEnough: dist };
  b.walkTarget = { t: at(a, false), speed, closeEnough: dist };
}

/**
 * vanilla AnimalMakeLove(AXOLOTL, 0.2, 2), up to 110 ticks: in love, with a partner in love in sight, the two come
 * together, and 60-110 ticks on, within three blocks, have their baby
 */
function animalMakeLove(speed: number, close: number): BehaviorControl<Axolotl> {
  let spawnAt = 0;
  const partner = (a: Axolotl): Axolotl | undefined => a.visibleLiving.find((e): e is Axolotl => e instanceof Axolotl && a.canMate(e));
  return new Behavior<Axolotl>({
    min: 110,
    max: 110,
    canStart: (a) => !a.breedTarget && a.isInLove() && partner(a) !== undefined,
    start: (a, now) => {
      const p = partner(a)!;
      a.breedTarget = p;
      p.breedTarget = a;
      lockGazeAndWalkToEachOther(a, p, speed, close);
      spawnAt = now + 60 + a.random.nextInt(50);
    },
    canStillUse: (a, now) => {
      const p = a.breedTarget;
      return !!p && p.isAlive && a.canMate(p) && a.visibleLiving.includes(p) && now <= spawnAt;
    },
    tick: (a, now) => {
      const p = a.breedTarget!;
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
 * vanilla FollowTemptation: after the player holding its food (looking at them), up to two and a half blocks off;
 * losing them, it pays no heed to food for five seconds
 */
function followTemptation(speed: (a: Axolotl) => number): BehaviorControl<Axolotl> {
  return new Behavior<Axolotl>({
    timesOut: false,
    canStart: (a) => a.temptationCooldown < 0 && a.temptingPlayer !== null && !a.breedTarget,
    start: (a) => {
      a.isTempted = true;
    },
    canStillUse: (a) => a.temptingPlayer !== null && !a.breedTarget,
    tick: (a) => {
      const p = a.temptingPlayer!;
      a.lookTarget = at(p, true);
      if (a.distanceToSqr(p.x, p.y, p.z) < 2.5 * 2.5) a.walkTarget = null;
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

/** vanilla BabyFollowAdult.create(5-16): a baby keeps to the nearest grown one it sees, from 5 to 16 blocks off */
function babyFollowAdult(min: number, max: number, speed: (a: Axolotl) => number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    const adult = a.nearestVisibleAdult;
    if (!adult || a.walkTarget || !a.isBaby()) return false;
    const d = a.distanceToSqr(adult.x, adult.y, adult.z);
    if (d >= (max + 1) ** 2 || d < min * min) return false;
    a.lookTarget = at(adult, true);
    a.walkTarget = { t: at(adult, false), speed: speed(a), closeEnough: min - 1 };
    return true;
  });
}

/** vanilla StartAttacking with AxolotlAi.findNearestValidAttackTarget: the nearest attackable, unless it's breeding */
function startAttacking(): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    if (a.attackTarget || a.breedTarget) return false;
    const t = a.nearestAttackable;
    if (!t || !a.canAttack(t)) return false;
    a.attackTarget = t;
    a.cantReachWalkTargetSince = -1;
    return true;
  });
}

/**
 * vanilla TryFindWater.create(6, 0.15): out of the water, it makes for the nearest water with air over it within six
 * blocks (Manhattan), or else any water not right by it; it looks again a second after finding none, two if it did
 */
function tryFindWater(range: number, speed: number): BehaviorControl<Axolotl> {
  let next = 0;
  return oneShot<Axolotl>((a, now) => {
    if (a.attackTarget || a.walkTarget) return false;
    const bx = Math.floor(a.x), by = Math.floor(a.y), bz = Math.floor(a.z);
    if (waterFluidAt(a, bx, by, bz)) return false;
    if (now < next) {
      next = now + 22;
      return true;
    }
    const w = a.level.world;
    let found: Pos | null = null, fallback: Pos | null = null;
    for (const [x, y, z] of withinManhattan(bx, by, bz, range, range, range)) {
      if (x === bx && z === bz) continue;
      if (BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name !== 'water') continue;
      if (FLAGS[w.getState(x, y + 1, z)] & F_AIR) {
        found = [x, y, z];
        break;
      }
      if (!fallback && (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2 + (z + 0.5 - a.z) ** 2 >= 1.5 * 1.5) fallback = [x, y, z];
    }
    found ??= fallback;
    if (found) {
      a.lookTarget = { pos: found };
      a.walkTarget = { t: { pos: found }, speed, closeEnough: 0 };
    }
    next = now + 40;
    return true;
  });
}

/** vanilla RandomStroll's SWIM_XY_DISTANCE_TIERS */
const SWIM_TIERS: [number, number][] = [[1, 1], [3, 3], [5, 5], [6, 5], [7, 7], [10, 7]];

/**
 * vanilla RandomStroll.getTargetSwimPos: a random swimmable spot close by, then on along the same line further and
 * further out, the last one still in water
 */
function swimTargetPos(a: Axolotl): [number, number, number] | null {
  let v: [number, number, number] | null = null;
  let v2: [number, number, number] | null = null;
  for (const [h, vy] of SWIM_TIERS) {
    if (!v) {
      const p = randomSwimmablePos(a, h, vy);
      v2 = p ? [p[0] + 0.5, p[1], p[2] + 0.5] : null;
    } else {
      const dx: number = v[0] - a.x, dy: number = v[1] - a.y, dz: number = v[2] - a.z;
      const l: number = Math.sqrt(dx * dx + dy * dy + dz * dz);
      v2 = l < 1e-4 ? [a.x, a.y, a.z] : [a.x + (dx / l) * h, a.y + (dy / l) * vy, a.z + (dz / l) * h];
    }
    if (!v2 || !waterFluidAt(a, Math.floor(v2[0]), Math.floor(v2[1]), Math.floor(v2[2]))) return v;
    v = v2;
  }
  return v2;
}

/** vanilla RandomStroll.swim(0.5): in the water, off somewhere else in it */
function swimStroll(speed: number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    if (a.walkTarget || !a.inWater) return false;
    const p = swimTargetPos(a);
    a.walkTarget = p ? { t: { pos: [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])] }, speed, closeEnough: 0 } : null;
    return true;
  });
}

/** vanilla RandomStroll.stroll(0.15, false): on land, a crawl somewhere up to ten blocks off */
function landStroll(speed: number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    if (a.walkTarget || a.inWater) return false;
    const p = landRandomPos(a, 10, 7);
    a.walkTarget = p ? { t: { pos: p }, speed, closeEnough: 0 } : null;
    return true;
  });
}

/**
 * vanilla SetWalkTargetFromLookTarget with AxolotlAi.canSetWalkTargetFromLookTarget: to what it's looking at, when
 * that's in water just as it is (or on land as it is), to within three blocks
 */
function walkToLookTarget(close: number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    const t = a.lookTarget;
    if (a.walkTarget || !t) return false;
    const [x, y, z] = trackerBlock(t);
    if (waterFluidAt(a, x, y, z) !== a.inWater) return false;
    a.walkTarget = { t, speed: idleSpeed(a), closeEnough: close };
    return true;
  });
}

/**
 * vanilla StopAttackingIfTargetInvalid.create(Axolotl::onStopAttacking): gone, dead, no longer attackable, or out of
 * reach for ten seconds, the target is dropped (and a player who finished it off is helped)
 */
function stopAttackingIfTargetInvalid(): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a, now) => {
    const t = a.attackTarget;
    if (!t) return false;
    const tired = a.cantReachWalkTargetSince >= 0 && now - a.cantReachWalkTargetSince > 200;
    if (a.canAttack(t) && !tired && t.isAlive && !t.removed && t.level === a.level) return true;
    a.onStopAttacking(t);
    a.attackTarget = null;
    return true;
  });
}

/** vanilla SetWalkTargetFromAttackTargetIfTargetOutOfReach: after the target until it's in reach (and seen) */
function walkToAttackTarget(speed: (a: Axolotl) => number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    const t = a.attackTarget;
    if (!t) return false;
    if (a.visibleLiving.includes(t) && a.isWithinMeleeAttackRange(t)) a.walkTarget = null;
    else {
      a.lookTarget = at(t, true);
      a.walkTarget = { t: at(t, false), speed: speed(a), closeEnough: 0 };
    }
    return true;
  });
}

/** vanilla MeleeAttack.create(20): a bite when it's in reach and seen, one a second */
function meleeAttack(cooldown: number): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a, now) => {
    const t = a.attackTarget;
    if (!t || now < a.attackCoolingDownUntil) return false;
    if (!a.isWithinMeleeAttackRange(t) || !a.visibleLiving.includes(t)) return false;
    a.lookTarget = at(t, true);
    a.swing();
    a.doHurtTarget(t);
    a.attackCoolingDownUntil = now + cooldown;
    return true;
  });
}

/** vanilla EraseMemoryIf(BehaviorUtils::isBreeding, ...): what breeding puts out of its mind */
function eraseIfBreeding(present: (a: Axolotl) => boolean, erase: (a: Axolotl) => void): BehaviorControl<Axolotl> {
  return oneShot<Axolotl>((a) => {
    if (!present(a) || !a.breedTarget) return false;
    erase(a);
    return true;
  });
}

/**
 * vanilla PlayDead (200 ticks): hurt by something, in the water, it stops where it is, looks at nothing, and gets
 * Regeneration for ten seconds
 */
function playDead(): BehaviorControl<Axolotl> {
  return new Behavior<Axolotl>({
    min: PLAY_DEAD_TIME,
    max: PLAY_DEAD_TIME,
    canStart: (a) => a.playDeadTicks >= 0 && a.hurtByEntity !== null && a.inWater,
    start: (a) => {
      a.walkTarget = null;
      a.lookTarget = null;
      a.addEffect(new MobEffectInstance(MOB_EFFECTS.regeneration, 200, 0));
    },
    canStillUse: (a) => a.inWater && a.playDeadTicks >= 0,
  });
}

/** vanilla AxolotlAi.makeBrain */
function makeBrain(): Brain<Axolotl, Activity> {
  const b = new Brain<Axolotl, Activity>('idle', ['core']);
  b.add('core', [[0, lookAtTargetSink(45, 90)], [0, moveToTargetSink()], [0, validatePlayDead()], [0, countDownTemptationCooldown()]]);
  b.add('idle', [
    [0, lookAtPlayerSometimes(6, 30, 60)],
    [1, animalMakeLove(0.2, 2)],
    [2, runOne<Axolotl>([[followTemptation(idleSpeed), 1], [babyFollowAdult(5, 16, chaseSpeed), 1]])],
    [3, startAttacking()],
    [3, tryFindWater(6, 0.15)],
    [
      4,
      new GateBehavior<Axolotl>(
        [
          [swimStroll(0.5), 2],
          [landStroll(0.15), 2],
          [walkToLookTarget(3), 3],
          [oneShot<Axolotl>((a) => a.inWater), 5],
          [oneShot<Axolotl>((a) => a.onGround), 5],
        ],
        { entry: (a) => a.walkTarget === null, shuffle: false, tryAll: true },
      ),
    ],
  ]);
  b.add('fight', [
    [0, stopAttackingIfTargetInvalid()],
    [0, walkToAttackTarget(chaseSpeed)],
    [0, meleeAttack(20)],
    [0, eraseIfBreeding((a) => a.attackTarget !== null, (a) => (a.attackTarget = null))],
  ]);
  b.add('play_dead', [
    [0, playDead()],
    [1, eraseIfBreeding((a) => a.playDeadTicks >= 0, (a) => (a.playDeadTicks = -1))],
  ]);
  return b;
}

// ---------------------------------------------------------------------------
// the controls

/** vanilla Axolotl.AxolotlMoveControl: SmoothSwimmingMoveControl(85, 10, 0.1, 0.5, no gravity), not while playing dead */
class AxolotlMoveControl extends SmoothSwimmingMoveControl {
  constructor(readonly axolotl: Axolotl) {
    super(axolotl, 85, 10, 0.1, 0.5, false);
  }
  override tick(): void {
    if (!this.axolotl.isPlayingDead()) super.tick();
  }
}

/** vanilla Axolotl.AxolotlLookControl: SmoothSwimmingLookControl(20), not while playing dead */
class AxolotlLookControl extends SmoothSwimmingLookControl {
  constructor(readonly axolotl: Axolotl) {
    super(axolotl, 20);
  }
  override tick(): void {
    if (!this.axolotl.isPlayingDead()) super.tick();
  }
}

// ---------------------------------------------------------------------------

export class Axolotl extends Animal implements Bucketable {
  readonly type = 'axolotl';
  override readonly category: MobCategory = 'axolotls';
  protected adultWidth = 0.75;
  protected adultHeight = 0.42;
  /** vanilla DATA_VARIANT: an index into AXOLOTL_VARIANTS */
  variant = 0;
  /** vanilla FROM_BUCKET: poured out of a bucket (it never despawns) */
  fromBucket = false;
  /** vanilla DATA_PLAYING_DEAD: set from its brain's count each tick */
  playingDead = false;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  attackTarget: LivingEntity | null = null;
  /** ATTACK_COOLING_DOWN: till this game time */
  attackCoolingDownUntil = -1;
  /** NEAREST_LIVING_ENTITIES, and those of them it can see (NEAREST_VISIBLE_LIVING_ENTITIES), nearest first */
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  nearestVisibleAdult: Axolotl | null = null;
  hurtByEntity: LivingEntity | null = null;
  playDeadTicks = -1;
  nearestAttackable: LivingEntity | null = null;
  temptingPlayer: Player | null = null;
  temptationCooldown = -1;
  isTempted = false;
  /** HAS_HUNTING_COOLDOWN: till this game time */
  huntingCooldownUntil = -1;
  breedTarget: Axolotl | null = null;

  private readonly brain = makeBrain();
  /** vanilla Sensor.timeToTick, for each of its sensors (nearest living, nearest adult, hurt by, attackables, tempting) */
  private readonly sensorTimers: number[] = [];

  constructor(level: Level) {
    super(level);
    this.setSize(0.75, 0.42);
    // vanilla Axolotl.createAttributes: 14 health, speed 1, 2 attack damage, a full block's step
    this.maxHealth = this.health = 14;
    this.moveSpeedAttr = 1;
    this.attackDamage = 2;
    this.stepHeight = 1;
    this.air = AXOLOTL_MAX_AIR;
    this.setPathfindingMalus(PathType.WATER, 0);
    this.moveControl = new AxolotlMoveControl(this);
    (this as { lookControl: LookControl }).lookControl = new AxolotlLookControl(this);
    for (let i = 0; i < 5; i++) this.sensorTimers.push(this.random.nextInt(20));
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  protected override createNavigation(): PathNavigation {
    return new AmphibiousPathNavigation(this);
  }

  override get eyeHeight(): number {
    // vanilla EntityType.AXOLOTL eyeHeight 0.2751 (a baby's half)
    return this.isBaby() ? 0.2751 * 0.5 : 0.2751;
  }

  get variantName(): string {
    return AXOLOTL_VARIANTS[this.variant] ?? 'lucy';
  }

  isPlayingDead(): boolean {
    return this.playingDead;
  }

  // --- the brain ------------------------------------------------------------

  /** vanilla EntityTracker.isVisibleBy: a living thing alive and among those it sees; anything else, always */
  canSee(t: Tracker): boolean {
    if ('pos' in t || !(t.entity instanceof LivingEntity)) return true;
    return t.entity.isAlive && this.visibleLiving.includes(t.entity);
  }

  /** vanilla Brain.setActiveActivity: forgetting the other activities' memories (a fight's target, the play-dead count) */
  private setActivity(a: Activity): void {
    if (this.brain.isActive(a)) return;
    if (a !== 'fight') this.attackTarget = null;
    if (a !== 'play_dead') this.playDeadTicks = -1;
    this.brain.setActiveActivityIfPossible(a, this);
  }

  /** vanilla Brain.useDefaultActivity */
  useDefaultActivity(): void {
    this.setActivity('idle');
  }

  activity(): Activity | null {
    return this.brain.activeNonCore();
  }

  /** vanilla AxolotlAi.updateActivity: playing dead it stays so; else that, fighting, or idling; after a fight, no hunting */
  private updateActivity(now: number): void {
    const was = this.brain.activeNonCore();
    if (was === 'play_dead') return;
    const next: Activity = this.playDeadTicks >= 0 ? 'play_dead' : this.attackTarget ? 'fight' : 'idle';
    this.setActivity(next);
    if (was === 'fight' && next !== 'fight') this.huntingCooldownUntil = now + HUNTING_COOLDOWN;
  }

  /** vanilla Sensor.isEntityTargetable / isEntityAttackable (TargetingConditions): within 16 (less if it's hard to see), and seen */
  private targetable(e: LivingEntity, combat: boolean): boolean {
    if (!e.isAlive || e.removed || e === this) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    if (combat && !this.canAttack(e)) return false;
    // (not while it's its target: vanilla's ..._IGNORE_INVISIBILITY_TESTING)
    const r = e === this.attackTarget ? SENSE_RANGE : Math.max(SENSE_RANGE * e.visibilityPercent(this), 2);
    if (e.distanceToSqr(this.x, this.y, this.z) > r * r) return false;
    return this.sensing.hasLineOfSight(e);
  }

  /** vanilla Brain.tickSensors: each of its sensors once a second */
  private sense(now: number): void {
    const t = this.sensorTimers;
    // vanilla NearestLivingEntitySensor
    if (--t[0] <= 0) {
      t[0] = 20;
      const r = SENSE_RANGE;
      const near = this.level.getEntities(this.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, this) as LivingEntity[];
      near.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
      this.nearestLiving = near;
      this.visibleLiving = near.filter((e) => this.targetable(e, false));
    }
    // vanilla NearestAdultSensor
    if (--t[1] <= 0) {
      t[1] = 20;
      this.nearestVisibleAdult = (this.visibleLiving.find((e) => e instanceof Axolotl && !e.isBaby()) as Axolotl | undefined) ?? null;
    }
    // vanilla HurtBySensor (the damage itself is the living entity's own)
    if (--t[2] <= 0) {
      t[2] = 20;
      const by = this.lastHurtByMob;
      this.hurtByEntity = by && by.isAlive && by.level === this.level ? by : null;
    }
    // vanilla AxolotlAttackablesSensor: within 8, in the water, always a foe or (not after a fight) prey
    if (--t[3] <= 0) {
      t[3] = 20;
      const hunting = now >= this.huntingCooldownUntil;
      this.nearestAttackable =
        this.visibleLiving.find((e) => e.distanceToSqr(this.x, this.y, this.z) <= 64 && e.inWater && (ALWAYS_HOSTILES.has(e.type) || (hunting && HUNT_TARGETS.has(e.type))) && this.targetable(e, true)) ?? null;
    }
    // vanilla TemptingSensor (AXOLOTL_TEMPTATIONS): the nearest player within 10 holding a bucket of tropical fish
    if (--t[4] <= 0) {
      t[4] = 20;
      const p = this.level.player;
      const holds = (s: ItemStack | null) => s?.item.id === AXOLOTL_FOOD;
      const ok = p && p.isAlive && p.gameMode !== 'spectator' && p.vehicle !== this && p.distanceToSqr(this.x, this.y, this.z) <= (10 * p.visibilityPercent(this)) ** 2;
      this.temptingPlayer = ok && (holds(p.inventory.selectedItem) || holds(p.inventory.offhand)) ? p : null;
    }
  }

  /** vanilla Axolotl.customServerAiStep: its brain, its activity, and whether it's playing dead */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    const now = this.level.gameTime;
    // vanilla Brain.forgetOutdatedMemories
    if (this.huntingCooldownUntil >= 0 && now >= this.huntingCooldownUntil) this.huntingCooldownUntil = -1;
    if (this.attackCoolingDownUntil >= 0 && now >= this.attackCoolingDownUntil) this.attackCoolingDownUntil = -1;
    this.sense(now);
    this.brain.tick(this, now);
    this.updateActivity(now);
    this.playingDead = this.playDeadTicks > 0;
    this.target = this.attackTarget;
  }

  /**
   * vanilla Axolotl.hurt: in the water, hurt by something (not so badly it dies), a third of the time — when the blow
   * is heavy for it, or it's below half health — it plays dead for ten seconds
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const h = this.health;
    const r = this.level.random;
    if (r.nextInt(3) === 0 && (r.nextInt(3) < amount || h / this.maxHealth < 0.5) && amount < h && this.inWater && (attacker || direct) && !this.playingDead)
      this.playDeadTicks = PLAY_DEAD_TIME;
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla canBeSeenAsEnemy: not while playing dead */
  override canBeSeenAsEnemy(): boolean {
    return !this.playingDead && super.canBeSeenAsEnemy();
  }

  /**
   * vanilla Axolotl.onStopAttacking: its target dead, if a player dealt the last blow and is within 20 blocks, they
   * get its help
   */
  onStopAttacking(t: LivingEntity): void {
    if (!(t.dead || t.health <= 0) || !t.recentDamageSource()) return;
    const p = t.lastDamageEntity;
    if (!p || p.type !== 'player') return;
    const box = this.bb.inflate(20, 20, 20);
    if (p.bb.intersects(box)) this.applySupportingEffects(p as Player);
  }

  /**
   * vanilla applySupportingEffects: Regeneration for five seconds more than it has left (up to two minutes, unless it
   * has longer), and no more Mining Fatigue
   */
  applySupportingEffects(p: Player): void {
    const cur = p.getEffect('regeneration');
    if (!cur || (cur.duration !== -1 && cur.duration <= 2399)) {
      const d = Math.min(2400, 100 + (cur ? cur.duration : 0));
      p.addEffect(new MobEffectInstance(MOB_EFFECTS.regeneration, d, 0), this);
      // (vanilla EffectsChangedTrigger with the axolotl as the source: The Healing Power of Friendship!)
      this.level.onPlayerTrigger?.(p, 'effects_changed', { effects: new Set(p.activeEffects.keys()), effectSource: 'axolotl' });
    }
    p.removeEffect('mining_fatigue');
  }

  // --- breeding and food -----------------------------------------------------

  override isFood(s: ItemStack): boolean {
    return s.item.id === AXOLOTL_FOOD;
  }

  /** vanilla getBreedOffspring: one of its parents' colours, or one time in 1200 the blue */
  makeBaby(partner: Animal): Animal {
    const baby = new Axolotl(this.level);
    if (this.random.nextInt(1200) === 0) baby.variant = 4;
    else baby.variant = this.random.nextBool() ? this.variant : (partner as Axolotl).variant;
    baby.persistenceRequired = true;
    return baby;
  }

  /** vanilla usePlayerItem: a bucket of tropical fish fed to it leaves a water bucket (ItemUtils.createFilledResult) */
  protected override usePlayerItem(p: Player): void {
    const inv = p.inventory;
    const s = inv.selectedItem;
    if (s?.item.id !== AXOLOTL_FOOD) return super.usePlayerItem(p);
    const water = ItemStack.of('water_bucket');
    if (p.gameMode === 'creative') {
      if (inv.findSlot((x) => x.item.id === 'water_bucket') < 0) inv.add(water);
    } else if (s.count <= 1) inv.setSelectedItem(water);
    else {
      inv.consumeSelected(1);
      if (inv.add(water) > 0) p.dropItem(water, false);
    }
  }

  /** vanilla mobInteract: a water bucket scoops it up (Bucketable.bucketMobPickup); else as any animal */
  override interact(p: Player, stack: ItemStack | null): boolean {
    return bucketMobPickup(p, stack, this) || super.interact(p, stack);
  }

  // --- its bucket (vanilla Bucketable) ----------------------------------------

  bucketItem(): string {
    return 'axolotl_bucket';
  }
  pickupSound(): string {
    return 'item.bucket.fill_axolotl';
  }
  /** vanilla saveToBucketTag: its health, its colour, its age, and how long it won't hunt yet */
  saveToBucketTag(stack: ItemStack): void {
    const d: BucketEntityData = { Health: this.health, Variant: this.variant, Age: this.age };
    if (this.huntingCooldownUntil >= 0) d.HuntingCooldown = this.huntingCooldownUntil - this.level.gameTime;
    stack.tag = { ...(stack.tag ?? {}), bucketEntity: d };
  }
  loadFromBucketTag(d: BucketEntityData): void {
    if (typeof d.Health === 'number') this.health = Math.min(this.maxHealth, d.Health);
    if (typeof d.Variant === 'number') this.variant = AXOLOTL_VARIANTS[d.Variant] ? d.Variant : 0;
    if (typeof d.Age === 'number') this.setAge(d.Age);
    if (typeof d.HuntingCooldown === 'number') this.huntingCooldownUntil = this.level.gameTime + d.HuntingCooldown;
  }

  override requiresCustomPersistence(): boolean {
    return super.requiresCustomPersistence() || this.fromBucket;
  }
  /** vanilla Axolotl.removeWhenFarAway: unlike most animals it may despawn, unless it came from a bucket or is named */
  override removeWhenFarAway(): boolean {
    return !this.fromBucket && !this.customName;
  }

  // --- the water -------------------------------------------------------------

  /** vanilla baseTick: its own breath, by what it had before the living entity's breathing */
  override baseTick(): void {
    const air = this.air;
    super.baseTick();
    this.handleAirSupply(air);
  }

  /** vanilla handleAirSupply: out of water and rain it dries out, hurt 2 from 20 ticks past empty; wet, it's full */
  private handleAirSupply(air: number): void {
    if (this.isAlive && !this.isInWaterOrRainNow()) {
      this.air = air - 1;
      if (this.air === -20) {
        this.air = 0;
        this.hurt(2, 'dryOut');
      }
    } else this.air = AXOLOTL_MAX_AIR;
  }

  /** vanilla rehydrate: a splash of water gives it a minute and a half more */
  rehydrate(): void {
    this.air = Math.min(this.air + REHYDRATE_AIR, AXOLOTL_MAX_AIR);
  }

  /** vanilla Axolotl.travel: in the water it swims along its heading, slowed by a tenth a tick */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(this.speed, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
    } else super.travel(sx, sy, sz);
  }

  override canBreatheUnderwater(): boolean {
    return true;
  }
  override isPushedByFluid(): boolean {
    return false;
  }
  /** vanilla getWalkTargetValue: nowhere better than anywhere else */
  override walkTargetValue(): number {
    return 0;
  }
  /** vanilla getMaxHeadXRot / getMaxHeadYRot: its head turns only with its body */
  override maxHeadXRot(): number {
    return 1;
  }
  override maxHeadYRot(): number {
    return 1;
  }
  /** vanilla checkSpawnObstruction (level.isUnobstructed): the water is no obstruction */
  override checkSpawnObstruction(): boolean {
    return true;
  }

  // --- spawning ---------------------------------------------------------------

  /**
   * vanilla Axolotl.finalizeSpawn: out of a bucket it's what the bucket says; else one of the group's two common
   * colours (a new group's picked at random), the third and later of a group babies
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    if (reason === 'bucket') return;
    const g = group ?? {};
    let baby = false;
    if (g.axolotlVariants) baby = (g.ageable?.size ?? 0) >= 2;
    else g.axolotlVariants = [this.commonVariant(), this.commonVariant()];
    this.variant = g.axolotlVariants[this.level.random.nextInt(g.axolotlVariants.length)];
    if (baby) this.setAge(-24000);
    // (vanilla AxolotlGroupData: no babies of AgeableMob's own)
    g.ageable ??= { size: 0, babyChance: 0 };
    super.finalizeSpawn(reason, g);
  }

  /** vanilla Variant.getCommonSpawnVariant */
  private commonVariant(): number {
    return this.level.random.nextInt(4);
  }

  /** vanilla Axolotl.checkAxolotlSpawnRules: over #axolotls_spawnable_on (clay) */
  static checkAxolotlSpawnRules(level: Level, x: number, y: number, z: number): boolean {
    return BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name === 'clay';
  }

  // --- sounds -------------------------------------------------------------------

  override ambientSound(): string | null {
    return this.inWater ? 'entity.axolotl.idle_water' : 'entity.axolotl.idle_air';
  }
  /** vanilla playAmbientSound: not while playing dead */
  override playAmbientSound(): void {
    if (!this.playingDead) super.playAmbientSound();
  }
  override hurtSound(): string {
    return 'entity.axolotl.hurt';
  }
  override deathSound(): string {
    return 'entity.axolotl.death';
  }
  protected override swimSound(): string {
    return 'entity.axolotl.swim';
  }
  protected override swimSplashSound(): string {
    return 'entity.axolotl.splash';
  }
  /** vanilla Mob.doHurtTarget → Axolotl.playAttackSound */
  override doHurtTarget(target: Entity): boolean {
    const ok = super.doHurtTarget(target);
    if (ok) this.playSound('entity.axolotl.attack', 1, 1);
    return ok;
  }

  // --- saving --------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), Variant: this.variant, FromBucket: this.fromBucket };
    // (the memories vanilla's brain keeps)
    if (this.playDeadTicks >= 0) d.PlayDeadTicks = this.playDeadTicks;
    if (this.huntingCooldownUntil >= 0) d.HuntingCooldown = this.huntingCooldownUntil - this.level.gameTime;
    if (this.temptationCooldown >= 0) d.TemptationCooldown = this.temptationCooldown;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const v = Number(d.Variant ?? 0);
    this.variant = AXOLOTL_VARIANTS[v] ? v : 0;
    this.fromBucket = d.FromBucket === true;
    this.playDeadTicks = typeof d.PlayDeadTicks === 'number' ? d.PlayDeadTicks : -1;
    this.huntingCooldownUntil = typeof d.HuntingCooldown === 'number' ? this.level.gameTime + d.HuntingCooldown : -1;
    this.temptationCooldown = typeof d.TemptationCooldown === 'number' ? d.TemptationCooldown : -1;
  }
}

BUCKET_FISH.axolotl_bucket = (l) => new Axolotl(l);
