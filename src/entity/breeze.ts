// (trial chambers) The breeze (1.21; vanilla Breeze and BreezeAi, with its behaviours Shoot, LongJump, ShootWhenStuck,
// Slide and SlideToTargetSink, BreezeUtil and BreezeAttackEntitySensor). A blocky head over three turning rods and a
// whirl of wind, it comes only out of trial spawners, and it goes for players and iron golems alone. Seeing one within
// 16 blocks (or hurt by one), it slides off, to a few blocks behind them or into a ring about them (away from them,
// if they've come within four), and from there breathes in and spits a wind charge at them; or, with the target 4 to
// 24 blocks off and four blocks' room over its head, it takes a breath and leaps high and far to land behind them, and
// fires as soon as it's down (sooner if it was hurt). Stuck — riding something, in water, or floating — it just fires.
// With nothing to fight it slides about now and then, a second or two at a time.
//
// Anything but a wind charge that strikes it (arrows, tridents, snowballs, fireballs) bounces off back the way it came
// (entity/projectileDeflection.ts); another breeze can't hurt it, and it's hurt by no fall. It whirls and whistles,
// puffs up the dust of the ground beneath it (more while it slides, a trail of it as it leaps), and when a player kills
// it drops one or two breeze rods (more with Looting). Drawn by render/breezeRenderer.ts: its head and rods, its wind
// spinning round beneath them, and its eyes glowing.
//
// Its brain is vanilla's (entity/ai/brain.ts, and the shared behaviours of ai/brainBehaviors.ts): the core, idle and
// fight activities, the first of fight (with a target and nowhere to walk) and idle that may run. Its memories that run
// out (vanilla ExpirableValue) count down at the start of each of its brain's ticks.

import { Monster, DIFFICULTY_ID } from './monsters';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import { Behavior, Brain, doNothing, oneShot, runOne, type BehaviorControl } from './ai/brain';
import {
  isEntityTargetable, lookAtTargetSink, moveToTargetSink, randomStroll, senseHurtBy, senseNearestLiving, SensorClock, type Pos, type Tracker,
  type WalkTarget,
} from './ai/brainBehaviors';
import { defaultRandomPosTowards } from './ai/goals';
import { PathType, isBurningBlock } from './ai/pathfinder';
import { AbstractWindCharge, BreezeWindCharge } from './windCharge';
import { DEFLECTIONS, REVERSE, type Deflection } from './projectileDeflection';
import { clipBlocks } from '../game/raycast';
import { ItemStack, ITEMS } from '../item/item';
import type { Rand } from '../core/rng';
import { wrapDegrees } from '../core/math';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, COLLISION } from '../world/block';
import { fluidType, FLUID_WATER } from '../world/fluids';

type Activity = 'core' | 'idle' | 'fight';
/** vanilla Pose, as far as a breeze takes one */
export type BreezePose = 'standing' | 'sliding' | 'shooting' | 'inhaling' | 'long_jumping';

/** vanilla Shoot's timings: breathing in, then a moment before it may fire again, and the cooldown after */
const SHOOT_INITIAL_DELAY = 15;
const SHOOT_RECOVER_DELAY = 4;
const SHOOT_COOLDOWN = 10;
/** vanilla LongJump: its breath in, the angles it may leap at (shuffled each time), how hard it may leap */
const INHALING_DURATION = 10;
const JUMP_ANGLES = [40, 55, 60, 75, 80];
const MAX_JUMP_VELOCITY = 1.4;
/** vanilla BreezeAttackEntitySensor.BREEZE_SENSOR_RADIUS, and LongJump's reach */
const SENSOR_RADIUS = 24;
/** vanilla BreezeUtil.MAX_LINE_OF_SIGHT_TEST_RANGE */
const MAX_SIGHT = 50;

const RAD = Math.PI / 180;

/** a block's name (the few this checks by name) */
const blockName = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;

/** vanilla EntityType.isBlockDangerous (a breeze isn't fireproof): what it won't leap onto */
function isBlockDangerous(st: number): boolean {
  const n = blockName(st);
  return isBurningBlock(st) || n === 'wither_rose' || n === 'sweet_berry_bush' || n === 'cactus' || n === 'powder_snow';
}

/** vanilla RenderShape.INVISIBLE: blocks with nothing of their own drawn (no dust of them is kicked up) */
function invisibleBlock(st: number): boolean {
  if (FLAGS[st] & F_AIR) return true;
  const n = blockName(st);
  return n === 'water' || n === 'lava' || n === 'barrier' || n === 'light' || n === 'structure_void' || n === 'moving_piston';
}

