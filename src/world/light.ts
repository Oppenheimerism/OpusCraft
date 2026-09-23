// World-level light engine (main thread): merges chunk-local light across
// chunk borders and handles incremental updates on block changes.

import { OPACITY, EMISSION, FACE_OCC, FLAGS, F_SHAPE_OCCLUSION } from './block';
import { MIN_Y, MAX_Y } from './constants';
import type { World } from './world';
import type { Chunk } from './chunk';

const CAP = 1 << 18;
const DXS = [0, 0, 0, 0, -1, 1], DYS = [-1, 1, 0, 0, 0, 0], DZS = [0, 0, -1, 1, 0, 0];

export const SKY = 0, BLK = 1;

function blockedByShape(from: number, to: number, dir: number): boolean {
  if ((FLAGS[from] & F_SHAPE_OCCLUSION) && (FACE_OCC[from] >> dir) & 1) return true;
  if ((FLAGS[to] & F_SHAPE_OCCLUSION) && (FACE_OCC[to] >> (dir ^ 1)) & 1) return true;
  return false;
}

export class LightEngine {
  private incQ = new Int32Array(CAP * 3);
  private incH = 0;
  private incT = 0;
  private decQ = new Int32Array(CAP * 4);
  private decH = 0;
  private decT = 0;
  private lastChunk: Chunk | null = null;

  constructor(private readonly world: World) {}

  /** forget cached chunks and queued work (the world dropped its chunks) */
  reset(): void {
    this.lastChunk = null;
    this.incH = this.incT = 0;
    this.decH = this.decT = 0;
  }

  /** the light channels this dimension has (no sky light in the Nether) */
  private get firstChannel(): number {
    return this.world.dim.hasSkyLight ? SKY : BLK;
  }

  private chunk(x: number, z: number): Chunk | null {
    const cx = x >> 4, cz = z >> 4;
    const lc = this.lastChunk;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.world.getChunk(cx, cz);
    if (c) this.lastChunk = c;
    return c;
  }

  private get(ch: number, x: number, y: number, z: number): number {
    if (y >= MAX_Y) return ch === SKY && this.world.dim.hasSkyLight ? 15 : 0;
    if (y < MIN_Y) return 0;
    const c = this.chunk(x, z);
    if (!c) return -1;
    const l = c.getLight(x & 15, y, z & 15);
    return ch === SKY ? l >> 4 : l & 15;
  }

  private set(ch: number, x: number, y: number, z: number, v: number): void {
    const c = this.chunk(x, z);
    if (!c) return;
    const lx = x & 15, lz = z & 15;
    const l = c.getLight(lx, y, lz);
    const nl = ch === SKY ? (v << 4) | (l & 15) : (l & 0xf0) | v;
    if (nl === l) return;
    c.setLight(lx, y, lz, nl);
    this.world.lightChanged(x, y, z);
  }

  private state(x: number, y: number, z: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const c = this.chunk(x, z);
    if (!c) return 0;
    return c.getState(x & 15, y, z & 15);
  }

  private pushInc(x: number, y: number, z: number): void {
    const i = this.incT * 3;
    this.incQ[i] = x;
    this.incQ[i + 1] = y;
    this.incQ[i + 2] = z;
    this.incT = (this.incT + 1) & (CAP - 1);
  }

  private pushDec(x: number, y: number, z: number, l: number): void {
    const i = this.decT * 4;
    this.decQ[i] = x;
    this.decQ[i + 1] = y;
    this.decQ[i + 2] = z;
    this.decQ[i + 3] = l;
    this.decT = (this.decT + 1) & (CAP - 1);
  }

  private propagateInc(ch: number): void {
    while (this.incH !== this.incT) {
      const i = this.incH * 3;
      const x = this.incQ[i], y = this.incQ[i + 1], z = this.incQ[i + 2];
      this.incH = (this.incH + 1) & (CAP - 1);
      const L = this.get(ch, x, y, z);
      if (L <= 1) continue;
      const from = this.state(x, y, z);
      for (let d = 0; d < 6; d++) {
        const nx = x + DXS[d], ny = y + DYS[d], nz = z + DZS[d];
        if (ny < MIN_Y || ny >= MAX_Y) continue;
        const cur = this.get(ch, nx, ny, nz);
        if (cur < 0) continue; // unloaded
        const to = this.state(nx, ny, nz);
        const op = OPACITY[to];
        if (op >= 15) continue;
        if (blockedByShape(from, to, d)) continue;
        let nl = L - Math.max(1, op);
        if (ch === SKY && d === 0 && L === 15 && op === 0) nl = 15;
        if (nl > cur) {
          this.set(ch, nx, ny, nz, nl);
          this.pushInc(nx, ny, nz);
        }
      }
    }
  }

  private propagateDec(ch: number): void {
    while (this.decH !== this.decT) {
      const i = this.decH * 4;
      const x = this.decQ[i], y = this.decQ[i + 1], z = this.decQ[i + 2], L = this.decQ[i + 3];
      this.decH = (this.decH + 1) & (CAP - 1);
      for (let d = 0; d < 6; d++) {
        const nx = x + DXS[d], ny = y + DYS[d], nz = z + DZS[d];
        if (ny < MIN_Y || ny >= MAX_Y) continue;
        const nl = this.get(ch, nx, ny, nz);
        if (nl <= 0) continue;
        const dependent = nl < L || (ch === SKY && d === 0 && L === 15 && nl === 15);
        if (dependent) {
          this.set(ch, nx, ny, nz, 0);
          this.pushDec(nx, ny, nz, nl);
          // re-seed sources
          const src = this.sourceLevel(ch, nx, ny, nz);
          if (src > 0) {
            this.set(ch, nx, ny, nz, src);
            this.pushInc(nx, ny, nz);
          }
        } else {
          this.pushInc(nx, ny, nz);
        }
      }
    }
  }

