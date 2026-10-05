// The blocks villages are built around: the bell, the job site blocks villagers take a profession from (vanilla
// PoiTypes: blast furnace, smoker, cartography table, brewing stand, composter, barrel, fletching table, cauldrons,
// lectern, stonecutter, loom, smithing table) and the village's furniture (flower pots and their plants, the
// campfire). Models mirror vanilla's block model JSONs and blockstate files; shapes are vanilla's VoxelShapes.
// What they do is in game/villageBlocks.

import { registerBlock, P, Box, enumProp, intProp, boolProp, StateView, Layer, BLOCK_BY_NAME } from './block';
import { cube, cubeBottomTop, orientable, type ModelDef, type FaceDef, type UV4, type ElementDef, type Variant } from './models';
import type { DirName } from './dir';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv?: UV4, cull?: DirName, rot?: 0 | 90 | 180 | 270): FaceDef {
  return { tex, uv, cull, rot };
}

/** blockstate "y" for a model drawn facing north */
const HOR_ROT: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

/** a box in pixels turned about the block's middle to a horizontal facing (drawn facing north) */
export function turn(b: Box, facing: string): Box {
  const [x0, y0, z0, x1, y1, z1] = b;
  switch (facing) {
    case 'east': return [1 - z1, y0, x0, 1 - z0, y1, x1];
    case 'south': return [1 - x1, y0, 1 - z1, 1 - x0, y1, 1 - z0];
    case 'west': return [z0, y0, 1 - x1, z1, y1, 1 - x0];
    default: return b;
  }
}

// ---------------------------------------------------------------------------
// Bell (vanilla BellBlock; block/bell_floor, bell_ceiling, bell_wall, bell_between_walls: the stand, and the bell
// itself drawn by BellRenderer)

/** vanilla BellAttachType */
export const BELL_ATTACHMENT = enumProp('attachment', ['floor', 'ceiling', 'single_wall', 'double_wall']);

/** vanilla BellBlock.BELL_SHAPE: the rim and the body */
const BELL_SHAPE: Box[] = [bx(4, 4, 4, 12, 6, 12), bx(5, 6, 5, 11, 13, 11)];

/** vanilla BellBlock.getVoxelShape */
function bellShape(facing: string, attachment: string): Box[] {
  const ns = facing === 'north' || facing === 'south';
  switch (attachment) {
    case 'floor': return [ns ? bx(0, 0, 4, 16, 16, 12) : bx(4, 0, 0, 12, 16, 16)];
    case 'ceiling': return [...BELL_SHAPE, bx(7, 13, 7, 9, 16, 9)];
    case 'double_wall': return [...BELL_SHAPE, ns ? bx(7, 13, 0, 9, 15, 16) : bx(0, 13, 7, 16, 15, 9)];
    default: return [...BELL_SHAPE, turn(bx(7, 13, 0, 9, 15, 13), facing)];
  }
}

/** a dark oak beam (2x2 across) from `from` to `to`, its ends shown unless they meet a wall */
function beam(from: [number, number, number], to: [number, number, number], ends: Partial<Record<DirName, DirName | null>>): ElementDef {
  const B = 'dark_oak_planks';
  const faces: Partial<Record<DirName, FaceDef>> = {};
  for (const d of ['down', 'up', 'north', 'south', 'west', 'east'] as DirName[]) {
    if (d in ends) {
      const cull = ends[d];
      if (cull !== undefined) faces[d] = f(B, undefined, cull ?? undefined);
    } else faces[d] = f(B);
  }
  return { from, to, faces };
}

function bellModels(): Record<string, ModelDef> {
  const S = 'stone';
  const post = (x0: number, side: DirName): ElementDef => ({
    from: [x0, 0, 6], to: [x0 + 2, 16, 10],
    faces: {
      down: f(S, [x0, 6, x0 + 2, 10], 'down'), up: f(S, [x0, 6, x0 + 2, 10], 'up'),
      north: f(S, [14 - x0, 0, 16 - x0, 16]), south: f(S, [x0, 0, x0 + 2, 16]),
      west: f(S, [6, 0, 10, 16], side === 'west' ? 'west' : undefined), east: f(S, [6, 0, 10, 16], side === 'east' ? 'east' : undefined),
    },
  });
  return {
    // two stone posts at the sides, the beam across between them
    floor: {
      particle: 'bell_bottom',
      elements: [post(0, 'west'), post(14, 'east'), beam([2, 13, 7], [14, 15, 9], { west: undefined, east: undefined })],
    },
    // a stub hanging from the block above
    ceiling: { particle: 'bell_bottom', elements: [beam([7, 13, 7], [9, 16, 9], { up: 'up' })] },
    // out from the wall it hangs on (north)
    single_wall: { particle: 'bell_bottom', elements: [beam([7, 13, 0], [9, 15, 13], { north: 'north', south: null })] },
    // right across, wall to wall
    double_wall: { particle: 'bell_bottom', elements: [beam([7, 13, 0], [9, 15, 16], { north: 'north', south: 'south' })] },
  };
}

