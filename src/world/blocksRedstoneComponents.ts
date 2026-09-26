// The redstone components: redstone dust, the redstone torch, the repeater, pistons, the dispenser and dropper, and
// tripwire with its hooks. Models mirror vanilla's block models (redstone_dust_*, template_torch, repeater_*tick*,
// piston*, tripwire*) and the blockstate files' rotations; shapes are vanilla's VoxelShapes. What they do is in
// game/redstone (wire.ts, torch.ts, repeater.ts, piston.ts, dispenser.ts, tripwire.ts).

import { registerBlock, P, Layer, Box, StateView, enumProp, intProp, boolProp, faceMaskFromBoxes } from './block';
import { torchModel, wallTorchModel, orientable, cube, cubeBottomTop, type ModelDef, type ElementDef, type FaceDef, type UV4, type Variant } from './models';
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
/** vanilla BlockStateProperties.FACING_HOPPER, ENABLED, MODE_COMPARATOR, INVERTED */
export const FACING_HOPPER = enumProp('facing', ['down', 'north', 'south', 'west', 'east']);
export const ENABLED = boolProp('enabled');
export const MODE_COMPARATOR = enumProp('mode', ['compare', 'subtract']);
export const INVERTED = boolProp('inverted');

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

// ---------------------------------------------------------------------------
// Tripwire hook and tripwire (vanilla TripWireHookBlock, TripWireBlock; models tripwire_hook[_attached][_on] and
// tripwire[_attached]_n/ne/ns/nse/nsew)

/** the string's height, as in vanilla's tripwire models */
const WIRE_Y = 1.5;

/** a length of string from (8, y0, z0) to (8, y1, z1), lying along z (the texture's rows 0-1 taut, 2-3 slack) */
function stringPiece(y0: number, z0: number, y1: number, z1: number, taut: boolean): ElementDef {
  const len = Math.hypot(y1 - y0, z1 - z0);
  const v = taut ? 0 : 2;
  const face = (): FaceDef => ({ tex: 'tripwire', uv: [0, v, Math.min(16, len), v + 2], rot: 90 });
  const angle = (-Math.atan2(y1 - y0, z1 - z0) * 180) / Math.PI;
  return { from: [7.75, y0, z0], to: [8.25, y0, z0 + len], rot: angle ? { origin: [8, y0, z0], axis: 'x', angle } : undefined, shade: false, faces: { up: face(), down: face() } };
}

/**
 * the hook facing north, its plank on the block to the south: the plank, and an arm with an iron ring on its end,
 * raised while nothing is strung to it, lowered to the string once there is, and dipping further when it's tripped;
 * an attached hook holds the end of the string in its ring
 */
function hookModel(attached: boolean, powered: boolean): ModelDef {
  const wood = 'oak_planks', hook = 'tripwire_hook';
  const angle = attached ? (powered ? -35 : -22.5) : powered ? -22.5 : 45;
  const rot = { origin: [8, 6, 14] as [number, number, number], axis: 'x' as const, angle };
  const els: ElementDef[] = [
    {
      from: [6, 1, 14], to: [10, 9, 16],
      faces: {
        down: f(wood, [6, 14, 10, 16]), up: f(wood, [6, 14, 10, 16]), north: f(wood, [6, 7, 10, 15]), south: f(wood, [6, 7, 10, 15], 'south'),
        west: f(wood, [14, 7, 16, 15]), east: f(wood, [0, 7, 2, 15]),
      },
    },
    { from: [7.2, 5.2, 12], to: [8.8, 6.8, 14], rot, faces: { down: f(wood, [7, 12, 9, 14]), up: f(wood, [7, 12, 9, 14]), north: f(wood, [7, 7, 9, 9]), west: f(wood, [12, 7, 14, 9]), east: f(wood, [2, 7, 4, 9]) } },
    {
      from: [6.2, 5.6, 8.4], to: [9.8, 6.4, 12], rot,
      faces: {
        down: f(hook, [5, 2, 11, 8]), up: f(hook, [5, 2, 11, 8]), north: f(hook, [5, 2, 11, 3]), south: f(hook, [5, 7, 11, 8]),
        west: f(hook, [5, 2, 11, 3]), east: f(hook, [5, 2, 11, 3]),
      },
    },
  ];
  if (attached) {
    // (from the next block's string up into the far side of the ring)
    const a = (angle * Math.PI) / 180, l = 5.2;
    els.push(stringPiece(WIRE_Y, 0, 6 + l * Math.sin(a), 14 - l * Math.cos(a), true));
  }
  return { ao: false, particle: wood, elements: els };
}

