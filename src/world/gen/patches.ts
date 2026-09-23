// Vegetation patches (vanilla VegetationPatchFeature and WaterloggedVegetationPatchFeature),
// worked out one column at a time so that the same code runs in three places:
// in the generating chunk, later in a neighbouring chunk for the columns of a patch
// that spill over its border (sent along as pending column programs and run against
// that chunk's real blocks once it exists), and in the live world for bone meal on moss.

import { BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, FACE_OCC, COLLISION, F_AIR, F_WATER, F_WATERLOGGED, getBlock } from '../block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST } from '../dir';

/** block access for the column programs; get returns -1 where the blocks aren't known */
export interface BlockAccess {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, state: number): void;
  /** a guess at whether an unknown block is solid rock (the noise terrain), for the pool edge check */
  solidGuess?(x: number, y: number, z: number): boolean;
}

/** vanilla BlockTags.MOSS_REPLACEABLE and LUSH_GROUND_REPLACEABLE */
export const REPLACE_MOSS = 0, REPLACE_LUSH_GROUND = 1;

/** one column of a vegetation patch, with everything random already rolled */
export interface PatchColumn {
  x: number;
  z: number;
  /** the patch origin's height */
  y: number;
  /** the patch lines the ceiling (vanilla CaveSurface.CEILING) rather than the floor */
  ceiling: boolean;
  /** how far up or down from the origin the surface may be (vanilla verticalRange) */
  range: number;
  /** how many ground blocks deep (vanilla depth, plus the extra bottom block) */
  depth: number;
  ground: number;
  replace: number;
  /** the surface block turns into water where the patch encloses it (the waterlogged patch) */
  pool: boolean;
  /** the plant for this column (VEG_* program), when its vegetation chance came up */
  veg: number[] | null;
}

/** vegetation programs: [VEG_BLOCK, state] places one plant (both halves of a tall one) where it can survive;
 * [VEG_COLUMN, dir, allowWater, ...states] grows a vanilla BlockColumnFeature, the tip last (the start is cut first when it doesn't fit) */
export const VEG_BLOCK = 1, VEG_COLUMN = 2;

let TAGS: { moss: Uint8Array; lush: Uint8Array; placeable: Uint8Array; dirt: Uint8Array } | null = null;

function tags() {
  if (TAGS) return TAGS;
  const set = (names: string[]) => {
    const a = new Uint8Array(BLOCKS.length);
    for (const n of names) {
      const b = BLOCK_BY_NAME.get(n);
      if (b) a[b.id] = 1;
    }
    return a;
  };
  const DIRT = ['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots'];
  const BASE_STONE = ['stone', 'granite', 'diorite', 'andesite', 'tuff', 'deepslate'];
  const MOSS = [...BASE_STONE, 'cave_vines', 'cave_vines_plant', ...DIRT];
  TAGS = { moss: set(MOSS), lush: set([...MOSS, 'clay', 'gravel', 'sand']), placeable: set(['clay', 'moss_block']), dirt: set([...DIRT, 'farmland']) };
  return TAGS;
}

const blk = (st: number) => BLOCKS[STATE_BLOCK[st]];
const isAir = (st: number) => st >= 0 && (FLAGS[st] & F_AIR) !== 0;
const sturdy = (st: number, face: number) => st >= 0 && ((FACE_OCC[st] >> face) & 1) === 1;

/** vanilla BlockBehaviour.isSolid (the legacy "solid" flag: a collision shape that fills most of the block) */
export function isSolidBlock(st: number): boolean {
  if (st < 0) return false;
  const c = COLLISION[st];
  if (!c || !c.length) return false;
  let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
  for (const b of c) {
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]);
    x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]);
  }
  return (x1 - x0 + y1 - y0 + z1 - z0) / 3 >= 0.7291666666666666 || y1 - y0 >= 1;
}

function isWaterBlock(st: number): boolean {
  return st >= 0 && blk(st).name === 'water';
}

/** vanilla canSurvive for the plants that patches, columns and root systems put down */
export function canSurviveGen(acc: BlockAccess, x: number, y: number, z: number, st: number): boolean {
  const n = blk(st).name;
  const below = acc.get(x, y - 1, z);
  if (below < 0) return false;
  const t = tags();
  const soil = t.dirt[STATE_BLOCK[below]] === 1;
  switch (n) {
    case 'azalea': case 'flowering_azalea': return soil || blk(below).name === 'clay';
    case 'moss_carpet': return !isAir(below);
    case 'short_grass': case 'tall_grass': return soil;
    case 'small_dripleaf': {
      if (t.placeable[STATE_BLOCK[below]]) return true;
      const here = acc.get(x, y, z);
      return soil && here >= 0 && isWaterBlock(here) && blk(here).get(here, 'level') === 0;
    }
    case 'spore_blossom': {
      const here = acc.get(x, y, z);
      return sturdy(acc.get(x, y + 1, z), DOWN) && !(here >= 0 && FLAGS[here] & F_WATER);
    }
    case 'hanging_roots': return sturdy(acc.get(x, y + 1, z), DOWN);
  }
  return true;
}

