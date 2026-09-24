// Common mob goals (vanilla net.minecraft.world.entity.ai.goal) and random
// position helpers (DefaultRandomPos / LandRandomPos).

import { Goal, Flag, reducedTickDelay } from './goal';
import type { Mob } from '../mob';
import type { Path } from './pathfinder';
import { LivingEntity } from '../living';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_COLLIDE, F_OPAQUE } from '../../world/block';
import { MIN_Y, MAX_Y } from '../../world/constants';
import type { Player } from '../player';
import type { Difficulty } from '../../game/difficulty';
import { AABB } from '../../core/aabb';

// ---------------------------------------------------------------------------
// random positions

type Pos = [number, number, number];

function randomDirection(m: Mob, h: number, v: number): Pos {
  const r = m.random;
  const i = r.nextInt(2 * h + 1) - h;
  const j = r.nextInt(2 * v + 1) - v;
  const k = r.nextInt(2 * h + 1) - h;
  return [i, j, k];
}

function towardDirection(m: Mob, d: Pos): Pos {
  return [Math.floor(d[0] + m.x), Math.floor(d[1] + m.y), Math.floor(d[2] + m.z)];
}

function outsideLimits(p: Pos): boolean {
  return p[1] < MIN_Y || p[1] >= MAX_Y;
}

function isSolid(m: Mob, x: number, y: number, z: number): boolean {
  return (FLAGS[m.level.world.getState(x, y, z)] & (F_COLLIDE | F_OPAQUE)) !== 0;
}

function isWater(m: Mob, x: number, y: number, z: number): boolean {
  return (FLAGS[m.level.world.getState(x, y, z)] & F_WATER) !== 0;
}

function hasMalus(m: Mob, x: number, y: number, z: number): boolean {
  m.navigation.evaluator.prepare(m.level.world, m);
  const t = m.navigation.evaluator.staticType(x, y, z);
  m.navigation.evaluator.done();
  return m.malus(t) !== 0;
}

/** vanilla RandomPos.generateRandomPos: the best-scoring of ten tries (none when every one scores -∞) */
function bestScored(gen: () => Pos | null, score: (p: Pos) => number): Pos | null {
  let best: Pos | null = null, bestV = -Infinity;
  for (let i = 0; i < 10; i++) {
    const p = gen();
    if (!p) continue;
    const v = score(p);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  return best;
}

function bestOf(m: Mob, gen: () => Pos | null): Pos | null {
  return bestScored(gen, (p) => m.walkTargetValue(p[0], p[1], p[2]));
}

/** vanilla DefaultRandomPos.getPos */
export function defaultRandomPos(m: Mob, radius: number, yRange: number): Pos | null {
  return bestOf(m, () => {
    const p = towardDirection(m, randomDirection(m, radius, yRange));
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2]) || hasMalus(m, p[0], p[1], p[2])) return null;
    return p;
  });
}

/** vanilla DefaultRandomPos.getPosAway: random position away from a point */
export function defaultRandomPosAway(m: Mob, radius: number, yRange: number, ax: number, ay: number, az: number): Pos | null {
  const vx = m.x - ax, vz = m.z - az;
  return bestOf(m, () => {
    let d = randomDirection(m, radius, yRange);
    // keep only directions pointing away (vanilla generateRandomDirectionWithinRadians, simplified)
    if (d[0] * vx + d[2] * vz < 0) d = [-d[0], d[1], -d[2]];
    const p = towardDirection(m, d);
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2]) || hasMalus(m, p[0], p[1], p[2])) return null;
    return p;
  });
}

/**
 * vanilla RandomPos.generateRandomDirectionWithinRadians: an offset within `maxAngle` of the direction (dx, dz), out
 * to √2 × radius (and dropped when it lands outside the radius square)
 */
function randomDirectionWithinRadians(m: Mob, radius: number, yRange: number, dx: number, dz: number, maxAngle: number): Pos | null {
  const r = m.random;
  const a = Math.atan2(dz, dx) - Math.PI / 2 + (2 * r.nextFloat() - 1) * maxAngle;
  const d = Math.sqrt(r.nextDouble()) * Math.SQRT2 * radius;
  const x = -d * Math.sin(a), z = d * Math.cos(a);
  if (Math.abs(x) > radius || Math.abs(z) > radius) return null;
  return [Math.floor(x), r.nextInt(2 * yRange + 1) - yRange, Math.floor(z)];
}

/** vanilla DefaultRandomPos.getPosTowards: somewhere up to `radius` off in the direction of a point */
export function defaultRandomPosTowards(m: Mob, radius: number, yRange: number, tx: number, tz: number, maxAngle: number): Pos | null {
  const vx = tx - m.x, vz = tz - m.z;
  return bestOf(m, () => {
    const d = randomDirectionWithinRadians(m, radius, yRange, vx, vz, maxAngle);
    if (!d) return null;
    const p = towardDirection(m, d);
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2]) || hasMalus(m, p[0], p[1], p[2])) return null;
    return p;
  });
}

