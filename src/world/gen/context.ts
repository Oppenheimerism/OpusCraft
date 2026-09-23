// Generation-time chunk access used by surface rules and features.
// Writes outside the chunk are recorded as pending writes for neighbours.

import { MIN_Y, MAX_Y, colIndex, caveBiomeIndex, NO_CAVE_BIOME } from '../constants';
import { FLAGS, F_AIR, F_REPLACEABLE, F_LEAVES, STATE_BLOCK, BLOCKS, F_WATER, F_OPAQUE, F_COLLIDE } from '../block';
import type { SavedBlockEntity } from '../blockEntity';
import type { SavedEntity } from '../../entity/mob';

/** Write rules (applied at write time against the current target block). */
export const W_ANY = 0, // unconditional
  W_REPLACEABLE = 1, // air / replaceable plants / snow layer
  W_LOG = 2, // replaceable or leaves
  W_ORE_STONE = 3, // stone, granite, diorite, andesite
  W_ORE_DEEP = 4, // deepslate, tuff
  W_AIR = 5, // only air
  W_BASE_STONE = 6, // any base stone (stone, deepslate, granite...) -> for blobs
  W_WATER_OR_AIR = 7;

export interface PendingWrites {
  cx: number;
  cz: number;
  /** packed [lx, y, lz, state, rule] */
  data: number[];
}

let BASE_STONE: Set<number> | null = null;
let ORE_STONE: Set<number> | null = null;
let ORE_DEEP: Set<number> | null = null;

function blockSets(): void {
  if (BASE_STONE) return;
  const ids = (names: string[]) => new Set(names.map((n) => BLOCKS.findIndex((b) => b.name === n)).filter((i) => i >= 0));
  ORE_STONE = ids(['stone', 'granite', 'diorite', 'andesite']);
  ORE_DEEP = ids(['deepslate', 'tuff']);
  BASE_STONE = ids(['stone', 'granite', 'diorite', 'andesite', 'deepslate', 'tuff']);
}

export function ruleAllows(rule: number, target: number): boolean {
  blockSets();
  const f = FLAGS[target];
  switch (rule) {
    case W_ANY: return true;
    case W_REPLACEABLE: return (f & (F_AIR | F_REPLACEABLE)) !== 0 && (f & F_WATER) === 0;
    case W_LOG: return ((f & (F_AIR | F_REPLACEABLE | F_LEAVES)) !== 0) && (f & F_WATER) === 0 || (f & F_LEAVES) !== 0;
    case W_ORE_STONE: return ORE_STONE!.has(STATE_BLOCK[target]);
    case W_ORE_DEEP: return ORE_DEEP!.has(STATE_BLOCK[target]);
    case W_AIR: return (f & F_AIR) !== 0;
    case W_BASE_STONE: return BASE_STONE!.has(STATE_BLOCK[target]);
    case W_WATER_OR_AIR: return (f & F_AIR) !== 0 || (f & F_WATER) !== 0 && (f & F_COLLIDE) === 0;
  }
  return false;
}

export class GenContext {
  readonly x0: number;
  readonly z0: number;
  /** full column blocks, index colIndex(lx, y, lz) */
  readonly blocks: Uint16Array;
  readonly biomes: Uint8Array; // per column (256)
  /** highest non-air y+1 per column (WORLD_SURFACE) */
  readonly surface: Int16Array;
  /** highest motion-blocking (solid or fluid) y+1 */
  readonly motion: Int16Array;
  /** ocean floor: highest solid (non-fluid, collidable) y+1 */
  readonly oceanFloor: Int16Array;
  private pending = new Map<number, PendingWrites>();
  /** fluids placed by features that must start flowing when the chunk loads (packed lx, y, lz) */
  readonly fluidTicks: number[] = [];
  /** block entities placed by features (dungeon chests and spawners) */
  readonly blockEntities: SavedBlockEntity[] = [];
  /** entities placed by structures (mineshaft chest minecarts), in the saved-entity format */
  readonly entities: SavedEntity[] = [];
  /** blocks whose connections are fixed up against their neighbours on load (packed lx, y, lz) */
  readonly postProcess: number[] = [];

  constructor(readonly cx: number, readonly cz: number, blocks: Uint16Array, biomes: Uint8Array, readonly caveBiomes: Uint8Array | null = null) {
    this.x0 = cx * 16;
    this.z0 = cz * 16;
    this.blocks = blocks;
    this.biomes = biomes;
    this.surface = new Int16Array(256);
    this.motion = new Int16Array(256);
    this.oceanFloor = new Int16Array(256);
  }

