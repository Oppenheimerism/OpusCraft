// Decides which chunks to generate/unload and which sections to mesh,
// feeding the worker pool by priority (nearest first).

import { World } from './world';
import { Chunk } from './chunk';
import { WorkerPool, Job } from '../worker/pool';
import { WorldRenderer, sectionKey } from '../render/worldRenderer';
import { SECTIONS } from './constants';
import type { SavedBlockEntity } from './blockEntity';
import type { PendingWrites } from './gen/context';

export class ChunkManager {
  renderDistance = 12;
  smoothLighting = true;
  fancyLeaves = true;
  private centerX = 0;
  private centerZ = 0;
  private readonly requested = new Set<number>();
  private genQueue: [number, number][] = [];
  private genQueueDirty = true;
  private meshList: Chunk[] = [];
  private meshListIdx = 0;
  /** loads a saved chunk (blocks + biomes) or null if never saved */
  savedLoader: ((cx: number, cz: number) => Promise<{ blocks: Uint16Array; biomes: Uint8Array; caveBiomes: Uint8Array | null; blockEntities?: SavedBlockEntity[]; genWrites: PendingWrites[]; baked: number; postProcess?: number[]; inhabitedTime?: number } | null>) | null = null;
  private readonly lightQueue: { cx: number; cz: number; blocks: Uint16Array; biomes: Uint8Array; caveBiomes: Uint8Array | null; blockEntities?: SavedBlockEntity[]; genWrites: PendingWrites[]; baked: number; postProcess?: number[]; inhabitedTime?: number }[] = [];
  onChunkLoaded: ((c: Chunk) => void) | null = null;
  onChunkUnloaded: ((c: Chunk) => void) | null = null;
  stats = { genMs: 0, gens: 0, meshes: 0 };
  paused = false;
  /** bumped when the world drops its chunks (a change of dimension): work for the old ones is thrown away */
  private epoch = 0;
  /**
   * a guest's chunks (vanilla ClientChunkCache): nothing is generated, loaded or let go here; the host's chunks come
   * through `addRemote` (lit on the workers) and go through `removeRemote`
   */
  remote = false;
  /** (remote) the latest of the host's copies of each chunk, being lit: an older one is dropped when it's done */
  private readonly remoteLatest = new Map<number, object>();
  /**
   * squares of chunks kept loaded besides the player's circle, in named groups: chunk x, z and radius (vanilla chunk
   * tickets — the dragon fight's arena, an end gateway's way out and its far side)
   */
  private readonly tickets = new Map<string, [number, number, number][]>();

  constructor(readonly world: World, readonly pool: WorkerPool, readonly renderer: WorldRenderer) {
    pool.jobSource = () => this.nextJob();
    world.onDirty = () => {
      /* picked up by mesh scan */
    };
  }

  /** forget everything queued or on its way (the world was just emptied for another dimension) */
  reset(): void {
    this.epoch++;
    this.requested.clear();
    this.remoteLatest.clear();
    this.genQueue = [];
    this.genFallback.length = 0;
    this.lightQueue.length = 0;
    this.meshList = [];
    this.meshListIdx = 0;
    this.genQueueDirty = true;
    this.centerX = this.centerZ = Number.NaN;
    this.tickets.clear();
  }

  /** keep the chunks within `t`'s radius (a square) of its chunk loaded under `name`; null lets them go */
  setTicket(name: string, t: [number, number, number] | null): void {
    this.setTickets(name, t ? [t] : []);
  }

  /** the squares kept loaded under `group` from now on (those it had and hasn't now are let go) */
  setTickets(group: string, squares: [number, number, number][]): void {
    const old = this.tickets.get(group) ?? [];
    if (old.length === squares.length && old.every((o, i) => o[0] === squares[i][0] && o[1] === squares[i][1] && o[2] === squares[i][2])) return;
    if (squares.length) this.tickets.set(group, squares.map(([x, z, r]) => [x, z, r]));
    else this.tickets.delete(group);
    this.genQueueDirty = true;
    if (old.length) this.unloadFar();
  }

  private ticketed(cx: number, cz: number): boolean {
    for (const list of this.tickets.values()) for (const [tx, tz, r] of list) if (Math.abs(cx - tx) <= r && Math.abs(cz - tz) <= r) return true;
    return false;
  }