/** vanilla SimpleBlockFeature: a plant where it can survive, both halves of a tall one (DoublePlantBlock.placeAt) */
export function placeSimpleBlock(acc: BlockAccess, x: number, y: number, z: number, st: number): boolean {
  if (!canSurviveGen(acc, x, y, z, st)) return false;
  const b = blk(st);
  if (b.propIndex('half') >= 0) {
    if (!isAir(acc.get(x, y + 1, z))) return false;
    const here = acc.get(x, y, z);
    let lower = b.with(st, 'half', 'lower'), upper = b.with(st, 'half', 'upper');
    if (b.propIndex('waterlogged') >= 0) {
      lower = b.with(lower, 'waterlogged', isWaterBlock(here) && blk(here).get(here, 'level') === 0);
      upper = b.with(upper, 'waterlogged', false);
    }
    acc.set(x, y, z, lower);
    acc.set(x, y + 1, z, upper);
    return true;
  }
  acc.set(x, y, z, st);
  return true;
}

/** vanilla BlockColumnFeature: the column fits where every block past the start is free (air, or water too), and loses its first blocks when it doesn't */
export function placeColumn(acc: BlockAccess, x: number, y: number, z: number, dir: number, allowWater: boolean, states: number[]): boolean {
  const n = states.length;
  if (!n) return false;
  let fit = n;
  for (let l = 0; l < n; l++) {
    const s = acc.get(x, y + dir * (l + 1), z);
    if (!(isAir(s) || (allowWater && isWaterBlock(s)))) {
      fit = l;
      break;
    }
  }
  for (let i = n - fit, yy = y; i < n; i++, yy += dir) acc.set(x, yy, z, states[i]);
  return true;
}

export function runVegetation(acc: BlockAccess, x: number, y: number, z: number, veg: number[]): boolean {
  if (veg[0] === VEG_BLOCK) return placeSimpleBlock(acc, x, y, z, veg[1]);
  if (veg[0] === VEG_COLUMN) return placeColumn(acc, x, y, z, veg[1], veg[2] === 1, veg.slice(3));
  return false;
}

/** vanilla VegetationPatchFeature.placeGround: down (or up) from the surface block, replacing what the tag allows */
function placeGround(acc: BlockAccess, c: PatchColumn, gy: number, s: number): boolean {
  const t = c.replace === REPLACE_MOSS ? tags().moss : tags().lush;
  const groundBlock = STATE_BLOCK[c.ground];
  let y = gy;
  for (let i = 0; i < c.depth; i++) {
    const cur = acc.get(c.x, y, c.z);
    if (cur < 0) return i !== 0;
    // (a block that is already the ground uses up a layer without moving on, as vanilla does)
    if (STATE_BLOCK[cur] !== groundBlock) {
      if (!t[STATE_BLOCK[cur]]) return i !== 0;
      acc.set(c.x, y, c.z, c.ground);
      y += s;
    }
  }
  return true;
}

const SIDES: [number, number, number, number][] = [[0, 0, -1, SOUTH], [1, 0, 0, WEST], [0, 0, 1, NORTH], [-1, 0, 0, EAST], [0, -1, 0, UP]];

/** vanilla WaterloggedVegetationPatchFeature.isExposed: a side or the bottom without a sturdy face against the pool
 * (water next to it counts as enclosed: it is the pool's own, or harmless) */
function exposed(acc: BlockAccess, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz, face] of SIDES) {
    const st = acc.get(x + dx, y + dy, z + dz);
    if (st < 0) {
      if (acc.solidGuess?.(x + dx, y + dy, z + dz)) continue;
      return true;
    }
    if (sturdy(st, face) || isWaterBlock(st)) continue;
    return true;
  }
  return false;
}

/** one column of vanilla VegetationPatchFeature.placeGroundPatch, then its plant */
export function runPatchColumn(acc: BlockAccess, c: PatchColumn): void {
  // towards the surface the patch lines: down for a floor, up for a ceiling
  const s = c.ceiling ? 1 : -1;
  let y = c.y;
  for (let k = 0; isAir(acc.get(c.x, y, c.z)) && k < c.range; k++) y += s;
  for (let i = 0; !isAir(acc.get(c.x, y, c.z)) && acc.get(c.x, y, c.z) >= 0 && i < c.range; i++) y -= s;
  const gy = y + s;
  if (!isAir(acc.get(c.x, y, c.z)) || !sturdy(acc.get(c.x, gy, c.z), c.ceiling ? DOWN : UP)) return;
  if (!placeGround(acc, c, gy, s)) return;
  if (c.pool) {
    if (exposed(acc, c.x, gy, c.z)) return;
    acc.set(c.x, gy, c.z, WATER());
    if (!c.veg || !runVegetation(acc, c.x, gy, c.z, c.veg)) return;
    const st = acc.get(c.x, gy, c.z);
    const b = blk(st);
    if (b.propIndex('waterlogged') >= 0 && !(FLAGS[st] & F_WATERLOGGED)) acc.set(c.x, gy, c.z, b.with(st, 'waterlogged', true));
    return;
  }
  if (c.veg) runVegetation(acc, c.x, y, c.z, c.veg);
}

let WATER_STATE = -1;
function WATER(): number {
  if (WATER_STATE < 0) WATER_STATE = getBlock('water').defaultState;
  return WATER_STATE;
}