  inChunk(x: number, z: number): boolean {
    return x >= this.x0 && x < this.x0 + 16 && z >= this.z0 && z < this.z0 + 16;
  }

  /** get block at world coords; outside the chunk returns -1 (unknown) */
  get(x: number, y: number, z: number): number {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx > 15 || lz > 15) return -1;
    return this.blocks[colIndex(lx, y, lz)];
  }

  /** like get but unknown → air */
  getOrAir(x: number, y: number, z: number): number {
    const s = this.get(x, y, z);
    return s < 0 ? 0 : s;
  }

  set(x: number, y: number, z: number, state: number, rule = W_ANY): boolean {
    if (y < MIN_Y || y >= MAX_Y) return false;
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx > 15 || lz > 15) {
      const ncx = Math.floor(x / 16), ncz = Math.floor(z / 16);
      if (Math.abs(ncx - this.cx) > 1 || Math.abs(ncz - this.cz) > 1) return false;
      const key = (ncx - this.cx + 1) * 3 + (ncz - this.cz + 1);
      let p = this.pending.get(key);
      if (!p) {
        p = { cx: ncx, cz: ncz, data: [] };
        this.pending.set(key, p);
      }
      p.data.push(x - ncx * 16, y, z - ncz * 16, state, rule);
      return true;
    }
    const i = colIndex(lx, y, lz);
    if (!ruleAllows(rule, this.blocks[i])) return false;
    this.blocks[i] = state;
    const ci = (lz << 4) | lx;
    if (state !== 0 && y + 1 > this.surface[ci]) this.surface[ci] = y + 1;
    const f = FLAGS[state];
    if ((f & (F_COLLIDE | F_WATER)) && y + 1 > this.motion[ci]) this.motion[ci] = y + 1;
    return true;
  }

  /** vanilla ChunkAccess.markPosForPostprocessing (fences placed by structures) */
  markForPostprocessing(x: number, y: number, z: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx > 15 || lz > 15) return;
    this.postProcess.push(lx, y, lz);
  }

  /** vanilla scheduleTick / markPosForPostprocessing for a generated fluid */
  scheduleFluid(x: number, y: number, z: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx > 15 || lz > 15) return;
    this.fluidTicks.push(lx, y, lz);
  }

  pendingWrites(): PendingWrites[] {
    return [...this.pending.values()];
  }

  biomeAt(x: number, z: number): number {
    const lx = Math.min(15, Math.max(0, x - this.x0)), lz = Math.min(15, Math.max(0, z - this.z0));
    return this.biomes[(lz << 4) | lx];
  }

  /** the biome at a block, underground biomes included (vanilla getBiome for a 3D position) */
  biomeAt3(x: number, y: number, z: number): number {
    const lx = Math.min(15, Math.max(0, x - this.x0)), lz = Math.min(15, Math.max(0, z - this.z0));
    if (this.caveBiomes && y >= MIN_Y && y < MAX_Y) {
      const b = this.caveBiomes[caveBiomeIndex(lx, y, lz)];
      if (b !== NO_CAVE_BIOME) return b;
    }
    return this.biomes[(lz << 4) | lx];
  }

  /** recompute heightmaps from blocks */
  computeHeightmaps(): void {
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const ci = (lz << 4) | lx;
        let s = MIN_Y, m = MIN_Y, o = MIN_Y;
        for (let y = MAX_Y - 1; y >= MIN_Y; y--) {
          const st = this.blocks[colIndex(lx, y, lz)];
          if (st === 0) continue;
          if (s === MIN_Y) s = y + 1;
          const f = FLAGS[st];
          if (m === MIN_Y && (f & (F_COLLIDE | F_WATER))) m = y + 1;
          if ((f & F_COLLIDE) && !(f & F_WATER && !(f & F_OPAQUE))) {
            o = y + 1;
            break;
          }
        }
        this.surface[ci] = s;
        this.motion[ci] = m;
        this.oceanFloor[ci] = o;
      }
  }

  heightSurface(x: number, z: number): number {
    const lx = x - this.x0, lz = z - this.z0;
    return this.surface[(lz << 4) | lx];
  }
  heightMotion(x: number, z: number): number {
    const lx = x - this.x0, lz = z - this.z0;
    return this.motion[(lz << 4) | lx];
  }
  heightOceanFloor(x: number, z: number): number {
    const lx = x - this.x0, lz = z - this.z0;
    return this.oceanFloor[(lz << 4) | lx];
  }
}