/** vanilla tripwire models: half a block of string toward the north (the others turned) */
function wireHalf(attached: boolean): ModelDef {
  return { ao: false, particle: 'tripwire', elements: [stringPiece(WIRE_Y, 0, WIRE_Y, 8, attached)] };
}

/**
 * vanilla block/orientable and block/orientable_vertical with the furnace's sides and top, and blockstates
 * dispenser.json / dropper.json: the front turned to face the way it faces
 */
function dispenserModel(kind: 'dispenser' | 'dropper'): (s: StateView) => Variant {
  const side = orientable(`${kind}_front`, 'furnace_side', 'furnace_top');
  const vertical = cube({ down: 'furnace_top', up: `${kind}_front_vertical`, north: 'furnace_top', south: 'furnace_top', west: 'furnace_top', east: 'furnace_top' }, { particle: `${kind}_front_vertical` });
  return (s) => {
    const facing = s.get('facing') as string;
    if (facing === 'up') return { model: vertical };
    if (facing === 'down') return { model: vertical, x: 180 };
    return { model: side, y: HOR_Y[facing] };
  };
}

// ---------------------------------------------------------------------------
// Pistons (vanilla PistonBaseBlock, PistonHeadBlock, MovingPistonBlock; models template_piston, piston_base and
// template_piston_head, blockstates piston.json and piston_head.json)

/** vanilla template_piston, facing north: the platform north, the bottom south, the sides' wooden edge toward the platform */
function pistonModel(platform: string): ModelDef {
  const side: UV4 = [0, 0, 16, 16];
  return {
    particle: 'piston_side',
    elements: [
      {
        from: [0, 0, 0], to: [16, 16, 16],
        faces: {
          down: f('piston_side', side, 'down', { rot: 180 }), up: f('piston_side', side, 'up'),
          north: f(platform, [0, 0, 16, 16], 'north'), south: f('piston_bottom', [0, 0, 16, 16], 'south'),
          west: f('piston_side', side, 'west', { rot: 270 }), east: f('piston_side', side, 'east', { rot: 90 }),
        },
      },
    ],
  };
}

/** vanilla piston_base: extended, the base is 12 deep with its inside showing where the head was */
function pistonBaseModel(): ModelDef {
  const side: UV4 = [0, 4, 16, 16];
  return {
    particle: 'piston_side',
    elements: [
      {
        from: [0, 0, 4], to: [16, 16, 16],
        faces: {
          down: f('piston_side', side, 'down', { rot: 180 }), up: f('piston_side', side, 'up'),
          north: f('piston_inner', [0, 0, 16, 16]), south: f('piston_bottom', [0, 0, 16, 16], 'south'),
          west: f('piston_side', side, 'west', { rot: 270 }), east: f('piston_side', side, 'east', { rot: 90 }),
        },
      },
    ],
  };
}

/**
 * vanilla template_piston_head: the platform (its back the plain top whatever the front) with the wooden edge round
 * it, and the wooden arm reaching back 16 (4 into the base) or, short, 12
 */
function pistonHeadModel(platform: string, short: boolean): ModelDef {
  const edge: UV4 = [0, 0, 16, 4];
  const z1 = short ? 16 : 20;
  const arm: UV4 = [0, 0, z1 - 4, 4];
  return {
    particle: platform,
    elements: [
      {
        from: [0, 0, 0], to: [16, 16, 4],
        faces: {
          down: f('piston_side', edge, 'down', { rot: 180 }), up: f('piston_side', edge, 'up'),
          north: f(platform, [0, 0, 16, 16], 'north'), south: f('piston_top', [0, 0, 16, 16]),
          west: f('piston_side', [16, 0, 0, 4], 'west', { rot: 90 }), east: f('piston_side', edge, 'east', { rot: 270 }),
        },
      },
      {
        from: [6, 6, 4], to: [10, 10, z1],
        faces: {
          down: f('piston_side', arm, undefined, { rot: 90 }), up: f('piston_side', arm, undefined, { rot: 270 }),
          west: f('piston_side', arm, undefined, { rot: 90 }), east: f('piston_side', arm, undefined, { rot: 270 }),
        },
      },
    ],
  };
}