/** vanilla LandRandomPos.getPosAway: somewhere up to `radius` off, within 90° of straight away from a point */
export function landRandomPosAway(m: Mob, radius: number, yRange: number, ax: number, az: number): Pos | null {
  const vx = m.x - ax, vz = m.z - az;
  return bestOf(m, () => {
    const d = randomDirectionWithinRadians(m, radius, yRange, vx, vz, Math.PI / 2);
    if (!d) return null;
    const p = towardDirection(m, d);
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2])) return null;
    let y = p[1];
    if (isSolid(m, p[0], y, p[2])) {
      y++;
      while (y < MAX_Y && isSolid(m, p[0], y, p[2])) y++;
    }
    if (isWater(m, p[0], y, p[2]) || hasMalus(m, p[0], y, p[2])) return null;
    return [p[0], y, p[2]];
  });
}

/** vanilla LandRandomPos.getPosTowards: somewhere up to `radius` off, within 90° of the way to a point, on land */
export function landRandomPosTowards(m: Mob, radius: number, yRange: number, tx: number, tz: number): Pos | null {
  const vx = tx - m.x, vz = tz - m.z;
  return bestOf(m, () => {
    const d = randomDirectionWithinRadians(m, radius, yRange, vx, vz, Math.PI / 2);
    if (!d) return null;
    const p = towardDirection(m, d);
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2])) return null;
    let y = p[1];
    if (isSolid(m, p[0], y, p[2])) {
      y++;
      while (y < MAX_Y && isSolid(m, p[0], y, p[2])) y++;
    }
    if (isWater(m, p[0], y, p[2]) || hasMalus(m, p[0], y, p[2])) return null;
    return [p[0], y, p[2]];
  });
}

/** vanilla LandRandomPos.getPos (with a scorer of its own, or the mob's walk target value) */
export function landRandomPos(m: Mob, radius: number, yRange: number, score?: (p: Pos) => number): Pos | null {
  return bestScored(() => {
    const p = towardDirection(m, randomDirection(m, radius, yRange));
    if (outsideLimits(p) || !m.navigation.isStableDestination(p[0], p[1], p[2])) return null;
    let y = p[1];
    if (isSolid(m, p[0], y, p[2])) {
      y++;
      while (y < MAX_Y && isSolid(m, p[0], y, p[2])) y++;
    }
    if (isWater(m, p[0], y, p[2]) || hasMalus(m, p[0], y, p[2])) return null;
    return [p[0], y, p[2]];
  }, score ?? ((p) => m.walkTargetValue(p[0], p[1], p[2])));
}

// ---------------------------------------------------------------------------
// movement goals

export class FloatGoal extends Goal {
  constructor(readonly mob: Mob) {
    super();
    this.flags = Flag.JUMP;
    mob.ownNavigation.canFloat = true;
  }
  canUse(): boolean {
    const m = this.mob;
    const th = m.eyeHeight < 0.4 ? 0 : 0.4;
    return (m.inWater && m.fluidHeightWater > th) || m.inLava;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    if (this.mob.random.nextFloat() < 0.8) this.mob.jumpControl.jump();
  }
}

export class PanicGoal extends Goal {
  protected px = 0;
  protected py = 0;
  protected pz = 0;
  isRunning = false;
  constructor(readonly mob: Mob, readonly speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  protected shouldPanic(): boolean {
    return this.mob.lastHurtByMob !== null || this.mob.isOnFire();
  }
  canUse(): boolean {
    if (!this.shouldPanic()) return false;
    if (this.mob.isOnFire()) {
      const w = this.lookForWater(5);
      if (w) {
        [this.px, this.py, this.pz] = w;
        return true;
      }
    }
    return this.findRandomPosition();
  }
  protected findRandomPosition(): boolean {
    const p = defaultRandomPos(this.mob, 5, 4);
    if (!p) return false;
    this.px = p[0] + 0.5;
    this.py = p[1];
    this.pz = p[2] + 0.5;
    return true;
  }
  private lookForWater(r: number): Pos | null {
    const m = this.mob;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    let best: Pos | null = null, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (!isWater(m, bx + dx, by + dy, bz + dz)) continue;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            best = [bx + dx, by + dy, bz + dz];
          }
        }
    return best;
  }
  override start(): void {
    this.mob.navigation.moveTo(this.px, this.py, this.pz, this.speed);
    this.isRunning = true;
  }
  override stop(): void {
    this.isRunning = false;
  }
  override canContinueToUse(): boolean {
    return !this.mob.navigation.isDone();
  }
}

export class RandomStrollGoal extends Goal {
  protected wx = 0;
  protected wy = 0;
  protected wz = 0;
  forceTrigger = false;
  constructor(readonly mob: Mob, readonly speed: number, readonly interval = 120, readonly checkNoActionTime = true) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    // (vanilla: not while someone steers it)
    if (this.mob.controllingPassenger()) return false;
    if (!this.forceTrigger) {
      if (this.checkNoActionTime && this.mob.noActionTime >= 100) return false;
      if (this.mob.random.nextInt(reducedTickDelay(this.interval)) !== 0) return false;
    }
    const p = this.getPosition();
    if (!p) return false;
    [this.wx, this.wy, this.wz] = [p[0] + 0.5, p[1], p[2] + 0.5];
    this.forceTrigger = false;
    return true;
  }
  protected getPosition(): Pos | null {
    return defaultRandomPos(this.mob, 10, 7);
  }
  override canContinueToUse(): boolean {
    return !this.mob.navigation.isDone() && !this.mob.controllingPassenger();
  }
  override start(): void {
    this.mob.navigation.moveTo(this.wx, this.wy, this.wz, this.speed);
  }
  override stop(): void {
    this.mob.navigation.stop();
  }
}

