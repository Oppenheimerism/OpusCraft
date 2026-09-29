// (remaining mobs: the panda) vanilla BlockStateBase.getOffset for OffsetType.XZ, the nudge off the block's centre a
// plant is drawn with (render/mesher.ts works out the same one), and the blocks whose shapes move with it: vanilla's
// bamboo stalk and shoot add state.getOffset to their outline and collision (BambooStalkBlock.getShape and
// getCollisionShape, BambooSaplingBlock.getShape), so the box drawn round one, the one clicked and the one bumped into
// are where the stalk is drawn. The other offset plants (flowers, grass) keep their outlines on the block's centre, as
// they were.

import { mcPosSeed } from '../core/rng';
import { BLOCKS, STATE_BLOCK, type Block } from './block';

const ZERO: readonly [number, number] = [0, 0];
/** per block id: 1 where its outline and collision are set off as its model is */
let MOVED = new Uint8Array(0);

/** `b`'s shapes move with its model's offset */
export function moveShapesWithOffset(b: Block): void {
  if (MOVED.length <= b.id) {
    const grown = new Uint8Array(b.id + 64);
    grown.set(MOVED);
    MOVED = grown;
  }
  MOVED[b.id] = 1;
}

/**
 * vanilla getOffset (OffsetType.XZ): from the column's seed (Mth.getSeed(x, 0, z)), up to half a quarter block
 * either way on x and on z, no further than the block's getMaxHorizontalOffset
 */
export function horizontalOffset(b: Block, x: number, z: number): [number, number] {
  const l = mcPosSeed(x, 0, z), m = b.maxOffset;
  const ox = Math.max(-m, Math.min(m, ((l & 15) / 15 - 0.5) * 0.5));
  const oz = Math.max(-m, Math.min(m, (((l >> 8) & 15) / 15 - 0.5) * 0.5));
  return [ox, oz];
}

/** how far the outline and collision of the block `st` at (x, z) are moved on x and z ([0, 0] for nearly all) */
export function shapeOffset(st: number, x: number, z: number): readonly [number, number] {
  const id = STATE_BLOCK[st];
  if (id >= MOVED.length || !MOVED[id]) return ZERO;
  return horizontalOffset(BLOCKS[id], x, z);
}
