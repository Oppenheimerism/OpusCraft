// The villager (vanilla Villager, AbstractVillager, VillagerData and VillagerGoalPackages): the people of the
// villages. Each wears its biome's clothes and takes up the profession of the first free workstation it reaches;
// it claims a bed as its home and the village bell as its meeting point. Its day follows a schedule: work at its
// workstation (restocking up to twice a day), gather by the bell in the afternoon, wander, and sleep in its bed at
// night. A zombie or illager close by, or a hit, sends it running. Players trade with it; trades earn it
// experience, and each of its five levels brings two more offers. Babies play instead of working.
//
// Vanilla runs this on a Brain; the port keeps its shape (ai/brain.ts): the memories below, sensors once a second,
// and VillagerGoalPackages' behaviours under the core activity and the current one.

import { AgeableMob } from './animals';
import type { Mob, MobCategory, SpawnGroup, SpawnReason } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import { defaultRandomPosTowards, landRandomPos, landRandomPosAway } from './ai/goals';
import type { Node, Path } from './ai/pathfinder';
import { Behavior, Brain, GateBehavior, doNothing, oneShot, runOne, triggerOneShuffled, type BehaviorControl } from './ai/brain';
import { MerchantOffer, VILLAGER_TRADES, addOffersFromListings, type SavedOffer } from './trading';
import { ItemStack, saveStack, loadStack, type SavedStack } from '../item/item';
import { ItemEntity } from './itemEntity';
import { BLOCKS, STATE_BLOCK, FLAGS, F_FULL_COLLISION, F_AIR, getBlock } from '../world/block';
import { composterExtract, composterFillEffects, composterInsert } from '../game/villageBlocks';
import { performBoneMeal, boneMealParticles } from '../game/boneMeal';
import { BIOMES } from '../world/gen/biomes';
import type { PoiKind } from '../game/poi';
import { findStandUpPosition } from '../game/sleep';
import { summonGolemNear } from './ironGolem';
import { GossipContainer, type GossipEntry } from './gossip';
import { wrapDegrees } from '../core/math';

// ---------------------------------------------------------------------------
// Villager data

/** vanilla VillagerType */
export const VILLAGER_TYPES = ['desert', 'jungle', 'plains', 'savanna', 'snow', 'swamp', 'taiga'] as const;
export type VillagerType = (typeof VILLAGER_TYPES)[number];

/** vanilla VillagerProfession */
export const PROFESSIONS = [
  'none', 'armorer', 'butcher', 'cartographer', 'cleric', 'farmer', 'fisherman', 'fletcher', 'leatherworker', 'librarian', 'mason', 'nitwit',
  'shepherd', 'toolsmith', 'weaponsmith',
] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** vanilla VillagerType.BY_BIOME (anything else is plains) */
const TYPE_BY_BIOME: Record<string, VillagerType> = {
  badlands: 'desert', desert: 'desert', eroded_badlands: 'desert', wooded_badlands: 'desert',
  bamboo_jungle: 'jungle', jungle: 'jungle', sparse_jungle: 'jungle',
  savanna_plateau: 'savanna', savanna: 'savanna', windswept_savanna: 'savanna',
  deep_frozen_ocean: 'snow', frozen_ocean: 'snow', frozen_river: 'snow', ice_spikes: 'snow', snowy_beach: 'snow', snowy_taiga: 'snow', snowy_plains: 'snow',
  grove: 'snow', snowy_slopes: 'snow', frozen_peaks: 'snow', jagged_peaks: 'snow',
  swamp: 'swamp', mangrove_swamp: 'swamp',
  old_growth_spruce_taiga: 'taiga', old_growth_pine_taiga: 'taiga', windswept_gravelly_hills: 'taiga', windswept_hills: 'taiga', taiga: 'taiga',
  windswept_forest: 'taiga',
};

/** vanilla VillagerType.byBiome */
export function villagerTypeAt(level: Level, x: number, y: number, z: number): VillagerType {
  const b = BIOMES[level.world.getBiome3(Math.floor(x), Math.floor(y), Math.floor(z))];
  return TYPE_BY_BIOME[b?.name ?? ''] ?? 'plains';
}

/** vanilla VillagerData.NEXT_LEVEL_XP_THRESHOLDS */
const LEVEL_XP = [0, 10, 70, 150, 250];
/** vanilla VillagerData.canLevelUp */
export const canLevelUp = (l: number): boolean => l >= 1 && l < 5;
/** vanilla VillagerData.getMinXpPerLevel / getMaxXpPerLevel: the experience bar's ends at a level */
export const minXpPerLevel = (l: number): number => (canLevelUp(l) ? LEVEL_XP[l - 1] : 0);
export const maxXpPerLevel = (l: number): number => (canLevelUp(l) ? LEVEL_XP[l] : 0);
/** vanilla merchant.level.<n> */
export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];

/** the job sites (vanilla PoiTypes of the professions' heldJobSite) */
const JOB_KINDS = new Set<PoiKind>(['armorer', 'butcher', 'cartographer', 'cleric', 'farmer', 'fisherman', 'fletcher', 'leatherworker', 'librarian', 'mason', 'shepherd', 'toolsmith', 'weaponsmith']);

/** vanilla VillagerProfession.heldJobSite: its own workstation */
const heldJobSite = (p: Profession) => (k: PoiKind): boolean => k === p;
/** vanilla VillagerProfession.acquirableJobSite: any workstation while jobless, none for a nitwit */
const acquirableJobSite = (p: Profession) => (k: PoiKind): boolean => (p === 'none' ? JOB_KINDS.has(k) : p !== 'nitwit' && k === p);

/** vanilla Villager.FOOD_POINTS: what it eats, and how filling each is */
const FOOD_POINTS: Record<string, number> = { bread: 4, potato: 1, carrot: 1, beetroot: 1 };
const FOOD_ITEMS: ReadonlySet<string> = new Set(Object.keys(FOOD_POINTS));
/** vanilla Villager.WANTED_ITEMS: what any villager picks up */
const WANTED_ITEMS: ReadonlySet<string> = new Set(['bread', 'potato', 'carrot', 'wheat', 'wheat_seeds', 'beetroot', 'beetroot_seeds', 'torchflower_seeds', 'pitcher_pod']);
/** vanilla VillagerProfession.requestedItems: what a farmer wants on top */
const REQUESTED_ITEMS: Partial<Record<Profession, ReadonlySet<string>>> = { farmer: new Set(['wheat', 'wheat_seeds', 'beetroot_seeds', 'bone_meal']) };
const NOTHING: ReadonlySet<string> = new Set();
const WHEAT: ReadonlySet<string> = new Set(['wheat']);

// ---------------------------------------------------------------------------
// Brain types

type Pos = [number, number, number];

// (Stage 4: raids) pre_raid and raid (game/raidVillagers.ts)
export type VillagerActivity = 'core' | 'idle' | 'work' | 'meet' | 'rest' | 'play' | 'panic' | 'hide' | 'pre_raid' | 'raid';

/** vanilla WalkTarget: a spot, or an entity (EntityTracker), to come within `closeEnough` of (Manhattan blocks) */
interface WalkTarget {
  x: number;
  y: number;
  z: number;
  entity: Entity | null;
  speed: number;
  closeEnough: number;
}

/** vanilla PositionTracker as a look target: an entity (at its eyes, or its feet) or the middle of a block */
type LookTarget = { e: Entity; eyes: boolean } | Pos;

/** vanilla MemoryModuleType values a villager keeps (null: absent) */
export interface VillagerMemories {
  home: Pos | null;
  jobSite: Pos | null;
  potentialJobSite: Pos | null;
  meetingPoint: Pos | null;
  walkTarget: WalkTarget | null;
  lookTarget: LookTarget | null;
  interactionTarget: LivingEntity | null;
  /** PATH: the one MoveToTargetSink follows */
  path: Path | null;
  cantReachWalkTargetSince: number | null;
  lastSlept: number | null;
  lastWoken: number | null;
  lastWorkedAtPoi: number | null;
  /** HURT_BY: hurt in the last two seconds, when the sensor last looked */
  hurtBy: boolean;
  hurtByEntity: LivingEntity | null;
  nearestHostile: LivingEntity | null;
  doorsToClose: Pos[] | null;
  /** NEAREST_LIVING_ENTITIES and NEAREST_VISIBLE_LIVING_ENTITIES, nearest first */
  nearestLiving: LivingEntity[];
  visibleLiving: LivingEntity[];
  /** VISIBLE_VILLAGER_BABIES (never empty: an empty list is no memory) */
  visibleBabies: Villager[] | null;
  /** NEAREST_VISIBLE_WANTED_ITEM: food or seeds lying where it can see them */
  wantedItem: ItemEntity | null;
  /** BREED_TARGET: the villager it's courting */
  breedTarget: Villager | null;
  /** NEAREST_BED: a baby's nearest bed it can walk to (to bounce on) */
  nearestBed: Pos | null;
  /** SECONDARY_JOB_SITE: a farmer's farmland about it */
  secondaryJobSite: Pos[] | null;
  /** HIDING_PLACE: the bed it runs to when the bell rings */
  hidingPlace: Pos | null;
}

/** vanilla Schedule.VILLAGER_DEFAULT and VILLAGER_BABY: [time of day, activity from then] */
const DEFAULT_SCHEDULE: [number, VillagerActivity][] = [[10, 'idle'], [2000, 'work'], [9000, 'meet'], [11000, 'idle'], [12000, 'rest']];
const BABY_SCHEDULE: [number, VillagerActivity][] = [[10, 'idle'], [3000, 'play'], [6000, 'idle'], [10000, 'play'], [12000, 'rest']];

/** vanilla Schedule.getActivityAt: the last change at or before the time of day (before the first, the day's last) */
function scheduledActivity(s: [number, VillagerActivity][], dayTime: number): VillagerActivity {
  const t = ((dayTime % 24000) + 24000) % 24000;
  let a = s[s.length - 1][1];
  for (const [at, act] of s) if (at <= t) a = act;
  return a;
}

/** vanilla VillagerHostilesSensor.ACCEPTABLE_DISTANCE_FROM_HOSTILES */
const HOSTILE_DISTANCE: Record<string, number> = {
  drowned: 8, evoker: 12, husk: 8, illusioner: 12, pillager: 15, ravager: 12, vex: 8, vindicator: 10, zoglin: 10, zombie: 8, zombie_villager: 8,
};

/** vanilla VillagerGoalPackages' speed modifier (on the villager's 0.5 speed) and the slower stroll */
const SPEED = 0.5;
const STROLL = 0.4;
const SENSE_RANGE = 16;

// ---------------------------------------------------------------------------
// helpers (vanilla BehaviorUtils and friends)

const blk = (st: number) => BLOCKS[STATE_BLOCK[st]];
const blockPos = (e: Entity): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
const manhattan = (a: Pos, b: Pos): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
/** vanilla BlockPos.closerToCenterThan */
const closerToCenter = (p: Pos, e: Entity, d: number): boolean => (p[0] + 0.5 - e.x) ** 2 + (p[1] + 0.5 - e.y) ** 2 + (p[2] + 0.5 - e.z) ** 2 < d * d;
const samePos = (a: Pos | null, b: { x: number; y: number; z: number } | null): boolean => !!a && !!b && a[0] === b.x && a[1] === b.y && a[2] === b.z;
const key = (p: Pos): string => p.join(',');

const walkTo = (p: Pos, speed: number, closeEnough: number): WalkTarget => ({ x: p[0] + 0.5, y: p[1], z: p[2] + 0.5, entity: null, speed, closeEnough });
const walkAfter = (e: Entity, speed: number, closeEnough: number): WalkTarget => ({ x: e.x, y: e.y, z: e.z, entity: e, speed, closeEnough });

/** vanilla PoiManager.sectionsToVillage over the village centres known: Chebyshev, 7 when further than 6 */
function sectionsTo(sections: readonly Pos[], sx: number, sy: number, sz: number): number {
  let best = 7;
  for (const [x, y, z] of sections) best = Math.min(best, Math.max(Math.abs(x - sx), Math.abs(y - sy), Math.abs(z - sz)));
  return best;
}

/** vanilla WalkTarget.getTarget().currentBlockPosition() */
function walkTargetBlock(w: WalkTarget): Pos {
  if (w.entity) [w.x, w.y, w.z] = [w.entity.x, w.entity.y, w.entity.z];
  return [Math.floor(w.x), Math.floor(w.y), Math.floor(w.z)];
}

/** vanilla BehaviorUtils.setWalkAndLookTargetMemories (for a block) */
function setWalkAndLook(v: Villager, p: Pos, speed: number, closeEnough: number): void {
  v.mem.walkTarget = walkTo(p, speed, closeEnough);
  v.mem.lookTarget = [p[0], p[1], p[2]];
}

/** vanilla PositionTracker.isVisibleBy: a living entity must be alive and among those the villager sees */
function lookTargetVisible(v: Villager, t: LookTarget): boolean {
  if (Array.isArray(t)) return true;
  if (t.e instanceof LivingEntity) return t.e.isAlive && !t.e.removed && v.mem.visibleLiving.includes(t.e);
  return !t.e.removed;
}

const isMobDoor = (st: number): boolean => {
  const n = blk(st).name;
  return n.endsWith('_door') && n !== 'iron_door';
};

/** vanilla BlockSetType door sounds (as game/redstone/components' openSound) */
function doorSound(name: string, open: boolean): string {
  const wood = /^(crimson|warped)_/.test(name) ? 'nether_wood' : name.startsWith('cherry_') ? 'cherry_wood' : 'wooden';
  return `block.${wood}_door.${open ? 'open' : 'close'}`;
}

/** vanilla DoorBlock.setOpen (the other half follows by its shape update) */
function setDoorOpen(v: Villager, p: Pos, open: boolean): void {
  const st = v.level.world.getState(p[0], p[1], p[2]), b = blk(st);
  if (!b.name.endsWith('_door') || b.get(st, 'open') === open) return;
  v.level.setBlock(p[0], p[1], p[2], b.with(st, 'open', open), 2);
  v.level.sound.play(doorSound(b.name, open), p[0] + 0.5, p[1] + 0.5, p[2] + 0.5, 1, v.random.nextFloat() * 0.1 + 0.9);
}