// ---------------------------------------------------------------------------
// Barrel (vanilla BarrelBlock; block/barrel and barrel_open, cube_bottom_top turned to face where it opens)

/** blockstate rotations of a model whose top is its front */
const FACE_ROT: Record<string, [number, number]> = { up: [0, 0], down: [180, 0], north: [90, 0], south: [90, 180], west: [90, 270], east: [90, 90] };

function facingModel(m: ModelDef, s: StateView): Variant {
  const [x, y] = FACE_ROT[s.get<string>('facing')];
  return { model: m, x, y };
}

// ---------------------------------------------------------------------------
// Composter (vanilla ComposterBlock; block/composter, and composter_contents1-7 / composter_contents_ready over it)

export const COMPOSTER_LEVEL = intProp('level', 0, 8);

/** the top of what's in it, in pixels: level 0 is the floor (vanilla ComposterBlock.SHAPES; level 8 is level 7's) */
export const composterFloor = (level: number): number => Math.max(2, 1 + 2 * Math.min(level, 7));

function composterModels(): { base: ModelDef; contents: ModelDef[] } {
  const side = 'composter_side', top = 'composter_top', inside = 'composter_bottom';
  // (the inside faces vanish under a block on top, as vanilla's cull them with "up")
  const base: ModelDef = {
    particle: side,
    elements: [
      { from: [0, 0, 0], to: [16, 2, 16], faces: { up: f(inside, undefined, 'up'), down: f('composter_bottom', undefined, 'down') } },
      { from: [0, 0, 0], to: [2, 16, 16], faces: { up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'south'), west: f(side, undefined, 'west'), east: f(side, undefined, 'up') } },
      { from: [14, 0, 0], to: [16, 16, 16], faces: { up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'south'), west: f(side, undefined, 'up'), east: f(side, undefined, 'east') } },
      { from: [2, 0, 0], to: [14, 16, 2], faces: { up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'up') } },
      { from: [2, 0, 14], to: [14, 16, 16], faces: { up: f(top, undefined, 'up'), north: f(side, undefined, 'up'), south: f(side, undefined, 'south') } },
    ],
  };
  const contents: ModelDef[] = [];
  for (let i = 1; i <= 8; i++) {
    const tex = i === 8 ? 'composter_ready' : 'composter_compost';
    contents[i] = { particle: side, elements: [{ from: [2, 0, 2], to: [14, composterFloor(i), 14], faces: { up: f(tex, undefined, 'up') } }] };
  }
  return { base, contents };
}

/** vanilla ComposterBlock.SHAPES: the whole block less the space above what's in it */
function composterShape(level: number): Box[] {
  const h = composterFloor(level);
  return [bx(0, 0, 0, 16, h, 16), bx(0, h, 0, 2, 16, 16), bx(14, h, 0, 16, 16, 16), bx(2, h, 0, 14, 16, 2), bx(2, h, 14, 14, 16, 16)];
}

// ---------------------------------------------------------------------------
// Cauldrons (vanilla AbstractCauldronBlock: CauldronBlock, LayeredCauldronBlock as the water cauldron,
// LavaCauldronBlock; block/cauldron, and template_cauldron_level1 / level2 / full with water or lava in it)

/** the four L-shaped legs, as two boxes each [x0, z0, x1, z1] (3 px tall) */
const CAULDRON_LEGS: [number, number, number, number][] = [
  [0, 0, 4, 2], [0, 2, 2, 4], [12, 0, 16, 2], [14, 2, 16, 4], [0, 14, 4, 16], [0, 12, 2, 14], [12, 14, 16, 16], [14, 12, 16, 14],
];

