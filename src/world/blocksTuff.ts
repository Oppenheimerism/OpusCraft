// The tuff blocks of 1.21 (vanilla Blocks.TUFF_SLAB ... CHISELED_TUFF_BRICKS): tuff's own stairs, slab and wall,
// chiseled tuff, polished tuff and tuff bricks with theirs, and chiseled tuff bricks. Every one is a copy of tuff
// (Properties.ofLegacyCopy(TUFF): strength 1.5/6, a pickaxe to drop anything, TERRACOTTA_GRAY on maps), the polished
// tuff and the bricks with their own sounds (SoundType.POLISHED_TUFF, TUFF_BRICKS). The slab and stairs helpers here
// serve the cut copper too (blocksCopper.ts).

import { registerBlock, P, type Box, type BlockSettings, type StateView } from './block';
import { cubeAll, cubeColumn, slabBottom, slabTop, stairsModel, type ModelDef } from './models';
import { stairBoxes, stairVariant } from './blocks';
import { registerWall } from './blocksExtra';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** what a stone-like block's slab, stairs and wall share with it: strength, sound and the pickaxe to drop them */
export interface Cut {
  hardness: number;
  resistance: number;
  sound: string;
  /** vanilla needs_stone_tool and the like: the pickaxe tier below which nothing drops */
  tier?: number;
}

/** a slab of one texture (vanilla SlabBlock; doubled it is the block's own model), as blocks.ts registers the others */
export function registerSlab(name: string, tex: string, c: Cut, extra: BlockSettings = {}, full: ModelDef = cubeAll(tex)): void {
  const bottom = slabBottom(tex, tex, tex), top = slabTop(tex, tex, tex);
  registerBlock(name, {
    props: [P.slabType, P.waterlogged], defaults: { type: 'bottom' }, hardness: c.hardness, resistance: c.resistance, sound: c.sound,
    tool: 'pickaxe', tier: c.tier ?? 0, requiresTool: true,
    collision: (s) => (s.get('type') === 'double' ? 'full' : s.get('type') === 'top' ? [bx(0, 8, 0, 16, 16, 16)] : [bx(0, 0, 0, 16, 8, 16)]),
    opaque: (s) => s.get('type') === 'double',
    faceOcclusion: (s) => (s.get('type') === 'double' ? 63 : s.get('type') === 'top' ? 2 : 1),
    aoCaster: false,
    model: (s) => ({ model: s.get('type') === 'double' ? full : s.get('type') === 'top' ? top : bottom }),
    ...extra,
  });
}

/** stairs of one texture (vanilla StairBlock), as blocks.ts registers the others */
export function registerStairs(name: string, tex: string, c: Cut, extra: BlockSettings = {}): void {
  const straight = stairsModel(tex, tex, tex, 'straight'), inner = stairsModel(tex, tex, tex, 'inner'), outer = stairsModel(tex, tex, tex, 'outer');
  registerBlock(name, {
    props: [P.facingH, P.halfTB, P.stairShape, P.waterlogged], defaults: { facing: 'north', half: 'bottom' },
    hardness: c.hardness, resistance: c.resistance, sound: c.sound, tool: 'pickaxe', tier: c.tier ?? 0, requiresTool: true, aoCaster: false,
    opaque: false,
    faceOcclusion: (s: StateView) => {
      const f = s.get('facing') as string;
      const back = { north: 1 << 2, south: 1 << 3, west: 1 << 4, east: 1 << 5 }[f] ?? 0;
      return (s.get('half') === 'bottom' ? 1 : 2) | (s.get('shape') === 'straight' ? back : 0);
    },
    collision: (s) => stairBoxes(s),
    model: (s) => stairVariant(s, straight, inner, outer),
    ...extra,
  });
}

export function registerTuffBlocks(): void {
  const tuff: Cut = { hardness: 1.5, resistance: 6, sound: 'tuff' };
  const polished: Cut = { ...tuff, sound: 'polished_tuff' };
  const bricks: Cut = { ...tuff, sound: 'tuff_bricks' };
  const stone = { tool: 'pickaxe' as const, requiresTool: true };
  const chiseledTuff = cubeColumn('chiseled_tuff', 'chiseled_tuff_top'), polishedTuff = cubeAll('polished_tuff');
  const tuffBricks = cubeAll('tuff_bricks'), chiseledBricks = cubeColumn('chiseled_tuff_bricks', 'chiseled_tuff_bricks_top');
  // vanilla Blocks.TUFF_SLAB, TUFF_STAIRS, TUFF_WALL (forceSolidOn), CHISELED_TUFF (block/chiseled_tuff: cube_column)
  registerSlab('tuff_slab', 'tuff', tuff);
  registerStairs('tuff_stairs', 'tuff', tuff);
  registerWall('tuff_wall', 'tuff', 1.5, 'tuff');
  registerBlock('chiseled_tuff', { ...tuff, ...stone, model: () => ({ model: chiseledTuff }) });
  // vanilla Blocks.POLISHED_TUFF and its slab, stairs and wall
  registerBlock('polished_tuff', { ...polished, ...stone, model: () => ({ model: polishedTuff }) });
  registerSlab('polished_tuff_slab', 'polished_tuff', polished);
  registerStairs('polished_tuff_stairs', 'polished_tuff', polished);
  registerWall('polished_tuff_wall', 'polished_tuff', 1.5, 'polished_tuff');
  // vanilla Blocks.TUFF_BRICKS and theirs, and CHISELED_TUFF_BRICKS (cube_column)
  registerBlock('tuff_bricks', { ...bricks, ...stone, model: () => ({ model: tuffBricks }) });
  registerSlab('tuff_brick_slab', 'tuff_bricks', bricks);
  registerStairs('tuff_brick_stairs', 'tuff_bricks', bricks);
  registerWall('tuff_brick_wall', 'tuff_bricks', 1.5, 'tuff_bricks');
  registerBlock('chiseled_tuff_bricks', { ...bricks, ...stone, model: () => ({ model: chiseledBricks }) });
}
