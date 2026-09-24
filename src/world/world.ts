// Main-thread world: chunk storage, block access, light, tints, mesh inputs.

import { Chunk, blocksSky } from './chunk';
import { LightEngine } from './light';
import { MIN_Y, MAX_Y, SECTIONS, caveBiomeIndex, NO_CAVE_BIOME, CAVE_BIOME_LEVELS } from './constants';
import { BIOMES } from './gen/biomes';
import { ruleAllows, PendingWrites, W_HANGING } from './gen/context';
import { runPatchColumn, type BlockAccess } from './gen/patches';
import { replayNetherFeature, FEATURE_OP_SIZE } from './gen/netherFeatures';
import { MeshInput, PS, PAD, PADDED_VOLUME } from '../render/mesher';
import { OPACITY, BLOCKS, STATE_BLOCK } from './block';
import { OVERWORLD, type DimensionType } from './dimension';
import { BlockEntity, SavedBlockEntity, blockEntityKey, createBlockEntity, loadBlockEntity } from './blockEntity';
import type { SavedEntity } from '../entity/mob';

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
  /** entities placed by generation (added the first time the chunk's entities load) */
  entities?: SavedEntity[];
  /** generated blocks to reshape against their neighbours (packed lx, y, lz) */
  postProcess?: number[];
  caveBiomes?: Uint8Array | null;
  /** neighbours whose generation writes these blocks already have (a chunk loaded from a save) */
  baked?: number;
  /** vanilla InhabitedTime (a chunk loaded from a save) */
  inhabitedTime?: number;
}

/** the bit for the neighbour chunk (dx, dz) away */
export const nbBit = (dx: number, dz: number): number => 1 << ((dx + 1) * 3 + (dz + 1));

export class World {
  readonly chunks = new Map<number, Chunk>();
  readonly light: LightEngine;
  /** the dimension these chunks belong to */
  dim: DimensionType = OVERWORLD;
  /** a nether portal block appeared or went (vanilla PoiManager: portals are found through their POI records) */
  onPortalChanged: ((x: number, y: number, z: number, present: boolean) => void) | null = null;
  /** a block became another kind of block (the level's points of interest follow it) */
  onTypeChanged: ((x: number, y: number, z: number, old: number, now: number) => void) | null = null;
  biomeBlend = 2;
  /** called when a section's mesh became stale */
  onDirty: ((c: Chunk, section: number) => void) | null = null;
  private lastChunk: Chunk | null = null;
  readonly blockEntities = new Map<string, BlockEntity>();

  constructor() {
    this.light = new LightEngine(this);
  }

  /** drop every chunk and switch to another dimension (the caller saved what it wanted first) */
  reset(dim: DimensionType): void {
    for (const be of this.blockEntities.values()) be.removed = true;
    this.blockEntities.clear();
    this.chunks.clear();
    this.lastChunk = null;
    this.dim = dim;
    this.light.reset();
  }

