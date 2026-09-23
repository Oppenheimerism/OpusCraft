// Main-thread world: chunk storage, block access, light, tints, mesh inputs.

import { Chunk, LIGHT_DEFAULT, blocksSky } from './chunk';
import { LightEngine } from './light';
import { MIN_Y, MAX_Y, SECTIONS } from './constants';
import { BIOMES } from './gen/biomes';
import { ruleAllows, PendingWrites } from './gen/context';
import { MeshInput, PS, PAD, PADDED_VOLUME } from '../render/mesher';
import { OPACITY, BLOCKS, STATE_BLOCK } from './block';
import { BlockEntity, SavedBlockEntity, blockEntityKey, createBlockEntity, loadBlockEntity } from './blockEntity';

export interface GenResult {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  light: Uint8Array;
  biomes: Uint8Array;
  pending: PendingWrites[];
  blockEntities?: SavedBlockEntity[];
  /** freshly generated fluids that should start flowing (packed lx, y, lz) */
  fluidTicks?: number[];
}

export class World {
  readonly chunks = new Map<number, Chunk>();
  readonly light: LightEngine;
  /** writes waiting for their target chunk (key → packed [lx,y,lz,state,rule]) */
  private readonly pending = new Map<number, number[]>();
  biomeBlend = 2;
  /** called when a section's mesh became stale */
  onDirty: ((c: Chunk, section: number) => void) | null = null;
  private lastChunk: Chunk | null = null;
  readonly blockEntities = new Map<string, BlockEntity>();

  constructor() {
    this.light = new LightEngine(this);
  }

  getChunk(cx: number, cz: number): Chunk | null {
    const lc = this.lastChunk;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get(Chunk.key(cx, cz)) ?? null;
    if (c) this.lastChunk = c;
    return c;
  }

  getState(x: number, y: number, z: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.getState(x & 15, y, z & 15);
  }

  isLoaded(x: number, z: number): boolean {
    return this.getChunk(x >> 4, z >> 4) !== null;
  }

  /** packed light sky<<4|block */
  getLight(x: number, y: number, z: number): number {
    if (y >= MAX_Y) return LIGHT_DEFAULT;
    if (y < MIN_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return LIGHT_DEFAULT;
    return c.getLight(x & 15, y, z & 15);
  }

  getBiome(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.biomes[((z & 15) << 4) | (x & 15)];
  }

  heightAt(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return MIN_Y;
    return c.heightmap[((z & 15) << 4) | (x & 15)];
  }

  /** Set a block, updating heightmap, light and dirty sections. Returns old state. */
  setState(x: number, y: number, z: number, state: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    const lx = x & 15, lz = z & 15;
    const old = c.setState(lx, y, lz, state);
    if (old === state) return old;
    if (STATE_BLOCK[old] !== STATE_BLOCK[state]) this.blockChangedType(x, y, z, state, c);
    // heightmap
    const hi = (lz << 4) | lx;
    const h = c.heightmap[hi];
    let newH = h;
    if (blocksSky(state) && y + 1 > h) newH = y + 1;
    else if (!blocksSky(state) && y + 1 === h) newH = c.computeHeight(lx, lz);
    c.heightmap[hi] = newH;
    if (newH !== h) this.light.skyColumnChanged(x, z, h, newH);
    if (OPACITY[old] !== OPACITY[state] || this.emissionDiffers(old, state) || newH !== h || true) this.light.blockChanged(x, y, z);
    this.markBlockDirty(x, y, z);
    return old;
  }

  /** change a state that renders and lights the same (vanilla flag UPDATE_INVISIBLE, e.g. fire age) */
  setStateQuiet(x: number, y: number, z: number, state: number): void {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c && y >= MIN_Y && y < MAX_Y) c.setState(x & 15, y, z & 15, state);
  }

  getBlockEntity(x: number, y: number, z: number): BlockEntity | null {
    return this.blockEntities.get(blockEntityKey(x, y, z)) ?? null;
  }

  private addBlockEntity(be: BlockEntity, c: Chunk): void {
    be.container.onChange = () => (c.modified = true);
    this.blockEntities.set(be.key, be);
  }

