// Redstone dust (vanilla RedStoneWireBlock with the default wire evaluator). Each side meets its neighbour flat
// (SIDE), goes up the face of a block with dust on top (UP) or not at all (NONE); a piece with no connections is a
// cross (a dot once right-clicked), and one with connections along one axis is a line through. Power is the best of
// what the blocks around give it and one less than the dust next to it (or diagonally up or down past a non-solid
// block), so it drops by one a block. Powered dust powers the block under it and what it points into, strongly.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, OPPOSITE, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { registerBehavior } from '../blockBehavior';
import { isConductor, isSignalSource, bestNeighborSignal } from './signal';
import { sturdyFace } from './support';
import { REDSTONE_COLORS } from '../../world/redstoneColor';
import type { RedstoneSide } from '../../world/blocksRedstoneComponents';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla Direction.Plane.HORIZONTAL (north, east, south, west) and their properties */
const HORIZONTAL: Dir[] = [NORTH, EAST, SOUTH, WEST];
const SIDE_PROP: Record<number, string> = { [NORTH]: 'north', [EAST]: 'east', [SOUTH]: 'south', [WEST]: 'west' };
/** vanilla Direction.values() */
const ALL: Dir[] = [DOWN, UP, NORTH, SOUTH, WEST, EAST];

let WIRE: Block | null = null;
const wire = (): Block => (WIRE ??= getBlock('redstone_wire'));
export const isWire = (st: number): boolean => STATE_BLOCK[st] === wire().id;

/** vanilla RedStoneWireBlock.shouldSignal: off while dust works out its own power, so dust doesn't feed itself */
let shouldSignal = true;

const side = (st: number, d: Dir): RedstoneSide => wire().get<string>(st, SIDE_PROP[d]) as RedstoneSide;
const isConnected = (v: RedstoneSide) => v !== 'none';

/** vanilla canSurviveOn: a sturdy top (or a hopper) under it */
export function canSurviveOn(st: number): boolean {
  return sturdyFace(st, UP) || blk(st).name === 'hopper';
}

/** vanilla shouldConnectTo: dust, a repeater along the line, or any other signal source from the side */
function shouldConnectTo(st: number, d: Dir | null): boolean {
  if (isWire(st)) return true;
  const b = blk(st);
  if (b.name === 'repeater') {
    if (d === null) return false;
    const f = b.get<string>(st, 'facing');
    return f === SIDE_PROP[d] || f === SIDE_PROP[OPPOSITE[d]];
  }
  return isSignalSource(st) && d !== null;
}

/** vanilla getConnectingSide: how the dust at (x, y, z) meets its side `d` */
function connectingSide(w: World, x: number, y: number, z: number, d: Dir, openAbove: boolean): RedstoneSide {
  const nx = x + DX[d], nz = z + DZ[d];
  const ns = w.getState(nx, y, nz);
  if (openAbove) {
    const holds = blk(ns).name.endsWith('_trapdoor') || canSurviveOn(ns);
    if (holds && shouldConnectTo(w.getState(nx, y + 1, nz), null)) return sturdyFace(ns, OPPOSITE[d] as Dir) ? 'up' : 'side';
  }
  return !shouldConnectTo(ns, d) && (isConductor(ns) || !shouldConnectTo(w.getState(nx, y - 1, nz), null)) ? 'none' : 'side';
}

function withSides(st: number, s: Record<number, RedstoneSide>): number {
  const b = wire();
  for (const d of HORIZONTAL) st = b.with(st, SIDE_PROP[d], s[d]);
  return st;
}

const isDot = (st: number) => HORIZONTAL.every((d) => !isConnected(side(st, d)));
const isCross = (st: number) => HORIZONTAL.every((d) => isConnected(side(st, d)));

/** vanilla crossState / defaultBlockState with a power */
const cross = (power: number) => withSides(wire().state({ power }), { [NORTH]: 'side', [EAST]: 'side', [SOUTH]: 'side', [WEST]: 'side' });

/** vanilla getMissingConnections: the sides not yet connected, worked out */
function missingConnections(w: World, x: number, y: number, z: number, st: number): number {
  const openAbove = !isConductor(w.getState(x, y + 1, z));
  for (const d of HORIZONTAL) if (!isConnected(side(st, d))) st = wire().with(st, SIDE_PROP[d], connectingSide(w, x, y, z, d, openAbove));
  return st;
}

/**
 * vanilla getConnectionState: the real connections; a dot stays a dot while it has none, and a line along one axis
 * (or none at all) is drawn through to both sides
 */
export function connectionState(w: World, x: number, y: number, z: number, st: number): number {
  const dot = isDot(st);
  let s = missingConnections(w, x, y, z, wire().state({ power: wire().get<number>(st, 'power') }));
  if (dot && isDot(s)) return s;
  const n = isConnected(side(s, NORTH)), so = isConnected(side(s, SOUTH)), e = isConnected(side(s, EAST)), we = isConnected(side(s, WEST));
  const nsNone = !n && !so, ewNone = !e && !we;
  const b = wire();
  if (!we && nsNone) s = b.with(s, 'west', 'side');
  if (!e && nsNone) s = b.with(s, 'east', 'side');
  if (!n && ewNone) s = b.with(s, 'north', 'side');
  if (!so && ewNone) s = b.with(s, 'south', 'side');
  return s;
}