export class WaterAvoidingRandomStrollGoal extends RandomStrollGoal {
  constructor(mob: Mob, speed: number, readonly probability = 0.001) {
    super(mob, speed);
  }
  protected override getPosition(): Pos | null {
    const m = this.mob;
    if (m.inWater) return landRandomPos(m, 15, 7) ?? super.getPosition();
    return m.random.nextFloat() >= this.probability ? landRandomPos(m, 10, 7) : super.getPosition();
  }
}

/**
 * vanilla MoveToBlockGoal: every 10-20 s look for a wanted block within `range` (nearest rings first, `vRange` up
 * and down), walk there and stay a while (a minute or so), giving up after a minute without arriving
 */
export abstract class MoveToBlockGoal extends Goal {
  protected nextStartTick = 0;
  protected tryTicks = 0;
  private maxStayTicks = 0;
  protected bx = 0;
  protected by = 0;
  protected bz = 0;
  protected reachedTarget = false;
  protected verticalSearchStart = 0;
  constructor(readonly mob: Mob, readonly speed: number, readonly range: number, readonly vRange = 1) {
    super();
    this.flags = Flag.MOVE | Flag.JUMP;
  }
  protected abstract isValidTarget(x: number, y: number, z: number): boolean;
  canUse(): boolean {
    if (this.nextStartTick > 0) {
      this.nextStartTick--;
      return false;
    }
    this.nextStartTick = this.nextStartDelay();
    return this.findNearestBlock();
  }
  /** vanilla MoveToBlockGoal.nextStartTick(mob): how long before it looks again */
  protected nextStartDelay(): number {
    return reducedTickDelay(200 + this.mob.random.nextInt(200));
  }
  /** vanilla isReachedTarget */
  isReachedTarget(): boolean {
    return this.reachedTarget;
  }
  override canContinueToUse(): boolean {
    return this.tryTicks >= -this.maxStayTicks && this.tryTicks <= 1200 && this.isValidTarget(this.bx, this.by, this.bz);
  }
  override start(): void {
    this.mob.navigation.moveTo(this.bx + 0.5, this.by + 1, this.bz + 0.5, this.speed);
    this.tryTicks = 0;
    const r = this.mob.random;
    this.maxStayTicks = r.nextInt(r.nextInt(1200) + 1200) + 1200;
  }
  acceptedDistance(): number {
    return 1;
  }
  /** where to stand: on top of the block */
  protected moveToTarget(): Pos {
    return [this.bx, this.by + 1, this.bz];
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const [x, y, z] = this.moveToTarget(), m = this.mob;
    const d = this.acceptedDistance();
    if ((x + 0.5 - m.x) ** 2 + (y + 0.5 - m.y) ** 2 + (z + 0.5 - m.z) ** 2 >= d * d) {
      this.reachedTarget = false;
      this.tryTicks++;
      if (this.shouldRecalculatePath()) m.navigation.moveTo(x + 0.5, y, z + 0.5, this.speed);
    } else {
      this.reachedTarget = true;
      this.tryTicks--;
    }
  }
  shouldRecalculatePath(): boolean {
    return this.tryTicks % 40 === 0;
  }
  protected findNearestBlock(): boolean {
    const m = this.mob, ox = Math.floor(m.x), oy = Math.floor(m.y), oz = Math.floor(m.z);
    for (let k = this.verticalSearchStart; k <= this.vRange; k = k > 0 ? -k : 1 - k)
      for (let l = 0; l < this.range; l++)
        for (let i = 0; i <= l; i = i > 0 ? -i : 1 - i)
          for (let j = i < l && i > -l ? l : 0; j <= l; j = j > 0 ? -j : 1 - j) {
            if (!this.isValidTarget(ox + i, oy + k - 1, oz + j)) continue;
            this.bx = ox + i;
            this.by = oy + k - 1;
            this.bz = oz + j;
            return true;
          }
    return false;
  }
}

/**
 * vanilla AvoidEntityGoal: the nearest living thing of a kind within `maxDist` (seen, and one it could fight) sends it
 * off somewhere up to 16 blocks away that isn't any nearer to it, walking, and at a sprint while it's within 7 blocks
 */
