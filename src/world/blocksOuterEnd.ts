// The outer End's blocks (vanilla 1.9+): the chorus plant and its flower, purpur (the block, its pillar; its
// stairs and slab are in blocks.ts's shared table), end rods, the shulker boxes (world/blocksShulker.ts) and the mob heads
// (world/blocksSkulls.ts: the end ships carry a dragon's). What the chorus does (growing, branching,
// breaking) and what end rods give off is in game/chorus.ts.

import { registerBlock, getBlock, P, Box, StateView, Layer, boolProp, intProp } from './block';
import type { ModelDef, ModelChoice, Variant, ElementDef, FaceDef, UV4 } from './models';
import { cubeAll, cubeColumn } from './models';
import type { DirName } from './dir';
import { registerShulkerBoxBlocks } from './blocksShulker';
import { registerSkullBlocks } from './blocksSkulls';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv?: UV4, cull?: DirName): FaceDef {
  return { tex, uv, cull };
}

/** vanilla ChorusFlowerBlock.AGE: 0..5, 5 the dead flower that grows no more */
export const CHORUS_AGE = intProp('age', 0, 5);
/** vanilla PipeBlock's six connections, in its order */
export const CHORUS_DIRS = ['north', 'east', 'south', 'west', 'up', 'down'] as const;

/**
 * vanilla PipeBlock.makeShapes(0.3125): a 10-across core, and an arm out to the edge of the block for each
 * connection (the chorus plant's collision and outline alike)
 */
function pipeBoxes(s: StateView): Box[] {
  const out: Box[] = [bx(3, 3, 3, 13, 13, 13)];
  if (s.get('north')) out.push(bx(3, 3, 0, 13, 13, 13));
  if (s.get('south')) out.push(bx(3, 3, 3, 13, 13, 16));
  if (s.get('west')) out.push(bx(0, 3, 3, 13, 13, 13));
  if (s.get('east')) out.push(bx(3, 3, 3, 16, 13, 13));
  if (s.get('up')) out.push(bx(3, 3, 3, 13, 16, 13));
  if (s.get('down')) out.push(bx(3, 0, 3, 13, 13, 13));
  return out;
}

/** vanilla models/block/chorus_plant_side.json: an arm out north to the block's edge (the others are it turned) */
function chorusSide(): ModelDef {
  const t = 'chorus_plant';
  return {
    ao: false, particle: t,
    elements: [{ from: [4, 4, 0], to: [12, 12, 4], faces: { down: f(t), up: f(t), north: f(t, undefined, 'north'), west: f(t), east: f(t) } }],
  };
}

/**
 * vanilla models/block/chorus_plant_noside*.json: where there's no arm the core's side is capped by a knob a pixel
 * proud of it, in one of four shapes picked by position (which gives the stems their knobbly look)
 */
function chorusNoSides(): ModelDef[] {
  const t = 'chorus_plant';
  const cap = (x0: number, y0: number, x1: number, y1: number): ElementDef => ({
    from: [x0, y0, 3], to: [x1, y1, 4], faces: { down: f(t), up: f(t), north: f(t), west: f(t), east: f(t) },
  });
  // (the core's own face, under the knob, where the knob doesn't cover it)
  const face = (): ElementDef => ({ from: [4, 4, 4], to: [12, 12, 4], faces: { north: f(t) } });
  return [
    { ao: false, particle: t, elements: [cap(4, 4, 12, 12)] },
    { ao: false, particle: t, elements: [face(), cap(5, 5, 11, 11)] },
    { ao: false, particle: t, elements: [face(), cap(4, 5, 12, 11)] },
    { ao: false, particle: t, elements: [face(), cap(5, 4, 11, 12)] },
  ];
}

/**
 * vanilla models/block/chorus_flower.json: a 12-across core of plant with a 2-thick pad of flower over its top and
 * each of its sides (the bottom is where it grows from)
 */
function chorusFlowerModel(tex: string): ModelDef {
  const b = 'chorus_plant';
  const all = (tx: string, cull?: boolean): Partial<Record<DirName, FaceDef>> => ({
    down: f(tx), up: f(tx, undefined, cull ? 'up' : undefined), north: f(tx), south: f(tx), west: f(tx), east: f(tx),
  });
  return {
    particle: tex,
    elements: [
      { from: [2, 14, 2], to: [14, 16, 14], faces: all(tex, true) },
      { from: [0, 2, 2], to: [2, 14, 14], faces: { ...all(tex), west: f(tex, undefined, 'west') } },
      { from: [14, 2, 2], to: [16, 14, 14], faces: { ...all(tex), east: f(tex, undefined, 'east') } },
      { from: [2, 2, 0], to: [14, 14, 2], faces: { ...all(tex), north: f(tex, undefined, 'north') } },
      { from: [2, 2, 14], to: [14, 14, 16], faces: { ...all(tex), south: f(tex, undefined, 'south') } },
      { from: [2, 0, 2], to: [14, 14, 14], faces: { ...all(b), down: f(b, undefined, 'down') } },
    ],
  };
}

