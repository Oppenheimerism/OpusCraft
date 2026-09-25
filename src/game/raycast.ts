// Block picking: voxel traversal testing each block's outline shape.

import { OUTLINE, COLLISION, FLAGS, F_AIR, F_WATER, F_LAVA } from '../world/block';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';
import { fluidHeight, fluidType, FLUID_NONE } from '../world/fluids';

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
        // the fluid's shape: its surface height (vanilla FluidState.getShape)
        const box = new AABB(x, y, z, x + 1, y + fluidHeight(world, x, y, z, fluidType(st)), z + 1);
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

export interface SegmentHit {
  x: number;
  y: number;
  z: number;
  face: number;
  /** fraction along the segment */
  t: number;
  px: number;
  py: number;
  pz: number;
}

/**
 * Clip the segment (x0,y0,z0)→(x1,y1,z1) against block collision shapes
 * (vanilla Level.clip with ClipContext.Block.COLLIDER, Fluid.NONE; with `fluids`, Fluid.ANY: a cell of water or
 * lava stops it where it enters)
 */
export function clipBlocks(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, fluids = false): SegmentHit | null {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return null;
  let x = Math.floor(x0), y = Math.floor(y0), z = Math.floor(z0);
  const ex = Math.floor(x1), ey = Math.floor(y1), ez = Math.floor(z1);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity, tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMX = dx !== 0 ? (dx > 0 ? x + 1 - x0 : x0 - x) * tDX : Infinity;
  let tMY = dy !== 0 ? (dy > 0 ? y + 1 - y0 : y0 - y) * tDY : Infinity;
  let tMZ = dz !== 0 ? (dz > 0 ? z + 1 - z0 : z0 - z) * tDZ : Infinity;
  let tIn = 0;
  for (let i = 0; i < 1024; i++) {
    const st = world.getState(x, y, z);
    if (fluids && fluidType(st) !== FLUID_NONE) return { x, y, z, face: 0, t: tIn, px: x0 + dx * tIn, py: y0 + dy * tIn, pz: z0 + dz * tIn };
    const boxes = COLLISION[st];
    if (boxes && boxes.length) {
      let best: SegmentHit | null = null;
      for (const b of boxes) {
        const box = new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        const h = box.clip(x0, y0, z0, x1, y1, z1);
        if (h && (!best || h.t < best.t)) best = { x, y, z, face: h.face, t: h.t, px: x0 + dx * h.t, py: y0 + dy * h.t, pz: z0 + dz * h.t };
      }
      if (best) return best;
    }
    if (x === ex && y === ey && z === ez) return null;
    if (tMX < tMY) {
      if (tMX < tMZ) {
        if (tMX > 1) return null;
        x += stepX;
        tIn = tMX;
        tMX += tDX;
      } else {
        if (tMZ > 1) return null;
        z += stepZ;
        tIn = tMZ;
        tMZ += tDZ;
      }
    } else if (tMY < tMZ) {
      if (tMY > 1) return null;
      y += stepY;
      tIn = tMY;
      tMY += tDY;
    } else {
      if (tMZ > 1) return null;
      z += stepZ;
      tIn = tMZ;
      tMZ += tDZ;
    }
  }
  return null;
}
