// Blocks whose collision shape follows their block entity rather than their state (vanilla Block.hasDynamicShape: a
// shulker box's lid, which stands half a block proud of it while it's open). Entities ask here for those states only.
// Also whether a side of a collision shape is whole (vanilla Block.isFaceFull), which shulkers cling to.

import { COLLISION, FLAGS, F_FULL_COLLISION, STATE_BLOCK, stateCount, type Block, type Box } from './block';
import { AXIS_OF, DX, DY, DZ } from './dir';
import type { World } from './world';

type ShapeFn = (w: World, x: number, y: number, z: number, st: number) => Box[] | null;

/** per state: 1 where the collision is `dynamicCollision`'s, not COLLISION's */
export let DYNAMIC_SHAPE: Uint8Array = new Uint8Array(0);
const SHAPES = new Map<number, ShapeFn>();

/** `block`'s collision is worked out where it stands, each time it's asked */
export function registerDynamicShape(block: Block, fn: ShapeFn): void {
  if (DYNAMIC_SHAPE.length < stateCount()) {
    const grown = new Uint8Array(stateCount());
    grown.set(DYNAMIC_SHAPE);
    DYNAMIC_SHAPE = grown;
  }
  for (let st = block.baseState; st < block.baseState + block.stateCount; st++) DYNAMIC_SHAPE[st] = 1;
  SHAPES.set(block.id, fn);
}

/** the collision boxes of the block `st` at (x, y, z), block-relative */
export function dynamicCollision(w: World, x: number, y: number, z: number, st: number): Box[] | null {
  const f = SHAPES.get(STATE_BLOCK[st]);
  return f ? f(w, x, y, z, st) : COLLISION[st];
}

/**
 * vanilla Block.isFaceFull(getCollisionShape(...), face): the side of the collision shape of the block at (x, y, z)
 * facing `face` (a Dir) is whole — every bit of that side of the cell is covered by boxes reaching it. What a shulker
 * clings to (BlockState.entityCanStandOnFace) and what stops a shulker bullet (entityCanStandOn, the top face).
 */
export function collisionFaceFull(w: World, x: number, y: number, z: number, face: number): boolean {
  const st = w.getState(x, y, z);
  if (FLAGS[st] & F_FULL_COLLISION) return true;
  const boxes = DYNAMIC_SHAPE[st] ? dynamicCollision(w, x, y, z, st) : COLLISION[st];
  if (!boxes || !boxes.length) return false;
  const a = AXIS_OF[face], positive = DX[face] + DY[face] + DZ[face] > 0;
  // the face's plane in its other two axes
  const u = a === 0 ? 1 : 0, v = a === 2 ? 1 : 2;
  const rects: number[][] = [];
  for (const b of boxes) if (positive ? b[a + 3] >= 1 - 1e-7 : b[a] <= 1e-7) rects.push([b[u], b[v], b[u + 3], b[v + 3]]);
  if (!rects.length) return false;
  // covered if every cell of the grid the rectangles' edges make is inside one of them
  const cuts = (i: number, j: number) => [...new Set([0, 1, ...rects.flatMap((r) => [r[i], r[j]])])].filter((c) => c >= 0 && c <= 1).sort((p, q) => p - q);
  const us = cuts(0, 2), vs = cuts(1, 3);
  for (let i = 0; i + 1 < us.length; i++)
    for (let j = 0; j + 1 < vs.length; j++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
      if (!rects.some((r) => r[0] <= cu && cu <= r[2] && r[1] <= cv && cv <= r[3])) return false;
    }
  return true;
}
