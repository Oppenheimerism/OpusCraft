// Make Backup and Import World: a world out of IndexedDB into one file (storage/worldFile.ts), and a file back in as
// a new world. Both go a batch of records at a time, so a world of thousands of chunks neither stalls the page nor
// sits in memory whole.

import * as worldStore from './worldStore';
import type { WorldMeta, WorldRecordStore } from './worldStore';
import { WorldFileWriter, WorldFileError, openWorldFile, worldFileSink, findAvailableName, countOn } from './worldFile';

/** where a world's records come from and go (IndexedDB; the tests keep them in Maps) */
export interface WorldRecords {
  listWorlds(): Promise<WorldMeta[]>;
  getWorldMeta(id: string): Promise<WorldMeta | undefined>;
  countWorldRecords(worldId: string, store: WorldRecordStore): Promise<number>;
  readWorldRecords(worldId: string, store: WorldRecordStore, after: string | null, count: number): Promise<{ key: string }[]>;
  putRecords(store: WorldRecordStore | 'worlds', list: object[]): Promise<void>;
  deleteWorld(id: string): Promise<void>;
}

const INDEXED_DB: WorldRecords = worldStore;
const STORES: WorldRecordStore[] = ['chunks', 'entities'];
/** records read or written at a time */
const BATCH = 64;

/** how far along it is, 0 to 1 */
export type Progress = (done: number) => void;

/**
 * vanilla LevelStorageAccess.makeWorldBackup: the world as one file, with all the store keeps of it (the meta and
 * the player, every chunk of every dimension with its block entities, the entities, the maps and other data records)
 */
export async function exportWorld(id: string, onProgress?: Progress, db: WorldRecords = INDEXED_DB): Promise<Blob> {
  const meta = await db.getWorldMeta(id);
  if (!meta) throw new Error(`There's no world '${id}'`);
  const records = { worlds: 1, chunks: await db.countWorldRecords(id, 'chunks'), entities: await db.countWorldRecords(id, 'entities') };
  const total = records.worlds + records.chunks + records.entities;
  const sink = worldFileSink();
  try {
    const file = new WorldFileWriter(sink.write, { id: meta.id, name: meta.name, exported: Date.now(), records });
    file.record('worlds', meta);
    let done = 1;
    for (const store of STORES) {
      for (let after: string | null = null; ; ) {
        const list = await db.readWorldRecords(id, store, after, BATCH);
        for (const r of list) file.record(store, r);
        await file.flush();
        done += list.length;
        onProgress?.(Math.min(1, done / total));
        if (list.length < BATCH) break;
        after = list[list.length - 1].key;
      }
    }
    await file.end();
    return await sink.close();
  } catch (e) {
    sink.abort();
    throw e;
  }
}

/**
 * Import World: a world file in as a new world, never over one that's there. Its id is the first free one the way
 * vanilla picks a free folder name (FileUtil.findAvailableName: " (1)", " (2)" and on), and a name another world
 * has is counted on the same way. The meta goes in last, so the world is only listed once all of it is in.
 */
export async function importWorld(file: Blob, onProgress?: Progress, db: WorldRecords = INDEXED_DB): Promise<WorldMeta> {
  return (await withImportLock(async () => {
    const f = await openWorldFile(file);
    let id: string | null = null;
    try {
      const manifest = await f.header();
      const first = await f.next();
      const meta = first?.store === 'worlds' ? (first.value as WorldMeta | null) : null;
      if (!meta || typeof meta !== 'object' || meta.id !== manifest.id || typeof meta.name !== 'string' || typeof meta.seed !== 'string') throw new WorldFileError('damaged', 'no world in it');
      const worlds = await db.listWorlds();
      const ids = new Set(worlds.map((w) => w.id));
      const names = new Set(worlds.map((w) => w.name));
      const newId = findAvailableName(meta.id.trim() || 'World', (n) => ids.has(n));
      id = newId;
      setImporting(newId);
      // (whatever is under a free id was left by an import that never finished)
      await db.deleteWorld(newId);
      const prefix = meta.id + '/';
      const total = 1 + manifest.records.chunks + manifest.records.entities;
      let done = 1;
      let batch: object[] = [];
      let batchStore: WorldRecordStore = 'chunks';
      const put = async () => {
        await db.putRecords(batchStore, batch);
        done += batch.length;
        batch = [];
        onProgress?.(Math.min(1, done / total));
      };
      for (let r = await f.next(); r; r = await f.next()) {
        const store = r.store;
        const rec = r.value as { key?: unknown } | null;
        if (store === 'worlds' || !rec || typeof rec !== 'object' || typeof rec.key !== 'string' || !rec.key.startsWith(prefix)) throw new WorldFileError('damaged', 'a record from outside the world');
        rec.key = newId + '/' + rec.key.slice(prefix.length);
        if (store !== batchStore && batch.length) await put();
        batchStore = store;
        batch.push(rec);
        if (batch.length >= BATCH) await put();
      }
      if (batch.length) await put();
      await f.close();
      meta.id = newId;
      meta.name = countOn(meta.name, (n) => names.has(n));
      await db.putRecords('worlds', [meta]);
      setImporting(null);
      return meta;
    } catch (e) {
      f.cancel();
      if (id !== null) {
        await db.deleteWorld(id).catch(() => {});
        setImporting(null);
      }
      throw e;
    }
  }))!;
}

// ---------------------------------------------------------------------------
// An import cut short (the page closed partway) leaves records with no world over them; its id is noted till the
// import is done, and they're cleared before the world list is next read.

const IMPORTING = 'mc.importing';

function importing(): string | null {
  try {
    return localStorage.getItem(IMPORTING);
  } catch {
    return null;
  }
}

function setImporting(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(IMPORTING);
    else localStorage.setItem(IMPORTING, id);
  } catch {
    /* no localStorage: nothing to tidy up after */
  }
}

/** clears what an import cut short left (not while another tab is importing) */
export async function tidyUpInterruptedImport(db: WorldRecords = INDEXED_DB): Promise<void> {
  if (importing() === null) return;
  await withImportLock(async () => {
    const id = importing();
    if (id === null) return;
    if (!(await db.getWorldMeta(id))) await db.deleteWorld(id);
    setImporting(null);
  }, true).catch((e) => console.warn('tidying up an import', e));
}

/** one import at a time, across tabs too (Web Locks, where the browser has them); `ifAvailable`: or none at all */
async function withImportLock<T>(f: () => Promise<T>, ifAvailable = false): Promise<T | undefined> {
  const locks = typeof navigator !== 'undefined' ? (navigator as { locks?: LockManager }).locks : undefined;
  if (!locks) return f();
  return locks.request('mc.import', { ifAvailable }, (lock) => (lock ? f() : undefined));
}
