// The ocean's blocks (Stage 5: ocean): prismarine, prismarine bricks and dark prismarine — the cyan-green stone of
// the ocean monuments, the first slowly shifting its hue (an animated texture) — with prismarine's wall (the only
// one of the three with a wall; their slabs and stairs are in the shared table of blocks.ts), and the wet sponge, a
// sponge full of water (what the sponges do is game/sponge.ts). The sea lantern and the dry sponge were here before.
// And the conduit (vanilla ConduitBlock), which its block entity draws and works (game/conduit.ts).

import { registerBlock, P, type Box } from './block';
import { cubeAll, box, type ModelDef, type ModelChoice } from './models';
import { registerWall } from './blocksExtra';

const one = (m: ModelDef) => (): ModelChoice => ({ model: m });
const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

export function registerOceanBlocks(): void {
  // vanilla Blocks.PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE: strength 1.5 / 6, only a pickaxe gets them
  for (const name of ['prismarine', 'prismarine_bricks', 'dark_prismarine'])
    registerBlock(name, { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(name)) });
  // vanilla Blocks.PRISMARINE_WALL
  registerWall('prismarine_wall', 'prismarine', 1.5);
  // vanilla Blocks.WET_SPONGE: strength 0.6, SoundType.WET_SPONGE; quickest with a hoe
  registerBlock('wet_sponge', { hardness: 0.6, sound: 'wet_sponge', tool: 'hoe', model: one(cubeAll('wet_sponge')) });
  // vanilla Blocks.CONDUIT: diamond's colour on maps, strength 3, light 15, no occlusion, waterlogged by default (its
  // placement: only in a full block of water, game/conduit.ts); a 6-pixel box in the middle; quickest with a pickaxe.
  // The block draws nothing itself (vanilla RenderShape.ENTITYBLOCK_ANIMATED); its item is a shell (larger than the
  // block's, to show in a slot)
  registerBlock('conduit', {
    props: [P.waterlogged], defaults: { waterlogged: true }, hardness: 3, sound: 'stone', tool: 'pickaxe', light: 15, opaque: false, aoCaster: false,
    faceOcclusion: 0, collision: [bx(5, 5, 5, 11, 11, 11)],
    model: () => ({ model: { particle: 'conduit', elements: [] } }),
    itemModel: { particle: 'conduit', elements: [box([3, 3, 3], [13, 13, 13], 'conduit', { noCull: true })] },
  });
}
