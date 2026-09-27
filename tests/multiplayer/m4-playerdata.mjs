// Stage 4: a guest's player is kept with the host's world (vanilla PlayerDataStorage, playerdata/<uuid>.dat) and comes
// back as it was when the guest joins again by the same name: where it was, its inventory and offhand and armour, health,
// food, experience, effects, spawn point, hotbar slot, recipe book, flying; asleep when it left, it's up beside its
// bed; dead, it's on its death screen; riding alone, its boat left with it and comes back with it. A guest's uuid is
// vanilla's offline uuid of its name. The host reads the record before letting the guest in (a seat and the name held
// meanwhile), writes it with the world under <world>/data/playerdata/<uuid>, and keeps the ones still here whenever the
// world is saved. A read that fails turns the guest away rather than starting it afresh over what was kept.

import { createHash } from 'node:crypto';
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

// IndexedDB as worldStore uses it (open, a store a transaction, get and put), records structured-cloned in and out and
// each request answered in a later task; `failReads` fails every read
const idb = { worlds: new Map(), chunks: new Map(), entities: new Map(), failReads: false };
const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore() {},
  transaction(name) {
    const store = idb[name], t = { error: null };
    let failed = false;
    t.objectStore = () => ({
      get(k) {
        const r = { result: undefined };
        if (idb.failReads) failed = true;
        else r.result = structuredClone(store.get(k));
        return r;
      },
      put(v) {
        store.set(v.key ?? v.id, structuredClone(v));
        return { result: undefined };
      },
    });
    setImmediate(() => {
      if (!failed) return t.oncomplete?.();
      t.error = new Error('the read failed');
      t.onerror?.();
    });
    return t;
  },
};
globalThis.indexedDB = {
  open() {
    const req = { result: null, error: null };
    setImmediate(() => {
      req.result = fakeDb;
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/playerData.ts', '/src/net/offlineUuid.ts', '/src/storage/worldStore.ts', '/src/inventory/recipeBook.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts']);

const later = () => new Promise((r) => setImmediate(r));
/** `n` ticks, with the tasks a read from the save needs between them */
async function settle(host, n = 1) {
  for (let i = 0; i < n; i++) {
    step(host);
    for (let j = 0; j < 4; j++) await later();
  }
}

/** a world's guests' players, as the Game keeps them (its PlayerDataStore), what's kept and left written down */
function keeper(worldId) {
  const store = new m.PlayerDataStore(worldId);
  const k = { store, puts: [], left: [], hold: null };
  k.hooks = {
    loadGuest: (uuid) => (k.hold ? k.hold.promise.then(() => store.load(uuid)) : store.load(uuid)),
    saveGuest: (uuid, d) => {
      k.puts.push({ uuid, d });
      store.put(uuid, d);
    },
    leaveInDimension: (dim, e) => k.left.push({ dim, e }),
  };
  return k;
}

/** a read from the save held back till `release()` */
function held() {
  let release;
  const promise = new Promise((r) => (release = r));
  return { promise, release };
}

const uuidOf = (name) => m.offlinePlayerUuid(name);
const guest = (host, name, opts = {}) => makeGuest(host, name, { uuid: uuidOf(name), ...opts });
const sessionOf = (host, name) => [...host.server.sessions.values()].find((s) => s.name === name) ?? null;
const S = (id, n = 1) => m.ItemStack.of(id, n);

// ---------------------------------------------------------------------------
// who a guest is: vanilla's offline uuid of its name

{
  // (vanilla UUIDUtil.createOfflinePlayerUUID: "OfflinePlayer:" + name through MD5, a version 3 uuid)
  const offline = (name) => {
    const b = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
    b[6] = (b[6] & 0x0f) | 0x30;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  check('uuid: Notch\'s is vanilla\'s (b50ad385-829d-3141-a216-7e7d7539ba7f)', uuidOf('Notch') === 'b50ad385-829d-3141-a216-7e7d7539ba7f', uuidOf('Notch'));
  const names = ['Alex', 'Steve', 'abc', 'Player123', 'a_b_c_d_e_f_g_h_', 'xX_Guest_Xx'];
  check('uuid: every name\'s is what MD5 makes of it', names.every((n) => uuidOf(n) === offline(n)), names.filter((n) => uuidOf(n) !== offline(n)).join());
  check('uuid: another name is another player; case counts, as in vanilla', uuidOf('Alex') !== uuidOf('Steve') && uuidOf('Alex') !== uuidOf('alex'));
  check('uuid: the same name is the same player every time', uuidOf('Alex') === uuidOf('Alex'));
  check('uuid: a version 3 uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuidOf('Alex')));
}

// ---------------------------------------------------------------------------
// a guest comes back as it left

const WORLD = 'w1';
const recipeIds = [...m.BOOK_BY_ID.keys()].slice(0, 3);
let kept = null;
{
  const k = keeper(WORLD);
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  const a = guest(host, 'Alex');
  step(host, 3);
  const s0 = sessionOf(host, 'Alex');
  check('join: while its player is read from the save, it isn\'t in yet', s0 && s0.state === 'login' && s0.loggingIn && !hostCopy(host, a) && a.session.state === 'login');
  await settle(host, 6);
  const ha = hostCopy(host, a);
  check('join: once it\'s read, it\'s in', ha && a.session.state === 'play' && host.chat.includes('§eAlex joined the game'));
  check('join: new here, it starts by the world spawn with nothing', ha && Math.hypot(ha.x - 0.5, ha.z - 0.5) < 1 && ha.inventory.main.every((s) => !s) && ha.health === 20);
  check('join: its player goes by the uuid of its name', ha?.uuid === uuidOf('Alex'));
  // (what it has, as play would have given it)
  const inv = ha.inventory;
  inv.main[0] = S('iron_pickaxe');
  inv.main[0].damage = 40;
  inv.main[3] = S('bread', 5);
  inv.main[20] = S('torch', 33);
  inv.offhand = S('shield');
  inv.armor[2] = S('iron_chestplate');
  inv.version++;
  ha.health = 14;
  ha.food.level = 15;
  ha.xpLevel = 7;
  ha.xpProgress = 0.5;
  ha.xpTotal = 150;
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('speed'), 2400, 1));
  ha.respawnPos = [3, 64, 3];
  ha.respawnForced = true;
  s0.recipes.add(recipeIds.map((id) => m.BOOK_BY_ID.get(id)));
  // (it walks off and looks about, the bread in hand)
  a.player.moveTo(5.5, 64, 7.5, 45, 10);
  a.player.inventory.selected = 3;
  a.player.inventory.version++;
  await settle(host, 5);
  check('play: the host has it where it went, the bread in hand', Math.abs(ha.x - 5.5) < 1e-9 && Math.abs(ha.z - 7.5) < 1e-9 && ha.inventory.selected === 3, `${ha.x},${ha.z} ${ha.inventory.selected}`);
  // the world is saved with it still here
  k.puts.length = 0;
  host.server.saveAll();
  check('save: the world saved with it here keeps its player as it is now', k.puts.length === 1 && k.puts[0].uuid === uuidOf('Alex') && k.puts[0].d.xpLevel === 7);
  // it leaves
  k.puts.length = 0;
  a.session.leave();
  await settle(host, 2);
  check('leave: it\'s kept as it leaves', k.puts.length === 1 && k.puts[0].uuid === uuidOf('Alex'), `${k.puts.length}`);
  const d = k.puts[0]?.d;
  check('leave: ...where it was, its look', d && Math.abs(d.x - 5.5) < 1e-9 && Math.abs(d.z - 7.5) < 1e-9 && d.yaw === 45 && d.pitch === 10 && d.dimension === 'overworld');
  check('leave: ...its recipe book', d?.recipeBook && recipeIds.every((id) => d.recipeBook.known.includes(id)));
  check('leave: ...not the host\'s advancements (a guest has none kept)', d && d.advancements === undefined);
  // written with the world
  await k.store.save();
  const key = `${WORLD}/data/playerdata/${uuidOf('Alex')}`;
  check('save: written with the world, under <world>/data/playerdata/<uuid>', idb.chunks.has(key) && idb.chunks.get(key).data.xpLevel === 7, [...idb.chunks.keys()].join());
  kept = structuredClone(idb.chunks.get(key).data);
}

{
  // the world opened again, another day: the record read back from the save
  const k = keeper(WORLD);
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  const a = guest(host, 'Alex');
  await settle(host, 8);
  const ha = hostCopy(host, a);
  check('back: in, by the same name', ha && a.session.state === 'play');
  check('back: where it was, looking where it looked', ha && Math.abs(ha.x - 5.5) < 1e-9 && Math.abs(ha.z - 7.5) < 1e-9 && ha.yaw === 45 && ha.pitch === 10, ha && `${ha.x},${ha.z} ${ha.yaw} ${ha.pitch}`);
  check('back: its guest starts there too', Math.abs(a.player.x - 5.5) < 1e-9 && Math.abs(a.player.z - 7.5) < 1e-9 && a.player.yaw === 45);
  const inv = ha.inventory;
  check('back: its inventory as it was', inv.main[0]?.item.id === 'iron_pickaxe' && inv.main[0].damage === 40 && inv.main[3]?.count === 5 && inv.main[20]?.count === 33);
  check('back: its offhand and armour', inv.offhand?.item.id === 'shield' && inv.armor[2]?.item.id === 'iron_chestplate');
  check('back: its health, food and experience', ha.health === 14 && ha.food.level === 15 && ha.xpLevel === 7 && ha.xpProgress === 0.5 && ha.xpTotal === 150, `${ha.health} ${ha.food.level} ${ha.xpLevel}`);
  check('back: its effects', ha.getEffect('speed')?.amplifier === 1 && ha.getEffect('speed').duration > 2000);
  check('back: its spawn point', ha.respawnPos?.join() === '3,64,3' && ha.respawnForced === true);
  check('back: its hotbar slot', ha.inventory.selected === 3);
  const s = sessionOf(host, 'Alex');
  check('back: its recipe book', recipeIds.every((id) => s.recipes.known.has(id)));
  await settle(host, 4);
  // (and the guest is told it all)
  const gi = a.player.inventory;
  check('back: the guest\'s inventory, offhand and armour are the host\'s', gi.main[0]?.item.id === 'iron_pickaxe' && gi.main[0].damage === 40 && gi.main[20]?.count === 33 && gi.offhand?.item.id === 'shield' && gi.armor[2]?.item.id === 'iron_chestplate');
  check('back: the guest\'s health, food and levels', a.player.health === 14 && a.player.food.level === 15 && a.player.xpLevel === 7, `${a.player.health} ${a.player.food.level} ${a.player.xpLevel}`);
  check('back: the guest\'s effects and hotbar slot', a.player.hasEffect('speed') && a.player.inventory.selected === 3);
  check('back: the guest\'s recipe book', recipeIds.every((id) => a.recipes.has(id)));
  // someone new
  const b = guest(host, 'Steve');
  await settle(host, 8);
  const hb = hostCopy(host, b);
  check('another name comes new: by the spawn, with nothing', hb && Math.hypot(hb.x - 0.5, hb.z - 0.5) < 1 && hb.inventory.main.every((x) => !x) && !hb.inventory.offhand && hb.health === 20);
}

{
  // the world opened to LAN in another game mode: that one, and all else as it was (vanilla getForcedGameType)
  const k = keeper(WORLD);
  const host = flatHost(m, 4, { guestGameMode: 'creative', hooks: k.hooks });
  const a = guest(host, 'Alex');
  await settle(host, 8);
  const ha = hostCopy(host, a);
  check('game mode: it comes in playing what the world is open in', ha?.gameMode === 'creative' && a.player.gameMode === 'creative');
  check('game mode: ...with all it had', ha?.inventory.main[0]?.item.id === 'iron_pickaxe' && ha.xpLevel === 7);
  // flying as it leaves, flying as it comes back
  // (taken off: up in the air, off the ground)
  a.player.flying = true;
  a.player.moveTo(5.5, 70, 7.5, 45, 10);
  a.player.onGround = false;
  await settle(host, 4);
  check('flying: the host has it flying', ha.flying === true);
  a.session.leave();
  await settle(host, 2);
  const b = guest(host, 'Alex');
  await settle(host, 8);
  const hb = hostCopy(host, b);
  // (up where it was, not falling: a fall from there would be two blocks by now)
  check('flying: back, it\'s flying still, there and on the host', hb?.flying === true && b.player.flying === true && b.player.y > 69.5, `${hb?.flying} ${b.player.flying} ${b.player.y}`);
}

// ---------------------------------------------------------------------------
// asleep, dead, riding

{
  const k = keeper('w2');
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  const lvl = host.level;
  const a = guest(host, 'Alex');
  await settle(host, 8);
  let ha = hostCopy(host, a);
  const bx = -4, bz = 3;
  lvl.world.setState(bx, 64, bz, m.S('red_bed', { part: 'foot', facing: 'south' }));
  lvl.world.setState(bx, 64, bz + 1, m.S('red_bed', { part: 'head', facing: 'south' }));
  lvl.dayTime = 14000;
  a.player.moveTo(bx + 0.5, 64, bz - 1.2, 0, 30);
  await settle(host, 4);
  sessionOf(host, 'Alex').useBed(bx, 64, bz);
  await settle(host, 3);
  const occupied = () => m.BLOCKS[m.STATE_BLOCK[lvl.world.getState(bx, 64, bz + 1)]].get(lvl.world.getState(bx, 64, bz + 1), 'occupied');
  check('asleep: (in bed, the bed taken)', ha.isSleeping() && occupied() === true);
  k.puts.length = 0;
  a.session.leave();
  await settle(host, 2);
  const d = k.puts[0]?.d;
  check('asleep: leaving wakes it, and the bed is free again (vanilla ServerPlayer.disconnect)', !ha.isSleeping() && occupied() === false);
  const inBed = (x, z) => Math.floor(x) === bx && (Math.floor(z) === bz || Math.floor(z) === bz + 1);
  check('asleep: kept up beside the bed, not in it', d && Math.hypot(d.x - (bx + 0.5), d.z - (bz + 1.5)) < 2.5 && !inBed(d.x, d.z) && d.respawn?.slice(0, 3).join() === `${bx},64,${bz + 1}`, d && `${d.x},${d.y},${d.z}`);
  const b = guest(host, 'Alex');
  await settle(host, 8);
  ha = hostCopy(host, b);
  check('asleep: back, it\'s up beside the bed, its spawn point the bed', ha && !ha.isSleeping() && !b.player.isSleeping() && Math.abs(ha.x - d.x) < 1e-9 && ha.respawnPos?.join() === `${bx},64,${bz + 1}`);

  // dead: it leaves on its death screen, and comes back to it
  const deaths = () => host.chat.filter((t) => t === 'Alex died').length;
  ha.hurt(1000, 'generic');
  await settle(host, 3);
  check('dead: (it died, on its death screen, everyone told)', ha.health <= 0 && b.died.length === 1 && deaths() === 1);
  k.puts.length = 0;
  b.session.leave();
  await settle(host, 2);
  check('dead: kept dead', k.puts[0]?.d.dead === true && k.puts[0].d.health <= 0);
  const c = guest(host, 'Alex');
  await settle(host, 8);
  ha = hostCopy(host, c);
  check('dead: back, it\'s dead still, on its death screen (nothing on it of how)', ha && ha.health <= 0 && c.died.length === 1 && c.died[0] === '' && c.player.health <= 0, `${ha?.health} ${JSON.stringify(c.died)} ${c.player.health}`);
  check('dead: it doesn\'t die again: nobody told a second time', deaths() === 1, `${deaths()}`);
  c.session.respawn();
  await settle(host, 4);
  check('dead: Respawn brings it back alive at its bed', ha.health === 20 && c.respawned === 1 && c.player.health === 20 && Math.hypot(ha.x - (bx + 0.5), ha.z - (bz + 1.5)) < 2.5, `${ha.health} ${c.respawned} ${ha.x},${ha.z}`);

  // riding alone: the boat goes with it, and comes back with it
  const boat = new m.Boat(lvl);
  boat.moveTo(ha.x + 2, 64, ha.z, 0, 0);
  lvl.addEntity(boat);
  ha.startRiding(boat, true);
  await settle(host, 5);
  check('riding: (in the boat, alone; the guest too)', ha.vehicle === boat && c.player.vehicle?.type === 'boat', c.player.vehicle?.type);
  check('riding: a boat one player rides is kept with that player, not its chunk (vanilla hasExactlyOnePlayerPassenger)', m.carriesOnePlayer(boat) && !m.isChunkSaved(boat));
  k.puts.length = 0;
  c.session.leave();
  await settle(host, 2);
  check('riding: leaving, the boat goes with it (vanilla UNLOADED_WITH_PLAYER)', boat.removed && !lvl.entities.includes(boat));
  check('riding: ...kept in its record', k.puts[0]?.d.vehicle?.id === 'boat', JSON.stringify(k.puts[0]?.d.vehicle?.id));
  const e = guest(host, 'Alex');
  await settle(host, 10);
  ha = hostCopy(host, e);
  const back = ha?.vehicle;
  check('riding: back, in a boat again, where the boat was', back && !back.removed && lvl.entities.includes(back) && Math.abs(back.x - boat.x) < 1e-6 && Math.abs(back.z - boat.z) < 1e-6);
  check('riding: its guest rides its copy of it', e.player.vehicle && e.session.entities.get(back.id)?.e === e.player.vehicle);

  // two players in one boat: it stays with its chunk, and with the other player when one leaves
  const f = guest(host, 'Steve');
  await settle(host, 8);
  const hf = hostCopy(host, f);
  hf.startRiding(back, true);
  await settle(host, 3);
  check('shared: a boat two players ride is its chunk\'s', !m.carriesOnePlayer(back) && m.isChunkSaved(back));
  k.puts.length = 0;
  e.session.leave();
  await settle(host, 2);
  check('shared: one leaving, the boat stays, with the other in it', !back.removed && hf.vehicle === back && !k.puts[0]?.d.vehicle, `${back.removed} ${!!k.puts[0]?.d.vehicle}`);
}

// ---------------------------------------------------------------------------
// kept in another dimension than the host is in now

{
  const k = keeper('w3');
  const host = flatHost(m, 4, { guestGameMode: 'survival', spawn: [2.5, 64, 2.5], hooks: k.hooks });
  const rec = structuredClone(kept);
  rec.dimension = 'the_nether';
  rec.x = 400.5;
  rec.z = -300.5;
  const nb = new m.Boat(host.level);
  nb.moveTo(402, 70, -300, 0, 0);
  rec.vehicle = m.saveEntity(nb);
  k.store.put(uuidOf('Alex'), rec);
  const a = guest(host, 'Alex');
  await settle(host, 8);
  const ha = hostCopy(host, a);
  check('elsewhere: kept in the Nether, the host in the Overworld: it comes in by the host\'s spawn point', ha && Math.abs(ha.x - 2.5) < 1e-9 && Math.abs(ha.z - 2.5) < 1e-9, ha && `${ha.x},${ha.z}`);
  check('elsewhere: ...with all it had', ha?.inventory.main[0]?.item.id === 'iron_pickaxe' && ha.inventory.offhand?.item.id === 'shield');
  check('elsewhere: what it rode is put back where it was in the Nether, not brought along', !ha.vehicle && k.left.length === 1 && k.left[0].dim === 'the_nether' && k.left[0].e.x === 402);
}

// ---------------------------------------------------------------------------
// while its player is being read

{
  const k = keeper('w4');
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  k.hold = held();
  const a = guest(host, 'Alex');
  await settle(host, 4);
  check('reading: (Alex being read)', sessionOf(host, 'Alex')?.loggingIn === true);
  // the same name from another window meanwhile
  const r = rawGuest(host);
  await settle(host, 2);
  r.hello('Alex', { uuid: uuidOf('Alex') });
  await settle(host, 3);
  check('reading: the same name meanwhile is turned away', /already playing here|already in this world/.test(r.reason() ?? ''), r.reason());
  // the seats: those being read take one
  const others = [];
  for (let i = 0; i < m.MAX_GUESTS - 1; i++) others.push(guest(host, `Guest${i}`));
  await settle(host, 4);
  const late = rawGuest(host);
  await settle(host, 2);
  late.hello('Latecomer', { uuid: uuidOf('Latecomer') });
  await settle(host, 3);
  check('reading: a seat is held for it (the world is full)', late.reason() === 'The world is full.', late.reason());
  k.hold.release();
  k.hold = null;
  await settle(host, 8);
  check('reading: once read, it\'s in, as are the others', hostCopy(host, a) && a.session.state === 'play' && others.every((g) => g.session.state === 'play'));
}

{
  // it goes before its player is read: nothing comes of the read
  const k = keeper('w5');
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  k.hold = held();
  const a = guest(host, 'Alex');
  await settle(host, 4);
  a.session.leave();
  await settle(host, 2);
  k.hold.release();
  await settle(host, 6);
  check('left while read: nobody put in the level, nothing kept, no word of it', !hostCopy(host, a) && k.puts.length === 0 && !host.chat.some((t) => t.includes('Alex')) && host.server.sessions.size === 0);
}

{
  // the read fails: turned away, what was kept left as it was
  const k = keeper(WORLD);
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  idb.failReads = true;
  const errors = [], err = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  const a = guest(host, 'Alex');
  await settle(host, 8);
  console.error = err;
  idb.failReads = false;
  check('read fails: the guest is told why, and not let in', a.disconnected === "Couldn't read your player from this world's save." && !hostCopy(host, a), a.disconnected);
  check('read fails: nothing written over what was kept', k.puts.length === 0 && idb.chunks.get(`${WORLD}/data/playerdata/${uuidOf('Alex')}`)?.data.xpLevel === 7);
  check('read fails: said once in the console', errors.length === 1 && errors[0].includes("reading Alex's player"), errors.join(' | '));
  // (and the next try, the save readable again, goes in)
  const b = guest(host, 'Alex');
  await settle(host, 8);
  check('read fails: trying again once it can be read, it\'s back with everything', hostCopy(host, b)?.inventory.main[0]?.item.id === 'iron_pickaxe');
}

// ---------------------------------------------------------------------------
// a world that isn't saved (a quick test's) keeps its guests while it's open, and writes nothing

{
  const before = idb.chunks.size;
  const k = keeper(null);
  const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: k.hooks });
  const a = guest(host, 'Alex');
  await settle(host, 8);
  hostCopy(host, a).xpLevel = 3;
  a.session.leave();
  await settle(host, 2);
  await k.store.save();
  const b = guest(host, 'Alex');
  await settle(host, 8);
  check('unsaved world: a guest comes back as it left, while the world is open', hostCopy(host, b)?.xpLevel === 3);
  check('unsaved world: nothing written to the save', idb.chunks.size === before);
}

// ---------------------------------------------------------------------------
// no hooks (the tests before this stage, a host that keeps nobody): let in at once, new each time

{
  const host = flatHost(m, 4, { guestGameMode: 'survival' });
  const a = guest(host, 'Alex');
  step(host, 3);
  check('no keeping: let in the tick it says hello, as before', hostCopy(host, a) && a.session.state === 'play');
}

// the uuid is a record's key: only hex digits and dashes get through (a hello with anything else is bad data)
{
  const host = flatHost(m, 4, { hooks: keeper('w6').hooks });
  const r = rawGuest(host);
  step(host, 2);
  r.hello('Sneaky', { uuid: '../../worlds/x' });
  await settle(host, 3);
  check('security: a uuid that isn\'t one (a path) is turned away before anything is read', /^Bad data/.test(r.reason() ?? '') && ![...idb.chunks.keys()].some((k) => k.includes('..')), r.reason());
}

await exitWithStatus(close);
