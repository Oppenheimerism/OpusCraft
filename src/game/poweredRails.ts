// (minecarts) What the rails do with redstone (vanilla PoweredRailBlock, DetectorRailBlock, RailBlock.updateState and
// BaseRailBlock.onPlace / onRemove).
//
// A powered rail (and likewise an activator rail) is powered by redstone next to it, or through the rails of its own
// kind it's joined to in a straight line: power carries along up to eight of them from the one that has it, over
// slopes too, and goes as it came. Whether a cart speeds up or brakes on it, or what an activator rail does to it, is
// the cart's business (entity/minecart.ts).
//
// A detector rail is powered while a minecart is on it (checked again every second while one is): it powers the
// block under it strongly and what's round it weakly (15), and a comparator behind it reads how full the container
// minecart on it is.
//
// A plain rail at a three-way junction re-picks which way it curves when a signal source next to it changes.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { UP } from '../world/dir';
import { AABB } from '../core/aabb';
import { registerBehavior } from './blockBehavior';
import { canSurvive } from './blockRules';
import { hasNeighborSignal } from './redstone/signal';
import { railConnections, railShape, railSignalChanged, isAscending, type RailShape } from './rails';
import { AbstractMinecart, AbstractMinecartContainer, redstoneSignal } from '../entity/minecart';
import { BOOK_BY_ID } from '../inventory/recipeBook';
import type { Level } from './level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const powered = (st: number): boolean => !!blk(st).get(st, 'powered');

// ---------------------------------------------------------------------------
// powered and activator rails

/**
 * vanilla PoweredRailBlock.findPoweredRailSignal: along the rail at (x, y, z) one way (`forward`), a rail of its kind
 * that's powered and has power of its own (or, in turn, one along from that), within eight
 */
function findPoweredRailSignal(level: Level, x: number, y: number, z: number, st: number, forward: boolean, depth: number): boolean {
  if (depth >= 8) return false;
  let i = x, j = y, k = z;
  let down = true;
  let shape = railShape(st);
  switch (shape) {
    case 'north_south':
      if (forward) k++;
      else k--;
      break;
    case 'east_west':
      if (forward) i--;
      else i++;
      break;
    case 'ascending_east':
      if (forward) i--;
      else {
        i++;
        j++;
        down = false;
      }
      shape = 'east_west';
      break;
    case 'ascending_west':
      if (forward) {
        i--;
        j++;
        down = false;
      } else i++;
      shape = 'east_west';
      break;
    case 'ascending_north':
      if (forward) k++;
      else {
        k--;
        j++;
        down = false;
      }
      shape = 'north_south';
      break;
    case 'ascending_south':
      if (forward) {
        k++;
        j++;
        down = false;
      } else k--;
      shape = 'north_south';
      break;
  }
  const b = blk(st);
  return isSameRailWithPower(level, b, i, j, k, forward, depth, shape) || (down && isSameRailWithPower(level, b, i, j - 1, k, forward, depth, shape));
}

/** vanilla isSameRailWithPower: a powered rail of the same kind there, not running across, with power or leading to some */
function isSameRailWithPower(level: Level, b: Block, x: number, y: number, z: number, forward: boolean, depth: number, shape: RailShape): boolean {
  const st = level.getState(x, y, z);
  if (STATE_BLOCK[st] !== b.id) return false;
  const s = railShape(st);
  if (shape === 'east_west' && (s === 'north_south' || s === 'ascending_north' || s === 'ascending_south')) return false;
  if (shape === 'north_south' && (s === 'east_west' || s === 'ascending_east' || s === 'ascending_west')) return false;
  if (!powered(st)) return false;
  return hasNeighborSignal(level.world, x, y, z) || findPoweredRailSignal(level, x, y, z, st, forward, depth + 1);
}

/**
 * vanilla PoweredRailBlock.updateState: powered if redstone is next to it or comes along the line; when that changes,
 * set so (its neighbours told), and the blocks under it (and over a slope) told too
 */
function updatePowered(level: Level, x: number, y: number, z: number, st: number): void {
  const b = blk(st);
  const was = powered(st);
  const now = hasNeighborSignal(level.world, x, y, z) || findPoweredRailSignal(level, x, y, z, st, true, 0) || findPoweredRailSignal(level, x, y, z, st, false, 0);
  if (now === was) return;
  level.setBlock(x, y, z, b.with(st, 'powered', now));
  level.updateNeighborsAt(x, y - 1, z, b.id);
  if (isAscending(railShape(st))) level.updateNeighborsAt(x, y + 1, z, b.id);
}

/**
 * vanilla BaseRailBlock.onRemove for the straight rails (on every change of state, as vanilla has it): the blocks
 * round it and under it told (and over it, from a slope)
 */
function straightRailRemoved(level: Level, x: number, y: number, z: number, st: number, moving: boolean): void {
  if (moving) return;
  const id = STATE_BLOCK[st];
  if (isAscending(railShape(st))) level.updateNeighborsAt(x, y + 1, z, id);
  level.updateNeighborsAt(x, y, z, id);
  level.updateNeighborsAt(x, y - 1, z, id);
}