/** vanilla blockstates piston.json / piston_head.json: north as modelled, the others turned (up and down about x) */
function facingVariant(model: ModelDef, facing: string): Variant {
  if (facing === 'up') return { model, x: 270 };
  if (facing === 'down') return { model, x: 90 };
  return { model, y: HOR_Y[facing] };
}

/** vanilla PistonBaseBlock *_AABB: an extended base */
const PISTON_BASE_SHAPES: Record<string, Box> = {
  east: bx(0, 0, 0, 12, 16, 16), west: bx(4, 0, 0, 16, 16, 16), south: bx(0, 0, 0, 16, 16, 12), north: bx(0, 0, 4, 16, 16, 16), up: bx(0, 0, 0, 16, 12, 16), down: bx(0, 4, 0, 16, 16, 16),
};
/** vanilla PistonHeadBlock *_AABB (the platform), *_ARM_AABB and SHORT_*_ARM_AABB */
const PISTON_PLATFORM: Record<string, Box> = {
  east: bx(12, 0, 0, 16, 16, 16), west: bx(0, 0, 0, 4, 16, 16), south: bx(0, 0, 12, 16, 16, 16), north: bx(0, 0, 0, 16, 16, 4), up: bx(0, 12, 0, 16, 16, 16), down: bx(0, 0, 0, 16, 4, 16),
};
const PISTON_ARM: Record<string, Box> = {
  up: bx(6, -4, 6, 10, 12, 10), down: bx(6, 4, 6, 10, 20, 10), south: bx(6, 6, -4, 10, 10, 12), north: bx(6, 6, 4, 10, 10, 20), east: bx(-4, 6, 6, 12, 10, 10), west: bx(4, 6, 6, 20, 10, 10),
};
const PISTON_ARM_SHORT: Record<string, Box> = {
  up: bx(6, 0, 6, 10, 12, 10), down: bx(6, 4, 6, 10, 16, 10), south: bx(6, 6, 0, 10, 10, 12), north: bx(6, 6, 4, 10, 10, 16), east: bx(0, 6, 6, 12, 10, 10), west: bx(4, 6, 6, 16, 10, 10),
};

/** vanilla PistonHeadBlock.calculateShape */
export function pistonHeadShape(facing: string, short: boolean): Box[] {
  return [PISTON_PLATFORM[facing], (short ? PISTON_ARM_SHORT : PISTON_ARM)[facing]];
}

/** vanilla TripWireBlock AABB and NOT_ATTACHED_AABB */
const WIRE_ATTACHED_SHAPE = bx(0, 1, 0, 16, 2.5, 16);
const WIRE_LOOSE_SHAPE = bx(0, 0, 0, 16, 8, 16);
/** vanilla TripWireHookBlock NORTH/SOUTH/WEST/EAST_AABB */
const HOOK_SHAPES: Record<string, Box> = { north: bx(5, 0, 10, 11, 10, 16), south: bx(5, 0, 0, 11, 10, 6), west: bx(10, 0, 5, 16, 10, 11), east: bx(0, 0, 5, 6, 10, 11) };

// ---------------------------------------------------------------------------
// Hopper (vanilla HopperBlock; models hopper and hopper_side, blockstates hopper.json)

/**
 * vanilla block/hopper and block/hopper_side: the open bowl (its rim walls' inner faces culled only by a block on top,
 * as vanilla's are), the funnel under it, and the spout: straight down, or (hopper_side) out to the north
 */
