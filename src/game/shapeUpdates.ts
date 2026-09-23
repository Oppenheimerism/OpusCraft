// Neighbour-dependent block states (vanilla Block.updateShape and the
// connection logic of fences, panes, walls, stairs, doors, beds, stems...).
// updateShape recomputes a state from its current surroundings; 0 means the
// block can no longer exist and must be removed.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, COLLISION, F_AIR, F_OPAQUE, Block } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST } from '../world/dir';
import type { World } from '../world/world';
import { fireCanSurvive, fireStateAt } from './fire';
import { MULTIFACE, multifaceSupported, dripstoneSupported, dripstoneThickness } from './blockRules';
import { portalStillStands } from './portal';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

const HDIRS: [string, number, number, number][] = [
  ['north', 0, -1, NORTH],
  ['east', 1, 0, EAST],
  ['south', 0, 1, SOUTH],
  ['west', -1, 0, WEST],
];
const OPP: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const DIR_OF: Record<string, number> = { north: NORTH, south: SOUTH, west: WEST, east: EAST };

function sturdy(st: number, face: number): boolean {
  return ((FACE_OCC[st] >> face) & 1) === 1;
}

const WOOD_FENCE = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped)_fence$/;

/** vanilla isExceptionForConnection */
function exception(n: string): boolean {
  return n.endsWith('_leaves') || n === 'barrier' || n === 'carved_pumpkin' || n === 'jack_o_lantern' || n === 'melon' || n === 'pumpkin' || n.endsWith('shulker_box');
}

function fenceConnects(self: Block, st: number, dirName: string): boolean {
  const b = blk(st);
  const n = b.name;
  if (n === self.name) return true;
  if (WOOD_FENCE.test(self.name) && WOOD_FENCE.test(n)) return true;
  if (n.endsWith('_fence_gate')) {
    const f = b.get<string>(st, 'facing');
    const axisGate = f === 'north' || f === 'south' ? 'z' : 'x';
    const axisDir = dirName === 'north' || dirName === 'south' ? 'z' : 'x';
    return axisGate !== axisDir;
  }
  return !exception(n) && sturdy(st, DIR_OF[OPP[dirName]]);
}

function paneConnects(st: number, dirName: string): boolean {
  const n = blk(st).name;
  if (n.endsWith('_pane') || n === 'iron_bars' || n.endsWith('_wall')) return true;
  return !exception(n) && sturdy(st, DIR_OF[OPP[dirName]]);
}

function wallConnects(st: number, dirName: string): boolean {
  const b = blk(st);
  const n = b.name;
  if (n.endsWith('_wall') || n.endsWith('_pane') || n === 'iron_bars') return true;
  if (n.endsWith('_fence_gate')) {
    const f = b.get<string>(st, 'facing');
    const axisGate = f === 'north' || f === 'south' ? 'z' : 'x';
    const axisDir = dirName === 'north' || dirName === 'south' ? 'z' : 'x';
    return axisGate !== axisDir;
  }
  return !exception(n) && sturdy(st, DIR_OF[OPP[dirName]]);
}

// ---------------------------------------------------------------------------
// stairs (vanilla StairBlock.getStairsShape)

const LEFT_OF: Record<string, string> = { north: 'west', west: 'south', south: 'east', east: 'north' };
const RIGHT_OF: Record<string, string> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const DXZ: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

function isStairs(st: number): boolean {
  return blk(st).name.endsWith('_stairs');
}

function stairsShape(world: World, x: number, y: number, z: number, st: number): string {
  const b = blk(st);
  const facing = b.get<string>(st, 'facing');
  const half = b.get<string>(st, 'half');
  const [fx, fz] = DXZ[facing];
  const behind = world.getState(x + fx, y, z + fz);
  if (isStairs(behind) && blk(behind).get(behind, 'half') === half) {
    const f2 = blk(behind).get<string>(behind, 'facing');
    if (f2 !== facing && f2 !== OPP[facing] && canTakeShape(world, x, y, z, st, OPP[f2])) {
      return f2 === LEFT_OF[facing] ? 'outer_left' : 'outer_right';
    }
  }
  const front = world.getState(x - fx, y, z - fz);
  if (isStairs(front) && blk(front).get(front, 'half') === half) {
    const f3 = blk(front).get<string>(front, 'facing');
    if (f3 !== facing && f3 !== OPP[facing] && canTakeShape(world, x, y, z, st, f3)) {
      return f3 === LEFT_OF[facing] ? 'inner_left' : 'inner_right';
    }
  }
  return 'straight';
}

