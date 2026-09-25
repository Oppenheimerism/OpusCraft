// Make Backup and Import World: a world out of the store and back in, bit for bit. Every record of every store (the
// meta and the player, chunks of all three dimensions with their block entities and generation writes, real generated
// chunks, the entities, the maps) with every kind of value IndexedDB keeps, with and without gzip, into a list where
// its id and name are taken; and a world of a few thousand chunks without the page stalling.

import { load, STORAGE, check, exitWithStatus, MemoryRecords, diff, rng, longestStall } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([...STORAGE, '/src/world/world.ts', '/src/world/gen/generator.ts']);
const ID = 'Test World';

function worldMeta(id, name, lastPlayed = 1000) {
  return {
    id, name, seed: '-4172144997902289642', gameMode: 'survival', difficulty: 'normal', hardcore: false, allowCommands: true,
    created: 1, lastPlayed, dayTime: 12345, gameTime: 987654321, raining: true, thundering: false, rainTime: 300, thunderTime: 0, clearWeatherTime: 0,
    player: {
      x: 12.5, y: 64, z: -0.30000000000000004, yaw: -0, pitch: 12.75, health: 17.5, food: 20, saturation: 4.2, exhaustion: 0.1,
      xpLevel: 3, xpProgress: 0.25, xpTotal: 27, xpSeed: -123456789, uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
      gameMode: 'survival', flying: false, selected: 2,
      // (an anvil name cut through an emoji: a lone surrogate)
      inventory: [{ id: 'diamond_sword', count: 1, damage: 12, enchantments: { sharpness: 5 }, name: 'Sword \ud83d' }, null, { id: 'torch', count: 64 }],
      armor: [null, null, null, { id: 'turtle_helmet', count: 1 }],
      spawn: [0, 70, 0], respawn: [10, 64, -3, 1], advancements: { 'story/root': ['crafting_table'] },
      dead: false, vehicle: null, effects: [{ id: 'speed', amplifier: 1, duration: 600 }], dimension: 'overworld',
      // (saveWorld writes these as undefined: the keys are kept)
      seenCredits: undefined, shoulderLeft: undefined, shoulderRight: undefined,
    },
    portals: { overworld: [1, 64, 2, 1, 65, 2] }, version: 1, structures: true, bonusChest: false,
    gameRules: { keepInventory: true, randomTickSpeed: 3 }, worldSpawn: [0, 70, 0], lastMapId: 0,
  };
}

function chunkRecord(key, r, sections = 9) {
  const out = [];
  for (let si = 0; si < 24; si++) {
    if (si >= sections) {
      out.push(null);
      continue;
    }
    const wide = si === 3;
    const data = wide ? new Uint16Array(4096) : new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) data[i] = Math.floor(r() * (wide ? 300 : 4));
    out.push({ palette: wide ? Array.from({ length: 300 }, (_, i) => `block_${i}`) : ['air', 'stone', 'dirt', 'grass_block[snowy=false]'], data });
  }
  return {
    key, sections: out, biomes: ['plains', 'river'], biomeData: Uint8Array.from({ length: 256 }, () => (r() < 0.5 ? 0 : 1)),
    caveBiomes: ['lush_caves'], caveBiomeData: Uint8Array.from({ length: 1536 }, (_, i) => (i % 7 ? 255 : 0)),
    blockEntities: [{ id: 'chest', x: 3, y: 64, z: 4, items: [{ slot: 0, id: 'apple', count: 3 }], lootTable: undefined }],
    genWrites: [{ cx: 1, cz: 0, data: Int32Array.from([1, -2, 3 << 20]), ops: new Int32Array([5, 6, 7, 0, 1, 2, 3, 4, 0]), feats: undefined }],
    genPalette: ['stone', 'oak_log[axis=y]'], baked: 0x1ef, postProcess: [1, 64, 2], inhabitedTime: 1234,
  };
}

