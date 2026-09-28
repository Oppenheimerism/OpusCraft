// Block definitions (vanilla-like values).

import {
  registerBlock, finalizeBlocks, P, Layer, StateView, Box, BlockSettings, Block, enumProp,
} from './block';
import {
  ModelDef, Variant, ModelChoice, cubeAll, cubeColumn, cubeBottomTop, orientable, grassLikeBlock, cross, crop,
  torchModel, wallTorchModel, flatPlane, facePlane, slabBottom, slabTop, stairsModel, box, cube, ElementDef,
} from './models';
import { registerExtraBlocks } from './blocksExtra';
import { registerEnchantingBlocks } from './blocksEnchanting';
import { registerRedstoneBlocks } from './blocksRedstone';
import { registerRedstoneComponents } from './blocksRedstoneComponents';
import { registerArchaeologyBlocks } from './blocksArchaeology';
import { registerVillageBlocks } from './blocksVillage';
import { registerEndBlocks } from './blocksEnd';
import { registerBannerBlocks } from './blocksBanners';
import { registerInfestedBlocks } from './blocksInfested';
import { registerOuterEndBlocks } from './blocksOuterEnd';
// (Stage 5: ocean)
import { registerOceanBlocks } from './blocksOcean';
// (fossils)
import { registerFossilBlocks } from './blocksFossils';
// (M9: frogs)
import { registerFrogBlocks } from './blocksFrog';
// (the deep dark)
import { registerDeepDarkBlocks } from './blocksDeepDark';
// (trial chambers)
import { registerTuffBlocks } from './blocksTuff';
import { registerCopperBlocks } from './blocksCopper';
import { registerTrialChamberBlocks } from './blocksTrialChambers';
// (bastions)
import { registerBastionBlocks } from './blocksBastion';
// (signs) the signs and hanging signs of every wood
import { registerSignBlocks } from './blocksSigns';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function randRot(m: ModelDef): Variant[] {
  return [{ model: m }, { model: m, y: 90 }, { model: m, y: 180 }, { model: m, y: 270 }];
}

function one(m: ModelDef): () => ModelChoice {
  return () => ({ model: m });
}

function axisModel(m: ModelDef) {
  return (s: StateView): ModelChoice => {
    const a = s.get('axis');
    if (a === 'y') return { model: m };
    if (a === 'z') return { model: m, x: 90 };
    return { model: m, x: 90, y: 90 };
  };
}

const HOR_ROT: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

// -------------------------------------------------------------------------
// Basic

registerBlock('air', { hardness: 0, collision: 'none', layer: Layer.NONE, replaceable: true, item: false });

const stoneLike = (name: string, hardness = 1.5, resistance = 6, tex = name, extra: BlockSettings = {}) =>
  registerBlock(name, { hardness, resistance, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(tex)), ...extra });

{
  const stone = cubeAll('stone');
  registerBlock('stone', { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: () => randRot(stone) });
}
stoneLike('granite');
stoneLike('polished_granite');
stoneLike('diorite');
stoneLike('polished_diorite');
stoneLike('andesite');
stoneLike('polished_andesite');
registerBlock('deepslate', {
  props: [P.axis], defaults: { axis: 'y' }, hardness: 3, resistance: 6, sound: 'deepslate', tool: 'pickaxe', requiresTool: true,
  model: axisModel(cubeColumn('deepslate', 'deepslate_top')),
});
stoneLike('cobbled_deepslate', 3.5, 6, 'cobbled_deepslate', { sound: 'deepslate' });
stoneLike('polished_deepslate', 3.5, 6, 'polished_deepslate', { sound: 'polished_deepslate' });
stoneLike('deepslate_bricks', 3.5, 6, 'deepslate_bricks', { sound: 'deepslate_bricks' });
stoneLike('deepslate_tiles', 3.5, 6, 'deepslate_tiles', { sound: 'deepslate_tiles' });
stoneLike('tuff', 1.5, 6, 'tuff', { sound: 'tuff' });
stoneLike('calcite', 0.75, 0.75, 'calcite', { sound: 'calcite' });
stoneLike('dripstone_block', 1.5, 1, 'dripstone_block', { sound: 'dripstone_block' });
stoneLike('cobblestone', 2, 6);
stoneLike('mossy_cobblestone', 2, 6);
stoneLike('stone_bricks', 1.5, 6);
for (const n of ['nether_bricks', 'red_nether_bricks', 'cracked_nether_bricks', 'chiseled_nether_bricks']) stoneLike(n, 2, 6, n, { sound: 'nether_bricks' });
stoneLike('mossy_stone_bricks', 1.5, 6);
stoneLike('cracked_stone_bricks', 1.5, 6);
stoneLike('chiseled_stone_bricks', 1.5, 6);
registerBlock('smooth_stone', { hardness: 2, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeColumn('smooth_stone', 'smooth_stone')) });
stoneLike('bricks', 2, 6);
stoneLike('obsidian', 50, 1200, 'obsidian', { tier: 3 });
stoneLike('crying_obsidian', 50, 1200, 'crying_obsidian', { tier: 3, light: 10 });
registerBlock('bedrock', { hardness: -1, resistance: 3600000, sound: 'stone', model: () => randRot(cubeAll('bedrock')) });

