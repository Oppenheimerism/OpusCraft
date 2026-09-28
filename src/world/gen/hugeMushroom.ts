// Huge mushrooms (remaining mobs: the mooshroom): vanilla AbstractHugeMushroomFeature with HugeBrownMushroomFeature
// and HugeRedMushroomFeature, as TreeFeatures.HUGE_BROWN_MUSHROOM and HUGE_RED_MUSHROOM configure them. A stem 4 to 6
// blocks tall (one time in 12 twice that); a brown one wears a flat cap 7 across (its corners cut off) on top of it, a
// red one a dome 5 across hanging three blocks down round the top of its stem, with a 3 by 3 roof. The cap's blocks
// show their skin outward (and up) and their inside elsewhere; the stem's top and bottom are its inside. It needs
// dirt, mycelium, podzol or nylium under it and room to grow (the brown one's cap all round the upper stem; the red
// one only its stem's column), and goes only where nothing solid is in the way. The same growth serves the world's
// generation (the mushroom fields, one to a chunk; the dark forest, in a tree's place now and then) and bone meal on a
// small mushroom (game/mushrooms.ts).

import { Rand, hash2 } from '../../core/rng';
import { FLAGS, F_AIR, F_LEAVES, F_OPAQUE, BLOCKS, STATE_BLOCK, getBlock } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import { W_LOG } from './context';
import { B } from './biomes';

export type HugeMushroomKind = 'brown' | 'red';

/** what a huge mushroom grows in: the world as generation or the loaded level has it */
export interface MushroomAccess {
  /** the block at (x, y, z); -1 where it isn't known yet (generation: a chunk not made yet) */
  get(x: number, y: number, z: number): number;
  /** puts `st` there if what's there isn't solid (vanilla: where !isSolidRender); where unknown, the caller's rule */
  set(x: number, y: number, z: number, st: number): void;
}

/** vanilla BlockTags.DIRT and BlockTags.MUSHROOM_GROW_BLOCK: what a huge mushroom grows from */
const GROWS_ON = new Set(['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots', 'crimson_nylium', 'warped_nylium']);

const nameOf = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;
/** vanilla isSolidRender (a full opaque cube): what the mushroom doesn't grow through */
export const isSolid = (st: number): boolean => st >= 0 && (FLAGS[st] & F_OPAQUE) !== 0;

/** vanilla getTreeHeight: 4 to 6, one time in 12 doubled */
function treeHeight(r: Rand): number {
  let i = r.nextInt(3) + 4;
  if (r.nextInt(12) === 0) i *= 2;
  return i;
}

/** vanilla getTreeRadiusForHeight as isValidPosition asks it (brown: 3 from the fourth block up; red: none, a quirk) */
function checkRadius(kind: HugeMushroomKind, dy: number): number {
  return kind === 'brown' ? (dy <= 3 ? 0 : 3) : 0;
}

/** vanilla isValidPosition: in the world's height, on its ground, with air (or leaves) where it'll grow */
function isValidPosition(w: MushroomAccess, kind: HugeMushroomKind, x: number, y: number, z: number, h: number): boolean {
  if (y < MIN_Y + 1 || y + h + 1 >= MAX_Y) return false;
  const below = w.get(x, y - 1, z);
  if (below < 0 || !GROWS_ON.has(nameOf(below))) return false;
  for (let dy = 0; dy <= h; dy++) {
    const k = checkRadius(kind, dy);
    for (let dx = -k; dx <= k; dx++)
      for (let dz = -k; dz <= k; dz++) {
        const st = w.get(x + dx, y + dy, z + dz);
        // (unknown: a neighbouring chunk not made yet, taken as free, as the trees take it)
        if (st >= 0 && !(FLAGS[st] & (F_AIR | F_LEAVES))) return false;
      }
  }
  return true;
}

/** the cap's block with its sides as given (vanilla capProvider: brown up and not down; red not down) */
function capState(kind: HugeMushroomKind, up: boolean, west: boolean, east: boolean, north: boolean, south: boolean): number {
  const b = getBlock(kind === 'brown' ? 'brown_mushroom_block' : 'red_mushroom_block');
  return b.state({ up, down: false, west, east, north, south });
}

