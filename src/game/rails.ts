// Rail connections (vanilla RailState + BaseRailBlock.onPlace / neighborChanged /
// updateDir / RailBlock.updateState): a placed rail joins up with the rails
// around it, curving into corners and sloping up onto rails one block higher,
// and the rails it joins bend towards it. Neighbour changes only pop rails off
// (and let a signal source flip a junction); generated rails are never reshaped.

import { BLOCKS, STATE_BLOCK, FLAGS, F_WATERLOGGED, S, Block } from '../world/block';
import { canSurvive, blockDrops } from './blockRules';
import { ItemEntity } from '../entity/itemEntity';
import type { Level } from './level';

/** vanilla RailShape */
export type RailShape =
  | 'north_south' | 'east_west'
  | 'ascending_east' | 'ascending_west' | 'ascending_north' | 'ascending_south'
  | 'south_east' | 'south_west' | 'north_west' | 'north_east';

let RAIL: Uint8Array | null = null;

/** vanilla BaseRailBlock.isRail (#rails) */
export function isRail(st: number): boolean {
  if (!RAIL) {
    RAIL = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => (RAIL![i] = /^(rail|powered_rail|detector_rail|activator_rail)$/.test(b.name) ? 1 : 0));
  }
  return RAIL[STATE_BLOCK[st]] === 1;
}

export function railShape(st: number): RailShape {
  return BLOCKS[STATE_BLOCK[st]].get<RailShape>(st, 'shape');
}

export function isAscending(shape: RailShape): boolean {
  return shape.startsWith('ascending');
}

/** vanilla BaseRailBlock.isStraight: only the plain rail can curve */
function isStraight(b: Block): boolean {
  return b.name !== 'rail';
}

/** vanilla isSignalSource, for the redstone blocks this game has */
function isSignalSource(st: number): boolean {
  return BLOCKS[STATE_BLOCK[st]].name === 'redstone_block';
}

/** vanilla Level.hasNeighborSignal: a block of redstone next to it powers the rail */
function hasNeighborSignal(level: Level, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) if (isSignalSource(level.getState(x + dx, y + dy, z + dz))) return true;
  return false;
}

type Pos = [number, number, number];

/** vanilla RailState: a rail and the two block positions it leads to */
class RailState {
  private readonly block: Block;
  private readonly straight: boolean;
  readonly connections: Pos[] = [];

  constructor(private readonly level: Level, readonly x: number, readonly y: number, readonly z: number, private state: number) {
    this.block = BLOCKS[STATE_BLOCK[state]];
    this.straight = isStraight(this.block);
    this.updateConnections(railShape(state));
  }

  getState(): number {
    return this.state;
  }

  private updateConnections(shape: RailShape): void {
    const { x, y, z } = this;
    const c = this.connections;
    c.length = 0;
    switch (shape) {
      case 'north_south': c.push([x, y, z - 1], [x, y, z + 1]); break;
      case 'east_west': c.push([x - 1, y, z], [x + 1, y, z]); break;
      case 'ascending_east': c.push([x - 1, y, z], [x + 1, y + 1, z]); break;
      case 'ascending_west': c.push([x - 1, y + 1, z], [x + 1, y, z]); break;
      case 'ascending_north': c.push([x, y + 1, z - 1], [x, y, z + 1]); break;
      case 'ascending_south': c.push([x, y, z - 1], [x, y + 1, z + 1]); break;
      case 'south_east': c.push([x + 1, y, z], [x, y, z + 1]); break;
      case 'south_west': c.push([x - 1, y, z], [x, y, z + 1]); break;
      case 'north_west': c.push([x - 1, y, z], [x, y, z - 1]); break;
      case 'north_east': c.push([x + 1, y, z], [x, y, z - 1]); break;
    }
  }

  /** keep only the connections whose rail leads back here */
  private removeSoftConnections(): void {
    for (let i = 0; i < this.connections.length; i++) {
      const r = this.getRail(this.connections[i]);
      if (r && r.connectsTo(this)) this.connections[i] = [r.x, r.y, r.z];
      else this.connections.splice(i--, 1);
    }
  }

  private isRailAt(x: number, y: number, z: number): boolean {
    return isRail(this.level.getState(x, y, z));
  }

  private hasRail(x: number, y: number, z: number): boolean {
    return this.isRailAt(x, y, z) || this.isRailAt(x, y + 1, z) || this.isRailAt(x, y - 1, z);
  }

  /** the rail at a position, or one block above or below it */
  private getRail(p: Pos): RailState | null {
    for (const dy of [0, 1, -1]) {
      const st = this.level.getState(p[0], p[1] + dy, p[2]);
      if (isRail(st)) return new RailState(this.level, p[0], p[1] + dy, p[2], st);
    }
    return null;
  }

  private connectsTo(r: RailState): boolean {
    return this.hasConnection(r.x, r.z);
  }

  /** connections compare only the column (slopes lead a block up or down) */
  private hasConnection(x: number, z: number): boolean {
    for (const c of this.connections) if (c[0] === x && c[2] === z) return true;
    return false;
  }

  /** rails next to this one (at any of the three heights) */
  countPotentialConnections(): number {
    const { x, y, z } = this;
    let n = 0;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (this.hasRail(x + dx, y, z + dz)) n++;
    return n;
  }

  private canConnectTo(r: RailState): boolean {
    return this.connectsTo(r) || this.connections.length !== 2;
  }