/** vanilla AbstractCauldronBlock.SHAPE: the legs, a floor at 3 to 4 px, walls two thick */
const CAULDRON_SHAPE: Box[] = [
  ...CAULDRON_LEGS.map(([x0, z0, x1, z1]) => bx(x0, 0, z0, x1, 3, z1)),
  bx(0, 3, 0, 16, 4, 16),
  bx(0, 4, 0, 2, 16, 16), bx(14, 4, 0, 16, 16, 16), bx(2, 4, 0, 14, 16, 2), bx(2, 4, 14, 14, 16, 16),
];

/** vanilla LayeredCauldronBlock.getContentHeight / LavaCauldronBlock: the surface, in pixels */
export const cauldronContentTop = (level: number): number => 6 + 3 * level;

function cauldronModel(content?: { tex: string; top: number; tint?: boolean }): ModelDef {
  const side = 'cauldron_side', top = 'cauldron_top', inside = 'cauldron_inner', bottom = 'cauldron_bottom';
  // (the inside faces vanish under a block on top, as vanilla's cull them with "up")
  const elements: ElementDef[] = [
    { from: [0, 3, 0], to: [2, 16, 16], faces: { down: f(inside), up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'south'), west: f(side, undefined, 'west'), east: f(side, undefined, 'up') } },
    { from: [2, 3, 2], to: [14, 4, 14], faces: { down: f(inside), up: f(inside, undefined, 'up') } },
    { from: [14, 3, 0], to: [16, 16, 16], faces: { down: f(inside), up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'south'), west: f(side, undefined, 'up'), east: f(side, undefined, 'east') } },
    { from: [2, 3, 0], to: [14, 16, 2], faces: { down: f(inside), up: f(top, undefined, 'up'), north: f(side, undefined, 'north'), south: f(side, undefined, 'up') } },
    { from: [2, 3, 14], to: [14, 16, 16], faces: { down: f(inside), up: f(top, undefined, 'up'), north: f(side, undefined, 'up'), south: f(side, undefined, 'south') } },
  ];
  for (const [x0, z0, x1, z1] of CAULDRON_LEGS) {
    elements.push({
      from: [x0, 0, z0], to: [x1, 3, z1],
      faces: {
        down: f(bottom, undefined, 'down'),
        north: f(side, undefined, z0 === 0 ? 'north' : undefined), south: f(side, undefined, z1 === 16 ? 'south' : undefined),
        west: f(side, undefined, x0 === 0 ? 'west' : undefined), east: f(side, undefined, x1 === 16 ? 'east' : undefined),
      },
    });
  }
  if (content) elements.push({ from: [2, 4, 2], to: [14, content.top, 14], faces: { up: { tex: content.tex, cull: 'up', tint: content.tint ? 0 : undefined } } });
  return { particle: side, elements };
}

// ---------------------------------------------------------------------------
// Lectern (vanilla LecternBlock; block/lectern: the base, the post and the sloping board; LecternRenderer draws the
// book on it)

/** vanilla LecternBlock.SHAPE_COMMON: the base and the post (all it collides with: SHAPE_TOP_PLATE is flat, so empty) */
const LECTERN_COMMON: Box[] = [bx(0, 0, 0, 16, 2, 16), bx(4, 2, 4, 12, 14, 12)];
/** vanilla LecternBlock.SHAPE_NORTH's board, three steps rising away from the reader */
const LECTERN_BOARD_NORTH: Box[] = [bx(0, 10, 1, 16, 14, 16 / 3), bx(0, 12, 16 / 3, 16, 16, 29 / 3), bx(0, 14, 29 / 3, 16, 18, 14)];