/** vanilla HugeBrownMushroomFeature.makeCap: the flat cap, its corners cut, its rim's sides showing (and the corners') */
function brownCap(w: MushroomAccess, x: number, y: number, z: number, h: number, r: number): void {
  for (let j = -r; j <= r; j++)
    for (let k = -r; k <= r; k++) {
      const west = j === -r, east = j === r, north = k === -r, south = k === r;
      const we = west || east, ns = north || south;
      if (we && ns) continue;
      const sw = west || (ns && j === 1 - r), se = east || (ns && j === r - 1);
      const sn = north || (we && k === 1 - r), ss = south || (we && k === r - 1);
      w.set(x + j, y + h, z + k, capState('brown', true, sw, se, sn, ss));
    }
}

/**
 * vanilla HugeRedMushroomFeature.makeCap: three rings of the dome's side round the top of the stem (each the square's
 * edge without its corners), then its roof a size smaller; its sides out, its top and its upper ring up
 */
function redCap(w: MushroomAccess, x: number, y: number, z: number, h: number, r: number): void {
  const k = r - 2;
  for (let i = h - 3; i <= h; i++) {
    const j = i < h ? r : r - 1;
    for (let l = -j; l <= j; l++)
      for (let m = -j; m <= j; m++) {
        const we = l === -j || l === j, ns = m === -j || m === j;
        if (!(i >= h || we !== ns)) continue;
        w.set(x + l, y + i, z + m, capState('red', i >= h - 1, l < -k, l > k, m < -k, m > k));
      }
  }
}

/**
 * vanilla AbstractHugeMushroomFeature.place: a huge `kind` mushroom from (x, y, z) up (its stem's foot, over its
 * ground), drawing on `r`; false (nothing placed) where it can't grow
 */
export function placeHugeMushroom(w: MushroomAccess, r: Rand, kind: HugeMushroomKind, x: number, y: number, z: number): boolean {
  const h = treeHeight(r);
  if (!isValidPosition(w, kind, x, y, z, h)) return false;
  if (kind === 'brown') brownCap(w, x, y, z, h, 3);
  else redCap(w, x, y, z, h, 2);
  // vanilla placeTrunk: the stem, its top and bottom its inside
  const stem = getBlock('mushroom_stem').state({ up: false, down: false });
  for (let i = 0; i < h; i++) w.set(x, y + i, z, stem);
  return true;
}

// ---------------------------------------------------------------------------
// the world's generation

/** a chunk being made, as a huge mushroom sees it: over its edge, the write waits for the next chunk (leaves and plants give way to it) */
function genAccess(ctx: GenContext): MushroomAccess {
  return {
    get: (x, y, z) => ctx.get(x, y, z),
    set: (x, y, z, st) => {
      const cur = ctx.get(x, y, z);
      if (cur < 0) ctx.set(x, y, z, st, W_LOG);
      else if (!isSolid(cur)) ctx.set(x, y, z, st);
    },
  };
}

/**
 * vanilla VegetationPlacements.MUSHROOM_ISLAND_VEGETATION: in the mushroom fields, one try a chunk (InSquarePlacement,
 * HEIGHTMAP, BiomeFilter), a huge red mushroom or a huge brown one (RandomBooleanFeature); on a random of its own, so
 * other chunks come out as they did. True if it grew one
 */
export function mushroomIslandVegetation(ctx: GenContext, seed: number): boolean {
  if (!ctx.biomes.includes(B.mushroom_fields)) return false;
  const r = new Rand(hash2(ctx.cx, ctx.cz, seed ^ 0x3005b), 15);
  const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
  if (ctx.biomeAt(x, z) !== B.mushroom_fields) return false;
  return placeHugeMushroom(genAccess(ctx), r, r.nextBool() ? 'red' : 'brown', x, ctx.heightMotion(x, z), z);
}

/**
 * vanilla VegetationFeatures.DARK_FOREST_VEGETATION's first two: at a dark forest tree's place, a huge brown mushroom
 * one time in 40, else a huge red one one time in 20, instead of the tree (a mushroom that can't grow leaves nothing
 * there, as in vanilla). Its own random, from where it is; true if the tree's place went to a mushroom
 */
export function darkForestMushroom(ctx: GenContext, seed: number, x: number, y: number, z: number): boolean {
  const r = new Rand(hash2(x, z, seed ^ 0xda5c0), y);
  const kind: HugeMushroomKind | null = r.nextFloat() < 0.025 ? 'brown' : r.nextFloat() < 0.05 ? 'red' : null;
  if (!kind) return false;
  placeHugeMushroom(genAccess(ctx), r, kind, x, y, z);
  return true;
}
