// Mob controls: look/move/jump/body rotation (vanilla LookControl, MoveControl,
// JumpControl, BodyRotationControl).

import { wrapDegrees } from '../../core/math';
import type { Mob } from '../mob';
import type { Entity } from '../entity';
import { LivingEntity } from '../living';
import { COLLISION } from '../../world/block';
import { PathType } from './pathfinder';

const RAD = 180 / Math.PI;

/** vanilla Mth.degreesDifference */
function degreesDifference(a: number, b: number): number {
  return wrapDegrees(b - a);
}

/** vanilla Mth.rotateIfNecessary */
export function rotateIfNecessary(cur: number, target: number, max: number): number {
  const f = degreesDifference(cur, target);
  const f1 = Math.max(-max, Math.min(max, f));
  return target - f1;
}

function rotateTowards(from: number, to: number, max: number): number {
  const f = degreesDifference(from, to);
  return from + Math.max(-max, Math.min(max, f));
}

export function eyeY(e: Entity): number {
  return e instanceof LivingEntity ? e.y + e.eyeHeight : (e.bb.minY + e.bb.maxY) / 2;
}

export class LookControl {
  wantedX = 0;
  wantedY = 0;
  wantedZ = 0;
  yMaxRotSpeed = 10;
  xMaxRotAngle = 40;
  lookAtCooldown = 0;

  constructor(readonly mob: Mob) {}

  setLookAt(x: number, y: number, z: number, yMax = this.mob.headRotSpeed(), xMax = this.mob.maxHeadXRot()): void {
    this.wantedX = x;
    this.wantedY = y;
    this.wantedZ = z;
    this.yMaxRotSpeed = yMax;
    this.xMaxRotAngle = xMax;
    this.lookAtCooldown = 2;
  }

  setLookAtEntity(e: Entity, yMax?: number, xMax?: number): void {
    this.setLookAt(e.x, eyeY(e), e.z, yMax, xMax);
  }

  isLooking(): boolean {
    return this.lookAtCooldown > 0;
  }

  protected resetXRotOnTick(): boolean {
    return true;
  }

  tick(): void {
    const m = this.mob;
    if (this.resetXRotOnTick()) m.pitch = 0;
    if (this.lookAtCooldown > 0) {
      this.lookAtCooldown--;
      const y = this.yRotD();
      if (y !== null) m.headYaw = rotateTowards(m.headYaw, y, this.yMaxRotSpeed);
      const x = this.xRotD();
      if (x !== null) m.pitch = rotateTowards(m.pitch, x, this.xMaxRotAngle);
    } else {
      m.headYaw = rotateTowards(m.headYaw, m.bodyYaw, 10);
    }
    this.clampHeadRotationToBody();
  }

  protected clampHeadRotationToBody(): void {
    const m = this.mob;
    if (!m.navigation.isDone()) m.headYaw = rotateIfNecessary(m.headYaw, m.bodyYaw, m.maxHeadYRot());
  }

  private xRotD(): number | null {
    const m = this.mob;
    const dx = this.wantedX - m.x, dy = this.wantedY - (m.y + m.eyeHeight), dz = this.wantedZ - m.z;
    const h = Math.sqrt(dx * dx + dz * dz);
    if (Math.abs(dy) <= 1e-5 && Math.abs(h) <= 1e-5) return null;
    return -(Math.atan2(dy, h) * RAD);
  }

  private yRotD(): number | null {
    const m = this.mob;
    const dx = this.wantedX - m.x, dz = this.wantedZ - m.z;
    if (Math.abs(dz) <= 1e-5 && Math.abs(dx) <= 1e-5) return null;
    return Math.atan2(dz, dx) * RAD - 90;
  }
}

export const enum MoveOp {
  WAIT,
  MOVE_TO,
  STRAFE,
  JUMPING,
}

export class MoveControl {
  wantedX = 0;
  wantedY = 0;
  wantedZ = 0;
  speedModifier = 0;
  strafeForwards = 0;
  strafeRight = 0;
  operation = MoveOp.WAIT;

  constructor(readonly mob: Mob) {}

  hasWanted(): boolean {
    return this.operation === MoveOp.MOVE_TO;
  }

  setWantedPosition(x: number, y: number, z: number, speed: number): void {
    this.wantedX = x;
    this.wantedY = y;
    this.wantedZ = z;
    this.speedModifier = speed;
    if (this.operation !== MoveOp.JUMPING) this.operation = MoveOp.MOVE_TO;
  }

  strafe(forward: number, right: number): void {
    this.operation = MoveOp.STRAFE;
    this.strafeForwards = forward;
    this.strafeRight = right;
    this.speedModifier = 0.25;
  }

