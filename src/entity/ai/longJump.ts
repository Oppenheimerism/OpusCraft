// Vanilla's long jumps (ai.behavior.LongJumpToRandomPos, LongJumpToPreferredBlock, LongJumpMidJump and LongJumpUtil,
// 1.21), for the brains that leap (entity/ai/brain.ts): now and then, standing on the ground, it picks a spot within
// reach that it couldn't walk to (farther spots likelier, and half the time one over the blocks it likes), eyes it for
// two seconds, and leaps there along the first clear arc of 65-80 degrees it finds, pulled small (the LONG_JUMPING
// pose) and with nothing slowing it but its fall until it lands.

import type { Mob } from '../mob';
import type { Rand } from '../../core/rng';
import { AABB } from '../../core/aabb';
import { Behavior, type BehaviorControl } from './brain';
import type { BrainMemories, Pos } from './brainBehaviors';
import { BLOCKS, STATE_BLOCK, FLAGS, F_OPAQUE } from '../../world/block';

/** the memories and body a long jumper has (vanilla LONG_JUMP_COOLDOWN_TICKS, LONG_JUMP_MID_JUMP, the LONG_JUMPING pose) */
export interface LongJumpMemories extends BrainMemories {
  /** LONG_JUMP_COOLDOWN_TICKS (-1: none) */
  longJumpCooldown: number;
  longJumpMidJump: boolean;
  /** vanilla setPose(LONG_JUMPING) and back to STANDING */
  setLongJumping(on: boolean): void;
  /** vanilla getDimensions(LONG_JUMPING): [width, height] */
  longJumpSize(): [number, number];
}
export type LongJumpMob = Mob & LongJumpMemories;

/** vanilla UniformInt.sample */
export const sampleRange = (r: Rand, [lo, hi]: [number, number]): number => lo + r.nextInt(hi - lo + 1);

/** vanilla LivingEntity.getJumpBoostPower */
const jumpBoostPower = (e: Mob): number => {
  const a = e.effectAmp('jump_boost');
  return a >= 0 ? 0.1 * (a + 1) : 0;
};

/**
 * vanilla LongJumpMidJump(between, landing sound), at most five seconds: from the leap till it's on the ground again,
 * small and with its friction off; landing, it all but stops (a tenth of its speed kept) with a thud, and won't leap
 * again for `between` ticks
 */
export function longJumpMidJump<E extends LongJumpMob>(between: [number, number], landing: (e: E) => string): BehaviorControl<E> {
  return new Behavior<E>({
    min: 100,
    max: 100,
    canStart: (e) => e.longJumpMidJump,
    start: (e) => {
      e.discardFriction = true;
      e.setLongJumping(true);
    },
    canStillUse: (e) => !e.onGround,
    stop: (e) => {
      if (e.onGround) {
        e.dx *= 0.1;
        e.dz *= 0.1;
        e.playSound(landing(e), 2, 1);
      }
      e.discardFriction = false;
      e.setLongJumping(false);
      e.longJumpMidJump = false;
      e.longJumpCooldown = sampleRange(e.level.random, between);
    },
  });
}

export interface LongJumpOptions<E> {
  /** vanilla timeBetweenLongJumps */
  between: [number, number];
  /** how far up or down, and across, it looks */
  maxHeight: number;
  maxWidth: number;
  /** vanilla maxJumpVelocityMultiplier (times its jump strength, 0.42) */
  velocity: number;
  sound: (e: E) => string;
  /** vanilla LongJumpToPreferredBlock: the blocks it likes to land on (by name), and how often it looks for those first */
  preferred?: { on: (name: string) => boolean; chance: number };
  /** vanilla acceptableLandingSpot (default: defaultAcceptableLandingSpot) */
  acceptable?: (e: E, x: number, y: number, z: number) => boolean;
}

/** vanilla LongJumpToRandomPos.defaultAcceptableLandingSpot: on a solid block, somewhere it would happily walk */
export function defaultAcceptableLandingSpot(e: Mob, x: number, y: number, z: number): boolean {
  return (FLAGS[e.level.world.getState(x, y - 1, z)] & F_OPAQUE) !== 0 && e.malus(e.navigation.staticTypeAt(x, y, z)) === 0;
}

/** vanilla ALLOWED_ANGLES */
const ANGLES = [65, 70, 75, 80];
/** vanilla LivingEntity.getGravity */
const GRAVITY = 0.08;