function canTakeShape(world: World, x: number, y: number, z: number, st: number, dir: string): boolean {
  const [dx, dz] = DXZ[dir];
  const o = world.getState(x + dx, y, z + dz);
  const b = blk(st);
  return !isStairs(o) || blk(o).get(o, 'facing') !== b.get(st, 'facing') || blk(o).get(o, 'half') !== b.get(st, 'half');
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// walls (vanilla WallBlock: POST_TEST / *_TEST shapes against the block above)

type Rect = [number, number, number, number];
const WALL_TEST: Record<string, Rect> = {
  north: [7, 0, 9, 9],
  south: [7, 7, 9, 16],
  west: [0, 7, 9, 9],
  east: [7, 7, 16, 9],
};
const POST_TEST: Rect = [7, 7, 9, 9];
/** vanilla BlockTags.WALL_POST_OVERRIDE */
const POST_OVERRIDE = /^(torch|soul_torch|redstone_torch|.*_sign|.*_banner|.*_pressure_plate)$/;

/** the part of a block's collision shape resting on its bottom face (x0, z0, x1, z1 in pixels) */
function downFace(st: number): Rect[] {
  const boxes = COLLISION[st];
  if (!boxes) return [];
  return boxes.filter((b) => b[1] <= 0).map((b) => [b[0] * 16, b[2] * 16, b[3] * 16, b[5] * 16] as Rect);
}

/** vanilla WallBlock.isCovered: the rectangle is entirely inside the face shape */
function covered(face: Rect[], r: Rect): boolean {
  if (!face.length) return false;
  for (let px = r[0] + 0.25; px < r[2]; px += 0.5)
    for (let pz = r[1] + 0.25; pz < r[3]; pz += 0.5) {
      if (!face.some((f) => px >= f[0] && px <= f[2] && pz >= f[1] && pz <= f[3])) return false;
    }
  return true;
}

/** vanilla WallBlock.shouldRaisePost */
function raisePost(c: Record<string, string>, above: number, face: Rect[]): boolean {
  const ab = blk(above);
  if (ab.name.endsWith('_wall') && ab.get(above, 'up')) return true;
  const n = c.north === 'none', s = c.south === 'none', e = c.east === 'none', w = c.west === 'none';
  if ((n && s && w && e) || n !== s || w !== e) return true;
  if ((c.north === 'tall' && c.south === 'tall') || (c.east === 'tall' && c.west === 'tall')) return false;
  return POST_OVERRIDE.test(ab.name) || covered(face, POST_TEST);
}

/** Recompute a state from its neighbours; returns 0 if the block must break. */
export function updateShape(world: World, x: number, y: number, z: number, st: number): number {
  if (FLAGS[st] & F_AIR) return st;
  const b = blk(st);
  const n = b.name;
  if (n.endsWith('_stairs')) return b.with(st, 'shape', stairsShape(world, x, y, z, st));
  // vanilla NetherPortalBlock.updateShape: a portal whose frame was broken goes out
  if (n === 'nether_portal') return portalStillStands(world, x, y, z, st, world.dim.minY) ? st : 0;
  // vanilla MultifaceBlock.updateShape: faces that lost their support go; with none left the block goes
  if (n === 'glow_lichen') {
    let s = st, any = false;
    for (const [d] of MULTIFACE) {
      if (!b.get(s, d)) continue;
      if (multifaceSupported(world, x, y, z, d)) any = true;
      else s = b.with(s, d, false);
    }
    return any ? s : 0;
  }
  // vanilla PointedDripstoneBlock.updateShape: the thickness follows the pieces above and below
  // (losing its support is handled by the level: stalactites fall, stalagmites break)
  if (n === 'pointed_dripstone') {
    const dir = b.get(st, 'vertical_direction') as 'up' | 'down';
    if (!dripstoneSupported(world, x, y, z, dir)) return st;
    return b.with(st, 'thickness', dripstoneThickness(world, x, y, z, dir, b.get(st, 'thickness') === 'tip_merge'));
  }
  if (n.endsWith('_fence')) {
    let s = st;
    for (const [d, dx, dz] of HDIRS) s = b.with(s, d, fenceConnects(b, world.getState(x + dx, y, z + dz), d));
    return s;
  }
  if (n.endsWith('_pane') || n === 'iron_bars') {
    let s = st;
    for (const [d, dx, dz] of HDIRS) s = b.with(s, d, paneConnects(world.getState(x + dx, y, z + dz), d));
    return s;
  }
  if (n.endsWith('_wall')) {
    // vanilla WallBlock.updateShape: sides are tall where the block above covers them
    const above = world.getState(x, y + 1, z);
    const face = downFace(above);
    const conn: Record<string, string> = {};
    let s = st;
    for (const [d, dx, dz] of HDIRS) {
      const c = wallConnects(world.getState(x + dx, y, z + dz), d);
      conn[d] = c ? (covered(face, WALL_TEST[d]) ? 'tall' : 'low') : 'none';
      s = b.with(s, d, conn[d]);
    }
    return b.with(s, 'up', raisePost(conn, above, face));
  }
  if (n.endsWith('_fence_gate')) {
    const f = b.get<string>(st, 'facing');
    const sides = f === 'north' || f === 'south' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    const inWall = sides.some(([dx, dz]) => blk(world.getState(x + dx, y, z + dz)).name.endsWith('_wall'));
    return b.with(st, 'in_wall', inWall);
  }
  if (n.endsWith('_door')) {
    const half = b.get<string>(st, 'half');
    const oy = half === 'lower' ? y + 1 : y - 1;
    const other = world.getState(x, oy, z);
    if (blk(other) !== b || blk(other).get(other, 'half') === half) return 0;
    if (half === 'lower' && !sturdy(world.getState(x, y - 1, z), UP)) return 0;
    // vanilla DoorBlock.updateShape: each half takes the other's state (whichever half was just toggled)
    return b.with(other, 'half', half);
  }
  if (n.endsWith('_bed')) {
    const facing = b.get<string>(st, 'facing');
    const head = b.get(st, 'part') === 'head';
    const [dx, dz] = DXZ[head ? OPP[facing] : facing];
    const other = world.getState(x + dx, y, z + dz);
    if (blk(other) !== b || blk(other).get(other, 'part') === b.get(st, 'part')) return 0;
    return b.with(st, 'occupied', blk(other).get(other, 'occupied'));
  }
  if (n === 'grass_block' || n === 'podzol' || n === 'mycelium') {
    const an = blk(world.getState(x, y + 1, z)).name;
    return b.with(st, 'snowy', an === 'snow' || an === 'snow_block' || an === 'powder_snow');
  }
  if (n.startsWith('attached_') && n.endsWith('_stem')) {
    const fruit = n === 'attached_pumpkin_stem' ? 'pumpkin' : 'melon';
    const [dx, dz] = DXZ[b.get<string>(st, 'facing')];
    if (blk(world.getState(x + dx, y, z + dz)).name !== fruit) {
      const stem = BLOCKS.find((q) => q.name === `${fruit}_stem`)!;
      return stem.with(stem.defaultState, 'age', 7);
    }
    return st;
  }
  if (n === 'fire') return fireCanSurvive(world, x, y, z) ? fireStateAt(world, x, y, z, b.get<number>(st, 'age')) : 0;
  // vanilla GrowingPlantHeadBlock / GrowingPlantBodyBlock.updateShape: a head with more vine under it becomes
  // a piece of the plant, and a piece left at the bottom a head again (of any age), keeping its berries
  if (n === 'cave_vines' || n === 'cave_vines_plant') {
    const bn = blk(world.getState(x, y - 1, z)).name;
    const vine = bn === 'cave_vines' || bn === 'cave_vines_plant';
    if (n === 'cave_vines' && vine) return plantOf('cave_vines_plant').state({ berries: b.get(st, 'berries') });
    if (n === 'cave_vines_plant' && !vine) return plantOf('cave_vines').state({ age: Math.floor(Math.random() * 25), berries: b.get(st, 'berries') });
    return st;
  }
  // vanilla BigDripleafBlock.updateShape: another leaf on top turns this one into stem
  if (n === 'big_dripleaf' && blk(world.getState(x, y + 1, z)).name === 'big_dripleaf') {
    return plantOf('big_dripleaf_stem').state({ facing: b.get(st, 'facing'), waterlogged: b.get(st, 'waterlogged') });
  }
  return st;
}

function plantOf(name: string): Block {
  return BLOCKS.find((q) => q.name === name)!;
}

/** blocks whose state depends on neighbours (skip the work for everything else) */
export function hasShapeUpdates(st: number): boolean {
  const n = blk(st).name;
  return n === 'glow_lichen' || n === 'pointed_dripstone' || n === 'cave_vines' || n === 'cave_vines_plant' || n === 'big_dripleaf' || n.endsWith('_stairs') || n.endsWith('_fence') || n.endsWith('_pane') || n === 'iron_bars' || n.endsWith('_wall') || n.endsWith('_fence_gate') || n.endsWith('_door') || n.endsWith('_bed') || n === 'grass_block' || n === 'podzol' || n === 'mycelium' || n.startsWith('attached_') || n === 'fire' || n === 'nether_portal';
}

export { F_OPAQUE };