function hopperModel(side: boolean): ModelDef {
  const o = 'hopper_outside', top = 'hopper_top', inside = 'hopper_inside';
  const spout: ElementDef = side
    ? { from: [6, 4, 0], to: [10, 8, 4], faces: { down: f(o, [6, 12, 10, 16]), up: f(o, [6, 0, 10, 4]), north: f(o, [6, 8, 10, 12], 'north'), west: f(o, [0, 8, 4, 12]), east: f(o, [12, 8, 16, 12]) } }
    : { from: [6, 0, 6], to: [10, 4, 10], faces: { down: f(o, [6, 6, 10, 10], 'down'), north: f(o, [6, 12, 10, 16]), south: f(o, [6, 12, 10, 16]), west: f(o, [6, 12, 10, 16]), east: f(o, [6, 12, 10, 16]) } };
  return {
    ao: false,
    particle: o,
    elements: [
      {
        from: [0, 10, 0], to: [16, 11, 16],
        faces: { down: f(o, [0, 0, 16, 16]), up: f(inside, [0, 0, 16, 16]), north: f(o, [0, 5, 16, 6], 'north'), south: f(o, [0, 5, 16, 6], 'south'), west: f(o, [0, 5, 16, 6], 'west'), east: f(o, [0, 5, 16, 6], 'east') },
      },
      { from: [0, 11, 0], to: [2, 16, 16], faces: { up: f(top, [0, 0, 2, 16], 'up'), north: f(o, [14, 0, 16, 5], 'north'), south: f(o, [0, 0, 2, 5], 'south'), west: f(o, [0, 0, 16, 5], 'west'), east: f(o, [0, 0, 16, 5], 'up') } },
      { from: [14, 11, 0], to: [16, 16, 16], faces: { up: f(top, [14, 0, 16, 16], 'up'), north: f(o, [0, 0, 2, 5], 'north'), south: f(o, [14, 0, 16, 5], 'south'), west: f(o, [0, 0, 16, 5], 'up'), east: f(o, [0, 0, 16, 5], 'east') } },
      { from: [2, 11, 0], to: [14, 16, 2], faces: { up: f(top, [2, 0, 14, 2], 'up'), north: f(o, [2, 0, 14, 5], 'north'), south: f(o, [2, 0, 14, 5], 'up') } },
      { from: [2, 11, 14], to: [14, 16, 16], faces: { up: f(top, [2, 14, 14, 16], 'up'), north: f(o, [2, 0, 14, 5], 'up'), south: f(o, [2, 0, 14, 5], 'south') } },
      {
        from: [4, 4, 4], to: [12, 10, 12],
        faces: { down: f(o, [4, 4, 12, 12]), north: f(o, [4, 6, 12, 12]), south: f(o, [4, 6, 12, 12]), west: f(o, [4, 6, 12, 12]), east: f(o, [4, 6, 12, 12]) },
      },
      spout,
    ],
  };
}

/** vanilla HopperBlock BASE (the bowl, hollow above its floor, and the funnel) and its spouts */
const HOPPER_BASE: Box[] = [bx(0, 10, 0, 16, 11, 16), bx(0, 11, 0, 2, 16, 16), bx(14, 11, 0, 16, 16, 16), bx(2, 11, 0, 14, 16, 2), bx(2, 11, 14, 14, 16, 16), bx(4, 4, 4, 12, 10, 12)];
const HOPPER_SPOUT: Record<string, Box> = {
  down: bx(6, 0, 6, 10, 4, 10), north: bx(6, 4, 0, 10, 8, 4), south: bx(6, 4, 12, 10, 8, 16), west: bx(0, 4, 6, 4, 8, 10), east: bx(12, 4, 6, 16, 8, 10),
};

// ---------------------------------------------------------------------------
// Comparator (vanilla ComparatorBlock; models comparator[_on][_subtract])

/** a redstone torch standing on the comparator at (x0, z0), `h` tall unlit; lit, the glow round its head */
function diodeTorch(x0: number, z0: number, lit: boolean, h = 5): ElementDef[] {
  if (!lit) {
    const t = 'redstone_torch_off';
    const side: UV4 = [7, 6, 9, 6 + h];
    return [{ from: [x0, 2, z0], to: [x0 + 2, 2 + h, z0 + 2], faces: { down: f(t, [7, 13, 9, 15]), up: f(t, [7, 6, 9, 8]), north: f(t, side), south: f(t, side), west: f(t, side), east: f(t, side) } }];
  }
  const t = 'redstone_torch';
  const top = 2 + h + 1, glow: UV4 = [6, 5, 10, 5 + h + 1];
  return [
    { from: [x0, top - 1, z0], to: [x0 + 2, top - 1, z0 + 2], faces: { up: f(t, [7, 6, 9, 8]) } },
    { from: [x0, 2, z0 - 1], to: [x0 + 2, top, z0 + 3], faces: { west: f(t, glow), east: f(t, glow) } },
    { from: [x0 - 1, 2, z0], to: [x0 + 3, top, z0 + 2], faces: { north: f(t, glow), south: f(t, glow) } },
  ];
}