/**
 * vanilla LongJumpUtil.calculateJumpVectorForAngle: the leap from where it stands to half a block short of `target`
 * (its middle) at `angle` degrees, if one no faster than `max` gets there, checked (at twice as many points as it
 * takes ticks) for a clear way through for it pulled small; scaled to 95 %
 */
export function jumpVectorForAngle(e: LongJumpMob, tx: number, ty: number, tz: number, max: number, angle: number): Pos | null {
  const hx = tx - e.x, hz = tz - e.z;
  const hl = Math.hypot(hx, hz);
  // (half a block short of it, along the way there)
  const vx = hx - (hl > 1e-4 ? (hx / hl) * 0.5 : 0), vy = ty - e.y, vz = hz - (hl > 1e-4 ? (hz / hl) * 0.5 : 0);
  const f = (angle * Math.PI) / 180;
  const d0 = Math.atan2(vz, vx);
  const d1 = vx * vx + vz * vz;
  const d2 = Math.sqrt(d1);
  const d5 = Math.sin(2 * f), d6 = Math.cos(f) ** 2, d7 = Math.sin(f), d8 = Math.cos(f);
  const d9 = Math.sin(d0), d10 = Math.cos(d0);
  const d11 = (d1 * GRAVITY) / (d2 * d5 - 2 * vy * d6);
  if (!(d11 >= 0)) return null;
  const d12 = Math.sqrt(d11);
  if (d12 > max) return null;
  const d13 = d12 * d8, d14 = d12 * d7;
  const n = Math.ceil(d2 / d13) * 2;
  let s = 0;
  let prev: Pos | null = null;
  const [w, h] = e.longJumpSize();
  for (let j = 0; j < n - 1; j++) {
    s += d2 / n;
    const d16 = (d7 / d8) * s - (s * s * GRAVITY) / (2 * d11 * d8 * d8);
    const cur: Pos = [e.x + s * d10, e.y + d16, e.z + s * d9];
    if (prev && !clearTransition(e, w, h, prev, cur)) return null;
    prev = cur;
  }
  return [d13 * d10 * 0.95, d14 * 0.95, d13 * d9 * 0.95];
}

/** vanilla LongJumpUtil.isClearTransition: nothing in the way between two points of the arc, a step of its own size at a time */
function clearTransition(e: Mob, w: number, h: number, a: Pos, b: Pos): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const step = Math.min(w, h);
  const n = Math.ceil(len / step);
  let [x, y, z] = a;
  for (let j = 0; j < n; j++) {
    if (j === n - 1) [x, y, z] = b;
    else {
      x += (dx / len) * step * 0.9;
      y += (dy / len) * step * 0.9;
      z += (dz / len) * step * 0.9;
    }
    if (e.collisionBoxes(new AABB(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2)).length) return false;
  }
  return true;
}

/**
 * vanilla LongJumpToRandomPos / LongJumpToPreferredBlock (at most ten seconds): on the ground, out of water, it looks
 * over every block within `maxWidth` across and `maxHeight` up or down (the farther, the likelier each is picked; half
 * the time — `preferred.chance` — ones over the blocks it likes first, and else just one other), for somewhere it may
 * land that it couldn't walk to within 8 blocks; eyes it for two seconds, standing stock still, then leaps (with its
 * sound). Moved, or finding nowhere, it gives up and tries again in half the usual time
 */