export class AvoidEntityGoal extends Goal {
  protected toAvoid: LivingEntity | null = null;
  private path: Path | null = null;
  constructor(readonly mob: Mob, readonly avoid: (e: LivingEntity) => boolean, readonly maxDist: number, readonly walkSpeed: number, readonly sprintSpeed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  /** vanilla TargetingConditions.forCombat().range(maxDist): alive, fair game, near enough (less if it's invisible), in sight */
  private nearest(): LivingEntity | null {
    const m = this.mob, d = this.maxDist;
    let best: LivingEntity | null = null, bestD = Infinity;
    for (const e of m.level.getEntities(new AABB(m.bb.minX - d, m.bb.minY - 3, m.bb.minZ - d, m.bb.maxX + d, m.bb.maxY + 3, m.bb.maxZ + d), undefined, m)) {
      if (!(e instanceof LivingEntity) || !e.isAlive || !this.avoid(e)) continue;
      if (!m.canAttack(e) || (m as { isAlliedTo?(o: LivingEntity): boolean }).isAlliedTo?.(e)) continue;
      const r = Math.max(d * e.visibilityPercent(m), 2);
      const d2 = m.distanceToSqr(e.x, e.y, e.z);
      if (d2 > r * r || !m.sensing.hasLineOfSight(e)) continue;
      if (d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }
  canUse(): boolean {
    this.toAvoid = this.nearest();
    const t = this.toAvoid;
    if (!t) return false;
    const pos = defaultRandomPosAway(this.mob, 16, 7, t.x, t.y, t.z);
    if (!pos) return false;
    const [x, y, z] = [pos[0] + 0.5, pos[1], pos[2] + 0.5];
    if (t.distanceToSqr(x, y, z) < t.distanceToSqr(this.mob.x, this.mob.y, this.mob.z)) return false;
    this.path = this.mob.navigation.createPath(x, y, z, 0);
    return this.path !== null;
  }
  override canContinueToUse(): boolean {
    return !this.mob.navigation.isDone();
  }
  override start(): void {
    this.mob.navigation.moveToPath(this.path, this.walkSpeed);
  }
  override stop(): void {
    this.toAvoid = null;
  }
  override tick(): void {
    const t = this.toAvoid;
    if (t) this.mob.navigation.speedModifier = this.mob.distanceToSqr(t.x, t.y, t.z) < 49 ? this.sprintSpeed : this.walkSpeed;
  }
}

// ---------------------------------------------------------------------------
// looking

export class LookAtPlayerGoal extends Goal {
  protected lookAt: LivingEntity | null = null;
  private lookTime = 0;
  constructor(readonly mob: Mob, readonly lookDistance: number, readonly probability = 0.02, readonly onlyHorizontal = false) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.random.nextFloat() >= this.probability) return false;
    if (m.target) this.lookAt = m.target;
    this.lookAt = this.findLookAt();
    return this.lookAt !== null;
  }
  /** the one to look at: the player, in range and in sight (vanilla lookAtType Player) */
  protected findLookAt(): LivingEntity | null {
    const m = this.mob, p = m.level.player;
    return p && p.isAlive && p.gameMode !== 'spectator' && m.distanceToSqr(p.x, p.y, p.z) <= this.lookDistance * this.lookDistance && m.sensing.hasLineOfSight(p) ? p : null;
  }
  override canContinueToUse(): boolean {
    const l = this.lookAt;
    if (!l || !l.isAlive) return false;
    if (this.mob.distanceToSqr(l.x, l.y, l.z) > this.lookDistance * this.lookDistance) return false;
    return this.lookTime > 0;
  }
  override start(): void {
    this.lookTime = this.adjustedTickDelay(40 + this.mob.random.nextInt(40));
  }
  override stop(): void {
    this.lookAt = null;
  }
  override tick(): void {
    const l = this.lookAt;
    if (l && l.isAlive) {
      const y = this.onlyHorizontal ? this.mob.y + this.mob.eyeHeight : l.y + l.eyeHeight;
      this.mob.lookControl.setLookAt(l.x, y, l.z);
      this.lookTime--;
    }
  }
}

export class RandomLookAroundGoal extends Goal {
  private relX = 0;
  private relZ = 0;
  private lookTime = 0;
  constructor(readonly mob: Mob) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    return this.mob.random.nextFloat() < 0.02;
  }
  override canContinueToUse(): boolean {
    return this.lookTime >= 0;
  }
  override start(): void {
    const d0 = Math.PI * 2 * this.mob.random.nextDouble();
    this.relX = Math.cos(d0);
    this.relZ = Math.sin(d0);
    this.lookTime = 20 + this.mob.random.nextInt(20);
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    this.lookTime--;
    const m = this.mob;
    m.lookControl.setLookAt(m.x + this.relX, m.y + m.eyeHeight, m.z + this.relZ);
  }
}

// ---------------------------------------------------------------------------
// combat

export class MeleeAttackGoal extends Goal {
  private path: Path | null = null;
  private pathedX = 0;
  private pathedY = 0;
  private pathedZ = 0;
  private recalc = 0;
  protected ticksUntilNextAttack = 0;
  private lastCanUseCheck = -100;
  constructor(readonly mob: Mob, readonly speed: number, readonly followEvenIfNotSeen: boolean) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const m = this.mob;
    const t = m.level.gameTime;
    if (t - this.lastCanUseCheck < 20) return false;
    this.lastCanUseCheck = t;
    const tg = m.target;
    if (!tg || !tg.isAlive) return false;
    this.path = m.navigation.createPathToEntity(tg, 0);
    if (this.path) return true;
    return m.isWithinMeleeAttackRange(tg);
  }
  override canContinueToUse(): boolean {
    const tg = this.mob.target;
    if (!tg || !tg.isAlive) return false;
    if (!this.followEvenIfNotSeen) return !this.mob.navigation.isDone();
    return this.mob.canAttack(tg);
  }
  override start(): void {
    this.mob.navigation.moveToPath(this.path, this.speed);
    this.mob.aggressive = true;
    this.recalc = 0;
    this.ticksUntilNextAttack = 0;
  }
  override stop(): void {
    const tg = this.mob.target;
    if (tg && !this.mob.canAttack(tg)) this.mob.setTarget(null);
    this.mob.aggressive = false;
    this.mob.navigation.stop();
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const m = this.mob;
    const tg = m.target;
    if (!tg) return;
    m.lookControl.setLookAtEntity(tg, 30, 30);
    this.recalc = Math.max(this.recalc - 1, 0);
    const moved = (tg.x - this.pathedX) ** 2 + (tg.y - this.pathedY) ** 2 + (tg.z - this.pathedZ) ** 2 >= 1;
    if ((this.followEvenIfNotSeen || m.sensing.hasLineOfSight(tg)) && this.recalc <= 0 && ((this.pathedX === 0 && this.pathedY === 0 && this.pathedZ === 0) || moved || m.random.nextFloat() < 0.05)) {
      this.pathedX = tg.x;
      this.pathedY = tg.y;
      this.pathedZ = tg.z;
      this.recalc = 4 + m.random.nextInt(7);
      const d0 = m.distanceToSqr(tg.x, tg.y, tg.z);
      if (d0 > 1024) this.recalc += 10;
      else if (d0 > 256) this.recalc += 5;
      if (!m.navigation.moveToEntity(tg, this.speed)) this.recalc += 15;
      this.recalc = this.adjustedTickDelay(this.recalc);
    }
    this.ticksUntilNextAttack = Math.max(this.ticksUntilNextAttack - 1, 0);
    this.checkAndPerformAttack(tg);
  }
  protected checkAndPerformAttack(tg: LivingEntity): void {
    if (this.ticksUntilNextAttack <= 0 && this.mob.isWithinMeleeAttackRange(tg) && this.mob.sensing.hasLineOfSight(tg)) {
      this.ticksUntilNextAttack = this.attackInterval();
      this.mob.swing();
      this.mob.doHurtTarget(tg);
    }
  }
  protected attackInterval(): number {
    return this.adjustedTickDelay(20);
  }
}