  /** a block was replaced by a different block: drop/create its block entity */
  private blockChangedType(x: number, y: number, z: number, state: number, c: Chunk): void {
    const key = blockEntityKey(x, y, z);
    const old = this.blockEntities.get(key);
    if (old) {
      old.removed = true;
      this.blockEntities.delete(key);
    }
    const be = createBlockEntity(BLOCKS[STATE_BLOCK[state]].name, x, y, z);
    if (be) this.addBlockEntity(be, c);
  }

  /** saved block entities inside a chunk */
  chunkBlockEntities(cx: number, cz: number): BlockEntity[] {
    const out: BlockEntity[] = [];
    for (const be of this.blockEntities.values()) if (be.x >> 4 === cx && be.z >> 4 === cz) out.push(be);
    return out;
  }

  private emissionDiffers(a: number, b: number): boolean {
    return a !== b;
  }

  /** mark all sections whose padded mesh region includes (x,y,z) */
  markBlockDirty(x: number, y: number, z: number): void {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const bx = x + dx * PAD, bz = z + dz * PAD;
        if (dx && (bx >> 4) === (x >> 4)) continue;
        if (dz && (bz >> 4) === (z >> 4)) continue;
        const c = this.getChunk(bx >> 4, bz >> 4);
        if (!c) continue;
        for (let dy = -1; dy <= 1; dy++) {
          const by = y + dy * PAD;
          if (dy && ((by - MIN_Y) >> 4) === ((y - MIN_Y) >> 4)) continue;
          if (by < MIN_Y || by >= MAX_Y) continue;
          const si = (by - MIN_Y) >> 4;
          if (!(c.dirty & (1 << si))) {
            c.dirty |= 1 << si;
            this.onDirty?.(c, si);
          }
        }
      }
  }

  lightChanged(x: number, y: number, z: number): void {
    this.markBlockDirty(x, y, z);
  }

  // -------------------------------------------------------------------------
  // Chunk lifecycle

  addChunk(r: GenResult): Chunk {
    const c = new Chunk(r.cx, r.cz);
    c.loadColumn(r.blocks, r.light, r.biomes);
    if (r.fluidTicks?.length) c.fluidTicks = r.fluidTicks;
    this.chunks.set(c.key, c);
    this.lastChunk = null;
    // pending writes into this chunk from earlier neighbours
    const pend = this.pending.get(c.key);
    this.pending.delete(c.key);
    // this chunk's writes into neighbours
    for (const p of r.pending) {
      const key = Chunk.key(p.cx, p.cz);
      const target = this.chunks.get(key);
      if (target) this.applyWrites(target, p.data);
      else {
        let arr = this.pending.get(key);
        if (!arr) this.pending.set(key, (arr = []));
        for (const v of p.data) arr.push(v);
      }
    }
    // mark everything dirty
    c.dirty = (1 << SECTIONS) - 1;
    this.light.mergeChunk(c);
    if (pend) this.applyWrites(c, pend);
    c.lightMerged = true;
    if (r.blockEntities)
      for (const d of r.blockEntities) {
        const be = loadBlockEntity(d);
        if (be) this.addBlockEntity(be, c);
      }
    return c;
  }

  private applyWrites(c: Chunk, data: number[]): void {
    for (let i = 0; i < data.length; i += 5) {
      const lx = data[i], y = data[i + 1], lz = data[i + 2], st = data[i + 3], rule = data[i + 4];
      const cur = c.getState(lx, y, lz);
      if (!ruleAllows(rule, cur)) continue;
      this.setState(c.cx * 16 + lx, y, c.cz * 16 + lz, st);
    }
    c.modified = false;
  }

  removeChunk(cx: number, cz: number): Chunk | null {
    const key = Chunk.key(cx, cz);
    const c = this.chunks.get(key) ?? null;
    if (c) {
      this.chunks.delete(key);
      this.lastChunk = null;
      for (const be of this.chunkBlockEntities(cx, cz)) {
        be.removed = true;
        this.blockEntities.delete(be.key);
      }
    }
    return c;
  }

  hasAllNeighbours(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) if (!this.chunks.has(Chunk.key(cx + dx, cz + dz))) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // Tints

  private biomeColor(kind: 0 | 1 | 2, biome: number, x: number, z: number): number {
    const b = BIOMES[biome];
    if (kind === 0) {
      if (b.grassModifier === 'swamp') {
        const n = swampNoise(x * 0.0225, z * 0.0225);
        return n < -0.1 ? 0x4c763c : 0x6a7039;
      }
      return b.grass;
    }
    if (kind === 1) return b.foliage;
    return b.water;
  }

  ensureTints(c: Chunk): void {
    if (c.grassTint) return;
    const r = this.biomeBlend;
    const g = new Uint32Array(256), f = new Uint32Array(256), w = new Uint32Array(256);
    const x0 = c.cx * 16, z0 = c.cz * 16;
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0, n = 0;
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            const x = x0 + lx + dx, z = z0 + lz + dz;
            const bc = this.getChunk(x >> 4, z >> 4);
            const biome = bc ? bc.biomes[((z & 15) << 4) | (x & 15)] : c.biomes[(lz << 4) | lx];
            const gc = this.biomeColor(0, biome, x, z), fc = this.biomeColor(1, biome, x, z), wc = this.biomeColor(2, biome, x, z);
            gr += gc >> 16; gg += (gc >> 8) & 255; gb += gc & 255;
            fr += fc >> 16; fg += (fc >> 8) & 255; fb += fc & 255;
            wr += wc >> 16; wg += (wc >> 8) & 255; wb += wc & 255;
            n++;
          }
        const i = (lz << 4) | lx;
        g[i] = (Math.round(gr / n) << 16) | (Math.round(gg / n) << 8) | Math.round(gb / n);
        f[i] = (Math.round(fr / n) << 16) | (Math.round(fg / n) << 8) | Math.round(fb / n);
        w[i] = (Math.round(wr / n) << 16) | (Math.round(wg / n) << 8) | Math.round(wb / n);
      }
    c.grassTint = g;
    c.foliageTint = f;
    c.waterTint = w;
  }

  /** Build padded mesh input for section (cx, si, cz). Requires all 8 neighbours. */
  buildMeshInput(cx: number, si: number, cz: number, smooth: boolean, fancy: boolean): MeshInput | null {
    const chunks: (Chunk | null)[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (!c) return null;
        chunks.push(c);
      }
    for (const c of chunks) this.ensureTints(c!);
    const blocks = new Uint16Array(PADDED_VOLUME);
    const light = new Uint8Array(PADDED_VOLUME);
    const grass = new Uint32Array(PS * PS), foliage = new Uint32Array(PS * PS), water = new Uint32Array(PS * PS);
    const y0 = MIN_Y + si * 16;
    for (let pz = -PAD; pz < 16 + PAD; pz++) {
      const czo = pz < 0 ? -1 : pz > 15 ? 1 : 0;
      const lz = pz & 15;
      for (let px = -PAD; px < 16 + PAD; px++) {
        const cxo = px < 0 ? -1 : px > 15 ? 1 : 0;
        const lx = px & 15;
        const c = chunks[(czo + 1) * 3 + (cxo + 1)]!;
        const col = (pz + PAD) * PS + (px + PAD);
        const ci = (lz << 4) | lx;
        grass[col] = c.grassTint![ci];
        foliage[col] = c.foliageTint![ci];
        water[col] = c.waterTint![ci];
        for (let py = -PAD; py < 16 + PAD; py++) {
          const y = y0 + py;
          const pi = ((py + PAD) * PS + (pz + PAD)) * PS + (px + PAD);
          if (y < MIN_Y) {
            blocks[pi] = 0;
            light[pi] = 0;
            continue;
          }
          if (y >= MAX_Y) {
            blocks[pi] = 0;
            light[pi] = LIGHT_DEFAULT;
            continue;
          }
          const s = (y - MIN_Y) >> 4;
          const idx = (((y - MIN_Y) & 15) << 8) | (lz << 4) | lx;
          const bs = c.blocks[s];
          blocks[pi] = bs ? bs[idx] : 0;
          const ls = c.light[s];
          light[pi] = ls ? ls[idx] : LIGHT_DEFAULT;
        }
      }
    }
    return { blocks, light, grass, foliage, water, ox: cx * 16, oy: y0, oz: cz * 16, smooth, fancy };
  }
}

// simple deterministic 2D value noise for swamp grass color variation
function swampNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1;
  };
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
