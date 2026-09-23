// Lush caves (vanilla CavePlacements / CaveFeatures for the lush_caves biome, VEGETAL_DECORATION):
// moss over the ceilings with cave vines hanging from it, more cave vines, clay patches and
// pools with dripleaves, moss over the floors with azaleas and grass, rooted azalea trees
// (a tree on the surface above, its roots running down through the rock into the cave),
// spore blossoms and vines. Every feature starts from a random spot in the chunk that
// scans up or down through the air to the rock (vanilla EnvironmentScanPlacement) and
// keeps it only if that spot is in the lush caves.

import { Rand } from '../../core/rng';
import { S, getBlock, FLAGS, FACE_OCC, F_AIR, F_LAVA, F_WATER, STATE_BLOCK, BLOCKS } from '../block';
import { GenContext, W_ROOT, W_HANGING } from './context';
import { B } from './biomes';
import { MIN_Y, MAX_Y } from '../constants';
import { UP, DOWN, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, OPPOSITE } from '../dir';
import { PatchColumn, REPLACE_MOSS, REPLACE_LUSH_GROUND, VEG_BLOCK, VEG_COLUMN, placeColumn, placeSimpleBlock, isSolidBlock } from './patches';
import { placeTree } from './trees';

/** vanilla Mth.nextInt / UniformInt */
const between = (r: Rand, lo: number, hi: number) => lo + r.nextInt(hi - lo + 1);
const isAir = (st: number) => st >= 0 && (FLAGS[st] & F_AIR) !== 0;
const sturdy = (st: number, face: number) => st >= 0 && ((FACE_OCC[st] >> face) & 1) === 1;

interface PatchConfig {
  ground: string;
  replace: number;
  ceiling: boolean;
  depth: (r: Rand) => number;
  extraBottom: number;
  range: number;
  vegChance: number;
  radius: [number, number];
  edgeChance: number;
  pool: boolean;
  veg: (r: Rand) => number[];
}

/** vanilla moss_vegetation: flowering azalea 4, azalea 7, moss carpet 25, short grass 50, tall grass 10 */
function mossVegetation(r: Rand): number[] {
  let k = r.nextInt(96);
  const n = (k -= 4) < 0 ? 'flowering_azalea' : (k -= 7) < 0 ? 'azalea' : (k -= 25) < 0 ? 'moss_carpet' : (k -= 50) < 0 ? 'short_grass' : 'tall_grass';
  return [VEG_BLOCK, S(n)];
}

/** vanilla cave vines columns: the plant (one piece in five with berries) and a head aged 23 to 25 at the bottom */
function caveVines(r: Rand, body: number): number[] {
  const plant = getBlock('cave_vines_plant'), head = getBlock('cave_vines');
  const out = [VEG_COLUMN, -1, 0];
  for (let i = 0; i < body; i++) out.push(plant.state({ berries: r.nextInt(5) === 0 }));
  out.push(head.state({ age: between(r, 23, 25), berries: r.nextInt(5) === 0 }));
  return out;
}

/** vanilla cave_vine_in_moss: 0-3 pieces (weight 5) or 1-7 (weight 1) */
const mossVines = (r: Rand) => caveVines(r, r.nextInt(6) < 5 ? between(r, 0, 3) : between(r, 1, 7));

/** vanilla cave_vine: 0-19 pieces (weight 2), 0-2 (weight 3) or 0-6 (weight 10) */
function vineLength(r: Rand): number {
  const k = r.nextInt(15);
  return k < 2 ? between(r, 0, 19) : k < 5 ? between(r, 0, 2) : between(r, 0, 6);
}

/** vanilla dripleaf: a small dripleaf facing any way, or a big one (0-4 stems, often 0) facing east, west, south or north */
function dripleaf(r: Rand): number[] {
  const k = r.nextInt(5);
  if (k === 0) return [VEG_BLOCK, getBlock('small_dripleaf').state({ facing: ['east', 'west', 'north', 'south'][r.nextInt(4)] })];
  const facing = ['east', 'west', 'south', 'north'][k - 1];
  const stems = r.nextInt(3) < 2 ? between(r, 0, 4) : 0;
  const stem = getBlock('big_dripleaf_stem').state({ facing }), leaf = getBlock('big_dripleaf').state({ facing });
  const out = [VEG_COLUMN, 1, 1];
  for (let i = 0; i < stems; i++) out.push(stem);
  out.push(leaf);
  return out;
}

