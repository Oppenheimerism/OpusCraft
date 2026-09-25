// Redstone power (vanilla SignalGetter and Level.getSignal). A block gives off weak power toward a neighbour
// (getSignal) and may give strong power too (getDirectSignal); a conductor — a solid block — takes the strongest
// strong power sent into it and gives it off to all its neighbours in turn. `dir` always points from the block
// asking to the block asked.

import { BLOCKS, STATE_BLOCK, FLAGS, F_FULL_COLLISION } from '../../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { behaviorOf } from '../blockBehavior';

/** vanilla Direction.values() */
export const DIRECTIONS: readonly Dir[] = [DOWN, UP, NORTH, SOUTH, WEST, EAST];

/** full blocks vanilla keeps from carrying power (isRedstoneConductor never): glass, leaves, ice and the like, the copper bulbs */
const NON_CONDUCTOR = /^(glass|tinted_glass|.*_stained_glass|.*_leaves|ice|frosted_ice|glowstone|sea_lantern|redstone_block|observer|piston|sticky_piston|beacon|.*copper_bulb)$/;
/** blocks short of full that vanilla lets carry it anyway (isRedstoneConductor always) */
const ALWAYS_CONDUCTOR = /^(soul_sand|mud)$/;

let CONDUCTOR: Uint8Array | null = null;

/** vanilla isRedstoneConductor: a block whose collision fills it, bar the see-through ones */
export function isConductor(st: number): boolean {
  if (!CONDUCTOR) {
    CONDUCTOR = new Uint8Array(FLAGS.length);
    for (let s = 0; s < FLAGS.length; s++) {
      const n = BLOCKS[STATE_BLOCK[s]].name;
      CONDUCTOR[s] = ALWAYS_CONDUCTOR.test(n) || (FLAGS[s] & F_FULL_COLLISION && !NON_CONDUCTOR.test(n)) ? 1 : 0;
    }
  }
  return CONDUCTOR[st] === 1;
}

/** vanilla isSignalSource */
export function isSignalSource(st: number): boolean {
  return behaviorOf(st)?.isSignalSource?.(st) ?? false;
}

/** vanilla BlockState.getSignal: the weak power the block at (x, y, z) gives toward `dir` */
export function blockSignal(w: World, x: number, y: number, z: number, st: number, dir: Dir): number {
  return behaviorOf(st)?.getSignal?.(w, x, y, z, st, dir) ?? 0;
}

/** vanilla getDirectSignal: the strong power the block at (x, y, z) gives toward `dir` */
export function getDirectSignal(w: World, x: number, y: number, z: number, dir: Dir): number {
  const st = w.getState(x, y, z);
  return behaviorOf(st)?.getDirectSignal?.(w, x, y, z, st, dir) ?? 0;
}

/** vanilla getDirectSignalTo: the strongest strong power sent into (x, y, z) */
export function getDirectSignalTo(w: World, x: number, y: number, z: number): number {
  let i = 0;
  for (const d of DIRECTIONS) {
    i = Math.max(i, getDirectSignal(w, x + DX[d], y + DY[d], z + DZ[d], d));
    if (i >= 15) return i;
  }
  return i;
}

/** vanilla Level.getSignal: what the block at (x, y, z) gives toward `dir` — a conductor passes on its strong power */
export function getSignal(w: World, x: number, y: number, z: number, dir: Dir): number {
  const st = w.getState(x, y, z);
  const i = blockSignal(w, x, y, z, st, dir);
  return isConductor(st) ? Math.max(i, getDirectSignalTo(w, x, y, z)) : i;
}

/** vanilla hasSignal */
export function hasSignal(w: World, x: number, y: number, z: number, dir: Dir): boolean {
  return getSignal(w, x, y, z, dir) > 0;
}

/** vanilla hasNeighborSignal: any neighbour powering (x, y, z) */
export function hasNeighborSignal(w: World, x: number, y: number, z: number): boolean {
  for (const d of DIRECTIONS) if (getSignal(w, x + DX[d], y + DY[d], z + DZ[d], d) > 0) return true;
  return false;
}

/** vanilla getBestNeighborSignal */
export function bestNeighborSignal(w: World, x: number, y: number, z: number): number {
  let i = 0;
  for (const d of DIRECTIONS) {
    const j = getSignal(w, x + DX[d], y + DY[d], z + DZ[d], d);
    if (j >= 15) return 15;
    if (j > i) i = j;
  }
  return i;
}