{
  const grassModel = grassLikeBlock('grass_block_top', 'grass_block_side', 'grass_block_side_overlay', 'dirt');
  const snowyGrass = cubeBottomTop('grass_block_snow', 'dirt', 'snow');
  registerBlock('grass_block', {
    props: [P.snowy], hardness: 0.6, sound: 'grass', tool: 'shovel', tint: 'grass', layer: Layer.CUTOUT_MIPPED, randomTicks: true,
    model: (s) => (s.get('snowy') ? { model: snowyGrass } : randRot(grassModel)),
  });
}
registerBlock('dirt', { hardness: 0.5, sound: 'gravel', tool: 'shovel', model: () => randRot(cubeAll('dirt')) });
registerBlock('coarse_dirt', { hardness: 0.5, sound: 'gravel', tool: 'shovel', model: one(cubeAll('coarse_dirt')) });
registerBlock('rooted_dirt', { hardness: 0.5, sound: 'rooted_dirt', tool: 'shovel', model: one(cubeAll('rooted_dirt')) });
registerBlock('mud', { hardness: 0.5, sound: 'mud', tool: 'shovel', collision: [bx(0, 0, 0, 16, 14, 16)], opaque: true, model: one(cubeAll('mud')) });
{
  const podzol = cubeBottomTop('podzol_side', 'dirt', 'podzol_top');
  const snowy = cubeBottomTop('grass_block_snow', 'dirt', 'snow');
  registerBlock('podzol', { props: [P.snowy], hardness: 0.5, sound: 'gravel', tool: 'shovel', model: (s) => ({ model: s.get('snowy') ? snowy : podzol }) });
  const myc = cubeBottomTop('mycelium_side', 'dirt', 'mycelium_top');
  registerBlock('mycelium', { props: [P.snowy], hardness: 0.6, sound: 'grass', tool: 'shovel', randomTicks: true, model: (s) => ({ model: s.get('snowy') ? snowy : myc }) });
}
{
  const farm = (wet: boolean): ModelDef => ({
    particle: 'dirt',
    elements: [box([0, 0, 0], [16, 15, 16], { down: 'dirt', up: wet ? 'farmland_moist' : 'farmland', north: 'dirt', south: 'dirt', west: 'dirt', east: 'dirt' })],
  });
  const dry = farm(false), wet = farm(true);
  registerBlock('farmland', {
    props: [P.moisture], hardness: 0.6, sound: 'gravel', tool: 'shovel', randomTicks: true,
    collision: [bx(0, 0, 0, 16, 15, 16)], opaque: false, faceOcclusion: 1,
    model: (s) => ({ model: (s.get('moisture') as number) === 7 ? wet : dry }),
  });
  const path: ModelDef = {
    particle: 'dirt',
    elements: [box([0, 0, 0], [16, 15, 16], { down: 'dirt', up: 'dirt_path_top', north: 'dirt_path_side', south: 'dirt_path_side', west: 'dirt_path_side', east: 'dirt_path_side' })],
  };
  registerBlock('dirt_path', { hardness: 0.65, sound: 'grass', tool: 'shovel', collision: [bx(0, 0, 0, 16, 15, 16)], opaque: false, faceOcclusion: 1, model: one(path) });
}

registerBlock('sand', { hardness: 0.5, sound: 'sand', tool: 'shovel', model: () => randRot(cubeAll('sand')) });
registerBlock('red_sand', { hardness: 0.5, sound: 'sand', tool: 'shovel', model: () => randRot(cubeAll('red_sand')) });
registerBlock('gravel', { hardness: 0.6, sound: 'gravel', tool: 'shovel', model: one(cubeAll('gravel')) });
registerBlock('clay', { hardness: 0.6, sound: 'gravel', tool: 'shovel', model: one(cubeAll('clay')) });
registerBlock('sandstone', { hardness: 0.8, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeBottomTop('sandstone', 'sandstone_bottom', 'sandstone_top')) });
registerBlock('cut_sandstone', { hardness: 0.8, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeBottomTop('cut_sandstone', 'sandstone_top', 'sandstone_top')) });
registerBlock('chiseled_sandstone', { hardness: 0.8, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeBottomTop('chiseled_sandstone', 'sandstone_top', 'sandstone_top')) });
registerBlock('smooth_sandstone', { hardness: 2, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll('sandstone_top')) });
registerBlock('red_sandstone', { hardness: 0.8, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeBottomTop('red_sandstone', 'red_sandstone_bottom', 'red_sandstone_top')) });
registerBlock('smooth_red_sandstone', { hardness: 2, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll('red_sandstone_top')) });

// Fluids
registerBlock('water', {
  props: [P.level], hardness: 100, collision: 'none', layer: Layer.TRANSLUCENT, fluid: 'water', replaceable: true, tint: 'water',
  item: false, opaque: false, outline: [], noDrop: true,
});
registerBlock('lava', {
  props: [P.level], hardness: 100, collision: 'none', layer: Layer.SOLID, fluid: 'lava', replaceable: true, light: 15,
  item: false, opaque: false, outline: [], noDrop: true, opacity: 1, randomTicks: true,
});

// Ores
function ore(name: string, tier: number, hardness = 3, sound = 'stone', light?: (s: StateView) => number, props?: BlockSettings['props']) {
  registerBlock(name, {
    props, hardness, resistance: 3, sound, tool: 'pickaxe', tier, requiresTool: true, light,
    model: props ? (s) => ({ model: cubeAll(name) }) : one(cubeAll(name)),
  });
}
ore('coal_ore', 0);
ore('deepslate_coal_ore', 0, 4.5, 'deepslate');
ore('iron_ore', 1);
ore('deepslate_iron_ore', 1, 4.5, 'deepslate');
ore('copper_ore', 1);
ore('deepslate_copper_ore', 1, 4.5, 'deepslate');
ore('gold_ore', 2);
ore('deepslate_gold_ore', 2, 4.5, 'deepslate');
ore('redstone_ore', 2, 3, 'stone', (s) => (s.get('lit') ? 9 : 0), [P.lit]);
ore('deepslate_redstone_ore', 2, 4.5, 'deepslate', (s) => (s.get('lit') ? 9 : 0), [P.lit]);
ore('lapis_ore', 1);
ore('deepslate_lapis_ore', 1, 4.5, 'deepslate');
ore('diamond_ore', 2);
ore('deepslate_diamond_ore', 2, 4.5, 'deepslate');
ore('emerald_ore', 2);
ore('deepslate_emerald_ore', 2, 4.5, 'deepslate');

