// Redstone switches and what they light: the lever, buttons, pressure plates
// and the redstone lamp. Models mirror vanilla's block/lever, block/button,
// block/pressure_plate_{up,down} templates and the blockstate files' rotations;
// shapes are vanilla's VoxelShapes. What they do is in game/redstone/components.

import { registerBlock, P, Box, StateView, enumProp, intProp } from './block';
import type { ModelDef, FaceDef, UV4 } from './models';
import { cubeAll } from './models';
import type { DirName } from './dir';
import { WOODS } from './blocksExtra';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv: UV4, cull?: DirName): FaceDef {
  return { tex, uv, cull };
}

/** vanilla FaceAttachedHorizontalDirectionalBlock.FACE */
export const FACE = enumProp('face', ['floor', 'wall', 'ceiling']);

/** the wood sets that have buttons and pressure plates */
export const BUTTON_WOODS = [...WOODS, 'crimson', 'warped'] as const;

// vanilla blockstates/lever.json and stone_button.json: [x, y] per face and facing
const ROT: Record<string, [number, number]> = {
  'floor,north': [0, 0], 'floor,east': [0, 90], 'floor,south': [0, 180], 'floor,west': [0, 270],
  'wall,north': [90, 0], 'wall,east': [90, 90], 'wall,south': [90, 180], 'wall,west': [90, 270],
  'ceiling,north': [180, 180], 'ceiling,east': [180, 270], 'ceiling,south': [180, 0], 'ceiling,west': [180, 90],
};