/**
 * vanilla Level.clip (ClipContext.Block.COLLIDER, no fluids) from one point to another: where it first meets a block's
 * collision, or null; a start inside a block's collision meets that block at once (vanilla VoxelShape.clip)
 */
function clipCollider(level: Level, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Pos | null {
  const bx = Math.floor(x0), by = Math.floor(y0), bz = Math.floor(z0);
  for (const b of COLLISION[level.world.getState(bx, by, bz)] ?? []) {
    if (x0 >= bx + b[0] && x0 <= bx + b[3] && y0 >= by + b[1] && y0 <= by + b[4] && z0 >= bz + b[2] && z0 <= bz + b[5]) {
      // (vanilla: the hit a thousandth of the way along)
      return [x0 + (x1 - x0) * 0.001, y0 + (y1 - y0) * 0.001, z0 + (z1 - z0) * 0.001];
    }
  }
  const h = clipBlocks(level.world, x0, y0, z0, x1, y1, z1);
  return h ? [h.px, h.py, h.pz] : null;
}

/** vanilla BreezeUtil.hasLineOfSight: nothing in the way from its feet to there, within 50 blocks */
function hasLineOfSight(b: Breeze, x: number, y: number, z: number): boolean {
  if (Math.hypot(x - b.x, y - b.y, z - b.z) > MAX_SIGHT) return false;
  return clipCollider(b.level, b.x, b.y, b.z, x, y, z) === null;
}

/** vanilla BreezeUtil.randomPointBehindTarget: four to eight blocks behind where they look (give or take 45 degrees) */
function randomPointBehindTarget(t: LivingEntity, r: Rand): Pos {
  const f = (t.headYaw + 180 + (r.gaussian() * 90) / 2) * RAD;
  const d = 4 + r.nextFloat() * 4;
  return [t.x - Math.sin(f) * d, t.y, t.z + Math.cos(f) * d];
}

/** vanilla LongJump.snapToSurface: the spot over the ground within ten blocks down (else the block over one within ten up) */
function snapToSurface(b: Breeze, x: number, y: number, z: number): Pos | null {
  // (vanilla BlockPos.containing(hit).above(); the face met is a whole or half block, kept from rounding under it)
  const above = (h: Pos): Pos => [Math.floor(h[0]), Math.floor(h[1] + 1e-7) + 1, Math.floor(h[2])];
  const down = clipCollider(b.level, x, y, z, x, y - 10, z);
  if (down) return above(down);
  const up = clipCollider(b.level, x, y, z, x, y + 10, z);
  return up ? above(up) : null;
}

/** vanilla Swim.shouldSwim with a breeze's fluid jump threshold (its eye height): in water over its eyes, or lava */
const shouldSwim = (b: Breeze): boolean => (b.inWater && b.fluidHeightWater > b.eyeHeight) || b.inLava;

/**
 * vanilla LongJumpUtil.calculateJumpVectorForAngle (with no check for a clear way): the leap to half a block short of
 * (tx, ty, tz) at `angle` degrees, if one no faster than 1.4 gets there; scaled to 95 %
 */
function jumpVector(b: Breeze, tx: number, ty: number, tz: number, angle: number): Pos | null {
  const hx = tx - b.x, hz = tz - b.z;
  const hl = Math.hypot(hx, hz);
  const vx = hx - (hl > 1e-4 ? (hx / hl) * 0.5 : 0), vy = ty - b.y, vz = hz - (hl > 1e-4 ? (hz / hl) * 0.5 : 0);
  const f = angle * RAD;
  const d0 = Math.atan2(vz, vx);
  const d1 = vx * vx + vz * vz;
  const d2 = Math.sqrt(d1);
  const d11 = (d1 * 0.08) / (d2 * Math.sin(2 * f) - 2 * vy * Math.cos(f) ** 2);
  if (!(d11 >= 0)) return null;
  const d12 = Math.sqrt(d11);
  if (d12 > MAX_JUMP_VELOCITY) return null;
  const d13 = d12 * Math.cos(f), d14 = d12 * Math.sin(f);
  return [d13 * Math.cos(d0) * 0.95, d14 * 0.95, d13 * Math.sin(d0) * 0.95];
}

/** vanilla LongJump.calculateOptimalJumpVector: the angles in a random order (Util.shuffledCopy), the first that works */
function optimalJumpVector(b: Breeze, tx: number, ty: number, tz: number): Pos | null {
  const angles = [...JUMP_ANGLES];
  for (let i = angles.length; i > 1; i--) {
    const j = b.random.nextInt(i);
    [angles[i - 1], angles[j]] = [angles[j], angles[i - 1]];
  }
  for (const a of angles) {
    const v = jumpVector(b, tx, ty, tz, a);
    if (v) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// its behaviours

/** vanilla Swim(0.8): deep in water (over its eyes) or in lava, it paddles up most ticks */
function breezeSwim(chance: number): BehaviorControl<Breeze> {
  return new Behavior<Breeze>({
    canStart: shouldSwim,
    canStillUse: shouldSwim,
    tick: (b) => {
      if (b.random.nextFloat() < chance) b.jumpControl.jump();
    },
  });
}

/** vanilla StartAttacking.create(targetFinder): with no target yet, the one found (if it may attack them) */
function startAttacking(find: (b: Breeze) => LivingEntity | null): BehaviorControl<Breeze> {
  return oneShot<Breeze>((b) => {
    if (b.attackTarget) return false;
    const t = find(b);
    if (!t || !b.canAttack(t)) return false;
    b.attackTarget = t;
    b.cantReachWalkTargetSince = -1;
    return true;
  });
}

/**
 * vanilla StopAttackingIfTargetInvalid.create(target -> !Sensor.isEntityAttackable(breeze, target)): gone, dead, out
 * of sight or more than 16 blocks off, no longer something it attacks, or out of reach ten seconds, and it's forgotten
 */
function stopAttackingIfTargetInvalid(): BehaviorControl<Breeze> {
  return oneShot<Breeze>((b, now) => {
    const t = b.attackTarget;
    if (!t) return false;
    const tired = b.cantReachWalkTargetSince >= 0 && now - b.cantReachWalkTargetSince > 200;
    if (!(b.canAttack(t) && !tired && t.isAlive && !t.removed && t.level === b.level && b.isAttackable(t))) b.attackTarget = null;
    return true;
  });
}

/** vanilla BreezeAi.SlideToTargetSink(20, 40): walking anywhere is a slide (its whoosh, the SLIDING pose), a second or two at a time */
function slideToTargetSink(): BehaviorControl<Breeze> {
  return moveToTargetSink<Breeze>({
    min: 20,
    max: 40,
    start: (b) => {
      b.playSound('entity.breeze.slide', 1, 1);
      b.setPose('sliding');
    },
    stop: (b) => {
      b.setPose('standing');
      // (at the end of a slide in a fight, it fires)
      if (b.attackTarget) b.ttl.shoot = 60;
    },
  });
}

/**
 * vanilla Shoot (a second): standing, its target between 2 and 16 blocks off (else it gives up on firing), told to
 * fire, and not cooling down, it takes a breath (the SHOOTING pose), eyes locked on the target; three quarters of a
 * second on, facing them, it spits a wind charge from its snout at their middle (their chest if riding) at 0.7 a tick,
 * worse aimed the harder the game (vanilla's own sum: 5 less 4 a step of difficulty); half a second's cooldown after
 */
function shoot(): BehaviorControl<Breeze> {
  return new Behavior<Breeze>({
    min: SHOOT_INITIAL_DELAY + 1 + SHOOT_RECOVER_DELAY,
    canStart: (b) => {
      const m = b.ttl;
      const t = b.attackTarget;
      if (!t || m.shootCooldown >= 0 || m.shootCharging >= 0 || m.shootRecovering >= 0 || m.shoot < 0 || b.walkTarget || b.jumpTarget) return false;
      if (b.pose !== 'standing') return false;
      const d = t.distanceToSqr(b.x, b.y, b.z);
      const ok = d > 4 && d < 256;
      if (!ok) m.shoot = -1;
      return ok;
    },
    canStillUse: (b) => b.attackTarget !== null && b.ttl.shoot >= 0,
    start: (b) => {
      if (b.attackTarget) b.setPose('shooting');
      b.ttl.shootCharging = SHOOT_INITIAL_DELAY;
      b.playSound('entity.breeze.inhale', 1, 1);
    },
    tick: (b) => {
      const t = b.attackTarget;
      if (!t) return;
      b.lookAt(t.x, t.y, t.z);
      const m = b.ttl;
      if (m.shootCharging >= 0 || m.shootRecovering >= 0) return;
      m.shootRecovering = SHOOT_RECOVER_DELAY;
      if (!isFacingTarget(b, t)) return;
      const sy = b.snoutY();
      const c = new BreezeWindCharge(b.level, b);
      c.moveTo(b.x, sy, b.z, 0, 0);
      b.playSound('entity.breeze.shoot', 1.5, 1);
      c.shoot(t.x - b.x, t.y + t.height * (t.vehicle ? 0.8 : 0.3) - sy, t.z - b.z, 0.7, 5 - DIFFICULTY_ID[b.level.difficulty] * 4);
      b.level.addEntity(c);
    },
    stop: (b) => {
      if (b.pose === 'shooting') b.setPose('standing');
      b.ttl.shootCooldown = SHOOT_COOLDOWN;
      b.ttl.shoot = -1;
    },
  });
}

/** vanilla Shoot.isFacingTarget: its look within 60 degrees of the way to them */
function isFacingTarget(b: Breeze, t: LivingEntity): boolean {
  const p = b.pitch * RAD, y = b.headYaw * RAD;
  const vx = -Math.sin(y) * Math.cos(p), vy = -Math.sin(p), vz = Math.cos(y) * Math.cos(p);
  const dx = t.x - b.x, dy = t.y - b.y, dz = t.z - b.z;
  const l = Math.hypot(dx, dy, dz);
  return l >= 1e-5 && (vx * dx + vy * dy + vz * dz) / l > 0.5;
}

/**
 * vanilla LongJump.canRun: on the ground (or in shallow water), with a spot to land already, or else a target 4 to 24
 * blocks off (farther and it's forgotten), four blocks of air or water over its head, and a spot behind them on the
 * ground within ten blocks up or down, not on anything harmful, that it can see (or see four blocks over)
 */
function canRun(b: Breeze): boolean {
  if (!b.onGround && !b.inWater) return false;
  if (shouldSwim(b)) return false;
  if (b.jumpTarget) return true;
  const t = b.attackTarget;
  if (!t) return false;
  const d2 = t.distanceToSqr(b.x, b.y, b.z);
  if (d2 >= SENSOR_RADIUS * SENSOR_RADIUS) {
    b.attackTarget = null;
    return false;
  }
  if (Math.sqrt(d2) - 4 <= 0) return false;
  const w = b.level.world;
  const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z);
  for (let i = 1; i <= 4; i++) {
    const st = w.getState(bx, by + i, bz);
    if (!(FLAGS[st] & F_AIR) && fluidType(st) !== FLUID_WATER) return false;
  }
  const [px, py, pz] = randomPointBehindTarget(t, b.random);
  const p = snapToSurface(b, px, py, pz);
  if (!p) return false;
  if (isBlockDangerous(w.getState(p[0], p[1] - 1, p[2]))) return false;
  if (!hasLineOfSight(b, p[0] + 0.5, p[1] + 0.5, p[2] + 0.5) && !hasLineOfSight(b, p[0] + 0.5, p[1] + 4.5, p[2] + 0.5)) return false;
  b.jumpTarget = p;
  return true;
}

/**
 * vanilla LongJump (at most ten seconds): it breathes in half a second (the INHALING pose, eyes on the spot), then
 * leaps for it (the LONG_JUMPING pose, nothing slowing it but its fall) along the first arc of 40-80 degrees that
 * gets there; landing (or back in water, having left it) it thumps down and fires within five seconds, and won't leap
 * again for half a second (a tenth, if it was hurt lately). With no arc that works, it gives up
 */
function longJump(): BehaviorControl<Breeze> {
  return new Behavior<Breeze>({
    min: 200,
    canStart: (b) => !!b.attackTarget && b.ttl.jumpCooldown < 0 && b.ttl.shoot < 0 && !b.walkTarget && canRun(b),
    canStillUse: (b) => b.pose !== 'standing' && b.ttl.jumpCooldown < 0,
    start: (b) => {
      if (b.ttl.jumpInhaling < 0) b.ttl.jumpInhaling = INHALING_DURATION;
      b.setPose('inhaling');
      b.playSound('entity.breeze.charge', 1, 1);
      const j = b.jumpTarget;
      if (j) b.lookAt(j[0] + 0.5, j[1] + 0.5, j[2] + 0.5);
    },
    tick: (b) => {
      const inWater = b.inWater;
      if (!inWater && b.leavingWater) b.leavingWater = false;
      if (b.ttl.jumpInhaling < 0 && b.pose === 'inhaling') {
        const j = b.jumpTarget;
        const v = j ? optimalJumpVector(b, j[0] + 0.5, j[1], j[2] + 0.5) : null;
        if (!v) {
          b.setPose('standing');
          return;
        }
        if (inWater) b.leavingWater = true;
        b.playSound('entity.breeze.jump', 1, 1);
        b.setPose('long_jumping');
        b.yaw = b.bodyYaw;
        b.discardFriction = true;
        b.dx = v[0];
        b.dy = v[1];
        b.dz = v[2];
      } else if (b.pose === 'long_jumping' && (b.onGround || (b.inWater && !b.leavingWater))) {
        b.playSound('entity.breeze.land', 1, 1);
        b.setPose('standing');
        b.discardFriction = false;
        b.ttl.jumpCooldown = b.hurtBy !== null ? 2 : 10;
        b.ttl.shoot = 100;
      }
    },
    stop: (b) => {
      if (b.pose === 'long_jumping' || b.pose === 'inhaling') b.setPose('standing');
      b.jumpTarget = null;
      b.ttl.jumpInhaling = -1;
      b.leavingWater = false;
    },
  });
}

/** vanilla ShootWhenStuck: wanting to leap but riding something, in water or floating, it fires instead within three seconds */
function shootWhenStuck(): BehaviorControl<Breeze> {
  return new Behavior<Breeze>({
    canStart: (b) =>
      !!b.attackTarget && b.ttl.jumpInhaling < 0 && b.jumpTarget !== null && !b.walkTarget && b.ttl.shoot < 0 && (b.vehicle !== null || b.inWater || b.hasEffect('levitation')),
    start: (b) => {
      b.ttl.shoot = 60;
    },
  });
}

/**
 * vanilla Slide: standing on dry ground in a fight, not about to fire or leap, it picks where to slide: away (up to
 * five blocks, somewhere it sees that's farther from them) if its target is within four across and ten up or down,
 * else as likely a spot behind them as one in a ring four to eight blocks short of them
 */
function slide(): BehaviorControl<Breeze> {
  return new Behavior<Breeze>({
    canStart: (b) => !!b.attackTarget && !b.walkTarget && b.ttl.jumpCooldown < 0 && b.ttl.shoot < 0 && b.onGround && !b.inWater && b.pose === 'standing',
    start: (b) => {
      const t = b.attackTarget;
      if (!t) return;
      let p: Pos | null = null;
      if (b.withinInnerCircleRange(t.x, t.y, t.z)) {
        // (vanilla DefaultRandomPos.getPosAway: within 90 degrees of straight away from them)
        const away = defaultRandomPosTowards(b, 5, 5, 2 * b.x - t.x, 2 * b.z - t.z, Math.PI / 2);
        if (away) {
          const v: Pos = [away[0] + 0.5, away[1], away[2] + 0.5];
          if (hasLineOfSight(b, v[0], v[1], v[2]) && t.distanceToSqr(v[0], v[1], v[2]) > t.distanceToSqr(b.x, b.y, b.z)) p = v;
        }
      }
      p ??= b.random.nextBool() ? randomPointBehindTarget(t, b.random) : randomPointInMiddleCircle(b, t);
      b.walkTarget = { t: { pos: [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])] }, speed: 0.6, closeEnough: 1 };
    },
  });
}

