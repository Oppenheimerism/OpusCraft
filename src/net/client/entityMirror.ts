// One of the host's entities as a guest shows it, players aside (vanilla ClientLevel's entities, which a client only
// eases along as the server says): where the host says it is, eased into over three ticks for what's alive and in one
// for the rest (vanilla LivingEntity.lerpTo; a jump of more than 8 blocks is taken at once), its walk worked out here
// from that, and everything else as the host sends it (net/entityData.ts). Its own tick never runs here: nothing about
// it is decided on a guest.

import type { Entity } from '../../entity/entity';
import { LivingEntity } from '../../entity/living';
import { ItemEntity } from '../../entity/itemEntity';
import { ExperienceOrb } from '../../entity/xpOrb';
import { PoseFlag } from '../protocol';
import { wrapDegrees } from '../../core/math';

/** vanilla's lerp steps for a mob's moves (which come every third tick); everything else's come each tick they happen */
const LIVING_STEPS = 3;
/** a move farther than this is taken at once (vanilla: a teleport rather than a walk) */
const SNAP = 8;

export class EntityMirror {
  private steps = 0;
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private lYaw = 0;
  private lPitch = 0;
  private lHead = 0;
  private lBody = 0;
  private readonly living: LivingEntity | null;

  constructor(readonly e: Entity, readonly netId: number) {
    this.living = e instanceof LivingEntity ? e : null;
  }

  /** where it is from the first (no easing in) */
  place(x: number, y: number, z: number, yaw: number, pitch: number, head: number, body: number, flags: number): void {
    const e = this.e, l = this.living;
    e.moveTo(x, y, z, yaw, pitch);
    if (l) {
      l.headYaw = l.headYawO = head;
      l.bodyYaw = l.bodyYawO = body;
    }
    e.onGround = !!(flags & PoseFlag.ON_GROUND);
    this.target(x, y, z, yaw, pitch, head, body);
    this.steps = 0;
  }

  /** vanilla lerpTo: get there over the next ticks (a rider's place is its seat: only its look counts) */
  lerpTo(x: number, y: number, z: number, yaw: number, pitch: number, head: number, body: number, flags: number): void {
    const e = this.e;
    e.onGround = !!(flags & PoseFlag.ON_GROUND);
    if (!e.vehicle && (x - e.x) ** 2 + (y - e.y) ** 2 + (z - e.z) ** 2 > SNAP * SNAP) {
      e.setPos(x, y, z);
      e.xo = x;
      e.yo = y;
      e.zo = z;
    }
    this.target(x, y, z, yaw, pitch, head, body);
    this.steps = this.living ? LIVING_STEPS : 1;
  }

  private target(x: number, y: number, z: number, yaw: number, pitch: number, head: number, body: number): void {
    this.lx = x;
    this.ly = y;
    this.lz = z;
    this.lYaw = yaw;
    this.lPitch = pitch;
    this.lHead = head;
    this.lBody = body;
  }

  /**
   * vanilla ClientLevel.tickNonPassenger for an entity the server moves: last tick's place, a step nearer, and what it
   * works out from that (a rider is then put in its seat by what it rides, as vanilla's positionRider)
   */
  tick(): void {
    const e = this.e, l = this.living;
    e.xo = e.x;
    e.yo = e.y;
    e.zo = e.z;
    e.yawO = e.yaw;
    e.pitchO = e.pitch;
    if (l) {
      l.bodyYawO = l.bodyYaw;
      l.headYawO = l.headYaw;
    }
    e.tickCount++;
    if (this.steps > 0) {
      const k = this.steps--;
      if (!e.vehicle) {
        const x = e.x + (this.lx - e.x) / k, y = e.y + (this.ly - e.y) / k, z = e.z + (this.lz - e.z) / k;
        e.dx = x - e.x;
        e.dy = y - e.y;
        e.dz = z - e.z;
        e.setPos(x, y, z);
      }
      e.yaw += wrapDegrees(this.lYaw - e.yaw) / k;
      e.pitch += (this.lPitch - e.pitch) / k;
      if (l) {
        l.headYaw += wrapDegrees(this.lHead - l.headYaw) / k;
        l.bodyYaw += wrapDegrees(this.lBody - l.bodyYaw) / k;
      }
    } else e.dx = e.dy = e.dz = 0;
    // (what the host doesn't send, since each game counts it alike: an item's bob and spin, an orb's)
    if (e instanceof ItemEntity || e instanceof ExperienceOrb) e.age++;
    if (l) l.animateMirror();
  }
}
