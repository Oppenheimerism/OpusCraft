// Multiplayer checks for the ender chest (node tests/survival-blocks/ender-chest-mp.mjs): a guest opens one by using
// it, the host deciding, onto that guest's own 27 slots (titled Ender Chest in its game); two guests at one chest each
// see their own; the lid rises and falls in the guests' copies and its sounds are heard; and a guest's slots are never
// lost: not by leaving and coming back, nor by closing its tab, nor by the host saving, quitting and opening the world
// again, nor by dying; and the host's own player's go with the world's meta.
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, check, exitWithStatus } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

// IndexedDB as worldStore uses it (as tests/multiplayer/m4-playerdata.mjs fakes it): records structured-cloned in and
// out, each request answered in a later task
const idb = { worlds: new Map(), chunks: new Map(), entities: new Map() };
const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore() {},
  transaction(name) {
    const store = idb[name], t = { error: null };
    t.objectStore = () => ({
      get(k) {
        return { result: structuredClone(store.get(k)) };
      },
      put(v) {
        store.set(v.key ?? v.id, structuredClone(v));
        return { result: undefined };
      },
    });
    setImmediate(() => t.oncomplete?.());
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

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/openMenu.ts', '/src/net/menus.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts',
  '/src/inventory/container.ts', '/src/inventory/menus.ts', '/src/game/playerData.ts', '/src/storage/worldStore.ts', '/src/game/enderChest.ts',
  '/src/world/enderChestBlockEntity.ts', '/src/game/playerDeath.ts', '/src/inventory/recipeBook.ts',
]);

const later = () => new Promise((r) => setImmediate(r));
/** `n` ticks, with the tasks a read from the save needs between them */
async function settle(host, n = 1) {
  for (let i = 0; i < n; i++) {
    step(host);
    for (let j = 0; j < 4; j++) await later();
  }
}
/** a world's guests' players, as the Game keeps them (its PlayerDataStore) */
function keeper(worldId) {
  const store = new m.PlayerDataStore(worldId);
  const k = { store, puts: [] };
  k.hooks = {
    loadGuest: (uuid) => store.load(uuid),
    saveGuest: (uuid, d) => {
      k.puts.push({ uuid, d });
      store.put(uuid, d);
    },
    leaveInDimension() {},
  };
  return k;
}
const S = (id, n = 1) => m.ItemStack.of(id, n);
const key = (s) => (s ? `${s.item.id}x${s.count}${s.damage ? ':' + s.damage : ''}` : '-');
const sessOf = (host, g) => host.server.sessionOf(hostCopy(host, g));
const heard = (g, name) => g.level.sounds.filter((s) => s.name === name).length;

