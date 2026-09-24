// The redstone components: redstone dust, the redstone torch, the repeater, pistons, the dispenser and dropper, and
// tripwire with its hooks. Models mirror vanilla's block models (redstone_dust_*, template_torch, repeater_*tick*,
// piston*, tripwire*) and the blockstate files' rotations; shapes are vanilla's VoxelShapes. What they do is in
// game/redstone (wire.ts, torch.ts, repeater.ts, piston.ts, dispenser.ts, tripwire.ts).

import { registerBlock, P, Layer, Box, StateView, enumProp, intProp, boolProp } from './block';
import { torchModel, wallTorchModel, type ModelDef, type ElementDef, type FaceDef, type UV4, type Variant } from './models';
import type { DirName } from './dir';
import { POWER } from './blocksRedstone';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv: UV4, cull?: DirName, extra: Partial<FaceDef> = {}): FaceDef {
  return { tex, uv, cull, ...extra };
}

/** vanilla RedstoneSide: how the dust meets a side (NONE, SIDE, or UP the face of the block there) */
export const REDSTONE_SIDES = ['up', 'side', 'none'] as const;
export type RedstoneSide = (typeof REDSTONE_SIDES)[number];
export const RS_NORTH = enumProp('north', [...REDSTONE_SIDES]);
export const RS_EAST = enumProp('east', [...REDSTONE_SIDES]);
export const RS_SOUTH = enumProp('south', [...REDSTONE_SIDES]);
export const RS_WEST = enumProp('west', [...REDSTONE_SIDES]);
/** vanilla BlockStateProperties.DELAY, LOCKED, EXTENDED, SHORT, PISTON_TYPE, TRIGGERED, ATTACHED, DISARMED */
export const DELAY = intProp('delay', 1, 4);
export const LOCKED = boolProp('locked');
export const EXTENDED = boolProp('extended');
export const SHORT = boolProp('short');
export const PISTON_TYPE = enumProp('type', ['normal', 'sticky']);
export const TRIGGERED = boolProp('triggered');
export const ATTACHED = boolProp('attached');
export const DISARMED = boolProp('disarmed');

const HOR_Y: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

// ---------------------------------------------------------------------------
// Redstone dust (vanilla RedStoneWireBlock; models redstone_dust_dot, _side0/1, _side_alt0/1, _up)

/** a flat piece of dust 0.25 above the floor, over the part of the block from z0 to z1 (tinted by its power) */
function dustFlat(tex: string, z0: number, z1: number): ModelDef {
  return {
    ao: false,
    particle: 'redstone_dust_dot',
    elements: [{ from: [0, 0.25, z0], to: [16, 0.25, z1], shade: false, faces: { up: f(tex, [0, z0, 16, z1], undefined, { tint: 0 }), down: f(tex, [0, z1, 16, z0], undefined, { tint: 0 }) } }],
  };
}

const DUST_DOT = dustFlat('redstone_dust_dot', 0, 16);
const DUST_SIDE0 = dustFlat('redstone_dust_line0', 0, 8);
const DUST_SIDE1 = dustFlat('redstone_dust_line1', 0, 8);
const DUST_SIDE_ALT0 = dustFlat('redstone_dust_line0', 8, 16);
const DUST_SIDE_ALT1 = dustFlat('redstone_dust_line1', 8, 16);
/** vanilla redstone_dust_up: up the face of the block to the north */
const DUST_UP: ModelDef = {
  ao: false,
  particle: 'redstone_dust_dot',
  elements: [
    {
      from: [0, 0, 0.25], to: [16, 16, 0.25], shade: false,
      faces: { south: f('redstone_dust_line0', [0, 0, 16, 16], undefined, { tint: 0 }), north: f('redstone_dust_line0', [16, 0, 0, 16], undefined, { tint: 0 }) },
    },
  ],
};

const connected = (v: unknown) => v !== 'none';

/** vanilla blockstates/redstone_wire.json (multipart) */
function dustModel(s: StateView): { parts: Variant[] } {
  const n = connected(s.get('north')), e = connected(s.get('east')), so = connected(s.get('south')), w = connected(s.get('west'));
  const parts: Variant[] = [];
  if ((!n && !e && !so && !w) || (e && n) || (e && so) || (so && w) || (n && w)) parts.push({ model: DUST_DOT });
  if (n) parts.push({ model: DUST_SIDE0 });
  if (so) parts.push({ model: DUST_SIDE_ALT0 });
  if (e) parts.push({ model: DUST_SIDE_ALT1, y: 270 });
  if (w) parts.push({ model: DUST_SIDE1, y: 270 });
  for (const [d, y] of [['north', 0], ['east', 90], ['south', 180], ['west', 270]] as [string, number][]) if (s.get(d) === 'up') parts.push({ model: DUST_UP, y });
  return { parts };
}

// vanilla RedStoneWireBlock SHAPE_DOT, SHAPES_FLOOR and SHAPES_UP
const DUST_SHAPE_DOT = bx(3, 0, 3, 13, 1, 13);
const DUST_FLOOR: Record<string, Box> = { north: bx(3, 0, 0, 13, 1, 13), south: bx(3, 0, 3, 13, 1, 16), east: bx(3, 0, 3, 16, 1, 13), west: bx(0, 0, 3, 13, 1, 13) };
const DUST_WALL: Record<string, Box> = { north: bx(3, 0, 0, 13, 16, 1), south: bx(3, 0, 15, 13, 16, 16), east: bx(15, 0, 3, 16, 16, 13), west: bx(0, 0, 3, 1, 16, 13) };

