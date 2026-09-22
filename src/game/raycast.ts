// Block picking: voxel traversal testing each block's outline shape.

import { OUTLINE, FLAGS, F_AIR, F_WATER, F_LAVA } from '../world/block';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';

export interface BlockHit {
  x: number;
  y: number;
  z: number;
  face: number; // Dir
  hx: number;
  hy: number;
  hz: number;
  state: number;
  dist: number;
}

export function raycast(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, fluids = false): BlockHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  const ex = ox + dx * maxDist, ey = oy + dy * maxDist, ez = oz + dz * maxDist;
  for (let i = 0; i < 256; i++) {
    const st = world.getState(x, y, z);
    const f = FLAGS[st];
    if (!(f & F_AIR)) {
      const isFluidBlock = (f & (F_WATER | F_LAVA)) !== 0 && OUTLINE[st].length === 0;
      let best: BlockHit | null = null;
      if (!isFluidBlock) {
        for (const b of OUTLINE[st]) {
          const box = new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
          const hit = box.clip(ox, oy, oz, ex, ey, ez);
          if (hit && (!best || hit.t * maxDist < best.dist)) {
            best = { x, y, z, face: hit.face, hx: ox + (ex - ox) * hit.t, hy: oy + (ey - oy) * hit.t, hz: oz + (ez - oz) * hit.t, state: st, dist: hit.t * maxDist };
          }
        }
      }
      if (fluids && (f & (F_WATER | F_LAVA))) {
        // fluid surface as a full-block hit (vanilla uses fluid shape height)
        const box = new AABB(x, y, z, x + 1, y + 0.9, z + 1);
        const hit = box.clip(ox, oy, oz, ex, ey, ez);
        if (hit && (!best || hit.t * maxDist < best.dist)) {
          best = { x, y, z, face: hit.face, hx: ox + (ex - ox) * hit.t, hy: oy + (ey - oy) * hit.t, hz: oz + (ez - oz) * hit.t, state: st, dist: hit.t * maxDist };
        }
      }
      if (best) return best;
    }
    // step
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        if (tMaxX > maxDist) return null;
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        if (tMaxZ > maxDist) return null;
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) return null;
        y += stepY;
        tMaxY += tDeltaY;
      } else {
        if (tMaxZ > maxDist) return null;
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
  }
  return null;
}