/** every kind of value structured clone keeps */
function oddEntity() {
  return {
    id: 'cow', x: 1.5, y: 64, z: 2.25, motion: [0, -0.0784000015258789, 0], age: -24000, customName: '\udc00lone \ud800', emoji: 'moo 🐄',
    nan: NaN, inf: -Infinity, negZero: -0, big: 2n ** 70n, negBig: -(2n ** 64n), when: new Date(1700000000000), badDate: new Date(NaN),
    tags: new Set(['a', 'b', 3]), memories: new Map([['home', [1, 2, 3]], [7, null], [{ k: 1 }, new Uint8Array([9])]]),
    sparse: [1, , 3, , undefined], raw: new Uint8Array([1, 2, 3, 4]).buffer, own: JSON.parse('{"__proto__": {"x": 1}, "plain": 2}'),
    views: [new Int8Array([-1, 2]), new Uint8ClampedArray([255, 0]), new Int16Array([-300]), new Uint32Array([4000000000]), new Float32Array([1.5, NaN]),
      new Float64Array([Math.PI, -0]), new BigInt64Array([-1n, 2n ** 62n]), new BigUint64Array([2n ** 64n - 1n]), new DataView(new Uint8Array([7, 8, 9]).buffer),
      new Uint16Array(new Uint16Array([1, 2, 3, 4]).buffer, 2, 2)],
    nested: { a: { b: { c: [undefined, null, false, true, '', 0, 2147483647, -2147483648, 2147483648, 1e300, 5e-324] } } },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// A world with everything in it, beside two others

const db = new MemoryRecords();
const r = rng(1234);
const put = (store, rec) => db.stores[store].set(store === 'worlds' ? rec.id : rec.key, structuredClone(rec));
put('worlds', worldMeta(ID, ID));
for (const k of ['10,10', '-1,2', 'nether/3,-4', 'end/0,0', 'end/-7,12']) put('chunks', chunkRecord(`${ID}/${k}`, r));
put('chunks', { key: `${ID}/data/map_0`, data: { scale: 0, dimension: 'overworld', xCenter: 64, zCenter: 64, locked: false, colors: Uint8Array.from({ length: 16384 }, () => Math.floor(r() * 200)), banners: [], frames: [] } });
put('chunks', { key: `${ID}/data/treasure_refs`, data: ['monument 12 -4'] });
put('entities', { key: `${ID}/10,10`, entities: [oddEntity(), { id: 'item', item: { id: 'stick', count: 1 }, age: 12 }] });
put('entities', { key: `${ID}/nether/3,-4`, entities: [{ id: 'piglin', x: 50, y: 70, z: -60, inventory: [null, null] }] });
put('entities', { key: `${ID}/-1,2`, entities: [] });
// real generated chunks, saved the way the game saves them
const gen = new m.ChunkGenerator('backup');
const world = new m.World();
const real = [];
for (let cx = 0; cx <= 1; cx++)
  for (let cz = 0; cz <= 1; cz++) {
    world.addChunk({ ...gen.generate(cx, cz) });
    const sc = m.serializeChunk(ID, world.getChunk(cx, cz), [], '');
    real.push(sc.key);
    put('chunks', sc);
  }
// two other worlds: one whose id starts with "Test", one whose id is the first free one after "Test World"
put('worlds', worldMeta('Test', 'Test', 2000));
put('chunks', chunkRecord('Test/0,0', r, 2));
put('worlds', worldMeta('Test World (1)', 'Other', 3000));
put('chunks', chunkRecord('Test World (1)/0,0', r, 2));
put('entities', { key: 'Test World (1)/0,0', entities: [{ id: 'sheep', color: 'pink' }] });

const before = new Map(db.all().map(([s, k, v]) => [s + ':' + k, structuredClone(v)]));
const own = (store, id) => db.keysOf(store, id);
check('setup: the world has its chunks, maps and entities', own('chunks', ID).length === 11 && own('entities', ID).length === 3, `${own('chunks', ID).length} / ${own('entities', ID).length}`);

/** the imported world's records are the original's, bit for bit, under its new id */
function sameWorld(src, from, dst, to) {
  const problems = [];
  const a = src.stores.worlds.get(from), b = dst.stores.worlds.get(to);
  if (!b) return 'no world ' + to;
  const d = diff({ ...a, id: to, name: b.name }, b, 'meta');
  if (d) problems.push(d);
  for (const store of ['chunks', 'entities']) {
    const ka = src.keysOf(store, from), kb = dst.keysOf(store, to);
    if (ka.length !== kb.length) problems.push(`${store}: ${ka.length} records vs ${kb.length}`);
    for (const k of ka) {
      const nk = to + k.slice(from.length);
      const d2 = diff({ ...src.stores[store].get(k), key: nk }, dst.stores[store].get(nk), `${store}[${k}]`);
      if (d2) problems.push(d2);
      // and the same bytes, written again
      const x = m.encodeValue(src.stores[store].get(k)), y = m.encodeValue({ ...dst.stores[store].get(nk), key: k });
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) problems.push(`${store}[${k}]: bytes differ`);
    }
  }
  return problems.join('; ');
}

// ---------------------------------------------------------------------------------------------------------------
// Out and back in

const steps = [];
const blob = await m.exportWorld(ID, (f) => steps.push(f), db);
const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
check('export: one gzip file', head[0] === 0x1f && head[1] === 0x8b, `starts ${head[0]}, ${head[1]}`);
check('export: progress climbs to 1', steps.length > 0 && steps.every((f, i) => f >= (steps[i - 1] ?? 0) && f <= 1) && steps.at(-1) === 1, steps.join(', '));
console.log(`     (${blob.size} bytes)`);

const imported = await m.importWorld(blob, null, db);
check('import: a new id, the first free one after the world\'s ("Test World (1)" is taken)', imported.id === 'Test World (2)', imported.id);
check('import: a name another world has is counted on ("Test World" is taken, "Test World (1)" isn\'t)', imported.name === 'Test World (1)', imported.name);
check('import: in the list', (await db.listWorlds()).some((w) => w.id === imported.id));
const problems = sameWorld(db, ID, db, imported.id);
check('round trip: every record the same, bit for bit (meta, chunks of three dimensions, maps, entities)', !problems, problems);
const untouched = [...before].every(([k, v]) => {
  const [s, key] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
  return !diff(v, db.stores[s].get(key));
});
check('round trip: the worlds that were there are untouched', untouched);
check('round trip: no record outside the new world was added', db.all().length === before.size + 1 + own('chunks', ID).length + own('entities', ID).length, `${db.all().length}`);
check('round trip: the other worlds\' records didn\'t come along ("Test/…", "Test World (1)/…")', own('chunks', imported.id).every((k) => !k.startsWith('Test/') && !k.includes('(1)')));

{
  // the real chunks read back the same
  let same = true;
  for (const k of real) {
    const a = m.deserializeChunk(db.stores.chunks.get(k)), b = m.deserializeChunk(db.stores.chunks.get(imported.id + k.slice(ID.length)));
    if (diff(a.blocks, b.blocks) || diff(a.biomes, b.biomes) || diff(a.genWrites, b.genWrites)) same = false;
  }
  const c = world.getChunk(1, 1);
  const col = m.deserializeChunk(db.stores.chunks.get(imported.id + '/1,1')).blocks;
  let blocksOk = true;
  for (let si = 0; si < c.blocks.length; si++) {
    const sec = c.blocks[si];
    for (let i = 0; i < 4096; i++) if (col[si * 4096 + i] !== (sec ? sec[i] : 0)) blocksOk = false;
  }
  check('round trip: generated chunks read back the same (blocks, biomes, generation writes)', same && blocksOk);
}

{
  const again = await m.importWorld(blob, null, db);
  check('import again: the next free id and name', again.id === 'Test World (3)' && again.name === 'Test World (2)', `${again.id} / ${again.name}`);
  check('import again: bit for bit as well', !sameWorld(db, ID, db, again.id));
}

{
  // the copy out again, into a list where nothing is taken: id and name stay as they are
  const fresh = new MemoryRecords();
  const w = await m.importWorld(await m.exportWorld(imported.id, null, db), null, fresh);
  check('copy of the copy: id and name kept where they\'re free', w.id === 'Test World (2)' && w.name === 'Test World (1)', `${w.id} / ${w.name}`);
  const p = sameWorld(db, imported.id, fresh, w.id);
  check('copy of the copy: bit for bit', !p, p);
}

{
  // a browser without CompressionStream: the file isn't gzip'd, and still reads back
  const had = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream');
  Object.defineProperty(globalThis, 'CompressionStream', { value: undefined, configurable: true, writable: true });
  let plain;
  try {
    plain = await m.exportWorld(ID, null, db);
  } finally {
    Object.defineProperty(globalThis, 'CompressionStream', had);
  }
  const magic = new TextDecoder().decode(new Uint8Array(await plain.slice(0, 7).arrayBuffer()));
  check('no CompressionStream: the file as it is ("MCWORLD")', magic === 'MCWORLD', magic);
  check('no CompressionStream: bigger than gzip\'d', plain.size > blob.size, `${plain.size} vs ${blob.size}`);
  const fresh = new MemoryRecords();
  const w = await m.importWorld(plain, null, fresh);
  const p = sameWorld(db, ID, fresh, w.id);
  check('no CompressionStream: bit for bit', w.id === ID && !p, p);
}

// ---------------------------------------------------------------------------------------------------------------
// A big world: a few thousand chunks, a batch at a time

{
  const big = new MemoryRecords();
  const rb = rng(99);
  big.stores.worlds.set('Big', structuredClone(worldMeta('Big', 'Big')));
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const cx = (i % 60) - 30, cz = Math.floor(i / 60) - 25;
    const rec = chunkRecord(`Big/${cx},${cz}`, rb, 3);
    big.stores.chunks.set(rec.key, rec);
    if (i % 4 === 0) big.stores.entities.set(rec.key, { key: rec.key, entities: [{ id: 'zombie', x: cx * 16 + 8, y: 64, z: cz * 16 + 8, health: 20 }] });
  }
  const t0 = performance.now();
  const out = await longestStall(() => m.exportWorld('Big', null, big));
  const t1 = performance.now();
  const dst = new MemoryRecords();
  const inn = await longestStall(() => m.importWorld(out.result, null, dst));
  const t2 = performance.now();
  console.log(`     (${N} chunks, ${N / 4} entity records: ${(out.result.size / 1048576).toFixed(1)} MB, out in ${Math.round(t1 - t0)} ms, in in ${Math.round(t2 - t1)} ms; longest stall ${out.worst.toFixed(0)} ms out, ${inn.worst.toFixed(0)} ms in)`);
  check('big world: never more than 100 ms without the page getting a turn, out or in', out.worst < 100 && inn.worst < 100, `${out.worst.toFixed(0)} / ${inn.worst.toFixed(0)} ms`);
  const p = sameWorld(big, 'Big', dst, inn.result.id);
  check('big world: every record back, bit for bit', inn.result.id === 'Big' && !p, p.slice(0, 300));
}

await exitWithStatus(close);
