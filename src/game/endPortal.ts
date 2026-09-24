// The end portal in the world: eyes of ender set into end portal frames, the
// ring of twelve eyed frames that opens a portal, and the portal itself
// (vanilla EnderEyeItem, EndPortalFrameBlock.getOrCreatePortalShape and
// EndPortalBlock). What happens to whatever falls in — the trip to the End or
// back — is game/endTravel.ts; the portal's starfield is render/endRenderer.ts.
//
// Used in the air, an eye is thrown toward the nearest stronghold (entity/eyeOfEnder.ts); where there's none to
// find (the Nether, the End) it does nothing but the use itself (you walk slowly while you hold the button down).

import { BLOCK_BY_NAME, STATE_BLOCK, S } from '../world/block';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import { EyeOfEnder } from '../entity/eyeOfEnder';
import { registerBehavior } from './blockBehavior';
import { registerItemBehavior } from './itemBehavior';
import { raycast } from './raycast';
import './endBlocks';
import './gatewayTravel';
import './chorus';

/** vanilla Block.UPDATE_CLIENTS (the frame and the portal blocks are set without telling the neighbours) */
const UPDATE_CLIENTS = 2;

const FRAME = BLOCK_BY_NAME.get('end_portal_frame')!;

/**
 * vanilla EnderEyeItem.use's server side: `locate` is ServerLevel.findNearestMapStructure(EYE_OF_ENDER_LOCATED,
 * pos, 100, false), the nearest stronghold's start chunk corner (only the Overworld has them); `launch` throws the
 * EyeOfEnder toward it from the middle of the player, plays entity.ender_eye.launch, uses up the eye and swings
 * the hand.
 */
export const EYE_OF_ENDER: {
  locate: ((level: Level, x: number, y: number, z: number) => [number, number, number] | null) | null;
  launch: ((level: Level, p: Player, stack: ItemStack, target: [number, number, number]) => void) | null;
} = {
  locate(level, x, y, z) {
    if (level.world.dim.id !== 'overworld') return null;
    const [sx, sz] = level.strongholds().nearest(x, y, z);
    return [sx, 0, sz];
  },
  launch(level, p, stack, target) {
    const eye = new EyeOfEnder(level, p.x, p.y + p.height * 0.5, p.z, stack);
    eye.signalTo(target[0], target[1], target[2]);
    level.addEntity(eye);
    level.sound.play('entity.ender_eye.launch', p.x, p.y, p.z, 1, 0.33 + level.random.nextFloat() * 0.17);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
  },
};

/** an end portal frame with its eye in, facing `facing` */
function eyedFrame(w: World, x: number, y: number, z: number, facing: string): boolean {
  const st = w.getState(x, y, z);
  return STATE_BLOCK[st] === FRAME.id && FRAME.get(st, 'eye') === true && FRAME.get(st, 'facing') === facing;
}

/**
 * vanilla EndPortalFrameBlock.getOrCreatePortalShape (aisle "?vvv?", ">???<" x3, "?^^^?") and BlockPattern.find:
 * twelve frames with eyes round a 3x3 middle, every one facing in. The match's front top left is the ring's
 * south-east corner; vanilla looks for it from the frame just filled up to 4 blocks east, up and south (x fastest,
 * then y, then z). Returns that corner.
 */
export function findPortalShape(w: World, x: number, y: number, z: number): [number, number, number] | null {
  for (let dz = 0; dz <= 4; dz++)
    for (let dy = 0; dy <= 4; dy++)
      for (let dx = 0; dx <= 4; dx++) {
        const sx = x + dx, sy = y + dy, sz = z + dz;
        let ok = true;
        for (let k = 1; k <= 3 && ok; k++)
          ok =
            eyedFrame(w, sx - k, sy, sz, 'north') && // the south side faces north ('v')
            eyedFrame(w, sx, sy, sz - k, 'west') && // the east side faces west ('>')
            eyedFrame(w, sx - 4, sy, sz - k, 'east') && // the west side faces east ('<')
            eyedFrame(w, sx - k, sy, sz - 4, 'south'); // the north side faces south ('^')
        if (ok) return [sx, sy, sz];
      }
  return null;
}