// ---------------------------------------------------------------------------
// Core behaviours

/** vanilla Swim(0.8) */
function swim(): BehaviorControl<Villager> {
  const should = (v: Villager) => (v.inWater && v.fluidHeightWater > (v.eyeHeight < 0.4 ? 0 : 0.4)) || v.inLava;
  return new Behavior<Villager>({
    canStart: should,
    canStillUse: should,
    tick: (v) => {
      if (v.random.nextFloat() < 0.8) v.jumpControl.jump();
    },
  });
}

/**
 * vanilla InteractWithDoor: opens the wooden doors on the path's last and next nodes and remembers them, and shuts
 * those it has gone through once it's clear of them (not with another villager on the way through). It looks again
 * only once it has been on a node a moment: in vanilla they bump into a door before they open it
 */
function interactWithDoor(): BehaviorControl<Villager> {
  let lastNode: Node | null = null;
  let cooldown = 0;
  return oneShot<Villager>((v) => {
    const path = v.mem.path;
    if (!path || path.notStarted() || path.isDone()) return false;
    const next = path.nextNode;
    if (lastNode && next && lastNode.x === next.x && lastNode.y === next.y && lastNode.z === next.z) cooldown = 20;
    else if (--cooldown > 0) return false;
    lastNode = next;
    const prev = path.previousNode!;
    const w = v.level.world;
    const a: Pos = [prev.x, prev.y, prev.z];
    if (isMobDoor(w.getState(a[0], a[1], a[2]))) {
      setDoorOpen(v, a, true);
      rememberDoor(v, a);
    }
    const b: Pos = [next.x, next.y, next.z];
    const st = w.getState(b[0], b[1], b[2]);
    if (isMobDoor(st) && !blk(st).get(st, 'open')) {
      setDoorOpen(v, b, true);
      rememberDoor(v, b);
    }
    if (v.mem.doorsToClose) closeDoorsPassed(v, prev, next);
    return true;
  });
}

function rememberDoor(v: Villager, p: Pos): void {
  const d = (v.mem.doorsToClose ??= []);
  if (!d.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2])) d.push(p);
}

/** vanilla InteractWithDoor.closeDoorsThatIHaveOpenedOrPassedThrough */
function closeDoorsPassed(v: Villager, prev: Node | null, next: Node | null): void {
  const doors = v.mem.doorsToClose;
  if (!doors) return;
  const w = v.level.world;
  for (let i = doors.length - 1; i >= 0; i--) {
    const p = doors[i];
    if (samePos(p, prev) || samePos(p, next)) continue;
    doors.splice(i, 1);
    // (too far to bother, gone, or already shut: forgotten)
    if (!closerToCenter(p, v, 3)) continue;
    const st = w.getState(p[0], p[1], p[2]);
    if (!isMobDoor(st) || !blk(st).get(st, 'open')) continue;
    if (othersComingThroughDoor(v, p)) continue;
    setDoorOpen(v, p, false);
  }
  if (!doors.length) v.mem.doorsToClose = null;
}

/** vanilla areOtherMobsComingThroughDoor: another villager within 2 whose path goes through the door now */
function othersComingThroughDoor(v: Villager, p: Pos): boolean {
  return v.mem.nearestLiving.some((e) => {
    if (!(e instanceof Villager) || (p[0] + 0.5 - e.x) ** 2 + (p[1] + 0.5 - e.y) ** 2 + (p[2] + 0.5 - e.z) ** 2 >= 4) return false;
    const path = e.mem.path;
    if (!path || path.isDone()) return false;
    const a = path.previousNode;
    return !!a && (samePos(p, a) || samePos(p, path.nextNode));
  });
}

/** vanilla LookAtTargetSink(45, 90): eyes on the look target while it's seen, then forget it */
function lookAtTargetSink(): BehaviorControl<Villager> {
  return new Behavior<Villager>({
    min: 45,
    max: 90,
    canStart: (v) => !!v.mem.lookTarget,
    canStillUse: (v) => !!v.mem.lookTarget && lookTargetVisible(v, v.mem.lookTarget),
    tick: (v) => {
      const t = v.mem.lookTarget;
      if (!t) return;
      if (Array.isArray(t)) v.lookControl.setLookAt(t[0] + 0.5, t[1] + 0.5, t[2] + 0.5);
      else v.lookControl.setLookAt(t.e.x, t.e.y + (t.eyes ? t.e.eyeHeight : 0), t.e.z);
    },
    stop: (v) => {
      v.mem.lookTarget = null;
    },
  });
}

const isHurt = (v: Villager) => v.mem.hurtBy;
const hasHostile = (v: Villager) => !!v.mem.nearestHostile;

/**
 * vanilla VillagerPanicTrigger: hurt, or a hostile close by: drop what it was doing and panic; and while it lasts,
 * every 5 seconds, call for a golem if three want one
 */
function panicTrigger(): BehaviorControl<Villager> {
  return new Behavior<Villager>({
    start: (v) => {
      if (!isHurt(v) && !hasHostile(v)) return;
      if (!v.brain.isActive('panic')) {
        const m = v.mem;
        m.path = null;
        m.walkTarget = null;
        m.lookTarget = null;
        m.breedTarget = null;
        m.interactionTarget = null;
      }
      v.brain.setActiveActivityIfPossible('panic', v);
    },
    canStillUse: (v) => isHurt(v) || hasHostile(v),
    tick: (v, now) => {
      if (now % 100 === 0) v.spawnGolemIfNeeded(now, 3);
    },
  });
}

/** vanilla WakeUp: out of bed whenever it isn't resting */
function wakeUp(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.brain.isActive('rest') || !v.isSleeping()) return false;
    v.stopSleeping();
    return true;
  });
}

type PosMemory = 'home' | 'jobSite' | 'potentialJobSite' | 'meetingPoint';

/** vanilla ValidateNearbyPoi: within 16 of the remembered point, forget it if it's gone, or a bed someone else is in */
function validateNearbyPoi(mem: PosMemory, want: (v: Villager) => (k: PoiKind) => boolean): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const p = v.mem[mem];
    if (!p || !closerToCenter(p, v, 16)) return false;
    const poi = v.level.poi;
    if (!poi.exists(p[0], p[1], p[2], want(v))) v.mem[mem] = null;
    else if (bedIsOccupied(v, p)) {
      v.mem[mem] = null;
      if (!bedIsOccupiedByVillager(v, p)) poi.release(p[0], p[1], p[2], v);
    }
    return true;
  });
}

function bedIsOccupied(v: Villager, p: Pos): boolean {
  const st = v.level.world.getState(p[0], p[1], p[2]), b = blk(st);
  return b.name.endsWith('_bed') && b.get(st, 'occupied') === true && !v.isSleeping();
}

function bedIsOccupiedByVillager(v: Villager, p: Pos): boolean {
  return v.level.entities.some((e) => e instanceof Villager && !e.removed && e.isSleeping() && samePos(e.sleepingPos, { x: p[0], y: p[1], z: p[2] }));
}

/**
 * vanilla MoveToTargetSink (150-250 ticks at a time): a path to the walk target, a new one when the target has
 * moved more than two blocks; done on arriving, or when the path runs out (a stuck one waits up to 2 s to retry)
 */
function moveToTargetSink(min = 150, max = 250): BehaviorControl<Villager> {
  let path: Path | null = null;
  let lastTarget: Pos | null = null;
  let speed = 1;
  let cooldown = 0;
  const reached = (v: Villager, w: WalkTarget) => manhattan(walkTargetBlock(w), blockPos(v)) <= w.closeEnough;
  const tryComputePath = (v: Villager, w: WalkTarget, now: number): boolean => {
    const [x, y, z] = walkTargetBlock(w);
    path = v.navigation.createPath(x + 0.5, y, z + 0.5, 0);
    speed = w.speed;
    if (reached(v, w)) {
      v.mem.cantReachWalkTargetSince = null;
      return false;
    }
    if (path?.canReach()) v.mem.cantReachWalkTargetSince = null;
    else if (v.mem.cantReachWalkTargetSince === null) v.mem.cantReachWalkTargetSince = now;
    if (path) return true;
    const p = defaultRandomPosTowards(v, 10, 7, x + 0.5, z + 0.5, Math.PI / 2);
    if (!p) return false;
    path = v.navigation.createPath(p[0] + 0.5, p[1], p[2] + 0.5, 0);
    return !!path;
  };
  const start = (v: Villager) => {
    v.mem.path = path;
    v.navigation.moveToPath(path, speed);
  };
  return new Behavior<Villager>({
    min,
    max,
    canStart: (v, now) => {
      if (v.mem.path || !v.mem.walkTarget) return false;
      if (cooldown > 0) {
        cooldown--;
        return false;
      }
      const w = v.mem.walkTarget;
      const got = reached(v, w);
      if (!got && tryComputePath(v, w, now)) {
        lastTarget = walkTargetBlock(w);
        return true;
      }
      v.mem.walkTarget = null;
      if (got) v.mem.cantReachWalkTargetSince = null;
      return false;
    },
    start,
    canStillUse: (v) => {
      const w = v.mem.walkTarget;
      if (!path || !lastTarget || !w) return false;
      return !v.navigation.isDone() && !reached(v, w);
    },
    tick: (v, now) => {
      const p = v.navigation.path;
      if (path !== p) {
        path = p;
        v.mem.path = p;
      }
      const w = v.mem.walkTarget;
      if (p && lastTarget && w) {
        const t = walkTargetBlock(w);
        if ((t[0] - lastTarget[0]) ** 2 + (t[1] - lastTarget[1]) ** 2 + (t[2] - lastTarget[2]) ** 2 > 4 && tryComputePath(v, w, now)) {
          lastTarget = t;
          start(v);
        }
      }
    },
    stop: (v) => {
      const w = v.mem.walkTarget;
      if (w && !reached(v, w) && v.navigation.isStuck) cooldown = v.random.nextInt(40);
      v.navigation.stop();
      v.mem.walkTarget = null;
      v.mem.path = null;
      path = null;
    },
  });
}

/** vanilla PoiCompetitorScan: of the villagers claiming the same workstation, the most experienced keeps it */
function poiCompetitorScan(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const j = v.mem.jobSite;
    if (!j) return false;
    const k = v.level.poi.kindAt(j[0], j[1], j[2]);
    if (!k) return true;
    let winner: Villager = v;
    for (const e of v.mem.nearestLiving) {
      if (!(e instanceof Villager) || e === v || !e.isAlive) continue;
      const ej = e.mem.jobSite;
      if (!ej || ej[0] !== j[0] || ej[1] !== j[1] || ej[2] !== j[2] || !heldJobSite(e.profession)(k)) continue;
      // (vanilla selectWinner: the loser forgets the workstation)
      if (winner.xp > e.xp) e.mem.jobSite = null;
      else {
        winner.mem.jobSite = null;
        winner = e;
      }
    }
    return true;
  });
}

/** vanilla LookAndFollowTradingPlayerSink: keeps close to, and eyes on, whoever it's trading with */
function lookAndFollowTradingPlayer(): BehaviorControl<Villager> {
  const can = (v: Villager) => {
    const p = v.tradingPlayer;
    return v.isAlive && !!p && !v.inWater && v.distanceToSqr(p.x, p.y, p.z) <= 16;
  };
  const follow = (v: Villager) => {
    const p = v.tradingPlayer!;
    v.mem.walkTarget = walkAfter(p, SPEED, 2);
    v.mem.lookTarget = { e: p, eyes: true };
  };
  return new Behavior<Villager>({
    timesOut: false,
    canStart: can,
    canStillUse: can,
    start: follow,
    tick: follow,
    stop: (v) => {
      v.mem.walkTarget = null;
      v.mem.lookTarget = null;
    },
  });
}

/** vanilla AcquirePoi.JitteredLinearRetry: a point it couldn't reach is tried again later, and less often each time */
interface Retry {
  previous: number;
  next: number;
  delay: number;
}

function markAttempt(r: Retry, now: number, v: Villager): void {
  r.previous = now;
  r.delay = Math.min(r.delay + v.random.nextInt(40) + 40, 400);
  r.next = now + r.delay;
}

/**
 * vanilla AcquirePoi: every 1-2 s, of the nearest five free points of a kind within 48 (leaving out those it's
 * waiting to retry), the first it has a way to; it takes a ticket there and remembers the place (with happy sparkles
 * for a bed or the bell). Points it couldn't reach wait their turn to be tried again
 */
function acquirePoi(
  mem: PosMemory,
  absent: PosMemory[],
  want: (v: Villager) => (k: PoiKind) => boolean,
  onlyIfAdult: boolean,
  sparkle: boolean,
  poiOk: (v: Villager, p: Pos) => boolean = () => true,
): BehaviorControl<Villager> {
  let nextAt = 0;
  const retries = new Map<string, Retry>();
  return oneShot<Villager>((v, now) => {
    if (v.mem[mem] || absent.some((m) => v.mem[m])) return false;
    if (onlyIfAdult && v.isBaby()) return false;
    if (nextAt === 0) {
      nextAt = now + v.random.nextInt(20);
      return false;
    }
    if (now < nextAt) return false;
    nextAt = now + 20 + v.random.nextInt(20);
    for (const [k, r] of retries) if (now - r.previous >= 400) retries.delete(k);
    const [bx, by, bz] = blockPos(v);
    const candidates: Pos[] = [];
    for (const [x, y, z] of v.level.poi.findAll(bx, by, bz, 48, want(v), true)) {
      const r = retries.get(key([x, y, z]));
      if (r) {
        if (now < r.next) continue;
        markAttempt(r, now, v);
      }
      candidates.push([x, y, z]);
      if (candidates.length >= 5) break;
    }
    const set = candidates.filter((p) => poiOk(v, p));
    // (vanilla findPathToPois: one search for the nearest reachable; here each in turn, nearest first)
    const range = mem === 'meetingPoint' ? 6 : 1;
    let got: Pos | null = null;
    for (const p of set) {
      const path = v.navigation.createPathToBlock(p[0], p[1], p[2], range);
      if (path?.canReach()) {
        got = p;
        break;
      }
    }
    if (got && v.level.poi.take(got[0], got[1], got[2], v)) {
      v.mem[mem] = got;
      if (sparkle) v.addParticlesAroundSelf('happy_villager');
      retries.clear();
    } else {
      for (const p of set) {
        const k = key(p);
        if (!retries.has(k)) {
          const r: Retry = { previous: 0, next: 0, delay: 0 };
          markAttempt(r, now, v);
          retries.set(k, r);
        }
      }
    }
    return true;
  });
}

