// M2b: bastions in real Nether chunks (NetherGenerator.generate), seed 12345's nearest of each kind: every chunk the
// bastion covers generated, its blocks as its pieces lay them (less the odd one a later feature changes), its chests
// with their loot tables and seeds, its mobs persistent; what bastions cost chunk generation; /locate structure
// bastion_remnant; whether a block is in a bastion (Those Were the Days), and War Pigs for its chests' tables.

import { load, check, exitWithStatus, flatLevel } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/world/gen/nether.ts', '/src/world/gen/bastion.ts', '/src/game/bastions.ts', '/src/game/commands.ts', '/src/world/gen/jigsaw.ts']);
const name = (st) => m.blockOf(st).name;
const SEED = '12345';
const gen = new m.NetherGenerator(SEED);
const B = gen.bastions;
const SPACING = 27;

// ---------------------------------------------------------------------------------------------------------------
// Seed 12345's nearest of each kind, generated

const KINDS = ['units', 'hoglin_stable', 'treasure', 'bridge'];
const TABLES = { units: ['bastion_other'], hoglin_stable: ['bastion_hoglin_stable', 'bastion_other'], treasure: ['bastion_treasure', 'bastion_other'], bridge: ['bastion_bridge', 'bastion_other'] };
let genMs = 0, genChunks = 0;
const bastionChunks = [];
for (const kind of KINDS) {
  const stub = B.nearestStub(0, 0, 100, kind);
  const L = B.layout(Math.floor(stub.cx / SPACING), Math.floor(stub.cz / SPACING));
  console.log(`     ${kind}: start chunk ${stub.cx},${stub.cz}, blocks x ${L.box.minX}..${L.box.maxX}, y ${L.box.minY}..${L.box.maxY}, z ${L.box.minZ}..${L.box.maxZ}, ${L.pieces.length} pieces`);
  check(`${kind}: its layout is its region's, and its kind`, L.stub === stub || (L.stub.cx === stub.cx && L.stub.cz === stub.cz && L.stub.variant === kind));

  // what its pieces lay down, on their own
  const want = new Map();
  const fake = {
    x0: 0, z0: 0, cx: 0, cz: 0, blockEntities: [], entities: [],
    set: (x, y, z, st) => want.set(`${x},${y},${z}`, st), getOrAir: (x, y, z) => want.get(`${x},${y},${z}`) ?? 0, get: (x, y, z) => want.get(`${x},${y},${z}`) ?? 0,
    scheduleFluid() {}, markForPostprocessing() {},
  };
  const pc = { ctx: fake, chunk: new m.Box(-1e6, -64, -1e6, 1e6, 319, 1e6), salt: B.salt, baseY: L.pieces[0].box.minY };
  for (const p of L.pieces) p.element.place(pc, p);

  // the real chunks
  const outs = new Map();
  const t0 = performance.now();
  for (let cx = L.box.minX >> 4; cx <= L.box.maxX >> 4; cx++)
    for (let cz = L.box.minZ >> 4; cz <= L.box.maxZ >> 4; cz++) {
      outs.set(`${cx},${cz}`, gen.generate(cx, cz));
      bastionChunks.push([cx, cz]);
    }
  genMs += performance.now() - t0;
  genChunks += outs.size;
  const real = (x, y, z) => outs.get(`${x >> 4},${z >> 4}`).blocks[m.colIndex(x & 15, y, z & 15)];

  let solid = 0, sameSolid = 0, air = 0, sameAir = 0;
  const differ = {};
  for (const [k, st] of want) {
    const [x, y, z] = k.split(',').map(Number);
    const got = real(x, y, z);
    if (st) {
      solid++;
      if (got === st) sameSolid++;
      else differ[`${name(st)}→${name(got)}`] = (differ[`${name(st)}→${name(got)}`] ?? 0) + 1;
    } else {
      air++;
      if (name(got) === 'air' || name(got) === 'cave_air') sameAir++;
      else differ[`air→${name(got)}`] = (differ[`air→${name(got)}`] ?? 0) + 1;
    }
  }
  const top = Object.entries(differ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
  check(`${kind}: its blocks in the world as its pieces lay them (${sameSolid} of ${solid}; ${sameAir} of ${air} carved)`, sameSolid >= solid * 0.995 && sameAir >= air * 0.99, top);
  if (top) console.log(`     (changed after: ${top})`);

  // chests, mobs
  const bes = [...outs.values()].flatMap((o) => o.blockEntities ?? []);
  const ents = [...outs.values()].flatMap((o) => o.entities ?? []);
  const chests = bes.filter((b) => b.data?.lootTable?.startsWith('chests/bastion_'));
  const wantChests = fake.blockEntities.filter((b) => b.data?.lootTable);
  check(`${kind}: its ${wantChests.length} chests, each with its table and seed where its pieces put it`, chests.length === wantChests.length &&
    wantChests.every((w) => chests.some((c) => c.x === w.x && c.y === w.y && c.z === w.z && c.data.lootTable === w.data.lootTable && c.data.lootSeed === w.data.lootSeed)) &&
    chests.every((c) => name(real(c.x, c.y, c.z)) === 'chest' && TABLES[kind].includes(c.data.lootTable.slice(7))));
  const spawners = bes.filter((b) => b.id === 'spawner');
  check(`${kind}: ${kind === 'treasure' ? 'two magma cube spawners' : 'no spawners'}`, kind === 'treasure' ? spawners.length === 2 && spawners.every((s) => s.data.entity === 'magma_cube') : spawners.length === 0);
  const mobs = ents.filter((e) => ['piglin', 'piglin_brute', 'hoglin'].includes(e.id));
  check(`${kind}: its ${fake.entities.length} mobs in their chunks, persistent, finalized as a structure's (${mobs.filter((e) => e.id === 'piglin').length} piglins, ${mobs.filter((e) => e.id === 'piglin_brute').length} brutes, ${mobs.filter((e) => e.id === 'hoglin').length} hoglins)`,
    mobs.length === fake.entities.length && mobs.every((e) => e.persistent && e.data?.finalize === 'structure' && outs.get(`${Math.floor(e.x) >> 4},${Math.floor(e.z) >> 4}`)?.entities.includes(e)));

  // whether a block is in it: its pieces yes, beside it no
  const inside = L.pieces.slice(1, 6).map((p) => [(p.box.minX + p.box.maxX) >> 1, (p.box.minY + p.box.maxY) >> 1, (p.box.minZ + p.box.maxZ) >> 1]);
  check(`${kind}: blocks in its pieces are in a bastion, blocks well outside are not`, inside.every(([x, y, z]) => B.pieceAt(x, y, z)) &&
    !B.pieceAt(L.box.maxX + 30, 40, L.box.maxZ + 30) && !B.pieceAt(stub.x, L.box.maxY + 5, stub.z) && !B.pieceAt(stub.x, L.box.minY - 5, stub.z));
}

// ---------------------------------------------------------------------------------------------------------------
// What bastions cost chunk generation

{
  const bare = new m.NetherGenerator(SEED);
  bare.bastions.place = () => {};
  const warm = new m.NetherGenerator(SEED);
  for (const [cx, cz] of bastionChunks.slice(0, 4)) { bare.generate(cx, cz); warm.generate(cx, cz); }
  const time = (g) => {
    const t0 = performance.now();
    for (const [cx, cz] of bastionChunks) g.generate(cx, cz);
    return (performance.now() - t0) / bastionChunks.length;
  };
  const without = time(bare), withB = time(warm);
  console.log(`     ${genChunks} bastion chunks first generated in ${genMs.toFixed(0)} ms (${(genMs / genChunks).toFixed(1)} ms a chunk, laying out included); again ${withB.toFixed(1)} ms a chunk, ${without.toFixed(1)} ms without the bastions`);
  check(`cost: a bastion's chunks take at most a few milliseconds more (${(withB - without).toFixed(1)} ms a chunk)`, withB - without < 6);
  check(`cost: laying a bastion out the first time is quick (${(genMs / genChunks).toFixed(1)} ms a chunk all told)`, genMs / genChunks < without + 15);
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const { world, level } = flatLevel(m, 0, 0, 0, 0, 64, SEED);
  const chat = [];
  const nether = new m.World();
  nether.dim = { ...world.dim, id: 'the_nether' };
  const game = { meta: { allowCommands: true }, chat: (s) => chat.push(s), world: nether, level, player: { x: 0.5, y: 64, z: 0.5 } };
  m.executeCommand(game, 'locate structure minecraft:bastion_remnant');
  const s = B.nearestStub(0, 0, 100, null);
  check(`/locate: the nearest bastion remnant, its start chunk's corner (${chat.join(' ')})`, chat.join(' ').includes(`[${s.cx * 16}, ~, ${s.cz * 16}]`));
  const f = gen.fortresses.nearest(0, 0);
  console.log(`     (the nearest fortress to 0, 0 for comparison: ${f})`);
  chat.length = 0;
  m.executeCommand({ ...game, player: { x: 5000.5, y: 64, z: -3000.5 } }, 'locate structure bastion_remnant');
  const s2 = B.nearestStub(5000, -3001, 100, null);
  check(`/locate: from elsewhere too (${chat.join(' ')})`, chat.join(' ').includes(`[${s2.cx * 16}, ~, ${s2.cz * 16}]`));
  chat.length = 0;
  m.executeCommand({ ...game, world }, 'locate structure bastion_remnant');
  check('/locate: none in the Overworld', /Could not find/.test(chat.join(' ')), chat.join(' '));
  // every bastion within 1500 blocks found by someone standing on its start
  let found = 0, n = 0;
  for (const st of B.stubsIn(-2, -2, 2, 2)) {
    n++;
    chat.length = 0;
    m.executeCommand({ ...game, player: { x: st.cx * 16 + 8.5, y: 64, z: st.cz * 16 + 8.5 } }, 'locate structure bastion_remnant');
    if (chat.join(' ').includes(`[${st.cx * 16}, ~, ${st.cz * 16}]`)) found++;
  }
  check(`/locate: each of ${n} bastions found from its own start chunk`, found === n && n > 5);
}

// ---------------------------------------------------------------------------------------------------------------
// Those Were the Days, War Pigs

{
  const find = m.ADVANCEMENTS.get('nether/find_bastion'), loot = m.ADVANCEMENTS.get('nether/loot_bastion');
  const L = B.layout(Math.floor(B.nearestStub(0, 0, 100, 'treasure').cx / SPACING), Math.floor(B.nearestStub(0, 0, 100, 'treasure').cz / SPACING));
  const p = L.pieces[1];
  const at = { x: (p.box.minX + p.box.maxX) / 2, y: p.box.minY + 1, z: (p.box.minZ + p.box.maxZ) / 2 };
  const fakeLevel = (dim, t) => ({ seed: SEED, gameTime: t, dim: { id: dim }, fortresses: () => gen.fortresses });
  let adv = new m.PlayerAdvancements();
  m.tickBastionProgress(fakeLevel('the_nether', 20), { x: L.box.maxX + 40, y: 40, z: L.box.maxZ + 40 }, adv);
  check('Those Were the Days: not outside one', !adv.isDone(find));
  m.tickBastionProgress(fakeLevel('the_nether', 21), at, adv);
  check('Those Were the Days: checked once a second (vanilla\'s location trigger)', !adv.isDone(find));
  m.tickBastionProgress(fakeLevel('overworld', 40), at, adv);
  check('Those Were the Days: not in another dimension at the same place', !adv.isDone(find));
  m.tickBastionProgress(fakeLevel('the_nether', 40), at, adv);
  check('Those Were the Days: standing in one of a bastion\'s pieces', adv.isDone(find));
  check('Those Were the Days: m.inBastion agrees', m.inBastion(fakeLevel('the_nether', 0), at.x, at.y, at.z));
  adv = new m.PlayerAdvancements();
  adv.trigger('container_loot', { lootTable: 'chests/nether_bridge' });
  adv.trigger('container_loot', { lootTable: 'chests/ruined_portal' });
  check('War Pigs: not for a fortress\'s or a ruined portal\'s chest', !adv.isDone(loot));
  for (const t of ['bastion_other', 'bastion_treasure', 'bastion_hoglin_stable', 'bastion_bridge']) {
    const a = new m.PlayerAdvancements();
    a.trigger('container_loot', { lootTable: `chests/${t}` });
    check(`War Pigs: for a ${t} chest`, a.isDone(loot));
  }
}

await exitWithStatus(close);