  /** vanilla RailState.connectTo: bend this (neighbouring) rail towards a newly placed one */
  private connectTo(r: RailState): void {
    this.connections.push([r.x, r.y, r.z]);
    const { x, y, z } = this;
    const n = this.hasConnection(x, z - 1), s = this.hasConnection(x, z + 1), w = this.hasConnection(x - 1, z), e = this.hasConnection(x + 1, z);
    let shape: RailShape | null = null;
    if (n || s) shape = 'north_south';
    if (w || e) shape = 'east_west';
    if (!this.straight) {
      if (s && e && !n && !w) shape = 'south_east';
      if (s && w && !n && !e) shape = 'south_west';
      if (n && w && !s && !e) shape = 'north_west';
      if (n && e && !s && !w) shape = 'north_east';
    }
    if (shape === 'north_south') {
      if (this.isRailAt(x, y + 1, z - 1)) shape = 'ascending_north';
      if (this.isRailAt(x, y + 1, z + 1)) shape = 'ascending_south';
    }
    if (shape === 'east_west') {
      if (this.isRailAt(x + 1, y + 1, z)) shape = 'ascending_east';
      if (this.isRailAt(x - 1, y + 1, z)) shape = 'ascending_west';
    }
    this.state = this.block.with(this.state, 'shape', shape ?? 'north_south');
    this.level.setBlock(x, y, z, this.state);
  }

  /** a neighbouring rail that will take a connection from this one */
  private hasNeighborRail(p: Pos): boolean {
    const r = this.getRail(p);
    if (!r) return false;
    r.removeSoftConnections();
    return r.canConnectTo(this);
  }

  /**
   * vanilla RailState.place: pick the shape from the rails around (curves where two sides meet,
   * slopes onto rails a block higher; at a T or cross junction the power decides which curve),
   * then have the neighbours it now leads to bend towards it.
   */
  place(powered: boolean, alwaysPlace: boolean, current: RailShape): this {
    const { x, y, z } = this;
    const n = this.hasNeighborRail([x, y, z - 1]), s = this.hasNeighborRail([x, y, z + 1]);
    const w = this.hasNeighborRail([x - 1, y, z]), e = this.hasNeighborRail([x + 1, y, z]);
    let shape: RailShape | null = null;
    const ns = n || s, ew = w || e;
    if (ns && !ew) shape = 'north_south';
    if (ew && !ns) shape = 'east_west';
    const se = s && e, sw = s && w, ne = n && e, nw = n && w;
    if (!this.straight) {
      if (se && !n && !w) shape = 'south_east';
      if (sw && !n && !e) shape = 'south_west';
      if (nw && !s && !e) shape = 'north_west';
      if (ne && !s && !w) shape = 'north_east';
    }
    if (shape === null) {
      if (ns && ew) shape = current;
      else if (ns) shape = 'north_south';
      else if (ew) shape = 'east_west';
      if (!this.straight) {
        if (powered) {
          if (se) shape = 'south_east';
          if (sw) shape = 'south_west';
          if (ne) shape = 'north_east';
          if (nw) shape = 'north_west';
        } else {
          if (nw) shape = 'north_west';
          if (ne) shape = 'north_east';
          if (sw) shape = 'south_west';
          if (se) shape = 'south_east';
        }
      }
    }
    if (shape === 'north_south') {
      if (this.isRailAt(x, y + 1, z - 1)) shape = 'ascending_north';
      if (this.isRailAt(x, y + 1, z + 1)) shape = 'ascending_south';
    }
    if (shape === 'east_west') {
      if (this.isRailAt(x + 1, y + 1, z)) shape = 'ascending_east';
      if (this.isRailAt(x - 1, y + 1, z)) shape = 'ascending_west';
    }
    if (shape === null) shape = current;
    this.updateConnections(shape);
    this.state = this.block.with(this.state, 'shape', shape);
    if (alwaysPlace || this.level.getState(x, y, z) !== this.state) {
      this.level.setBlock(x, y, z, this.state);
      for (const c of this.connections) {
        const r = this.getRail(c);
        if (!r) continue;
        r.removeSoftConnections();
        if (r.canConnectTo(this)) r.connectTo(this);
      }
    }
    return this;
  }
}

/** vanilla BaseRailBlock.updateDir */
function updateDir(level: Level, x: number, y: number, z: number, st: number, alwaysPlace: boolean): number {
  return new RailState(level, x, y, z, st).place(hasNeighborSignal(level, x, y, z), alwaysPlace, railShape(st)).getState();
}

/** vanilla BaseRailBlock.onPlace (a rail replaced something else): connect up */
export function railOnPlace(level: Level, x: number, y: number, z: number, st: number): void {
  updateDir(level, x, y, z, st, true);
}

/**
 * vanilla BaseRailBlock.neighborChanged: without a rigid block below (or under the high end of a
 * slope) the rail drops as an item — no break sound or particles. `changed` is the old state of
 * the block that changed (vanilla passes the neighbour's previous block).
 */
export function railNeighborChanged(level: Level, x: number, y: number, z: number, st: number, changed?: number): void {
  if (!canSurvive(level.world, x, y, z, st)) {
    // vanilla Block.dropResources + Level.removeBlock
    if (level.gameRules.doTileDrops) for (const s of blockDrops(st, null, level.random)) ItemEntity.drop(level, x, y, z, s);
    level.setBlock(x, y, z, FLAGS[st] & F_WATERLOGGED ? S('water') : 0);
    return;
  }
  // vanilla RailBlock.updateState: a signal source changing next to a junction re-picks its shape
  if (changed !== undefined && isSignalSource(changed) && new RailState(level, x, y, z, st).countPotentialConnections() === 3) updateDir(level, x, y, z, st, false);
}