/** vanilla VillagerGoalPackages.validateBedPoi: a bed nobody's in */
function freeBed(v: Villager, p: Pos): boolean {
  const st = v.level.world.getState(p[0], p[1], p[2]), b = blk(st);
  return b.name.endsWith('_bed') && !b.get(st, 'occupied');
}

/** vanilla GoToPotentialJobSite: walks to the workstation it has its eye on for up to a minute, then gives up on it */
function goToPotentialJobSite(): BehaviorControl<Villager> {
  return new Behavior<Villager>({
    min: 1200,
    max: 1200,
    canStart: (v) => {
      if (!v.mem.potentialJobSite) return false;
      const a = v.brain.activeNonCore();
      return !a || a === 'idle' || a === 'work' || a === 'play';
    },
    canStillUse: (v) => !!v.mem.potentialJobSite,
    tick: (v) => setWalkAndLook(v, v.mem.potentialJobSite!, SPEED, 1),
    stop: (v) => {
      const p = v.mem.potentialJobSite;
      if (p) v.level.poi.release(p[0], p[1], p[2], v);
      v.mem.potentialJobSite = null;
    },
  });
}

/**
 * vanilla AssignProfessionFromJobSite: within two blocks of it (or at once, for a villager a village was built
 * with), the workstation becomes its job site, and a jobless villager takes up its profession
 */
function assignProfessionFromJobSite(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const p = v.mem.potentialJobSite;
    if (!p) return false;
    if (!closerToCenter(p, v, 2) && !v.assignProfessionWhenSpawned) return false;
    v.mem.potentialJobSite = null;
    v.mem.jobSite = p;
    v.addParticlesAroundSelf('happy_villager');
    if (v.profession !== 'none') return true;
    const k = v.level.poi.kindAt(p[0], p[1], p[2]);
    if (k && JOB_KINDS.has(k)) {
      v.setProfession(k as Profession);
      v.refreshBrain();
    }
    return true;
  });
}

/** vanilla ResetProfession: without a job site, a villager nobody has traded with yet forgets its profession */
function resetProfession(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.jobSite) return false;
    if (v.profession === 'none' || v.profession === 'nitwit' || v.xp !== 0 || v.merchantLevel > 1) return false;
    v.setProfession('none');
    v.refreshBrain();
    return true;
  });
}

// ---------------------------------------------------------------------------
// Activity behaviours

/** vanilla SetEntityLookTarget: with nothing to look at, the nearest seen within `range` that fits */
function lookAtNearest(pred: (e: LivingEntity) => boolean, range: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.lookTarget) return false;
    const e = v.mem.visibleLiving.find((e) => pred(e) && e.distanceToSqr(v.x, v.y, v.z) <= range * range);
    if (!e) return false;
    v.mem.lookTarget = { e, eyes: true };
    return true;
  });
}

const isType = (t: string) => (e: LivingEntity): boolean => e.type === t;
const inCategory = (c: MobCategory) => (e: LivingEntity): boolean => (e as { category?: MobCategory }).category === c;

/** vanilla getMinimalLookBehavior */
function minimalLook(): BehaviorControl<Villager> {
  return runOne<Villager>([
    [lookAtNearest(isType('villager'), 8), 2],
    [lookAtNearest(isType('player'), 8), 2],
    [doNothing(30, 60), 8],
  ]);
}

/** vanilla getFullLookBehavior (cats and the water mobs this game doesn't have yet never turn up) */
function fullLook(): BehaviorControl<Villager> {
  return runOne<Villager>([
    [lookAtNearest(isType('cat'), 8), 8],
    [lookAtNearest(isType('villager'), 8), 2],
    [lookAtNearest(isType('player'), 8), 2],
    [lookAtNearest(inCategory('creature'), 8), 1],
    [lookAtNearest(inCategory('water_creature'), 8), 1],
    [lookAtNearest(inCategory('monster'), 8), 1],
    [doNothing(30, 60), 2],
  ]);
}

/** vanilla UpdateActivityFromSchedule */
function updateActivityFromSchedule(): BehaviorControl<Villager> {
  return oneShot<Villager>((v, now) => {
    v.updateActivityFromSchedule(now);
    return true;
  });
}

/**
 * vanilla SetWalkTargetFromBlockMemory: more than `closeEnough` from the place, head there (over `tooFar`, a step
 * its way); a place it hasn't been able to reach for `tooLong` ticks it lets go of
 */
function setWalkTargetFromBlockMemory(mem: PosMemory, speed: number, closeEnough: number, tooFar: number, tooLong: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v, now) => {
    const p = v.mem[mem];
    if (v.mem.walkTarget || !p) return false;
    const cant = v.mem.cantReachWalkTargetSince;
    const giveUp = () => {
      v.releasePoi(mem);
      v.mem.cantReachWalkTargetSince = now;
    };
    if (cant !== null && now - cant > tooLong) {
      giveUp();
      return true;
    }
    const bp = blockPos(v);
    const d = manhattan(p, bp);
    if (d > tooFar) {
      let q: Pos | null = null;
      // (vanilla keeps trying a thousand times)
      for (let i = 0; i < 100 && (!q || manhattan(q, bp) > tooFar); i++) q = defaultRandomPosTowards(v, 15, 7, p[0] + 0.5, p[2] + 0.5, Math.PI / 2);
      if (!q || manhattan(q, bp) > tooFar) {
        giveUp();
        return true;
      }
      v.mem.walkTarget = walkTo(q, speed, closeEnough);
    } else if (d > closeEnough) v.mem.walkTarget = walkTo(p, speed, closeEnough);
    return true;
  });
}

/** vanilla StrollAroundPoi: near the place, a random spot about every 9 s */
function strollAroundPoi(mem: PosMemory, speed: number, maxDist: number): (v: Villager, now: number) => boolean {
  let nextAt = 0;
  return (v, now) => {
    const p = v.mem[mem];
    if (!p || !closerToCenter(p, v, maxDist)) return false;
    if (now <= nextAt) return true;
    const q = landRandomPos(v, 8, 6);
    v.mem.walkTarget = q ? walkTo(q, speed, 1) : null;
    nextAt = now + 180;
    return true;
  };
}

/** vanilla StrollToPoi: near the place, back to it every 4 s */
function strollToPoi(mem: PosMemory, speed: number, closeEnough: number, maxDist: number): BehaviorControl<Villager> {
  let nextAt = 0;
  return oneShot<Villager>((v, now) => {
    const p = v.mem[mem];
    if (!p || !closerToCenter(p, v, maxDist)) return false;
    if (now <= nextAt) return true;
    v.mem.walkTarget = walkTo(p, speed, closeEnough);
    nextAt = now + 80;
    return true;
  });
}

/**
 * vanilla WorkAtPoi: now and then (at most every 15 s), at its workstation: the work sound, what it does there
 * (`useWorkstation`: a farmer's composting and baking, vanilla WorkAtComposter), and a restock if due
 */
function workAtPoi(useWorkstation?: (v: Villager) => void): BehaviorControl<Villager> {
  let lastCheck = 0;
  const near = (v: Villager) => !!v.mem.jobSite && closerToCenter(v.mem.jobSite, v, 1.73);
  return new Behavior<Villager>({
    canStart: (v, now) => {
      if (!v.mem.jobSite || now - lastCheck < 300 || v.random.nextInt(2) !== 0) return false;
      lastCheck = now;
      return near(v);
    },
    start: (v, now) => {
      v.mem.lastWorkedAtPoi = now;
      const j = v.mem.jobSite!;
      v.mem.lookTarget = [j[0], j[1], j[2]];
      v.playWorkSound();
      useWorkstation?.(v);
      if (v.shouldRestock()) v.restock();
    },
    canStillUse: near,
  });
}

// --- the farmer's day (vanilla WorkAtComposter, StrollToPoiList, HarvestFarmland, UseBonemeal) ------------------

/** vanilla ItemTags.VILLAGER_PLANTABLE_SEEDS, and the crop each one plants */
const PLANTABLE: Record<string, string> = { wheat_seeds: 'wheat', potato: 'potatoes', carrot: 'carrots', beetroot_seeds: 'beetroots' };
/** vanilla CropBlock subclasses and their getMaxAge */
const CROP_MAX_AGE: Record<string, number> = { wheat: 7, carrots: 7, potatoes: 7, beetroots: 3 };
/** vanilla WorkAtComposter.COMPOSTABLE_ITEMS: the seeds a farmer composts what it has over ten of */
const COMPOSTED_SEEDS = ['wheat_seeds', 'beetroot_seeds'];

const isMatureCrop = (st: number): boolean => {
  const b = blk(st), max = CROP_MAX_AGE[b.name];
  return max !== undefined && b.get<number>(st, 'age') >= max;
};
const isCrop = (st: number): boolean => CROP_MAX_AGE[blk(st).name] !== undefined;

/**
 * vanilla WorkAtComposter.useWorkstation: at its composter a farmer bakes (three wheat a loaf, up to three loaves,
 * while it has no more than 36 bread), empties a ready composter and composts its seeds beyond ten of each kind
 * (at most 20 at a go)
 */
function workAtComposter(v: Villager): void {
  const j = v.mem.jobSite;
  if (!j) return;
  const level = v.level;
  const st0 = level.world.getState(j[0], j[1], j[2]);
  if (blk(st0).name !== 'composter') return;
  // makeBread
  if (v.countItem('bread') <= 36) {
    const loaves = Math.min(3, Math.floor(v.countItem('wheat') / 3));
    if (loaves > 0) {
      v.removeFromInventory('wheat', loaves * 3);
      const left = v.addToInventory(ItemStack.of('bread', loaves));
      if (left) v.spawnAtLocation(left, 0.5);
    }
  }
  // compostItems
  let st = st0;
  if (blk(st).get<number>(st, 'level') === 8) st = composterExtract(level, j[0], j[1], j[2], st);
  const before = st;
  let room = 20;
  const seen = new Array(COMPOSTED_SEEDS.length).fill(0);
  for (let i = v.inventory.length - 1; i >= 0 && room > 0; i--) {
    const s = v.inventory[i];
    if (!s) continue;
    const k = COMPOSTED_SEEDS.indexOf(s.item.id);
    if (k < 0) continue;
    const n = s.count;
    seen[k] += n;
    const put = Math.min(Math.min(seen[k] - 10, room), n);
    if (put <= 0) continue;
    room -= put;
    for (let m = 0; m < put; m++) {
      st = composterInsert(level, j[0], j[1], j[2], st, s);
      if (s.count <= 0) v.inventory[i] = null;
      if (blk(st).get<number>(st, 'level') === 7) {
        composterFillEffects(level, j[0], j[1], j[2], st, st !== before);
        return;
      }
    }
  }
  composterFillEffects(level, j[0], j[1], j[2], st, st !== before);
}

/** vanilla StrollToPoiList(SECONDARY_JOB_SITE, speed, 1, 6, JOB_SITE): within 6 of its job, off to one of its fields */
function strollToPoiList(speed: number): BehaviorControl<Villager> {
  let nextAt = 0;
  return oneShot<Villager>((v, now) => {
    const list = v.mem.secondaryJobSite, j = v.mem.jobSite;
    if (!list?.length || !j) return false;
    const p = list[v.level.random.nextInt(list.length)];
    if (!closerToCenter(j, v, 6)) return false;
    if (now > nextAt) {
      v.mem.walkTarget = walkTo(p, speed, 1);
      nextAt = now + 100;
    }
    return true;
  });
}

/**
 * vanilla HarvestFarmland: a farmer by its fields picks a spot about it (within a block) with a ripe crop or bare
 * farmland; there it harvests, then sows from its seeds, and moves on to the next (for up to 10 s of work, but
 * like any Behavior of vanilla's that doesn't say otherwise, it gives up after 3 s)
 */
function harvestFarmland(): BehaviorControl<Villager> {
  let target: Pos | null = null;
  let nextOkStart = 0;
  let worked = 0;
  let valid: Pos[] = [];
  const validPos = (v: Villager, p: Pos): boolean => {
    const w = v.level.world;
    const st = w.getState(p[0], p[1], p[2]);
    return isMatureCrop(st) || ((FLAGS[st] & F_AIR) !== 0 && blk(w.getState(p[0], p[1] - 1, p[2])).name === 'farmland');
  };
  const pick = (v: Villager): Pos | null => (valid.length ? valid[v.level.random.nextInt(valid.length)] : null);
  return new Behavior<Villager>({
    canStart: (v) => {
      if (v.mem.lookTarget || v.mem.walkTarget || !v.mem.secondaryJobSite) return false;
      if (!v.level.gameRules.mobGriefing || v.profession !== 'farmer') return false;
      valid = [];
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            const p: Pos = [Math.floor(v.x + i), Math.floor(v.y + j), Math.floor(v.z + k)];
            if (validPos(v, p)) valid.push(p);
          }
      target = pick(v);
      return target !== null;
    },
    start: (v, now) => {
      if (now > nextOkStart && target) {
        v.mem.lookTarget = [...target];
        v.mem.walkTarget = walkTo(target, 0.5, 1);
      }
    },
    canStillUse: () => worked < 200,
    tick: (v, now) => {
      if (target && !closerToCenter(target, v, 1)) return;
      if (target && now > nextOkStart) {
        const level = v.level, w = level.world;
        const [x, y, z] = target;
        const st = w.getState(x, y, z);
        const below = blk(w.getState(x, y - 1, z)).name;
        if (isMatureCrop(st)) level.destroyBlock(x, y, z, true);
        if ((FLAGS[st] & F_AIR) !== 0 && below === 'farmland' && v.hasFarmSeeds()) {
          for (let i = 0; i < v.inventory.length; i++) {
            const s = v.inventory[i];
            const crop = s && PLANTABLE[s.item.id];
            if (!s || !crop) continue;
            level.setBlock(x, y, z, getBlock(crop).defaultState);
            level.sound.play('item.crop.plant', x, y, z, 1, 1);
            if (--s.count <= 0) v.inventory[i] = null;
            break;
          }
        }
        if (isCrop(st) && !isMatureCrop(st)) {
          valid = valid.filter((p) => p !== target);
          target = pick(v);
          if (target) {
            nextOkStart = now + 20;
            v.mem.walkTarget = walkTo(target, 0.5, 1);
            v.mem.lookTarget = [...target];
          }
        }
      }
      worked++;
    },
    stop: (v, now) => {
      v.mem.lookTarget = null;
      v.mem.walkTarget = null;
      worked = 0;
      nextOkStart = now + 40;
    },
  });
}