// vanilla CaveFeatures patch configurations
const MOSS_CEILING: PatchConfig = {
  ground: 'moss_block', replace: REPLACE_MOSS, ceiling: true, depth: (r) => between(r, 1, 2), extraBottom: 0, range: 5, vegChance: 0.08,
  radius: [4, 7], edgeChance: 0.3, pool: false, veg: mossVines,
};
const MOSS_FLOOR: PatchConfig = {
  ground: 'moss_block', replace: REPLACE_MOSS, ceiling: false, depth: () => 1, extraBottom: 0, range: 5, vegChance: 0.8,
  radius: [4, 7], edgeChance: 0.3, pool: false, veg: mossVegetation,
};
const CLAY: PatchConfig = {
  ground: 'clay', replace: REPLACE_LUSH_GROUND, ceiling: false, depth: () => 3, extraBottom: 0.8, range: 2, vegChance: 0.05,
  radius: [4, 7], edgeChance: 0.7, pool: false, veg: dripleaf,
};
const CLAY_POOL: PatchConfig = { ...CLAY, range: 5, vegChance: 0.1, pool: true };
/** vanilla moss_patch_bonemeal */
export const MOSS_BONEMEAL: PatchConfig = { ...MOSS_FLOOR, vegChance: 0.6, radius: [1, 2], edgeChance: 0.75 };

/** vanilla VegetationPatchFeature.place: a rectangle of columns round the origin, corners left out and edges only sometimes */
export function patchColumns(r: Rand, cfg: PatchConfig, ox: number, oy: number, oz: number): PatchColumn[] {
  const out: PatchColumn[] = [];
  const rx = between(r, cfg.radius[0], cfg.radius[1]) + 1, rz = between(r, cfg.radius[0], cfg.radius[1]) + 1;
  const ground = S(cfg.ground);
  for (let i = -rx; i <= rx; i++) {
    const edgeX = i === -rx || i === rx;
    for (let j = -rz; j <= rz; j++) {
      const edgeZ = j === -rz || j === rz;
      if (edgeX && edgeZ) continue;
      if ((edgeX || edgeZ) && !(cfg.edgeChance !== 0 && !(r.nextFloat() > cfg.edgeChance))) continue;
      const depth = cfg.depth(r) + (cfg.extraBottom > 0 && r.nextFloat() < cfg.extraBottom ? 1 : 0);
      const veg = cfg.vegChance > 0 && r.nextFloat() < cfg.vegChance ? cfg.veg(r) : null;
      out.push({ x: ox + i, z: oz + j, y: oy, ceiling: cfg.ceiling, range: cfg.range, depth, ground, replace: cfg.replace, pool: cfg.pool, veg });
    }
  }
  return out;
}

/** vanilla EnvironmentScanPlacement (12 steps, only through air): the first block that matches, or null */
function scan(ctx: GenContext, x: number, y: number, z: number, dir: number, target: (st: number) => boolean): number | null {
  if (!isAir(ctx.get(x, y, z))) return null;
  for (let i = 0; i < 12; i++) {
    if (target(ctx.get(x, y, z))) return y;
    y += dir;
    if (y < MIN_Y || y >= MAX_Y) return null;
    if (!isAir(ctx.get(x, y, z))) break;
  }
  return target(ctx.get(x, y, z)) ? y : null;
}

let GROWS_ON: Uint8Array | null = null;
/** vanilla #azalea_grows_on: dirt, sand, terracotta and snow */
function azaleaGrowsOn(st: number): boolean {
  if (!GROWS_ON) {
    GROWS_ON = new Uint8Array(BLOCKS.length);
    const TERRACOTTA = ['', 'white_', 'orange_', 'magenta_', 'light_blue_', 'yellow_', 'lime_', 'pink_', 'gray_', 'light_gray_', 'cyan_', 'purple_', 'blue_', 'brown_', 'green_', 'red_', 'black_'].map((c) => c + 'terracotta');
    for (const n of ['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots', 'sand', 'red_sand', 'suspicious_sand', 'snow_block', 'powder_snow', ...TERRACOTTA]) {
      const i = BLOCKS.findIndex((b) => b.name === n);
      if (i >= 0) GROWS_ON[i] = 1;
    }
  }
  return st >= 0 && GROWS_ON[STATE_BLOCK[st]] === 1;
}

/** vanilla #replaceable_by_trees (of the blocks the game has) */
function replaceableByTrees(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n.endsWith('_leaves') || /^(short_grass|fern|dead_bush|vine|glow_lichen|sunflower|lilac|rose_bush|peony|tall_grass|large_fern|hanging_roots|water|seagrass|tall_seagrass)$/.test(n);
}

/**
 * vanilla RootSystemFeature (rooted_azalea_tree): from under a cave ceiling, up through the rock
 * (at most 100 blocks) to the first spot an azalea tree can grow with 3 blocks of room; if it grows,
 * rooted dirt fills in round the column from the cave up to it, and hanging roots grow under the ceiling
 */