const metal = (name: string, hardness: number, tier: number, sound = 'metal') =>
  registerBlock(name, { hardness, resistance: 6, sound, tool: 'pickaxe', tier, requiresTool: true, model: one(cubeAll(name)) });
metal('raw_iron_block', 5, 1, 'stone');
metal('raw_copper_block', 5, 1, 'stone');
metal('raw_gold_block', 5, 2, 'stone');
metal('iron_block', 5, 1);
metal('gold_block', 3, 2);
metal('diamond_block', 5, 2);
metal('emerald_block', 5, 2);
metal('copper_block', 3, 1, 'copper');
stoneLike('coal_block', 5, 6);
stoneLike('lapis_block', 3, 3);
registerBlock('redstone_block', { hardness: 5, resistance: 6, sound: 'metal', tool: 'pickaxe', requiresTool: true, model: one(cubeAll('redstone_block')) });

// -------------------------------------------------------------------------
// Wood

export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'] as const;

for (const w of WOOD_TYPES) {
  const sound = w === 'cherry' ? 'cherry_wood' : 'wood';
  const log = cubeColumn(`${w}_log`, `${w}_log_top`);
  const wood = cubeColumn(`${w}_log`, `${w}_log`);
  const slog = cubeColumn(`stripped_${w}_log`, `stripped_${w}_log_top`);
  const swood = cubeColumn(`stripped_${w}_log`, `stripped_${w}_log`);
  const common = { props: [P.axis], defaults: { axis: 'y' }, hardness: 2, sound, tool: 'axe' as const, flammable: true };
  registerBlock(`${w}_log`, { ...common, model: axisModel(log) });
  registerBlock(`${w}_wood`, { ...common, model: axisModel(wood) });
  registerBlock(`stripped_${w}_log`, { ...common, model: axisModel(slog) });
  registerBlock(`stripped_${w}_wood`, { ...common, model: axisModel(swood) });
  registerBlock(`${w}_planks`, { hardness: 2, resistance: 3, sound, tool: 'axe', flammable: true, model: one(cubeAll(`${w}_planks`)) });
}

const LEAF_TINT: Record<string, BlockSettings['tint']> = {
  oak: 'foliage', spruce: 'spruce', birch: 'birch', jungle: 'foliage', acacia: 'foliage', dark_oak: 'foliage', mangrove: 'foliage', cherry: 'none',
};
for (const w of WOOD_TYPES) {
  const tint = LEAF_TINT[w];
  const m = cubeAll(`${w}_leaves`, tint === 'none' ? undefined : 0);
  registerBlock(`${w}_leaves`, {
    props: [P.distance, P.persistent, P.waterlogged], defaults: { distance: 7 },
    hardness: 0.2, sound: w === 'cherry' ? 'cherry_leaves' : 'grass', tool: 'hoe', tint, layer: Layer.CUTOUT_MIPPED,
    opaque: false, isLeaves: true, viewBlocking: false, randomTicks: true, flammable: true, model: one(m),
  });
}
registerBlock('azalea_leaves', {
  props: [P.distance, P.persistent, P.waterlogged], defaults: { distance: 7 }, hardness: 0.2, sound: 'azalea_leaves', tool: 'hoe',
  layer: Layer.CUTOUT_MIPPED, opaque: false, isLeaves: true, viewBlocking: false, randomTicks: true, model: one(cubeAll('azalea_leaves')),
});

const SAPLING_BOX: Box[] = [bx(2, 0, 2, 14, 12, 14)];
for (const w of WOOD_TYPES) {
  if (w === 'mangrove') continue;
  registerBlock(`${w}_sapling`, {
    props: [P.stage], hardness: 0, sound: w === 'cherry' ? 'cherry_sapling' : 'grass', collision: 'none', outline: SAPLING_BOX, layer: Layer.CUTOUT,
    replaceable: false, randomTicks: true, model: one(cross(`${w}_sapling`)), opaque: false,
  });
}

// -------------------------------------------------------------------------
// Plants

function plant(name: string, s: BlockSettings & { tex?: string; tintIndex?: boolean; outline?: Box[] }) {
  const tex = s.tex ?? name;
  return registerBlock(name, {
    hardness: 0, sound: 'grass', collision: 'none', layer: Layer.CUTOUT, opaque: false,
    model: one(cross(tex, s.tintIndex ? 0 : undefined)),
    ...s,
  });
}

plant('short_grass', { tint: 'grass', tintIndex: true, replaceable: true, offset: 'xyz', outline: [bx(2, 0, 2, 14, 13, 14)] });
plant('fern', { tint: 'grass', tintIndex: true, replaceable: true, offset: 'xyz', outline: [bx(2, 0, 2, 14, 13, 14)] });
plant('dead_bush', { replaceable: true, outline: [bx(2, 0, 2, 14, 13, 14)] });
const FLOWER_BOX: Box[] = [bx(5, 0, 5, 11, 10, 11)];
for (const f of ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley']) {
  plant(f, { offset: 'xz', outline: FLOWER_BOX });
}
plant('brown_mushroom', { outline: [bx(5, 0, 5, 11, 6, 11)], light: 1, randomTicks: true });
plant('red_mushroom', { outline: [bx(5, 0, 5, 11, 6, 11)], randomTicks: true });