  tick(): void {
    const m = this.mob;
    if (this.operation === MoveOp.STRAFE) {
      const f = m.moveSpeedAttr;
      const f1 = this.speedModifier * f;
      let f2 = this.strafeForwards, f3 = this.strafeRight;
      let f4 = Math.sqrt(f2 * f2 + f3 * f3);
      if (f4 < 1) f4 = 1;
      f4 = f1 / f4;
      f2 *= f4;
      f3 *= f4;
      const s = Math.sin(m.yaw / RAD), c = Math.cos(m.yaw / RAD);
      const f7 = f2 * c - f3 * s, f8 = f3 * c + f2 * s;
      if (!this.isWalkable(f7, f8)) {
        this.strafeForwards = 1;
        this.strafeRight = 0;
      }
      m.setSpeed(f1);
      m.zza = this.strafeForwards;
      m.xxa = this.strafeRight;
      this.operation = MoveOp.WAIT;
    } else if (this.operation === MoveOp.MOVE_TO) {
      this.operation = MoveOp.WAIT;
      const d0 = this.wantedX - m.x, d1 = this.wantedZ - m.z, d2 = this.wantedY - m.y;
      const d3 = d0 * d0 + d2 * d2 + d1 * d1;
      if (d3 < 2.5000003e-7) {
        m.zza = 0;
        return;
      }
      const f9 = Math.atan2(d1, d0) * RAD - 90;
      m.yaw = rotlerp(m.yaw, f9, 90);
      m.setSpeed(this.speedModifier * m.moveSpeedAttr);
      const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
      const st = m.level.world.getState(bx, by, bz);
      const boxes = COLLISION[st];
      let top = 0;
      if (boxes) for (const b of boxes) top = Math.max(top, b[4]);
      if ((d2 > m.stepHeight && d0 * d0 + d1 * d1 < Math.max(1, m.width)) || (boxes && boxes.length && m.y < top + by && !isDoorOrFence(st))) {
        m.jumpControl.jump();
        this.operation = MoveOp.JUMPING;
      }
    } else if (this.operation === MoveOp.JUMPING) {
      m.setSpeed(this.speedModifier * m.moveSpeedAttr);
      if (m.onGround) this.operation = MoveOp.WAIT;
    } else {
      m.zza = 0;
    }
  }

  private isWalkable(dx: number, dz: number): boolean {
    const m = this.mob;
    const t = m.navigation.evaluatorTypeAt(Math.floor(m.x + dx), Math.floor(m.y), Math.floor(m.z + dz));
    return t === PathType.WALKABLE;
  }
}

/**
 * vanilla FlyingMoveControl: to a wanted point it turns (90° a tick), pitches its nose toward it (`maxTurn` a tick)
 * and flies at its flying speed, rising or sinking as it needs, gravity off while it goes; with nothing wanted it
 * stops, and unless it `hoversInPlace` gravity takes it again
 */
export class FlyingMoveControl extends MoveControl {
  constructor(mob: Mob, readonly maxTurn: number, readonly hoversInPlace: boolean) {
    super(mob);
  }

  override tick(): void {
    const m = this.mob;
    if (this.operation === MoveOp.MOVE_TO) {
      this.operation = MoveOp.WAIT;
      m.noGravityFlag = true;
      const d0 = this.wantedX - m.x, d1 = this.wantedY - m.y, d2 = this.wantedZ - m.z;
      if (d0 * d0 + d1 * d1 + d2 * d2 < 2.5000003e-7) {
        m.yya = 0;
        m.zza = 0;
        return;
      }
      m.yaw = rotlerp(m.yaw, Math.atan2(d2, d0) * RAD - 90, 90);
      const f1 = this.speedModifier * (m.onGround ? m.moveSpeedAttr : m.flyingSpeedAttr);
      m.setSpeed(f1);
      const d4 = Math.sqrt(d0 * d0 + d2 * d2);
      if (Math.abs(d1) > 1e-5 || Math.abs(d4) > 1e-5) {
        m.pitch = rotlerp(m.pitch, -(Math.atan2(d1, d4) * RAD), this.maxTurn);
        m.yya = d1 > 0 ? f1 : -f1;
      }
    } else {
      if (!this.hoversInPlace) m.noGravityFlag = false;
      m.yya = 0;
      m.zza = 0;
    }
  }
}

function isDoorOrFence(st: number): boolean {
  void st;
  return false;
}

/** vanilla MoveControl.rotlerp */
export function rotlerp(from: number, to: number, max: number): number {
  let f = wrapDegrees(to - from);
  if (f > max) f = max;
  if (f < -max) f = -max;
  let f1 = from + f;
  if (f1 < 0) f1 += 360;
  else if (f1 > 360) f1 -= 360;
  return f1;
}

export class JumpControl {
  private jumpFlag = false;
  constructor(readonly mob: Mob) {}
  jump(): void {
    this.jumpFlag = true;
  }
  tick(): void {
    this.mob.jumping = this.jumpFlag;
    this.jumpFlag = false;
  }
}

/** vanilla BodyRotationControl */
export class BodyRotationControl {
  private headStableTime = 0;
  private lastStableYHeadRot = 0;
  constructor(readonly mob: Mob) {}

  tick(): void {
    const m = this.mob;
    if (this.isMoving()) {
      m.bodyYaw = m.yaw;
      m.headYaw = rotateIfNecessary(m.headYaw, m.bodyYaw, m.maxHeadYRot());
      this.lastStableYHeadRot = m.headYaw;
      this.headStableTime = 0;
    } else if (Math.abs(m.headYaw - this.lastStableYHeadRot) > 15) {
      this.lastStableYHeadRot = m.headYaw;
      this.headStableTime = 0;
      m.bodyYaw = rotateIfNecessary(m.bodyYaw, m.headYaw, m.maxHeadYRot());
    } else {
      this.headStableTime++;
      if (this.headStableTime > 10) {
        const i = this.headStableTime - 10;
        const f = Math.max(0, Math.min(1, i / 10));
        const f1 = m.maxHeadYRot() * (1 - f);
        m.bodyYaw = rotateIfNecessary(m.bodyYaw, m.headYaw, f1);
      }
    }
  }

  private isMoving(): boolean {
    const m = this.mob;
    const dx = m.x - m.xo, dz = m.z - m.zo;
    return dx * dx + dz * dz > 2.5000003e-7;
  }
}