/** a guest joining `host`, its games showing the menus the host opens for it */
async function join(host, name) {
  const g = makeGuest(host, name, { uuid: m.offlinePlayerUuid(name), viewDistance: 4 });
  g.shown = [];
  g.hidden = [];
  g.session.hooks.openMenu = (menu) => g.shown.push(menu);
  g.session.hooks.closeMenu = (menu) => g.hidden.push(menu);
  await settle(host, 8);
  return g;
}
/** the guest's player looking at (x, y, z) from where it stands */
function lookAt(g, x, y, z) {
  const p = g.player, eye = p.y + p.eyeHeight;
  const tx = x - p.x, ty = y - eye, tz = z - p.z;
  p.yaw = (Math.atan2(-tx, tz) * 180) / Math.PI;
  p.pitch = (-Math.atan2(ty, Math.hypot(tx, tz)) * 180) / Math.PI;
}
/** put the guest's player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(host, g, x, z) {
  for (let k = 0; k < 40; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, 64, p.z + dz * f, p.yaw, p.pitch);
    step(host, 1);
  }
  step(host, 3);
}
/** the guest uses the block at (x, y, z) (a press of the use button): the menu its game shows, if any */
function openAt(host, g, x, y, z) {
  lookAt(g, x + 0.5, y + 0.5, z + 0.5);
  step(host, 2);
  const n = g.shown.length;
  g.session.input(false, false, true, false, null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
  return g.shown.length > n ? g.session.menus.open?.menu ?? null : null;
}
/** the host's copy of `g`'s player given `stack` in inventory slot `i` */
function give(host, g, i, stack) {
  const inv = hostCopy(host, g).inventory;
  inv.main[i] = stack;
  inv.version++;
  step(host, 2);
}
/** the menu's click, as the guest's screen makes it, and the ticks after */
function click(host, menu, slot, button, type) {
  menu.clicked(slot, button, type);
  step(host, 2);
}
/** what `g`'s player's ender chest holds, on the host */
const ender = (host, g) => m.enderChestOf(hostCopy(host, g)).container.items.map(key).join(',');

const WORLD = 'ender-world';
const X = 2, Y = 64, Z = 0;
let hostSaved = null;
{
  const k = keeper(WORLD);
  const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival', hooks: k.hooks });
  const lvl = host.level;
  // (the host's own game shows a guest's menu to its guest, as Game.showMenu does)
  m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
  const a = await join(host, 'Alex'), b = await join(host, 'Steve');
  lvl.setBlock(X, Y, Z, m.S('ender_chest', { facing: 'north' }));
  step(host, 3);
  walkTo(host, a, 2.5, -2.5);
  walkTo(host, b, 4.5, -2.5);
  const ha = hostCopy(host, a), hb = hostCopy(host, b);
  check('setup: both guests in, the chest there for both', ha && hb && a.world.getState(X, Y, Z) === lvl.getState(X, Y, Z) && a.world.getBlockEntity(X, Y, Z) instanceof m.EnderChestBlockEntity);

  // ------------------------------------------------------------------------
  // a guest opens it
  const o0 = heard(a, 'block.ender_chest.open'), ob0 = heard(b, 'block.ender_chest.open');
  const gm = openAt(host, a, X, Y, Z);
  const hm = sessOf(host, a).menus.menu;
  check('open: the host opened a chest menu over the guest\'s own ender chest', hm instanceof m.ChestMenu && hm.chest === m.enderChestOf(ha));
  check('open: its game shows it, titled Ender Chest, 27 slots over its inventory', gm instanceof m.ChestMenu && gm !== hm && gm.title === 'Ender Chest' && gm.slots.length === 63);
  check('open: the lid heard by both guests', heard(a, 'block.ender_chest.open') === o0 + 1 && heard(b, 'block.ender_chest.open') === ob0 + 1);
  const copyA = a.world.getBlockEntity(X, Y, Z), copyB = b.world.getBlockEntity(X, Y, Z);
  check('lid: the guests\' copies have it going up', copyA?.lidOpen === true && copyB?.lidOpen === true);
  const tA = a.level.gameTime;
  check('lid: rising in the guest\'s copy as on the host', copyA.openness(tA) > 0 && Math.abs(copyA.openness(tA) - lvl.world.getBlockEntity(X, Y, Z).openness(tA)) < 1e-9);
  // (things put in by shift-click from its inventory)
  give(host, a, 9, S('diamond', 12));
  give(host, a, 10, S('golden_apple', 3));
  click(host, gm, 27, 0, 'quick_move');
  click(host, gm, 28, 0, 'quick_move');
  check('put in: the host has them in the guest\'s ender chest', ender(host, a).startsWith('diamondx12,golden_applex3,'), ender(host, a).slice(0, 40));
  check('put in: and the guest\'s copy shows them', key(gm.slots[0].item) === 'diamondx12' && key(gm.slots[1].item) === 'golden_applex3' && !a.player.inventory.main[9]);
  // (the other guest at the same chest: its own slots)
  const gb = openAt(host, b, X, Y, Z);
  check('two guests: the second opens its own, empty', gb instanceof m.ChestMenu && gb.slots.slice(0, 27).every((s) => !s.item) && sessOf(host, b).menus.menu.chest === m.enderChestOf(hb));
  check('two guests: the lid heard only the once', heard(a, 'block.ender_chest.open') === o0 + 1);
  give(host, b, 9, S('emerald', 5));
  click(host, gb, 27, 0, 'quick_move');
  check('two guests: what each puts in is its own', ender(host, b).startsWith('emeraldx5,') && ender(host, a).startsWith('diamondx12,'));
  check('two guests: neither sees the other\'s', key(gm.slots[0].item) === 'diamondx12' && key(gb.slots[0].item) === 'emeraldx5');
  // (the first closes its screen: the lid stays up for the second; the last out, it shuts)
  const c0 = heard(b, 'block.ender_chest.close');
  gm.removed();
  step(host, 3);
  check('close: one leaves, the lid stays up, no sound', copyB.lidOpen === true && b.world.getBlockEntity(X, Y, Z).lidOpen === true && heard(b, 'block.ender_chest.close') === c0);
  gb.removed();
  step(host, 3);
  check('close: the last out, the lid comes down in the copies, heard', b.world.getBlockEntity(X, Y, Z).lidOpen === false && a.world.getBlockEntity(X, Y, Z).lidOpen === false && heard(b, 'block.ender_chest.close') === c0 + 1);
  check('close: the host\'s chest has nobody looking in', lvl.world.getBlockEntity(X, Y, Z).openers.size === 0);

  // ------------------------------------------------------------------------
  // blocked, out of reach
  lvl.setBlock(X, Y + 1, Z, m.S('stone'));
  step(host, 2);
  check('blocked: under stone, the guest gets no menu', openAt(host, a, X, Y, Z) === null && !sessOf(host, a).menus.menu.chest);
  lvl.setBlock(X, Y + 1, Z, 0);
  step(host, 2);
  const gm2 = openAt(host, a, X, Y, Z);
  check('reach: opened again', gm2 instanceof m.ChestMenu && gm2.title === 'Ender Chest');
  walkTo(host, a, 2.5, -14.5);
  check('reach: walked off, the host closes it for the guest', a.hidden.includes(gm2) && sessOf(host, a).menus.containerId === 0 && lvl.world.getBlockEntity(X, Y, Z).openers.size === 0);
  walkTo(host, a, 2.5, -2.5);

  // ------------------------------------------------------------------------
  // leaving and coming back
  const gm3 = openAt(host, a, X, Y, Z);
  check('leave: (open as it leaves)', gm3 instanceof m.ChestMenu && lvl.world.getBlockEntity(X, Y, Z).openers.size === 1);
  k.puts.length = 0;
  a.session.leave();
  await settle(host, 3);
  host.guests.splice(host.guests.indexOf(a), 1);
  const rec = k.puts.find((p) => p.uuid === m.offlinePlayerUuid('Alex'))?.d;
  check('leave: its menu closed, the lid shut', lvl.world.getBlockEntity(X, Y, Z).openers.size === 0 && lvl.world.getBlockEntity(X, Y, Z).lidOpen === false);
  check('leave: its ender chest kept with its record', rec?.enderItems?.[0]?.[0] === 'diamond' && rec.enderItems[0][1] === 12 && rec.enderItems[1]?.[0] === 'golden_apple');
  const a2 = await join(host, 'Alex');
  check('rejoin: its ender chest as it was', ender(host, a2).startsWith('diamondx12,golden_applex3,'));
  walkTo(host, a2, 2.5, -2.5);
  const gm4 = openAt(host, a2, X, Y, Z);
  check('rejoin: opened, its game shows what\'s in it', key(gm4?.slots[0].item) === 'diamondx12' && key(gm4.slots[1].item) === 'golden_applex3');
  // (taken out, then its tab closed without a word, the menu open)
  click(host, gm4, 1, 0, 'quick_move');
  check('rejoin: an apple taken out', ender(host, a2).startsWith('diamondx12,-,') && hostCopy(host, a2).inventory.main.some((s) => s?.item.id === 'golden_apple'));
  gm4.slots[5].item; // (nothing)
  give(host, a2, 12, S('iron_ingot', 9));
  click(host, gm4, 30, 0, 'quick_move');
  k.puts.length = 0;
  a2.transport.close();
  await settle(host, 3);
  host.guests.splice(host.guests.indexOf(a2), 1);
  const rec2 = k.puts.find((p) => p.uuid === m.offlinePlayerUuid('Alex'))?.d;
  check('closed tab: kept as it went, iron in, the apple out', rec2?.enderItems?.[0]?.[0] === 'diamond' && rec2.enderItems[1]?.[0] === 'iron_ingot' && rec2.enderItems[1][1] === 9);
  check('closed tab: the lid shut after it', lvl.world.getBlockEntity(X, Y, Z).openers.size === 0);
  const a3 = await join(host, 'Alex');
  check('closed tab: back by the same name, its ender chest as it left it', ender(host, a3).startsWith('diamondx12,iron_ingotx9,'), ender(host, a3).slice(0, 40));

  // ------------------------------------------------------------------------
  // dying
  const ha3 = hostCopy(host, a3);
  ha3.inventory.main[0] = S('cobblestone', 30);
  ha3.inventory.version++;
  const items0 = lvl.entities.filter((e) => e.type === 'item').length;
  ha3.hurt(1000, 'generic');
  await settle(host, 3);
  const dropped = lvl.entities.filter((e) => e.type === 'item').slice(items0).map((e) => e.item?.item.id ?? e.stack?.item.id);
  check('death: (the guest died, its inventory dropped)', ha3.health <= 0 && dropped.includes('cobblestone'));
  check('death: nothing of its ender chest dropped', !dropped.includes('diamond') && !dropped.includes('iron_ingot'));
  a3.session.respawn();
  await settle(host, 4);
  check('death: back alive, its ender chest untouched', hostCopy(host, a3)?.health === 20 && ender(host, a3).startsWith('diamondx12,iron_ingotx9,'));

  // ------------------------------------------------------------------------
  // the host's own player at an ender chest: its own slots again
  const hp = host.player;
  hp.moveTo(2.5, 64, -3.5, 0, 30);
  const shownHost = [];
  m.setShowMenu((p, menu) => (p === hp ? (shownHost.push(menu), true) : host.server.showMenu(p, menu)));
  m.openEnderChest(lvl, X, Y, Z, hp);
  check('host: its own ender chest, not a guest\'s', shownHost[0]?.chest === m.enderChestOf(hp) && shownHost[0].slots.slice(0, 27).every((s) => !s.item));
  shownHost[0].slots[4].set(S('ender_pearl'));
  shownHost[0].removed();
  m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
  // the world saved and the game quit with the guests still in (Game.saveWorld: its own player in the meta, the
  // guests' records written)
  k.puts.length = 0;
  host.server.saveAll();
  check('save: the guests still in are kept', k.puts.some((p) => p.uuid === m.offlinePlayerUuid('Alex')) && k.puts.some((p) => p.uuid === m.offlinePlayerUuid('Steve')));
  hostSaved = structuredClone(m.savePlayer(hp, 'overworld'));
  await k.store.save();
  check('save: written with the world', idb.chunks.has(`${WORLD}/data/playerdata/${m.offlinePlayerUuid('Alex')}`) && idb.chunks.has(`${WORLD}/data/playerdata/${m.offlinePlayerUuid('Steve')}`));
  check('save: the host\'s own slots in its meta', hostSaved.enderItems?.[4]?.[0] === 'ender_pearl');
}

// ---------------------------------------------------------------------------
// the world opened again: everyone's ender chest as it was
{
  const k = keeper(WORLD);
  const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival', hooks: k.hooks });
  m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
  m.loadPlayer(host.player, hostSaved);
  check('reopen: the host\'s own ender chest back from its meta', m.enderChestOf(host.player).container.get(4)?.item.id === 'ender_pearl');
  const lvl = host.level;
  lvl.setBlock(X, Y, Z, m.S('ender_chest', { facing: 'north' }));
  const b = await join(host, 'Steve'), a = await join(host, 'Alex');
  check('reopen: Alex\'s back, read from the save', ender(host, a).startsWith('diamondx12,iron_ingotx9,'), ender(host, a).slice(0, 40));
  check('reopen: Steve\'s back, its own', ender(host, b).startsWith('emeraldx5,-,'));
  walkTo(host, a, 2.5, -2.5);
  const gm = openAt(host, a, X, Y, Z);
  check('reopen: opened, the guest\'s game shows it all', key(gm?.slots[0].item) === 'diamondx12' && key(gm.slots[1].item) === 'iron_ingotx9');
  gm?.removed();
  step(host, 2);
  m.setShowMenu(null);
}

await exitWithStatus(close);