/**
 * the model facing south (input from the south, output north), as vanilla's unrotated comparator: its two torches at
 * the back, lit while it gives power, and the short one at the front, lit in subtract mode
 */
function comparatorModel(powered: boolean, subtract: boolean): ModelDef {
  const top = powered ? 'comparator_on' : 'comparator';
  return {
    ao: false,
    particle: top,
    elements: [
      {
        from: [0, 0, 0], to: [16, 2, 16],
        faces: {
          down: f('smooth_stone', [0, 0, 16, 16], 'down'), up: f(top, [0, 0, 16, 16]),
          north: f('smooth_stone', [0, 14, 16, 16], 'north'), south: f('smooth_stone', [0, 14, 16, 16], 'south'),
          west: f('smooth_stone', [0, 14, 16, 16], 'west'), east: f('smooth_stone', [0, 14, 16, 16], 'east'),
        },
      },
      ...diodeTorch(4, 11, powered),
      ...diodeTorch(10, 11, powered),
      ...diodeTorch(7, 2, subtract, subtract ? 3 : 2),
    ],
  };
}

// ---------------------------------------------------------------------------
// Observer (vanilla ObserverBlock; block/observer and observer_on) and daylight detector (DaylightDetectorBlock;
// template_daylight_detector)

/** vanilla block/observer: the face to the north, what it gives power out of to the south */
function observerModel(powered: boolean): ModelDef {
  return cube(
    { down: 'observer_top', up: 'observer_top', north: 'observer_front', south: powered ? 'observer_back_on' : 'observer_back', west: 'observer_side', east: 'observer_side' },
    { particle: 'observer_front' },
  );
}