function doublePlant(name: string, tint: BlockSettings['tint'], replaceable: boolean) {
  const tintIdx = tint !== 'none' ? 0 : undefined;
  const top = cross(`${name}_top`, tintIdx), bottom = cross(`${name}_bottom`, tintIdx);
  registerBlock(name, {
    props: [P.half], defaults: { half: 'lower' }, hardness: 0, sound: 'grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, tint,
    replaceable, offset: 'xz', outline: [bx(2, 0, 2, 14, 16, 14)],
    model: (s) => ({ model: s.get('half') === 'upper' ? top : bottom }),
  });
}
doublePlant('tall_grass', 'grass', true);
doublePlant('large_fern', 'grass', true);
for (const f of ['lilac', 'rose_bush', 'peony']) doublePlant(f, 'none', false);
{
  // sunflower: stalk cross + front/back head
  const bottom = cross('sunflower_bottom');
  const top: ModelDef = {
    ao: false,
    particle: 'sunflower_front',
    elements: [
      ...cross('sunflower_top').elements,
      {
        from: [9.6, -1, 1], to: [9.6, 15, 15], rot: { origin: [8, 8, 8], axis: 'z', angle: 22.5, rescale: true }, shade: false,
        faces: { west: { tex: 'sunflower_back', uv: [0, 0, 16, 16] }, east: { tex: 'sunflower_front', uv: [0, 0, 16, 16] } },
      },
    ],
  };
  registerBlock('sunflower', {
    props: [P.half], defaults: { half: 'lower' }, hardness: 0, sound: 'grass', collision: 'none', layer: Layer.CUTOUT, opaque: false,
    offset: 'xz', outline: [bx(2, 0, 2, 14, 16, 14)],
    model: (s) => ({ model: s.get('half') === 'upper' ? top : bottom }),
  });
}

registerBlock('sugar_cane', {
  props: [P.age15], hardness: 0, sound: 'grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, tint: 'grass', randomTicks: true,
  outline: [bx(2, 0, 2, 14, 16, 14)], model: one(cross('sugar_cane', 0)),
});
{
  const cactus: ModelDef = {
    particle: 'cactus_side',
    elements: [
      box([0, 0, 0], [16, 16, 16], { down: 'cactus_bottom', up: 'cactus_top' }),
      { from: [0, 0, 1], to: [16, 16, 15], faces: { north: { tex: 'cactus_side' }, south: { tex: 'cactus_side' } } },
      { from: [1, 0, 0], to: [15, 16, 16], faces: { west: { tex: 'cactus_side' }, east: { tex: 'cactus_side' } } },
    ],
  };
  registerBlock('cactus', {
    props: [P.age15], hardness: 0.4, sound: 'wool', collision: [bx(1, 0, 1, 15, 15, 15)], outline: [bx(1, 0, 1, 15, 16, 15)],
    layer: Layer.CUTOUT, opaque: false, randomTicks: true, aoCaster: false, model: one(cactus),
  });
}
registerBlock('pumpkin', { hardness: 1, sound: 'wood', tool: 'axe', model: one(cubeColumn('pumpkin_side', 'pumpkin_top')) });
registerBlock('carved_pumpkin', {
  props: [P.facingH], hardness: 1, sound: 'wood', tool: 'axe',
  model: (s) => ({ model: orientable('carved_pumpkin', 'pumpkin_side', 'pumpkin_top'), y: HOR_ROT[s.get('facing') as string] }),
});
registerBlock('jack_o_lantern', {
  props: [P.facingH], hardness: 1, sound: 'wood', tool: 'axe', light: 15,
  model: (s) => ({ model: orientable('jack_o_lantern', 'pumpkin_side', 'pumpkin_top'), y: HOR_ROT[s.get('facing') as string] }),
});
registerBlock('melon', { hardness: 1, sound: 'wood', tool: 'axe', model: one(cubeColumn('melon_side', 'melon_top')) });
registerBlock('lily_pad', {
  hardness: 0, sound: 'lily_pad', collision: [bx(1, 0, 1, 15, 1.5, 15)], layer: Layer.CUTOUT, opaque: false, tint: 'lily',
  model: () => randRot(flatPlane('lily_pad', 0.25, 0)),
});
{
  const dirs = ['north', 'south', 'east', 'west', 'up'] as const;
  registerBlock('vine', {
    props: [P.up, P.north, P.south, P.east, P.west], defaults: { south: true },
    hardness: 0.2, sound: 'vine', collision: 'none', layer: Layer.CUTOUT, opaque: false, tint: 'foliage', replaceable: true, climbable: true,
    randomTicks: true,
    outline: (s) => {
      const out: Box[] = [];
      if (s.get('up')) out.push(bx(0, 15, 0, 16, 16, 16));
      if (s.get('north')) out.push(bx(0, 0, 0, 16, 16, 1));
      if (s.get('south')) out.push(bx(0, 0, 15, 16, 16, 16));
      if (s.get('west')) out.push(bx(0, 0, 0, 1, 16, 16));
      if (s.get('east')) out.push(bx(15, 0, 0, 16, 16, 16));
      return out.length ? out : 'full';
    },
    model: (s) => {
      const els: ElementDef[] = [];
      for (const d of dirs) if (s.get(d)) els.push(facePlane('vine', d, 0));
      return { model: { ao: false, particle: 'vine', elements: els } };
    },
  });
}
registerBlock('seagrass', {
  hardness: 0, sound: 'wet_grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, replaceable: true, fluid: 'water',
  outline: [bx(2, 0, 2, 14, 12, 14)], model: one(crop('seagrass')),
});
registerBlock('tall_seagrass', {
  props: [P.half], defaults: { half: 'lower' }, hardness: 0, sound: 'wet_grass', collision: 'none', layer: Layer.CUTOUT, opaque: false,
  replaceable: true, fluid: 'water', outline: [bx(2, 0, 2, 14, 16, 14)],
  model: (s) => ({ model: crop(s.get('half') === 'upper' ? 'tall_seagrass_top' : 'tall_seagrass_bottom') }),
});
registerBlock('kelp', {
  props: [P.age25], hardness: 0, sound: 'wet_grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, fluid: 'water', randomTicks: true,
  outline: [bx(0, 0, 0, 16, 9, 16)], model: one(cross('kelp')),
});
registerBlock('kelp_plant', {
  hardness: 0, sound: 'wet_grass', collision: 'none', layer: Layer.CUTOUT, opaque: false, fluid: 'water',
  outline: 'full', model: one(cross('kelp_plant')),
});
{
  const stages = [0, 1, 2, 3].map((a) => cross(`sweet_berry_bush_stage${a}`));
  registerBlock('sweet_berry_bush', {
    props: [P.age3], hardness: 0, sound: 'sweet_berry_bush', collision: 'none', layer: Layer.CUTOUT, opaque: false, randomTicks: true,
    outline: [bx(3, 0, 3, 13, 16, 13)], model: (s) => ({ model: stages[s.get('age') as number] }),
  });
}
{
  const stages = [0, 1, 2, 3, 4, 5, 6, 7].map((a) => crop(`wheat_stage${a}`));
  registerBlock('wheat', {
    props: [P.age7], hardness: 0, sound: 'crop', collision: 'none', layer: Layer.CUTOUT, opaque: false, randomTicks: true,
    outline: (s) => [bx(0, 0, 0, 16, 2 + (s.get('age') as number) * 2, 16)], model: (s) => ({ model: stages[s.get('age') as number] }),
  });
}