  /** light where there's no light data: full sky light where the dimension has it */
  get lightDefault(): number {
    return this.dim.lightDefault;
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
    if (y >= MAX_Y) return this.dim.lightDefault;
    if (y < MIN_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return this.dim.lightDefault;
    return c.getLight(x & 15, y, z & 15);
  }

  getBiome(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.biomes[((z & 15) << 4) | (x & 15)];
  }

  /** the biome at a block, underground biomes (lush caves, dripstone caves, deep dark) included */
  getBiome3(x: number, y: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    if (c.caveBiomes && y >= MIN_Y && y < MAX_Y) {
      const b = c.caveBiomes[caveBiomeIndex(x & 15, y, z & 15)];
      if (b !== NO_CAVE_BIOME) return b;
    }
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
    if (STATE_BLOCK[old] !== STATE_BLOCK[state]) {
      this.blockChangedType(x, y, z, state, c);
      const pid = portalId();
      if (STATE_BLOCK[old] === pid || STATE_BLOCK[state] === pid) this.onPortalChanged?.(x, y, z, STATE_BLOCK[state] === pid);
      this.onTypeChanged?.(x, y, z, old, state);
    }
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
    const c = new Chunk(r.cx, r.cz, this.dim.lightDefault);
    c.loadColumn(r.blocks, r.light, r.biomes);
    if (r.fluidTicks?.length) c.fluidTicks = r.fluidTicks;
    if (r.entities?.length) c.genEntities = r.entities;
    if (r.postProcess?.length) c.postProcess = r.postProcess;
    c.caveBiomes = r.caveBiomes ?? null;
    c.genWrites = r.pending;
    c.baked = r.baked ?? 0;
    c.inhabitedTime = r.inhabitedTime ?? 0;
    this.chunks.set(c.key, c);
    this.lastChunk = null;
    // generation writes across chunk borders go in once both chunks are here: this chunk's
    // into the neighbours, then theirs into it (a chunk from a save already has what it had then)
    const near: Chunk[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const n = dx || dz ? this.chunks.get(Chunk.key(c.cx + dx, c.cz + dz)) : undefined;
        if (n) near.push(n);
      }
    for (const n of near) this.bakeWrites(n, c);
    // mark everything dirty
    c.dirty = (1 << SECTIONS) - 1;
    this.light.mergeChunk(c);
    for (const n of near) this.bakeWrites(c, n);
    c.lightMerged = true;
    if (r.blockEntities)
      for (const d of r.blockEntities) {
        const be = loadBlockEntity(d);
        if (be) this.addBlockEntity(be, c);
      }
    return c;
  }

  /** `from`'s generation writes into `to`, unless `to` has them already */
  private bakeWrites(to: Chunk, from: Chunk): void {
    const bit = nbBit(from.cx - to.cx, from.cz - to.cz);
    if (to.baked & bit) return;
    to.baked |= bit;
    for (const p of from.genWrites) if (p.cx === to.cx && p.cz === to.cz) this.applyWrites(to, p);
  }

  private applyWrites(c: Chunk, p: PendingWrites): void {
    // (generation, not a change to save)
    const was = c.modified;
    const data = p.data;
    for (let i = 0; i < data.length; i += 5) {
      const lx = data[i], y = data[i + 1], lz = data[i + 2], st = data[i + 3], rule = data[i + 4];
      const cur = c.getState(lx, y, lz);
      if (!ruleAllows(rule, cur, rule === W_HANGING ? c.getState(lx, y + 1, lz) : 0)) continue;
      this.setState(c.cx * 16 + lx, y, c.cz * 16 + lz, st);
    }
    if (p.ops) for (const op of p.ops) runPatchColumn(this.access, op);
    if (p.feats) for (let i = 0; i < p.feats.length; i += FEATURE_OP_SIZE) replayNetherFeature(this.access, c.cx, c.cz, p.feats, i);
    c.modified = was;
  }

  /** the loaded blocks, for column programs (-1 where no chunk is loaded) */
  readonly access: BlockAccess = {
    get: (x, y, z) => (y < MIN_Y || y >= MAX_Y ? 0 : this.getChunk(x >> 4, z >> 4) ? this.getState(x, y, z) : -1),
    set: (x, y, z, st) => void this.setState(x, y, z, st),
  };

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
    this.ensureCaveTints(c);
  }

