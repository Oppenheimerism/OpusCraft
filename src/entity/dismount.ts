// vanilla DismountHelper and BlockGetter.getBlockFloorHeight: where a rider getting off may stand.

import type { Level } from '../game/level';
import type { AABB } from '../core/aabb';
import { COLLISION } from '../world/block';

/** top of a block's collision shape, or null without one (vanilla VoxelShape.max(Y)) */
function shapeTop(st: number): number | null {
  const boxes = COLLISION[st];
  if (!boxes) return null;
  let m = -Infinity;
  for (const c of boxes) m = Math.max(m, c[4]);
  return m;
}

/** vanilla BlockGetter.getBlockFloorHeight: standing height in a block space, -Infinity if none */
export function floorHeight(level: Level, x: number, y: number, z: number): number {
  const here = shapeTop(level.getState(x, y, z));
  if (here !== null) return here;
  const below = shapeTop(level.getState(x, y - 1, z));
  return below !== null && below >= 1 ? below - 1 : -Infinity;
}

/** vanilla DismountHelper.canDismountTo: no block collision for the rider's box there */
export function blockFree(level: Level, box: AABB): boolean {
  const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX - 1e-7), y0 = Math.floor(box.minY) - 1, y1 = Math.floor(box.maxY - 1e-7);
  const z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ - 1e-7);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const boxes = COLLISION[level.getState(x, y, z)];
        if (!boxes) continue;
        for (const c of boxes) if (box.intersectsRaw(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5])) return false;
      }
  return true;
}
