// What a block holds up (vanilla BlockStateBase.isFaceSturdy with its SupportType): a face is sturdy when the
// block's support shape covers it — its collision shape, except that leaves hold nothing up and soul sand and mud
// (lower than a block) hold up as much as a full one. CENTER support is the middle of the face, as a fence post's
// top gives. The redstone components hang on and stand on what this says.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, COLLISION, F_LEAVES, faceMaskFromBoxes } from '../../world/block';
import { UP, type Dir } from '../../world/dir';

let MASK: Uint8Array | null = null;

/** the faces each state's support shape covers (bit per direction) */
function masks(): Uint8Array {
  if (MASK) return MASK;
  MASK = new Uint8Array(FLAGS.length);
  for (let st = 0; st < FLAGS.length; st++) {
    const n = BLOCKS[STATE_BLOCK[st]].name;
    if (FLAGS[st] & F_LEAVES) continue;
    if (n === 'soul_sand' || n === 'mud') MASK[st] = 63;
    else MASK[st] = FACE_OCC[st] | (COLLISION[st] ? faceMaskFromBoxes(COLLISION[st]!) : 0);
  }
  return MASK;
}

/** vanilla isFaceSturdy(FULL / RIGID) */
export function sturdyFace(st: number, face: Dir): boolean {
  return ((masks()[st] >> face) & 1) === 1;
}

/** vanilla Block.canSupportCenter: a sturdy face, or the post of a fence, wall, pane, bars or chain */
export function supportsCenter(st: number, face: Dir = UP): boolean {
  return sturdyFace(st, face) || (face === UP && /_fence$|_wall$|_pane$|^iron_bars$|^chain$/.test(BLOCKS[STATE_BLOCK[st]].name));
}