/**
 * vanilla UseBonemeal: every half second or so (and 8 s after its last go), a villager with bone meal picks a
 * growing crop about it, holds the bone meal up and walks over; beside it, it feeds it, then the next (for up to
 * 4 s of work, but it gives up after 3)
 */
function useBonemeal(): BehaviorControl<Villager> {
  let cropPos: Pos | null = null;
  let nextCycle = 0, lastSession = 0, worked = 0;
  const pickNext = (v: Villager): Pos | null => {
    let found: Pos | null = null, n = 0;
    const bx = Math.floor(v.x), by = Math.floor(v.y), bz = Math.floor(v.z);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const st = v.level.world.getState(bx + i, by + j, bz + k);
          if (isCrop(st) && !isMatureCrop(st) && v.level.random.nextInt(++n) === 0) found = [bx + i, by + j, bz + k];
        }
    return found;
  };
  const aim = (v: Villager) => {
    if (!cropPos) return;
    v.mem.lookTarget = [...cropPos];
    v.mem.walkTarget = walkTo(cropPos, 0.5, 1);
  };
  return new Behavior<Villager>({
    canStart: (v) => {
      if (v.mem.lookTarget || v.mem.walkTarget) return false;
      if (v.tickCount % 10 !== 0 || (lastSession !== 0 && lastSession + 160 > v.tickCount)) return false;
      if (v.countItem('bone_meal') <= 0) return false;
      cropPos = pickNext(v);
      return cropPos !== null;
    },
    start: (v, now) => {
      aim(v);
      v.setItemSlot('mainhand', ItemStack.of('bone_meal'));
      nextCycle = now;
      worked = 0;
    },
    canStillUse: () => worked < 80 && cropPos !== null,
    tick: (v, now) => {
      const p = cropPos!;
      if (now < nextCycle || !closerToCenter(p, v, 1)) return;
      const i = v.inventory.findIndex((s) => s?.item.id === 'bone_meal');
      const st = v.level.world.getState(p[0], p[1], p[2]);
      if (i >= 0 && performBoneMeal(v.level, p[0], p[1], p[2], st)) {
        const s = v.inventory[i]!;
        if (--s.count <= 0) v.inventory[i] = null;
        boneMealParticles(v.level, p[0], p[1], p[2]);
        cropPos = pickNext(v);
        aim(v);
        nextCycle = now + 40;
      }
      worked++;
    },
    stop: (v) => {
      v.setItemSlot('mainhand', null);
      lastSession = v.tickCount;
    },
  });
}

// --- the bell (vanilla ReactToBell, LocateHidingPlace, SetHiddenState) --------------------------------------------

/** vanilla ReactToBell: a villager that has heard the bell goes to hide (without a raid to tell it otherwise) */
function reactToBell(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.heardBellTime === null) return false;
    // (Stage 4: raids) not while there's a raid on
    if (!villagerRaidHooks.raidHere(v)) v.brain.setActiveActivityIfPossible('hide', v);
    return true;
  });
}

/**
 * vanilla LocateHidingPlace: the bed right beside it, else any bed within `radius`, else its own is where it hides;
 * it drops whatever it was about and hurries there
 */
function locateHidingPlace(radius: number, speed: number, closeEnough: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const [bx, by, bz] = blockPos(v);
    const beds = (r: number) => v.level.poi.findAll(bx, by, bz, r, (k) => k === 'home', false);
    let p: Pos | null = null;
    const near = beds(closeEnough + 1)[0];
    if (near && closerToCenter([near[0], near[1], near[2]], v, closeEnough)) p = [near[0], near[1], near[2]];
    if (!p) {
      const all = beds(radius);
      if (all.length) {
        const q = all[v.random.nextInt(all.length)];
        p = [q[0], q[1], q[2]];
      }
    }
    p ??= v.mem.home;
    if (!p) return true;
    v.mem.path = null;
    v.mem.lookTarget = null;
    v.mem.breedTarget = null;
    v.mem.interactionTarget = null;
    v.mem.hidingPlace = p;
    if (!closerToCenter(p, v, closeEnough)) v.mem.walkTarget = walkTo(p, speed, closeEnough);
    return true;
  });
}

/**
 * vanilla SetHiddenState(15, 3): it stays hidden until it has spent 15 s by its hiding place, or 15 s have passed
 * since the bell, then forgets the bell and goes back to its day
 */
function setHiddenState(seconds: number, closeEnough: number): BehaviorControl<Villager> {
  let hidden = 0;
  return oneShot<Villager>((v, now) => {
    const place = v.mem.hidingPlace, heard = v.heardBellTime;
    if (!place || heard === null) return false;
    if (hidden <= seconds * 20 && heard + 300 > now) {
      const b = blockPos(v);
      if ((place[0] - b[0]) ** 2 + (place[1] - b[1]) ** 2 + (place[2] - b[2]) ** 2 < closeEnough * closeEnough) hidden++;
      return true;
    }
    v.heardBellTime = null;
    v.mem.hidingPlace = null;
    v.updateActivityFromSchedule(now, true);
    hidden = 0;
    return true;
  });
}

/** vanilla SetLookAndInteract(PLAYER, 4): a player within 4 becomes whom it's dealing with */
function setLookAndInteractWithPlayer(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.interactionTarget) return false;
    const p = v.mem.visibleLiving.find((e) => e.type === 'player' && e.distanceToSqr(v.x, v.y, v.z) <= 16);
    if (!p) return false;
    v.mem.interactionTarget = p;
    v.mem.lookTarget = { e: p, eyes: true };
    return true;
  });
}

/** vanilla InteractWith.of(type, 8, INTERACTION_TARGET, speed, 2): up to the nearest of a kind within 8 */
function interactWith(type: string, speed: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const vis = v.mem.visibleLiving;
    if (!vis.some(isType(type))) return false;
    const t = vis.find((e) => e.type === type && e.distanceToSqr(v.x, v.y, v.z) <= 64);
    if (t) {
      v.mem.interactionTarget = t;
      v.mem.lookTarget = { e: t, eyes: true };
      v.mem.walkTarget = walkAfter(t, speed, 2);
    }
    return true;
  });
}

/**
 * vanilla VillageBoundRandomStroll: a random spot within 10 (7 up or down) inside a village; outside one, a step
 * towards the nearest village section within two
 */
function villageBoundRandomStroll(speed: number, xz = 10, y = 7): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const poi = v.level.poi;
    const [bx, by, bz] = blockPos(v);
    let q: Pos | null;
    if (poi.isVillage(bx, by, bz)) q = landRandomPos(v, xz, y);
    else {
      // (vanilla BehaviorUtils.findSectionClosestToVillage(level, section, 2))
      const sx = bx >> 4, sy = by >> 4, sz = bz >> 4;
      const near = poi.villageSectionsNear(sx, sz, 8);
      let best = sectionsTo(near, sx, sy, sz), to: Pos | null = null;
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++)
          for (let dz = -2; dz <= 2; dz++) {
            if (!dx && !dy && !dz) continue;
            const d = sectionsTo(near, sx + dx, sy + dy, sz + dz);
            if (d < best) {
              best = d;
              to = [sx + dx, sy + dy, sz + dz];
            }
          }
      q = to ? defaultRandomPosTowards(v, xz, y, to[0] * 16 + 8, to[2] * 16 + 8, Math.PI / 2) : landRandomPos(v, xz, y);
    }
    v.mem.walkTarget = q ? walkTo(q, speed, 0) : null;
    return true;
  });
}

/** vanilla SetWalkTargetFromLookTarget(speed, closeEnough): off towards whatever it's looking at */
function walkToLookTarget(speed: number, closeEnough: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const t = v.mem.lookTarget;
    if (v.mem.walkTarget || !t) return false;
    v.mem.walkTarget = Array.isArray(t) ? walkTo(t, speed, closeEnough) : walkAfter(t.e, speed, closeEnough);
    return true;
  });
}

/** vanilla SleepInBed: at its bed at night (not just woken, the bed free), it lies down; up again when rest is over */
function sleepInBed(): BehaviorControl<Villager> {
  let nextOkStartTime = 0;
  return new Behavior<Villager>({
    timesOut: false,
    canStart: (v, now) => {
      const h = v.mem.home;
      if (!h || v.vehicle) return false;
      const lw = v.mem.lastWoken;
      if (lw !== null) {
        const i = now - lw;
        if (i > 0 && i < 100) return false;
      }
      return closerToCenter(h, v, 2) && freeBed(v, h);
    },
    canStillUse: (v) => {
      const h = v.mem.home;
      return !!h && v.brain.isActive('rest') && v.y > h[1] + 0.4 && closerToCenter(h, v, 1.14);
    },
    start: (v, now) => {
      if (now <= nextOkStartTime) return;
      if (v.mem.doorsToClose) closeDoorsPassed(v, null, null);
      v.startSleeping(v.mem.home!);
    },
    stop: (v, now) => {
      if (!v.isSleeping()) return;
      v.stopSleeping();
      nextOkStartTime = now + 40;
    },
  });
}

/** vanilla SetClosestHomeAsWalkTarget: homeless at night, off to the nearest bed within 48 it has a way to */
function setClosestHomeAsWalkTarget(speed: number): BehaviorControl<Villager> {
  let nextAt = 0;
  const tried = new Map<string, number>();
  return oneShot<Villager>((v, now) => {
    if (v.mem.walkTarget || v.mem.home || now - nextAt < 20) return false;
    const [bx, by, bz] = blockPos(v);
    const all = v.level.poi.findAll(bx, by, bz, 48, (k) => k === 'home', false);
    if (!all.length) return false;
    const [cx, cy, cz] = all[0];
    if ((cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2 <= 4) return false;
    nextAt = now + v.random.nextInt(20);
    const batch: Pos[] = [];
    for (const [x, y, z] of all) {
      const k = key([x, y, z]);
      if (tried.has(k)) continue;
      if (batch.length >= 4) break;
      tried.set(k, nextAt + 40);
      batch.push([x, y, z]);
    }
    let got: Pos | null = null;
    for (const p of batch) {
      if (v.navigation.createPathToBlock(p[0], p[1], p[2], 1)?.canReach()) {
        got = p;
        break;
      }
    }
    if (got) v.mem.walkTarget = walkTo(got, speed, 1);
    else if (batch.length < 4) for (const [k, t] of tried) if (t < nextAt) tried.delete(k);
    return true;
  });
}

/** vanilla InsideBrownianWalk: indoors, a shuffle to a spot beside it under a roof */
function insideBrownianWalk(speed: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const [bx, by, bz] = blockPos(v);
    const lvl = v.level;
    if (lvl.canSeeSky(bx, by, bz)) return false;
    const around: Pos[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) around.push([bx + dx, by + dy, bz + dz]);
    for (let i = around.length - 1; i > 0; i--) {
      const j = v.random.nextInt(i + 1);
      [around[i], around[j]] = [around[j], around[i]];
    }
    // (vanilla loadedAndEntityCanStandOn: a block with a solid top to stand on)
    const p = around.find(([x, y, z]) => !lvl.canSeeSky(x, y, z) && (FLAGS[lvl.world.getState(x, y, z)] & F_FULL_COLLISION) !== 0);
    if (p) v.mem.walkTarget = walkTo(p, speed, 0);
    return true;
  });
}

/** vanilla GoToClosestVillage: outside a village at night, a walk towards the nearest one */
function goToClosestVillage(speed: number, closeEnough: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const poi = v.level.poi;
    const [bx, by, bz] = blockPos(v);
    if (poi.isVillage(bx, by, bz)) return false;
    const here = poi.sectionsToVillage(bx >> 4, by >> 4, bz >> 4);
    let q: Pos | null = null;
    for (let j = 0; j < 5; j++) {
      const p = landRandomPos(v, 15, 7);
      if (!p) continue;
      const k = poi.sectionsToVillage(p[0] >> 4, p[1] >> 4, p[2] >> 4);
      if (k < here) {
        q = p;
        break;
      }
      if (k === here) q = p;
    }
    if (q) v.mem.walkTarget = walkTo(q, speed, closeEnough);
    return true;
  });
}

/** vanilla SocializeAtBell: by the bell, now and then off to the nearest villager within 5½ */
function socializeAtBell(v: Villager): boolean {
  const m = v.mem, p = m.meetingPoint;
  if (!p || m.interactionTarget || v.random.nextInt(100) !== 0 || !closerToCenter(p, v, 4)) return false;
  if (!m.visibleLiving.some(isType('villager'))) return false;
  const t = m.visibleLiving.find((e) => e.type === 'villager' && e.distanceToSqr(v.x, v.y, v.z) <= 32);
  if (t) {
    m.interactionTarget = t;
    m.lookTarget = { e: t, eyes: true };
    m.walkTarget = walkAfter(t, 0.3, 1);
  }
  return true;
}