/** vanilla Slide.randomPointInMiddleCircle: along the way to them, four to eight blocks short of them */
function randomPointInMiddleCircle(b: Breeze, t: LivingEntity): Pos {
  const vx = t.x - b.x, vy = t.y - b.y, vz = t.z - b.z;
  const l = Math.hypot(vx, vy, vz);
  const d = l - (8 - b.random.nextDouble() * 4);
  const n = l < 1e-5 ? 0 : d / l;
  return [b.x + vx * n, b.y + vy * n, b.z + vz * n];
}

/** vanilla BreezeAi.makeBrain */
function makeBrain(): Brain<Breeze, Activity> {
  const brain = new Brain<Breeze, Activity>('fight', ['core']);
  brain.add('core', [
    [0, breezeSwim(0.8)],
    [0, lookAtTargetSink<Breeze>(45, 90)],
  ]);
  brain.add('idle', [
    [0, startAttacking((b) => b.nearestAttackable)],
    [1, startAttacking((b) => b.hurtBySource)],
    [2, slideToTargetSink()],
    [3, runOne<Breeze>([[doNothing<Breeze>(20, 100), 1], [randomStroll<Breeze>(0.6), 2]])],
  ]);
  brain.add(
    'fight',
    [
      [0, stopAttackingIfTargetInvalid()],
      [1, shoot()],
      [2, longJump()],
      [3, shootWhenStuck()],
      [4, slide()],
    ],
    (b) => b.attackTarget !== null && b.walkTarget === null,
  );
  return brain;
}