/**
 * vanilla updateShape for all the neighbours at once: gone without its floor; a side whose connection is still what
 * it was (and the dust isn't a cross) just follows its neighbour (flat or up the face), otherwise the connections are
 * worked out afresh from a cross
 */
function wireShape(w: World, x: number, y: number, z: number, st: number): number {
  if (!canSurviveOn(w.getState(x, y - 1, z))) return 0;
  const openAbove = !isConductor(w.getState(x, y + 1, z));
  const now: Record<number, RedstoneSide> = {};
  let same = !isCross(st);
  for (const d of HORIZONTAL) {
    now[d] = connectingSide(w, x, y, z, d, openAbove);
    if (isConnected(now[d]) !== isConnected(side(st, d))) same = false;
  }
  if (same) {
    let s = st;
    for (const d of HORIZONTAL) if (isConnected(side(st, d))) s = wire().with(s, SIDE_PROP[d], now[d]);
    return s;
  }
  return connectionState(w, x, y, z, cross(wire().get<number>(st, 'power')));
}

/**
 * vanilla updateIndirectNeighbourShapes: dust going up or down past a side it connects on (where there's no dust
 * beside it) meets dust diagonally below or above; that dust's side back toward this one is reshaped
 */
function updateIndirect(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world;
  for (const d of HORIZONTAL) {
    if (side(st, d) === 'none') continue;
    const nx = x + DX[d], nz = z + DZ[d];
    if (isWire(w.getState(nx, y, nz))) continue;
    for (const dy of [-1, 1]) {
      const ds = w.getState(nx, y + dy, nz);
      if (!isWire(ds)) continue;
      const now = wireShape(w, nx, y + dy, nz, ds);
      if (now !== ds) {
        if (now === 0) level.destroyBlock(nx, y + dy, nz, true);
        else level.setBlock(nx, y + dy, nz, now, 2);
      }
    }
  }
}

/** vanilla getWireSignal */
const wireSignal = (st: number) => (isWire(st) ? wire().get<number>(st, 'power') : 0);

/** vanilla calculateTargetStrength: the best signal from around (not from dust), or the dust around less one */
function targetStrength(w: World, x: number, y: number, z: number): number {
  shouldSignal = false;
  const i = bestNeighborSignal(w, x, y, z);
  shouldSignal = true;
  let j = 0;
  if (i < 15) {
    const aboveSolid = isConductor(w.getState(x, y + 1, z));
    for (const d of HORIZONTAL) {
      const nx = x + DX[d], nz = z + DZ[d];
      const ns = w.getState(nx, y, nz);
      j = Math.max(j, wireSignal(ns));
      if (isConductor(ns) && !aboveSolid) j = Math.max(j, wireSignal(w.getState(nx, y + 1, nz)));
      else if (!isConductor(ns)) j = Math.max(j, wireSignal(w.getState(nx, y - 1, nz)));
    }
  }
  return Math.max(i, j - 1);
}

/** the order java.util.HashSet walks BlockPos keys (hash (y + 31 z) · 31 + x, spread, 16 buckets) */
function hashSetOrder(ps: [number, number, number][]): [number, number, number][] {
  const buckets: [number, number, number][][] = Array.from({ length: 16 }, () => []);
  for (const p of ps) {
    let h = (p[1] + Math.imul(p[2], 31)) | 0;
    h = (Math.imul(h, 31) + p[0]) | 0;
    const b = (h ^ (h >>> 16)) & 15;
    if (!buckets[b].some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2])) buckets[b].push(p);
  }
  return buckets.flat();
}

/**
 * vanilla updatePowerStrength: to the power it should have, and then the dust's position and its six neighbours
 * each tell their neighbours (in the order a HashSet of them happens to walk)
 */
function updatePowerStrength(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world;
  const i = targetStrength(w, x, y, z);
  if (wire().get<number>(st, 'power') === i) return;
  if (w.getState(x, y, z) === st) level.setBlock(x, y, z, wire().with(st, 'power', i), 2);
  const ps: [number, number, number][] = [[x, y, z]];
  for (const d of ALL) ps.push([x + DX[d], y + DY[d], z + DZ[d]]);
  for (const [px, py, pz] of hashSetOrder(ps)) level.updateNeighborsAt(px, py, pz, wire().id);
}

/** vanilla checkCornerChangeAt: dust there, and everything around it, hear that dust changed */
function checkCornerChangeAt(level: Level, x: number, y: number, z: number): void {
  if (!isWire(level.world.getState(x, y, z))) return;
  level.updateNeighborsAt(x, y, z, wire().id);
  for (const d of ALL) level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], wire().id);
}

