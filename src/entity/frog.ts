// Frogs (M9; vanilla Frog and FrogAi, with the behaviours only they use — Croak, ShootTongue, TryFindLand,
// TryFindLandNearWater, TryLaySpawnOnWaterNearLand — and FrogAttackablesSensor, 1.21). They live in swamps and
// mangrove swamps, two to five together on grass or mud in the light, and come in three kinds by where they're born:
// the orange temperate frog, the white warm one (deserts, jungles, savannas, badlands, the warm ocean, mangroves, the
// Nether) and the green cold one (snow, ice, the peaks, groves, the deep dark, the End). On land they walk slowly,
// croak now and then (the throat swelling), look at players, and every five to seven seconds leap up to four blocks
// across and two up or down, half the time for a lily pad or big dripleaf if one's in reach; in the water they swim
// (and, never drowning, make for land). A frog shoots out its tongue at a small slime or magma cube within ten blocks
// it can get to, pulls it in and eats it: a slime ball comes of the slime, and of the magma cube a froglight of the
// frog's colour (ochre, verdant, pearlescent). Slime balls tempt and breed them: no young, but one of the pair is
// carrying spawn, and finds land by water to lay it on the water's surface (game/frogspawn.ts hatches it; the
// tadpoles are entity/tadpole.ts). Falls hurt them 5 less.
//
// Its brain is vanilla's (entity/ai/brain.ts, the shared behaviours of ai/brainBehaviors.ts, the long jumps of
// ai/longJump.ts): the core, idle, swim, lay-spawn, long-jump and tongue activities, the first of tongue, lay spawn,
// long jump, swim and idle that may run.

import { Animal } from './animals';
import type { Level } from '../game/level';
import type { SpawnGroup, SpawnReason } from './mob';
import { LivingEntity } from './living';
import type { Player } from './player';
import { Behavior, Brain, GateBehavior, oneShot, runOne, type BehaviorControl } from './ai/brain';
import {
  animalMakeLove, animalPanic, at, countDownCooldown, followTemptation, isEntityTargetable, lookAtPlayerSometimes, lookAtTargetSink, moveToTargetSink,
  randomStroll, senseHurtBy, senseNearestLiving, senseTempting, SensorClock, setWalkTargetFromLookTarget, swimStroll, withinManhattan,
  type Pos, type Tracker, type WalkTarget,
} from './ai/brainBehaviors';
import { defaultAcceptableLandingSpot, longJumpMidJump, longJumpToRandomPos, sampleRange } from './ai/longJump';
import { LookControl } from './ai/controls';
import { AmphibiousPathNavigation, type PathNavigation } from './ai/navigation';
import { AmphibiousNodeEvaluator, PathType, type Node, type NodeEvaluator } from './ai/pathfinder';
import type { Mob } from './mob';
import { SmoothSwimmingMoveControl } from './dolphin';
import type { ItemStack } from '../item/item';
import type { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, COLLISION, getBlock } from '../world/block';
import { fluidType, FLUID_NONE, FLUID_WATER } from '../world/fluids';
import { BIOMES } from '../world/gen/biomes';

type Activity = 'core' | 'idle' | 'swim' | 'lay_spawn' | 'long_jump' | 'tongue';
/** vanilla Pose, as far as a frog takes one */
export type FrogPose = 'standing' | 'long_jumping' | 'croaking' | 'using_tongue';
/** vanilla FrogVariant (the registry's order) */
export type FrogVariant = 'temperate' | 'warm' | 'cold';
export const FROG_VARIANTS: readonly FrogVariant[] = ['temperate', 'warm', 'cold'];

/** vanilla FrogAi.TIME_BETWEEN_LONG_JUMPS */
const TIME_BETWEEN_LONG_JUMPS: [number, number] = [100, 140];
/** vanilla Frog.FROG_FALL_DAMAGE_REDUCTION */
const FALL_DAMAGE_REDUCTION = 5;
/** vanilla ShootTongue.EATING_DISTANCE, EATING_MOVEMENT_FACTOR, CATCH_ANIMATION_DURATION and TONGUE_ANIMATION_DURATION */
const EATING_DISTANCE = 1.75;
const EATING_MOVEMENT_FACTOR = 0.75;
const CATCH_ANIMATION = 6;
const TONGUE_ANIMATION = 10;
/** vanilla ShootTongue.UNREACHABLE_TONGUE_TARGETS_COOLDOWN_DURATION and MAX_UNREACHBLE_TONGUE_TARGETS_IN_MEMORY */
const UNREACHABLE_COOLDOWN = 100;
const MAX_UNREACHABLE = 5;
/** vanilla Croak.CROAK_TICKS */
const CROAK_TICKS = 60;