/** the shape of a face-attached switch, from its boxes on the floor (along z and along x), on a north wall and on the ceiling */
function attachedShapes(floorZ: Box, floorX: Box, north: Box, ceilZ: Box, ceilX: Box): Map<string, Box> {
  const m = new Map<string, Box>();
  // (a wall shape turned about the block's middle: south, west and east are north mirrored and swapped)
  const [x0, y0, z0, x1, y1, z1] = north;
  const walls: Record<string, Box> = { north, south: [x0, y0, 1 - z1, x1, y1, 1 - z0], west: [z0, y0, x0, z1, y1, x1], east: [1 - z1, y0, x0, 1 - z0, y1, x1] };
  for (const d of ['north', 'south', 'west', 'east']) {
    const alongX = d === 'east' || d === 'west';
    m.set(`floor,${d}`, alongX ? floorX : floorZ);
    m.set(`ceiling,${d}`, alongX ? ceilX : ceilZ);
    m.set(`wall,${d}`, walls[d]);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Lever (vanilla LeverBlock, block/lever + block/lever_on)

function leverModel(on: boolean): ModelDef {
  const base = 'cobblestone', lever = 'lever';
  const side: UV4 = [7, 6, 9, 16];
  return {
    ao: false,
    particle: base,
    elements: [
      {
        from: [5, 0, 4], to: [11, 3, 12],
        faces: {
          down: f(base, [5, 4, 11, 12], 'down'), up: f(base, [5, 4, 11, 12]),
          north: f(base, [5, 0, 11, 3]), south: f(base, [5, 0, 11, 3]), west: f(base, [4, 0, 12, 3]), east: f(base, [4, 0, 12, 3]),
        },
      },
      {
        from: [7, 1, 7], to: [9, 11, 9],
        // (off leans toward the player who placed it on the floor, and up on a wall)
        rot: { origin: [8, 1, 8], axis: 'x', angle: on ? -45 : 45 },
        faces: { up: f(lever, [7, 6, 9, 8]), north: f(lever, side), south: f(lever, side), west: f(lever, side), east: f(lever, side) },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Buttons (vanilla ButtonBlock, block/button, button_pressed, button_inventory)

function buttonModel(tex: string, pressed: boolean): ModelDef {
  const v = pressed ? 15 : 14;
  return {
    particle: tex,
    elements: [
      {
        from: [5, 0, 6], to: [11, pressed ? 1.02 : 2, 10],
        faces: {
          down: f(tex, [5, 6, 11, 10], 'down'), up: f(tex, [5, 10, 11, 6]),
          north: f(tex, [5, v, 11, 16]), south: f(tex, [5, v, 11, 16]), west: f(tex, [6, v, 10, 16]), east: f(tex, [6, v, 10, 16]),
        },
      },
    ],
  };
}

function buttonInventoryModel(tex: string): ModelDef {
  return {
    particle: tex,
    elements: [
      {
        from: [5, 6, 6], to: [11, 10, 10],
        faces: {
          down: f(tex, [5, 6, 11, 10]), up: f(tex, [5, 6, 11, 10]),
          north: f(tex, [5, 12, 11, 16]), south: f(tex, [5, 12, 11, 16]), west: f(tex, [6, 12, 10, 16]), east: f(tex, [6, 12, 10, 16]),
        },
      },
    ],
  };
}

const BUTTON_SHAPES = attachedShapes(bx(5, 0, 6, 11, 2, 10), bx(6, 0, 5, 10, 2, 11), bx(5, 6, 14, 11, 10, 16), bx(5, 14, 6, 11, 16, 10), bx(6, 14, 5, 10, 16, 11));
const BUTTON_PRESSED_SHAPES = attachedShapes(bx(5, 0, 6, 11, 1, 10), bx(6, 0, 5, 10, 1, 11), bx(5, 6, 15, 11, 10, 16), bx(5, 15, 6, 11, 16, 10), bx(6, 15, 5, 10, 16, 11));

function registerButton(name: string, tex: string, sound: string, tool: 'axe' | 'pickaxe'): void {
  const up = buttonModel(tex, false), pressed = buttonModel(tex, true);
  registerBlock(name, {
    props: [FACE, P.facingH, P.powered], defaults: { face: 'wall', facing: 'north' },
    hardness: 0.5, sound, tool, collision: 'none', opaque: false, aoCaster: false, opacity: 0,
    outline: (s) => [(s.get('powered') ? BUTTON_PRESSED_SHAPES : BUTTON_SHAPES).get(`${s.get('face')},${s.get('facing')}`)!],
    model: (s) => {
      const [x, y] = ROT[`${s.get('face')},${s.get('facing')}`];
      return { model: s.get('powered') ? pressed : up, x, y, uvlock: s.get('face') === 'wall' };
    },
    itemModel: buttonInventoryModel(tex),
  });
}

// ---------------------------------------------------------------------------
// Pressure plates (vanilla PressurePlateBlock / WeightedPressurePlateBlock, block/pressure_plate_{up,down})

function plateModel(tex: string, down: boolean): ModelDef {
  const v = down ? 15.5 : 15;
  return {
    particle: tex,
    elements: [
      {
        from: [1, 0, 1], to: [15, down ? 0.5 : 1, 15],
        faces: {
          down: f(tex, [1, 1, 15, 15], 'down'), up: f(tex, [1, 1, 15, 15]),
          north: f(tex, [1, v, 15, 16]), south: f(tex, [1, v, 15, 16]), west: f(tex, [1, v, 15, 16]), east: f(tex, [1, v, 15, 16]),
        },
      },
    ],
  };
}

const PLATE = bx(1, 0, 1, 15, 1, 15), PLATE_PRESSED = bx(1, 0, 1, 15, 0.5, 15);
/** vanilla WeightedPressurePlateBlock.POWER */
export const POWER = intProp('power', 0, 15);

function registerPlate(name: string, tex: string, sound: string, tool: 'axe' | 'pickaxe', weighted: boolean): void {
  const up = plateModel(tex, false), down = plateModel(tex, true);
  const pressed = (s: StateView) => (weighted ? (s.get('power') as number) > 0 : s.get('powered') === true);
  registerBlock(name, {
    props: [weighted ? POWER : P.powered],
    hardness: 0.5, sound, tool, requiresTool: tool === 'pickaxe', collision: 'none', opaque: false, aoCaster: false, opacity: 0,
    outline: (s) => [pressed(s) ? PLATE_PRESSED : PLATE],
    model: (s) => ({ model: pressed(s) ? down : up }),
  });
}

export function registerRedstoneBlocks(): void {
  const on = leverModel(true), off = leverModel(false);
  const leverShapes = attachedShapes(bx(5, 0, 4, 11, 6, 12), bx(4, 0, 5, 12, 6, 11), bx(5, 4, 10, 11, 12, 16), bx(5, 10, 4, 11, 16, 12), bx(4, 10, 5, 12, 16, 11));
  registerBlock('lever', {
    props: [FACE, P.facingH, P.powered], defaults: { face: 'wall', facing: 'north' },
    hardness: 0.5, sound: 'stone', collision: 'none', opaque: false, aoCaster: false, opacity: 0,
    outline: (s) => [leverShapes.get(`${s.get('face')},${s.get('facing')}`)!],
    model: (s) => {
      const [x, y] = ROT[`${s.get('face')},${s.get('facing')}`];
      // (vanilla blockstates/lever.json: on the ceiling the two models swap, so up still means on)
      const lit = (s.get('powered') as boolean) !== (s.get('face') === 'ceiling');
      return { model: lit ? on : off, x, y };
    },
  });

  registerButton('stone_button', 'stone', 'stone', 'pickaxe');
  registerButton('polished_blackstone_button', 'polished_blackstone', 'stone', 'pickaxe');
  for (const w of BUTTON_WOODS) registerButton(`${w}_button`, `${w}_planks`, w === 'cherry' ? 'cherry_wood' : w === 'crimson' || w === 'warped' ? 'nether_wood' : 'wood', 'axe');

  registerPlate('stone_pressure_plate', 'stone', 'stone', 'pickaxe', false);
  registerPlate('polished_blackstone_pressure_plate', 'polished_blackstone', 'stone', 'pickaxe', false);
  for (const w of BUTTON_WOODS) registerPlate(`${w}_pressure_plate`, `${w}_planks`, w === 'cherry' ? 'cherry_wood' : w === 'crimson' || w === 'warped' ? 'nether_wood' : 'wood', 'axe', false);
  registerPlate('light_weighted_pressure_plate', 'gold_block', 'metal', 'pickaxe', true);
  registerPlate('heavy_weighted_pressure_plate', 'iron_block', 'metal', 'pickaxe', true);

  // Redstone lamp (vanilla RedstoneLampBlock)
  const lampOff = cubeAll('redstone_lamp'), lampOn = cubeAll('redstone_lamp_on');
  registerBlock('redstone_lamp', {
    props: [P.lit], hardness: 0.3, sound: 'glass', light: (s) => (s.get('lit') ? 15 : 0),
    model: (s) => ({ model: s.get('lit') ? lampOn : lampOff }),
  });
}