// ---------------------------------------------------------------------------

/** vanilla Breeze's PROJECTILE_DEFLECTION: the breeze's whoosh, and the projectile sent back the way it came */
const BREEZE_DEFLECTION: Deflection = (p, by) => {
  by.level.sound.play('entity.breeze.deflect', by.x, by.y, by.z, 1, 1);
  REVERSE(p, by);
};

export class Breeze extends Monster {
  readonly type = 'breeze';
  /** vanilla Pose */
  pose: BreezePose = 'standing';
  /**
   * vanilla shoot, slide, slideBack, longJump and inhale (AnimationState): the tick each started, -1 while stopped
   * (render/breezeRenderer.ts plays them)
   */
  shootAnimStart = -1;
  slideAnimStart = -1;
  slideBackAnimStart = -1;
  jumpAnimStart = -1;
  inhaleAnimStart = -1;
  /** vanilla jumpTrailStartedTick: the leap's first ticks trail dust */
  private jumpTrailStartedTick = 0;
  /** vanilla soundTick: ticks to its next whirl */
  private soundTick = 0;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  attackTarget: LivingEntity | null = null;
  /** NEAREST_ATTACKABLE (BreezeAttackEntitySensor) */
  nearestAttackable: LivingEntity | null = null;
  /** HURT_BY (the damage's kind) and HURT_BY_ENTITY */
  hurtBy: string | null = null;
  hurtByEntity: LivingEntity | null = null;
  /** who HURT_BY's damage came from, if anyone living (vanilla Breeze.getHurtBy) */
  hurtBySource: LivingEntity | null = null;
  /**
   * BREEZE_SHOOT, BREEZE_SHOOT_CHARGING, BREEZE_SHOOT_RECOVERING, BREEZE_SHOOT_COOLDOWN, BREEZE_JUMP_COOLDOWN and
   * BREEZE_JUMP_INHALING: the ticks each has left (vanilla ExpirableValue), -1 while it's absent
   */
  readonly ttl = { shoot: -1, shootCharging: -1, shootRecovering: -1, shootCooldown: -1, jumpCooldown: -1, jumpInhaling: -1 };
  /** BREEZE_JUMP_TARGET: where it means to land */
  jumpTarget: Pos | null = null;
  /** BREEZE_LEAVING_WATER: it leapt from water, and hasn't cleared it yet */
  leavingWater = false;

