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
  } | null;
  version: number;
  /** quick-test worlds are never written to storage */
  transient?: boolean;
  /** cheats flag shown in the world list */
  structures?: boolean;
  bonusChest?: boolean;
  gameRules?: Record<string, boolean | number>;
  worldSpawn?: [number, number, number];
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

export async function saveWorldMeta(m: WorldMeta): Promise<void> {
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

export function chunkKey(worldId: string, cx: number, cz: number): string {
  return `${worldId}/${cx},${cz}`;
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

export function serializeChunk(worldId: string, c: Chunk, blockEntities: SavedBlockEntity[] = []): SavedChunk {
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
  const out: SavedChunk = { key: chunkKey(worldId, c.cx, c.cz), sections, biomes: biomeNames, biomeData: bd, blockEntities };
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
  return out;
}

/** Returns a full-column blocks array + biomes. */
export function deserializeChunk(s: SavedChunk): { blocks: Uint16Array; biomes: Uint8Array; caveBiomes: Uint8Array | null; blockEntities: SavedBlockEntity[] } {
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
  return { blocks, biomes, caveBiomes, blockEntities: s.blockEntities ?? [] };
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