/** base for target goals (vanilla TargetGoal) */
export abstract class TargetGoal extends Goal {
  protected unseenTicks = 0;
  protected unseenMemoryTicks = 60;
  protected targetMob: LivingEntity | null = null;
  constructor(readonly mob: Mob, readonly mustSee: boolean) {
    super();
    this.flags = Flag.TARGET;
  }
  override canContinueToUse(): boolean {
    const m = this.mob;
    const t = m.target ?? this.targetMob;
    if (!t || !m.canAttack(t)) return false;
    const d = m.followRange;
    if (m.distanceToSqr(t.x, t.y, t.z) > d * d) return false;
    if (this.mustSee) {
      if (m.sensing.hasLineOfSight(t)) this.unseenTicks = 0;
      else if (++this.unseenTicks > reducedTickDelay(this.unseenMemoryTicks)) return false;
    }
    m.setTarget(t);
    return true;
  }
  override start(): void {
    this.unseenTicks = 0;
  }
  override stop(): void {
    this.mob.setTarget(null);
    this.targetMob = null;
  }
}

/** vanilla NearestAttackableTargetGoal<Player> */
export class NearestAttackablePlayerGoal extends TargetGoal {
  private found: Player | null = null;
  private readonly randomInterval: number;
  constructor(mob: Mob, mustSee: boolean, randomInterval = 10) {
    super(mob, mustSee);
    this.randomInterval = reducedTickDelay(randomInterval);
  }
  protected extraCondition(): boolean {
    return true;
  }
  canUse(): boolean {
    const m = this.mob;
    if (this.randomInterval > 0 && m.random.nextInt(this.randomInterval) !== 0) return false;
    if (!this.extraCondition()) return false;
    this.found = null;
    const p = m.level.player;
    if (!p || !m.canAttack(p)) return false;
    // vanilla TargetingConditions: range scaled by getVisibilityPercent (sneaking, invisibility)
    const vis = p.visibilityPercent(m);
    const range = Math.max(m.followRange * vis, 2);
    if (Math.abs(p.y - m.y) > 4 + range) return false;
    if (m.distanceToSqr(p.x, p.y, p.z) > range * range) return false;
    if (this.mustSee && !m.sensing.hasLineOfSight(p)) return false;
    this.found = p;
    return true;
  }
  override start(): void {
    this.mob.setTarget(this.found);
    super.start();
  }
}

/**
 * vanilla NearestAttackableTargetGoal for mobs rather than the player: the nearest living thing `test` accepts within
 * the follow range (a box that far out, 4 up and down; then TargetingConditions: in range as far as it can be seen,
 * at least 2, and in sight if `mustSee`)
 */
export class NearestAttackableMobGoal extends TargetGoal {
  private found: LivingEntity | null = null;
  private readonly randomInterval: number;
  constructor(mob: Mob, readonly test: (e: LivingEntity) => boolean, mustSee: boolean, randomInterval = 10, readonly extra: () => boolean = () => true) {
    super(mob, mustSee);
    this.randomInterval = reducedTickDelay(randomInterval);
  }
  canUse(): boolean {
    const m = this.mob;
    if (this.randomInterval > 0 && m.random.nextInt(this.randomInterval) !== 0) return false;
    if (!this.extra()) return false;
    const r = m.followRange;
    let best: LivingEntity | null = null, bd = Infinity;
    for (const e of m.level.getEntities(m.bb.inflate(r, 4, r), (e) => e instanceof LivingEntity && e !== m && e.isAlive)) {
      const le = e as LivingEntity;
      if (!this.test(le) || !m.canAttack(le)) continue;
      const range = Math.max(r * le.visibilityPercent(m), 2);
      if (le.distanceToSqr(m.x, m.y, m.z) > range * range) continue;
      if (this.mustSee && !m.sensing.hasLineOfSight(le)) continue;
      const d = le.distanceToSqr(m.x, m.y + m.eyeHeight, m.z);
      if (d < bd) {
        bd = d;
        best = le;
      }
    }
    this.found = best;
    return best !== null;
  }
  override start(): void {
    this.mob.setTarget(this.found);
    super.start();
  }
}

