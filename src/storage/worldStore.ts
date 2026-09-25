// World persistence in IndexedDB. Chunks use per-section palettes of
// block-state strings (like vanilla's region format) so saves survive
// changes to the internal state-id layout.

import { BLOCKS, STATE_BLOCK, BLOCK_BY_NAME } from '../world/block';
import { BIOMES, BIOME_ID } from '../world/gen/biomes';
import type { Chunk } from '../world/chunk';
import { SECTIONS, NO_CAVE_BIOME } from '../world/constants';
import type { SavedBlockEntity } from '../world/blockEntity';
import type { SavedEntity } from '../entity/mob';
import type { SavedStack } from '../item/item';
import type { PendingWrites } from '../world/gen/context';
import { VEG_BLOCK, type PatchColumn } from '../world/gen/patches';

export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  gameMode: string;
  difficulty: string;
  hardcore: boolean;
  allowCommands: boolean;
  created: number;
  lastPlayed: number;
  dayTime: number;
  gameTime: number;
  raining: boolean;
  thundering: boolean;
  rainTime: number;
  thunderTime: number;
  clearWeatherTime: number;
  player: {
    x: number; y: number; z: number; yaw: number; pitch: number;
    health: number; food: number; saturation: number; exhaustion: number;
    xpLevel: number; xpProgress: number; xpTotal: number;
    /** vanilla XpSeed: the enchanting table's offer seed */
    xpSeed?: number;
    /** vanilla UUID: who the player is to the villagers that gossip about them */
    uuid?: string;
    gameMode: string; flying: boolean; selected: number;
    inventory: (SavedStack | null)[];
    armor: (SavedStack | null)[];
    spawn: [number, number, number];
    /** bed / spawnpoint: x, y, z, forced (1/0) */
    respawn?: [number, number, number, number] | null;
    /** advancement id → criteria obtained */
    advancements?: Record<string, string[]>;
    recipeBook?: import('../inventory/recipeBook').RecipeBookSave;
    dead?: boolean;
    /** the minecart the player sits in (vanilla RootVehicle), kept out of chunk storage */
    vehicle?: SavedEntity | null;
    /** vanilla active_effects */
    effects?: import('../entity/effects').SavedEffect[];
    /** the dimension the player is in (absent: the overworld) */
    dimension?: string;
    /** vanilla seenCredits: they've left the End through its exit portal once (the credits roll only the first time) */
    seenCredits?: boolean;
    /** vanilla ShoulderEntityLeft / ShoulderEntityRight: the parrots riding on its shoulders */
    shoulderLeft?: SavedEntity | null;
    shoulderRight?: SavedEntity | null;
  } | null;
  /** nether portal blocks per dimension (vanilla POI records), as x, y, z triples */
  portals?: Record<string, number[]>;
  /** entities gone through an end portal to a dimension that wasn't loaded, by the chunk they arrive in (game/endTravel.ts) */
  arrivals?: Record<string, { entity: SavedEntity; surface?: boolean }[]>;
  /** vanilla level.dat DragonFight: the End's dragon fight (game/endDragonFight.ts) */
  dragonFight?: import('../game/endDragonFight').DragonFightData;
  /** (Stage 4: raids) vanilla data/raids.dat, every dimension's (game/raids.ts) */
  raids?: import('../game/raids').RaidsData;
  /** vanilla level.dat WanderingTraderSpawnDelay, WanderingTraderSpawnChance and WanderingTraderId */
  wanderingTrader?: import('../game/wanderingTraderSpawner').WanderingTraderData;
  version: number;
  /** quick-test worlds are never written to storage */
  transient?: boolean;
  /** cheats flag shown in the world list */
  structures?: boolean;
  bonusChest?: boolean;
  gameRules?: Record<string, boolean | number>;
  worldSpawn?: [number, number, number];
  /** vanilla data/idcounts.dat: the last map id handed out (the maps are records of their own, see saveWorldData) */
  lastMapId?: number;
}