  private readonly brain = makeBrain();
  /** vanilla Sensor timing, for its sensors (nearest living, hurt by, nearest players, breeze attack entity) */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.77);
    // vanilla Breeze.createAttributes: 30 health, 0.63 speed, 24 follow range, 3 attack damage; 10 experience
    this.maxHealth = this.health = 30;
    this.moveSpeedAttr = 0.63;
    this.followRange = 24;
    this.attackDamage = 3;
    this.xpReward = 10;
    this.setPathfindingMalus(PathType.DANGER_TRAPDOOR, -1);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, -1);
    this.sensors = new SensorClock(this.random, 4);
    // (vanilla setDefaultActivity(FIGHT), useDefaultActivity)
    this.brain.setActiveActivityIfPossible('fight', this);
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  /** vanilla EntityType.BREEZE's eye height */
  override get eyeHeight(): number {
    return 1.3452;
  }

  /** vanilla getSnoutYPosition: where its wind charges come from */
  snoutY(): number {
    return this.y + this.height / 2 + 0.3;
  }

  override maxHeadYRot(): number {
    return 30;
  }
  override headRotSpeed(): number {
    return 25;
  }

  /** vanilla canAttackType: players and iron golems, and nothing else */
  canAttackType(e: LivingEntity): boolean {
    return e.type === 'player' || e.type === 'iron_golem';
  }

  /** vanilla Sensor.isEntityAttackable (TargetingConditions.forCombat, 16 blocks, in sight) for a breeze */
  isAttackable(e: LivingEntity): boolean {
    return this.canAttackType(e) && isEntityTargetable(this, e, true);
  }

  /** vanilla withinInnerCircleRange: within four blocks across and ten up or down of the middle of its block */
  withinInnerCircleRange(x: number, y: number, z: number): boolean {
    const cx = Math.floor(this.x) + 0.5, cy = Math.floor(this.y) + 0.5, cz = Math.floor(this.z) + 0.5;
    return (x - cx) ** 2 + (z - cz) ** 2 < 16 && Math.abs(y - cy) < 10;
  }

  /** vanilla Entity.lookAt(EYES, pos): turned to face it at once, head, body's heading and all */
  lookAt(x: number, y: number, z: number): void {
    const dx = x - this.x, dy = y - (this.y + this.eyeHeight), dz = z - this.z;
    this.pitch = this.pitchO = wrapDegrees(-(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) / RAD));
    this.yaw = this.yawO = wrapDegrees(Math.atan2(dz, dx) / RAD - 90);
    this.headYaw = this.yaw;
  }

  /** vanilla setPose, and its client's onSyncedDataUpdated(DATA_POSE): the pose's own animation starts, the rest stop */
  setPose(p: BreezePose): void {
    if (this.pose === p) return;
    this.pose = p;
    // (vanilla resetAnimations: the shot, the breath and the leap; a slide plays out on its own)
    this.shootAnimStart = this.inhaleAnimStart = this.jumpAnimStart = -1;
    if (p === 'shooting') this.shootAnimStart = this.tickCount;
    else if (p === 'inhaling') this.inhaleAnimStart = this.tickCount;
    else if (p === 'sliding' && this.slideAnimStart < 0) this.slideAnimStart = this.tickCount;
  }

  /**
   * vanilla Breeze.tick: the dust it raises (a puff most ticks standing, a cloud sliding, a trail as it leaps), the
   * slide's animation giving way to sliding back once it stops, and its whirl every tick to four seconds
   */
  override tick(): void {
    switch (this.pose) {
      case 'shooting':
      case 'inhaling':
      case 'standing':
        this.jumpTrailStartedTick = 0;
        this.emitGroundParticles(1);
        break;
      case 'sliding':
        this.emitGroundParticles(20);
        break;
      case 'long_jumping':
        if (this.jumpAnimStart < 0) this.jumpAnimStart = this.tickCount;
        this.emitJumpTrailParticles();
        break;
    }
    if (this.pose !== 'sliding' && this.slideAnimStart >= 0) {
      this.slideBackAnimStart = this.tickCount;
      this.slideAnimStart = -1;
    }
    this.soundTick = this.soundTick === 0 ? 1 + this.random.nextInt(80) : this.soundTick - 1;
    if (this.soundTick === 0) this.playWhirlSound();
    super.tick();
  }

  /** vanilla getInBlockState if it isn't air, else getBlockStateOn */
  private dustState(): [number, number, number, number] {
    const w = this.level.world;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const st = w.getState(bx, by, bz);
    if (!(FLAGS[st] & F_AIR)) return [st, bx, by, bz];
    const oy = Math.floor(this.y - 1e-5);
    return [w.getState(bx, oy, bz), bx, oy, bz];
  }

  /** vanilla emitGroundParticles: dust of the ground at its feet (not while it rides, nor of what isn't drawn) */
  private emitGroundParticles(count: number): void {
    if (this.vehicle) return;
    const [st, bx, by, bz] = this.dustState();
    if (invisibleBlock(st)) return;
    const cx = (this.bb.minX + this.bb.maxX) / 2, cz = (this.bb.minZ + this.bb.maxZ) / 2;
    for (let i = 0; i < count; i++) this.level.particles.blockParticle?.(cx, this.y, cz, 0, 0, 0, st, bx, by, bz);
  }

  /** vanilla emitJumpTrailParticles: for the leap's first five ticks, three motes of dust where it's headed */
  private emitJumpTrailParticles(): void {
    if (++this.jumpTrailStartedTick > 5) return;
    const [st, bx, by, bz] = this.dustState();
    const x = this.x + this.dx, y = this.y + this.dy + 0.1, z = this.z + this.dz;
    for (let i = 0; i < 3; i++) this.level.particles.blockParticle?.(x, y, z, 0, 0, 0, st, bx, by, bz);
  }

  /** vanilla playWhirlSound */
  private playWhirlSound(): void {
    const pitch = 0.7 + 0.4 * this.random.nextFloat();
    const volume = 0.8 + 0.2 * this.random.nextFloat();
    this.playSound('entity.breeze.whirl', volume, pitch);
  }

  // --- the brain ------------------------------------------------------------

  activity(): Activity | null {
    return this.brain.activeNonCore();
  }

  /** vanilla Brain.forgetOutdatedMemories: the memories that run out, a tick less each (gone once they're at nothing) */
  private forgetOutdatedMemories(): void {
    const t = this.ttl;
    for (const k of Object.keys(t) as (keyof typeof t)[]) {
      if (t[k] === 0) t[k] = -1;
      else if (t[k] > 0) t[k]--;
    }
  }

  /**
   * vanilla BreezeAttackEntitySensor: the living within 24 (it takes those as the ones near it, as a NearestLiving
   * sensor would), and the nearest of them, not in creative or spectating, it may attack
   */
  private senseAttackables(): void {
    const r = SENSOR_RADIUS;
    const near = this.level.getEntities(this.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, this) as LivingEntity[];
    near.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    this.nearestLiving = near;
    this.visibleLiving = near.filter((e) => isEntityTargetable(this, e));
    const creativeOrSpectator = (e: LivingEntity) => {
      const gm = (e as { gameMode?: string }).gameMode;
      return gm === 'creative' || gm === 'spectator';
    };
    this.nearestAttackable = near.find((e) => !creativeOrSpectator(e) && this.isAttackable(e)) ?? null;
  }

  /** vanilla Brain.tickSensors: each sensor once a second */
  private sense(): void {
    const c = this.sensors;
    if (c.due(0)) senseNearestLiving(this);
    if (c.due(1)) {
      senseHurtBy(this);
      this.hurtBySource = this.hurtBy !== null && this.lastDamageEntity instanceof LivingEntity ? this.lastDamageEntity : null;
    }
    // (vanilla NEAREST_PLAYERS: nothing of its own reads them)
    c.due(2);
    if (c.due(3)) this.senseAttackables();
  }

  /** vanilla Breeze.customServerAiStep: its brain, then the first of fight and idle that may run */
  protected override customServerAiStep(): void {
    const now = this.level.gameTime;
    this.forgetOutdatedMemories();
    this.sense();
    this.brain.tick(this, now);
    this.brain.setActiveActivityToFirstValid(['fight', 'idle'], this);
    super.customServerAiStep();
    // (vanilla getTarget: its brain's ATTACK_TARGET)
    this.target = this.attackTarget;
  }

  // --- being hurt -------------------------------------------------------------

  /** vanilla isInvulnerableTo: nothing a breeze does (its wind charges above all) hurts it */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (attacker instanceof Breeze) return false;
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla causeFallDamage (#fall_damage_immune): no harm, but a thump when it comes down from over three blocks */
  protected override causeFallDamage(dist: number): void {
    if (dist > 3) this.playSound('entity.breeze.land', 1, 1);
  }

  // --- sounds -----------------------------------------------------------------

  /** vanilla playAmbientSound: only with nothing to fight, or up in the air */
  override playAmbientSound(): void {
    if (!this.attackTarget || !this.onGround) this.playSound(this.ambientSound(), 1, 1);
  }
  override ambientSound(): string {
    return this.onGround ? 'entity.breeze.idle_ground' : 'entity.breeze.idle_air';
  }
  override hurtSound(): string {
    return 'entity.breeze.hurt';
  }
  override deathSound(): string {
    return 'entity.breeze.death';
  }
  /** vanilla MovementEmission.EVENTS: no footsteps */
  protected override makesStepSounds(): boolean {
    return false;
  }

  // --- loot -------------------------------------------------------------------

  /**
   * vanilla loot table entities/breeze: when a player kills it, one or two breeze rods, and one or two more for each
   * level of Looting (enchanted_count_increase, uniform 1-2)
   */
  protected override dropLoot(byPlayer: boolean, looting = 0): void {
    if (!byPlayer) return;
    const r = this.random;
    let n = 1 + r.nextInt(2);
    if (looting > 0) n += Math.round(looting * (1 + r.nextFloat()));
    const it = ITEMS.get('breeze_rod');
    if (it) this.spawnAtLocation(new ItemStack(it, n));
  }
}

// vanilla Breeze.deflection: everything but a wind charge is turned back
DEFLECTIONS.breeze = (p) => (p instanceof AbstractWindCharge ? null : BREEZE_DEFLECTION);
