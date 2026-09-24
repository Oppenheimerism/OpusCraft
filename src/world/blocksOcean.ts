// The ocean's blocks (Stage 5: ocean): prismarine, prismarine bricks and dark prismarine — the cyan-green stone of
// the ocean monuments, the first slowly shifting its hue (an animated texture) — with prismarine's wall (the only
// one of the three with a wall; their slabs and stairs are in the shared table of blocks.ts), and the wet sponge, a
// sponge full of water (what the sponges do is game/sponge.ts). The sea lantern and the dry sponge were here before.

import { registerBlock } from './block';
import { cubeAll, type ModelDef, type ModelChoice } from './models';
import { registerWall } from './blocksExtra';

const one = (m: ModelDef) => (): ModelChoice => ({ model: m });

export function registerOceanBlocks(): void {
  // vanilla Blocks.PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE: strength 1.5 / 6, only a pickaxe gets them
  for (const name of ['prismarine', 'prismarine_bricks', 'dark_prismarine'])
    registerBlock(name, { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(name)) });
  // vanilla Blocks.PRISMARINE_WALL
  registerWall('prismarine_wall', 'prismarine', 1.5);
  // vanilla Blocks.WET_SPONGE: strength 0.6, SoundType.WET_SPONGE; quickest with a hoe
  registerBlock('wet_sponge', { hardness: 0.6, sound: 'wet_sponge', tool: 'hoe', model: one(cubeAll('wet_sponge')) });
}
