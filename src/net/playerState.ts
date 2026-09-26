// A player's pose and what it holds, as the packets carry them: a guest's moves on the host (ServerPlayerSession) and
// the other players' on a guest (MirrorPlayer) both go through here.

import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import { PoseFlag } from './protocol';

/** `p`'s pose and state as PoseFlag bits (vanilla SynchedEntityData's shared flags and pose) */
export function poseFlags(p: Player): number {
  let f = 0;
  if (p.onGround) f |= PoseFlag.ON_GROUND;
  if (p.isShiftKeyDown()) f |= PoseFlag.SHIFT;
  if (p.crouching) f |= PoseFlag.CROUCHING;
  if (p.sprinting) f |= PoseFlag.SPRINTING;
  if (p.swimming) f |= PoseFlag.SWIMMING;
  if (p.swimPose) f |= PoseFlag.SWIM_POSE;
  if (p.fallFlying) f |= PoseFlag.FALL_FLYING;
  if (p.glidePose) f |= PoseFlag.GLIDE_POSE;
  if (p.flying) f |= PoseFlag.FLYING;
  if (p.spinPose) f |= PoseFlag.SPIN_POSE;
  return f;
}

/** give `p` the pose `f` says, and the size that goes with it (vanilla Player.getDefaultDimensions by pose) */
export function applyPoseFlags(p: Player, f: number): void {
  p.onGround = !!(f & PoseFlag.ON_GROUND);
  p.input.sneak = !!(f & PoseFlag.SHIFT);
  p.crouching = !!(f & PoseFlag.CROUCHING);
  p.sprinting = !!(f & PoseFlag.SPRINTING);
  p.swimming = !!(f & PoseFlag.SWIMMING);
  p.swimPose = !!(f & PoseFlag.SWIM_POSE);
  p.fallFlying = !!(f & PoseFlag.FALL_FLYING);
  p.glidePose = !!(f & PoseFlag.GLIDE_POSE);
  p.flying = !!(f & PoseFlag.FLYING);
  p.spinPose = !!(f & PoseFlag.SPIN_POSE);
  const h = p.swimPose || p.glidePose || p.spinPose ? 0.6 : p.crouching ? 1.5 : 1.8;
  if (p.height !== h) p.setSize(0.6, h);
}

/** what `p` shows it holds and wears (CB.SetEquipment's slots: main hand, offhand, feet, legs, chest, head) */
export function equipment(p: Player): (ItemStack | null)[] {
  const inv = p.inventory;
  return [inv.main[inv.selected], inv.offhand, inv.armor[0], inv.armor[1], inv.armor[2], inv.armor[3]];
}

/** a stack's identity for "has it changed": item, count, damage and data */
export function stackKey(s: ItemStack | null): string {
  return s ? `${s.item.id}|${s.count}|${s.damage}|${s.tag ? JSON.stringify(s.tag) : ''}` : '';
}
