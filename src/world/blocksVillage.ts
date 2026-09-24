// The blocks villages are built around: the bell, the job site blocks villagers take a profession from (vanilla
// PoiTypes: blast furnace, smoker, cartography table, brewing stand, composter, barrel, fletching table, cauldrons,
// lectern, stonecutter, loom, smithing table) and the village's furniture (flower pots and their plants, the
// campfire). Models mirror vanilla's block model JSONs and blockstate files; shapes are vanilla's VoxelShapes.
// What they do is in game/villageBlocks.

import { registerBlock, P, Box, enumProp, intProp, StateView } from './block';
import { cubeBottomTop, orientable, type ModelDef, type FaceDef, type UV4, type ElementDef, type Variant } from './models';
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
