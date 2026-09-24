// Vanilla FlowingFluid behaviour for water and lava (overworld rules).

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, F_OPAQUE, F_COLLIDE, F_REPLACEABLE, F_WATERLOGGED, FACE_OCC, getBlock, S } from '../world/block';
import type { Level } from './level';

export const WATER = 1, LAVA = 2;

interface FluidState {
  type: number; // 0 none
  amount: number; // 1..8
  falling: boolean;
  source: boolean;
}

const EMPTY: FluidState = { type: 0, amount: 0, falling: false, source: false };

export function fluidStateOf(st: number): FluidState {
  const f = FLAGS[st];
  if (!(f & (F_WATER | F_LAVA))) return EMPTY;
  const type = f & F_LAVA ? LAVA : WATER;
  const b = BLOCKS[STATE_BLOCK[st]];
  if (b.s.fluid && b.propIndex('level') >= 0) {
    const lvl = b.get<number>(st, 'level');
    if (lvl === 0) return { type, amount: 8, falling: false, source: true };
    if (lvl >= 8) return { type, amount: 8, falling: true, source: false };
    return { type, amount: 8 - lvl, falling: false, source: false };
  }
  // waterlogged blocks & water plants are sources
  return { type, amount: 8, falling: false, source: true };
}

function legacyBlock(fs: FluidState): number {
  if (fs.type === 0) return 0;
  const b = getBlock(fs.type === WATER ? 'water' : 'lava');
  const level = fs.source ? 0 : 8 - Math.min(fs.amount, 8) + (fs.falling ? 8 : 0);
  return b.state({ level });
}

function flowing(type: number, amount: number, falling: boolean): FluidState {
  return { type, amount, falling, source: false };
}

function sameFluid(a: FluidState, b: FluidState): boolean {
  return a.type === b.type && a.amount === b.amount && a.falling === b.falling && a.source === b.source;
}

const HDIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export class FluidTicker {
  constructor(private readonly level: Level) {}

  // (vanilla LavaFluid: in an ultra-warm dimension (the Nether) lava runs as far and nearly as fast as water)
  dropOff(type: number): number {
    return type === WATER || this.level.world.dim.ultraWarm ? 1 : 2;
  }

  tickDelay(type: number): number {
    return type === WATER ? 5 : this.level.world.dim.ultraWarm ? 10 : 30;
  }

  slopeFind(type: number): number {
    return type === WATER || this.level.world.dim.ultraWarm ? 4 : 2;
  }

  private st(x: number, y: number, z: number): number {
    return this.level.world.getState(x, y, z);
  }

  /** Can fluid pass between these blocks (vanilla canPassThroughWall + canHoldFluid) */
  private holds(st: number, type: number): boolean {
    const f = FLAGS[st];
    if (f & F_AIR) return true;
    if (f & (F_WATER | F_LAVA)) {
      const fs = fluidStateOf(st);
      return fs.type === type || (FLAGS[st] & F_WATERLOGGED) === 0 && BLOCKS[STATE_BLOCK[st]].s.fluid !== undefined;
    }
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'ladder' || b.name.endsWith('_sign') || b.name.endsWith('_door')) return false;
    // vanilla !blocksMotion(): a flower pot's little shape isn't "solid" (BlockStateBase.calculateSolid wants an
    // average size of 0.73 or a full height), so flowing water pops it off with its plant
    if (b.name === 'flower_pot' || b.name.startsWith('potted_')) return true;
    if (f & F_OPAQUE) return false;
    if (FACE_OCC[st]) return false;
    // non-solid replaceable things (plants, torches, snow layer) get washed away
    return (f & F_COLLIDE) === 0 || (f & F_REPLACEABLE) !== 0;
  }

  private newLiquid(x: number, y: number, z: number, type: number): FluidState {
    let i = 0, j = 0;
    for (const [dx, dz] of HDIRS) {
      const fs = fluidStateOf(this.st(x + dx, y, z + dz));
      if (fs.type === type) {
        if (fs.source) j++;
        i = Math.max(i, fs.amount);
      }
    }
    if (type === WATER && j >= 2) {
      const below = this.st(x, y - 1, z);
      const bf = fluidStateOf(below);
      if ((FLAGS[below] & F_COLLIDE && FLAGS[below] & F_OPAQUE) || (bf.type === type && bf.source)) return { type, amount: 8, falling: false, source: true };
    }
    const above = fluidStateOf(this.st(x, y + 1, z));
    if (above.type === type) return flowing(type, 8, true);
    const k = i - this.dropOff(type);
    return k <= 0 ? EMPTY : flowing(type, k, false);
  }

  tick(x: number, y: number, z: number): void {
    const st = this.st(x, y, z);
    let fs = fluidStateOf(st);
    if (fs.type === 0) return;
    if (!fs.source) {
      const nf = this.newLiquid(x, y, z, fs.type);
      if (nf.type === 0) {
        fs = nf;
        this.level.setBlock(x, y, z, 0);
      } else if (!sameFluid(nf, fs)) {
        fs = nf;
        this.level.setBlock(x, y, z, legacyBlock(nf), false);
        this.level.scheduleTick(x, y, z, this.tickDelay(nf.type));
        this.level.updateNeighborsFluid(x, y, z);
      }
    }
    this.spread(x, y, z, fs);
  }

  private canSpreadTo(x: number, y: number, z: number, type: number): boolean {
    const st = this.st(x, y, z);
    if (!this.holds(st, type)) return false;
    const fs = fluidStateOf(st);
    if (fs.type === type && fs.source) return false;
    return true;
  }

  private spreadTo(x: number, y: number, z: number, fs: FluidState): void {
    const st = this.st(x, y, z);
    const cur = fluidStateOf(st);
    // lava / water interactions
    if (fs.type === LAVA && cur.type === WATER) {
      // lava flowing down into water → stone
      this.level.setBlock(x, y, z, S('stone'));
      this.level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (Math.random() - Math.random()) * 0.8);
      return;
    }
    if (cur.type === fs.type && cur.amount >= fs.amount && !fs.falling) return;
    if (!(FLAGS[st] & F_AIR) && cur.type === 0) {
      // wash away plants/torches with drops
      this.level.destroyBlock(x, y, z, true, null, false);
    }
    this.level.setBlock(x, y, z, legacyBlock(fs));
    this.level.scheduleTick(x, y, z, this.tickDelay(fs.type));
  }

  private isHole(x: number, y: number, z: number, type: number): boolean {
    const below = this.st(x, y - 1, z);
    if (!this.holds(below, type)) return false;
    const bf = fluidStateOf(below);
    return bf.type === type || bf.type === 0;
  }

  private sourceNeighbors(x: number, y: number, z: number, type: number): number {
    let n = 0;
    for (const [dx, dz] of HDIRS) {
      const fs = fluidStateOf(this.st(x + dx, y, z + dz));
      if (fs.type === type && fs.source) n++;
    }
    return n;
  }

  private spread(x: number, y: number, z: number, fs: FluidState): void {
    if (fs.type === 0) return;
    const type = fs.type;
    const below = this.st(x, y - 1, z);
    const belowNew = this.newLiquid(x, y - 1, z, type);
    if (this.canSpreadTo(x, y - 1, z, type) && y > -64) {
      const bf = fluidStateOf(below);
      if (!(bf.type === type && bf.source)) {
        this.spreadTo(x, y - 1, z, belowNew.type ? { ...belowNew, falling: true, amount: 8, source: false } : flowing(type, 8, true));
      }
      if (this.sourceNeighbors(x, y, z, type) >= 3) this.spreadToSides(x, y, z, fs);
    } else if (fs.source || !this.isHole(x, y, z, type)) {
      this.spreadToSides(x, y, z, fs);
    }
    void below;
  }

  private spreadToSides(x: number, y: number, z: number, fs: FluidState): void {
    let amount = fs.amount - this.dropOff(fs.type);
    if (fs.falling) amount = 7;
    if (amount <= 0) return;
    const type = fs.type;
    let best = 1000;
    const targets: [number, number][] = [];
    for (const [dx, dz] of HDIRS) {
      const nx = x + dx, nz = z + dz;
      const st = this.st(nx, y, nz);
      if (!this.holds(st, type)) continue;
      const nf = fluidStateOf(st);
      if (nf.type === type && nf.source) continue;
      let dist: number;
      if (this.isHole(nx, y, nz, type)) dist = 0;
      else dist = this.slopeDistance(nx, y, nz, 1, -dx, -dz, type);
      if (dist < best) {
        targets.length = 0;
        best = dist;
      }
      if (dist <= best) targets.push([dx, dz]);
    }
    for (const [dx, dz] of targets) {
      const nx = x + dx, nz = z + dz;
      if (this.canSpreadTo(nx, y, nz, type)) this.spreadTo(nx, y, nz, flowing(type, amount, false));
    }
  }

  private slopeDistance(x: number, y: number, z: number, dist: number, fromX: number, fromZ: number, type: number): number {
    let best = 1000;
    for (const [dx, dz] of HDIRS) {
      if (dx === fromX && dz === fromZ) continue;
      const nx = x + dx, nz = z + dz;
      const st = this.st(nx, y, nz);
      if (!this.holds(st, type)) continue;
      const nf = fluidStateOf(st);
      if (nf.type === type && nf.source) continue;
      if (this.isHole(nx, y, nz, type)) return dist;
      if (dist < this.slopeFind(type)) {
        const j = this.slopeDistance(nx, y, nz, dist + 1, -dx, -dz, type);
        if (j < best) best = j;
      }
    }
    return best;
  }

  /** vanilla LiquidBlock.shouldSpreadLiquid: lava meeting water */
  checkLavaInteraction(x: number, y: number, z: number): boolean {
    const st = this.st(x, y, z);
    const fs = fluidStateOf(st);
    if (fs.type !== LAVA) return true;
    for (const [dx, dy, dz] of [[0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
      const n = fluidStateOf(this.st(x + dx, y + dy, z + dz));
      if (n.type === WATER) {
        const out = fs.source ? S('obsidian') : S('cobblestone');
        this.level.setBlock(x, y, z, out);
        this.level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (Math.random() - Math.random()) * 0.8);
        return false;
      }
    }
    return true;
  }
}
