// What the ancient city's templates are made of, and the small things built over and over in them: stairs and slabs
// of the deepslates, soul lanterns hanging on chains, clusters of candles that have gone out, skulls, a smooth
// ceiling line for the cave the city hollows out. Used by world/gen/ancientCityCenter.ts and ancientCityPieces.ts.

import { Rand, hashString } from '../../core/rng';
import type { CityBuilder } from './ancientCityTemplates';

export type Side = 'north' | 'south' | 'west' | 'east';

export const OPPOSITE_SIDE: Record<Side, Side> = { north: 'south', south: 'north', west: 'east', east: 'west' };

/** the deepslates a city is built of */
export const TILES = 'deepslate_tiles', BRICKS = 'deepslate_bricks', POLISHED = 'polished_deepslate', COBBLED = 'cobbled_deepslate';
export const CHISELED = 'chiseled_deepslate', CRACKED_BRICKS = 'cracked_deepslate_bricks', CRACKED_TILES = 'cracked_deepslate_tiles';
export const REINFORCED = 'reinforced_deepslate', DEEPSLATE = 'deepslate', BASALT = 'basalt', SMOOTH_BASALT = 'smooth_basalt';
export const TILE_WALL = 'deepslate_tile_wall', BRICK_WALL = 'deepslate_brick_wall', POLISHED_WALL = 'polished_deepslate_wall', COBBLED_WALL = 'cobbled_deepslate_wall';
export const GRAY_WOOL = 'gray_wool', GRAY_CARPET = 'gray_carpet';

export type StairMaterial = 'deepslate_tile' | 'deepslate_brick' | 'polished_deepslate' | 'cobbled_deepslate' | 'dark_oak';

/** a stair facing `facing` (its back, the tall side, that way), upside down when `top` */
export function stair(mat: StairMaterial, facing: Side, top = false): string {
  return `${mat}_stairs[facing=${facing},half=${top ? 'top' : 'bottom'}]`;
}

/** a slab of a deepslate (or dark oak), bottom or top */
export function slab(mat: StairMaterial, top = false): string {
  return `${mat}_slab[type=${top ? 'top' : 'bottom'}]`;
}

/** a random for laying out a template, the same every time for the same template */
export function templateRandom(id: string): Rand {
  return new Rand(hashString(id), 0xc17e);
}

/** one of the choices, by weight */
export function pick<T>(r: Rand, choices: [T, number][]): T {
  let total = 0;
  for (const [, w] of choices) total += w;
  let k = r.nextFloat() * total;
  for (const [c, w] of choices) {
    k -= w;
    if (k < 0) return c;
  }
  return choices[choices.length - 1][0];
}

/** a floor block of a street: mostly tiles, now and then cobbled or polished (the processors crack them) */
export function streetBlock(r: Rand): string {
  return pick(r, [[TILES, 14], [COBBLED, 2], [POLISHED, 1]]);
}

/** a block of a wall: mostly bricks, some tiles (the processors crack them) */
export function wallBlock(r: Rand): string {
  return pick(r, [[BRICKS, 12], [TILES, 2]]);
}

/** a soul lantern hanging on `len` links of chain below (x, top, z) (the chain from top down, the lantern under it) */
export function hangingLantern(b: CityBuilder, x: number, top: number, z: number, len: number): void {
  for (let i = 0; i < len; i++) b.set(x, top - i, z, 'chain[axis=y]');
  b.set(x, top - len, z, 'soul_lantern[hanging=true]');
}

/** one to four candles that have gone out (vanilla's city has plain and white ones) */
export function candles(b: CityBuilder, r: Rand, x: number, y: number, z: number): void {
  const n = 1 + r.nextInt(4);
  b.set(x, y, z, `${r.nextInt(3) === 0 ? 'white_candle' : 'candle'}[candles=${n},lit=false]`);
}

/** a skeleton skull on the floor, turned any way */
export function skull(b: CityBuilder, r: Rand, x: number, y: number, z: number): void {
  b.set(x, y, z, `skeleton_skull[rotation=${r.nextInt(16)}]`);
}

/** smooth value noise in 0..1 over a template (for the cave's ceiling line) */
export function smoothNoise(seed: string, scale: number): (x: number, z: number) => number {
  const h = hashString(seed);
  const at = (i: number, j: number) => {
    let v = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ h;
    v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d);
    v = Math.imul(v ^ (v >>> 12), 0x297a2d39);
    return ((v ^ (v >>> 15)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const fx = x / scale, fz = z / scale;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const c = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (c - a) * sz;
  };
}