function rootSystem(ctx: GenContext, r: Rand, x: number, y: number, z: number): void {
  if (!isAir(ctx.get(x, y, z))) return;
  for (let i = 0; i < 100; i++) {
    const ty = y + i + 1;
    if (ty >= MAX_Y) return;
    const here = ctx.get(x, ty, z);
    if (!(isAir(here) || replaceableByTrees(here)) || !azaleaGrowsOn(ctx.get(x, ty - 1, z))) continue;
    // vanilla spaceForTree: 3 blocks of air above (water allowed in the lowest)
    let room = true;
    for (let k = 1; k <= 3 && room; k++) {
      const s = ctx.get(x, ty + k, z);
      if (!(isAir(s) || (k + 1 <= 2 && s >= 0 && FLAGS[s] & F_WATER))) room = false;
    }
    if (!room) continue;
    const below = ctx.get(x, ty - 1, z);
    if (FLAGS[below] & F_LAVA || !isSolidBlock(below)) return;
    if (!placeTree(ctx, 'azalea', x, ty, z, r)) continue;
    const rooted = S('rooted_dirt');
    for (let k = y; k < y + i; k++)
      for (let j = 0; j < 20; j++) ctx.set(x + r.nextInt(3) - r.nextInt(3), k, z + r.nextInt(3) - r.nextInt(3), rooted, W_ROOT);
    const roots = S('hanging_roots');
    for (let k = 0; k < 20; k++) ctx.set(x + r.nextInt(3) - r.nextInt(3), y + r.nextInt(2) - r.nextInt(2), z + r.nextInt(3) - r.nextInt(3), roots, W_HANGING);
    return;
  }
}

/** vanilla VinesFeature: a vine on the first full face round an air block (up, north, south, west, east) */
function vine(ctx: GenContext, x: number, y: number, z: number): void {
  if (!isAir(ctx.get(x, y, z))) return;
  const b = getBlock('vine');
  for (const d of [UP, NORTH, SOUTH, WEST, EAST]) {
    if (!sturdy(ctx.get(x + DX[d], y + DY[d], z + DZ[d]), OPPOSITE[d])) continue;
    ctx.set(x, y, z, b.state({ up: d === UP, north: d === NORTH, south: d === SOUTH, west: d === WEST, east: d === EAST }));
    return;
  }
}

export function lushCaves(ctx: GenContext, r: Rand): void {
  if (!ctx.caveBiomes || !ctx.caveBiomes.includes(B.lush_caves)) return;
  const lush = (x: number, y: number, z: number) => ctx.biomeAt3(x, y, z) === B.lush_caves;
  /** count random spots in the chunk, anywhere from the bottom of the world to y 256 */
  const tries = (count: number, place: (x: number, y: number, z: number) => void) => {
    for (let i = 0; i < count; i++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = between(r, MIN_Y, 256);
      place(x, y, z);
    }
  };
  /** under a solid ceiling (or over a solid floor) within 12 blocks, in the lush caves */
  const underCeiling = (x: number, y: number, z: number, target = isSolidBlock) => {
    const c = scan(ctx, x, y, z, 1, target);
    return c !== null && lush(x, c - 1, z) ? c - 1 : null;
  };
  const onFloor = (x: number, y: number, z: number) => {
    const c = scan(ctx, x, y, z, -1, isSolidBlock);
    return c !== null && lush(x, c + 1, z) ? c + 1 : null;
  };
  const patch = (cfg: PatchConfig, x: number, y: number, z: number) => {
    for (const c of patchColumns(r, cfg, x, y, z)) ctx.runColumn(c);
  };
  // lush_caves_ceiling_vegetation
  tries(125, (x, y, z) => {
    const oy = underCeiling(x, y, z);
    if (oy !== null) patch(MOSS_CEILING, x, oy, z);
  });
  // cave_vines: under a sturdy face
  tries(188, (x, y, z) => {
    const oy = underCeiling(x, y, z, (st) => sturdy(st, DOWN));
    if (oy !== null) placeColumn(ctx, x, oy, z, -1, false, caveVines(r, vineLength(r)).slice(3));
  });
  // lush_caves_clay: a clay patch or a clay pool
  tries(62, (x, y, z) => {
    const oy = onFloor(x, y, z);
    if (oy !== null) patch(r.nextBool() ? CLAY : CLAY_POOL, x, oy, z);
  });
  // lush_caves_vegetation
  tries(125, (x, y, z) => {
    const oy = onFloor(x, y, z);
    if (oy !== null) patch(MOSS_FLOOR, x, oy, z);
  });
  // rooted_azalea_tree
  tries(between(r, 1, 2), (x, y, z) => {
    const oy = underCeiling(x, y, z);
    if (oy !== null) rootSystem(ctx, r, x, oy, z);
  });
  // spore_blossom
  tries(25, (x, y, z) => {
    const oy = underCeiling(x, y, z);
    if (oy !== null) placeSimpleBlock(ctx, x, oy, z, S('spore_blossom'));
  });
  // classic_vines_cave_feature
  tries(256, (x, y, z) => {
    if (lush(x, y, z)) vine(ctx, x, y, z);
  });
}
