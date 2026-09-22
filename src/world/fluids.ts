// Fluid helpers shared by entities and fluid ticking.

import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA, F_COLLIDE } from './block';
import type { World } from './world';

export const FLUID_NONE = 0, FLUID_WATER = 1, FLUID_LAVA = 2;

export function fluidType(state: number): number {
  const f = FLAGS[state];
  if (f & F_LAVA) return FLUID_LAVA;
  if (f & F_WATER) return FLUID_WATER;
  return FLUID_NONE;
}

/** fluid amount 1..8 (8 = source/falling) or 0 */
export function fluidAmount(state: number): number {
  const f = FLAGS[state];
  if (!(f & (F_WATER | F_LAVA))) return 0;
  const b = BLOCKS[STATE_BLOCK[state]];
  if (b.s.fluid && b.propIndex('level') >= 0) {
    const lvl = b.get<number>(state, 'level');
    return lvl === 0 || lvl >= 8 ? 8 : 8 - lvl;
  }
  return 8;
}

export function isFalling(state: number): boolean {
  const b = BLOCKS[STATE_BLOCK[state]];
  if (b.s.fluid && b.propIndex('level') >= 0) return b.get<number>(state, 'level') >= 8;
  return false;
}

/** Height of the fluid surface inside the block (0..1), considering fluid above. */
export function fluidHeight(world: World, x: number, y: number, z: number, type: number): number {
  const st = world.getState(x, y, z);
  if (fluidType(st) !== type) return 0;
  const above = world.getState(x, y + 1, z);
  if (fluidType(above) === type) return 1;
  return fluidAmount(st) / 9;
}

/** Flow vector (normalized x,z plus y) of a fluid block — vanilla FlowingFluid.getFlow. */
export function fluidFlow(world: World, x: number, y: number, z: number): [number, number, number] {
  const st = world.getState(x, y, z);
  const type = fluidType(st);
  if (type === FLUID_NONE) return [0, 0, 0];
  const own = fluidAmount(st) / 9;
  let fx = 0, fz = 0;
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dz] of dirs) {
    const ns = world.getState(x + dx, y, z + dz);
    const nt = fluidType(ns);
    const affects = nt === FLUID_NONE || nt === type;
    if (!affects) continue;
    let f = nt === type ? fluidAmount(ns) / 9 : 0;
    let f1 = 0;
    if (f === 0) {
      if (!(FLAGS[ns] & F_COLLIDE)) {
        const bs = world.getState(x + dx, y - 1, z + dz);
        if (fluidType(bs) === type) {
          f = fluidAmount(bs) / 9;
          if (f > 0) f1 = own - (f - 0.8888889);
        }
      }
    } else if (f > 0) f1 = own - f;
    if (f1 !== 0) {
      fx += dx * f1;
      fz += dz * f1;
    }
  }
  let fy = 0;
  if (isFalling(st)) {
    for (const [dx, dz] of dirs) {
      const a = world.getState(x + dx, y, z + dz), b = world.getState(x + dx, y + 1, z + dz);
      if ((FLAGS[a] & F_COLLIDE && fluidType(a) !== type) || (FLAGS[b] & F_COLLIDE && fluidType(b) !== type)) {
        const l = Math.hypot(fx, fz) || 1;
        fx /= l;
        fz /= l;
        fy = -6;
        break;
      }
    }
  }
  const len = Math.hypot(fx, fy, fz);
  if (len < 1e-5) return [0, 0, 0];
  return [fx / len, fy / len, fz / len];
}