for (const name of ['powered_rail', 'activator_rail']) {
  registerBehavior(name, {
    // vanilla BaseRailBlock.onPlace → updateState: joined up (game/rails.ts, already), then its power worked out
    onPlace(level, x, y, z, st, old) {
      if (STATE_BLOCK[old] === STATE_BLOCK[st]) return;
      const now = level.getState(x, y, z);
      if (STATE_BLOCK[now] === STATE_BLOCK[st]) updatePowered(level, x, y, z, now);
    },
    neighborChanged(level, x, y, z, st) {
      updatePowered(level, x, y, z, st);
    },
    onRemove(level, x, y, z, st, _now, moving) {
      straightRailRemoved(level, x, y, z, st, moving);
    },
  });
}

// ---------------------------------------------------------------------------
// the detector rail

let DETECTOR: Block | null = null;
const detector = (): Block => (DETECTOR ??= getBlock('detector_rail'));

/** vanilla DetectorRailBlock.getSearchBB: a box inset 0.2 in the rail's block (0.8 high) */
function searchBox(x: number, y: number, z: number): AABB {
  return new AABB(x + 0.2, y, z + 0.2, x + 0.8, y + 0.8, z + 0.8);
}

/** vanilla updatePowerToConnected: the rails it leads to hear of it (a powered rail beside it looks again) */
function updatePowerToConnected(level: Level, x: number, y: number, z: number, st: number): void {
  for (const [cx, cy, cz] of railConnections(x, y, z, railShape(st))) level.neighborChanged(cx, cy, cz, STATE_BLOCK[level.getState(cx, cy, cz)], x, y, z);
}

/**
 * vanilla DetectorRailBlock.checkPressed: powered while a minecart is on it (its neighbours, the block under it and
 * the rails it leads to told when that changes); with one on it, looked at again in a second; a comparator reading
 * it told either way
 */
function checkPressed(level: Level, x: number, y: number, z: number, st: number): void {
  if (!canSurvive(level.world, x, y, z, st)) return;
  const b = detector();
  const was = powered(st);
  const on = level.getEntities(searchBox(x, y, z), (e) => e instanceof AbstractMinecart && !e.removed).length > 0;
  if (on !== was) {
    const ns = b.with(st, 'powered', on);
    level.setBlock(x, y, z, ns);
    updatePowerToConnected(level, x, y, z, ns);
    level.updateNeighborsAt(x, y, z, b.id);
    level.updateNeighborsAt(x, y - 1, z, b.id);
  }
  if (on) level.scheduleBlockTick(x, y, z, b.id, 20);
  level.updateNeighbourForOutputSignal(x, y, z, b.id);
}

registerBehavior('detector_rail', {
  isSignalSource: () => true,
  getSignal: (_w, _x, _y, _z, st) => (powered(st) ? 15 : 0),
  // (strong power only into the block under it: `dir` points from the asker, so UP means the one below)
  getDirectSignal: (_w, _x, _y, _z, st, dir) => (powered(st) && dir === UP ? 15 : 0),
  entityInside(level, x, y, z, st) {
    if (!level.isClientSide && !powered(st)) checkPressed(level, x, y, z, st);
  },
  tick(level, x, y, z, st) {
    if (powered(st)) checkPressed(level, x, y, z, st);
  },
  /**
   * (not vanilla's, whose scheduled ticks are saved with the chunk: here they aren't, and are dropped with a chunk that
   * unloads, so one left powered with no check due, its cart gone meanwhile, would stay powered: a random tick finds
   * it so and looks again)
   */
  randomTick(level, x, y, z, st) {
    if (powered(st) && !level.hasScheduledTick(x, y, z, STATE_BLOCK[st])) checkPressed(level, x, y, z, st);
  },
  /**
   * vanilla getAnalogOutputSignal: while powered, how full the first container minecart on it is (its loot rolled
   * first, as reading a container's items does); else nothing
   */
  analogOutput(level, x, y, z, st) {
    if (!powered(st)) return 0;
    const carts = level.getEntities(searchBox(x, y, z), (e) => e instanceof AbstractMinecartContainer && !e.removed) as AbstractMinecartContainer[];
    if (!carts.length) return 0;
    carts[0].unpackLoot();
    return redstoneSignal(carts[0].container);
  },
  // vanilla DetectorRailBlock.onPlace: joined up (game/rails.ts), then whether a cart's already on it
  onPlace(level, x, y, z, st, old) {
    if (STATE_BLOCK[old] === STATE_BLOCK[st]) return;
    const now = level.getState(x, y, z);
    if (STATE_BLOCK[now] === STATE_BLOCK[st]) checkPressed(level, x, y, z, now);
  },
  onRemove(level, x, y, z, st, _now, moving) {
    straightRailRemoved(level, x, y, z, st, moving);
  },
});

// ---------------------------------------------------------------------------
// the plain rail's junctions

registerBehavior('rail', {
  neighborChanged(level, x, y, z, st, source) {
    railSignalChanged(level, x, y, z, st, source);
  },
});

// ---------------------------------------------------------------------------
// the recipe book (vanilla recipes/transportation/*: the rails come with a rail, the minecarts with a minecart)

for (const [id, by] of [['powered_rail', 'rail'], ['detector_rail', 'rail'], ['activator_rail', 'rail'], ['hopper_minecart', 'minecart'], ['tnt_minecart', 'minecart'], ['furnace_minecart', 'minecart']]) {
  const r = BOOK_BY_ID.get(id);
  if (r) r.unlockBy = new Set([by]);
}