function dustShape(s: StateView): Box[] {
  const out: Box[] = [DUST_SHAPE_DOT];
  for (const d of ['north', 'east', 'south', 'west']) {
    const v = s.get(d);
    if (v !== 'none') out.push(DUST_FLOOR[d]);
    if (v === 'up') out.push(DUST_WALL[d]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repeater (vanilla RepeaterBlock; models repeater_{1-4}tick[_on][_locked])

/** a redstone torch on the repeater at z0..z0+2: unlit its stick, lit the stick with the glow round its head */
function repeaterTorch(z0: number, lit: boolean): ElementDef[] {
  if (!lit) {
    const t = 'redstone_torch_off';
    const side: UV4 = [7, 6, 9, 11];
    return [{ from: [7, 2, z0], to: [9, 7, z0 + 2], faces: { down: f(t, [7, 13, 9, 15]), up: f(t, [7, 6, 9, 8]), north: f(t, side), south: f(t, side), west: f(t, side), east: f(t, side) } }];
  }
  const t = 'redstone_torch';
  return [
    { from: [7, 7, z0], to: [9, 7, z0 + 2], faces: { up: f(t, [7, 6, 9, 8]) } },
    { from: [7, 2, z0 - 1], to: [9, 8, z0 + 3], faces: { west: f(t, [6, 5, 10, 11]), east: f(t, [6, 5, 10, 11]) } },
    { from: [6, 2, z0], to: [10, 8, z0 + 2], faces: { north: f(t, [6, 5, 10, 11]), south: f(t, [6, 5, 10, 11]) } },
  ];
}

/** the model facing south (input from the south, output north): vanilla's unrotated repeater */
function repeaterModel(delay: number, powered: boolean, locked: boolean): ModelDef {
  const top = powered ? 'repeater_on' : 'repeater';
  const z = 6 + (delay - 1) * 2;
  const els: ElementDef[] = [
    {
      from: [0, 0, 0], to: [16, 2, 16],
      faces: {
        down: f('smooth_stone', [0, 0, 16, 16], 'down'), up: f(top, [0, 0, 16, 16]),
        north: f('smooth_stone', [0, 14, 16, 16], 'north'), south: f('smooth_stone', [0, 14, 16, 16], 'south'),
        west: f('smooth_stone', [0, 14, 16, 16], 'west'), east: f('smooth_stone', [0, 14, 16, 16], 'east'),
      },
    },
    ...repeaterTorch(2, powered),
  ];
  if (locked) {
    els.push({
      from: [2, 2, z], to: [14, 4, z + 2],
      faces: {
        down: f('bedrock', [7, 2, 9, 14], undefined, { rot: 90 }), up: f('bedrock', [7, 2, 9, 14], undefined, { rot: 90 }),
        north: f('bedrock', [2, 7, 14, 9]), south: f('bedrock', [2, 7, 14, 9]), west: f('bedrock', [6, 7, 8, 9]), east: f('bedrock', [6, 7, 8, 9]),
      },
    });
  } else els.push(...repeaterTorch(z, powered));
  return { ao: false, particle: top, elements: els };
}

/** vanilla blockstates/repeater.json: south unrotated */
const REPEATER_Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

export function registerRedstoneComponents(): void {
  // Redstone dust: the redstone item places it
  registerBlock('redstone_wire', {
    props: [RS_NORTH, RS_EAST, RS_SOUTH, RS_WEST, POWER], defaults: { north: 'none', east: 'none', south: 'none', west: 'none', power: 0 },
    hardness: 0, sound: 'stone', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, tint: 'redstone',
    outline: (s) => dustShape(s), model: dustModel, item: 'redstone',
  });

  // Redstone torch: light 7 while lit (vanilla litBlockEmission(7))
  {
    const on = torchModel('redstone_torch'), off = torchModel('redstone_torch_off');
    const wallOn = wallTorchModel('redstone_torch'), wallOff = wallTorchModel('redstone_torch_off');
    const light = (s: StateView) => (s.get('lit') ? 7 : 0);
    registerBlock('redstone_torch', {
      props: [P.lit], defaults: { lit: true }, hardness: 0, sound: 'wood', collision: 'none', layer: Layer.CUTOUT, opaque: false, light,
      outline: [bx(6, 0, 6, 10, 10, 10)], model: (s) => ({ model: s.get('lit') ? on : off }),
    });
    const WALL_Y: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };
    registerBlock('redstone_wall_torch', {
      props: [P.facingH, P.lit], defaults: { lit: true }, hardness: 0, sound: 'wood', collision: 'none', layer: Layer.CUTOUT, opaque: false, light, item: 'redstone_torch',
      outline: (s) => {
        switch (s.get('facing')) {
          case 'north': return [bx(5.5, 3, 11, 10.5, 13, 16)];
          case 'south': return [bx(5.5, 3, 0, 10.5, 13, 5)];
          case 'west': return [bx(11, 3, 5.5, 16, 13, 10.5)];
          default: return [bx(0, 3, 5.5, 5, 13, 10.5)];
        }
      },
      model: (s) => ({ model: s.get('lit') ? wallOn : wallOff, y: WALL_Y[s.get('facing') as string] }),
    });
  }

  // Repeater
  {
    const models = new Map<string, ModelDef>();
    registerBlock('repeater', {
      props: [P.facingH, DELAY, LOCKED, P.powered], defaults: { facing: 'north', delay: 1 },
      hardness: 0, sound: 'stone', collision: [bx(0, 0, 0, 16, 2, 16)], opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 1,
      model: (s) => {
        const key = `${s.get('delay')},${s.get('powered')},${s.get('locked')}`;
        let m = models.get(key);
        if (!m) models.set(key, (m = repeaterModel(s.get('delay') as number, s.get('powered') as boolean, s.get('locked') as boolean)));
        return { model: m, y: REPEATER_Y[s.get('facing') as string] };
      },
    });
  }
}

export { HOR_Y };