  private sourceLevel(ch: number, x: number, y: number, z: number): number {
    if (ch === BLK) return EMISSION[this.state(x, y, z)];
    if (!this.world.dim.hasSkyLight) return 0;
    const c = this.chunk(x, z);
    if (!c) return 0;
    const st = c.getState(x & 15, y, z & 15);
    if (OPACITY[st] >= 15) return 0;
    return y >= c.heightmap[((z & 15) << 4) | (x & 15)] ? 15 : 0;
  }

  /** Compute the light value a cell should have from its neighbours/sources. */
  private expected(ch: number, x: number, y: number, z: number): number {
    const st = this.state(x, y, z);
    const op = OPACITY[st];
    let best = this.sourceLevel(ch, x, y, z);
    if (op >= 15) return ch === BLK ? EMISSION[st] : 0;
    for (let d = 0; d < 6; d++) {
      const nx = x + DXS[d], ny = y + DYS[d], nz = z + DZS[d];
      const l = this.get(ch, nx, ny, nz);
      if (l <= 0) continue;
      const from = this.state(nx, ny, nz);
      if (blockedByShape(from, st, d ^ 1)) continue;
      let v = l - Math.max(1, op);
      if (ch === SKY && d === 1 && l === 15 && op === 0) v = 15; // from above
      if (v > best) best = v;
    }
    return best;
  }

  /** Call after the block at (x,y,z) changed (heightmap already updated). */
  blockChanged(x: number, y: number, z: number): void {
    for (let ch = this.firstChannel; ch < 2; ch++) {
      const old = this.get(ch, x, y, z);
      if (old < 0) continue;
      const exp = this.expected(ch, x, y, z);
      if (exp < old) {
        this.set(ch, x, y, z, 0);
        this.pushDec(x, y, z, old);
        const src = this.sourceLevel(ch, x, y, z);
        if (src > 0) {
          this.set(ch, x, y, z, src);
          this.pushInc(x, y, z);
        }
        this.propagateDec(ch);
        // recompute this cell after removal
        const e2 = this.expected(ch, x, y, z);
        if (e2 > this.get(ch, x, y, z)) {
          this.set(ch, x, y, z, e2);
          this.pushInc(x, y, z);
        }
        this.propagateInc(ch);
      } else if (exp > old) {
        this.set(ch, x, y, z, exp);
        this.pushInc(x, y, z);
        this.propagateInc(ch);
      } else {
        // same value, but opacity may have changed what passes through: re-push neighbours
        this.pushInc(x, y, z);
        for (let d = 0; d < 6; d++) this.pushInc(x + DXS[d], y + DYS[d], z + DZS[d]);
        this.propagateInc(ch);
      }
    }
  }

  /** Column sky update when the heightmap drops/rises (block removed/placed at top). */
  skyColumnChanged(x: number, z: number, from: number, to: number): void {
    if (!this.world.dim.hasSkyLight) return;
    // cells between old and new heightmap need relight
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let y = hi - 1; y >= lo; y--) this.blockChangedChannel(SKY, x, y, z);
  }

  private blockChangedChannel(ch: number, x: number, y: number, z: number): void {
    const old = this.get(ch, x, y, z);
    if (old < 0) return;
    const exp = this.expected(ch, x, y, z);
    if (exp < old) {
      this.set(ch, x, y, z, 0);
      this.pushDec(x, y, z, old);
      this.propagateDec(ch);
      const e2 = this.expected(ch, x, y, z);
      if (e2 > this.get(ch, x, y, z)) {
        this.set(ch, x, y, z, e2);
        this.pushInc(x, y, z);
      }
      this.propagateInc(ch);
    } else if (exp > old) {
      this.set(ch, x, y, z, exp);
      this.pushInc(x, y, z);
      this.propagateInc(ch);
    }
  }

  /** Merge light across the borders of a newly loaded chunk with its loaded neighbours. */
  mergeChunk(c: Chunk): void {
    const x0 = c.cx * 16, z0 = c.cz * 16;
    const sides: [number, number, number, number, number][] = [
      // neighbour dx, dz, our border coord axis, our index, their index
      [-1, 0, 0, 0, 15],
      [1, 0, 0, 15, 0],
      [0, -1, 1, 0, 15],
      [0, 1, 1, 15, 0],
    ];
    for (let ch = this.firstChannel; ch < 2; ch++) {
      for (const [dx, dz, axis, ours, theirs] of sides) {
        const n = this.world.getChunk(c.cx + dx, c.cz + dz);
        if (!n) continue;
        for (let y = MIN_Y; y < MAX_Y; y++) {
          // skip fully-default section pairs quickly
          const si = (y - MIN_Y) >> 4;
          if (!c.light[si] && !n.light[si] && (y & 15) === 0) {
            y += 15;
            continue;
          }
          for (let k = 0; k < 16; k++) {
            const lxA = axis === 0 ? ours : k, lzA = axis === 0 ? k : ours;
            const lxB = axis === 0 ? theirs : k, lzB = axis === 0 ? k : theirs;
            const la = c.getLight(lxA, y, lzA), lb = n.getLight(lxB, y, lzB);
            const a = ch === SKY ? la >> 4 : la & 15, b = ch === SKY ? lb >> 4 : lb & 15;
            if (a - 1 > b) this.pushInc(x0 + lxA, y, z0 + lzA);
            else if (b - 1 > a) this.pushInc((c.cx + dx) * 16 + lxB, y, (c.cz + dz) * 16 + lzB);
          }
        }
      }
      this.propagateInc(ch);
    }
  }
}