/** vanilla template_daylight_detector: a slab 6 high, its sensor on top */
function daylightDetectorModel(top: string): ModelDef {
  const side = 'daylight_detector_side';
  return {
    particle: top,
    elements: [
      {
        from: [0, 0, 0], to: [16, 6, 16],
        faces: {
          down: f(side, [0, 0, 16, 16], 'down'), up: f(top, [0, 0, 16, 16]),
          north: f(side, [0, 10, 16, 16], 'north'), south: f(side, [0, 10, 16, 16], 'south'), west: f(side, [0, 10, 16, 16], 'west'), east: f(side, [0, 10, 16, 16], 'east'),
        },
      },
    ],
  };
}

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

  // Dispenser and dropper: they face any of the six ways (vanilla strength 3.5, a pickaxe to drop)
  for (const kind of ['dispenser', 'dropper'] as const)
    registerBlock(kind, {
      props: [P.facing, TRIGGERED], defaults: { facing: 'north' }, hardness: 3.5, sound: 'stone', tool: 'pickaxe', requiresTool: true,
      model: dispenserModel(kind),
    });

  // Pistons: whole when retracted; extended, the base is 12 deep and the head stands in front (vanilla strength 1.5)
  {
    const base = pistonBaseModel();
    for (const [name, platform] of [['piston', 'piston_top'], ['sticky_piston', 'piston_top_sticky']]) {
      const retracted = pistonModel(platform);
      const shape = (s: StateView): Box[] | 'full' => (s.get('extended') ? [PISTON_BASE_SHAPES[s.get('facing') as string]] : 'full');
      registerBlock(name, {
        props: [EXTENDED, P.facing], defaults: { facing: 'north' }, hardness: 1.5, sound: 'stone', tool: 'pickaxe',
        collision: shape, opaque: (s) => !s.get('extended'), opacity: (s) => (s.get('extended') ? 0 : 15),
        faceOcclusion: (s) => (s.get('extended') ? faceMaskFromBoxes([PISTON_BASE_SHAPES[s.get('facing') as string]]) : 63),
        model: (s) => facingVariant(s.get('extended') ? base : retracted, s.get('facing') as string),
        // vanilla piston_inventory / sticky_piston_inventory: the platform on top
        itemModel: cubeBottomTop('piston_side', 'piston_bottom', platform),
      });
    }
    const heads = [false, true].map((sticky) => [false, true].map((short) => pistonHeadModel(sticky ? 'piston_top_sticky' : 'piston_top', short)));
    registerBlock('piston_head', {
      props: [P.facing, SHORT, PISTON_TYPE], defaults: { facing: 'north' }, hardness: 1.5, sound: 'stone', tool: 'pickaxe', item: false, noDrop: true,
      collision: (s) => pistonHeadShape(s.get('facing') as string, s.get('short') as boolean), opaque: false, opacity: 0, aoCaster: false,
      faceOcclusion: (s) => faceMaskFromBoxes([PISTON_PLATFORM[s.get('facing') as string]]),
      model: (s) => facingVariant(heads[s.get('type') === 'sticky' ? 1 : 0][s.get('short') ? 1 : 0], s.get('facing') as string),
    });
    // what's being moved: invisible, its block entity drawn sliding along, its shape the moving block's
    registerBlock('moving_piston', {
      props: [P.facing, PISTON_TYPE], defaults: { facing: 'north' }, hardness: -1, resistance: 0, sound: 'stone', item: false, noDrop: true,
      collision: 'none', outline: [], opaque: false, opacity: 0, aoCaster: false, layer: Layer.NONE,
    });
  }

  // Tripwire hook: it breaks at once, and a piston breaks it too (vanilla pushReaction DESTROY)
  {
    const models = [false, true].map((a) => [false, true].map((p) => hookModel(a, p)));
    registerBlock('tripwire_hook', {
      props: [P.facingH, P.powered, ATTACHED], defaults: { facing: 'north' },
      hardness: 0, sound: 'stone', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      outline: (s) => [HOOK_SHAPES[s.get('facing') as string]],
      model: (s) => ({ model: models[s.get('attached') ? 1 : 0][s.get('powered') ? 1 : 0], y: HOR_Y[s.get('facing') as string] }),
    });
  }

  // Tripwire: string placed as a block (vanilla ItemNameBlockItem: the string item places it)
  {
    const halves = [wireHalf(false), wireHalf(true)];
    registerBlock('tripwire', {
      props: [P.powered, ATTACHED, DISARMED, P.north, P.east, P.south, P.west],
      hardness: 0, sound: 'stone', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, item: 'string',
      outline: (s) => [s.get('attached') ? WIRE_ATTACHED_SHAPE : WIRE_LOOSE_SHAPE],
      // vanilla blockstates/tripwire.json: each side it's strung to; unstrung it lies north-south
      model: (s) => {
        const m = halves[s.get('attached') ? 1 : 0];
        const parts: Variant[] = [];
        for (const d of ['north', 'east', 'south', 'west']) if (s.get(d)) parts.push({ model: m, y: HOR_Y[d] });
        if (!parts.length) parts.push({ model: m }, { model: m, y: 180 });
        return { parts };
      },
    });
  }

  // Hopper: down, or out of a side (vanilla strength 3, 4.8; metal; a pickaxe to drop)
  {
    const down = hopperModel(false), side = hopperModel(true);
    registerBlock('hopper', {
      props: [FACING_HOPPER, ENABLED], defaults: { facing: 'down', enabled: true },
      hardness: 3, resistance: 4.8, sound: 'metal', tool: 'pickaxe', requiresTool: true, opaque: false, aoCaster: false, opacity: 0,
      collision: (s) => [...HOPPER_BASE, HOPPER_SPOUT[s.get('facing') as string]],
      model: (s) => (s.get('facing') === 'down' ? { model: down } : { model: side, y: HOR_Y[s.get('facing') as string] }),
    });
  }

  // Comparator: a diode like the repeater (vanilla strength 0; stone)
  {
    const models = new Map<string, ModelDef>();
    registerBlock('comparator', {
      props: [P.facingH, MODE_COMPARATOR, P.powered], defaults: { facing: 'north', mode: 'compare' },
      hardness: 0, sound: 'stone', collision: [bx(0, 0, 0, 16, 2, 16)], opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 1,
      model: (s) => {
        const key = `${s.get('powered')},${s.get('mode')}`;
        let m = models.get(key);
        if (!m) models.set(key, (m = comparatorModel(s.get('powered') as boolean, s.get('mode') === 'subtract')));
        return { model: m, y: REPEATER_Y[s.get('facing') as string] };
      },
    });
  }
}

export { HOR_Y };
