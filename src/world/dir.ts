// Directions in vanilla order: DOWN, UP, NORTH, SOUTH, WEST, EAST.

export const DOWN = 0, UP = 1, NORTH = 2, SOUTH = 3, WEST = 4, EAST = 5;
export type Dir = 0 | 1 | 2 | 3 | 4 | 5;

export const DIR_NAMES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
export type DirName = (typeof DIR_NAMES)[number];

export const DX = [0, 0, 0, 0, -1, 1];
export const DY = [-1, 1, 0, 0, 0, 0];
export const DZ = [0, 0, -1, 1, 0, 0];
export const OPPOSITE = [1, 0, 3, 2, 5, 4];
export const AXIS_OF = [1, 1, 2, 2, 0, 0]; // 0=x 1=y 2=z

export function dirFromName(n: string): Dir {
  const i = DIR_NAMES.indexOf(n as DirName);
  if (i < 0) throw new Error('bad dir ' + n);
  return i as Dir;
}

/** Horizontal directions in vanilla 2D-data order: SOUTH, WEST, NORTH, EAST. */
export const HORIZONTALS: Dir[] = [SOUTH, WEST, NORTH, EAST];

export function dirFromNormal(x: number, y: number, z: number): Dir {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ay >= ax && ay >= az) return y > 0 ? UP : DOWN;
  if (ax >= az) return x > 0 ? EAST : WEST;
  return z > 0 ? SOUTH : NORTH;
}

/** Yaw (vanilla degrees) to facing direction (horizontal). */
export function dirFromYaw(yaw: number): Dir {
  const i = Math.floor(yaw / 90 + 0.5) & 3;
  return HORIZONTALS[i];
}

export function yRotOf(d: Dir): number {
  // rotation (deg) that turns a north-facing model toward d (blockstate "y")
  switch (d) {
    case NORTH: return 0;
    case EAST: return 90;
    case SOUTH: return 180;
    case WEST: return 270;
    default: return 0;
  }
}
