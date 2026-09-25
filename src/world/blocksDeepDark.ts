// The deep dark's blocks: sculk (vanilla SculkBlock), the sculk vein that creeps over faces (SculkVeinBlock, a
// MultifaceBlock), the sculk catalyst that blooms when something dies by it (SculkCatalystBlock), the sculk sensor and
// its calibrated kind that hear vibrations (SculkSensorBlock, CalibratedSculkSensorBlock), the sculk shrieker
// (SculkShriekerBlock); reinforced deepslate, the ancient city's frame; candles, one to four to a block (CandleBlock);
// and the cracked and chiseled deepslate the ancient cities are built of. What they do is in game/sculk.ts and
// game/candles.ts.

import { registerBlock, P, Layer, boolProp, intProp, enumProp, type Box, type StateView } from './block';
import { cubeAll, cubeBottomTop, type ModelDef, type ElementDef, type FaceDef, type Variant } from './models';
import type { DirName } from './dir';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla BlockStateProperties.BLOOM (the catalyst's) */
export const BLOOM = boolProp('bloom');
/** vanilla BlockStateProperties.SCULK_SENSOR_PHASE */
export const SCULK_SENSOR_PHASE = enumProp('sculk_sensor_phase', ['inactive', 'active', 'cooldown']);
/** vanilla BlockStateProperties.POWER */
export const POWER = intProp('power', 0, 15);
/** vanilla BlockStateProperties.SHRIEKING / CAN_SUMMON (the shrieker's) */
export const SHRIEKING = boolProp('shrieking');
export const CAN_SUMMON = boolProp('can_summon');
/** vanilla BlockStateProperties.CANDLES */
export const CANDLES = intProp('candles', 1, 4);

/** vanilla Blocks: the candle and the sixteen dyed ones, in their order */
export const CANDLE_COLORS = ['', 'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
export const CANDLE_NAMES = CANDLE_COLORS.map((c) => (c ? `${c}_candle` : 'candle'));

const HOR_ROT: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };
const FACES: DirName[] = ['down', 'up', 'north', 'south', 'west', 'east'];

function f(tex: string, uv?: [number, number, number, number], cull?: DirName): FaceDef {
  return { tex, uv, cull };
}

/** vanilla block/cube_mirrored_all: every face's texture flipped left to right */
function cubeMirroredAll(tex: string): ModelDef {
  const faces: Partial<Record<DirName, FaceDef>> = {};
  for (const d of FACES) faces[d] = f(tex, [16, 0, 0, 16], d);
  return { particle: tex, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }] };
}

/** vanilla BlockModelGenerators.createRotatedMirroredVariantBlock: plain and mirrored, each turned 0 or 180 */
function rotatedMirrored(tex: string): Variant[] {
  const m = cubeAll(tex), mm = cubeMirroredAll(tex);
  return [{ model: m }, { model: mm }, { model: m, y: 180 }, { model: mm, y: 180 }];
}

// ---------------------------------------------------------------------------
// The sculk sensor (vanilla block/sculk_sensor_inactive, _active and the calibrated sensor's models): a half-height
// slab of sculk with four tendrils standing up from its corners, each a pair of crossed planes

/** vanilla SculkSensorBlock.SHAPE: the lower half */
export const SENSOR_BOX: Box = bx(0, 0, 0, 16, 8, 16);

function tendril(x: number, z: number, angle: number, tex: string, mirror: boolean): ElementDef {
  const uv: [number, number, number, number] = mirror ? [8, 8, 0, 16] : [0, 8, 8, 16];
  const back: [number, number, number, number] = mirror ? [0, 8, 8, 16] : [8, 8, 0, 16];
  return {
    from: [x - 4, 8, z], to: [x + 4, 16, z], shade: false,
    rot: { origin: [x, 12, z], axis: 'y', angle },
    faces: { north: { tex, uv }, south: { tex, uv: back } },
  };
}

function sensorModel(top: string, sides: Record<'north' | 'south' | 'west' | 'east', string>, tendrils: string, extra: ElementDef[] = []): ModelDef {
  const side = (d: 'north' | 'south' | 'west' | 'east') => f(sides[d], [0, 8, 16, 16], d);
  return {
    particle: 'sculk_sensor_bottom',
    elements: [
      {
        from: [0, 0, 0], to: [16, 8, 16],
        faces: { down: f('sculk_sensor_bottom', [0, 0, 16, 16], 'down'), up: f(top, [0, 0, 16, 16]), north: side('north'), south: side('south'), west: side('west'), east: side('east') },
      },
      tendril(3, 3, 45, tendrils, false),
      tendril(13, 3, -45, tendrils, true),
      tendril(13, 13, 45, tendrils, false),
      tendril(3, 13, -45, tendrils, true),
      ...extra,
    ],
  };
}