/** vanilla HurtByTargetGoal (`ignoreDamage`: vanilla toIgnoreDamage, those it won't turn on for hurting it) */
export class HurtByTargetGoal extends TargetGoal {
  private timestamp = 0;
  private alertSameType = false;
  private toIgnoreAlert: readonly string[] = [];
  constructor(mob: Mob, readonly ignoreDamage: (by: LivingEntity) => boolean = () => false) {
    super(mob, true);
  }
  /**
   * vanilla setAlertOthers: when it's hurt, others of its kind about (its subkinds too, but not the types listed)
   * with nothing to fight go for whoever did it
   */
  setAlertOthers(...ignore: string[]): this {
    this.alertSameType = true;
    this.toIgnoreAlert = ignore;
    return this;
  }
  canUse(): boolean {
    const m = this.mob;
    const t = m.lastHurtByMob;
    return m.lastHurtByMobTimestamp !== this.timestamp && t !== null && !this.ignoreDamage(t) && m.canAttack(t);
  }
  override start(): void {
    const m = this.mob;
    m.setTarget(m.lastHurtByMob);
    this.targetMob = m.target;
    this.timestamp = m.lastHurtByMobTimestamp;
    this.unseenMemoryTicks = 300;
    if (this.alertSameType) this.alertOthers();
    super.start();
  }
  /** vanilla alertOthers: those within its follow range (10 up or down) */
  protected alertOthers(): void {
    const m = this.mob, d = m.followRange, by = m.lastHurtByMob;
    if (!by) return;
    const kind = m.constructor as abstract new (...a: never[]) => Mob;
    const box = new AABB(m.x - d, m.y - 10, m.z - d, m.x + 1 + d, m.y + 11, m.z + 1 + d);
    for (const e of m.level.getEntities(box, (e) => e instanceof kind)) {
      const o = e as Mob;
      if (o === m || o.target !== null || this.toIgnoreAlert.includes(o.type)) continue;
      this.alertOther(o, by);
    }
  }
  protected alertOther(o: Mob, target: LivingEntity): void {
    o.setTarget(target);
  }
}

/** a mob that fights from afar (vanilla RangedAttackMob) */
export interface RangedAttacker extends Mob {
  performRangedAttack(target: LivingEntity, power: number): void;
}

/**
 * vanilla RangedAttackGoal: close in on the target until it's within `attackRadius` and has been in sight a quarter
 * of a second, then stand and let fly every `intervalMin`..`intervalMax` ticks (the further off, the longer), only
 * while it can see it; the power it throws with is the distance over the radius (0.1 to 1)
 */
export class RangedAttackGoal extends Goal {
  private target: LivingEntity | null = null;
  private attackTime = -1;
  private seeTime = 0;
  private readonly attackRadiusSqr: number;
  constructor(readonly mob: RangedAttacker, readonly speed: number, readonly intervalMin: number, readonly intervalMax: number, readonly attackRadius: number) {
    super();
    this.attackRadiusSqr = attackRadius * attackRadius;
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.mob.target;
    if (!t || !t.isAlive) return false;
    this.target = t;
    return true;
  }
  override canContinueToUse(): boolean {
    return this.canUse() || (!!this.target && this.target.isAlive && !this.mob.navigation.isDone());
  }
  override stop(): void {
    this.target = null;
    this.seeTime = 0;
    this.attackTime = -1;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const m = this.mob, t = this.target;
    if (!t) return;
    const d0 = m.distanceToSqr(t.x, t.y, t.z);
    const see = m.sensing.hasLineOfSight(t);
    if (see) this.seeTime++;
    else this.seeTime = 0;
    if (d0 <= this.attackRadiusSqr && this.seeTime >= 5) m.navigation.stop();
    else m.navigation.moveToEntity(t, this.speed);
    m.lookControl.setLookAtEntity(t, 30, 30);
    const f = Math.sqrt(d0) / this.attackRadius;
    if (--this.attackTime === 0) {
      if (!see) return;
      m.performRangedAttack(t, Math.max(0.1, Math.min(1, f)));
      this.attackTime = Math.floor(f * (this.intervalMax - this.intervalMin) + this.intervalMin);
    } else if (this.attackTime < 0) {
      this.attackTime = Math.floor(this.intervalMin + f * (this.intervalMax - this.intervalMin));
    }
  }
}

/** vanilla RestrictSunGoal: stay in shade while it's day */
export class RestrictSunGoal extends Goal {
  constructor(readonly mob: Mob) {
    super();
  }
  canUse(): boolean {
    return this.mob.level.isDay() && !this.mob.isOnFire();
  }
  override start(): void {
    this.mob.navigation.avoidSun = true;
  }
  override stop(): void {
    this.mob.navigation.avoidSun = false;
  }
}