/** vanilla #frogs_spawnable_on */
export const FROGS_SPAWNABLE_ON = new Set(['grass_block', 'mud', 'mangrove_roots', 'muddy_mangrove_roots']);
/** vanilla #frog_prefer_jump_to: what it would rather leap onto, and walks over as open ground */
export const FROG_PREFER_JUMP_TO = new Set(['lily_pad', 'big_dripleaf']);
/** vanilla #spawns_warm_variant_frogs (with #is_jungle, #is_savanna, #is_nether and #is_badlands) */
const WARM_BIOMES = new Set([
  'desert', 'warm_ocean', 'jungle', 'sparse_jungle', 'bamboo_jungle', 'savanna', 'savanna_plateau', 'windswept_savanna', 'nether_wastes',
  'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas', 'badlands', 'eroded_badlands', 'wooded_badlands', 'mangrove_swamp',
]);
/** vanilla #spawns_cold_variant_frogs (with #is_end) */
const COLD_BIOMES = new Set([
  'snowy_plains', 'ice_spikes', 'frozen_peaks', 'jagged_peaks', 'snowy_slopes', 'frozen_ocean', 'deep_frozen_ocean', 'grove', 'deep_dark',
  'frozen_river', 'snowy_taiga', 'snowy_beach', 'the_end', 'end_highlands', 'end_midlands', 'small_end_islands', 'end_barrens',
]);

/** vanilla Frog.finalizeSpawn: cold where the biome is cold, warm where it's warm, else temperate */
export function frogVariantFor(biome: string): FrogVariant {
  return COLD_BIOMES.has(biome) ? 'cold' : WARM_BIOMES.has(biome) ? 'warm' : 'temperate';
}

/** vanilla Frog.canEat: a small slime or magma cube (#frog_food), nothing bigger */
export function canEat(e: LivingEntity): boolean {
  return (e.type === 'slime' || e.type === 'magma_cube') && (e as LivingEntity & { size: number }).size === 1;
}

const nameAt = (f: Frog, x: number, y: number, z: number): string => BLOCKS[STATE_BLOCK[f.level.world.getState(x, y, z)]].name;
const blockOf = (e: { x: number; y: number; z: number }): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
const collides = (st: number): boolean => (COLLISION[st]?.length ?? 0) > 0;
/** vanilla Direction.Plane.HORIZONTAL: north, east, south, west */
const HORIZONTAL: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** vanilla isFaceSturdy(UP): its collision shape covers the whole of its top */
function sturdyTop(st: number): boolean {
  return (COLLISION[st] ?? []).some((b) => b[0] <= 0 && b[2] <= 0 && b[3] >= 1 && b[5] >= 1 && b[4] >= 1);
}
/** vanilla getCollisionShape(...).getFaceShape(UP).isEmpty(): nothing of it up against its top */
function topFaceEmpty(st: number): boolean {
  return !(COLLISION[st] ?? []).some((b) => b[4] >= 1);
}
/** vanilla FluidState.is(Fluids.WATER): still water (a source, or a waterlogged block's) */
export function isWaterSource(st: number): boolean {
  if (fluidType(st) !== FLUID_WATER) return false;
  const b = BLOCKS[STATE_BLOCK[st]];
  return b.name !== 'water' || b.get<number>(st, 'level') === 0;
}

/** vanilla FrogAi.initMemories: a long jump a while off */
function initMemories(f: Frog, r: Rand): void {
  f.longJumpCooldown = sampleRange(r, TIME_BETWEEN_LONG_JUMPS);
}

/**
 * vanilla FrogAi.isAcceptableLandingSpot: nothing liquid there, below or above; over (or in) a lily pad or big
 * dripleaf, or on a trapdoor, always; anywhere else as any long jumper would (solid underfoot, happy to walk)
 */