const SENSOR_SIDES = { north: 'sculk_sensor_side', south: 'sculk_sensor_side', west: 'sculk_sensor_side', east: 'sculk_sensor_side' };

/** vanilla calibrated_sculk_sensor_amethyst: the crystal that stands up out of the calibrated sensor's middle, two crossed planes */
function amethyst(): ElementDef[] {
  const tex = 'calibrated_sculk_sensor_amethyst';
  return [
    { from: [0, 8, 8], to: [16, 24, 8], shade: false, rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, faces: { north: { tex, uv: [0, 0, 16, 16] }, south: { tex, uv: [0, 0, 16, 16] } } },
    { from: [8, 8, 0], to: [8, 24, 16], shade: false, rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, faces: { west: { tex, uv: [0, 0, 16, 16] }, east: { tex, uv: [0, 0, 16, 16] } } },
  ];
}

// ---------------------------------------------------------------------------
// The sculk shrieker (vanilla block/template_sculk_shrieker): a half slab of sculk, and on it a ring of bone round a
// dark mouth, the "inner top" (glowing where the shrieker can summon)

function shriekerModel(innerTop: string): ModelDef {
  const side = 'sculk_shrieker_side';
  const low = (d: DirName) => f(side, [0, 8, 16, 16], d);
  const high = f(side, [1, 1, 15, 8]);
  return {
    particle: 'sculk_shrieker_bottom',
    elements: [
      {
        from: [0, 0, 0], to: [16, 8, 16],
        faces: { down: f('sculk_shrieker_bottom', [0, 0, 16, 16], 'down'), up: f('sculk_shrieker_top', [0, 0, 16, 16]), north: low('north'), south: low('south'), west: low('west'), east: low('east') },
      },
      { from: [1, 8, 1], to: [15, 15, 15], faces: { up: f(innerTop, [1, 1, 15, 15]), north: high, south: high, west: high, east: high } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Candles (vanilla block/template_candle, template_two_candles, template_three_candles, template_four_candles): little
// sticks of wax, each topped by a wick of two crossed one-pixel planes; the texture's column 0..2 is the candle
// (the top at v 6..8, the side from v 8 down, the bottom at v 14..16) and the wick at (0, 5)

/** where each of the one to four candles stands: [x, z, height] of its 2x2 base (vanilla CandleBlock.PARTICLE_OFFSETS: the flame sits a pixel over each wick) */
export const CANDLE_LAYOUT: [number, number, number][][] = [
  [[7, 7, 6]],
  [[5, 7, 5], [9, 6, 6]],
  [[7, 9, 3], [5, 7, 5], [8, 6, 6]],
  [[6, 8, 3], [9, 8, 5], [5, 5, 5], [8, 5, 6]],
];

function candleElements(tex: string, x: number, z: number, h: number): ElementDef[] {
  const body: FaceDef = { tex, uv: [0, 8, 2, 8 + h] };
  const wick: [number, number, number, number] = [0, 5, 1, 6];
  const rot = { origin: [x + 1, h, z + 1] as [number, number, number], axis: 'y' as const, angle: 45 };
  return [
    { from: [x, 0, z], to: [x + 2, h, z + 2], faces: { north: body, south: body, west: body, east: body, up: { tex, uv: [0, 6, 2, 8] }, down: { tex, uv: [0, 14, 2, 16], cull: 'down' } } },
    { from: [x + 0.5, h, z + 1], to: [x + 1.5, h + 1, z + 1], shade: false, rot, faces: { north: { tex, uv: wick }, south: { tex, uv: wick } } },
    { from: [x + 1, h, z + 0.5], to: [x + 1, h + 1, z + 1.5], shade: false, rot, faces: { west: { tex, uv: wick }, east: { tex, uv: wick } } },
  ];
}

function candleModel(tex: string, count: number): ModelDef {
  return { ao: false, particle: tex, elements: CANDLE_LAYOUT[count - 1].flatMap(([x, z, h]) => candleElements(tex, x, z, h)) };
}

/** vanilla CandleBlock.ONE_AABB .. FOUR_AABB */
export const CANDLE_BOXES: Box[] = [bx(7, 0, 7, 9, 6, 9), bx(5, 0, 6, 11, 6, 9), bx(5, 0, 6, 10, 6, 11), bx(5, 0, 5, 11, 6, 10)];

export function registerDeepDarkBlocks(): void {
  // vanilla Blocks.SCULK: strength 0.2, a hoe's (#mineable/hoe), drops only itself with silk touch and a point of
  // experience without; blockstates/sculk.json: turned and mirrored at random
  const sculkVariants = rotatedMirrored('sculk');
  registerBlock('sculk', { hardness: 0.2, sound: 'sculk', tool: 'hoe', model: () => sculkVariants });

  // vanilla Blocks.SCULK_VEIN (a MultifaceBlock): no collision, strength 0.2, broken by pistons, given way to by any
  // other block placed there (vanilla SculkVeinBlock.canBeReplaced); a plane on each face it grows over (vanilla
  // template_glow_lichen, 0.1 px out)
  {
    const e = 0.1, tex = 'sculk_vein';
    const PLANES: Record<string, ElementDef> = {
      down: { from: [0, e, 0], to: [16, e, 16], shade: false, faces: { up: f(tex, [0, 0, 16, 16]), down: f(tex, [0, 16, 16, 0]) } },
      up: { from: [0, 16 - e, 0], to: [16, 16 - e, 16], shade: false, faces: { up: f(tex, [0, 0, 16, 16]), down: f(tex, [0, 16, 16, 0]) } },
      north: { from: [0, 0, e], to: [16, 16, e], shade: false, faces: { north: f(tex, [16, 0, 0, 16]), south: f(tex, [0, 0, 16, 16]) } },
      south: { from: [0, 0, 16 - e], to: [16, 16, 16 - e], shade: false, faces: { north: f(tex, [16, 0, 0, 16]), south: f(tex, [0, 0, 16, 16]) } },
      west: { from: [e, 0, 0], to: [e, 16, 16], shade: false, faces: { west: f(tex, [0, 0, 16, 16]), east: f(tex, [16, 0, 0, 16]) } },
      east: { from: [16 - e, 0, 0], to: [16 - e, 16, 16], shade: false, faces: { west: f(tex, [16, 0, 0, 16]), east: f(tex, [0, 0, 16, 16]) } },
    };
    // (vanilla MultifaceBlock's shapes: a pixel-thick slab against each face it's on)
    const OUT: Record<string, Box> = {
      down: bx(0, 0, 0, 16, 1, 16), up: bx(0, 15, 0, 16, 16, 16), north: bx(0, 0, 0, 16, 16, 1),
      south: bx(0, 0, 15, 16, 16, 16), west: bx(0, 0, 0, 1, 16, 16), east: bx(15, 0, 0, 16, 16, 16),
    };
    registerBlock('sculk_vein', {
      props: [boolProp('down'), P.up, P.north, P.south, P.west, P.east, P.waterlogged],
      hardness: 0.2, sound: 'sculk_vein', tool: 'hoe', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, replaceable: true,
      outline: (s) => {
        const out = FACES.filter((d) => s.get(d)).map((d) => OUT[d]);
        return out.length ? out : 'full';
      },
      model: (s) => ({ model: { ao: false, particle: tex, elements: FACES.filter((d) => s.get(d)).map((d) => PLANES[d]) } }),
    });
  }

  // vanilla Blocks.SCULK_CATALYST: strength 3, light 6; blockstates: the bloom model while it blooms
  {
    const still = cubeBottomTop('sculk_catalyst_side', 'sculk_catalyst_bottom', 'sculk_catalyst_top');
    const bloom = cubeBottomTop('sculk_catalyst_side_bloom', 'sculk_catalyst_bottom', 'sculk_catalyst_top_bloom');
    registerBlock('sculk_catalyst', { props: [BLOOM], hardness: 3, resistance: 3, sound: 'sculk_catalyst', tool: 'hoe', light: 6, model: (s) => ({ model: s.get('bloom') ? bloom : still }) });
  }

  // vanilla Blocks.SCULK_SENSOR and CALIBRATED_SCULK_SENSOR: strength 1.5, light 1 (and drawn full bright while active),
  // the lower half solid; the active model (tendrils lit) for both the active and the cooldown phase
  {
    const inactive = sensorModel('sculk_sensor_top', SENSOR_SIDES, 'sculk_sensor_tendril_inactive');
    const active = sensorModel('sculk_sensor_top', SENSOR_SIDES, 'sculk_sensor_tendril_active');
    const common = {
      hardness: 1.5, sound: 'sculk_sensor', tool: 'hoe' as const, light: 1, layer: Layer.CUTOUT, opaque: false, aoCaster: false,
      collision: [SENSOR_BOX], faceOcclusion: 1, emissive: (s: StateView) => s.get('sculk_sensor_phase') === 'active',
    };
    registerBlock('sculk_sensor', {
      props: [SCULK_SENSOR_PHASE, POWER, P.waterlogged], ...common,
      model: (s) => ({ model: s.get('sculk_sensor_phase') === 'inactive' ? inactive : active }),
    });
    // (the calibrated sensor's input is its back, the side toward the player who placed it: facing north, the south face)
    const calSides = { ...SENSOR_SIDES, south: 'calibrated_sculk_sensor_input_side' };
    const calInactive = sensorModel('calibrated_sculk_sensor_top', calSides, 'sculk_sensor_tendril_inactive', amethyst());
    const calActive = sensorModel('calibrated_sculk_sensor_top', calSides, 'sculk_sensor_tendril_active', amethyst());
    registerBlock('calibrated_sculk_sensor', {
      props: [P.facingH, SCULK_SENSOR_PHASE, POWER, P.waterlogged], defaults: { facing: 'north' }, ...common,
      model: (s) => ({ model: s.get('sculk_sensor_phase') === 'inactive' ? calInactive : calActive, y: HOR_ROT[s.get('facing') as string] }),
    });
  }

  // vanilla Blocks.SCULK_SHRIEKER: strength 3; collides and occludes as the lower half (its outline is the whole block)
  {
    const plain = shriekerModel('sculk_shrieker_inner_top');
    const summoning = shriekerModel('sculk_shrieker_can_summon_inner_top');
    registerBlock('sculk_shrieker', {
      props: [SHRIEKING, P.waterlogged, CAN_SUMMON], hardness: 3, resistance: 3, sound: 'sculk_shrieker', tool: 'hoe',
      layer: Layer.CUTOUT, opaque: false, aoCaster: false, collision: [SENSOR_BOX], outline: 'full', faceOcclusion: 1,
      model: (s) => ({ model: s.get('can_summon') ? summoning : plain }),
    });
  }

  // vanilla Blocks.REINFORCED_DEEPSLATE: strength 55 / 1200, deepslate's sounds, drops nothing, never moved by a piston
  registerBlock('reinforced_deepslate', {
    hardness: 55, resistance: 1200, sound: 'deepslate', model: () => ({ model: cubeBottomTop('reinforced_deepslate_side', 'reinforced_deepslate_bottom', 'reinforced_deepslate_top') }),
  });

  // vanilla Blocks.CRACKED_DEEPSLATE_BRICKS / CRACKED_DEEPSLATE_TILES (copies of the bricks and tiles) and
  // CHISELED_DEEPSLATE (cobbled deepslate's strength, the bricks' sounds)
  const deepslateLike = { hardness: 3.5, resistance: 6, tool: 'pickaxe' as const, requiresTool: true };
  registerBlock('cracked_deepslate_bricks', { ...deepslateLike, sound: 'deepslate_bricks', model: () => ({ model: cubeAll('cracked_deepslate_bricks') }) });
  registerBlock('cracked_deepslate_tiles', { ...deepslateLike, sound: 'deepslate_tiles', model: () => ({ model: cubeAll('cracked_deepslate_tiles') }) });
  registerBlock('chiseled_deepslate', { ...deepslateLike, sound: 'deepslate_bricks', model: () => ({ model: cubeAll('chiseled_deepslate') }) });

  // vanilla Blocks.CANDLE and the dyed candles: strength 0.1, 3 light for each lit candle, broken by pistons; one to
  // four to a block, each count its own model (lit: the candle_lit texture, the wick aglow)
  for (let i = 0; i < CANDLE_NAMES.length; i++) {
    const name = CANDLE_NAMES[i];
    const models = [false, true].map((lit) => [1, 2, 3, 4].map((n) => candleModel(lit ? `${name}_lit` : name, n)));
    registerBlock(name, {
      props: [CANDLES, P.lit, P.waterlogged], hardness: 0.1, sound: 'candle', layer: Layer.CUTOUT, opaque: false, aoCaster: false,
      light: (s: StateView) => (s.get('lit') ? 3 * (s.get('candles') as number) : 0),
      collision: (s: StateView) => [CANDLE_BOXES[(s.get('candles') as number) - 1]],
      model: (s) => ({ model: models[s.get('lit') ? 1 : 0][(s.get('candles') as number) - 1] }),
    });
  }
}