/** vanilla VillagerCalmDown: nothing hurt it lately, no hostile near, the attacker 6 away: back to the schedule */
function villagerCalmDown(): BehaviorControl<Villager> {
  return oneShot<Villager>((v, now) => {
    const m = v.mem, a = m.hurtByEntity;
    const still = m.hurtBy || !!m.nearestHostile || (!!a && a.distanceToSqr(v.x, v.y, v.z) <= 36);
    if (!still) {
      m.hurtBy = false;
      m.hurtByEntity = null;
      v.updateActivityFromSchedule(now);
    }
    return true;
  });
}

/**
 * vanilla SetWalkTargetAwayFrom.entity(memory, speed, 6, false): within 6 of it, off up to 16 the other way (a walk
 * target already leading away at this speed stays)
 */
function walkAwayFrom(get: (v: Villager) => LivingEntity | null, speed: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const t = get(v);
    if (!t) return false;
    const w = v.mem.walkTarget;
    if (w) return false;
    if ((t.x - v.x) ** 2 + (t.y - v.y) ** 2 + (t.z - v.z) ** 2 >= 36) return false;
    for (let i = 0; i < 10; i++) {
      const p = landRandomPosAway(v, 16, 7, t.x, t.z);
      if (p) {
        v.mem.walkTarget = walkTo(p, speed, 0);
        break;
      }
    }
    return true;
  });
}

/**
 * vanilla PlayTagWithOtherKids: a baby now and then runs from a friend who's after it, or chases a friend (one
 * somebody's already chasing, if fewer than six are)
 */
function playTagWithOtherKids(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const kids = v.mem.visibleBabies;
    if (!kids || v.mem.walkTarget || v.random.nextInt(10) !== 0) return false;
    const chase = (k: Villager) => {
      v.mem.interactionTarget = k;
      v.mem.lookTarget = { e: k, eyes: true };
      v.mem.walkTarget = walkAfter(k, 0.6, 1);
    };
    if (!kids.some((k) => k.mem.interactionTarget === v)) {
      const chasers = new Map<LivingEntity, number>();
      for (const k of kids) {
        const t = k.mem.interactionTarget;
        if (t) chasers.set(t, (chasers.get(t) ?? 0) + 1);
      }
      const chased = [...chasers].filter(([, n]) => n > 0 && n <= 5).sort((a, b) => a[1] - b[1])[0];
      if (chased && chased[0] instanceof Villager) chase(chased[0]);
      else chase(kids[v.random.nextInt(kids.length)]);
      return true;
    }
    for (let i = 0; i < 10; i++) {
      const p = landRandomPos(v, 20, 8);
      if (p && v.level.poi.isVillage(p[0], p[1], p[2])) {
        v.mem.walkTarget = walkTo(p, 0.6, 0);
        break;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// food, family and gossip

/** vanilla GoToWantedItem.create(speed, false, 4): off to the food or seeds it saw lying close by */
function goToWantedItem(speed: number, maxDist: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const it = v.mem.wantedItem;
    if (v.mem.walkTarget || !it || it.removed || it.distanceToSqr(v.x, v.y, v.z) >= maxDist * maxDist) return false;
    v.mem.lookTarget = { e: it, eyes: true };
    v.mem.walkTarget = walkAfter(it, speed, 0);
    return true;
  });
}

/** vanilla InteractWith.of(VILLAGER, 8, AgeableMob::canBreed, AgeableMob::canBreed, BREED_TARGET, speed, 2): a mate within 8 */
function interactWithMate(speed: number): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.mem.walkTarget) return false;
    const mate = (e: LivingEntity): e is Villager => e instanceof Villager && e.canBreed();
    if (!v.canBreed() || !v.mem.visibleLiving.some(mate)) return false;
    const t = v.mem.visibleLiving.find((e) => mate(e) && e.distanceToSqr(v.x, v.y, v.z) <= 64) as Villager | undefined;
    if (t) {
      v.mem.breedTarget = t;
      v.mem.lookTarget = { e: t, eyes: true };
      v.mem.walkTarget = walkAfter(t, speed, 2);
    }
    return true;
  });
}

/** vanilla BehaviorUtils.lockGazeAndWalkToEachOther */
function lockGazeAndWalkToEachOther(a: Villager, b: Villager, speed: number, closeEnough: number): void {
  a.mem.lookTarget = { e: b, eyes: true };
  b.mem.lookTarget = { e: a, eyes: true };
  a.mem.walkTarget = walkAfter(b, speed, closeEnough);
  b.mem.walkTarget = walkAfter(a, speed, closeEnough);
}

/** vanilla BehaviorUtils.targetIsValid: the remembered villager is alive and in sight */
function validVillager(v: Villager, t: LivingEntity | null): t is Villager {
  return t instanceof Villager && t.isAlive && !t.removed && v.mem.visibleLiving.includes(t);
}

/**
 * vanilla VillagerMakeLove: two well-fed villagers court for a quarter of a minute or so, hearts now and then; then,
 * if there's a free bed they can walk to, a baby that takes it (angry faces when there isn't)
 */
function villagerMakeLove(): BehaviorControl<Villager> {
  let birth = 0;
  const possible = (v: Villager): boolean => validVillager(v, v.mem.breedTarget) && v.canBreed() && v.mem.breedTarget!.canBreed();
  return new Behavior<Villager>({
    min: 350,
    max: 350,
    canStart: possible,
    canStillUse: (v, now) => now <= birth && possible(v),
    start: (v, now) => {
      lockGazeAndWalkToEachOther(v, v.mem.breedTarget!, 0.5, 2);
      birth = now + 275 + v.random.nextInt(50);
    },
    tick: (v, now) => {
      const t = v.mem.breedTarget!;
      if (v.distanceToSqr(t.x, t.y, t.z) > 5) return;
      lockGazeAndWalkToEachOther(v, t, 0.5, 2);
      if (now >= birth) {
        v.eatAndDigestFood();
        t.eatAndDigestFood();
        tryToGiveBirth(v, t);
      } else if (v.random.nextInt(35) === 0) {
        // (vanilla entity event 12)
        t.addParticlesAroundSelf('heart');
        v.addParticlesAroundSelf('heart');
      }
    },
    stop: (v) => {
      v.mem.breedTarget = null;
    },
  });
}

/** vanilla VillagerMakeLove.tryToGiveBirth and giveBedToChild */
function tryToGiveBirth(v: Villager, partner: Villager): void {
  const bed = vacantBed(v);
  if (!bed) {
    // (vanilla entity event 13)
    partner.addParticlesAroundSelf('angry_villager');
    v.addParticlesAroundSelf('angry_villager');
    return;
  }
  const baby = v.breedOffspring(partner);
  v.setAge(6000);
  partner.setAge(6000);
  baby.setAge(-24000);
  baby.moveTo(v.x, v.y, v.z, 0, 0);
  v.level.addEntity(baby);
  baby.addParticlesAroundSelf('heart');
  // (the bed's ticket is the baby's from the start)
  if (v.level.poi.take(bed[0], bed[1], bed[2], baby)) baby.mem.home = bed;
}

/** vanilla takeVacantBed: a bed within 48 with room, that it can walk to */
function vacantBed(v: Villager): Pos | null {
  const [bx, by, bz] = blockPos(v);
  for (const [x, y, z] of v.level.poi.findAll(bx, by, bz, 48, (k) => k === 'home', true)) {
    if (v.navigation.createPathToBlock(x, y, z, 1)?.canReach()) return [x, y, z];
  }
  return null;
}

/** vanilla TradeWithVillager.figureOutWhatIAmWillingToTrade: what the other's job wants that its own doesn't */
function willingToTrade(v: Villager, other: Villager): ReadonlySet<string> {
  const theirs = REQUESTED_ITEMS[other.profession] ?? NOTHING, mine = REQUESTED_ITEMS[v.profession] ?? NOTHING;
  return new Set([...theirs].filter((id) => !mine.has(id)));
}

/**
 * vanilla TradeWithVillager: two villagers that meet swap gossip and hand over what the other needs: spare food,
 * wheat to a farmer, and whatever a farmer asks for
 */
function tradeWithVillager(): BehaviorControl<Villager> {
  let trades: ReadonlySet<string> = NOTHING;
  return new Behavior<Villager>({
    canStart: (v) => validVillager(v, v.mem.interactionTarget),
    canStillUse: (v) => validVillager(v, v.mem.interactionTarget),
    start: (v) => {
      const t = v.mem.interactionTarget as Villager;
      lockGazeAndWalkToEachOther(v, t, 0.5, 2);
      trades = willingToTrade(v, t);
    },
    tick: (v, now) => {
      const t = v.mem.interactionTarget as Villager;
      if (v.distanceToSqr(t.x, t.y, t.z) > 5) return;
      lockGazeAndWalkToEachOther(v, t, 0.5, 2);
      v.gossip(t, now);
      if (v.hasExcessFood() && (v.profession === 'farmer' || t.wantsMoreFood())) throwHalfStack(v, FOOD_ITEMS, t);
      if (t.profession === 'farmer' && v.countItem('wheat') > 32) throwHalfStack(v, WHEAT, t);
      if (trades.size && v.inventory.some((s) => !!s && trades.has(s.item.id))) throwHalfStack(v, trades, t);
    },
    stop: (v) => {
      v.mem.interactionTarget = null;
    },
  });
}

/** vanilla TradeWithVillager.throwHalfStack: half of a big stack (or all but 24 of it), tossed to the other */
function throwHalfStack(v: Villager, ids: ReadonlySet<string>, to: Entity): void {
  for (let i = 0; i < v.inventory.length; i++) {
    const s = v.inventory[i];
    if (!s || !ids.has(s.item.id)) continue;
    let n: number;
    if (s.count > s.item.maxStack / 2) n = Math.floor(s.count / 2);
    else if (s.count > 24) n = s.count - 24;
    else continue;
    s.count -= n;
    if (s.count <= 0) v.inventory[i] = null;
    throwItem(v, s.copyWithCount(n), to.x, to.y, to.z);
    return;
  }
}

/** vanilla BehaviorUtils.throwItem: from just under its eyes, 0.3 a tick along the line from its feet to the spot */
function throwItem(v: Villager, s: ItemStack, tx: number, ty: number, tz: number): void {
  const e = new ItemEntity(v.level, s);
  e.moveTo(v.x, v.y + v.eyeHeight - 0.3, v.z, v.random.nextFloat() * 360, 0);
  const dx = tx - v.x, dy = ty - v.y, dz = tz - v.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  e.dx = (dx / l) * 0.3;
  e.dy = (dy / l) * 0.3;
  e.dz = (dz / l) * 0.3;
  e.pickupDelay = 10;
  e.thrower = v;
  v.level.addEntity(e);
}

const isBedAt = (v: Villager, x: number, y: number, z: number): boolean => blk(v.level.world.getState(x, y, z)).name.endsWith('_bed');

/** vanilla JumpOnBed: a child runs to the nearest bed and bounces on it three to six times */
function jumpOnBed(speed: number): BehaviorControl<Villager> {
  let bed: Pos | null = null, toReach = 0, jumps = 0, cooldown = 0;
  const onOrOver = (v: Villager) => {
    const [x, y, z] = blockPos(v);
    return isBedAt(v, x, y, z) || isBedAt(v, x, y - 1, z);
  };
  const onSurface = (v: Villager) => {
    const [x, y, z] = blockPos(v);
    return isBedAt(v, x, y, z);
  };
  return new Behavior<Villager>({
    timesOut: false,
    canStart: (v) => !!v.mem.nearestBed && !v.mem.walkTarget && v.isBaby(),
    canStillUse: (v) => v.isBaby() && !!bed && isBedAt(v, bed[0], bed[1], bed[2]) && !(!onOrOver(v) && toReach <= 0) && !(onOrOver(v) && jumps <= 0),
    start: (v) => {
      bed = v.mem.nearestBed!;
      toReach = 100;
      jumps = 3 + v.random.nextInt(4);
      cooldown = 0;
      v.mem.walkTarget = walkTo(bed, speed, 0);
    },
    tick: (v) => {
      if (!onOrOver(v)) toReach--;
      else if (cooldown > 0) cooldown--;
      else if (onSurface(v)) {
        v.jumpControl.jump();
        jumps--;
        cooldown = 5;
      }
    },
    stop: () => {
      bed = null;
      toReach = jumps = cooldown = 0;
    },
  });
}

/** whatever a living thing holds in its main hand */
function mainHandOf(e: LivingEntity): ItemStack | null {
  if (e.type === 'player') return (e as Player).inventory.selectedItem;
  return (e as { mainHand?: ItemStack | null }).mainHand ?? null;
}

/**
 * vanilla ShowTradesToPlayer: a grown villager a player stands close to looks at them, and while they hold something
 * it would take in trade, it holds up what they could have for it, one after another every two seconds
 */
function showTradesToPlayer(min: number, max: number): BehaviorControl<Villager> {
  let playerItem: string | null = null;
  let display: ItemStack[] = [];
  let cycle = 0, index = 0, lookTime = 0;
  const ok = (v: Villager): boolean => {
    const t = v.mem.interactionTarget;
    return !!t && t.type === 'player' && v.isAlive && t.isAlive && !v.isBaby() && v.distanceToSqr(t.x, t.y, t.z) <= 17;
  };
  const hold = (v: Villager, s: ItemStack | null) => {
    v.setItemSlot('mainhand', s);
    v.setDropChance('mainhand', s ? 0 : 0.085);
  };
  return new Behavior<Villager>({
    min,
    max,
    canStart: ok,
    canStillUse: (v) => ok(v) && lookTime > 0,
    start: (v) => {
      v.mem.lookTarget = { e: v.mem.interactionTarget!, eyes: true };
      cycle = index = 0;
      lookTime = 40;
    },
    tick: (v) => {
      const p = v.mem.interactionTarget!;
      v.mem.lookTarget = { e: p, eyes: true };
      const id = mainHandOf(p)?.item.id ?? '';
      if (playerItem === null || playerItem !== id) {
        playerItem = id;
        display = [];
        if (id) {
          for (const o of v.getOffers()) if (!o.isOutOfStock() && (o.costA().item.id === id || o.costB?.id === id)) display.push(o.result.copy());
          if (display.length) {
            lookTime = 900;
            index = 0;
            hold(v, display[0]);
          }
        }
      }
      if (display.length) {
        if (display.length >= 2 && ++cycle >= 40) {
          index = index + 1 > display.length - 1 ? 0 : index + 1;
          cycle = 0;
          hold(v, display[index]);
        }
      } else {
        hold(v, null);
        lookTime = Math.min(lookTime, 40);
      }
      lookTime--;
    },
    stop: (v) => {
      v.mem.interactionTarget = null;
      hold(v, null);
      playerItem = null;
    },
  });
}