  /** the underground biomes' tints, layer by layer (vanilla blends the biomes at the block's own height) */
  private ensureCaveTints(c: Chunk): void {
    c.caveTints = null;
    const near: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.getChunk(c.cx + dx, c.cz + dz);
        if (n?.caveBiomes) near.push(n);
      }
    if (!near.length) return;
    const r = this.biomeBlend, W = 16 + 2 * r;
    const x0 = c.cx * 16, z0 = c.cz * 16;
    const cols = new Uint32Array(W * W * 3);
    const layers: (Uint32Array | null)[] = new Array(CAVE_BIOME_LEVELS).fill(null);
    for (let qy = 0; qy < CAVE_BIOME_LEVELS; qy++) {
      let any = false;
      for (const n of near) {
        const cb = n.caveBiomes!;
        for (let i = qy << 4; i < (qy + 1) << 4 && !any; i++) if (cb[i] !== NO_CAVE_BIOME) any = true;
        if (any) break;
      }
      if (!any) continue;
      const y = MIN_Y + qy * 4;
      for (let sz = 0; sz < W; sz++)
        for (let sx = 0; sx < W; sx++) {
          const x = x0 - r + sx, z = z0 - r + sz;
          const biome = this.getChunk(x >> 4, z >> 4) ? this.getBiome3(x, y, z) : c.biomes[(Math.min(15, Math.max(0, z - z0)) << 4) | Math.min(15, Math.max(0, x - x0))];
          const i = (sz * W + sx) * 3;
          cols[i] = this.biomeColor(0, biome, x, z);
          cols[i + 1] = this.biomeColor(1, biome, x, z);
          cols[i + 2] = this.biomeColor(2, biome, x, z);
        }
      const out = new Uint32Array(768);
      const n = (2 * r + 1) * (2 * r + 1);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++)
          for (let k = 0; k < 3; k++) {
            let cr = 0, cg = 0, cb = 0;
            for (let dz = 0; dz <= 2 * r; dz++)
              for (let dx = 0; dx <= 2 * r; dx++) {
                const v = cols[((lz + dz) * W + lx + dx) * 3 + k];
                cr += v >> 16;
                cg += (v >> 8) & 255;
                cb += v & 255;
              }
            out[k * 256 + ((lz << 4) | lx)] = ((cr / n) << 16) | ((cg / n) << 8) | (cb / n);
          }
      layers[qy] = out;
    }
    c.caveTints = layers;
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
    const lightDefault = this.dim.lightDefault;
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
            light[pi] = lightDefault;
            continue;
          }
          const s = (y - MIN_Y) >> 4;
          const idx = (((y - MIN_Y) & 15) << 8) | (lz << 4) | lx;
          const bs = c.blocks[s];
          blocks[pi] = bs ? bs[idx] : 0;
          const ls = c.light[s];
          light[pi] = ls ? ls[idx] : lightDefault;
        }
      }
    }
    // tints by height where underground biomes are about: one layer per 4 blocks the padded section covers
    let tint3: MeshInput['tint3'];
    if (chunks.some((c) => c!.caveTints)) {
      const q0 = Math.max(0, (y0 - PAD - MIN_Y) >> 2), q1 = Math.min(CAVE_BIOME_LEVELS - 1, (y0 + 16 + PAD - 1 - MIN_Y) >> 2);
      const L = PS * PS, g3 = new Uint32Array((q1 - q0 + 1) * L), f3 = new Uint32Array(g3.length), w3 = new Uint32Array(g3.length);
      for (let q = q0; q <= q1; q++)
        for (let pz = -PAD; pz < 16 + PAD; pz++)
          for (let px = -PAD; px < 16 + PAD; px++) {
            const c = chunks[((pz < 0 ? -1 : pz > 15 ? 1 : 0) + 1) * 3 + ((px < 0 ? -1 : px > 15 ? 1 : 0) + 1)]!;
            const col = (pz + PAD) * PS + (px + PAD), ci = ((pz & 15) << 4) | (px & 15), o = (q - q0) * L + col;
            const layer = c.caveTints?.[q];
            g3[o] = layer ? layer[ci] : grass[col];
            f3[o] = layer ? layer[256 + ci] : foliage[col];
            w3[o] = layer ? layer[512 + ci] : water[col];
          }
      tint3 = { q0, grass: g3, foliage: f3, water: w3 };
    }
    return { blocks, light, grass, foliage, water, tint3, ox: cx * 16, oy: y0, oz: cz * 16, smooth, fancy, flatShade: this.dim.effects.constantAmbientLight };
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

let PORTAL_ID = -1;
function portalId(): number {
  if (PORTAL_ID < 0) PORTAL_ID = BLOCKS.findIndex((b) => b.name === 'nether_portal');
  return PORTAL_ID;
}
