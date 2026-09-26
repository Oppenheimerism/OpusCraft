// Another player as a guest sees it (vanilla RemotePlayer): where the host says it is, eased into over three ticks
// (vanilla LivingEntity.lerpTo), with its walk, swim and swing worked out here from that. It never runs a player's
// own tick: nothing about it is decided here.

import { Player } from '../../entity/player';
import type { Level } from '../../game/level';
import { wrapDegrees } from '../../core/math';
import { applyPoseFlags } from '../playerState';

/** vanilla LivingEntity.lerpTo's steps for a player's moves */
const LERP_STEPS = 3;

export class MirrorPlayer extends Player {
  private lerpSteps = 0;
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private lYaw = 0;
  private lPitch = 0;
  private lHead = 0;
  private lBody = 0;

  constructor(level: Level, readonly netId: number) {
    super(level);
    this.remote = true;
    this.noPickup = true;
  }

  /** where it is from the first (no easing in) */
  place(x: number, y: number, z: number, yRot: number, xRot: number, head: number, body: number, flags: number): void {
    applyPoseFlags(this, flags);
    this.moveTo(x, y, z, yRot, xRot);
    this.headYaw = this.headYawO = head;
    this.bodyYaw = this.bodyYawO = body;
    this.lerpTo(x, y, z, yRot, xRot, head, body);
    this.lerpSteps = 0;
  }

  /** vanilla lerpTo: get there over the next ticks */
  lerpTo(x: number, y: number, z: number, yRot: number, xRot: number, head: number, body: number): void {
    this.lx = x;
    this.ly = y;
    this.lz = z;
    this.lYaw = yRot;
    this.lPitch = xRot;
    this.lHead = head;
    this.lBody = body;
    this.lerpSteps = LERP_STEPS;
  }

  setPose(flags: number): void {
    applyPoseFlags(this, flags);
  }

  /** vanilla ClientLevel.tickNonPassenger for a RemotePlayer: last tick's place, a step nearer, and the animations */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.bodyYawO = this.bodyYaw;
    this.headYawO = this.headYaw;
    this.walkDistO = this.walkDist;
    this.tickCount++;
    this.updateSwimAmount();
    if (this.lerpSteps > 0) {
      const k = this.lerpSteps--;
      const x = this.x + (this.lx - this.x) / k, y = this.y + (this.ly - this.y) / k, z = this.z + (this.lz - this.z) / k;
      this.dx = x - this.x;
      this.dy = y - this.y;
      this.dz = z - this.z;
      this.setPos(x, y, z);
      this.yaw += wrapDegrees(this.lYaw - this.yaw) / k;
      this.pitch += (this.lPitch - this.pitch) / k;
      this.headYaw += wrapDegrees(this.lHead - this.headYaw) / k;
      this.bodyYaw += wrapDegrees(this.lBody - this.bodyYaw) / k;
    } else this.dx = this.dy = this.dz = 0;
    this.fallFlyTicks = this.fallFlying ? this.fallFlyTicks + 1 : 0;
    this.updateWalkAnimation();
    this.updateSwing();
  }
}