// ---------------------------------------------------------------------------

/** vanilla Villager */
/**
 * what a villager becomes when lightning strikes it (vanilla Villager.thunderHit: a witch; set by witch.ts, which
 * needs this module)
 */
export const lightningConversion: { witch: ((v: Villager) => Mob | null) | null } = { witch: null };

export class Villager extends AgeableMob {
  readonly type = 'villager';
  readonly category: MobCategory = 'misc';
  protected readonly adultWidth = 0.6;
  protected readonly adultHeight = 1.95;

  villagerType: VillagerType = 'plains';
  profession: Profession = 'none';
  /** vanilla VillagerData.level: 1 (novice) to 5 (master) */
  merchantLevel = 1;
  /** vanilla villagerXp */
  xp = 0;
  private offers: MerchantOffer[] | null = null;
  tradingPlayer: Player | null = null;
  /** vanilla unhappyCounter: shaking its head */
  unhappyCounter = 0;
  private updateMerchantTimer = 0;
  private increaseProfessionLevelOnUpdate = false;
  private lastTradedPlayer: Player | null = null;
  private lastRestockGameTime = 0;
  private numberOfRestocksToday = 0;
  private lastRestockCheckDayTime = 0;
  /** vanilla assignProfessionWhenSpawned: one a village was built with takes the first workstation it finds at once */
  assignProfessionWhenSpawned = false;
  /** vanilla sleepingPos: the head of the bed it's asleep in */
  sleepingPos: Pos | null = null;
  /** the day the sensors run (vanilla Sensor timeToTick) */
  private readonly sensePhase = Math.floor(Math.random() * 20);
  /** vanilla Villager.inventory: 8 slots of food and seeds */
  readonly inventory: (ItemStack | null)[] = new Array(8).fill(null);
  /** vanilla foodLevel: food eaten and not yet used up (a baby takes 12) */
  foodLevel = 0;
  /** vanilla lastGossipTime */
  lastGossipTime = 0;
  /** vanilla gossips: what it has heard about players (and mobs) */
  readonly gossips = new GossipContainer();
  /** vanilla lastGossipDecayTime */
  private lastGossipDecayTime = 0;
  /** vanilla GOLEM_DETECTED_RECENTLY: until when (it lasts 600 ticks from the sighting) */
  golemDetectedUntil = -1;
  /** vanilla HEARD_BELL_TIME: when it last heard a bell ring (set by the bell itself) */
  heardBellTime: number | null = null;

  readonly mem: VillagerMemories = {
    home: null, jobSite: null, potentialJobSite: null, meetingPoint: null, walkTarget: null, lookTarget: null, interactionTarget: null, path: null,
    cantReachWalkTargetSince: null, lastSlept: null, lastWoken: null, lastWorkedAtPoi: null, hurtBy: false, hurtByEntity: null, nearestHostile: null,
    doorsToClose: null, nearestLiving: [], visibleLiving: [], visibleBabies: null, wantedItem: null, breedTarget: null, nearestBed: null,
    secondaryJobSite: null, hidingPlace: null,
  };
  brain: Brain<Villager, VillagerActivity>;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.5;
    this.followRange = 48;
    // (vanilla: GroundPathNavigation.setCanOpenDoors, setCanFloat)
    this.ownNavigation.evaluator.canOpenDoors = true;
    this.ownNavigation.canFloat = true;
    this.canPickUpLoot = true;
    this.brain = this.makeBrain();
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  // --- the brain (vanilla Villager.registerBrainGoals) ------------------------

  private makeBrain(): Brain<Villager, VillagerActivity> {
    const b = new Brain<Villager, VillagerActivity>('idle', ['core']);
    if (this.isBaby()) b.add('play', playPackage());
    else b.add('work', workPackage(this.profession), (v) => !!v.mem.jobSite);
    b.add('core', corePackage());
    b.add('meet', meetPackage(), (v) => !!v.mem.meetingPoint);
    b.add('rest', restPackage());
    b.add('idle', idlePackage());
    b.add('panic', panicPackage());
    b.add('hide', hidePackage(), (v) => v.heardBellTime !== null);
    // (Stage 4: raids) vanilla PRE_RAID and RAID
    for (const [a, pkg] of villagerRaidHooks.activities()) b.add(a, pkg);
    b.setActiveActivityIfPossible('idle', this);
    return b;
  }

  /** vanilla Villager.refreshBrain: the behaviours made anew (a new profession, grown up); the memories stay */
  refreshBrain(): void {
    this.brain.stopAll(this, this.level.gameTime);
    this.brain = this.makeBrain();
    this.updateActivityFromSchedule(this.level.gameTime, true);
  }

  /** vanilla Brain.updateActivityFromSchedule */
  updateActivityFromSchedule(now: number, force = false): void {
    const want = scheduledActivity(this.isBaby() ? BABY_SCHEDULE : DEFAULT_SCHEDULE, this.level.dayTime);
    if (force) this.brain.setActiveActivityIfPossible(want, this);
    else this.brain.updateActivityFromSchedule(this, want, now);
  }

  protected override ageBoundaryReached(): void {
    this.refreshBrain();
  }

  // --- sensing (vanilla NearestLivingEntitySensor, VillagerHostilesSensor, VillagerBabiesSensor, HurtBySensor) ---

  /** vanilla Sensor.isEntityTargetable (TargetingConditions.forNonCombat().range(16)) */
  private visible(e: LivingEntity): boolean {
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    const r = Math.max(SENSE_RANGE * e.visibilityPercent(this), 2);
    return e.distanceToSqr(this.x, this.y, this.z) <= r * r && this.sensing.hasLineOfSight(e);
  }

  /** vanilla SecondaryPoiSensor: a farmer's farmland within 4 across and 2 up or down (no one else has any) */
  private senseSecondaryPoi(): void {
    if (this.profession !== 'farmer') {
      this.mem.secondaryJobSite = null;
      return;
    }
    const list: Pos[] = [];
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    for (let i = -4; i <= 4; i++)
      for (let j = -2; j <= 2; j++)
        for (let k = -4; k <= 4; k++) if (blk(this.level.world.getState(bx + i, by + j, bz + k)).name === 'farmland') list.push([bx + i, by + j, bz + k]);
    this.mem.secondaryJobSite = list.length ? list : null;
  }

  private sense(): void {
    const m = this.mem, r = SENSE_RANGE, now = this.level.gameTime;
    const near = this.level.getEntities(this.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, this) as LivingEntity[];
    near.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    m.nearestLiving = near;
    m.visibleLiving = near.filter((e) => this.visible(e));
    m.nearestHostile = m.visibleLiving.find((e) => {
      const d = HOSTILE_DISTANCE[e.type];
      return d !== undefined && e.distanceToSqr(this.x, this.y, this.z) <= d * d;
    }) ?? null;
    const babies = m.visibleLiving.filter((e): e is Villager => e instanceof Villager && e.isBaby());
    m.visibleBabies = babies.length ? babies : null;
    // vanilla HurtBySensor: the last hit within two seconds, and who dealt it (forgotten once dead or gone)
    if (now - this.lastDamageStamp <= 40) {
      m.hurtBy = true;
      const a = this.lastHurtByMob;
      if (a) m.hurtByEntity = a;
    } else m.hurtBy = false;
    if (m.hurtByEntity && (!m.hurtByEntity.isAlive || m.hurtByEntity.removed)) m.hurtByEntity = null;
    // (an entity memory lapses when the entity leaves the world)
    const it = m.interactionTarget;
    if (it && (it.removed || !it.isAlive)) m.interactionTarget = null;
    if (m.breedTarget && (m.breedTarget.removed || !m.breedTarget.isAlive)) m.breedTarget = null;
    // vanilla NearestItemSensor: the nearest item it wants and can see, within 32
    const items = this.level.getEntities(this.bb.inflate(32, 16, 32), (e) => e instanceof ItemEntity) as ItemEntity[];
    items.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    m.wantedItem = items.find((e) => this.wantsToPickUp(e.stack) && e.distanceToSqr(this.x, this.y, this.z) < 32 * 32 && this.sensing.hasLineOfSight(e)) ?? null;
    // vanilla NearestBedSensor: a child's nearest bed within 48 that it can walk to
    if (this.isBaby()) this.senseNearestBed();
  }

  /** vanilla NearestBedSensor (the few nearest beds tried by path) */
  private senseNearestBed(): void {
    const m = this.mem;
    if (m.nearestBed && isBedAt(this, m.nearestBed[0], m.nearestBed[1], m.nearestBed[2]) && closerToCenter(m.nearestBed, this, 48)) return;
    const [bx, by, bz] = blockPos(this);
    for (const [x, y, z] of this.level.poi.findAll(bx, by, bz, 48, (k) => k === 'home', false).slice(0, 5)) {
      if (this.navigation.createPathToBlock(x, y, z, 1)?.canReach()) {
        m.nearestBed = [x, y, z];
        return;
      }
    }
  }

  // --- ticking ---------------------------------------------------------------

  override tick(): void {
    super.tick();
    if (this.unhappyCounter > 0) this.unhappyCounter--;
    this.maybeDecayGossip();
    // vanilla LivingEntity.tick: asleep in a bed that's gone
    if (this.sleepingPos && !this.bedOrientation()) this.stopSleeping();
  }

  protected override customServerAiStep(): void {
    const now = this.level.gameTime;
    if ((this.tickCount + this.sensePhase) % 20 === 0 || this.tickCount === 1) this.sense();
    if ((this.tickCount + this.sensePhase) % 40 === 0) this.senseSecondaryPoi();
    // vanilla GolemSensor: every 200 ticks, an iron golem among those nearby
    if ((this.tickCount + this.sensePhase) % 200 === 0 && this.mem.nearestLiving.some((e) => e.type === 'iron_golem')) this.golemDetected(now);
    this.brain.tick(this, now);
    this.assignProfessionWhenSpawned = false;
    if (!this.isTrading() && this.updateMerchantTimer > 0) {
      this.updateMerchantTimer--;
      if (this.updateMerchantTimer <= 0) {
        if (this.increaseProfessionLevelOnUpdate) {
          this.increaseMerchantCareer();
          this.increaseProfessionLevelOnUpdate = false;
        }
        this.addEffect(new MobEffectInstance(MOB_EFFECTS.regeneration, 200, 0));
      }
    }
    if (this.lastTradedPlayer) {
      this.onReputationEvent('trade', this.lastTradedPlayer);
      // (vanilla entity event 14)
      this.addParticlesAroundSelf('happy_villager');
      this.lastTradedPlayer = null;
    }
    // (Stage 4: raids) vanilla: now and then a villager in a raid breaks into a sweat (entity event 42)
    villagerRaidHooks.aiStep(this);
    if (this.profession === 'none' && this.isTrading()) this.stopTrading();
    super.customServerAiStep();
  }

  // --- data ------------------------------------------------------------------

  setProfession(p: Profession): void {
    if (p !== this.profession) this.offers = null;
    this.profession = p;
  }