/** vanilla FleeSunGoal: burning in daylight → run to a shaded spot */
export class FleeSunGoal extends Goal {
  private wx = 0;
  private wy = 0;
  private wz = 0;
  constructor(readonly mob: Mob, readonly speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.target) return false;
    if (!m.level.isDay() || !m.isOnFire()) return false;
    if (!m.level.canSeeSky(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))) return false;
    return this.setWantedPos();
  }
  private setWantedPos(): boolean {
    const m = this.mob;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    for (let i = 0; i < 10; i++) {
      const x = bx + m.random.nextInt(20) - 10, y = by + m.random.nextInt(6) - 3, z = bz + m.random.nextInt(20) - 10;
      if (!m.level.canSeeSky(x, y, z) && m.walkTargetValue(x, y, z) < 0) {
        this.wx = x + 0.5;
        this.wy = y;
        this.wz = z + 0.5;
        return true;
      }
    }
    return false;
  }
  override canContinueToUse(): boolean {
    return !this.mob.navigation.isDone();
  }
  override start(): void {
    this.mob.navigation.moveTo(this.wx, this.wy, this.wz, this.speed);
  }
}

/** vanilla LeapAtTargetGoal (spiders) */
export class LeapAtTargetGoal extends Goal {
  private target: LivingEntity | null = null;
  constructor(readonly mob: Mob, readonly yd: number) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    this.target = m.target;
    if (!this.target) return false;
    const d0 = m.distanceToSqr(this.target.x, this.target.y, this.target.z);
    if (d0 < 4 || d0 > 16) return false;
    if (!m.onGround) return false;
    return m.random.nextInt(reducedTickDelay(5)) === 0;
  }
  override canContinueToUse(): boolean {
    return !this.mob.onGround;
  }
  override start(): void {
    const m = this.mob, t = this.target!;
    let vx = t.x - m.x, vz = t.z - m.z;
    const l = vx * vx + vz * vz;
    if (l > 1e-7) {
      const s = Math.sqrt(l);
      vx = (vx / s) * 0.4 + m.dx * 0.2;
      vz = (vz / s) * 0.4 + m.dz * 0.2;
    }
    m.dx = vx;
    m.dy = this.yd;
    m.dz = vz;
  }
}

// ---------------------------------------------------------------------------
// doors and villages

/** vanilla DoorBlock.isWoodenDoor: a door a hand can open (any but iron) */
export function isWoodenDoor(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n.endsWith('_door') && n !== 'iron_door';
}

/** vanilla BlockPos.closerToCenterThan */
function closerToCenter(p: Pos, m: Mob, d: number): boolean {
  return (p[0] + 0.5 - m.x) ** 2 + (p[1] + 0.5 - m.y) ** 2 + (p[2] + 0.5 - m.z) ** 2 < d * d;
}

/**
 * vanilla DoorInteractGoal: a mob that paths through doors, bumping into a wooden door, one of those on the next
 * two nodes of its path within 1.5 (or the one it's standing in); it's done with the door once past it
 */
