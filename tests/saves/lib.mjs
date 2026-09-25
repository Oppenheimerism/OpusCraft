// Shared helpers for the save tests: the game's modules loaded through Vite, an in-memory stand-in for the
// IndexedDB stores (records structured-cloned in and out as IndexedDB does, each call taking a macrotask as its
// requests do), a "same bit for bit" comparison, and "ok   <name>" / "FAIL <name>" lines.

import { loadModules } from '../../scripts/load.mjs';

/** the storage modules Make Backup and Import World are made of */
export const STORAGE = ['/src/world/blocks.ts', '/src/storage/worldStore.ts', '/src/storage/worldFile.ts', '/src/storage/worldTransfer.ts'];

/** these modules loaded, their exports in one object */
export async function load(paths) {
  const { mods, close } = await loadModules(paths);
  const m = {};
  for (const mod of mods) Object.assign(m, mod);
  return { m, mods, close };
}

let failed = 0;
export function check(name, cond, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

export function exitWithStatus(close) {
  return close().then(() => {
    console.log(failed ? `${failed} failed` : 'all passed');
    process.exit(failed ? 1 : 0);
  });
}

/** the stores worldStore keeps (worlds by id; chunks and entities by key), in Maps: worldTransfer's WorldRecords */
export class MemoryRecords {
  constructor() {
    this.stores = { worlds: new Map(), chunks: new Map(), entities: new Map() };
  }
  /** (IndexedDB answers in a later task, which is what lets the page breathe between batches) */
  tick() {
    return new Promise((r) => setImmediate(r));
  }
  keysOf(store, worldId, after = null) {
    const lo = worldId + '/', hi = worldId + '/￿';
    return [...this.stores[store].keys()].filter((k) => (after === null ? k >= lo : k > after) && k <= hi).sort();
  }
  async listWorlds() {
    await this.tick();
    return [...this.stores.worlds.values()].map((w) => structuredClone(w)).sort((a, b) => b.lastPlayed - a.lastPlayed);
  }
  async getWorldMeta(id) {
    await this.tick();
    const w = this.stores.worlds.get(id);
    return w && structuredClone(w);
  }
  async countWorldRecords(worldId, store) {
    await this.tick();
    return this.keysOf(store, worldId).length;
  }
  async readWorldRecords(worldId, store, after, count) {
    await this.tick();
    return this.keysOf(store, worldId, after).slice(0, count).map((k) => structuredClone(this.stores[store].get(k)));
  }
  async putRecords(store, list) {
    await this.tick();
    for (const r of list) this.stores[store].set(store === 'worlds' ? r.id : r.key, structuredClone(r));
  }
  async deleteWorld(id) {
    await this.tick();
    this.stores.worlds.delete(id);
    for (const s of ['chunks', 'entities']) for (const k of this.keysOf(s, id)) this.stores[s].delete(k);
  }
  /** every record, as [store, key, record] */
  all() {
    return Object.entries(this.stores).flatMap(([s, map]) => [...map].map(([k, v]) => [s, k, v]));
  }
}

const bytesOf = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength));

/** where two values differ ('' if they're the same bit for bit: types, typed array kinds, holes, -0, key order...) */
export function diff(a, b, path = '') {
  if (typeof a !== typeof b) return `${path}: ${typeof a} vs ${typeof b}`;
  if (typeof a !== 'object' || a === null || b === null) return Object.is(a, b) ? '' : `${path}: ${String(a)} vs ${String(b)}`;
  const ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb) return `${path}: ${ta} vs ${tb}`;
  if (ArrayBuffer.isView(a) || a instanceof ArrayBuffer) {
    const x = bytesOf(a), y = bytesOf(b);
    if (x.length !== y.length) return `${path}: ${x.length} bytes vs ${y.length}`;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${path}: byte ${i}`;
    return '';
  }
  if (a instanceof Date) return Object.is(a.getTime(), b.getTime()) ? '' : `${path}: date`;
  if (a instanceof Map || a instanceof Set) return diff([...a], [...b], `${path}<${ta.slice(8, -1)}>`);
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      if (i in a !== i in b) return `${path}[${i}]: hole vs value`;
      const d = diff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return '';
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path}: prototype`;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.join('\0') !== kb.join('\0')) return `${path}: keys [${ka}] vs [${kb}]`;
  for (const k of ka) {
    const d = diff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return '';
}

/** a small deterministic PRNG (mulberry32) */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the longest the event loop went without a turn while `f` ran (ms) */
export async function longestStall(f) {
  let last = performance.now(), worst = 0;
  const probe = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 1);
  try {
    const result = await f();
    return { result, worst: Math.max(worst, performance.now() - last) };
  } finally {
    clearInterval(probe);
  }
}