  /** vanilla Villager.finalizeSpawn */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    if (reason === 'breeding') this.setProfession('none');
    if (reason === 'command' || reason === 'egg' || reason === 'spawner') this.villagerType = villagerTypeAt(this.level, this.x, this.y, this.z);
    if (reason === 'structure') this.assignProfessionWhenSpawned = true;
    super.finalizeSpawn(reason, group);
  }

  override removeWhenFarAway(): boolean {
    return false;
  }

  override get eyeHeight(): number {
    if (this.sleepingPos) return 0.2;
    return this.isBaby() ? 0.81 : 1.62;
  }

  /** the eye height standing (vanilla getEyeHeight(Pose.STANDING)): where a sleeper's head lies */
  standingEyeHeight(): number {
    return this.isBaby() ? 0.81 : 1.62;
  }

  override refreshSize(): void {
    if (this.sleepingPos) this.setSize(0.2, 0.2);
    else super.refreshSize();
  }

  /** vanilla Villager.addParticlesAroundSelf (entity events 12-14: hearts, anger, sparkles) */
  addParticlesAroundSelf(kind: string): void {
    const r = this.random;
    for (let i = 0; i < 5; i++) {
      const dx = r.gaussian() * 0.02, dy = r.gaussian() * 0.02, dz = r.gaussian() * 0.02;
      this.level.particles.spawn?.(kind, this.x + this.width * (2 * r.nextDouble() - 1), this.y + this.height * r.nextDouble() + 1, this.z + this.width * (2 * r.nextDouble() - 1), dx, dy, dz);
    }
  }

  // --- points of interest ----------------------------------------------------

  /** vanilla Villager.releasePoi: let go of the place's ticket and forget it */
  releasePoi(mem: PosMemory): void {
    const p = this.mem[mem];
    if (p) this.level.poi.release(p[0], p[1], p[2], this);
    this.mem[mem] = null;
  }

  /** vanilla releaseAllPois */
  releaseAllPois(): void {
    this.releasePoi('home');
    this.releasePoi('jobSite');
    this.releasePoi('potentialJobSite');
    this.releasePoi('meetingPoint');
  }

  // --- sleeping (vanilla LivingEntity.startSleeping / stopSleeping, Villager's) -------------------------------

  isSleeping(): boolean {
    return this.sleepingPos !== null;
  }

  /** the bed's facing while asleep (vanilla getBedOrientation) */
  bedOrientation(): string | null {
    const p = this.sleepingPos;
    if (!p) return null;
    const st = this.level.world.getState(p[0], p[1], p[2]), b = blk(st);
    return b.name.endsWith('_bed') ? b.get<string>(st, 'facing') : null;
  }

  startSleeping(p: Pos): void {
    if (this.vehicle) this.stopRiding();
    const [x, y, z] = p;
    const st = this.level.world.getState(x, y, z), b = blk(st);
    if (b.name.endsWith('_bed')) this.level.setBlock(x, y, z, b.with(st, 'occupied', true));
    this.sleepingPos = [x, y, z];
    this.setSize(0.2, 0.2);
    this.setPos(x + 0.5, y + 0.6875, z + 0.5);
    this.dx = this.dy = this.dz = 0;
    this.mem.lastSlept = this.level.gameTime;
    this.mem.walkTarget = null;
    this.mem.cantReachWalkTargetSince = null;
    this.navigation.stop();
  }

  stopSleeping(): void {
    const p = this.sleepingPos;
    if (!p) return;
    this.sleepingPos = null;
    const [x, y, z] = p;
    const w = this.level.world;
    const st = w.getState(x, y, z), b = blk(st);
    this.refreshSize();
    if (b.name.endsWith('_bed')) {
      this.level.setBlock(x, y, z, b.with(st, 'occupied', false));
      const at = findStandUpPosition(w, x, y, z, b.get<string>(st, 'facing'), this.yaw) ?? [x + 0.5, y + 1.1, z + 0.5];
      const yaw = wrapDegrees((Math.atan2(z + 0.5 - at[2], x + 0.5 - at[0]) * 180) / Math.PI - 90);
      this.moveTo(at[0], at[1], at[2], yaw, 0);
    }
    this.mem.lastWoken = this.level.gameTime;
  }

  // --- pockets and food (vanilla Villager inventory, InventoryCarrier) ---------------------------------------

  /** vanilla Villager.wantsToPickUp: food and seeds (a farmer bone meal too), while there's room */
  override wantsToPickUp(s: ItemStack): boolean {
    const id = s.item.id;
    return (WANTED_ITEMS.has(id) || !!REQUESTED_ITEMS[this.profession]?.has(id)) && this.canAddToInventory(s);
  }

  /** vanilla InventoryCarrier.pickUpItem: as much as fits into its pockets */
  protected override pickUpItem(it: ItemEntity): void {
    const s = it.stack;
    if (!this.wantsToPickUp(s)) return;
    this.onItemPickup(it);
    const n = s.count;
    const left = this.addToInventory(s);
    this.take(it, n - (left?.count ?? 0));
    if (!left) it.remove();
    else s.count = left.count;
  }

  /** vanilla SimpleContainer.canAddItem */
  private canAddToInventory(s: ItemStack): boolean {
    return this.inventory.some((x) => !x || (x.sameItem(s) && x.count < x.item.maxStack));
  }

  /** vanilla SimpleContainer.addItem: onto stacks of the same, then into an empty slot; what didn't fit comes back */
  addToInventory(s: ItemStack): ItemStack | null {
    let left = s.count;
    for (const x of this.inventory) {
      if (!x || !x.sameItem(s)) continue;
      const k = Math.min(left, x.item.maxStack - x.count);
      x.count += k;
      left -= k;
      if (left <= 0) return null;
    }
    for (let i = 0; i < this.inventory.length; i++)
      if (!this.inventory[i]) {
        this.inventory[i] = s.copyWithCount(left);
        return null;
      }
    return s.copyWithCount(left);
  }

  /** vanilla SimpleContainer.removeItemType: up to `n` of an item out of its pockets */
  removeFromInventory(id: string, n: number): void {
    for (let i = 0; i < this.inventory.length && n > 0; i++) {
      const s = this.inventory[i];
      if (s?.item.id !== id) continue;
      const k = Math.min(n, s.count);
      s.count -= k;
      n -= k;
      if (s.count <= 0) this.inventory[i] = null;
    }
  }

  /** vanilla hasFarmSeeds: anything in its pockets it could sow */
  hasFarmSeeds(): boolean {
    return this.inventory.some((s) => !!s && s.item.id in PLANTABLE);
  }

  /** vanilla SimpleContainer.countItem */
  countItem(id: string): number {
    let n = 0;
    for (const s of this.inventory) if (s?.item.id === id) n += s.count;
    return n;
  }

  /** vanilla countFoodPointsInInventory */
  foodPoints(): number {
    let n = 0;
    for (const s of this.inventory) if (s) n += (FOOD_POINTS[s.item.id] ?? 0) * s.count;
    return n;
  }

  /** vanilla hasExcessFood / wantsMoreFood */
  hasExcessFood(): boolean {
    return this.foodPoints() >= 24;
  }

  wantsMoreFood(): boolean {
    return this.foodPoints() < 12;
  }

  /** vanilla canBreed: fed enough (12 points, eaten or in its pockets), awake, grown and not a new parent */
  canBreed(): boolean {
    return this.foodLevel + this.foodPoints() >= 12 && !this.isSleeping() && this.age === 0;
  }

  /** vanilla eatAndDigestFood: eats until it's had 12 points, then those go into the baby */
  eatAndDigestFood(): void {
    if (this.foodLevel < 12 && this.foodPoints() !== 0)
      eat: for (let i = 0; i < this.inventory.length; i++) {
        const s = this.inventory[i];
        const pts = s ? FOOD_POINTS[s.item.id] : undefined;
        if (!s || pts === undefined) continue;
        while (s.count > 0) {
          this.foodLevel += pts;
          if (--s.count <= 0) this.inventory[i] = null;
          if (this.foodLevel >= 12) break eat;
        }
      }
    this.foodLevel -= 12;
  }

  /** vanilla Villager.gossip: when neither has for a minute, two villagers that meet swap what they've heard */
  gossip(other: Villager, now: number): void {
    const ready = (t: number) => now < t || now >= t + 1200;
    if (!ready(this.lastGossipTime) || !ready(other.lastGossipTime)) return;
    this.gossips.transferFrom(other.gossips, this.random, 10);
    this.lastGossipTime = now;
    other.lastGossipTime = now;
    this.spawnGolemIfNeeded(now, 5);
  }

  /** what it thinks of a player (vanilla getPlayerReputation) */
  playerReputation(p: Entity): number {
    return this.gossips.reputation(p.uuid);
  }

  /** vanilla Villager.onReputationEventFrom: something someone did, as this villager saw it */
  onReputationEvent(type: 'zombie_villager_cured' | 'trade' | 'villager_hurt' | 'villager_killed', target: Entity): void {
    const id = target.uuid;
    if (type === 'zombie_villager_cured') {
      this.gossips.add(id, 'major_positive', 20);
      this.gossips.add(id, 'minor_positive', 25);
    } else if (type === 'trade') this.gossips.add(id, 'trading', 2);
    else if (type === 'villager_hurt') this.gossips.add(id, 'minor_negative', 25);
    else this.gossips.add(id, 'major_negative', 25);
  }

  /** vanilla maybeDecayGossip: once a day what it has heard fades */
  private maybeDecayGossip(): void {
    const now = this.level.gameTime;
    if (this.lastGossipDecayTime === 0) this.lastGossipDecayTime = now;
    else if (now >= this.lastGossipDecayTime + 24000) {
      this.gossips.decay();
      this.lastGossipDecayTime = now;
    }
  }

  // --- iron golems ---------------------------------------------------------------------------------------------

  /** vanilla GolemSensor.golemDetected */
  golemDetected(now: number): void {
    this.golemDetectedUntil = now + 600;
  }

  /** vanilla Villager.wantsToSpawnGolem: it slept within the last day, and hasn't seen a golem lately */
  wantsToSpawnGolem(now: number): boolean {
    const slept = this.mem.lastSlept;
    if (slept === null || now - slept >= 24000) return false;
    return now >= this.golemDetectedUntil;
  }

  /**
   * vanilla Villager.spawnGolemIfNeeded: when enough of the villagers within 10 (of the first five that do) want a
   * golem, one is summoned nearby, and they've all seen it
   */
  spawnGolemIfNeeded(now: number, min: number): void {
    if (!this.wantsToSpawnGolem(now)) return;
    const near = this.level.getEntities(this.bb.inflate(10, 10, 10), (e) => e instanceof Villager) as Villager[];
    const want = near.filter((v) => v.wantsToSpawnGolem(now)).slice(0, 5);
    if (want.length < min) return;
    if (summonGolemNear(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))) for (const v of near) v.golemDetected(now);
  }

  // --- trading (vanilla AbstractVillager / Villager as a Merchant) ---------------------------------------------

  isTrading(): boolean {
    return this.tradingPlayer !== null;
  }

  /** vanilla AbstractVillager.setOffers (a cured zombie villager's, as it had them) */
  setOffers(offers: MerchantOffer[]): void {
    this.offers = offers;
  }

  /** vanilla AbstractVillager.getOffers: made the first time they're asked for */
  getOffers(): MerchantOffer[] {
    if (!this.offers) {
      this.offers = [];
      this.updateTrades();
    }
    return this.offers;
  }

  /** vanilla Villager.updateTrades: two more offers from the listings of its level */
  private updateTrades(): void {
    const listings = VILLAGER_TRADES[this.profession]?.[this.merchantLevel - 1];
    if (listings) addOffersFromListings(this.getOffers(), listings, 2, this);
  }

  /** vanilla Villager.getBreedOffspring: the biome's type half the time, else either parent's; no profession */
  breedOffspring(other: Villager): Villager {
    const d = this.random.nextDouble();
    const v = new Villager(this.level);
    v.villagerType = d < 0.5 ? villagerTypeAt(this.level, this.x, this.y, this.z) : d < 0.75 ? this.villagerType : other.villagerType;
    v.finalizeSpawn('breeding');
    return v;
  }

  /** vanilla Villager.mobInteract; true when the click did something */
  interact(p: Player, stack: ItemStack | null, main: boolean): boolean {
    if (stack?.item.id === 'villager_spawn_egg' || !this.isAlive || this.isTrading() || this.isSleeping()) return false;
    if (this.isBaby()) {
      this.setUnhappy();
      return true;
    }
    const none = this.getOffers().length === 0;
    if (main && none) this.setUnhappy();
    if (none) return true;
    this.startTrading(p);
    return true;
  }

  /** vanilla setUnhappy: a head shake and a grumble */
  setUnhappy(): void {
    this.unhappyCounter = 40;
    this.playSound('entity.villager.no', this.soundVolume(), this.voicePitch());
  }

  private startTrading(p: Player): void {
    this.updateSpecialPrices(p);
    this.tradingPlayer = p;
    this.level.onOpenMerchant?.(this, p);
  }

  /** vanilla updateSpecialPrices: a player it thinks well of pays less, one it doesn't more */
  private updateSpecialPrices(p: Player): void {
    const rep = this.playerReputation(p);
    if (rep !== 0) for (const o of this.getOffers()) o.addToSpecialPriceDiff(-Math.floor(Math.fround(rep * Math.fround(o.priceMultiplier))));
    // (Stage 4: raids) a Hero of the Village pays 30% less of the first price, 6.25% less for each level above I (one at least)
    const hero = p.getEffect('hero_of_the_village');
    if (hero) for (const o of this.getOffers()) o.addToSpecialPriceDiff(-Math.max(Math.floor((0.3 + 0.0625 * hero.amplifier) * o.baseCostA.count), 1));
  }

  /** vanilla AbstractVillager.stopTrading (and Villager's: the player's discounts go) */
  stopTrading(): void {
    this.tradingPlayer = null;
    for (const o of this.offers ?? []) o.specialPriceDiff = 0;
  }

  /** vanilla AbstractVillager.notifyTrade */
  notifyTrade(o: MerchantOffer): void {
    o.uses++;
    this.ambientSoundTime = -this.ambientSoundInterval();
    this.rewardTradeXp(o);
  }

  /** vanilla Villager.rewardTradeXp: experience for the villager, 3-6 orbs' worth for the player (5 more on a level up) */
  private rewardTradeXp(o: MerchantOffer): void {
    let i = 3 + this.random.nextInt(4);
    this.xp += o.xp;
    this.lastTradedPlayer = this.tradingPlayer;
    if (this.shouldIncreaseLevel()) {
      this.updateMerchantTimer = 40;
      this.increaseProfessionLevelOnUpdate = true;
      i += 5;
    }
    if (o.rewardExp) this.level.awardExperience(this.x, this.y + 0.5, this.z, i);
  }

  /** vanilla AbstractVillager.notifyTradeUpdated: a yes or a no as the player fills the payment slots */
  notifyTradeUpdated(s: ItemStack | null): void {
    if (this.ambientSoundTime > -this.ambientSoundInterval() + 20) {
      this.ambientSoundTime = -this.ambientSoundInterval();
      this.playSound(s && !s.isEmpty() ? 'entity.villager.yes' : 'entity.villager.no', this.soundVolume(), this.voicePitch());
    }
  }

  private shouldIncreaseLevel(): boolean {
    const l = this.merchantLevel;
    return canLevelUp(l) && this.xp >= maxXpPerLevel(l);
  }

  private increaseMerchantCareer(): void {
    this.merchantLevel++;
    this.updateTrades();
  }

  /** vanilla canRestock: an employed villager's offers come back */
  canRestock(): boolean {
    return true;
  }

  /** vanilla Villager.restock */
  restock(): void {
    this.updateDemand();
    for (const o of this.getOffers()) o.resetUses();
    this.lastRestockGameTime = this.level.gameTime;
    this.numberOfRestocksToday++;
  }

  private needsToRestock(): boolean {
    return this.getOffers().some((o) => o.needsRestock());
  }

  private allowedToRestock(): boolean {
    return this.numberOfRestocksToday === 0 || (this.numberOfRestocksToday < 2 && this.level.gameTime > this.lastRestockGameTime + 2400);
  }

  /** vanilla Villager.shouldRestock: twice a day at most, and only when something was bought */
  shouldRestock(): boolean {
    const now = this.level.gameTime, day = this.level.dayTime;
    let fresh = now > this.lastRestockGameTime + 12000;
    if (this.lastRestockCheckDayTime > 0) fresh ||= Math.floor(day / 24000) > Math.floor(this.lastRestockCheckDayTime / 24000);
    this.lastRestockCheckDayTime = day;
    if (fresh) {
      this.lastRestockGameTime = now;
      this.resetNumberOfRestocks();
    }
    return this.allowedToRestock() && this.needsToRestock();
  }

  /** vanilla resetNumberOfRestocks → catchUpDemand: the restocks missed come in at once */
  private resetNumberOfRestocks(): void {
    const i = 2 - this.numberOfRestocksToday;
    if (i > 0) for (const o of this.getOffers()) o.resetUses();
    for (let j = 0; j < i; j++) this.updateDemand();
    this.numberOfRestocksToday = 0;
  }

  private updateDemand(): void {
    for (const o of this.getOffers()) o.updateDemand();
  }

  /** vanilla getVillagerXp and the experience bar's ends */
  xpProgress(): { min: number; max: number } {
    return { min: minXpPerLevel(this.merchantLevel), max: maxXpPerLevel(this.merchantLevel) };
  }

  // --- sounds ------------------------------------------------------------------

  override ambientSound(): string | null {
    if (this.isSleeping()) return null;
    return this.isTrading() ? 'entity.villager.trade' : 'entity.villager.ambient';
  }

  override hurtSound(): string {
    return 'entity.villager.hurt';
  }

  override deathSound(): string {
    return 'entity.villager.death';
  }

  /** vanilla VillagerProfession.workSound */
  playWorkSound(): void {
    if (this.profession === 'none' || this.profession === 'nitwit') return;
    this.playSound(`entity.villager.work_${this.profession}`, this.soundVolume(), this.voicePitch());
  }

  // --- damage and death ----------------------------------------------------------

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (!ok) return false;
    if (this.isSleeping()) this.stopSleeping();
    // vanilla Villager.setLastHurtByMob: it remembers who hurt it, and a player's hit angers it (entity event 13)
    if (attacker instanceof LivingEntity) {
      this.onReputationEvent('villager_hurt', attacker);
      if (attacker.type === 'player' && this.isAlive) this.addParticlesAroundSelf('angry_villager');
    }
    return true;
  }

  /** vanilla Villager.thunderHit: struck by lightning (but in peaceful) it turns into a witch */
  override thunderHit(bolt: Entity): void {
    if (this.level.difficulty !== 'peaceful' && lightningConversion.witch?.(this)) return;
    super.thunderHit(bolt);
  }

  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    // vanilla tellWitnessesThatIWasMurdered: every villager that could see it will remember who did it
    if (attacker) for (const e of this.mem.visibleLiving) if (e instanceof Villager && e !== this) e.onReputationEvent('villager_killed', attacker);
    this.releaseAllPois();
    super.die(source, attacker);
    this.stopTrading();
  }

  // --- saving --------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const m = this.mem;
    const pos = (p: Pos | null) => (p ? key(p) : '');
    const d: Record<string, number | string | boolean> = {
      ...super.saveData(),
      vtype: this.villagerType,
      profession: this.profession,
      level: this.merchantLevel,
      xp: this.xp,
      lastRestock: this.lastRestockGameTime,
      restocksToday: this.numberOfRestocksToday,
      lastRestockCheckDay: this.lastRestockCheckDayTime,
      assignProfession: this.assignProfessionWhenSpawned,
      home: pos(m.home),
      jobSite: pos(m.jobSite),
      potentialJobSite: pos(m.potentialJobSite),
      meetingPoint: pos(m.meetingPoint),
      sleeping: pos(this.sleepingPos),
    };
    if (this.offers) d.offers = JSON.stringify(this.offers.map((o) => o.save()));
    if (this.inventory.some((x) => x)) d.inventory = JSON.stringify(this.inventory.map((x) => (x ? saveStack(x) : null)));
    if (this.foodLevel) d.food = this.foodLevel;
    if (m.lastSlept !== null) d.lastSlept = m.lastSlept;
    if (m.lastWoken !== null) d.lastWoken = m.lastWoken;
    if (m.lastWorkedAtPoi !== null) d.lastWorked = m.lastWorkedAtPoi;
    const g = this.gossips.save();
    if (g.length) d.gossips = JSON.stringify(g);
    if (this.lastGossipDecayTime) d.lastGossipDecay = this.lastGossipDecayTime;
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const m = this.mem;
    if (VILLAGER_TYPES.includes(d.vtype as VillagerType)) this.villagerType = d.vtype as VillagerType;
    if (PROFESSIONS.includes(d.profession as Profession)) this.profession = d.profession as Profession;
    this.merchantLevel = Math.max(1, Math.min(5, Number(d.level ?? 1)));
    this.xp = Number(d.xp ?? 0);
    this.lastRestockGameTime = Number(d.lastRestock ?? 0);
    this.numberOfRestocksToday = Number(d.restocksToday ?? 0);
    this.lastRestockCheckDayTime = Number(d.lastRestockCheckDay ?? 0);
    this.assignProfessionWhenSpawned = d.assignProfession === true;
    if (typeof d.inventory === 'string') (JSON.parse(d.inventory) as (SavedStack | null)[]).forEach((x, i) => i < 8 && (this.inventory[i] = loadStack(x)));
    this.foodLevel = Number(d.food ?? 0);
    if (typeof d.offers === 'string') this.offers = (JSON.parse(d.offers) as SavedOffer[]).map((o) => MerchantOffer.load(o)).filter((o): o is MerchantOffer => !!o);
    const pos = (s: unknown): Pos | null => {
      if (typeof s !== 'string' || !s) return null;
      const p = s.split(',').map(Number);
      return p.length === 3 && p.every(Number.isFinite) ? (p as Pos) : null;
    };
    // (vanilla keeps the tickets with the points; here the villager takes its own again)
    for (const k of ['home', 'jobSite', 'potentialJobSite', 'meetingPoint'] as const) {
      const p = pos(d[k]);
      if (p && this.level.poi.take(p[0], p[1], p[2], this)) m[k] = p;
    }
    if (typeof d.lastSlept === 'number') m.lastSlept = d.lastSlept;
    if (typeof d.lastWoken === 'number') m.lastWoken = d.lastWoken;
    if (typeof d.lastWorked === 'number') m.lastWorkedAtPoi = d.lastWorked;
    if (typeof d.gossips === 'string') this.gossips.load(JSON.parse(d.gossips) as GossipEntry[]);
    this.lastGossipDecayTime = Number(d.lastGossipDecay ?? 0);
    const s = pos(d.sleeping);
    if (s) {
      this.sleepingPos = s;
      this.setSize(0.2, 0.2);
    }
    this.brain = this.makeBrain();
  }
}