function isAcceptableLandingSpot(f: Frog, x: number, y: number, z: number): boolean {
  const w = f.level.world;
  const st = w.getState(x, y, z);
  if (fluidType(st) !== FLUID_NONE || fluidType(w.getState(x, y - 1, z)) !== FLUID_NONE || fluidType(w.getState(x, y + 1, z)) !== FLUID_NONE) return false;
  if (FROG_PREFER_JUMP_TO.has(nameAt(f, x, y, z)) || FROG_PREFER_JUMP_TO.has(nameAt(f, x, y - 1, z))) return true;
  const t = f.navigation.staticTypeAt(x, y, z);
  if (t === PathType.TRAPDOOR || (FLAGS[st] & F_AIR && f.navigation.staticTypeAt(x, y - 1, z) === PathType.TRAPDOOR)) return true;
  return defaultAcceptableLandingSpot(f, x, y, z);
}

// ---------------------------------------------------------------------------
// the behaviours (vanilla ai.behavior), each made for one frog's brain

/** vanilla StartAttacking.create(FrogAi::canAttack, NEAREST_ATTACKABLE): the nearest it may eat, unless it's breeding */
function startAttacking(): BehaviorControl<Frog> {
  return oneShot<Frog>((f) => {
    if (f.attackTarget || f.breedTarget) return false;
    const t = f.nearestAttackable;
    if (!t || !f.canAttack(t)) return false;
    f.attackTarget = t;
    f.cantReachWalkTargetSince = -1;
    return true;
  });
}

/** vanilla StopAttackingIfTargetInvalid.create(): gone, dead, no longer attackable, or out of reach ten seconds */
function stopAttackingIfTargetInvalid(): BehaviorControl<Frog> {
  return oneShot<Frog>((f, now) => {
    const t = f.attackTarget;
    if (!t) return false;
    const tired = f.cantReachWalkTargetSince >= 0 && now - f.cantReachWalkTargetSince > 200;
    if (!(f.canAttack(t) && !tired && t.isAlive && !t.removed && t.level === f.level)) f.attackTarget = null;
    return true;
  });
}

/**
 * vanilla ShootTongue(frog.tongue, frog.eat), five seconds at most: a target it can get within 1.75 of (by a path's
 * end, counted in whole blocks) — else it's forgotten and passed over for five seconds — and not while it croaks. It
 * makes for it (at twice its pace, the way worked out again every half second) and, within 1.75, shoots its tongue:
 * the prey is flung towards it, and six ticks on eaten (hurt for its 10: a small slime or magma cube dies, and is
 * gone at once); ten more and it's done
 */
function shootTongue(): BehaviorControl<Frog> {
  let state: 'move' | 'catch' | 'eat' | 'done' = 'done';
  let pathCounter = 0;
  let eatTimer = 0;
  /** vanilla canPathfindToTarget: a path to it that ends within 1.75 of it (Path.getDistToTarget: Manhattan) */
  const reachable = (f: Frog, t: LivingEntity): boolean => {
    const p = f.navigation.createPathToEntity(t, 0);
    const end = p?.endNode;
    return !!end && end.distanceManhattan(p!.target) < EATING_DISTANCE;
  };
  const eat = (f: Frog): void => {
    f.level.sound.play('entity.frog.eat', f.x, f.y, f.z, 2, 1);
    const t = f.tongueTarget;
    if (t && t.isAlive) {
      f.doHurtTarget(t);
      // (vanilla remove(KILLED): swallowed whole, no body left behind)
      if (!t.isAlive) t.remove();
    }
  };
  return new Behavior<Frog>({
    min: 100,
    max: 100,
    canStart: (f) => {
      const t = f.attackTarget;
      if (f.walkTarget || !t || f.isPanicking) return false;
      const ok = reachable(f, t);
      if (!ok) {
        f.attackTarget = null;
        f.addUnreachableTongueTarget(t);
      }
      return ok && f.pose !== 'croaking' && canEat(t);
    },
    start: (f) => {
      const t = f.attackTarget!;
      f.lookTarget = at(t, true);
      f.tongueTarget = t;
      f.walkTarget = { t: { pos: blockOf(t) }, speed: 2, closeEnough: 0 };
      pathCounter = 10;
      state = 'move';
    },
    canStillUse: (f) => f.attackTarget !== null && state !== 'done' && !f.isPanicking,
    tick: (f) => {
      const t = f.attackTarget!;
      f.tongueTarget = t;
      if (state === 'move') {
        if (Math.sqrt(t.distanceToSqr(f.x, f.y, f.z)) < EATING_DISTANCE) {
          f.level.sound.play('entity.frog.tongue', f.x, f.y, f.z, 2, 1);
          f.setPose('using_tongue');
          const dx = f.x - t.x, dy = f.y - t.y, dz = f.z - t.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const k = l < 1e-4 ? 0 : EATING_MOVEMENT_FACTOR / l;
          t.dx = dx * k;
          t.dy = dy * k;
          t.dz = dz * k;
          eatTimer = 0;
          state = 'catch';
        } else if (pathCounter <= 0) {
          f.walkTarget = { t: { pos: blockOf(t) }, speed: 2, closeEnough: 0 };
          pathCounter = 10;
        } else pathCounter--;
      } else if (state === 'catch') {
        if (eatTimer++ >= CATCH_ANIMATION) {
          state = 'eat';
          eat(f);
        }
      } else if (state === 'eat') {
        if (eatTimer >= TONGUE_ANIMATION) state = 'done';
        else eatTimer++;
      }
    },
    stop: (f) => {
      f.attackTarget = null;
      f.tongueTarget = null;
      f.setPose('standing');
    },
  });
}