// -------------------------------------------------------------------------
// Snow / ice

{
  const layerModels: ModelDef[] = [];
  for (let l = 1; l <= 8; l++) {
    layerModels[l] = l === 8 ? cubeAll('snow') : { particle: 'snow', elements: [box([0, 0, 0], [16, l * 2, 16], 'snow')] };
  }
  registerBlock('snow', {
    props: [P.layers], hardness: 0.1, sound: 'snow', tool: 'shovel', requiresTool: true, randomTicks: true,
    collision: (s) => {
      const l = s.get('layers') as number;
      return l === 1 ? 'none' : [bx(0, 0, 0, 16, (l - 1) * 2, 16)];
    },
    outline: (s) => [bx(0, 0, 0, 16, (s.get('layers') as number) * 2, 16)],
    opaque: (s) => s.get('layers') === 8,
    faceOcclusion: (s) => (s.get('layers') === 8 ? 63 : 1),
    aoCaster: false,
    replaceable: (s) => s.get('layers') === 1,
    model: (s) => ({ model: layerModels[s.get('layers') as number] }),
  });
}
registerBlock('snow_block', { hardness: 0.2, sound: 'snow', tool: 'shovel', requiresTool: true, model: one(cubeAll('snow')) });
registerBlock('powder_snow', {
  hardness: 0.25, sound: 'powder_snow', collision: 'none', opaque: false, cullSame: true, layer: Layer.SOLID, aoCaster: false, opacity: 1,
  model: one(cubeAll('powder_snow')),
});
registerBlock('ice', {
  hardness: 0.5, sound: 'glass', tool: 'pickaxe', friction: 0.98, layer: Layer.TRANSLUCENT, opaque: false, cullSame: true, opacity: 1,
  randomTicks: true, model: one(cubeAll('ice')),
});
// (Frost Walker) vanilla FrostedIceBlock: ice a Frost Walker boot freezes over water, ageing 0..3 as it melts back
// (game/frostWalker.ts); no item, and nothing drops
registerBlock('frosted_ice', {
  props: [P.age3], hardness: 0.5, sound: 'glass', friction: 0.98, layer: Layer.TRANSLUCENT, opaque: false, cullSame: true, opacity: 1,
  randomTicks: true, item: false, noDrop: true, model: (s) => ({ model: cubeAll(`frosted_ice_${s.get('age') as number}`) }),
});
registerBlock('packed_ice', { hardness: 0.5, sound: 'glass', tool: 'pickaxe', friction: 0.98, model: one(cubeAll('packed_ice')) });
registerBlock('blue_ice', { hardness: 2.8, sound: 'glass', tool: 'pickaxe', friction: 0.989, model: one(cubeAll('blue_ice')) });

// -------------------------------------------------------------------------
// Building / utility

