// World dimensions (vanilla 1.18+ overworld).
export const MIN_Y = -64;
export const MAX_Y = 320; // exclusive
export const HEIGHT = MAX_Y - MIN_Y; // 384
export const SECTIONS = HEIGHT >> 4; // 24
export const SEA_LEVEL = 63;
export const COLUMN_VOLUME = 16 * 16 * HEIGHT;

/** index into a full-column array (y-major so sections are contiguous) */
export function colIndex(x: number, y: number, z: number): number {
  return ((y - MIN_Y) << 8) | (z << 4) | x;
}

/** underground biomes per quart (4x4x4 blocks) of a chunk column: index (qy << 4) | (qz << 2) | qx, 255 = the surface biome */
export const CAVE_BIOME_LEVELS = (MAX_Y - MIN_Y) >> 2;
export const NO_CAVE_BIOME = 255;
export function caveBiomeIndex(lx: number, y: number, lz: number): number {
  return (((y - MIN_Y) >> 2) << 4) | ((lz >> 2) << 2) | (lx >> 2);
}