function lecternModel(): ModelDef {
  return {
    particle: 'lectern_sides',
    elements: [
      {
        from: [0, 0, 0], to: [16, 2, 16],
        faces: {
          north: f('lectern_base', [0, 14, 16, 16], 'north'), east: f('lectern_base', [0, 6, 16, 8], 'east'),
          south: f('lectern_base', [0, 6, 16, 8], 'south'), west: f('lectern_base', [0, 6, 16, 8], 'west'),
          up: f('lectern_base', [0, 0, 16, 16], undefined, 180), down: f('oak_planks', [0, 0, 16, 16], 'down'),
        },
      },
      {
        from: [4, 2, 4], to: [12, 15, 12],
        faces: {
          north: f('lectern_front', [0, 0, 8, 13]), east: f('lectern_sides', [2, 16, 15, 8], undefined, 90),
          south: f('lectern_front', [8, 3, 16, 16]), west: f('lectern_sides', [2, 8, 15, 16], undefined, 90),
        },
      },
      {
        from: [0.0125, 12, 3], to: [15.9875, 16, 16],
        rot: { origin: [8, 8, 8], axis: 'x', angle: -22.5 },
        faces: {
          north: f('lectern_sides', [0, 0, 16, 4]), east: f('lectern_sides', [0, 4, 13, 8]),
          south: f('lectern_sides', [0, 4, 16, 8]), west: f('lectern_sides', [0, 4, 13, 8]),
          up: f('lectern_top', [0, 1, 16, 14], undefined, 180), down: f('oak_planks', [0, 0, 16, 13]),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Stonecutter (vanilla StonecutterBlock; block/stonecutter: a slab of a table and the saw's blade standing up out of it)

function stonecutterModel(): ModelDef {
  const side = (d: DirName) => f('stonecutter_side', [0, 7, 16, 16], d);
  return {
    particle: 'stonecutter_bottom',
    elements: [
      { from: [0, 0, 0], to: [16, 9, 16], faces: { down: f('stonecutter_bottom', [0, 0, 16, 16], 'down'), up: f('stonecutter_top', [0, 0, 16, 16]), north: side('north'), south: side('south'), west: side('west'), east: side('east') } },
      { from: [1, 9, 8], to: [15, 16, 8], faces: { north: f('stonecutter_saw', [1, 9, 15, 16]), south: f('stonecutter_saw', [15, 9, 1, 16]) } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Brewing stand (vanilla BrewingStandBlock; block/brewing_stand, and a bottle, or an empty holder, on each arm:
// brewing_stand_bottle0-2 / brewing_stand_empty0-2)

export const HAS_BOTTLE = [boolProp('has_bottle_0'), boolProp('has_bottle_1'), boolProp('has_bottle_2')];

function brewingStandModels(): { stand: ModelDef; arms: [ModelDef, ModelDef][] } {
  const base = (x0: number, z0: number, x1: number, z1: number): ElementDef => ({
    from: [x0, 0, z0], to: [x1, 2, z1],
    faces: {
      down: f('brewing_stand_base', [x0, z0, x1, z1], 'down'), up: f('brewing_stand_base', [x0, z0, x1, z1]),
      north: f('brewing_stand_base', [x0, 14, x1, 16]), south: f('brewing_stand_base', [x0, 14, x1, 16]),
      west: f('brewing_stand_base', [z0, 14, z1, 16]), east: f('brewing_stand_base', [z0, 14, z1, 16]),
    },
  });
  const stand: ModelDef = {
    particle: 'brewing_stand',
    elements: [
      {
        from: [7, 0, 7], to: [9, 14, 9],
        faces: {
          down: f('brewing_stand', [7, 7, 9, 9]), up: f('brewing_stand', [7, 7, 9, 9]),
          north: f('brewing_stand', [7, 2, 9, 16]), south: f('brewing_stand', [7, 2, 9, 16]), west: f('brewing_stand', [7, 2, 9, 16]), east: f('brewing_stand', [7, 2, 9, 16]),
        },
      },
      base(9, 5, 15, 11), base(2, 1, 8, 7), base(2, 9, 8, 15),
    ],
  };
  // each arm a flat panel from the post out over its base plate (the east one straight, the others turned 45 degrees);
  // the texture's middle column (the rod) always meets the post, so its bottle or empty holder hangs at the far end
  const arm = (east: boolean, angle: number, bottle: boolean): ModelDef => {
    const uv: [number, number, number, number] = bottle ? [0, 0, 8, 16] : [16, 0, 8, 16];
    const back: [number, number, number, number] = [uv[2], uv[1], uv[0], uv[3]];
    return {
      particle: 'brewing_stand',
      elements: [{
        from: east ? [8, 0, 8] : [0, 0, 8], to: east ? [16, 16, 8] : [8, 16, 8],
        rot: angle ? { origin: [8, 8, 8], axis: 'y', angle } : undefined, shade: false,
        faces: east ? { north: f('brewing_stand', uv), south: f('brewing_stand', back) } : { north: f('brewing_stand', back), south: f('brewing_stand', uv) },
      }],
    };
  };
  return {
    stand,
    arms: [
      [arm(true, 0, true), arm(true, 0, false)],
      [arm(false, 45, true), arm(false, 45, false)],
      [arm(false, -45, true), arm(false, -45, false)],
    ],
  };
}

// ---------------------------------------------------------------------------
// Flower pot (vanilla FlowerPotBlock; block/flower_pot, and with a plant in it flower_pot_cross,
// tinted_flower_pot_cross, potted_cactus or template_potted_azalea_bush)

/** vanilla FlowerPotBlock.SHAPE, the same with a plant in it */
export const FLOWER_POT_SHAPE: Box[] = [bx(5, 0, 5, 11, 6, 11)];

/**
 * the plants a pot takes (vanilla FlowerPotBlock.POTTED_BY_CONTENT, in vanilla's order). Those this world doesn't have
 * yet (torchflower, mangrove propagule, wither rose) get their pot when they arrive; (remaining mobs: the panda)
 * bamboo's pot, with its own model, is world/blocksBamboo.ts's.
 */
export const POTTABLE = [
  'torchflower', 'oak_sapling', 'spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling', 'cherry_sapling', 'dark_oak_sapling',
  'mangrove_propagule', 'fern', 'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip',
  'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'red_mushroom', 'brown_mushroom', 'dead_bush', 'cactus',
  'bamboo', 'crimson_fungus', 'warped_fungus', 'crimson_roots', 'warped_roots', 'azalea', 'flowering_azalea',
];

/** the potted block's name (vanilla Blocks.POTTED_AZALEA is potted_azalea_bush) */
export const pottedName = (plant: string): string => (plant.endsWith('azalea') ? `potted_${plant}_bush` : `potted_${plant}`);

/** vanilla block/flower_pot: four walls a pixel thick round a bed of dirt */
export function flowerPotElements(): ElementDef[] {
  const t = 'flower_pot';
  return [
    { from: [5, 0, 5], to: [6, 6, 11], faces: { down: f(t, [5, 5, 6, 11], 'down'), up: f(t, [5, 5, 6, 11]), north: f(t, [10, 10, 11, 16]), south: f(t, [5, 10, 6, 16]), west: f(t, [5, 10, 11, 16]), east: f(t, [5, 10, 11, 16]) } },
    { from: [10, 0, 5], to: [11, 6, 11], faces: { down: f(t, [10, 5, 11, 11], 'down'), up: f(t, [10, 5, 11, 11]), north: f(t, [5, 10, 6, 16]), south: f(t, [10, 10, 11, 16]), west: f(t, [5, 10, 11, 16]), east: f(t, [5, 10, 11, 16]) } },
    { from: [6, 0, 5], to: [10, 6, 6], faces: { down: f(t, [6, 10, 10, 11], 'down'), up: f(t, [6, 5, 10, 6]), north: f(t, [6, 10, 10, 16]), south: f(t, [6, 10, 10, 16]) } },
    { from: [6, 0, 10], to: [10, 6, 11], faces: { down: f(t, [6, 5, 10, 6], 'down'), up: f(t, [6, 10, 10, 11]), north: f(t, [6, 10, 10, 16]), south: f(t, [6, 10, 10, 16]) } },
    { from: [6, 0, 6], to: [10, 4, 10], faces: { down: f(t, [6, 12, 10, 16], 'down'), up: f('dirt', [6, 6, 10, 10]) } },
  ];
}

/** vanilla flower_pot_cross (tinted_flower_pot_cross with `tint`): the plant's two crossed planes, shrunk to stand in the dirt */
function pottedCross(plant: string, tint?: number): ElementDef[] {
  const face: FaceDef = { tex: plant, uv: [0, 0, 16, 16], tint };
  const rot = { origin: [8, 8, 8] as [number, number, number], axis: 'y' as const, angle: 45, rescale: true };
  return [
    { from: [2.6, 4, 8], to: [13.4, 16, 8], rot, shade: false, faces: { north: face, south: face } },
    { from: [8, 4, 2.6], to: [8, 16, 13.4], rot, shade: false, faces: { west: face, east: face } },
  ];
}

/** the pot with `plant` in it */
export function pottedModel(plant: string): ModelDef {
  const pot = flowerPotElements();
  const model = (elements: ElementDef[]): ModelDef => ({ ao: false, particle: 'flower_pot', elements: [...pot, ...elements] });
  if (plant === 'fern') return model(pottedCross('fern', 0));
  if (plant === 'crimson_roots' || plant === 'warped_roots') return model(pottedCross(`${plant}_pot`));
  // vanilla potted_cactus: a stub of cactus four pixels across standing up out of the dirt
  if (plant === 'cactus') {
    const side = f('cactus_side', [6, 0, 10, 12]);
    return model([{ from: [6, 4, 6], to: [10, 16, 10], faces: { up: f('cactus_top', [6, 6, 10, 10]), north: side, south: side, west: side, east: side } }]);
  }
  // vanilla template_potted_azalea_bush: a small bush, open underneath, on a woody stem
  if (plant.endsWith('azalea')) {
    const name = pottedName(plant);
    const top = `${name}_top`, side = f(`${name}_side`, [4, 0, 12, 8]);
    return model([
      { from: [4, 15.9, 4], to: [12, 15.9, 12], faces: { up: f(top, [4, 4, 12, 12]), down: f(top, [4, 12, 12, 4]) } },
      { from: [4, 8, 4], to: [12, 15.9, 4], faces: { north: side, south: side } },
      { from: [4, 8, 12], to: [12, 15.9, 12], faces: { north: side, south: side } },
      { from: [4, 8, 4], to: [4, 15.9, 12], faces: { west: side, east: side } },
      { from: [12, 8, 4], to: [12, 15.9, 12], faces: { west: side, east: side } },
      ...pottedCross(`${name}_plant`),
    ]);
  }
  return model(pottedCross(plant));
}

// ---------------------------------------------------------------------------
// Campfire (vanilla CampfireBlock; block/campfire and soul_campfire from template_campfire, and campfire_off: two
// logs on the ground, two across them, the ash between and the flames crossed over it; the blockstate turns the
// model, which is drawn facing south)

/** vanilla CampfireBlock.SHAPE */
export const CAMPFIRE_SHAPE: Box[] = [bx(0, 0, 0, 16, 7, 16)];
export const SIGNAL_FIRE = boolProp('signal_fire');

/** `fire` and `lit` (the glowing log faces) for a lit campfire; null for one put out */
function campfireModel(fire: string | null, litLog: string): ModelDef {
  const log = 'campfire_log';
  const lit = fire ? litLog : log;
  // (the bark runs along rows 0-3 of campfire_log, the 4x4 end of a log sits under it, the ash bed below that)
  const bark: UV4 = [0, 0, 16, 4], back: UV4 = [16, 0, 0, 4], end: UV4 = [0, 4, 4, 8];
  const elements: ElementDef[] = [
    { from: [1, 0, 0], to: [5, 4, 16], faces: { north: f(log, end, 'north'), east: f(lit, bark), south: f(log, end, 'south'), west: f(log, back), up: f(log, bark, undefined, 90), down: f(log, bark, 'down', 90) } },
    { from: [0, 3, 11], to: [16, 7, 15], faces: { north: f(log, back), east: f(log, end, 'east'), south: f(log, bark), west: f(log, end, 'west'), up: f(lit, bark, undefined, 180), down: f(log, bark) } },
    { from: [11, 0, 0], to: [15, 4, 16], faces: { north: f(log, end, 'north'), east: f(log, bark), south: f(log, end, 'south'), west: f(lit, back), up: f(log, bark, undefined, 90), down: f(log, bark, 'down', 90) } },
    { from: [0, 3, 1], to: [16, 7, 5], faces: { north: f(log, bark), east: f(log, end, 'east'), south: f(log, back), west: f(log, end, 'west'), up: f(lit, bark, undefined, 180), down: f(log, bark) } },
    { from: [5, 0, 0], to: [11, 1, 16], faces: { north: f(log, [0, 12, 6, 13], 'north'), south: f(log, [10, 12, 16, 13], 'south'), up: f(lit, [0, 8, 16, 14], undefined, 90), down: f(log, [0, 8, 16, 14], 'down', 90) } },
  ];
  if (fire) {
    const rot = { origin: [8, 8, 8] as [number, number, number], axis: 'y' as const, angle: 45, rescale: true };
    const flame = f(fire, [0, 0, 16, 16]);
    elements.push(
      { from: [0.8, 1, 8], to: [15.2, 17, 8], rot, faces: { north: flame, south: flame } },
      { from: [8, 1, 0.8], to: [8, 17, 15.2], rot, faces: { west: flame, east: flame } },
    );
  }
  return { particle: log, elements };
}

/** face bits (1 << dir) of the four sides and the bottom: full faces for neighbours to cull against and hang things on */
const SIDES_AND_BOTTOM = 0b111101;

export function registerVillageBlocks(): void {
  {
    const models = bellModels();
    // (vanilla Blocks.BELL: strength 5, the anvil's sounds, no tool needed for the drop; a pickaxe is quickest)
    registerBlock('bell', {
      props: [P.facingH, BELL_ATTACHMENT, P.powered], defaults: { facing: 'north', attachment: 'floor' },
      hardness: 5, resistance: 5, sound: 'anvil', tool: 'pickaxe', mapColor: 0xfaee4d,
      opaque: false, aoCaster: false, opacity: 0,
      collision: (s) => bellShape(s.get('facing') as string, s.get('attachment') as string),
      model: (s) => ({ model: models[s.get('attachment') as string], y: HOR_ROT[s.get('facing') as string] }),
    });
  }
  {
    const closed = cubeBottomTop('barrel_side', 'barrel_bottom', 'barrel_top');
    const open = cubeBottomTop('barrel_side', 'barrel_bottom', 'barrel_top_open');
    // (vanilla Blocks.BARREL: strength 2.5, wood, set alight by lava)
    registerBlock('barrel', {
      props: [P.facing, P.open], defaults: { facing: 'north' },
      hardness: 2.5, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x8f7748,
      model: (s) => facingModel(s.get('open') ? open : closed, s),
    });
  }
  {
    const { base, contents } = composterModels();
    // (vanilla Blocks.COMPOSTER: strength 0.6, wood, set alight by lava)
    registerBlock('composter', {
      props: [COMPOSTER_LEVEL],
      hardness: 0.6, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x8f7748,
      opaque: false, aoCaster: false, opacity: 0, faceOcclusion: SIDES_AND_BOTTOM,
      collision: (s) => composterShape(s.get<number>('level')),
      model: (s) => {
        const level = s.get<number>('level');
        return level ? { parts: [{ model: base }, { model: contents[level] }] } : { model: base };
      },
    });
  }
  {
    // (vanilla: strength 2, a pickaxe to drop, no occlusion; the lava one glows)
    const base = {
      hardness: 2, sound: 'stone', tool: 'pickaxe' as const, requiresTool: true, mapColor: 0x707070,
      opaque: false, aoCaster: false, opacity: 0, collision: CAULDRON_SHAPE,
    };
    const empty = cauldronModel();
    registerBlock('cauldron', { ...base, model: () => ({ model: empty }) });
    const water = [1, 2, 3].map((l) => cauldronModel({ tex: 'water_still', top: cauldronContentTop(l), tint: true }));
    registerBlock('water_cauldron', {
      ...base, props: [intProp('level', 1, 3)], defaults: { level: 1 }, tint: 'water', item: false,
      model: (s) => ({ model: water[s.get<number>('level') - 1] }),
    });
    const lava = cauldronModel({ tex: 'lava_still', top: 15 });
    registerBlock('lava_cauldron', { ...base, light: 15, item: false, model: () => ({ model: lava }) });
  }
  {
    const model = lecternModel();
    // (vanilla Blocks.LECTERN: strength 2.5, wood, set alight by lava)
    registerBlock('lectern', {
      props: [P.facingH, P.powered, boolProp('has_book')], defaults: { facing: 'north' },
      hardness: 2.5, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x8f7748,
      opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 1 << 0,
      collision: LECTERN_COMMON,
      outline: (s) => [...LECTERN_BOARD_NORTH.map((b) => turn(b, s.get<string>('facing'))), ...LECTERN_COMMON],
      model: (s) => ({ model, y: HOR_ROT[s.get<string>('facing')] }),
    });
  }
  // the job site tables (vanilla CartographyTableBlock, FletchingTableBlock, SmithingTableBlock: plain cubes of wood,
  // strength 2.5, set alight by lava)
  {
    const table = (name: string, t: Record<DirName, string>, particle: string) =>
      registerBlock(name, { hardness: 2.5, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x8f7748, model: () => ({ model: cube(t, { particle }) }) });
    table('cartography_table', { down: 'dark_oak_planks', up: 'cartography_table_top', north: 'cartography_table_side3', east: 'cartography_table_side3', south: 'cartography_table_side1', west: 'cartography_table_side2' }, 'cartography_table_side3');
    table('fletching_table', { down: 'birch_planks', up: 'fletching_table_top', north: 'fletching_table_front', south: 'fletching_table_front', east: 'fletching_table_side', west: 'fletching_table_side' }, 'fletching_table_front');
    table('smithing_table', { down: 'smithing_table_bottom', up: 'smithing_table_top', north: 'smithing_table_front', south: 'smithing_table_front', east: 'smithing_table_side', west: 'smithing_table_side' }, 'smithing_table_front');
  }
  {
    // (vanilla LoomBlock: orientable_with_bottom, facing the player)
    const model = orientable('loom_front', 'loom_side', 'loom_top', 'loom_bottom');
    registerBlock('loom', {
      props: [P.facingH], hardness: 2.5, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x8f7748,
      model: (s) => ({ model, y: HOR_ROT[s.get<string>('facing')] }),
    });
  }
  {
    // (vanilla StonecutterBlock: strength 3.5, a pickaxe to drop; its blade is cut out)
    const model = stonecutterModel();
    registerBlock('stonecutter', {
      props: [P.facingH], hardness: 3.5, sound: 'stone', tool: 'pickaxe', requiresTool: true, mapColor: 0x707070,
      layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 1 << 0,
      collision: [bx(0, 0, 0, 16, 9, 16)],
      model: (s) => ({ model, y: HOR_ROT[s.get<string>('facing')] }),
    });
  }
  {
    // (vanilla Blocks.BREWING_STAND: strength 0.5, a pickaxe to drop, a glimmer of light, see-through)
    const { stand, arms } = brewingStandModels();
    registerBlock('brewing_stand', {
      props: HAS_BOTTLE, hardness: 0.5, sound: 'stone', tool: 'pickaxe', requiresTool: true, mapColor: 0xa7a7a7,
      light: 1, layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      collision: [bx(1, 0, 1, 15, 2, 15), bx(7, 0, 7, 9, 14, 9)],
      model: (s) => ({ parts: [{ model: stand }, ...arms.map(([full, empty], i) => ({ model: s.get(`has_bottle_${i}`) ? full : empty }))] }),
    });
  }
  {
    // (vanilla Blocks.FLOWER_POT and every POTTED_ one: broken in a blink, stone's sounds, see-through; the potted ones
    // have no item of their own)
    const pot = { hardness: 0, sound: 'stone', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, collision: FLOWER_POT_SHAPE };
    const empty: ModelDef = { ao: false, particle: 'flower_pot', elements: flowerPotElements() };
    registerBlock('flower_pot', { ...pot, model: () => ({ model: empty }) });
    for (const plant of POTTABLE) {
      if (!BLOCK_BY_NAME.has(plant)) continue;
      const model = pottedModel(plant);
      registerBlock(pottedName(plant), { ...pot, item: false, ...(plant === 'fern' ? { tint: 'grass' as const } : {}), model: () => ({ model }) });
    }
  }
  // (vanilla Blocks.CAMPFIRE / SOUL_CAMPFIRE: strength 2, wood, set alight by lava, see-through; light 15 or 10 while lit)
  const off = campfireModel(null, 'campfire_log');
  for (const [name, light] of [['campfire', 15], ['soul_campfire', 10]] as const) {
    const on = campfireModel(`${name}_fire`, `${name}_log_lit`);
    registerBlock(name, {
      props: [P.lit, SIGNAL_FIRE, P.waterlogged, P.facingH], defaults: { lit: true, facing: 'north' },
      hardness: 2, sound: 'wood', tool: 'axe', flammable: true, mapColor: 0x815631,
      light: (s) => (s.get('lit') ? light : 0), layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      collision: CAMPFIRE_SHAPE,
      model: (s) => ({ model: s.get('lit') ? on : off, y: (HOR_ROT[s.get<string>('facing')] + 180) % 360 }),
    });
  }
  // Smoker and blast furnace (vanilla SmokerBlock, BlastFurnaceBlock: furnaces with their own recipes; block/smoker is
  // orientable_with_bottom, block/blast_furnace orientable, each with an _on front)
  for (const [name, bottom] of [['smoker', 'smoker_bottom'], ['blast_furnace', 'blast_furnace_top']]) {
    const off = orientable(`${name}_front`, `${name}_side`, `${name}_top`, bottom);
    const on = orientable(`${name}_front_on`, `${name}_side`, `${name}_top`, bottom);
    // (vanilla: strength 3.5, a pickaxe to drop, light 13 while lit)
    registerBlock(name, {
      props: [P.facingH, P.lit], hardness: 3.5, sound: 'stone', tool: 'pickaxe', requiresTool: true, mapColor: 0x707070,
      light: (s) => (s.get('lit') ? 13 : 0),
      model: (s) => ({ model: s.get('lit') ? on : off, y: HOR_ROT[s.get<string>('facing')] }),
    });
  }
}
