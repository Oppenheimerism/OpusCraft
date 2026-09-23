// Common mob goals (vanilla net.minecraft.world.entity.ai.goal) and random
// position helpers (DefaultRandomPos / LandRandomPos).

import { Goal, Flag, reducedTickDelay } from './goal';
import type { Mob } from '../mob';
import type { Path } from './pathfinder';
import { LivingEntity } from '../living';
import { FLAGS, F_WATER, F_COLLIDE, F_OPAQUE } from '../../world/block';
import { MIN_Y, MAX_Y } from '../../world/constants';
import type { Player } from '../player';

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

function bestOf(m: Mob, gen: () => Pos | null): Pos | null {
  let best: Pos | null = null, bestV = -Infinity;
  for (let i = 0; i < 10; i++) {
    const p = gen();
    if (!p) continue;
    const v = m.walkTargetValue(p[0], p[1], p[2]);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  return best;
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

/** vanilla LandRandomPos.getPos */
export function landRandomPos(m: Mob, radius: number, yRange: number): Pos | null {
  return bestOf(m, () => {
    const p = towardDirection(m, randomDirection(m, radius, yRange));
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

// ---------------------------------------------------------------------------
// movement goals

export class FloatGoal extends Goal {
  constructor(readonly mob: Mob) {
    super();
    this.flags = Flag.JUMP;
    mob.navigation.canFloat = true;
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
    return !this.mob.navigation.isDone();
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

// ---------------------------------------------------------------------------
// looking

export class LookAtPlayerGoal extends Goal {
  private lookAt: LivingEntity | null = null;
  private lookTime = 0;
  constructor(readonly mob: Mob, readonly lookDistance: number, readonly probability = 0.02, readonly onlyHorizontal = false) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.random.nextFloat() >= this.probability) return false;
    if (m.target) this.lookAt = m.target;
    const p = m.level.player;
    this.lookAt = null;
    if (p && p.isAlive && p.gameMode !== 'spectator' && m.distanceToSqr(p.x, p.y, p.z) <= this.lookDistance * this.lookDistance && m.sensing.hasLineOfSight(p)) this.lookAt = p;
    return this.lookAt !== null;
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

/** vanilla HurtByTargetGoal */
export class HurtByTargetGoal extends TargetGoal {
  private timestamp = 0;
  constructor(mob: Mob) {
    super(mob, true);
  }
  canUse(): boolean {
    const m = this.mob;
    const t = m.lastHurtByMob;
    return m.lastHurtByMobTimestamp !== this.timestamp && t !== null && m.canAttack(t);
  }
  override start(): void {
    const m = this.mob;
    m.setTarget(m.lastHurtByMob);
    this.targetMob = m.target;
    this.timestamp = m.lastHurtByMobTimestamp;
    this.unseenMemoryTicks = 300;
    super.start();
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

export { LivingEntity };