export function longJumpToRandomPos<E extends LongJumpMob>(o: LongJumpOptions<E>): BehaviorControl<E> {
  const acceptable = o.acceptable ?? defaultAcceptableLandingSpot;
  let candidates: { p: Pos; w: number }[] = [];
  let total = 0;
  let notPreferred: { p: Pos; w: number }[] = [];
  let wantPreferred = false;
  let initial: Pos | null = null;
  let chosen: Pos | null = null;
  let tries = 0;
  let prepareStart = 0;

  /** vanilla WeightedRandom.getRandomItem, then taken off the list */
  const draw = (r: Rand): { p: Pos; w: number } | null => {
    if (total <= 0) return null;
    let k = r.nextInt(total);
    for (let i = 0; i < candidates.length; i++) {
      k -= candidates[i].w;
      if (k < 0) {
        const c = candidates[i];
        candidates.splice(i, 1);
        total -= c.w;
        return c;
      }
    }
    return null;
  };
  /** vanilla getJumpCandidate (LongJumpToPreferredBlock's: one over a liked block, else the first other one drawn) */
  const candidate = (e: E): { p: Pos; w: number } | null => {
    if (!o.preferred || !wantPreferred) return draw(e.level.random);
    const world = e.level.world;
    while (candidates.length) {
      const c = draw(e.level.random);
      if (!c) break;
      if (o.preferred.on(BLOCKS[STATE_BLOCK[world.getState(c.p[0], c.p[1] - 1, c.p[2])]].name)) return c;
      notPreferred.push(c);
    }
    return notPreferred.shift() ?? null;
  };
  /** vanilla calculateOptimalJumpVector: the angles in a random order, the first that works */
  const jumpVector = (e: E, x: number, y: number, z: number): Pos | null => {
    const angles = [...ANGLES];
    for (let i = angles.length; i > 1; i--) {
      const j = e.random.nextInt(i);
      [angles[i - 1], angles[j]] = [angles[j], angles[i - 1]];
    }
    const max = 0.42 * o.velocity;
    for (const a of angles) {
      const v = jumpVectorForAngle(e, x, y, z, max, a);
      if (v) return v;
    }
    return null;
  };
  /** vanilla pickCandidate: through the candidates until one will do */
  const pick = (e: E, now: number): void => {
    const bx = Math.floor(e.x), bz = Math.floor(e.z);
    while (candidates.length) {
      const c = candidate(e);
      if (!c) continue;
      const [x, y, z] = c.p;
      // (vanilla isAcceptableLandingPosition: not straight up or down)
      if ((x === bx && z === bz) || !acceptable(e, x, y, z)) continue;
      // (vanilla works the leap out first, eyes the spot, then looks for a way to walk there; a spot it can walk to
      // is passed over either way, so here the walk is looked for first and the leap's far costlier arc worked out
      // only for spots it can't reach: the same spot chosen, half the work where it can walk nearly anywhere)
      const path = e.navigation.createPathToBlock(x, y, z, 0, 8);
      if (path && path.canReach()) continue;
      const v = jumpVector(e, x + 0.5, y + 0.5, z + 0.5);
      if (!v) continue;
      e.lookTarget = { pos: [x, y, z] };
      chosen = v;
      prepareStart = now;
      return;
    }
  };
  return new Behavior<E>({
    min: 200,
    max: 200,
    canStart: (e) => {
      if (e.longJumpCooldown >= 0 || e.longJumpMidJump) return false;
      const on = BLOCKS[STATE_BLOCK[e.level.world.getState(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))]].name;
      const ok = e.onGround && !e.inWater && !e.inLava && on !== 'honey_block';
      if (!ok) e.longJumpCooldown = sampleRange(e.level.random, o.between) >> 1;
      return ok;
    },
    start: (e) => {
      chosen = null;
      tries = 20;
      initial = [e.x, e.y, e.z];
      const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
      const W = o.maxWidth, H = o.maxHeight;
      candidates = [];
      total = 0;
      // (vanilla BlockPos.betweenClosed: x fastest, then y, then z)
      for (let z = bz - W; z <= bz + W; z++)
        for (let y = by - H; y <= by + H; y++)
          for (let x = bx - W; x <= bx + W; x++) {
            if (x === bx && y === by && z === bz) continue;
            const w = (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2;
            candidates.push({ p: [x, y, z], w });
            total += w;
          }
      notPreferred = [];
      wantPreferred = !!o.preferred && e.random.nextFloat() < o.preferred.chance;
    },
    canStillUse: (e) => {
      const ok = !!initial && initial[0] === e.x && initial[1] === e.y && initial[2] === e.z && tries > 0 && !e.inWater && (chosen !== null || candidates.length > 0);
      if (!ok && !e.longJumpMidJump) {
        e.longJumpCooldown = sampleRange(e.level.random, o.between) >> 1;
        e.lookTarget = null;
      }
      return ok;
    },
    tick: (e, now) => {
      if (chosen) {
        if (now - prepareStart < 40) return;
        e.yaw = e.bodyYaw;
        e.discardFriction = true;
        const len = Math.hypot(chosen[0], chosen[1], chosen[2]);
        const k = (len + jumpBoostPower(e)) / len;
        e.dx = chosen[0] * k;
        e.dy = chosen[1] * k;
        e.dz = chosen[2] * k;
        e.longJumpMidJump = true;
        e.playSound(o.sound(e), 1, 1);
      } else {
        tries--;
        pick(e, now);
      }
    },
  });
}
