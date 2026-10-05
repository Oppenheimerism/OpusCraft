// (the wither) The wither rose (vanilla Blocks.WITHER_ROSE, a WitherRoseBlock): a black rose, a flower like the others
// (block/cross), set off its block's middle as they are, nothing to bump into, broken at a touch with grass's sounds,
// broken by a piston; and the pot with one in it (vanilla Blocks.POTTED_WITHER_ROSE, block/flower_pot_cross). What it
// does is game/witherRose.ts.

import { registerBlock, BLOCK_BY_NAME, Layer, type Box } from './block';
import { cross } from './models';
import { FLOWER_POT_SHAPE, pottedModel } from './blocksVillage';

/** vanilla FlowerBlock.SHAPE */
const FLOWER_BOX: Box[] = [[5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16]];

export function registerWitherBlocks(): void {
  const rose = cross('wither_rose');
  registerBlock('wither_rose', {
    hardness: 0, sound: 'grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, offset: 'xz', outline: FLOWER_BOX, model: () => ({ model: rose }),
  });
  // (as world/blocksVillage.ts makes every other potted plant: broken in a blink, stone's sounds, no item of its own)
  if (BLOCK_BY_NAME.has('flower_pot')) {
    const potted = pottedModel('wither_rose');
    registerBlock('potted_wither_rose', {
      hardness: 0, sound: 'stone', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, collision: FLOWER_POT_SHAPE, item: false, model: () => ({ model: potted }),
    });
  }
}
