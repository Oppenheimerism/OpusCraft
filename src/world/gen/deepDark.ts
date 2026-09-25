// The deep dark's own features (vanilla CaveFeatures and CavePlacements): sculk_vein, 204-250 tries a chunk of
// MultifaceGrowthFeature putting a vein on stone, deepslate and the like and spreading it on; sculk_patch_deep_dark,
// 256 tries a chunk of SculkPatchFeature, a charge let loose from a spot beside the rock that turns the rock round it
// to sculk, veins it over and sometimes raises sensors, shriekers and a catalyst; both from the bottom of the world
// up to y 256 wherever the deep dark is (BiomeFilter), in its VEGETAL_DECORATION step. The ancient city's sculk
// pieces grow sculk_patch_ancient_city, the same patch with one to three shriekers able to summon beside it.

import type { Rand } from '../../core/rng';
import { BLOCK_BY_NAME, BLOCKS, STATE_BLOCK, FLAGS, F_AIR, type Block } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { DX, DY, DZ, OPPOSITE, UP, DOWN, NORTH, EAST, SOUTH, WEST } from '../dir';
import { B } from './biomes';
import type { GenContext } from './context';
import { SculkSpreader, canSpreadFrom, collisionFullBlock, sturdyTop, spreadVeinRandomly, veinStateForPlacement, type SculkLevel, type SculkRandom } from '../sculkSpreader';

/** vanilla SculkPatchConfiguration */
export interface SculkPatchConfig {
  chargeCount: number;
  amountPerCharge: number;
  spreadAttempts: number;
  growthRounds: number;
  spreadRounds: number;
  /** vanilla extraRareGrowths: how many shriekers that can summon to try for, a uniform range */
  extraRareGrowths: [number, number];
  catalystChance: number;
}

/** vanilla CaveFeatures.SCULK_PATCH_DEEP_DARK */
export const SCULK_PATCH_DEEP_DARK: SculkPatchConfig = { chargeCount: 10, amountPerCharge: 32, spreadAttempts: 64, growthRounds: 0, spreadRounds: 1, extraRareGrowths: [0, 0], catalystChance: 0.5 };
/** vanilla CaveFeatures.SCULK_PATCH_ANCIENT_CITY */
export const SCULK_PATCH_ANCIENT_CITY: SculkPatchConfig = { chargeCount: 10, amountPerCharge: 32, spreadAttempts: 64, growthRounds: 0, spreadRounds: 1, extraRareGrowths: [1, 3], catalystChance: 0.5 };

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const isAir = (st: number) => (FLAGS[st] & F_AIR) !== 0;

/** vanilla SculkPatchFeature.place: false when it can't begin there */
export function sculkPatch(level: SculkLevel, x: number, y: number, z: number, r: SculkRandom, cfg: SculkPatchConfig): boolean {
  if (!canSpreadFrom(level, x, y, z)) return false;
  const spreader = SculkSpreader.worldGen();
  const rounds = cfg.spreadRounds + cfg.growthRounds;
  for (let j = 0; j < rounds; j++) {
    for (let k = 0; k < cfg.chargeCount; k++) spreader.addCursors(x, y, z, cfg.amountPerCharge);
    const convert = j < cfg.spreadRounds;
    for (let l = 0; l < cfg.spreadAttempts; l++) spreader.updateCursors(level, x, y, z, r, convert);
    spreader.clear();
  }
  const catalyst = BLOCK_BY_NAME.get('sculk_catalyst')!, shrieker = BLOCK_BY_NAME.get('sculk_shrieker')!;
  if (r.nextFloat() <= cfg.catalystChance && collisionFullBlock(level.getState(x, y - 1, z))) level.setState(x, y, z, catalyst.defaultState);
  const [lo, hi] = cfg.extraRareGrowths;
  // (vanilla UniformInt.sample; a constant draws nothing)
  const n = lo === hi ? lo : lo + r.nextInt(hi - lo + 1);
  for (let i = 0; i < n; i++) {
    const bx = x + r.nextInt(5) - 2, bz = z + r.nextInt(5) - 2;
    if (isAir(level.getState(bx, y, bz)) && sturdyTop(level.getState(bx, y - 1, bz))) level.setState(bx, y, bz, shrieker.with(shrieker.defaultState, 'can_summon', true));
  }
  return true;
}

/** the blocks that keep a block entity, which a generated chunk has to list */
export const SCULK_BLOCK_ENTITIES = new Set(['sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', 'sculk_catalyst']);

/**
 * A chunk being generated, as the spreader sees it: what's beyond it isn't there yet, so it reads as air (nothing
 * holds a vein, nothing turns to sculk) and what would be written there is let go. The blocks that keep a block
 * entity get one listed.
 */
