// Import World's checks: a file that isn't a world file, one from a newer format and a damaged one (cut short, a byte
// flipped, junk after the end, a record from outside the world, a broken manifest...) are turned away with the
// reason, and leave nothing behind in the store, even when some of the world was already written.

import { load, STORAGE, check, exitWithStatus, MemoryRecords, diff } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(STORAGE);
const ID = 'Test World';
const META = { id: ID, name: ID, seed: '42', gameMode: 'survival', difficulty: 'normal', lastPlayed: 5, player: null, version: 1 };
const chunk = (k) => ({ key: `${ID}/${k}`, sections: [{ palette: ['stone'], data: new Uint8Array(4096) }], biomes: ['plains'], biomeData: new Uint8Array(256) });
const MANIFEST = { id: ID, name: ID, exported: 1, records: { worlds: 1, chunks: 100, entities: 0 } };

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** a world file's bytes (not gzip'd) from these records */
async function fileOf(records, { manifest = MANIFEST, end = true } = {}) {
  const parts = [];
  const w = new m.WorldFileWriter(async (b) => void parts.push(b), manifest);
  for (const [store, v] of records) w.record(store, v);
  if (end) await w.end();
  else await w.flush(true);
  return concat(parts);
}

const gzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const good = [['worlds', META], ...Array.from({ length: 100 }, (_, i) => ['chunks', chunk(`${i},0`)])];
const goodBytes = await fileOf(good);

/** a store with a world in it already, and what it held */
function store() {
  const db = new MemoryRecords();
  db.stores.worlds.set('Other', { id: 'Other', name: 'Other', seed: '1', lastPlayed: 1 });
  db.stores.chunks.set('Other/0,0', { key: 'Other/0,0', sections: [] });
  return db;
}
const snapshot = (db) => db.all().map(([s, k, v]) => [s, k, structuredClone(v)]);

/** imports the bytes: the problem it's turned away for ('' if it isn't), and whether the store is as it was */
async function tryImport(bytes) {
  const db = store();
  const was = snapshot(db);
  let problem = '';
  try {
    await m.importWorld(new Blob([bytes]), null, db);
  } catch (e) {
    problem = e instanceof m.WorldFileError ? e.problem : `other: ${e?.message}`;
  }
  return { problem, clean: !diff(was, snapshot(db)), db };
}

async function expect(name, bytes, problem) {
  const r = await tryImport(bytes);
  check(`${name}: turned away as ${problem}, nothing left behind`, r.problem === problem && r.clean, `${r.problem || 'imported'}${r.clean ? '' : ', store changed'}`);
}

// ---------------------------------------------------------------------------------------------------------------

{
  const r = await tryImport(goodBytes);
  check('a good file (not gzip\'d) imports', r.problem === '' && r.db.stores.worlds.has(ID) && r.db.keysOf('chunks', ID).length === 100, r.problem);
  const g = await tryImport(await gzip(goodBytes));
  check('a good file (gzip\'d) imports', g.problem === '' && g.db.keysOf('chunks', ID).length === 100, g.problem);
  const f = await m.openWorldFile(new Blob([await gzip(goodBytes)]));
  const h = await f.header();
  check('the header: magic, version, manifest read back', h.id === ID && h.name === ID && h.records.chunks === 100 && h.records.worlds === 1, JSON.stringify(h));
  f.cancel();
}

// not a world file at all
await expect('an empty file', new Uint8Array(0), 'not_world');
await expect('a text file', new TextEncoder().encode('hello, world\n'), 'not_world');
await expect('a PNG', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), 'not_world');
await expect('a gzip\'d text file', await gzip(new TextEncoder().encode('not a world, just text')), 'not_world');
{
  const b = goodBytes.slice();
  b[2] ^= 0xff;
  await expect('a wrong magic', b, 'not_world');
}
{
  const b = goodBytes.slice(0, 5);
  await expect('the magic cut short', b, 'not_world');
}

// the version
{
  const b = goodBytes.slice();
  new DataView(b.buffer).setUint32(8, m.FORMAT_VERSION + 1, true);
  await expect('a newer format', b, 'newer');
  new DataView(b.buffer).setUint32(8, 0, true);
  await expect('format 0', b, 'damaged');
}

// the manifest
{
  const b = goodBytes.slice();
  new DataView(b.buffer).setUint32(12, 0xffffffff, true);
  await expect('a manifest far too long', b, 'damaged');
  const c = goodBytes.slice();
  c[16] = 0x7d; // '}' where '{' was
  await expect('a manifest that isn\'t JSON', c, 'damaged');
  await expect('a manifest without an id', await fileOf(good, { manifest: { name: ID } }), 'damaged');
  await expect('a manifest of another world', await fileOf(good, { manifest: { ...MANIFEST, id: 'Elsewhere' } }), 'damaged');
}

// the records
await expect('no records at all', await fileOf([]), 'damaged');
await expect('a chunk before the world', await fileOf([['chunks', chunk('0,0')], ['worlds', META]]), 'damaged');
await expect('a world without a seed', await fileOf([['worlds', { ...META, seed: undefined }]]), 'damaged');
await expect('a chunk of another world, after some of this one\'s were written', await fileOf([...good, ['chunks', { ...chunk('0,0'), key: 'Other/0,0' }]]), 'damaged');
await expect('a key that isn\'t a string', await fileOf([...good, ['entities', { key: 7, entities: [] }]]), 'damaged');
await expect('a second world', await fileOf([...good, ['worlds', META]]), 'damaged');
{
  const b = goodBytes.slice();
  // the first record's store byte, just past the manifest
  const at = 16 + new DataView(b.buffer).getUint32(12, true);
  b[at] = 9;
  await expect('an unknown store', b, 'damaged');
  const c = goodBytes.slice();
  c[at + 5] = 200; // the record's first value tag
  await expect('an unknown value in a record', c, 'damaged');
  const d = goodBytes.slice();
  new DataView(d.buffer).setUint32(at + 1, 0x7fffffff, true);
  await expect('a record longer than the file', d, 'damaged');
}

// cut short, flipped, or with more after the end
await expect('cut short (no end)', await fileOf(good, { end: false }), 'damaged');
await expect('cut short mid-record', goodBytes.slice(0, goodBytes.length - 1000), 'damaged');
{
  const gz = await gzip(goodBytes);
  await expect('gzip\'d and cut short', gz.slice(0, gz.length - 20), 'damaged');
  const flipped = gz.slice();
  flipped[Math.floor(gz.length / 2)] ^= 0x55;
  await expect('gzip\'d with a byte flipped', flipped, 'damaged');
  const crc = gz.slice();
  crc[gz.length - 6] ^= 0x01; // the CRC32 in gzip's trailer: only reading to the end finds it
  await expect('gzip\'d with a wrong checksum', crc, 'damaged');
}
await expect('junk after the end', concat([goodBytes, new Uint8Array([1, 2, 3])]), 'damaged');

{
  // a browser that can't unpack gzip
  const had = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream');
  Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined, configurable: true, writable: true });
  let r;
  try {
    r = await tryImport(await gzip(goodBytes));
  } finally {
    Object.defineProperty(globalThis, 'DecompressionStream', had);
  }
  check('no DecompressionStream: a gzip\'d file is turned away as unsupported', r.problem === 'unsupported' && r.clean, r.problem);
}

await exitWithStatus(close);
