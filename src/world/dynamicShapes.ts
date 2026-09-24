// Blocks whose collision shape follows their block entity rather than their state (vanilla Block.hasDynamicShape: a
// shulker box's lid, which stands half a block proud of it while it's open). Entities ask here for those states only.

import { COLLISION, STATE_BLOCK, stateCount, type Block, type Box } from './block';
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
