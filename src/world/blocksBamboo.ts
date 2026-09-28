// The bamboo plant (remaining mobs: the panda). Vanilla BambooSaplingBlock, the shoot that planting bamboo on the
// ground puts down: a cross of block/bamboo_stage0, nothing to bump into. And BambooStalkBlock, the stalk: thin (age 0)
// or thick (age 1), bare or with small or large leaves, and stage 1 once it has stopped growing; drawn as one of four
// stalk models (bamboo1..4_age0/age1, each a different strip of block/bamboo_stalk) picked by where it stands, its
// leaves crossed over it. Both are set off the block's centre by up to a quarter block as flowers are, their outline
// and collision with them (world/blockOffset.ts). And potted bamboo (vanilla block/potted_bamboo). What they do is
// game/bamboo.ts; where they grow, world/gen/bambooFeature.ts.

import { registerBlock, BLOCK_BY_NAME, Layer, P, intProp, enumProp, type Box } from './block';
import { cross, type ElementDef, type FaceDef, type ModelDef, type UV4, type Variant } from './models';
import { flowerPotElements, FLOWER_POT_SHAPE } from './blocksVillage';
import { moveShapesWithOffset } from './blockOffset';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla BlockStateProperties.AGE_1: 0 a thin stalk, 1 a thick one */
export const BAMBOO_AGE = intProp('age', 0, 1);
/** vanilla BlockStateProperties.BAMBOO_LEAVES */
export const BAMBOO_LEAVES = enumProp('leaves', ['none', 'small', 'large']);

/**
 * vanilla BlockTags.BAMBOO_PLANTABLE_ON: #sand (sand, red sand, suspicious sand), #dirt, bamboo and its shoot, gravel
 * and suspicious gravel
 */
export const BAMBOO_PLANTABLE_ON: ReadonlySet<string> = new Set([
  'sand', 'red_sand', 'suspicious_sand', 'dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud',
  'muddy_mangrove_roots', 'bamboo', 'bamboo_sapling', 'gravel', 'suspicious_gravel',
]);

/** vanilla BambooStalkBlock.SMALL_SHAPE and LARGE_SHAPE (its outline, by its leaves) and COLLISION_SHAPE */
export const BAMBOO_SMALL_SHAPE = bx(5, 0, 5, 11, 16, 11);
export const BAMBOO_LARGE_SHAPE = bx(3, 0, 3, 13, 16, 13);
export const BAMBOO_COLLISION_SHAPE = bx(6.5, 0, 6.5, 9.5, 16, 9.5);
/** vanilla BambooSaplingBlock.SAPLING_SHAPE */
export const BAMBOO_SAPLING_SHAPE = bx(4, 0, 4, 12, 12, 12);

/**
 * vanilla block/bamboo{1..4}_age{0,1}: a square stalk up the middle, two pixels across (three thick), its sides the
 * `v`th strip of block/bamboo_stalk, its ends from the corner of it
 */
function stalkModel(age: number, v: number): ModelDef {
  const [a, b] = age ? [6.5, 9.5] : [7, 9];
  const u0 = v * 3, w = age ? 3 : 2;
  const t = 'bamboo_stalk';
  const side: FaceDef = { tex: t, uv: [u0, 0, u0 + w, 16] };
  const up: UV4 = age ? [13, 0, 16, 3] : [13, 0, 15, 2];
  const down: UV4 = age ? [13, 4, 16, 7] : [13, 4, 15, 6];
  return {
    particle: t,
    elements: [{ from: [a, 0, a], to: [b, 16, b], faces: { down: { tex: t, uv: down, cull: 'down' }, up: { tex: t, uv: up, cull: 'up' }, north: side, south: side, west: side, east: side } }],
  };
}

/**
 * vanilla block/potted_bamboo: the pot with a short thin stalk standing in its dirt and a leaf off each side of it near
 * the top (block/bamboo_singleleaf). The leaves' exact places are this game's own
 */
