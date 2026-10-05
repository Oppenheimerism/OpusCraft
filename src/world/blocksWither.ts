// (the wither) The wither rose (vanilla Blocks.WITHER_ROSE, a WitherRoseBlock): a black rose, a flower like the others
// (block/cross), set off its block's middle as they are, nothing to bump into, broken at a touch with grass's sounds,
// broken by a piston; and the pot with one in it (vanilla Blocks.POTTED_WITHER_ROSE, block/flower_pot_cross). What it
// does is game/witherRose.ts. (the beacon) And the beacon, crafted round the wither's nether star (vanilla
// Blocks.BEACON, block/beacon): what it does is game/beacon.ts.

import { registerBlock, BLOCK_BY_NAME, Layer, type Box } from './block';
import { cross, type ModelDef, type FaceDef } from './models';
import { FLOWER_POT_SHAPE, pottedModel } from './blocksVillage';

/** vanilla FlowerBlock.SHAPE */
const FLOWER_BOX: Box[] = [[5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16]];

/** (the beacon) vanilla block/beacon: a glass case (no face of it ever culled), an obsidian slab on its floor, and the beacon's heart */
function beaconModel(): ModelDef {
  const f = (tex: string, uv: [number, number, number, number]): FaceDef => ({ tex, uv });
  const all = (tex: string, top: [number, number, number, number], side: [number, number, number, number]) => ({
    down: f(tex, top), up: f(tex, top), north: f(tex, side), south: f(tex, side), west: f(tex, side), east: f(tex, side),
  });
  return {
    particle: 'glass',
    elements: [
      { from: [0, 0, 0], to: [16, 16, 16], faces: all('glass', [0, 0, 16, 16], [0, 0, 16, 16]) },
      { from: [2, 0.1, 2], to: [14, 3, 14], faces: all('obsidian', [2, 2, 14, 14], [2, 13, 14, 16]) },
      { from: [3, 3, 3], to: [13, 14, 13], faces: all('beacon', [3, 3, 13, 13], [3, 2, 13, 13]) },
    ],
  };
}

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
  // (the beacon) vanilla Blocks.BEACON: strength 3, stone's sounds (no sound of its own), light 15, see-through
  // (noOcclusion: it lets light through but for 1) though a full block that shades and blocks the view as one, drawn
  // cut out
  const beacon = beaconModel();
  registerBlock('beacon', {
    hardness: 3, sound: 'stone', light: 15, opaque: false, opacity: 1, viewBlocking: true, layer: Layer.CUTOUT, model: () => ({ model: beacon }),
  });
}
