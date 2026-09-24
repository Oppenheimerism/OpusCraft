// The blocks villages are built around: the bell, the job site blocks villagers take a profession from (vanilla
// PoiTypes: blast furnace, smoker, cartography table, brewing stand, composter, barrel, fletching table, cauldrons,
// lectern, stonecutter, loom, smithing table) and the village's furniture (flower pots and their plants, the
// campfire). Models mirror vanilla's block model JSONs and blockstate files; shapes are vanilla's VoxelShapes.
// What they do is in game/villageBlocks.

import { registerBlock, P, Box, enumProp } from './block';
import type { ModelDef, FaceDef, UV4, ElementDef } from './models';
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
}