/** vanilla updateNeighborsOfNeighboringWires: the dust beside, and diagonally above (past a solid block) or below */
function updateNeighborsOfNeighboringWires(level: Level, x: number, y: number, z: number): void {
  for (const d of HORIZONTAL) checkCornerChangeAt(level, x + DX[d], y, z + DZ[d]);
  for (const d of HORIZONTAL) {
    const nx = x + DX[d], nz = z + DZ[d];
    if (isConductor(level.world.getState(nx, y, nz))) checkCornerChangeAt(level, nx, y + 1, nz);
    else checkCornerChangeAt(level, nx, y - 1, nz);
  }
}

/** vanilla spawnParticlesAlongLine */
function particleAlong(level: Level, x: number, y: number, z: number, c: [number, number, number], xd: Dir, zd: Dir, min: number, max: number): void {
  const len = max - min;
  if (Math.random() >= 0.2 * len) return;
  const t = min + len * Math.random();
  const px = 0.5 + 0.4375 * DX[xd] + t * DX[zd], py = 0.5 + 0.4375 * DY[xd] + t * DY[zd], pz = 0.5 + 0.4375 * DZ[xd] + t * DZ[zd];
  level.particles.dust?.(x + px, y + py, z + pz, c[0], c[1], c[2], 1);
}

/** vanilla getSignal (and getDirectSignal, the same): not upward; downward always; sideways toward a side it connects on */
function wireSignalToward(w: World, x: number, y: number, z: number, st: number, dir: Dir): number {
  if (!shouldSignal || dir === DOWN) return 0;
  const p = wire().get<number>(st, 'power');
  if (p === 0) return 0;
  if (dir === UP) return p;
  return isConnected(side(connectionState(w, x, y, z, st), OPPOSITE[dir] as Dir)) ? p : 0;
}

registerBehavior('redstone_wire', {
  // vanilla getStateForPlacement: from a cross
  placement: (ctx) => connectionState(ctx.world, ctx.x, ctx.y, ctx.z, cross(0)),
  canSurvive: (w, x, y, z) => canSurviveOn(w.getState(x, y - 1, z)),
  updateShape: wireShape,
  isSignalSource: () => shouldSignal,
  getSignal: wireSignalToward,
  getDirectSignal: wireSignalToward,
  onPlace(level, x, y, z, st, old) {
    // (vanilla setBlock: the old state's and the new one's indirect neighbours; only the connections matter to them)
    if (isWire(old) && HORIZONTAL.some((d) => side(old, d) !== side(st, d))) updateIndirect(level, x, y, z, old);
    if (!isWire(old) || HORIZONTAL.some((d) => side(old, d) !== side(st, d))) updateIndirect(level, x, y, z, st);
    if (isWire(old)) return;
    updatePowerStrength(level, x, y, z, st);
    for (const d of [UP, DOWN]) level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], wire().id);
    updateNeighborsOfNeighboringWires(level, x, y, z);
  },
  onRemove(level, x, y, z, st, now, moving) {
    if (isWire(now)) return;
    updateIndirect(level, x, y, z, st);
    if (moving) return;
    for (const d of ALL) level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], wire().id);
    updatePowerStrength(level, x, y, z, st);
    updateNeighborsOfNeighboringWires(level, x, y, z);
  },
  neighborChanged(level, x, y, z, st) {
    if (canSurviveOn(level.world.getState(x, y - 1, z))) updatePowerStrength(level, x, y, z, st);
    else level.destroyBlock(x, y, z, true, null, false);
  },
  // vanilla useWithoutItem: a cross becomes a dot and a dot a cross (connections permitting)
  use(level, x, y, z, st, ctx) {
    const mode = ctx.player.gameMode;
    if (mode === 'adventure' || mode === 'spectator') return false;
    if (!isCross(st) && !isDot(st)) return false;
    const p = wire().get<number>(st, 'power');
    const now = connectionState(level.world, x, y, z, isCross(st) ? wire().state({ power: p }) : cross(p));
    if (now === st) return false;
    level.setBlock(x, y, z, now);
    // vanilla updatesOnShapeChange: a solid block a side now meets (or no longer meets) tells what's around it
    for (const d of HORIZONTAL) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (isConnected(side(st, d)) !== isConnected(side(now, d)) && isConductor(level.world.getState(nx, y, nz))) level.updateNeighborsAt(nx, y, nz, wire().id, OPPOSITE[d]);
    }
    return true;
  },
  // vanilla animateTick: specks of its colour along each part while powered
  animateTick(level, x, y, z, st) {
    const p = wire().get<number>(st, 'power');
    if (p === 0) return;
    const c = REDSTONE_COLORS[p];
    for (const d of HORIZONTAL) {
      const s = side(st, d);
      if (s === 'up') particleAlong(level, x, y, z, c, d, UP, -0.5, 0.5);
      if (s === 'up' || s === 'side') particleAlong(level, x, y, z, c, DOWN, d, 0, 0.5);
      else particleAlong(level, x, y, z, c, DOWN, d, 0, 0.3);
    }
  },
});