/** vanilla Block.pushEntitiesUp: what stands where the eye goes is lifted on top of it */
function pushEntitiesUp(level: Level, x: number, y: number, z: number): void {
  // the part the eye adds to the frame's shape (vanilla Shapes.joinUnoptimized(old, new, ONLY_SECOND))
  const eye = new AABB(x + 0.25, y + 0.8125, z + 0.25, x + 0.75, y + 1, z + 0.75);
  for (const e of level.getEntities(eye)) {
    const d = y + 1 - e.bb.minY;
    if (d > 0 && d <= 1) e.setPos(e.x, e.y + d, e.z);
  }
}

/** vanilla LevelRenderer.globalLevelEvent 1038: the portal's opening heard from wherever you are, two blocks from you toward it */
function portalSpawnSound(level: Level, x: number, y: number, z: number): void {
  const p = level.player;
  if (!p) return;
  const cx = p.x, cy = p.y + p.eyeHeight, cz = p.z;
  let dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  level.sound.play('block.end_portal.spawn', cx + dx * 2, cy + dy * 2, cz + dz * 2, 1, 1);
}

registerItemBehavior('ender_eye', {
  /** vanilla EnderEyeItem.useOn: into an empty frame; the twelfth eye of a ring opens the portal in its middle */
  useOn(level, p, _stack, h) {
    const st = level.getState(h.x, h.y, h.z);
    if (STATE_BLOCK[st] !== FRAME.id || FRAME.get(st, 'eye')) return 'pass';
    const now = FRAME.with(st, 'eye', true);
    pushEntitiesUp(level, h.x, h.y, h.z);
    level.setBlock(h.x, h.y, h.z, now, UPDATE_CLIENTS);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    // vanilla level event 1503: the eye's sound and a puff of smoke over it
    level.sound.play('block.end_portal_frame.fill', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
    for (let i = 0; i < 16; i++) level.particles.spawn?.('smoke', h.x + (5 + Math.random() * 6) / 16, h.y + 0.8125, h.z + (5 + Math.random() * 6) / 16, 0, 0, 0);
    const corner = findPortalShape(level.world, h.x, h.y, h.z);
    if (corner) {
      const [x0, y0, z0] = [corner[0] - 3, corner[1], corner[2] - 3];
      const PORTAL = S('end_portal');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) level.setBlock(x0 + i, y0, z0 + j, PORTAL, UPDATE_CLIENTS);
      portalSpawnSound(level, x0 + 1, y0, z0 + 1);
    }
    p.swing();
    return 'success';
  },
  /** vanilla EnderEyeItem.use: looking at a frame, the frame's business; else find the nearest stronghold and throw */
  use(level, p, stack) {
    const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
    const reach = p.gameMode === 'creative' ? 5 : 4.5;
    const h = raycast(level.world, p.x, p.y + p.eyeHeight, p.z, -Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr), reach);
    if (h && STATE_BLOCK[h.state] === FRAME.id) return 'pass';
    // (vanilla starts using it whatever it finds: its use never ends by itself, so you walk slowly till you let go)
    if (!p.isUsingItem()) p.startUsingItem(stack, 0);
    const target = EYE_OF_ENDER.locate?.(level, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) ?? null;
    if (target && EYE_OF_ENDER.launch) EYE_OF_ENDER.launch(level, p, stack, target);
    // (vanilla success or consume: either way the hand dips)
    return 'success';
  },
});

registerBehavior('end_portal', {
  /** vanilla EndPortalBlock.entityInside: reaching into its slab (6..12), anything that isn't riding goes through */
  entityInside(_level, x, y, z, _st, e) {
    if (e.vehicle || e.removed) return;
    if (!(e.bb.maxY > y + 0.375 && e.bb.minY < y + 0.75)) return;
    // (vanilla sends a player leaving the End the first time straight to the credits, not waiting for its portal
    // time — which for an end portal is none: endTravel.ts rolls them on the way home)
    e.setAsInsidePortal('end', x, y, z);
  },
  /** vanilla EndPortalBlock.animateTick: smoke rising off it */
  animateTick(level, x, y, z) {
    level.particles.spawn?.('smoke', x + Math.random(), y + 0.8, z + Math.random(), 0, 0, 0);
  },
});
