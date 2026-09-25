// Chorus plants (vanilla ChorusPlantBlock.getStateWithConnections, ChorusPlantFeature and
// ChorusFlowerBlock.generatePlant): how a piece of the plant joins its neighbours, and a whole plant grown at once
// on the outer islands' end stone — a stem of up to five, up to four tiers of branches off it, each branch ending
// in a dead flower.

import { STATE_BLOCK, FLAGS, F_AIR, getBlock } from '../block';
import { type GenContext, W_AIR } from './context';
import type { Rand } from '../../core/rng';

let PLANT = -1, FLOWER = -1, END_STONE = -1;

/** the block ids of the chorus plant, the chorus flower and end stone */
export function chorusIds(): { plant: number; flower: number; endStone: number } {
  if (PLANT < 0) {
    PLANT = getBlock('chorus_plant').id;
    FLOWER = getBlock('chorus_flower').id;
    END_STONE = getBlock('end_stone').id;
  }
  return { plant: PLANT, flower: FLOWER, endStone: END_STONE };
}

/** what's at a block (-1: not known, taken as nothing there) */
export type StateAt = (x: number, y: number, z: number) => number;

/**
 * vanilla ChorusPlantBlock.getStateWithConnections: a piece of the plant joins any plant or flower beside it, above
 * or below, and the end stone under it
 */
export function plantWithConnections(at: StateAt, x: number, y: number, z: number): number {
  const { plant, flower, endStone } = chorusIds();
  const joins = (st: number) => st >= 0 && (STATE_BLOCK[st] === plant || STATE_BLOCK[st] === flower);
  const below = at(x, y - 1, z);
  return getBlock('chorus_plant').state({
    down: joins(below) || (below >= 0 && STATE_BLOCK[below] === endStone),
    up: joins(at(x, y + 1, z)),
    north: joins(at(x, y, z - 1)),
    east: joins(at(x + 1, y, z)),
    south: joins(at(x, y, z + 1)),
    west: joins(at(x - 1, y, z)),
  });
}

/** vanilla Direction.Plane.HORIZONTAL: north, east, south, west */
export const CHORUS_HORIZONTAL: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * vanilla ChorusPlantFeature.place, then ChorusFlowerBlock.generatePlant(level, pos, random, 8): where there's
 * nothing at (x, y, z) and end stone under it, a plant grows. Blocks it reaches into a neighbouring chunk go there
 * once it exists (into air only); what's there before then is taken from the noise terrain.
 */
export function generateChorusPlant(ctx: GenContext, r: Rand, x: number, y: number, z: number, maxSpread = 8): boolean {
  const { endStone } = chorusIds();
  const endStoneState = getBlock('end_stone').defaultState;
  const outside = new Map<string, [number, number, number, number]>();
  const at: StateAt = (bx, by, bz) => {
    if (ctx.inChunk(bx, bz)) return ctx.get(bx, by, bz);
    const o = outside.get(`${bx},${by},${bz}`);
    if (o) return o[3];
    return ctx.solidGuess?.(bx, by, bz) ? endStoneState : 0;
  };
  const empty = (bx: number, by: number, bz: number) => (FLAGS[Math.max(0, at(bx, by, bz))] & F_AIR) !== 0;
  const set = (bx: number, by: number, bz: number, st: number) => {
    if (ctx.inChunk(bx, bz)) ctx.set(bx, by, bz, st);
    else outside.set(`${bx},${by},${bz}`, [bx, by, bz, st]);
  };
  const setPlant = (bx: number, by: number, bz: number) => set(bx, by, bz, plantWithConnections(at, bx, by, bz));
  /** vanilla ChorusFlowerBlock.allNeighborsEmpty: nothing on any side but `except` (an index into CHORUS_HORIZONTAL) */
  const neighboursEmpty = (bx: number, by: number, bz: number, except: number) =>
    CHORUS_HORIZONTAL.every(([dx, dz], i) => i === except || empty(bx + dx, by, bz + dz));

  if (!empty(x, y, z) || STATE_BLOCK[Math.max(0, at(x, y - 1, z))] !== endStone) return false;
  const deadFlower = getBlock('chorus_flower').state({ age: 5 });
  // vanilla ChorusFlowerBlock.growTreeRecursive
  const grow = (bx: number, by: number, bz: number, iterations: number) => {
    let i = r.nextInt(4) + 1;
    if (iterations === 0) i++;
    for (let j = 0; j < i; j++) {
      const ty = by + j + 1;
      if (!neighboursEmpty(bx, ty, bz, -1)) return;
      setPlant(bx, ty, bz);
      setPlant(bx, ty - 1, bz);
    }
    let branched = false;
    if (iterations < 4) {
      let l = r.nextInt(4);
      if (iterations === 0) l++;
      for (let k = 0; k < l; k++) {
        const d = r.nextInt(4);
        const [dx, dz] = CHORUS_HORIZONTAL[d];
        const nx = bx + dx, ny = by + i, nz = bz + dz;
        if (Math.abs(nx - x) < maxSpread && Math.abs(nz - z) < maxSpread && empty(nx, ny, nz) && empty(nx, ny - 1, nz) && neighboursEmpty(nx, ny, nz, (d + 2) & 3)) {
          branched = true;
          setPlant(nx, ny, nz);
          setPlant(nx - dx, ny, nz - dz);
          grow(nx, ny, nz, iterations + 1);
        }
      }
    }
    if (!branched) set(bx, by + i, bz, deadFlower);
  };
  setPlant(x, y, z);
  grow(x, y, z, 0);
  for (const [bx, by, bz, st] of outside.values()) ctx.set(bx, by, bz, st, W_AIR);
  return true;
}
