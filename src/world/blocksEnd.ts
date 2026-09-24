// The End's blocks (vanilla 1.9+): end stone and its bricks (their slab,
// stairs and wall are in the shared tables of blocks.ts / blocksExtra.ts), the
// end portal frame an eye of ender is set into, and the end portal itself.
// What the frame and the portal do is in game/endPortal.ts; the portal's
// starfield is drawn by render/endRenderer.ts, not by the mesher.

import { registerBlock, P, Box, StateView, boolProp } from './block';
import type { ModelDef, ModelChoice, FaceDef, UV4 } from './models';
import { cubeAll } from './models';
import type { DirName } from './dir';
import { registerWall } from './blocksExtra';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv: UV4, cull?: DirName): FaceDef {
  return { tex, uv, cull };
}

/** vanilla EndPortalFrameBlock.HAS_EYE */
export const HAS_EYE = boolProp('eye');

/** vanilla MapColor.SAND / COLOR_GREEN / COLOR_BLACK */
const MAP_SAND = 0xf7e9a3, MAP_GREEN = 0x667f33, MAP_BLACK = 0x191919;

// vanilla EndPortalFrameBlock.BASE_SHAPE and EYE_SHAPE
const FRAME_BASE = bx(0, 0, 0, 16, 13, 16);
const FRAME_EYE = bx(4, 13, 4, 12, 16, 12);
/** vanilla EndPortalBlock.SHAPE: the slice an entity has to touch to be taken */
export const END_PORTAL_SHAPE = bx(0, 6, 0, 16, 12, 16);

/** vanilla models/block/end_portal_frame.json (+ the eye of end_portal_frame_filled.json) */
function frameModel(eye: boolean): ModelDef {
  const side: UV4 = [0, 3, 16, 16];
  const m: ModelDef = {
    particle: 'end_portal_frame_side',
    elements: [
      {
        from: [0, 0, 0], to: [16, 13, 16],
        faces: {
          down: f('end_stone', [0, 0, 16, 16], 'down'), up: f('end_portal_frame_top', [0, 0, 16, 16]),
          north: f('end_portal_frame_side', side, 'north'), south: f('end_portal_frame_side', side, 'south'),
          west: f('end_portal_frame_side', side, 'west'), east: f('end_portal_frame_side', side, 'east'),
        },
      },
    ],
  };
  if (eye) {
    const e = 'end_portal_frame_eye', rim: UV4 = [4, 0, 12, 3];
    m.elements.push({
      from: [4, 13, 4], to: [12, 16, 12],
      faces: { up: f(e, [4, 4, 12, 12]), north: f(e, rim), south: f(e, rim), west: f(e, rim), east: f(e, rim) },
    });
  }
  return m;
}

// vanilla blockstates/end_portal_frame.json: the model faces south
const FRAME_Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

export function registerEndBlocks(): void {
  // vanilla Blocks.END_STONE / END_STONE_BRICKS: strength(3, 9), pickaxe, any tier
  const stone = { hardness: 3, resistance: 9, sound: 'stone', tool: 'pickaxe' as const, requiresTool: true, mapColor: MAP_SAND };
  const endStone = cubeAll('end_stone'), bricks = cubeAll('end_stone_bricks');
  registerBlock('end_stone', { ...stone, model: () => ({ model: endStone }) });
  registerBlock('end_stone_bricks', { ...stone, model: () => ({ model: bricks }) });
  registerWall('end_stone_brick_wall', 'end_stone_bricks', 3, 'stone', 9);

  // vanilla EndPortalFrameBlock: unbreakable, glass-sounding, a faint glow (light 1); an eye set in adds its
  // little box on top (the shape an eye makes counts for collision too)
  const empty = frameModel(false), filled = frameModel(true);
  registerBlock('end_portal_frame', {
    props: [P.facingH, HAS_EYE], defaults: { facing: 'north', eye: false },
    hardness: -1, resistance: 3600000, sound: 'glass', light: 1, noDrop: true, mapColor: MAP_GREEN,
    opaque: false, aoCaster: false, faceOcclusion: 1,
    collision: (s: StateView) => (s.get('eye') ? [FRAME_BASE, FRAME_EYE] : [FRAME_BASE]),
    model: (s: StateView): ModelChoice => ({ model: s.get('eye') ? filled : empty, y: FRAME_Y[s.get<string>('facing')] }),
  });

  // vanilla EndPortalBlock: no collision, full light, unbreakable, no item; drawn by its block entity's renderer
  registerBlock('end_portal', {
    hardness: -1, resistance: 3600000, light: 15, collision: 'none', outline: [END_PORTAL_SHAPE],
    opaque: false, opacity: 0, faceOcclusion: 0, aoCaster: false, item: false, noDrop: true, mapColor: MAP_BLACK,
  });
}
