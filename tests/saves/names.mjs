// Import World never overwrites a world: a taken id gets the next free one the way vanilla picks a free folder name
// (FileUtil.findAvailableName: made safe for a folder, then " (1)", " (2)"..., counting on from a counter the name
// already has), and a taken name is counted on the same way. And the records an import cut short leaves are tidied.

import { load, STORAGE, check, exitWithStatus, MemoryRecords } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(STORAGE);
const takenBy = (...names) => (n) => names.includes(n);
const free = () => false;

// ---------------------------------------------------------------------------------------------------------------
// vanilla FileUtil.findAvailableName

check('a free name is kept', m.findAvailableName('New World', free) === 'New World');
check('a taken name gets " (1)"', m.findAvailableName('New World', takenBy('New World')) === 'New World (1)');
check('then " (2)", " (3)"', m.findAvailableName('New World', takenBy('New World', 'New World (1)')) === 'New World (2)' && m.findAvailableName('New World', takenBy('New World', 'New World (1)', 'New World (2)')) === 'New World (3)');
check('a gap is filled', m.findAvailableName('New World', takenBy('New World', 'New World (2)')) === 'New World (1)');
check('a name with a counter counts on from it', m.findAvailableName('World (3)', takenBy('World (3)')) === 'World (4)' && m.findAvailableName('World (3)', free) === 'World (3)');
check('a counter isn\'t counted back down ("World (3)" doesn\'t become "World")', m.findAvailableName('World (3)', takenBy('World (3)', 'World (4)')) === 'World (5)');
check('"World ()" (vanilla would crash on the empty count) starts at "World"', m.findAvailableName('World ()', free) === 'World');
check('characters a folder can\'t have become _', m.findAvailableName('a/b\\c:d*e?f"g<h>i|j`k', free) === 'a_b_c_d_e_f_g_h_i_j_k', m.findAvailableName('a/b\\c:d*e?f"g<h>i|j`k', free));
check('dots become _ (and so do tabs and newlines)', m.findAvailableName('my.world\tv2\n', free) === 'my_world_v2_');
check('reserved Windows names are wrapped in _', m.findAvailableName('CON', free) === '_CON_' && m.findAvailableName('com1', free) === '_com1_' && m.findAvailableName('lpt9', free) === '_lpt9_' && m.findAvailableName('CONSOLE', free) === 'CONSOLE');
{
  const long = 'x'.repeat(300);
  const a = m.findAvailableName(long, free), b = m.findAvailableName(long, (n) => n === 'x'.repeat(255));
  check('long names are cut to 255, the counter included', a.length === 255 && b === 'x'.repeat(251) + ' (1)', `${a.length} / ${b.length}`);
}
check('the world list\'s names are counted on without being made safe', m.countOn('A.b/c', takenBy('A.b/c')) === 'A.b/c (1)' && m.countOn('A.b/c', free) === 'A.b/c');

// ---------------------------------------------------------------------------------------------------------------
// Importing into a list

const META = (id, name) => ({ id, name, seed: '42', gameMode: 'creative', difficulty: 'easy', lastPlayed: 7, player: null, version: 1 });
const db = new MemoryRecords();
db.stores.worlds.set('Castle', META('Castle', 'Castle'));
db.stores.chunks.set('Castle/0,0', { key: 'Castle/0,0', original: true });
db.stores.worlds.set('Farm', META('Farm', 'My Farm'));
const blob = await m.exportWorld('Castle', null, db);

{
  const w = await m.importWorld(blob, null, db);
  check('importing a world that\'s there: "Castle (1)", named "Castle (1)"', w.id === 'Castle (1)' && w.name === 'Castle (1)', `${w.id} / ${w.name}`);
  check('the world that was there is untouched', db.stores.worlds.get('Castle').name === 'Castle' && db.stores.chunks.get('Castle/0,0').original === true && db.stores.chunks.get('Castle (1)/0,0')?.original === true);
  const w2 = await m.importWorld(blob, null, db);
  check('again: "Castle (2)"', w2.id === 'Castle (2)' && w2.name === 'Castle (2)', `${w2.id} / ${w2.name}`);
  check('four worlds now, none lost', (await db.listWorlds()).length === 4);
}
{
  // the id and the name are counted on each against their own: a world renamed "Castle" keeps a free id
  const renamed = new MemoryRecords();
  renamed.stores.worlds.set('New World', META('New World', 'Castle'));
  const w = await m.importWorld(blob, null, renamed);
  check('a free id with a taken name: the id kept, the name counted on', w.id === 'Castle' && w.name === 'Castle (1)', `${w.id} / ${w.name}`);
  const other = new MemoryRecords();
  other.stores.worlds.set('Castle', META('Castle', 'Keep'));
  const w2 = await m.importWorld(blob, null, other);
  check('a taken id with a free name: the id counted on, the name kept', w2.id === 'Castle (1)' && w2.name === 'Castle', `${w2.id} / ${w2.name}`);
}
{
  const empty = new MemoryRecords();
  const w = await m.importWorld(blob, null, empty);
  check('into an empty list: id and name as they were', w.id === 'Castle' && w.name === 'Castle');
}

// ---------------------------------------------------------------------------------------------------------------
// An import cut short

{
  const kept = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) },
  });
  const cut = new MemoryRecords();
  cut.stores.worlds.set('Castle', META('Castle', 'Castle'));
  // what a page closed halfway through importing "Castle (1)" leaves: records, no world, and the note
  cut.stores.chunks.set('Castle (1)/0,0', { key: 'Castle (1)/0,0' });
  cut.stores.entities.set('Castle (1)/0,0', { key: 'Castle (1)/0,0', entities: [] });
  kept.set('mc.importing', 'Castle (1)');
  await m.tidyUpInterruptedImport(cut);
  check('cut short: its records are cleared, the note too', cut.keysOf('chunks', 'Castle (1)').length === 0 && cut.keysOf('entities', 'Castle (1)').length === 0 && !kept.has('mc.importing'));
  check('cut short: the other world is untouched', cut.stores.worlds.has('Castle'));
  // one that finished, but the note was left: the world stays
  kept.set('mc.importing', 'Castle');
  cut.stores.chunks.set('Castle/0,0', { key: 'Castle/0,0' });
  await m.tidyUpInterruptedImport(cut);
  check('a finished import\'s world stays, even with the note left', cut.stores.chunks.has('Castle/0,0') && !kept.has('mc.importing'));
  // a good import leaves no note; a failed one clears what it wrote and the note
  await m.importWorld(blob, null, cut);
  check('an import that finishes leaves no note', !kept.has('mc.importing'));
  // (the file unpacked, and its end marker cut off: it fails once the world's records are being written)
  const raw = new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const worlds = cut.stores.worlds.size;
  const err = await m.importWorld(new Blob([raw.slice(0, raw.length - 1)]), null, cut).then(() => null, (e) => e);
  check('an import that fails part way leaves no note, no world and no records', err?.problem === 'damaged' && !kept.has('mc.importing') && cut.stores.worlds.size === worlds && cut.keysOf('chunks', 'Castle (2)').length === 0, String(err?.message));
  delete globalThis.localStorage;
}

await exitWithStatus(close);
