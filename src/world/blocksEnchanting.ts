// Enchanting and repair blocks: the enchanting table (vanilla
// EnchantingTableBlock), anvils in three damage states (AnvilBlock) and the
// grindstone (GrindstoneBlock). Models mirror block/enchanting_table,
// block/template_anvil and block/grindstone; shapes are vanilla's VoxelShapes.

import { registerBlock, P, Box, enumProp, faceMaskFromBoxes, BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, F_AIR, F_REPLACEABLE } from './block';
import type { ModelDef, FaceDef } from './models';
import type { DirName } from './dir';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function f(tex: string, uv: [number, number, number, number], cull?: DirName, rot?: 0 | 90 | 180 | 270): FaceDef {
  return { tex, uv, cull, rot };
}

/**
 * a box turned like a blockstate variant (x first, then y; vanilla BlockModelRotation), in block units:
 * x=90 takes the floor to the south side, y=90 takes north to east
 */
export function rotateBox(b: Box, xRot: number, yRot: number): Box {
  const pt = (x: number, y: number, z: number): [number, number, number] => {
    for (let i = 0; i < ((xRot / 90) & 3); i++) [y, z] = [z, 1 - y];
    for (let i = 0; i < ((yRot / 90) & 3); i++) [x, z] = [1 - z, x];
    return [x, y, z];
  };
  const a = pt(b[0], b[1], b[2]), c = pt(b[3], b[4], b[5]);
  return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
}

/**
 * vanilla EnchantingTableBlock.BOOKSHELF_OFFSETS: the ring two blocks out from the table, at its height and one
 * above (BlockPos.betweenClosed order: x fastest, then y, then z)
 */
export const BOOKSHELF_OFFSETS: [number, number, number][] = [];
for (let z = -2; z <= 2; z++) for (let y = 0; y <= 1; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) === 2 || Math.abs(z) === 2) BOOKSHELF_OFFSETS.push([x, y, z]);

type GetState = (x: number, y: number, z: number) => number;

/**
 * vanilla EnchantingTableBlock.isValidBookShelf: a bookshelf (#enchantment_power_provider) with the block halfway
 * back to the table free (#enchantment_power_transmitter = #replaceable: air, water, grass...)
 */
export function isValidBookshelf(get: GetState, x: number, y: number, z: number, ox: number, oy: number, oz: number): boolean {
  if (BLOCKS[STATE_BLOCK[get(x + ox, y + oy, z + oz)]].name !== 'bookshelf') return false;
  const between = get(x + ((ox / 2) | 0), y + oy, z + ((oz / 2) | 0));
  return (FLAGS[between] & (F_AIR | F_REPLACEABLE)) !== 0;
}

/** bookshelves powering the table at (x, y, z) (vanilla EnchantmentMenu.slotsChanged; the cost formula caps it at 15) */
export function bookshelfPower(get: GetState, x: number, y: number, z: number): number {
  let n = 0;
  for (const [ox, oy, oz] of BOOKSHELF_OFFSETS) if (isValidBookshelf(get, x, y, z, ox, oy, oz)) n++;
  return n;
}

/** anvil names from undamaged to most damaged (vanilla AnvilBlock.damage) */
export const ANVILS = ['anvil', 'chipped_anvil', 'damaged_anvil'];

/** vanilla AnvilBlock.damage: the next damage state facing the same way, or null once a damaged anvil breaks */
export function damagedAnvil(st: number): number | null {
  const b = BLOCKS[STATE_BLOCK[st]];
  const i = ANVILS.indexOf(b.name);
  if (i < 0 || i === ANVILS.length - 1) return null;
  return BLOCK_BY_NAME.get(ANVILS[i + 1])!.state({ facing: b.get(st, 'facing') });
}