registerBlock('glass', {
  hardness: 0.3, sound: 'glass', layer: Layer.CUTOUT, opaque: false, cullSame: true, aoCaster: false, viewBlocking: false, opacity: 0,
  model: one(cubeAll('glass')), noDrop: true,
});
// torches, and (vanilla SOUL_TORCH: light 10) their soul fire kind
for (const [t, light] of [['torch', 14], ['soul_torch', 10]] as [string, number][]) {
  const wallName = t === 'torch' ? 'wall_torch' : 'soul_wall_torch';
  const torch = torchModel(t);
  const wall = wallTorchModel(t);
  registerBlock(t, {
    hardness: 0, sound: 'wood', collision: 'none', layer: Layer.CUTOUT, opaque: false, light,
    outline: [bx(6, 0, 6, 10, 10, 10)], model: one(torch), item: t,
  });
  const WALL_Y: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };
  registerBlock(wallName, {
    props: [P.facingH], hardness: 0, sound: 'wood', collision: 'none', layer: Layer.CUTOUT, opaque: false, light, item: t,
    outline: (s) => {
      switch (s.get('facing')) {
        case 'north': return [bx(5.5, 3, 11, 10.5, 13, 16)];
        case 'south': return [bx(5.5, 3, 0, 10.5, 13, 5)];
        case 'west': return [bx(11, 3, 5.5, 16, 13, 10.5)];
        default: return [bx(0, 3, 5.5, 5, 13, 10.5)];
      }
    },
    model: (s) => ({ model: wall, y: WALL_Y[s.get('facing') as string] }),
  });
}
registerBlock('crafting_table', {
  hardness: 2.5, sound: 'wood', tool: 'axe',
  model: one(cube({ down: 'oak_planks', up: 'crafting_table_top', north: 'crafting_table_front', south: 'crafting_table_side', west: 'crafting_table_side', east: 'crafting_table_front' })),
});
registerBlock('furnace', {
  props: [P.facingH, P.lit], hardness: 3.5, sound: 'stone', tool: 'pickaxe', requiresTool: true, light: (s) => (s.get('lit') ? 13 : 0),
  model: (s) => ({ model: orientable(s.get('lit') ? 'furnace_front_on' : 'furnace_front', 'furnace_side', 'furnace_top'), y: HOR_ROT[s.get('facing') as string] }),
});
registerBlock('bookshelf', { hardness: 1.5, sound: 'wood', tool: 'axe', model: one(cubeColumn('bookshelf', 'oak_planks')) });
// (jukebox) vanilla Blocks.JUKEBOX: strength 2 / 6, wood; block/jukebox.json is cube_top (the side below as well),
// the same with a disc in it or not (what it does: game/jukebox.ts)
registerBlock('jukebox', {
  props: [{ name: 'has_record', values: [false, true] }], hardness: 2, resistance: 6, sound: 'wood', tool: 'axe',
  model: one(cubeBottomTop('jukebox_side', 'jukebox_side', 'jukebox_top')),
});
registerBlock('glowstone', { hardness: 0.3, sound: 'glass', light: 15, model: one(cubeAll('glowstone')) });
registerBlock('sea_lantern', { hardness: 0.3, sound: 'glass', light: 15, model: one(cubeAll('sea_lantern')) });
registerBlock('moss_block', { hardness: 0.1, sound: 'moss', tool: 'hoe', model: one(cubeAll('moss_block')) });
registerBlock('sponge', { hardness: 0.6, sound: 'sponge', tool: 'hoe', model: one(cubeAll('sponge')) });
registerBlock('hay_block', { props: [P.axis], defaults: { axis: 'y' }, hardness: 0.5, sound: 'grass', tool: 'hoe', model: axisModel(cubeColumn('hay_block_side', 'hay_block_top')) });
registerBlock('tnt', { hardness: 0, sound: 'grass', model: one(cubeBottomTop('tnt_side', 'tnt_bottom', 'tnt_top')) });
// vanilla Blocks.DRIED_KELP_BLOCK: strength 0.5 (2.5 against blasts), grass sounds, a hoe's block; block/dried_kelp_block is
// cube_bottom_top
registerBlock('dried_kelp_block', { hardness: 0.5, resistance: 2.5, sound: 'grass', tool: 'hoe', model: one(cubeBottomTop('dried_kelp_side', 'dried_kelp_bottom', 'dried_kelp_top')) });
registerBlock('chest', {
  props: [P.facingH, P.waterlogged], hardness: 2.5, sound: 'wood', tool: 'axe', opaque: false, aoCaster: false,
  collision: [bx(1, 0, 1, 15, 14, 15)],
  model: (s) => ({
    model: {
      particle: 'oak_planks',
      elements: [
        box([1, 0, 1], [15, 10, 15], { down: 'chest_bottom', up: 'chest_top', north: 'chest_front', south: 'chest_side', west: 'chest_side', east: 'chest_side' }, { noCull: true }),
        box([1, 10, 1], [15, 14, 15], { down: 'chest_top', up: 'chest_top', north: 'chest_lid_front', south: 'chest_lid_side', west: 'chest_lid_side', east: 'chest_lid_side' }, { noCull: true }),
        box([7, 7, 0], [9, 11, 1], 'chest_latch', { noCull: true }),
      ],
    },
    y: HOR_ROT[s.get('facing') as string],
  }),
});
{
  const ladder: ModelDef = {
    ao: false, particle: 'ladder',
    elements: [{ from: [0, 0, 15.2], to: [16, 16, 15.2], shade: false, faces: { north: { tex: 'ladder', uv: [0, 0, 16, 16] }, south: { tex: 'ladder', uv: [0, 0, 16, 16] } } }],
  };
  registerBlock('ladder', {
    props: [P.facingH, P.waterlogged], hardness: 0.4, sound: 'ladder', tool: 'axe', layer: Layer.CUTOUT, opaque: false, climbable: true,
    collision: (s) => {
      switch (s.get('facing')) {
        case 'north': return [bx(0, 0, 13, 16, 16, 16)];
        case 'south': return [bx(0, 0, 0, 16, 16, 3)];
        case 'west': return [bx(13, 0, 0, 16, 16, 16)];
        default: return [bx(0, 0, 0, 3, 16, 16)];
      }
    },
    model: (s) => ({ model: ladder, y: HOR_ROT[s.get('facing') as string] }),
  });
}

export const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;
for (const c of DYE_COLORS) {
  registerBlock(`${c}_wool`, { hardness: 0.8, sound: 'wool', tool: 'shears', flammable: true, model: one(cubeAll(`${c}_wool`)) });
}
registerBlock('terracotta', { hardness: 1.25, resistance: 4.2, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll('terracotta')) });
for (const c of DYE_COLORS) {
  registerBlock(`${c}_terracotta`, { hardness: 1.25, resistance: 4.2, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(`${c}_terracotta`)) });
}
for (const c of DYE_COLORS) {
  registerBlock(`${c}_concrete`, { hardness: 1.8, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(`${c}_concrete`)) });
}

