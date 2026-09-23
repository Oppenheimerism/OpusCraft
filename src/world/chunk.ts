// Chunk column storage (main thread). Sections are allocated lazily.

import { MIN_Y, MAX_Y, SECTIONS } from './constants';
import type { SavedEntity } from '../entity/mob';
import type { PendingWrites } from './gen/context';

export const LIGHT_DEFAULT = 0xf0; // sky 15, block 0

export class Chunk {
  readonly blocks: (Uint16Array | null)[] = new Array(SECTIONS).fill(null);
  readonly light: (Uint8Array | null)[] = new Array(SECTIONS).fill(null);
  readonly nonAir = new Uint16Array(SECTIONS);
  biomes: Uint8Array = new Uint8Array(256);
  /** underground biomes per quart (constants caveBiomeIndex), null when all of it has the surface biome */
  caveBiomes: Uint8Array | null = null;
  /** highest opacity>0 block + 1 per column (for sky light & rain) */
  readonly heightmap = new Int16Array(256);
  /** blended biome tints per column (computed when neighbours are present) */
  grassTint: Uint32Array | null = null;
  foliageTint: Uint32Array | null = null;
  waterTint: Uint32Array | null = null;
  /** tints for the layers of 4 blocks that have underground biomes about (grass, foliage, water x 256), else null */
  caveTints: (Uint32Array | null)[] | null = null;
  /** true once lighting has been merged with neighbours at least once */
  lightMerged = false;
  /** sections that need remeshing (bitmask) */
  dirty = 0;
  /** sections that have a mesh (or were meshed empty) */
  meshed = 0;
  meshing = 0;
  /** modified since load/save */
  modified = false;
  /** generated fluids waiting to be ticked by the level (packed lx, y, lz) */
  fluidTicks: number[] | null = null;
  /** structure entities from generation, added once (vanilla ProtoChunk entities) */
  genEntities: SavedEntity[] | null = null;
  /** generated fences to connect once loaded (packed lx, y, lz) */
  postProcess: number[] | null = null;
  inhabitedTime = 0;
  /** this chunk's generation writes into its neighbours (tree leaves, patch columns...), kept so a
   * neighbour that is generated again, or loads later, still gets them */
  genWrites: PendingWrites[] = [];
  /** neighbours whose generation writes these blocks already have (bits World.nbBit) */
  baked = 0;
  constructor(readonly cx: number, readonly cz: number) {}

  static key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  get key(): number {
    return Chunk.key(this.cx, this.cz);
  }

  /** local x,z in 0..15, world y */
  getState(x: number, y: number, z: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const s = this.blocks[(y - MIN_Y) >> 4];
    if (!s) return 0;
    return s[(((y - MIN_Y) & 15) << 8) | (z << 4) | x];
  }

  setState(x: number, y: number, z: number, state: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const si = (y - MIN_Y) >> 4;
    let s = this.blocks[si];
    if (!s) {
      if (state === 0) return 0;
      s = new Uint16Array(4096);
      this.blocks[si] = s;
    }
    const i = (((y - MIN_Y) & 15) << 8) | (z << 4) | x;
    const old = s[i];
    if (old === state) return old;
    s[i] = state;
    if (old === 0) this.nonAir[si]++;
    else if (state === 0) this.nonAir[si]--;
    this.modified = true;
    return old;
  }

  getLight(x: number, y: number, z: number): number {
    if (y >= MAX_Y) return LIGHT_DEFAULT;
    if (y < MIN_Y) return 0;
    const l = this.light[(y - MIN_Y) >> 4];
    if (!l) return LIGHT_DEFAULT;
    return l[(((y - MIN_Y) & 15) << 8) | (z << 4) | x];
  }

  setLight(x: number, y: number, z: number, v: number): void {
    if (y < MIN_Y || y >= MAX_Y) return;
    const si = (y - MIN_Y) >> 4;
    let l = this.light[si];
    if (!l) {
      if (v === LIGHT_DEFAULT) return;
      l = new Uint8Array(4096).fill(LIGHT_DEFAULT);
      this.light[si] = l;
    }
    l[(((y - MIN_Y) & 15) << 8) | (z << 4) | x] = v;
  }

  /** Load from full-column generator output. */
  loadColumn(blocks: Uint16Array, light: Uint8Array, biomes: Uint8Array): void {
    for (let s = 0; s < SECTIONS; s++) {
      const b = blocks.subarray(s * 4096, (s + 1) * 4096);
      let n = 0;
      for (let i = 0; i < 4096; i++) if (b[i] !== 0) n++;
      this.nonAir[s] = n;
      this.blocks[s] = n > 0 ? new Uint16Array(b) : null;
      const l = light.subarray(s * 4096, (s + 1) * 4096);
      let uniform = true;
      for (let i = 0; i < 4096; i++)
        if (l[i] !== LIGHT_DEFAULT) {
          uniform = false;
          break;
        }
      this.light[s] = uniform ? null : new Uint8Array(l);
    }
    this.biomes = biomes;
    this.recomputeHeightmap();
  }

  recomputeHeightmap(): void {
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) this.heightmap[(z << 4) | x] = this.computeHeight(x, z);
  }

  computeHeight(x: number, z: number): number {
    for (let s = SECTIONS - 1; s >= 0; s--) {
      const b = this.blocks[s];
      if (!b || this.nonAir[s] === 0) continue;
      for (let ly = 15; ly >= 0; ly--) {
        if (b[(ly << 8) | (z << 4) | x] !== 0 && blocksSky(b[(ly << 8) | (z << 4) | x])) return MIN_Y + s * 16 + ly + 1;
      }
    }
    return MIN_Y;
  }
}

import { OPACITY, FLAGS, F_COLLIDE, F_WATER, F_LAVA } from './block';
export function blocksSky(state: number): boolean {
  return OPACITY[state] > 0 || (FLAGS[state] & (F_COLLIDE | F_WATER | F_LAVA)) !== 0;
}