export function registerEnchantingBlocks(): void {
  // -------------------------------------------------------------------------
  // Enchanting table: 12 px tall, light 7, obsidian-strong
  {
    const table = bx(0, 0, 0, 16, 12, 16);
    const model: ModelDef = {
      particle: 'enchanting_table_bottom',
      elements: [
        {
          from: [0, 0, 0], to: [16, 12, 16],
          faces: {
            down: f('enchanting_table_bottom', [0, 0, 16, 16], 'down'),
            up: f('enchanting_table_top', [0, 0, 16, 16]),
            north: f('enchanting_table_side', [0, 4, 16, 16], 'north'),
            south: f('enchanting_table_side', [0, 4, 16, 16], 'south'),
            west: f('enchanting_table_side', [0, 4, 16, 16], 'west'),
            east: f('enchanting_table_side', [0, 4, 16, 16], 'east'),
          },
        },
      ],
    };
    registerBlock('enchanting_table', {
      hardness: 5, resistance: 1200, sound: 'stone', tool: 'pickaxe', requiresTool: true, light: 7, mapColor: 0x993333,
      opaque: false, aoCaster: false, opacity: 0, collision: [table], faceOcclusion: faceMaskFromBoxes([table]),
      model: () => ({ model }),
    });
  }

  // -------------------------------------------------------------------------
  // Anvils (vanilla block/template_anvil, the long top along the model's z)
  {
    const BASE = bx(2, 0, 2, 14, 4, 14);
    const X_SHAPE = [BASE, bx(3, 4, 4, 13, 5, 12), bx(4, 5, 6, 12, 10, 10), bx(0, 10, 3, 16, 16, 13)];
    const Z_SHAPE = [BASE, bx(4, 4, 3, 12, 5, 13), bx(6, 5, 4, 10, 10, 12), bx(3, 10, 0, 13, 16, 16)];
    const anvilModel = (top: string): ModelDef => ({
      particle: 'anvil',
      elements: [
        {
          from: [2, 0, 2], to: [14, 4, 14],
          faces: {
            down: f('anvil', [2, 2, 14, 14], 'down', 180), up: f('anvil', [2, 2, 14, 14], undefined, 180),
            north: f('anvil', [2, 12, 14, 16]), south: f('anvil', [2, 12, 14, 16]),
            west: f('anvil', [0, 2, 4, 14], undefined, 90), east: f('anvil', [4, 2, 0, 14], undefined, 270),
          },
        },
        {
          from: [4, 4, 3], to: [12, 5, 13],
          faces: {
            up: f('anvil', [4, 3, 12, 13], undefined, 180),
            north: f('anvil', [4, 11, 12, 12]), south: f('anvil', [4, 11, 12, 12]),
            west: f('anvil', [11, 3, 12, 13], undefined, 90), east: f('anvil', [12, 3, 11, 13], undefined, 270),
          },
        },
        {
          from: [6, 5, 4], to: [10, 10, 12],
          faces: {
            north: f('anvil', [6, 6, 10, 11]), south: f('anvil', [6, 6, 10, 11]),
            west: f('anvil', [5, 4, 10, 12], undefined, 90), east: f('anvil', [10, 4, 5, 12], undefined, 270),
          },
        },
        {
          from: [3, 10, 0], to: [13, 16, 16],
          faces: {
            down: f('anvil', [3, 0, 13, 16], undefined, 180), up: f(top, [3, 0, 13, 16], 'up', 180),
            north: f('anvil', [3, 0, 13, 6], 'north'), south: f('anvil', [3, 0, 13, 6], 'south'),
            west: f('anvil', [10, 0, 16, 16], undefined, 90), east: f('anvil', [16, 0, 10, 16], undefined, 270),
          },
        },
      ],
    });
    // vanilla blockstates/anvil.json
    const Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };
    for (const name of ANVILS) {
      const model = anvilModel(`${name}_top`);
      registerBlock(name, {
        props: [P.facingH], defaults: { facing: 'north' },
        hardness: 5, resistance: 1200, sound: 'anvil', tool: 'pickaxe', requiresTool: true, mapColor: 0xa7a7a7,
        opaque: false, aoCaster: false, opacity: 0,
        collision: (s) => {
          const d = s.get('facing');
          return d === 'east' || d === 'west' ? X_SHAPE : Z_SHAPE;
        },
        model: (s) => ({ model, y: Y[s.get('facing') as string] }),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Grindstone: floor / wall / ceiling (vanilla FaceAttachedHorizontalDirectionalBlock + block/grindstone)
  {
    const LEG = 'dark_oak_log', PIV = 'grindstone_pivot', RND = 'grindstone_round', SIDE = 'grindstone_side';
    const model: ModelDef = {
      particle: SIDE,
      elements: [
        {
          from: [12, 0, 6], to: [14, 7, 10],
          faces: {
            north: f(LEG, [2, 9, 4, 16]), east: f(LEG, [10, 9, 6, 16]), south: f(LEG, [12, 9, 14, 16]), west: f(LEG, [6, 9, 10, 16]),
            down: f(LEG, [12, 6, 14, 10], 'down'),
          },
        },
        {
          from: [2, 0, 6], to: [4, 7, 10],
          faces: {
            north: f(LEG, [12, 9, 14, 16]), east: f(LEG, [6, 9, 10, 16]), south: f(LEG, [2, 9, 4, 16]), west: f(LEG, [10, 9, 6, 16]),
            down: f(LEG, [2, 6, 4, 10], 'down'),
          },
        },
        {
          from: [12, 7, 5], to: [14, 13, 11],
          faces: {
            north: f(PIV, [6, 0, 8, 6]), east: f(PIV, [0, 0, 6, 6]), south: f(PIV, [6, 0, 8, 6]),
            up: f(PIV, [6, 0, 8, 6]), down: f(PIV, [6, 0, 8, 6]),
          },
        },
        {
          from: [2, 7, 5], to: [4, 13, 11],
          faces: {
            north: f(PIV, [8, 0, 6, 6]), west: f(PIV, [6, 0, 0, 6]), south: f(PIV, [8, 0, 6, 6]),
            up: f(PIV, [8, 0, 6, 6]), down: f(PIV, [8, 0, 6, 6]),
          },
        },
        {
          from: [4, 4, 2], to: [12, 16, 14],
          faces: {
            north: f(RND, [0, 0, 8, 12]), east: f(SIDE, [0, 0, 12, 12]), south: f(RND, [0, 0, 8, 12]), west: f(SIDE, [0, 0, 12, 12]),
            up: f(RND, [0, 0, 8, 12], 'up'), down: f(RND, [0, 0, 8, 12]),
          },
        },
      ],
    };
    // vanilla GrindstoneBlock FLOOR_NORTH_SOUTH_GRINDSTONE, turned for the other attachments
    const FLOOR: Box[] = [bx(2, 0, 6, 4, 7, 10), bx(12, 0, 6, 14, 7, 10), bx(2, 7, 5, 4, 13, 11), bx(12, 7, 5, 14, 13, 11), bx(4, 4, 2, 12, 16, 14)];
    // vanilla blockstates/grindstone.json (the lever pattern)
    const ROT: Record<string, [number, number]> = {
      'floor,north': [0, 0], 'floor,east': [0, 90], 'floor,south': [0, 180], 'floor,west': [0, 270],
      'wall,north': [90, 0], 'wall,east': [90, 90], 'wall,south': [90, 180], 'wall,west': [90, 270],
      'ceiling,north': [180, 180], 'ceiling,east': [180, 270], 'ceiling,south': [180, 0], 'ceiling,west': [180, 90],
    };
    const shapes = new Map<string, Box[]>();
    for (const [k, [xr, yr]] of Object.entries(ROT)) shapes.set(k, FLOOR.map((b) => rotateBox(b, xr, yr)));
    registerBlock('grindstone', {
      props: [enumProp('face', ['floor', 'wall', 'ceiling']), P.facingH], defaults: { face: 'floor', facing: 'north' },
      hardness: 2, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, mapColor: 0xa7a7a7,
      opaque: false, aoCaster: false, opacity: 0,
      collision: (s) => shapes.get(`${s.get('face')},${s.get('facing')}`)!,
      model: (s) => {
        const [x, y] = ROT[`${s.get('face')},${s.get('facing')}`];
        return { model, x, y };
      },
    });
  }
}
