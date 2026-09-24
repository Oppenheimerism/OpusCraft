// Neighbour updates (vanilla CollectingNeighborUpdater, 1.19+): the "something next to you changed" calls that
// wake doors, TNT and lamps when power comes and goes. An update started while others are running is queued, and
// each queued batch runs before the rest of the update that queued it, so the order is the old recursive one
// without the recursion: a long chain of updates can't overflow the stack. Past a million chained updates the rest
// are skipped.

import { WEST, EAST, DOWN, UP, NORTH, SOUTH, DX, DY, DZ, type Dir } from '../world/dir';

/** vanilla NeighborUpdater.UPDATE_ORDER: the order a block's six neighbours hear it changed */
export const UPDATE_ORDER: readonly Dir[] = [WEST, EAST, DOWN, UP, NORTH, SOUTH];

/** what the updates act on (the level) */
export interface UpdateTarget {
  /** vanilla BlockState.handleNeighborChanged: the block at (x, y, z) hears that `source` (a block id) at (fx, fy, fz) changed */
  runNeighborChanged(x: number, y: number, z: number, source: number, fx: number, fy: number, fz: number, moving: boolean): void;
}

interface MultiUpdate {
  multi: true;
  x: number;
  y: number;
  z: number;
  source: number;
  skip: number;
  idx: number;
}

interface SimpleUpdate {
  multi: false;
  x: number;
  y: number;
  z: number;
  source: number;
  fx: number;
  fy: number;
  fz: number;
  moving: boolean;
}

type Update = MultiUpdate | SimpleUpdate;

export class NeighborUpdater {
  private readonly stack: Update[] = [];
  private readonly added: Update[] = [];
  private count = 0;

  constructor(private readonly target: UpdateTarget, private readonly maxChained = 1000000) {}

  /** vanilla updateNeighborsAtExceptFromFacing: all six neighbours of (x, y, z) but the one toward `skip` (-1: none) */
  updateNeighborsAt(x: number, y: number, z: number, source: number, skip = -1): void {
    const u: MultiUpdate = { multi: true, x, y, z, source, skip, idx: 0 };
    if (UPDATE_ORDER[0] === skip) u.idx++;
    this.addAndRun(u);
  }

  /** vanilla neighborChanged(pos, block, fromPos): just the one block */
  neighborChanged(x: number, y: number, z: number, source: number, fx: number, fy: number, fz: number, moving = false): void {
    this.addAndRun({ multi: false, x, y, z, source, fx, fy, fz, moving });
  }

  private addAndRun(u: Update): void {
    const running = this.count > 0;
    const over = this.maxChained >= 0 && this.count >= this.maxChained;
    this.count++;
    if (!over) {
      if (running) this.added.push(u);
      else this.stack.push(u);
    }
    if (!running) this.runUpdates();
  }

  private runUpdates(): void {
    try {
      while (this.stack.length || this.added.length) {
        for (let i = this.added.length - 1; i >= 0; i--) this.stack.push(this.added[i]);
        this.added.length = 0;
        const u = this.stack[this.stack.length - 1];
        while (this.added.length === 0) {
          if (!this.runNext(u)) {
            this.stack.pop();
            break;
          }
        }
      }
    } finally {
      this.stack.length = 0;
      this.added.length = 0;
      this.count = 0;
    }
  }

  /** one step of an update; false once it's done */
  private runNext(u: Update): boolean {
    if (!u.multi) {
      this.target.runNeighborChanged(u.x, u.y, u.z, u.source, u.fx, u.fy, u.fz, u.moving);
      return false;
    }
    const d = UPDATE_ORDER[u.idx++];
    this.target.runNeighborChanged(u.x + DX[d], u.y + DY[d], u.z + DZ[d], u.source, u.x, u.y, u.z, false);
    if (u.idx < UPDATE_ORDER.length && UPDATE_ORDER[u.idx] === u.skip) u.idx++;
    return u.idx < UPDATE_ORDER.length;
  }
}