function pottedBambooModel(): ModelDef {
  const t = 'bamboo_stalk', leaf = 'bamboo_singleleaf';
  const side = (u0: number): FaceDef => ({ tex: t, uv: [u0, 4, u0 + 2, 16] });
  const rot = (angle: number) => ({ origin: [8, 8, 8] as [number, number, number], axis: 'y' as const, angle, rescale: false });
  const stalk: ElementDef = { from: [7, 4, 7], to: [9, 16, 9], faces: { up: { tex: t, uv: [13, 0, 15, 2] }, north: side(3), south: side(0), west: side(9), east: side(6) } };
  // (each leaf a flat card, the leaf drawn up and out from its lower inner corner; the second one mirrored)
  const leafA: ElementDef = { from: [8, 8, 8], to: [16, 16, 8], rot: rot(45), shade: false, faces: { north: { tex: leaf, uv: [16, 0, 8, 8] }, south: { tex: leaf, uv: [8, 0, 16, 8] } } };
  const leafB: ElementDef = { from: [0, 6, 8], to: [8, 14, 8], rot: rot(-45), shade: false, faces: { north: { tex: leaf, uv: [8, 0, 16, 8] }, south: { tex: leaf, uv: [16, 0, 8, 8] } } };
  return { ao: false, particle: 'flower_pot', elements: [...flowerPotElements(), stalk, leafA, leafB] };
}

export function registerBambooBlocks(): void {
  // vanilla Blocks.BAMBOO_SAPLING: strength 1 (instabreak() then strength(1)), SoundType.BAMBOO_SAPLING, nothing to
  // collide with, random ticks, set off on x and z; no item of its own (bamboo plants it; a pick gives bamboo)
  const shoot = cross('bamboo_stage0');
  const sapling = registerBlock('bamboo_sapling', {
    hardness: 1, sound: 'bamboo_sapling', collision: 'none', outline: [BAMBOO_SAPLING_SHAPE], offset: 'xz', randomTicks: true, item: false,
    layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, model: () => ({ model: shoot }),
  });
  // vanilla Blocks.BAMBOO: strength 1, SoundType.BAMBOO, random ticks (only while growing: game/bamboo.ts), no
  // occlusion, light straight through (propagatesSkylightDown), set off on x and z; the outline wider with large leaves
  const stalks = [0, 1].map((age) => [0, 1, 2, 3].map((v): Variant => ({ model: stalkModel(age, v) })));
  const small = { model: cross('bamboo_small_leaves') }, large = { model: cross('bamboo_large_leaves') };
  const bamboo = registerBlock('bamboo', {
    props: [BAMBOO_AGE, BAMBOO_LEAVES, P.stage], defaults: { age: 0, leaves: 'none', stage: 0 }, hardness: 1, sound: 'bamboo',
    collision: [BAMBOO_COLLISION_SHAPE], outline: (s) => [s.get('leaves') === 'large' ? BAMBOO_LARGE_SHAPE : BAMBOO_SMALL_SHAPE],
    offset: 'xz', randomTicks: true, layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
    model: (s) => {
      const leaves = s.get('leaves');
      return { parts: [stalks[s.get('age') as number], ...(leaves === 'small' ? [small] : leaves === 'large' ? [large] : [])] };
    },
  });
  moveShapesWithOffset(sapling);
  moveShapesWithOffset(bamboo);
  // vanilla Blocks.POTTED_BAMBOO: a flower pot's (the village's pots are world/blocksVillage.ts; this one waited for
  // bamboo)
  if (BLOCK_BY_NAME.has('flower_pot') && !BLOCK_BY_NAME.has('potted_bamboo')) {
    const potted = pottedBambooModel();
    registerBlock('potted_bamboo', {
      hardness: 0, sound: 'stone', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, collision: FLOWER_POT_SHAPE, item: false,
      model: () => ({ model: potted }),
    });
  }
}