export abstract class DoorInteractGoal extends Goal {
  protected doorPos: Pos = [0, 0, 0];
  protected hasDoor = false;
  private passed = false;
  private doorOpenDirX = 0;
  private doorOpenDirZ = 0;
  constructor(readonly mob: Mob) {
    super();
  }
  /** vanilla isOpen */
  protected isOpen(): boolean {
    if (!this.hasDoor) return false;
    const [x, y, z] = this.doorPos;
    const st = this.mob.level.world.getState(x, y, z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (!b.name.endsWith('_door')) {
      this.hasDoor = false;
      return false;
    }
    return b.get(st, 'open') === true;
  }
  private woodenDoorAt(p: Pos): boolean {
    return isWoodenDoor(this.mob.level.world.getState(p[0], p[1], p[2]));
  }
  canUse(): boolean {
    const m = this.mob;
    if (!m.horizontalCollision) return false;
    const nav = m.navigation;
    const path = nav.path;
    if (!path || path.isDone() || !nav.canOpenDoors) return false;
    for (let i = 0; i < Math.min(path.nextNodeIndex + 2, path.nodes.length); i++) {
      const n = path.nodes[i];
      this.doorPos = [n.x, n.y + 1, n.z];
      if (m.distanceToSqr(n.x, m.y, n.z) > 2.25) continue;
      this.hasDoor = this.woodenDoorAt(this.doorPos);
      if (this.hasDoor) return true;
    }
    this.doorPos = [Math.floor(m.x), Math.floor(m.y) + 1, Math.floor(m.z)];
    this.hasDoor = this.woodenDoorAt(this.doorPos);
    return this.hasDoor;
  }
  override canContinueToUse(): boolean {
    return !this.passed;
  }
  override start(): void {
    this.passed = false;
    this.doorOpenDirX = Math.fround(this.doorPos[0] + 0.5 - this.mob.x);
    this.doorOpenDirZ = Math.fround(this.doorPos[2] + 0.5 - this.mob.z);
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const f = Math.fround(this.doorPos[0] + 0.5 - this.mob.x), f1 = Math.fround(this.doorPos[2] + 0.5 - this.mob.z);
    if (this.doorOpenDirX * f + this.doorOpenDirZ * f1 < 0) this.passed = true;
  }
}

/**
 * vanilla BreakDoorGoal: on the difficulties it's let (and with mobGriefing), a mob stopped by a closed wooden door
 * hammers at it, the door cracking a little more every 24 ticks, and after 12 s knocks it down
 */
export class BreakDoorGoal extends DoorInteractGoal {
  protected breakTime = 0;
  /** (vanilla never resets it: a second door starts from where the first left off) */
  protected lastBreakProgress = -1;
  constructor(mob: Mob, readonly validDifficulty: (d: Difficulty) => boolean, protected doorBreakTime = -1) {
    super(mob);
  }
  protected getDoorBreakTime(): number {
    return Math.max(240, this.doorBreakTime);
  }
  override canUse(): boolean {
    if (!super.canUse()) return false;
    if (!this.mob.level.gameRules.mobGriefing) return false;
    return this.validDifficulty(this.mob.level.difficulty) && !this.isOpen();
  }
  override start(): void {
    super.start();
    this.breakTime = 0;
  }
  override canContinueToUse(): boolean {
    const m = this.mob;
    return this.breakTime <= this.getDoorBreakTime() && !this.isOpen() && closerToCenter(this.doorPos, m, 2) && this.validDifficulty(m.level.difficulty);
  }
  override stop(): void {
    super.stop();
    const [x, y, z] = this.doorPos;
    this.mob.level.destroyBlockProgress(this.mob.id, x, y, z, -1);
  }
  override tick(): void {
    super.tick();
    const m = this.mob, lvl = m.level, [x, y, z] = this.doorPos;
    if (m.random.nextInt(20) === 0) {
      // (vanilla level event 1019)
      const r = lvl.random;
      lvl.sound.play('entity.zombie.attack_wooden_door', x + 0.5, y + 0.5, z + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
      if (!m.swinging) m.swing();
    }
    this.breakTime++;
    const i = Math.trunc(Math.fround(Math.fround(this.breakTime / this.getDoorBreakTime()) * 10));
    if (i !== this.lastBreakProgress) {
      lvl.destroyBlockProgress(m.id, x, y, z, i);
      this.lastBreakProgress = i;
    }
    if (this.breakTime === this.getDoorBreakTime() && this.validDifficulty(lvl.difficulty)) {
      // (the half it hammered goes quietly; the other half breaks with it, dust, sound and the door dropping)
      lvl.setBlock(x, y, z, 0);
      // (vanilla level event 1021)
      const r = lvl.random;
      lvl.sound.play('entity.zombie.break_wooden_door', x + 0.5, y + 0.5, z + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
    }
  }
}

/**
 * vanilla MoveThroughVillageGoal: near a village (at night, if `onlyAtNight`), a walk to one of its lived-in places (a
 * claimed bed, workstation or bell) it hasn't been to lately; through doors only if it can deal with them, and then
 * only as far as the first
 */
export class MoveThroughVillageGoal extends Goal {
  private path: Path | null = null;
  private poiPos: Pos = [0, 0, 0];
  private readonly visited: Pos[] = [];
  constructor(readonly mob: Mob, readonly speed: number, readonly onlyAtNight: boolean, readonly distanceToPoi: number, readonly canDealWithDoors: () => boolean) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    this.updateVisited();
    if (this.onlyAtNight && m.level.isDay()) return false;
    const poi = m.level.poi;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    if (poi.sectionsToVillage(bx >> 4, by >> 4, bz >> 4) > 6) return false;
    // (vanilla PoiManager.find: a lived-in village point within 10 it hasn't visited)
    const near = (p: Pos): Pos | null => {
      for (const q of poi.findAll(p[0], p[1], p[2], 10, () => true, false)) if (poi.isOccupied(q[0], q[1], q[2]) && this.hasNotVisited(q)) return [q[0], q[1], q[2]];
      return null;
    };
    const spot = landRandomPos(m, 15, 7, (p) => {
      if (!poi.isVillage(p[0], p[1], p[2])) return -Infinity;
      const q = near(p);
      return q ? -((q[0] - bx) ** 2 + (q[1] - by) ** 2 + (q[2] - bz) ** 2) : -Infinity;
    });
    if (!spot) return false;
    const found = near(spot);
    if (!found) return false;
    this.poiPos = found;
    const nav = m.navigation;
    const could = nav.canOpenDoors;
    nav.canOpenDoors = this.canDealWithDoors();
    this.path = nav.createPath(found[0], found[1], found[2], 0);
    nav.canOpenDoors = could;
    if (!this.path) {
      const t = defaultRandomPosTowards(m, 10, 7, found[0] + 0.5, found[2] + 0.5, Math.PI / 2);
      if (!t) return false;
      nav.canOpenDoors = this.canDealWithDoors();
      this.path = nav.createPath(t[0] + 0.5, t[1], t[2] + 0.5, 0);
      nav.canOpenDoors = could;
      if (!this.path) return false;
    }
    // (no further than the first door on the way)
    const w = m.level.world;
    for (const n of this.path.nodes) {
      if (isWoodenDoor(w.getState(n.x, n.y + 1, n.z))) {
        this.path = nav.createPath(n.x, n.y, n.z, 0);
        break;
      }
    }
    return this.path !== null;
  }
  override canContinueToUse(): boolean {
    const m = this.mob;
    if (m.navigation.isDone()) return false;
    return !closerToCenter(this.poiPos, m, m.width + this.distanceToPoi);
  }
  override start(): void {
    this.mob.navigation.moveToPath(this.path, this.speed);
  }
  override stop(): void {
    const m = this.mob;
    if (m.navigation.isDone() || closerToCenter(this.poiPos, m, this.distanceToPoi)) this.visited.push(this.poiPos);
  }
  private hasNotVisited(p: readonly [number, number, number, ...unknown[]]): boolean {
    return !this.visited.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]);
  }
  /** vanilla updateVisited: it forgets the oldest past 15 */
  private updateVisited(): void {
    if (this.visited.length > 15) this.visited.shift();
  }
}

export { LivingEntity };