/** vanilla Croak, up to five seconds: standing with nowhere to go (and not in water or lava), it croaks for three */
function croak(): BehaviorControl<Frog> {
  let counter = 0;
  return new Behavior<Frog>({
    min: 100,
    max: 100,
    canStart: (f) => !f.walkTarget && f.pose === 'standing',
    start: (f) => {
      if (!f.inWater && !f.inLava) {
        f.setPose('croaking');
        counter = 0;
      }
    },
    canStillUse: () => counter < CROAK_TICKS,
    tick: () => {
      counter++;
    },
    stop: (f) => {
      f.setPose('standing');
    },
  });
}

/**
 * vanilla TryFindLand.create(range, speed): in water, with nothing to attack and nowhere to go, it makes for the
 * nearest dry ground within `range` (Manhattan) that it could stand on, not straight up or down; every three seconds
 */
function tryFindLand(range: number, speed: number): BehaviorControl<Frog> {
  let next = 0;
  return oneShot<Frog>((f, now) => {
    if (f.attackTarget || f.walkTarget) return false;
    const w = f.level.world;
    const [bx, by, bz] = blockOf(f);
    if (fluidType(w.getState(bx, by, bz)) !== FLUID_WATER) return false;
    if (now < next) {
      next = now + 60;
      return true;
    }
    for (const [x, y, z] of withinManhattan(bx, by, bz, range, range, range)) {
      if (x === bx && z === bz) continue;
      const st = w.getState(x, y, z);
      if (BLOCKS[STATE_BLOCK[st]].name !== 'water' && fluidType(st) === FLUID_NONE && !collides(st) && sturdyTop(w.getState(x, y - 1, z))) {
        f.lookTarget = { pos: [x, y, z] };
        f.walkTarget = { t: { pos: [x, y, z] }, speed, closeEnough: 1 };
        break;
      }
    }
    next = now + 60;
    return true;
  });
}

/**
 * vanilla TryFindLandNearWater.create(range, speed): out of the water, with nothing to attack and nowhere to go, it
 * makes for the nearest ground within `range` (Manhattan) beside open water; every two seconds
 */
function tryFindLandNearWater(range: number, speed: number): BehaviorControl<Frog> {
  let next = 0;
  return oneShot<Frog>((f, now) => {
    if (f.attackTarget || f.walkTarget) return false;
    const w = f.level.world;
    const [bx, by, bz] = blockOf(f);
    if (fluidType(w.getState(bx, by, bz)) === FLUID_WATER) return false;
    if (now < next) {
      next = now + 40;
      return true;
    }
    search: for (const [x, y, z] of withinManhattan(bx, by, bz, range, range, range)) {
      if ((x === bx && z === bz) || collides(w.getState(x, y, z)) || !collides(w.getState(x, y - 1, z))) continue;
      for (const [dx, dz] of HORIZONTAL) {
        if (FLAGS[w.getState(x + dx, y, z + dz)] & F_AIR && BLOCKS[STATE_BLOCK[w.getState(x + dx, y - 1, z + dz)]].name === 'water') {
          f.lookTarget = { pos: [x, y, z] };
          f.walkTarget = { t: { pos: [x, y, z] }, speed, closeEnough: 0 };
          break search;
        }
      }
    }
    next = now + 40;
    return true;
  });
}