// ---------------------------------------------------------------------------
// VillagerGoalPackages

type Pkg = [number, BehaviorControl<Villager>][];

/**
 * (Stage 4: raids) the raid's part in the brain, filled in by game/raidVillagers.ts: SetRaidStatus in the core,
 * GiveGiftToHero at work, at the meeting point and idle, the PRE_RAID and RAID activities, whether there's a raid on
 * here (the bell then doesn't send it into hiding), and a villager's sweat in a raid
 */
export const villagerRaidHooks: {
  core: () => Pkg;
  gift: () => Pkg;
  activities: () => [VillagerActivity, Pkg][];
  raidHere: (v: Villager) => boolean;
  aiStep: (v: Villager) => void;
} = { core: () => [], gift: () => [], activities: () => [], raidHere: () => false, aiStep: () => {} };

/** (Stage 4: raids) the behaviours and helpers the raid's packages share with the others */
export const villagerBehaviors = { minimalLook, villageBoundRandomStroll, setWalkTargetFromBlockMemory, locateHidingPlace, throwItem, walkTo, walkAfter, blockPos };

function corePackage(): Pkg {
  return [
    [0, swim()],
    [0, interactWithDoor()],
    [0, lookAtTargetSink()],
    [0, panicTrigger()],
    [0, wakeUp()],
    [0, reactToBell()],
    // (Stage 4: raids) SetRaidStatus
    ...villagerRaidHooks.core(),
    [0, validateNearbyPoi('jobSite', (v) => heldJobSite(v.profession))],
    [0, validateNearbyPoi('potentialJobSite', (v) => acquirableJobSite(v.profession))],
    [1, moveToTargetSink()],
    [2, poiCompetitorScan()],
    [3, lookAndFollowTradingPlayer()],
    [5, goToWantedItem(SPEED, 4)],
    [6, acquirePoi('potentialJobSite', ['jobSite'], (v) => acquirableJobSite(v.profession), true, false)],
    [7, goToPotentialJobSite()],
    // (YieldJobSite waits too)
    [10, acquirePoi('home', [], () => (k) => k === 'home', false, true, freeBed)],
    [10, acquirePoi('meetingPoint', [], () => (k) => k === 'meeting', true, true)],
    [10, assignProfessionFromJobSite()],
    [10, resetProfession()],
  ];
}

/** vanilla VillagerGoalPackages.getWorkPackage (a farmer composts at work, and tends its fields more) */
function workPackage(prof: Profession): Pkg {
  const farmer = prof === 'farmer';
  return [
    [5, minimalLook()],
    [
      5,
      runOne<Villager>([
        [workAtPoi(farmer ? workAtComposter : undefined), 7],
        [oneShot(strollAroundPoi('jobSite', STROLL, 4)), 2],
        [strollToPoi('jobSite', STROLL, 1, 10), 5],
        [strollToPoiList(SPEED), 5],
        [harvestFarmland(), farmer ? 2 : 5],
        [useBonemeal(), farmer ? 4 : 7],
      ]),
    ],
    [10, showTradesToPlayer(400, 1600)],
    [10, setLookAndInteractWithPlayer()],
    [2, setWalkTargetFromBlockMemory('jobSite', SPEED, 9, 100, 1200)],
    // (Stage 4: raids) GiveGiftToHero
    ...villagerRaidHooks.gift(),
    [99, updateActivityFromSchedule()],
  ];
}

function playPackage(): Pkg {
  return [
    [0, moveToTargetSink(100, 100)],
    [5, fullLook()],
    [5, playTagWithOtherKids()],
    [
      5,
      runOne<Villager>(
        [
          [interactWith('villager', SPEED), 2],
          [interactWith('cat', SPEED), 1],
          [villageBoundRandomStroll(SPEED), 1],
          [walkToLookTarget(SPEED, 2), 1],
          [doNothing(20, 40), 2],
        ],
        (v) => !v.mem.visibleBabies,
      ),
    ],
    [99, updateActivityFromSchedule()],
  ];
}

/** vanilla VillagerGoalPackages.getHidePackage: to a bed, and stay there a while */
function hidePackage(): Pkg {
  return [
    [0, setHiddenState(15, 3)],
    [1, locateHidingPlace(32, SPEED * 1.25, 2)],
    [5, minimalLook()],
  ];
}

function restPackage(): Pkg {
  return [
    [2, setWalkTargetFromBlockMemory('home', SPEED, 1, 150, 1200)],
    [3, validateNearbyPoi('home', () => (k) => k === 'home')],
    [3, sleepInBed()],
    [
      5,
      runOne<Villager>(
        [
          [setClosestHomeAsWalkTarget(SPEED), 1],
          [insideBrownianWalk(SPEED), 4],
          [goToClosestVillage(SPEED, 4), 2],
          [doNothing(20, 40), 2],
        ],
        (v) => !v.mem.home,
      ),
    ],
    [5, minimalLook()],
    [99, updateActivityFromSchedule()],
  ];
}

function meetPackage(): Pkg {
  return [
    [2, triggerOneShuffled<Villager>([[strollAroundPoi('meetingPoint', STROLL, 40), 2], [socializeAtBell, 2]])],
    [10, showTradesToPlayer(400, 1600)],
    [10, setLookAndInteractWithPlayer()],
    [2, setWalkTargetFromBlockMemory('meetingPoint', SPEED, 6, 100, 200)],
    // (Stage 4: raids) GiveGiftToHero
    ...villagerRaidHooks.gift(),
    [3, validateNearbyPoi('meetingPoint', () => (k) => k === 'meeting')],
    [3, tradeGate()],
    [5, fullLook()],
    [99, updateActivityFromSchedule()],
  ];
}

function idlePackage(): Pkg {
  return [
    [
      2,
      runOne<Villager>([
        [interactWith('villager', SPEED), 2],
        [interactWithMate(SPEED), 1],
        [interactWith('cat', SPEED), 1],
        [villageBoundRandomStroll(SPEED), 1],
        [walkToLookTarget(SPEED, 2), 1],
        [jumpOnBed(SPEED), 1],
        [doNothing(30, 60), 1],
      ]),
    ],
    // (Stage 4: raids) GiveGiftToHero
    ...villagerRaidHooks.gift(),
    [3, setLookAndInteractWithPlayer()],
    [3, showTradesToPlayer(400, 1600)],
    [3, tradeGate()],
    // (a gate that forgets the mate whenever the courting isn't going on)
    [3, new GateBehavior<Villager>([[villagerMakeLove(), 1]], { shuffle: false, exit: (v) => (v.mem.breedTarget = null) })],
    [5, fullLook()],
    [99, updateActivityFromSchedule()],
  ];
}

/** vanilla GateBehavior(exit INTERACTION_TARGET, [TradeWithVillager]): whoever it was dealing with is forgotten once that's over */
function tradeGate(): BehaviorControl<Villager> {
  return new GateBehavior<Villager>([[tradeWithVillager(), 1]], { shuffle: false, exit: (v) => (v.mem.interactionTarget = null) });
}

function panicPackage(): Pkg {
  const f = SPEED * 1.5;
  return [
    [0, villagerCalmDown()],
    [1, walkAwayFrom((v) => v.mem.nearestHostile, f)],
    [1, walkAwayFrom((v) => v.mem.hurtByEntity, f)],
    [3, villageBoundRandomStroll(f, 2, 2)],
    [5, minimalLook()],
  ];
}