  setCenter(x: number, z: number): void {
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.genQueueDirty = true;
      this.unloadFar();
    }
  }

  /** re-evaluate loading/unloading after a render distance change */
  refreshRadius(): void {
    this.genQueueDirty = true;
    this.unloadFar();
  }

  get loadRadius(): number {
    return this.renderDistance + 2;
  }

  private rebuildGenQueue(): void {
    if (this.remote) {
      this.genQueue = [];
      this.genQueueDirty = false;
      return;
    }
    const R = this.loadRadius;
    const q: [number, number, number][] = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R + R) continue;
        const cx = this.centerX + dx, cz = this.centerZ + dz;
        const key = Chunk.key(cx, cz);
        if (this.world.chunks.has(key) || this.requested.has(key)) continue;
        q.push([cx, cz, d2]);
      }
    for (const list of this.tickets.values())
      for (const [tx, tz, r] of list)
        for (let cz = tz - r; cz <= tz + r; cz++)
          for (let cx = tx - r; cx <= tx + r; cx++) {
            const dx = cx - this.centerX, dz = cz - this.centerZ, d2 = dx * dx + dz * dz;
            if (d2 <= R * R + R) continue; // (queued above)
            const key = Chunk.key(cx, cz);
            if (this.world.chunks.has(key) || this.requested.has(key)) continue;
            q.push([cx, cz, d2]);
          }
    q.sort((a, b) => b[2] - a[2]); // pop from end = nearest
    this.genQueue = q.map(([x, z]) => [x, z]);
    this.genQueueDirty = false;
  }

  private unloadFar(): void {
    if (this.remote) return;
    const R = this.loadRadius + 2;
    for (const c of [...this.world.chunks.values()]) {
      const dx = c.cx - this.centerX, dz = c.cz - this.centerZ;
      if (dx * dx + dz * dz > R * R + R && !this.ticketed(c.cx, c.cz)) {
        this.onChunkUnloaded?.(c);
        this.world.removeChunk(c.cx, c.cz);
        this.renderer.disposeChunk(c.cx, c.cz);
      }
    }
  }

  /** Called every frame. */
  update(): void {
    if (this.genQueueDirty) this.rebuildGenQueue();
    // rebuild mesh candidate list: chunks with dirty sections within render distance
    const list: Chunk[] = [];
    const R = this.renderDistance + 1;
    for (const c of this.world.chunks.values()) {
      if (!c.dirty) continue;
      const dx = c.cx - this.centerX, dz = c.cz - this.centerZ;
      if (dx * dx + dz * dz > R * R + R) continue;
      if (!this.world.hasAllNeighbours(c.cx, c.cz)) continue;
      list.push(c);
    }
    list.sort((a, b) => {
      const da = (a.cx - this.centerX) ** 2 + (a.cz - this.centerZ) ** 2;
      const db = (b.cx - this.centerX) ** 2 + (b.cz - this.centerZ) ** 2;
      return da - db;
    });
    this.meshList = list;
    this.meshListIdx = 0;
    if (!this.paused) this.pool.pump();
  }

  private nextJob(): Job | null {
    // saved chunks waiting for lighting first
    const lj = this.lightQueue.shift();
    if (lj) {
      const key = Chunk.key(lj.cx, lj.cz);
      const epoch = this.epoch;
      return {
        type: 'light',
        cx: lj.cx,
        cz: lj.cz,
        blocks: lj.blocks,
        sky: this.world.dim.hasSkyLight,
        done: (light) => {
          if (epoch !== this.epoch) return;
          // (remote: a chunk the host forgot, or sent again, while this was being lit)
          if (this.remote) {
            if (this.remoteLatest.get(key) !== lj) return;
            this.remoteLatest.delete(key);
          }
          this.requested.delete(key);
          if (this.world.chunks.has(key)) return;
          const c = this.world.addChunk({ cx: lj.cx, cz: lj.cz, blocks: lj.blocks, light, biomes: lj.biomes, caveBiomes: lj.caveBiomes, pending: lj.genWrites, baked: lj.baked, blockEntities: lj.blockEntities, postProcess: lj.postProcess, inhabitedTime: lj.inhabitedTime });
          this.onChunkLoaded?.(c);
        },
      };
    }
    // prefer meshing nearby sections; interleave with generation
    const mesh = this.nextMeshJob();
    if (mesh) return mesh;
    return this.nextGenJob();
  }

  private nextGenJob(): Job | null {
    if (this.remote) return null;
    while (this.genQueue.length) {
      const [cx, cz] = this.genQueue.pop()!;
      const key = Chunk.key(cx, cz);
      if (this.world.chunks.has(key) || this.requested.has(key)) continue;
      this.requested.add(key);
      if (this.savedLoader) {
        // check storage first; fall back to generation
        const epoch = this.epoch;
        void this.savedLoader(cx, cz).then((saved) => {
          if (epoch !== this.epoch) return;
          if (saved) {
            this.lightQueue.push({ cx, cz, blocks: saved.blocks, biomes: saved.biomes, caveBiomes: saved.caveBiomes, blockEntities: saved.blockEntities, genWrites: saved.genWrites, baked: saved.baked, postProcess: saved.postProcess, inhabitedTime: saved.inhabitedTime });
            this.pool.pump();
          } else {
            this.genFallback.push([cx, cz]);
            this.pool.pump();
          }
        });
        continue;
      }
      return this.genJob(cx, cz, key);
    }
    const fb = this.genFallback.shift();
    if (fb) return this.genJob(fb[0], fb[1], Chunk.key(fb[0], fb[1]));
    return null;
  }

  private readonly genFallback: [number, number][] = [];

  /** (remote) a chunk from the host: lit on a worker, then into the world (onChunkLoaded) */
  addRemote(cx: number, cz: number, blocks: Uint16Array, biomes: Uint8Array, caveBiomes: Uint8Array | null, blockEntities: SavedBlockEntity[]): void {
    const key = Chunk.key(cx, cz);
    for (let i = this.lightQueue.length - 1; i >= 0; i--) if (this.lightQueue[i].cx === cx && this.lightQueue[i].cz === cz) this.lightQueue.splice(i, 1);
    this.requested.add(key);
    const lj = { cx, cz, blocks, biomes, caveBiomes, blockEntities, genWrites: [], baked: 0x1ff };
    this.remoteLatest.set(key, lj);
    this.lightQueue.push(lj);
    this.pool.pump();
  }

  /** (remote) the host forgot a chunk: out of the world, or not wanted after all if it's still being lit */
  removeRemote(cx: number, cz: number): void {
    const key = Chunk.key(cx, cz);
    this.requested.delete(key);
    this.remoteLatest.delete(key);
    for (let i = this.lightQueue.length - 1; i >= 0; i--) if (this.lightQueue[i].cx === cx && this.lightQueue[i].cz === cz) this.lightQueue.splice(i, 1);
    const c = this.world.getChunk(cx, cz);
    if (!c) return;
    this.onChunkUnloaded?.(c);
    this.world.removeChunk(cx, cz);
    this.renderer.disposeChunk(cx, cz);
  }

  private genJob(cx: number, cz: number, key: number): Job {
      const epoch = this.epoch;
      return {
        type: 'gen',
        dim: this.world.dim.id,
        cx,
        cz,
        done: (r) => {
          if (epoch !== this.epoch) return;
          this.requested.delete(key);
          const dx = cx - this.centerX, dz = cz - this.centerZ;
          const R = this.loadRadius + 2;
          if (dx * dx + dz * dz > R * R + R && !this.ticketed(cx, cz)) return; // moved away
          if (this.world.chunks.has(key)) return;
          this.stats.genMs += r.ms;
          this.stats.gens++;
          const c = this.world.addChunk(r);
          this.onChunkLoaded?.(c);
        },
      };
  }

  private nextMeshJob(): Job | null {
    while (this.meshListIdx < this.meshList.length) {
      const c = this.meshList[this.meshListIdx];
      if (!this.world.chunks.has(c.key) || !c.dirty) {
        this.meshListIdx++;
        continue;
      }
      // pick lowest dirty bit not currently meshing
      let si = -1;
      for (let s = 0; s < SECTIONS; s++) {
        if (c.dirty & (1 << s) && !(c.meshing & (1 << s))) {
          si = s;
          break;
        }
      }
      if (si < 0) {
        this.meshListIdx++;
        continue;
      }
      c.dirty &= ~(1 << si);
      // empty sections (all air) produce no mesh; skip the worker round-trip
      if (!c.blocks[si] && !this.neighbourSectionHasBlocks(c, si)) {
        this.renderer.dispose(sectionKey(c.cx, si, c.cz));
        c.meshed |= 1 << si;
        continue;
      }
      const input = this.world.buildMeshInput(c.cx, si, c.cz, this.smoothLighting, this.fancyLeaves);
      if (!input) continue;
      c.meshing |= 1 << si;
      const cx = c.cx, cz = c.cz;
      return {
        type: 'mesh',
        input,
        done: (r) => {
          c.meshing &= ~(1 << si);
          if (!this.world.chunks.has(c.key) || this.world.getChunk(cx, cz) !== c) return;
          this.stats.meshes++;
          this.renderer.upload(cx, si, cz, r.layers, r.quads, r.centers);
          c.meshed |= 1 << si;
        },
      };
    }
    return null;
  }

  private neighbourSectionHasBlocks(c: Chunk, si: number): boolean {
    // fluids/models in the section itself are needed; if the section is empty, nothing to draw
    return false;
  }

  pendingGen(): number {
    return this.requested.size + this.genQueue.length;
  }

  /** Force remesh of everything (e.g. after changing smooth lighting). */
  remeshAll(): void {
    for (const c of this.world.chunks.values()) c.dirty = (1 << SECTIONS) - 1;
  }

  /**
   * Is the area around (x,z) generated and meshed (for spawning)? (`counts`: which of its chunks count, by how far each
   * is from (x,z)'s: a guest's, only those the host sends it)
   */
  isReady(x: number, z: number, radius: number, counts?: (dx: number, dz: number) => boolean): boolean {
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (counts && !counts(dx, dz)) continue;
        const c = this.world.getChunk(cx + dx, cz + dz);
        if (!c) return false;
        if (dx * dx + dz * dz <= (radius - 1) * (radius - 1) && c.dirty) return false;
      }
    return true;
  }
}