export interface SavedChunk {
  key: string;
  blockEntities?: SavedBlockEntity[];
  sections: ({ palette: string[]; data: Uint8Array | Uint16Array } | null)[];
  biomes: string[];
  biomeData: Uint8Array;
  /** underground biomes per quart: names, and a palette index per quart (255 = the surface biome) */
  caveBiomes?: string[];
  caveBiomeData?: Uint8Array;
  /** the chunk's generation writes into its neighbours, packed (packGenWrites; states as indices into genPalette) */
  genWrites?: { cx: number; cz: number; data: Int32Array; ops?: Int32Array; feats?: Int32Array }[];
  genPalette?: string[];
  /** neighbours whose generation writes the blocks already have */
  baked?: number;
  /** structure blocks still waiting for their neighbours to take their shape (packed lx, y, lz) */
  postProcess?: number[];
  /** vanilla InhabitedTime: ticks a player has spent near the chunk (regional difficulty) */
  inhabitedTime?: number;
}

const DB_NAME = 'mcreplica';
const DB_VERSION = 2;

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks', { keyPath: 'key' });
      // per-chunk entity lists (vanilla keeps entities in separate region files too)
      if (!d.objectStoreNames.contains('entities')) d.createObjectStore('entities', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function listWorlds(): Promise<WorldMeta[]> {
  const all = (await tx<WorldMeta[]>('worlds', 'readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

/** more of a world to write whenever its meta is (the maps, game/mapData.ts) */
type MetaSaveHook = (m: WorldMeta) => Promise<void>;
const metaSaveHooks: MetaSaveHook[] = [];

export function onWorldMetaSave(h: MetaSaveHook): void {
  metaSaveHooks.push(h);
}

export async function saveWorldMeta(m: WorldMeta): Promise<void> {
  for (const h of metaSaveHooks) await h(m);
  await tx('worlds', 'readwrite', (s) => s.put(m));
}

export async function getWorldMeta(id: string): Promise<WorldMeta | undefined> {
  return tx<WorldMeta>('worlds', 'readonly', (s) => s.get(id));
}

export async function deleteWorld(id: string): Promise<void> {
  await tx('worlds', 'readwrite', (s) => s.delete(id));
  const range = IDBKeyRange.bound(id + '/', id + '/￿');
  await tx('chunks', 'readwrite', (s) => s.delete(range));
  await tx('entities', 'readwrite', (s) => s.delete(range));
}

export interface SavedEntityChunk {
  key: string;
  entities: SavedEntity[];
}

export async function entityChunkKeys(worldId: string): Promise<Set<string>> {
  const range = IDBKeyRange.bound(worldId + '/', worldId + '/￿');
  const keys = (await tx<IDBValidKey[]>('entities', 'readonly', (s) => s.getAllKeys(range))) ?? [];
  return new Set(keys.map((k) => String(k)));
}

export async function saveEntityChunks(list: SavedEntityChunk[]): Promise<void> {
  if (!list.length) return;
  await tx('entities', 'readwrite', (s) => {
    for (const c of list) s.put(c);
  });
}

export async function loadEntityChunk(key: string): Promise<SavedEntityChunk | undefined> {
  return tx<SavedEntityChunk>('entities', 'readonly', (s) => s.get(key));
}

export async function savedChunkKeys(worldId: string): Promise<Set<string>> {
  const range = IDBKeyRange.bound(worldId + '/', worldId + '/￿');
  const keys = (await tx<IDBValidKey[]>('chunks', 'readonly', (s) => s.getAllKeys(range))) ?? [];
  return new Set(keys.map((k) => String(k)));
}

/** `prefix`: the dimension's storage prefix ('' for the overworld, 'nether/' for the Nether) */
export function chunkKey(worldId: string, cx: number, cz: number, prefix = ''): string {
  return `${worldId}/${prefix}${cx},${cz}`;
}

// ---------------------------------------------------------------------------
// (De)serialization

export function stateToString(st: number): string {
  const b = BLOCKS[STATE_BLOCK[st]];
  if (!b.props.length) return b.name;
  const vals = b.values(st);
  return b.name + '[' + b.props.map((p, i) => `${p.name}=${vals[i]}`).join(',') + ']';
}

const stateCache = new Map<string, number>();
export function stateFromString(s: string): number {
  const c = stateCache.get(s);
  if (c !== undefined) return c;
  const i = s.indexOf('[');
  const name = i < 0 ? s : s.slice(0, i);
  const b = BLOCK_BY_NAME.get(name);
  let st = 0;
  if (b) {
    st = b.defaultState;
    if (i >= 0) {
      for (const kv of s.slice(i + 1, -1).split(',')) {
        const [k, v] = kv.split('=');
        const pi = b.propIndex(k);
        if (pi < 0) continue;
        const prop = b.props[pi];
        const val = prop.values.find((x) => String(x) === v);
        if (val !== undefined) st = b.with(st, k, val);
      }
    }
  }
  stateCache.set(s, st);
  return st;
}

export function serializeChunk(worldId: string, c: Chunk, blockEntities: SavedBlockEntity[] = [], prefix = ''): SavedChunk {
  const sections: SavedChunk['sections'] = [];
  for (let si = 0; si < SECTIONS; si++) {
    const b = c.blocks[si];
    if (!b || c.nonAir[si] === 0) {
      sections.push(null);
      continue;
    }
    const map = new Map<number, number>();
    const palette: string[] = [];
    const data = new Uint16Array(4096);
    for (let i = 0; i < 4096; i++) {
      const st = b[i];
      let pi = map.get(st);
      if (pi === undefined) {
        pi = palette.length;
        map.set(st, pi);
        palette.push(stateToString(st));
      }
      data[i] = pi;
    }
    sections.push({ palette, data: palette.length <= 256 ? Uint8Array.from(data) : data });
  }
  const biomeNames: string[] = [];
  const bmap = new Map<number, number>();
  const bd = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const id = c.biomes[i];
    let pi = bmap.get(id);
    if (pi === undefined) {
      pi = biomeNames.length;
      bmap.set(id, pi);
      biomeNames.push(BIOMES[id]?.name ?? 'plains');
    }
    bd[i] = pi;
  }
  const out: SavedChunk = { key: chunkKey(worldId, c.cx, c.cz, prefix), sections, biomes: biomeNames, biomeData: bd, blockEntities };
  if (c.postProcess?.length) out.postProcess = c.postProcess.slice();
  if (c.inhabitedTime) out.inhabitedTime = c.inhabitedTime;
  if (c.caveBiomes) {
    const names: string[] = [];
    const cmap = new Map<number, number>();
    out.caveBiomeData = c.caveBiomes.map((id) => {
      if (id === NO_CAVE_BIOME) return NO_CAVE_BIOME;
      let pi = cmap.get(id);
      if (pi === undefined) {
        pi = names.length;
        cmap.set(id, pi);
        names.push(BIOMES[id]?.name ?? 'plains');
      }
      return pi;
    });
    out.caveBiomes = names;
  }
  if (c.genWrites.length) {
    const palette: string[] = [];
    const pmap = new Map<number, number>();
    const pal = (st: number) => {
      let pi = pmap.get(st);
      if (pi === undefined) {
        pi = palette.length;
        pmap.set(st, pi);
        palette.push(stateToString(st));
      }
      return pi;
    };
    out.genWrites = c.genWrites.map((p) => {
      // one int per write: lx, lz, y + 64, state, rule
      const data = new Int32Array(p.data.length / 5);
      for (let i = 0, k = 0; i < p.data.length; i += 5, k++) data[k] = p.data[i] | (p.data[i + 2] << 4) | ((p.data[i + 1] + 64) << 8) | (pal(p.data[i + 3]) << 17) | (p.data[i + 4] << 27);
      return { cx: p.cx, cz: p.cz, data, ops: p.ops && packOps(p.ops, pal), feats: p.feats && Int32Array.from(p.feats) };
    });
    out.genPalette = palette;
  }
  out.baked = c.baked;
  return out;
}

/** the block states in a vegetation program (patches VEG_BLOCK / VEG_COLUMN) mapped through f */
function mapVegStates(veg: number[], f: (st: number) => number): number[] {
  if (veg[0] === VEG_BLOCK) return [veg[0], f(veg[1])];
  return [veg[0], veg[1], veg[2], ...veg.slice(3).map(f)];
}

/** patch columns as ints: x, z, y, flags (ceiling 1, pool 2), range, depth, ground, replace, then the plant program's length and the program */
function packOps(ops: PatchColumn[], pal: (st: number) => number): Int32Array {
  const out: number[] = [];
  for (const o of ops) {
    out.push(o.x, o.z, o.y, (o.ceiling ? 1 : 0) | (o.pool ? 2 : 0), o.range, o.depth, pal(o.ground), o.replace);
    const veg = o.veg ? mapVegStates(o.veg, pal) : [];
    out.push(veg.length, ...veg);
  }
  return Int32Array.from(out);
}

function unpackOps(a: Int32Array, state: (i: number) => number): PatchColumn[] {
  const ops: PatchColumn[] = [];
  for (let i = 0; i < a.length; ) {
    const [x, z, y, flags, range, depth, ground, replace, n] = a.subarray(i, i + 9);
    const veg = n ? mapVegStates(Array.from(a.subarray(i + 9, i + 9 + n)), state) : null;
    ops.push({ x, z, y, ceiling: (flags & 1) !== 0, pool: (flags & 2) !== 0, range, depth, ground: state(ground), replace, veg });
    i += 9 + n;
  }
  return ops;
}

/** Returns a full-column blocks array + biomes. */
export function deserializeChunk(s: SavedChunk): { blocks: Uint16Array; biomes: Uint8Array; caveBiomes: Uint8Array | null; blockEntities: SavedBlockEntity[]; genWrites: PendingWrites[]; baked: number; postProcess?: number[]; inhabitedTime: number } {
  const blocks = new Uint16Array(SECTIONS * 4096);
  s.sections.forEach((sec, si) => {
    if (!sec) return;
    const ids = sec.palette.map(stateFromString);
    const off = si * 4096;
    for (let i = 0; i < 4096; i++) blocks[off + i] = ids[sec.data[i]];
  });
  const biomes = new Uint8Array(256);
  const bids = s.biomes.map((n) => BIOME_ID[n] ?? 1);
  for (let i = 0; i < 256; i++) biomes[i] = bids[s.biomeData[i]];
  let caveBiomes: Uint8Array | null = null;
  if (s.caveBiomes && s.caveBiomeData) {
    const cids = s.caveBiomes.map((n) => BIOME_ID[n] ?? NO_CAVE_BIOME);
    caveBiomes = s.caveBiomeData.map((pi) => (pi === NO_CAVE_BIOME ? NO_CAVE_BIOME : cids[pi]));
  }
  const gp = (s.genPalette ?? []).map(stateFromString);
  const genWrites: PendingWrites[] = (s.genWrites ?? []).map((p) => {
    const data: number[] = [];
    for (const v of p.data) data.push(v & 15, ((v >> 8) & 511) - 64, (v >> 4) & 15, gp[(v >> 17) & 1023], (v >> 27) & 15);
    return { cx: p.cx, cz: p.cz, data, ops: p.ops && unpackOps(p.ops, (i) => gp[i]), feats: p.feats && Array.from(p.feats) };
  });
  // (saves from before this was kept: the neighbours' writes were in, as far as can be known)
  return { blocks, biomes, caveBiomes, blockEntities: s.blockEntities ?? [], genWrites, baked: s.baked ?? 0x1ef, postProcess: s.postProcess, inhabitedTime: s.inhabitedTime ?? 0 };
}

export async function saveChunks(list: SavedChunk[]): Promise<void> {
  if (!list.length) return;
  await tx('chunks', 'readwrite', (s) => {
    for (const c of list) s.put(c);
  });
}

export async function loadChunk(key: string): Promise<SavedChunk | undefined> {
  return tx<SavedChunk>('chunks', 'readonly', (s) => s.get(key));
}

// ---------------------------------------------------------------------------
// A world's own data records (vanilla's data/ folder: map_<id>.dat and the like), kept in the chunk store under
// <world>/data/<name> (never a chunk's key: those have a comma), so deleting the world deletes them too

export function worldDataKey(worldId: string, name: string): string {
  return `${worldId}/data/${name}`;
}

export async function saveWorldData(list: { key: string; data: unknown }[]): Promise<void> {
  if (!list.length) return;
  await tx('chunks', 'readwrite', (s) => {
    for (const r of list) s.put(r);
  });
}

export async function loadWorldData<T>(worldId: string, name: string): Promise<T | undefined> {
  const r = await tx<{ key: string; data: T }>('chunks', 'readonly', (s) => s.get(worldDataKey(worldId, name)));
  return r?.data;
}