export function chunkView(ctx: GenContext): SculkLevel {
  return {
    getState: (x, y, z) => {
      const st = ctx.get(x, y, z);
      return st < 0 ? 0 : st;
    },
    setState: (x, y, z, st) => {
      if (!ctx.inChunk(x, z) || y < MIN_Y || y >= MAX_Y) return;
      ctx.set(x, y, z, st);
      if (SCULK_BLOCK_ENTITIES.has(blk(st).name)) ctx.blockEntities.push({ id: blk(st).name, x, y, z, items: [] });
    },
  };
}

/** vanilla MultifaceGrowthConfiguration for sculk_vein: what it grows on, and every face (the ceiling, the floor, the walls) */
const VEIN_ON = new Set(['stone', 'andesite', 'diorite', 'granite', 'dripstone_block', 'calcite', 'tuff', 'deepslate']);
const VEIN_DIRECTIONS = [UP, DOWN, NORTH, EAST, SOUTH, WEST];

function shuffled<T>(list: readonly T[], r: SculkRandom): T[] {
  const l = list.slice();
  for (let j = l.length; j > 1; j--) {
    const k = r.nextInt(j);
    [l[j - 1], l[k]] = [l[k], l[j - 1]];
  }
  return l;
}

/** vanilla MultifaceGrowthFeature.placeGrowthIfPossible for the sculk vein: onto the first face that's on stone, then spread on */
function placeVein(level: SculkLevel, x: number, y: number, z: number, cur: number, dirs: number[], r: SculkRandom): boolean {
  for (const d of dirs) {
    if (!VEIN_ON.has(blk(level.getState(x + DX[d], y + DY[d], z + DZ[d])).name)) continue;
    const st = veinStateForPlacement(level, cur, x, y, z, d);
    if (st < 0) return false;
    level.setState(x, y, z, st);
    // (chanceOfSpreading 1: it always spreads, but the chance is still drawn)
    if (r.nextFloat() < 1) spreadVeinRandomly(level, st, x, y, z, d, r);
    return true;
  }
  return false;
}

/** vanilla MultifaceGrowthFeature.place for sculk_vein */
export function sculkVein(level: SculkLevel, x: number, y: number, z: number, r: SculkRandom): boolean {
  const water = BLOCK_BY_NAME.get('water')!, vein = BLOCK_BY_NAME.get('sculk_vein')!;
  const airOrWater = (st: number) => isAir(st) || blk(st) === water;
  const here = level.getState(x, y, z);
  if (!airOrWater(here)) return false;
  const dirs = shuffled(VEIN_DIRECTIONS, r);
  if (placeVein(level, x, y, z, here, dirs, r)) return true;
  for (const d of dirs) {
    const others = shuffled(VEIN_DIRECTIONS.filter((v) => v !== OPPOSITE[d]), r);
    // (vanilla's search re-offsets from the origin each step, so of its range of 20 only the next block is tried)
    const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
    const st = level.getState(nx, ny, nz);
    if (!airOrWater(st) && blk(st) !== vein) continue;
    if (placeVein(level, nx, ny, nz, st, others, r)) return true;
  }
  return false;
}

/**
 * The deep dark's VEGETAL_DECORATION features in a chunk: the veins, then the patches, each at a random spot of the
 * chunk from the bottom of the world to y 256, only where that spot is in the deep dark. Then the chunk's list of
 * block entities is brought up to date with the sculk blocks that are really there.
 */
export function deepDarkFeatures(ctx: GenContext, r: Rand): void {
  if (!ctx.caveBiomes?.includes(B.deep_dark)) return;
  const view = chunkView(ctx);
  const veins = 204 + r.nextInt(250 - 204 + 1);
  for (let i = 0; i < veins; i++) {
    const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = MIN_Y + r.nextInt(256 - MIN_Y + 1);
    if (ctx.biomeAt3(x, y, z) === B.deep_dark) sculkVein(view, x, y, z, r);
  }
  for (let i = 0; i < 256; i++) {
    const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = MIN_Y + r.nextInt(256 - MIN_Y + 1);
    if (ctx.biomeAt3(x, y, z) === B.deep_dark) sculkPatch(view, x, y, z, r, SCULK_PATCH_DEEP_DARK);
  }
  tidyBlockEntities(ctx);
}

/** the chunk's listed sculk block entities: one each, and only where the block still stands */
export function tidyBlockEntities(ctx: GenContext): void {
  const seen = new Set<string>();
  const list = ctx.blockEntities;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!SCULK_BLOCK_ENTITIES.has(e.id)) continue;
    const key = `${e.x},${e.y},${e.z}`;
    const st = ctx.get(e.x, e.y, e.z);
    if (seen.has(key) || st < 0 || blk(st).name !== e.id) list.splice(i, 1);
    else seen.add(key);
  }
}