/** vanilla models/block/end_rod.json: a 2-thick rod on a 4-across foot, standing up */
function endRodModel(): ModelDef {
  const t = 'end_rod';
  const side: UV4 = [0, 0, 2, 15], foot: UV4 = [2, 6, 6, 7];
  return {
    ao: false, particle: t,
    elements: [
      { from: [7, 1, 7], to: [9, 16, 9], faces: { up: f(t, [2, 0, 4, 2], 'up'), north: f(t, side), south: f(t, side), west: f(t, side), east: f(t, side) } },
      { from: [6, 0, 6], to: [10, 1, 10], faces: { down: f(t, [6, 6, 2, 2], 'down'), up: f(t, [2, 2, 6, 6]), north: f(t, foot), south: f(t, foot), west: f(t, foot), east: f(t, foot) } },
    ],
  };
}

/** vanilla blockstates/end_rod.json: the model stands up; turned over for down, laid over for the sides */
const ROD_ROT: Record<string, [number, number]> = { up: [0, 0], down: [180, 0], north: [90, 0], south: [90, 180], west: [90, 270], east: [90, 90] };

/** vanilla RodBlock's shapes, by the rod's axis */
function rodBox(s: StateView): Box[] {
  const d = s.get<string>('facing');
  if (d === 'up' || d === 'down') return [bx(6, 0, 6, 10, 16, 10)];
  if (d === 'north' || d === 'south') return [bx(6, 6, 0, 10, 10, 16)];
  return [bx(0, 6, 6, 16, 10, 10)];
}

export function registerOuterEndBlocks(): void {
  // vanilla Blocks.PURPUR_BLOCK / PURPUR_PILLAR: strength 1.5/6, a pickaxe to drop (the stairs are legacyStair of
  // the block, the slab its own 2/6)
  const purpur = { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe' as const, requiresTool: true };
  const block = cubeAll('purpur_block'), pillar = cubeColumn('purpur_pillar', 'purpur_pillar_top');
  registerBlock('purpur_block', { ...purpur, model: () => ({ model: block }) });
  registerBlock('purpur_pillar', {
    ...purpur, props: [P.axis], defaults: { axis: 'y' },
    model: (s: StateView): ModelChoice => (s.get('axis') === 'y' ? { model: pillar } : s.get('axis') === 'z' ? { model: pillar, x: 90 } : { model: pillar, x: 90, y: 90 }),
  });
  Object.assign(getBlock('purpur_slab'), { hardness: 2 });

  // vanilla EndRodBlock: breaks at a touch, gives light 14, sounds as wood; it stands out from the face it was put
  // on (the particles it gives off are its animateTick)
  const rod = endRodModel();
  registerBlock('end_rod', {
    props: [P.facing], defaults: { facing: 'up' },
    hardness: 0, sound: 'wood', light: 14, layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 0,
    collision: rodBox,
    model: (s: StateView): ModelChoice => {
      const [x, y] = ROD_ROT[s.get<string>('facing')];
      return { model: rod, x, y };
    },
  });

  // vanilla ChorusPlantBlock: strength 0.4, wood sounds, an axe's; the stem joins whatever of the plant (or a
  // flower) is beside it, and the end stone it grows from
  const side = chorusSide(), noSides = chorusNoSides();
  const knobs = (x: number, y: number): Variant[] => noSides.map((model) => ({ model, x, y, uvlock: true }));
  const armOf: Record<string, [number, number]> = { north: [0, 0], east: [0, 90], south: [0, 180], west: [0, 270], up: [270, 0], down: [90, 0] };
  const partsFor = CHORUS_DIRS.map((d) => {
    const [x, y] = armOf[d];
    return { arm: { model: side, x, y, uvlock: true } as Variant, knob: knobs(x, y) };
  });
  registerBlock('chorus_plant', {
    props: CHORUS_DIRS.map((d) => boolProp(d)), defaults: {},
    hardness: 0.4, sound: 'wood', tool: 'axe', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 0,
    collision: pipeBoxes, outline: pipeBoxes,
    model: (s: StateView): ModelChoice => ({ parts: CHORUS_DIRS.map((d, i) => (s.get(d) ? partsFor[i].arm : partsFor[i].knob)) }),
    // (vanilla models/block/chorus_plant.json, the item's: a whole cube of the plant)
    itemModel: cubeAll('chorus_plant'),
  });

  // vanilla ChorusFlowerBlock: strength 0.4, wood sounds; it grows while it's young (randomly ticking), and at
  // age 5 it's dead. Its shape is the whole block, its faces hide none of their neighbours'
  const live = chorusFlowerModel('chorus_flower'), dead = chorusFlowerModel('chorus_flower_dead');
  registerBlock('chorus_flower', {
    props: [CHORUS_AGE], defaults: { age: 0 },
    hardness: 0.4, sound: 'wood', tool: 'axe', layer: Layer.CUTOUT, randomTicks: true, opaque: false, aoCaster: false, opacity: 1, faceOcclusion: 0,
    model: (s: StateView): ModelChoice => ({ model: s.get<number>('age') === 5 ? dead : live }),
  });

  registerShulkerBoxBlocks();
  registerSkullBlocks();
}