// Slabs & stairs for common materials
const SLAB_MATERIALS: [string, string, string, string, string, number, number?][] = [
  // name, bottom, top, side, sound, hardness(, blast resistance when not 6)
  ['oak', 'oak_planks', 'oak_planks', 'oak_planks', 'wood', 2],
  ['spruce', 'spruce_planks', 'spruce_planks', 'spruce_planks', 'wood', 2],
  ['birch', 'birch_planks', 'birch_planks', 'birch_planks', 'wood', 2],
  ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'stone', 2],
  ['stone', 'stone', 'stone', 'stone', 'stone', 2],
  ['stone_brick', 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone', 1.5],
  ['sandstone', 'sandstone_top', 'sandstone_top', 'sandstone', 'stone', 0.8],
  ['brick', 'bricks', 'bricks', 'bricks', 'stone', 2],
  ['jungle', 'jungle_planks', 'jungle_planks', 'jungle_planks', 'wood', 2],
  ['acacia', 'acacia_planks', 'acacia_planks', 'acacia_planks', 'wood', 2],
  ['dark_oak', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', 'wood', 2],
  ['mangrove', 'mangrove_planks', 'mangrove_planks', 'mangrove_planks', 'wood', 2],
  ['cherry', 'cherry_planks', 'cherry_planks', 'cherry_planks', 'wood', 2],
  ['nether_brick', 'nether_bricks', 'nether_bricks', 'nether_bricks', 'nether_bricks', 2],
  ['blackstone', 'blackstone_top', 'blackstone_top', 'blackstone', 'stone', 1.5],
  ['polished_blackstone', 'polished_blackstone', 'polished_blackstone', 'polished_blackstone', 'stone', 2],
  ['polished_blackstone_brick', 'polished_blackstone_bricks', 'polished_blackstone_bricks', 'polished_blackstone_bricks', 'stone', 2],
  ['red_nether_brick', 'red_nether_bricks', 'red_nether_bricks', 'red_nether_bricks', 'nether_bricks', 2],
  ['crimson', 'crimson_planks', 'crimson_planks', 'crimson_planks', 'nether_wood', 2],
  ['warped', 'warped_planks', 'warped_planks', 'warped_planks', 'nether_wood', 2],
  ['mossy_cobblestone', 'mossy_cobblestone', 'mossy_cobblestone', 'mossy_cobblestone', 'stone', 2],
  ['mossy_stone_brick', 'mossy_stone_bricks', 'mossy_stone_bricks', 'mossy_stone_bricks', 'stone', 1.5],
  ['granite', 'granite', 'granite', 'granite', 'stone', 1.5],
  ['polished_granite', 'polished_granite', 'polished_granite', 'polished_granite', 'stone', 1.5],
  ['diorite', 'diorite', 'diorite', 'diorite', 'stone', 1.5],
  ['polished_diorite', 'polished_diorite', 'polished_diorite', 'polished_diorite', 'stone', 1.5],
  ['andesite', 'andesite', 'andesite', 'andesite', 'stone', 1.5],
  ['polished_andesite', 'polished_andesite', 'polished_andesite', 'polished_andesite', 'stone', 1.5],
  ['cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', 'deepslate', 3.5],
  ['polished_deepslate', 'polished_deepslate', 'polished_deepslate', 'polished_deepslate', 'polished_deepslate', 3.5],
  ['deepslate_brick', 'deepslate_bricks', 'deepslate_bricks', 'deepslate_bricks', 'deepslate_bricks', 3.5],
  ['deepslate_tile', 'deepslate_tiles', 'deepslate_tiles', 'deepslate_tiles', 'deepslate_tiles', 3.5],
  ['red_sandstone', 'red_sandstone_bottom', 'red_sandstone_top', 'red_sandstone', 'stone', 0.8],
  ['smooth_sandstone', 'sandstone_top', 'sandstone_top', 'sandstone_top', 'stone', 2],
  ['smooth_red_sandstone', 'red_sandstone_top', 'red_sandstone_top', 'red_sandstone_top', 'stone', 2],
  ['smooth_stone', 'smooth_stone', 'smooth_stone', 'smooth_stone', 'stone', 2],
  ['cut_sandstone', 'sandstone_top', 'sandstone_top', 'cut_sandstone', 'stone', 0.8],
  ['end_stone_brick', 'end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', 'stone', 3, 9],
  ['purpur', 'purpur_block', 'purpur_block', 'purpur_block', 'stone', 1.5],
  // (Stage 5: ocean)
  ['prismarine', 'prismarine', 'prismarine', 'prismarine', 'stone', 1.5],
  ['prismarine_brick', 'prismarine_bricks', 'prismarine_bricks', 'prismarine_bricks', 'stone', 1.5],
  ['dark_prismarine', 'dark_prismarine', 'dark_prismarine', 'dark_prismarine', 'stone', 1.5],
];
/** materials with a slab but no stairs in vanilla */
const SLAB_ONLY = new Set(['smooth_stone', 'cut_sandstone']);
for (const [name, bottom, top, side, sound, hardness, resistance = 6] of SLAB_MATERIALS) {
  const tool = sound === 'wood' || sound === 'nether_wood' ? 'axe' : 'pickaxe';
  const bm = slabBottom(bottom, top, side), tm = slabTop(bottom, top, side), dm = cubeBottomTop(side, bottom, top);
  registerBlock(`${name}_slab`, {
    props: [P.slabType, P.waterlogged], defaults: { type: 'bottom' }, hardness, resistance, sound, tool, requiresTool: tool === 'pickaxe', flammable: sound === 'wood',
    collision: (s) => (s.get('type') === 'double' ? 'full' : s.get('type') === 'top' ? [bx(0, 8, 0, 16, 16, 16)] : [bx(0, 0, 0, 16, 8, 16)]),
    opaque: (s) => s.get('type') === 'double',
    faceOcclusion: (s) => (s.get('type') === 'double' ? 63 : s.get('type') === 'top' ? 2 : 1),
    aoCaster: false,
    model: (s) => ({ model: s.get('type') === 'double' ? dm : s.get('type') === 'top' ? tm : bm }),
  });
  if (SLAB_ONLY.has(name)) continue;
  const stairName = `${name}_stairs`;
  const straight = stairsModel(bottom, top, side, 'straight');
  const inner = stairsModel(bottom, top, side, 'inner');
  const outer = stairsModel(bottom, top, side, 'outer');
  registerBlock(stairName, {
    props: [P.facingH, P.halfTB, P.stairShape, P.waterlogged], defaults: { facing: 'north', half: 'bottom' },
    hardness, resistance, sound, tool, requiresTool: tool === 'pickaxe', aoCaster: false,
    opaque: false,
    faceOcclusion: (s) => {
      const f = s.get('facing') as string;
      const back = { north: 1 << 2, south: 1 << 3, west: 1 << 4, east: 1 << 5 }[f] ?? 0;
      return (s.get('half') === 'bottom' ? 1 : 2) | (s.get('shape') === 'straight' ? back : 0);
    },
    collision: (s) => stairBoxes(s),
    model: (s) => stairVariant(s, straight, inner, outer),
  });
}

/** vanilla StairBlock's shapes (exported for the tuff and copper stairs, blocksTuff.ts) */
export function stairBoxes(s: StateView): Box[] {
  const top = s.get('half') === 'top';
  const base: Box = top ? bx(0, 8, 0, 16, 16, 16) : bx(0, 0, 0, 16, 8, 16);
  const y0 = top ? 0 : 8, y1 = top ? 8 : 16;
  const f = s.get('facing') as string;
  const shape = s.get('shape') as string;
  // quadrant boxes: facing = direction the stair ascends toward (back side)
  const q = (x0: number, z0: number, x1: number, z1: number): Box => bx(x0, y0, z0, x1, y1, z1);
  const half: Record<string, Box> = { north: q(0, 0, 16, 8), south: q(0, 8, 16, 16), west: q(0, 0, 8, 16), east: q(8, 0, 16, 16) };
  const quad = (a: string, b: string): Box => {
    const xs = a === 'west' || b === 'west' ? [0, 8] : [8, 16];
    const zs = a === 'north' || b === 'north' ? [0, 8] : [8, 16];
    return q(xs[0], zs[0], xs[1], zs[1]);
  };
  const left: Record<string, string> = { north: 'west', west: 'south', south: 'east', east: 'north' };
  const right: Record<string, string> = { north: 'east', east: 'south', south: 'west', west: 'north' };
  const back: Record<string, string> = { north: 'south', south: 'north', west: 'east', east: 'west' };
  if (shape === 'straight') return [base, half[f]];
  if (shape === 'outer_left') return [base, quad(f, left[f])];
  if (shape === 'outer_right') return [base, quad(f, right[f])];
  if (shape === 'inner_left') return [base, half[f], quad(back[f], left[f])];
  return [base, half[f], quad(back[f], right[f])];
}

export function stairVariant(s: StateView, straight: ModelDef, inner: ModelDef, outer: ModelDef): ModelChoice {
  // vanilla stairs blockstate rotations (model faces east by default)
  const facing = s.get('facing') as string;
  const half = s.get('half') as string;
  const shape = s.get('shape') as string;
  const baseY: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };
  let y = baseY[facing];
  let model = straight;
  if (shape.startsWith('inner')) model = inner;
  else if (shape.startsWith('outer')) model = outer;
  if (shape.endsWith('left')) y = (y + 270) % 360;
  if (half === 'top') {
    if (shape !== 'straight') y = (y + 90) % 360;
    return { model, x: 180, y, uvlock: true };
  }
  return { model, y, uvlock: true };
}