/**
 * vanilla TryLaySpawnOnWaterNearLand.create(frogspawn): carrying spawn, on its way somewhere, on the ground and out of
 * the water, beside still water (open at the top, air above it) level with the block it stands on: the frogspawn
 * goes on the water there
 */
function tryLaySpawnOnWaterNearLand(): BehaviorControl<Frog> {
  return oneShot<Frog>((f) => {
    if (f.attackTarget || !f.walkTarget || !f.isPregnant) return false;
    if (f.inWater || !f.onGround) return false;
    const w = f.level.world;
    const [bx, by, bz] = blockOf(f);
    for (const [dx, dz] of HORIZONTAL) {
      const st = w.getState(bx + dx, by - 1, bz + dz);
      if (!topFaceEmpty(st) || !isWaterSource(st) || !(FLAGS[w.getState(bx + dx, by, bz + dz)] & F_AIR)) continue;
      f.level.setBlock(bx + dx, by, bz + dz, getBlock('frogspawn').defaultState);
      f.level.sound.play('entity.frog.lay_spawn', f.x, f.y, f.z, 1, 1);
      f.isPregnant = false;
      return true;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// the brain

/** vanilla FrogAi.makeBrain */
function makeBrain(): Brain<Frog, Activity> {
  const b = new Brain<Frog, Activity>('idle', ['core']);
  b.add('core', [
    [0, animalPanic<Frog>(2)],
    [0, lookAtTargetSink<Frog>(45, 90)],
    [0, moveToTargetSink<Frog>()],
    [0, countDownCooldown<Frog>((f) => f.temptationCooldown, (f, v) => (f.temptationCooldown = v))],
    [0, countDownCooldown<Frog>((f) => f.longJumpCooldown, (f, v) => (f.longJumpCooldown = v))],
  ]);
  const onGround = oneShot<Frog>((f) => f.onGround);
  b.add(
    'idle',
    [
      [0, lookAtPlayerSometimes<Frog>(6, 30, 60)],
      [0, animalMakeLove<Frog>(1, 2)],
      [1, followTemptation<Frog>(() => 1.25)],
      [2, startAttacking()],
      [3, tryFindLand(6, 1)],
      [
        4,
        runOne<Frog>(
          [[randomStroll<Frog>(1), 1], [setWalkTargetFromLookTarget<Frog>(() => true, () => 1, 3), 1], [croak(), 3], [onGround, 2]],
          (f) => f.walkTarget === null,
        ),
      ],
    ],
    (f) => !f.longJumpMidJump && !f.isInWaterMemory,
  );
  b.add(
    'swim',
    [
      [0, lookAtPlayerSometimes<Frog>(6, 30, 60)],
      [1, followTemptation<Frog>(() => 1.25)],
      [2, startAttacking()],
      [3, tryFindLand(8, 1.5)],
      [
        5,
        new GateBehavior<Frog>(
          [
            [swimStroll<Frog>(0.75), 1],
            [randomStroll<Frog>(1, true), 1],
            [setWalkTargetFromLookTarget<Frog>(() => true, () => 1, 3), 1],
            [oneShot<Frog>((f) => f.inWater), 5],
          ],
          { entry: (f) => f.walkTarget === null, shuffle: false, tryAll: true },
        ),
      ],
    ],
    (f) => !f.longJumpMidJump && f.isInWaterMemory,
  );
  b.add(
    'lay_spawn',
    [
      [0, lookAtPlayerSometimes<Frog>(6, 30, 60)],
      [1, startAttacking()],
      [2, tryFindLandNearWater(8, 1)],
      [3, tryLaySpawnOnWaterNearLand()],
      [
        4,
        runOne<Frog>([[randomStroll<Frog>(1), 2], [setWalkTargetFromLookTarget<Frog>(() => true, () => 1, 3), 1], [croak(), 2], [oneShot<Frog>((f) => f.onGround), 1]]),
      ],
    ],
    (f) => !f.longJumpMidJump && f.isPregnant,
  );
  b.add(
    'long_jump',
    [
      [0, longJumpMidJump<Frog>(TIME_BETWEEN_LONG_JUMPS, () => 'entity.frog.step')],
      [
        1,
        longJumpToRandomPos<Frog>({
          between: TIME_BETWEEN_LONG_JUMPS,
          maxHeight: 2,
          maxWidth: 4,
          velocity: 3.5714288,
          sound: () => 'entity.frog.long_jump',
          preferred: { on: (n) => FROG_PREFER_JUMP_TO.has(n), chance: 0.5 },
          acceptable: isAcceptableLandingSpot,
        }),
      ],
    ],
    (f) => !f.temptingPlayer && !f.breedTarget && f.longJumpCooldown < 0 && !f.isInWaterMemory,
  );
  // (vanilla addActivityAndRemoveMemoryWhenStopped: its target forgotten when it leaves off, which it does only once
  // the target is gone anyway)
  b.add('tongue', [[0, stopAttackingIfTargetInvalid()], [1, shootTongue()]], (f) => f.attackTarget !== null);
  return b;
}

// ---------------------------------------------------------------------------
// the controls and the way it finds its way

/** vanilla Frog.FrogLookControl: its head keeps the tilt it looked at something with while its tongue's out for it */
class FrogLookControl extends LookControl {
  constructor(readonly frog: Frog) {
    super(frog);
  }
  protected override resetXRotOnTick(): boolean {
    return this.frog.tongueTarget === null;
  }
}

/**
 * vanilla Frog.FrogNodeEvaluator: amphibious (keeping to shallow water), the cell over a lily pad or big dripleaf
 * open ground; in the water it starts from the corner of its feet
 */
class FrogNodeEvaluator extends AmphibiousNodeEvaluator {
  override getStart(): Node | null {
    if (!this.mob.inWater) return super.getStart();
    const bb = this.mob.bb;
    return this.startNode(Math.floor(bb.minX), Math.floor(bb.minY), Math.floor(bb.minZ));
  }
  override staticType(x: number, y: number, z: number): PathType {
    return FROG_PREFER_JUMP_TO.has(BLOCKS[STATE_BLOCK[this.world.getState(x, y - 1, z)]].name) ? PathType.OPEN : super.staticType(x, y, z);
  }
}

/** vanilla Frog.FrogPathNavigation: amphibious, its own evaluator, and no cutting corners along the water's edge */
class FrogPathNavigation extends AmphibiousPathNavigation {
  private readonly frogNodes = new FrogNodeEvaluator(true);
  constructor(mob: Mob) {
    super(mob, true);
    this.frogNodes.canPassDoors = true;
  }
  protected override pathEvaluator(): NodeEvaluator {
    return this.frogNodes;
  }
  protected override canCutCorner(t: PathType): boolean {
    return t !== PathType.WATER_BORDER && super.canCutCorner(t);
  }
}

// ---------------------------------------------------------------------------

export class Frog extends Animal {
  readonly type = 'frog';
  protected adultWidth = 0.5;
  protected adultHeight = 0.5;
  /** vanilla DATA_VARIANT_ID */
  variant: FrogVariant = 'temperate';
  /** vanilla Pose */
  pose: FrogPose = 'standing';
  /** vanilla DATA_TONGUE_TARGET_ID: what its tongue's out for */
  tongueTarget: LivingEntity | null = null;
  /**
   * vanilla jumpAnimationState, croakAnimationState, tongueAnimationState and swimIdleAnimationState: the tick each
   * started, -1 while it's stopped (render/frogRenderer.ts plays them)
   */
  jumpAnimStart = -1;
  croakAnimStart = -1;
  tongueAnimStart = -1;
  swimIdleAnimStart = -1;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  /** (no NEAREST_VISIBLE_ADULT sensor: a frog is never young) */
  nearestVisibleAdult: Animal | null = null;
  hurtBy: string | null = null;
  hurtByEntity: LivingEntity | null = null;
  temptingPlayer: Player | null = null;
  temptationCooldown = -1;
  isTempted = false;
  breedTarget: Animal | null = null;
  isPanicking = false;
  longJumpCooldown = -1;
  longJumpMidJump = false;
  attackTarget: LivingEntity | null = null;
  /** NEAREST_ATTACKABLE (FrogAttackablesSensor) */
  nearestAttackable: LivingEntity | null = null;
  /** UNREACHABLE_TONGUE_TARGETS (their UUIDs), and the ticks it has left to keep them in mind */
  unreachableTongueTargets: string[] = [];
  unreachableTtl = -1;
  /** IS_IN_WATER (IsInWaterSensor: once a second) */
  isInWaterMemory = false;
  /** IS_PREGNANT: carrying spawn */
  isPregnant = false;

  private readonly brain = makeBrain();
  /** vanilla Sensor timing, for its sensors (nearest living, hurt by, frog attackables, frog temptations, is in water) */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(0.5, 0.5);
    // vanilla Frog.createAttributes: 10 health, speed 1, 10 attack damage, a full block's step
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 1;
    this.attackDamage = 10;
    this.stepHeight = 1;
    this.setPathfindingMalus(PathType.WATER, 4);
    this.setPathfindingMalus(PathType.TRAPDOOR, -1);
    this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02, 0.1, true);
    (this as { lookControl: LookControl }).lookControl = new FrogLookControl(this);
    this.sensors = new SensorClock(this.random, 5);
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  protected override createNavigation(): PathNavigation {
    return new FrogPathNavigation(this);
  }

  /** vanilla #frog_food */
  isFood(s: ItemStack): boolean {
    return s.item.id === 'slime_ball';
  }

  /** vanilla Frog.isBaby: never (and setBaby does nothing) */
  override isBaby(): boolean {
    return false;
  }

  override headRotSpeed(): number {
    return 35;
  }
  override maxHeadYRot(): number {
    return 5;
  }
  override canBreatheUnderwater(): boolean {
    return true;
  }
  override isPushedByFluid(): boolean {
    return false;
  }
  protected override fallDamageReduction(): number {
    return FALL_DAMAGE_REDUCTION;
  }

  /** vanilla setPose: its jump, croak and tongue animations start (and stop) with the pose */
  setPose(p: FrogPose): void {
    if (this.pose === p) return;
    this.pose = p;
    this.jumpAnimStart = p === 'long_jumping' ? this.tickCount : -1;
    this.croakAnimStart = p === 'croaking' ? this.tickCount : -1;
    this.tongueAnimStart = p === 'using_tongue' ? this.tickCount : -1;
  }

  /** vanilla setPose(LONG_JUMPING) / setPose(STANDING) (a frog's size is the same either way) */
  setLongJumping(on: boolean): void {
    this.setPose(on ? 'long_jumping' : 'standing');
  }
  longJumpSize(): [number, number] {
    return [0.5, 0.5];
  }

  /** vanilla ShootTongue.addUnreachableTargetToMemory: five at most (the oldest let go), all forgotten five seconds on */
  addUnreachableTongueTarget(t: LivingEntity): void {
    const l = this.unreachableTongueTargets;
    const fresh = !l.includes(t.uuid);
    if (l.length === MAX_UNREACHABLE && fresh) l.shift();
    if (fresh) l.push(t.uuid);
    this.unreachableTtl = UNREACHABLE_COOLDOWN;
  }

  /** vanilla Frog.travel: in the water it swims along its heading, slowed by a tenth a tick */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(this.speed, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
    } else super.travel(sx, sy, sz);
  }

  /** vanilla Frog.updateWalkAnimation: its legs keep up with even its slow walk (25 times the pace), and are still mid-leap */
  protected override updateWalkAnimation(): void {
    const dist = Math.sqrt((this.x - this.xo) ** 2 + (this.z - this.zo) ** 2);
    const f = this.jumpAnimStart >= 0 ? 0 : Math.min(dist * 25, 1);
    this.walkAnimSpeedO = this.walkAnimSpeed;
    this.walkAnimSpeed += (f - this.walkAnimSpeed) * 0.4;
    this.walkAnimPos += this.walkAnimSpeed;
  }

  /** vanilla Frog.tick: its idle paddle plays while it floats still in the water */
  override tick(): void {
    if (this.inWater && this.walkAnimSpeed <= 1e-5) {
      if (this.swimIdleAnimStart < 0) this.swimIdleAnimStart = this.tickCount;
    } else this.swimIdleAnimStart = -1;
    super.tick();
  }

  // --- the brain ------------------------------------------------------------

  activity(): Activity | null {
    return this.brain.activeNonCore();
  }

  /** vanilla FrogAttackablesSensor: the nearest it sees that it may attack and eat, within ten, not one it gave up on */
  private senseAttackables(): void {
    this.nearestAttackable =
      this.visibleLiving.find(
        (e) => isEntityTargetable(this, e, true) && canEat(e) && !this.unreachableTongueTargets.includes(e.uuid) && e.distanceToSqr(this.x, this.y, this.z) < 100,
      ) ?? null;
  }

  /** vanilla Brain.tick: its memories that run out (the tongue targets it gave up on), then each sensor once a second */
  private sense(): void {
    if (this.unreachableTtl >= 0) {
      if (this.unreachableTtl <= 0) {
        this.unreachableTongueTargets = [];
        this.unreachableTtl = -1;
      } else this.unreachableTtl--;
    }
    const c = this.sensors;
    if (c.due(0)) senseNearestLiving(this);
    if (c.due(1)) senseHurtBy(this);
    if (c.due(2)) this.senseAttackables();
    if (c.due(3)) senseTempting(this, (s) => this.isFood(s));
    if (c.due(4)) this.isInWaterMemory = this.inWater;
  }

  /** vanilla Frog.customServerAiStep: its brain, then the first of tongue, lay spawn, long jump, swim and idle that may be */
  protected override customServerAiStep(): void {
    this.sense();
    this.brain.tick(this, this.level.gameTime);
    this.brain.setActiveActivityToFirstValid(['tongue', 'lay_spawn', 'long_jump', 'swim', 'idle'], this);
    super.customServerAiStep();
  }

  // --- spawning, breeding ----------------------------------------------------

  /** vanilla Frog.finalizeSpawn: its kind by its biome, and a long jump a while off */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const [x, y, z] = blockOf(this);
    this.variant = frogVariantFor(BIOMES[this.level.world.getBiome3(x, y, z)]?.name ?? '');
    initMemories(this, this.level.random);
    super.finalizeSpawn(reason, group);
  }

  /**
   * vanilla getBreedOffspring makes a frog, but SpawnEggItem.spawnOffspringFromSpawnEgg turns down one that isn't
   * young, which a frog never is: an egg used on a frog makes nothing (and a pair of them lay spawn instead)
   */
  makeBaby(): Animal | null {
    return null;
  }

  /**
   * vanilla Frog.spawnChildFromBreeding (finalizeSpawnChildFromBreeding with no young): the pair rest five minutes
   * and there's experience, and the one whose breeding it was carries spawn
   */
  override spawnChildFromBreeding(partner: Animal): void {
    const cause = this.loveCause ?? partner.loveCause;
    // (the breeding advancements count a frog's pair, there being no young)
    this.level.onBred?.(this, cause ?? null);
    this.setAge(6000);
    partner.setAge(6000);
    this.inLove = 0;
    partner.inLove = 0;
    if (this.level.gameRules.doMobLoot) this.level.awardExperience(this.x, this.y, this.z, this.random.nextInt(7) + 1);
    this.isPregnant = true;
  }

  /** vanilla Frog.checkFrogSpawnRules: on #frogs_spawnable_on, in the light */
  static checkFrogSpawnRules(level: Level, x: number, y: number, z: number): boolean {
    return FROGS_SPAWNABLE_ON.has(BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name) && level.rawBrightness(x, y, z, 0) > 8;
  }

  // --- sounds -----------------------------------------------------------------

  override ambientSound(): string {
    return 'entity.frog.ambient';
  }
  override hurtSound(): string {
    return 'entity.frog.hurt';
  }
  override deathSound(): string {
    return 'entity.frog.death';
  }
  override stepSound(): string {
    return 'entity.frog.step';
  }

  // --- saving -------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return {
      ...super.saveData(),
      variant: `minecraft:${this.variant}`,
      // (its brain's memories that vanilla keeps)
      LongJumpCooldown: this.longJumpCooldown,
      TemptationCooldown: this.temptationCooldown,
      IsPregnant: this.isPregnant,
    };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const v = typeof d.variant === 'string' ? d.variant.replace(/^minecraft:/, '') : '';
    if ((FROG_VARIANTS as readonly string[]).includes(v)) this.variant = v as FrogVariant;
    if (typeof d.LongJumpCooldown === 'number') this.longJumpCooldown = d.LongJumpCooldown;
    if (typeof d.TemptationCooldown === 'number') this.temptationCooldown = d.TemptationCooldown;
    this.isPregnant = d.IsPregnant === true;
  }
}