// Cave-ish decorative
registerBlock('cobweb', {
  hardness: 4, sound: 'cobweb', tool: 'sword', collision: 'none', layer: Layer.CUTOUT, opaque: false, opacity: 1, model: one(cross('cobweb')),
});
registerBlock('spawner', { hardness: 5, sound: 'metal', tool: 'pickaxe', requiresTool: true, layer: Layer.CUTOUT, opaque: false, aoCaster: true, model: one(cubeAll('spawner')) });
registerBlock('magma_block', { hardness: 0.5, sound: 'stone', tool: 'pickaxe', requiresTool: true, light: 3, model: one(cubeAll('magma')) });

registerExtraBlocks();
registerEnchantingBlocks();
registerRedstoneBlocks();
registerRedstoneComponents();
registerArchaeologyBlocks();
registerVillageBlocks();
registerEndBlocks();
registerBannerBlocks();
registerInfestedBlocks();
registerOuterEndBlocks();
// (Stage 5: ocean)
registerOceanBlocks();
// (fossils)
registerFossilBlocks();
// (M9: frogs) frogspawn and the froglights
registerFrogBlocks();
// (the deep dark)
registerDeepDarkBlocks();
// (trial chambers) the tuff and copper families, the lightning rod, and the trial chambers' own blocks
registerTuffBlocks();
registerCopperBlocks();
registerTrialChamberBlocks();
// (bastions) polished basalt, the block of netherite, the lodestone
registerBastionBlocks();
// (signs) standing, wall, hanging and wall hanging signs for every wood
registerSignBlocks();

finalizeBlocks();

export function bakeAllModelChoices(): void {}
export type { Block };
export const FACING_H = enumProp('facing', ['north', 'south', 'west', 'east']);
