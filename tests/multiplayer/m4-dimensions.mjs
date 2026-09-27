// Stage 4: guests go where the host goes (vanilla ServerPlayer.changeDimension and ClientboundRespawnPacket). The host
// runs one dimension, its own, so when it goes through a portal (or respawns elsewhere, or a command sends it) its
// guests go too: out of whatever they were doing there (menus closed, what they held put back; woken; off what they
// rode, which stays), their games let go of the old world and wait on the loading screen (the nether portal's swirl, the
// end portal's stars) with the host; meanwhile they still chat, answer, change hotbar slot, can leave (kept where they
// were), and nobody times out, the End Poem's minutes included, while what they did for the world they left is let go;
// a guest joining meanwhile comes in once the host is there. The host there, they come in beside it and are shown the
// world from there, their inventories sent again. A guest's own portals aren't its to take (only the host takes
// everyone), but an end gateway takes a guest as anything, and the guest carries on from its exit. A guest respawns at
// its bed once the bed's chunks are in (waiting a few seconds for them, its bed kept if they don't come), and by the
// host in another dimension, its bed kept for when they're home.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, stepIdle, hostChangeDimension, mirrorDiff, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/game.ts', '/src/net/server/menuSync.ts', '/src/net/client/clientMenus.ts', '/src/inventory/menus.ts',
  '/src/inventory/container.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts', '/src/game/gatewayTravel.ts', '/src/game/endPortal.ts',
]);

const saved = new Map();
let host = null;
/** where a guest new to the world starts, as Game.guestSpawnPoint has it: by the world spawn in the Overworld, else by the host */
const spawnPoint = () => (host.world.dim.id === 'overworld' ? [0.5, 65, 0.5] : [host.player.x, host.player.y, host.player.z]);
host = flatHost(m, 4, { guestGameMode: 'survival', gameMode: 'survival', hooks: { spawnPoint, saveGuest: (uuid, d) => saved.set(uuid, d) } });
const lvl = host.level;

// (the host's own game takes the portals: Game.portalEntered, on a stand-in for the rest of the game)
const G = m.Game.prototype;
const hostTravels = [];
const game = { mode: 'host', server: host.server, player: host.player, level: lvl, advancements: { trigger() {} }, portalTravel: (x, y, z) => hostTravels.push([x, y, z]) };
lvl.onPortal = (e, x, y, z, kind) => G.portalEntered.call(game, e, x, y, z, kind);

const a = makeGuest(host, 'Alex');
const b = makeGuest(host, 'Steve');
for (const g of [a, b]) {
  g.hidden = [];
  g.session.hooks.closeMenu = (menu) => g.hidden.push(menu);
}
step(host, 40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
const sa = host.server.sessionOf(ha), sb = host.server.sessionOf(hb);
const uuidOf = (g) => g.session.me.uuid;
const S = (id, n = 1) => m.ItemStack.of(id, n);
const key = (s) => m.stackKey(s);
const near = (p, x, z) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6;
const REFUSED = 'Only the host can take everyone to another dimension.';

/** the host's world has the chunks in [cx0, cx1] x [cz0, cz1] (the new dimension's round the host, as its game loads them) */
function fill(cx0, cz0, cx1, cz1) {
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) if (!lvl.world.getChunk(cx, cz)) host.makeChunk(cx, cz);
}
/** the host's copy of a guest's player given `stack` in inventory slot `i` */
function give(p, i, stack) {
  p.inventory.main[i] = stack;
  p.inventory.version++;
}
/** put the guest's player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(g, x, z) {
  for (let k = 0; k < 40; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, p.y, p.z + dz * f, p.yaw, p.pitch);
    step(host, 1);
  }
  step(host, 3);
}
/** what differs between what `g` shows of its inventory (and its cursor) and what the host has */
function inventoryDiff(g, s) {
  const gm = g.session.menus.inventory, hm = s.menus.inventory, out = [];
  for (let i = 0; i < hm.slots.length; i++) if (key(gm.slots[i].item) !== key(hm.slots[i].item)) out.push(`${i}: ${key(gm.slots[i].item) || '-'} vs ${key(hm.slots[i].item) || '-'}`);
  if (key(gm.carried) !== key(hm.carried)) out.push(`cursor: ${key(gm.carried) || '-'} vs ${key(hm.carried) || '-'}`);
  return out;
}
/** the blocks `name` round the host's player */
function blocksNear(name, r = 4) {
  const st = m.S(name), p = host.player, out = [];
  for (let y = 63; y <= 67; y++)
    for (let z = Math.floor(p.z) - r; z <= Math.floor(p.z) + r; z++)
      for (let x = Math.floor(p.x) - r; x <= Math.floor(p.x) + r; x++) if (lvl.world.getState(x, y, z) === st) out.push([x, y, z]);
  return out;
}

// ---------------------------------------------------------------------------
// the host goes to the Nether: its guests go too, out of what they were doing, and wait with it

// (Alex at a crafting table with logs in its grid, holding dirt with a stick beside it; Steve in a boat; rain)
lvl.setBlock(2, 64, 0, m.S('crafting_table'));
give(ha, 0, S('dirt', 16));
give(ha, 1, S('stick'));
ha.inventory.selected = 0;
const table = new m.CraftingMenu(ha, [2, 64, 0]);
host.server.showMenu(ha, table);
table.craft.set(0, S('oak_log', 3));
const boat = new m.Boat(lvl);
boat.moveTo(-2.5, 64, -2.5, 0, 0);
lvl.addEntity(boat);
lvl.raining = true;
lvl.rainTime = 100000;
lvl.rain = lvl.rainO = 1;
step(host, 3);
hb.startRiding(boat, true);
step(host, 5);
check('(Alex at its crafting table, Steve in its boat, rain on them both)', a.session.menus.open?.menu instanceof m.CraftingMenu && b.player.vehicle === copyOf(b, boat) && a.level.rain === 1 && b.level.rain === 1);
// (the host looks down as it goes: where Alex will look as it arrives)
host.player.yaw = 0;
host.player.pitch = 45;
hostChangeDimension(host, 'the_nether', 0.5, 65, 0.5, 'nether_portal');
stepIdle(host, 1);
check('the host goes to the Nether: both guests are told, with the nether portal\'s swirl', a.dims.length === 1 && a.dims[0].join() === 'the_nether,nether_portal' && b.dims.length === 1 && b.dims[0].join() === 'the_nether,nether_portal', JSON.stringify(a.dims));
check('...their games let go of the Overworld: no chunks, the Nether\'s', a.world.chunks.size === 0 && a.world.dim.id === 'the_nether' && b.world.chunks.size === 0 && b.world.dim.id === 'the_nether');
check('...nothing of the old world shown any more: nobody, no entity', a.session.mirrors.size === 0 && a.session.entities.size === 0 && a.level.entities.length === 1 && a.level.entities[0] === a.player && b.level.entities.length === 1);
check('...Alex\'s crafting table closed, on the host and in its game', !sa.menus.isOpen && a.hidden.length === 1 && !a.session.menus.open);
check('...the logs in its grid back in its inventory', ha.inventory.main.some((s) => s?.item.id === 'oak_log' && s.count === 3) && !table.craft.get(0));
check('...Steve off its boat, which stays behind', !hb.vehicle && !b.player.vehicle && boat.passengers.length === 0 && !lvl.entities.includes(boat));
check('...their players out of the host\'s world till the host is there', !lvl.players().includes(ha) && !lvl.players().includes(hb) && sa.travelling && sb.travelling && host.server.travelling);

// on the loading screen: chat is heard, commands answered, the hotbar changes; what was for the old world is let go
{
  const was = [ha.x, ha.y, ha.z].join();
  a.session.chat('see you there');
  a.session.input(false, false, true, false, null);
  stepIdle(host, 2);
  a.session.input(false, false, false, false, null);
  check('waiting: a guest\'s chat is heard by everyone', b.chat.includes('<Alex> see you there') && host.chat.includes('<Alex> see you there'), b.chat.slice(-2).join(' | '));
  a.session.chat('/time set day');
  stepIdle(host, 2);
  check('waiting: a command is answered as ever', a.chat.at(-1) === '§cOnly the host can use commands.', a.chat.at(-1));
  a.player.inventory.selected = 4;
  stepIdle(host, 2);
  check('waiting: the hotbar slot changes on the host too', ha.inventory.selected === 4);
  a.player.inventory.selected = 0;
  a.player.moveTo(a.player.x + 3, a.player.y, a.player.z, 0, 0);
  stepIdle(host, 2);
  check('waiting: a move (the old world\'s) isn\'t taken', [ha.x, ha.y, ha.z].join() === was && ha.inventory.selected === 0);
  stepIdle(host, 700);
  check('waiting 35 seconds (as over the End Poem): nobody times out, either way', a.disconnected === null && b.disconnected === null && sa.state === 'play' && sb.state === 'play' && a.session.state === 'play', `${a.disconnected} ${b.disconnected}`);
}
// a guest joining meanwhile waits, and comes in in the Nether
const c = makeGuest(host, 'Cleo');
stepIdle(host, 5);
check('a guest joining meanwhile isn\'t let in yet', c.session.state === 'login' && c.world === null && host.server.guestCount() === 2);

// the host in the Nether (in the portal it came out of, as Game.portalTravel puts it, not to go back through it at once):
// its guests come in beside it
fill(-4, -4, 4, 4);
stepIdle(host, 2);
lvl.world.setState(0, 64, 0, m.S('nether_portal', { axis: 'x' }));
lvl.world.setState(0, 65, 0, m.S('nether_portal', { axis: 'x' }));
host.player.portalCooldown = host.player.dimensionChangingDelay();
host.server.hostArrived();
check('the host in the Nether: its guests aren\'t to go back through a portal at once either', ha.portalCooldown === ha.dimensionChangingDelay() && hb.portalCooldown === hb.dimensionChangingDelay());
step(host, 30);
const hc = hostCopy(host, c), sc = host.server.sessionOf(hc);
check('the host in the Nether: both guests come in beside it', near(ha, host.player.x, host.player.z) && near(hb, host.player.x, host.player.z) && lvl.players().includes(ha) && lvl.players().includes(hb), `${ha.x},${ha.z} ${host.player.x},${host.player.z}`);
check('...there in their own games too', near(a.player, host.player.x, host.player.z) && near(b.player, host.player.x, host.player.z));
check('...no longer on their way', !sa.travelling && !sb.travelling && !host.server.travelling);
check('...their games show the Nether as the host has it', a.world.chunks.size >= 25 && b.world.chunks.size >= 25 && mirrorDiff(host, a).length === 0 && mirrorDiff(host, b).length === 0, mirrorDiff(host, a).slice(0, 3).join('; '));
check('...they see each other and the host again', a.session.mirrors.has(hb.id) && a.session.mirrors.has(host.player.id) && b.session.mirrors.has(ha.id));
check('...no rain in the Nether', a.level.rain === 0 && b.level.rain === 0);
check('...Alex\'s inventory as the host has it, the logs in it', inventoryDiff(a, sa).length === 0 && a.player.inventory.main.some((s) => s?.item.id === 'oak_log'), inventoryDiff(a, sa).join('; '));
check('the use button pressed on the way did nothing here', blocksNear('dirt').length === 0 && ha.inventory.main[0]?.count === 16, JSON.stringify(blocksNear('dirt')));
a.session.input(false, false, true, false, null);
step(host, 1);
a.session.input(false, false, false, false, null);
step(host, 3);
check('(pressed now, looking where it looks, it places its dirt)', blocksNear('dirt').length === 1 && ha.inventory.main[0]?.count === 15, JSON.stringify(blocksNear('dirt')));
check('the guest that joined meanwhile is in, in the Nether, beside the host', hc !== null && c.world?.dim.id === 'the_nether' && near(hc, host.player.x, host.player.z) && near(c.player, host.player.x, host.player.z) && mirrorDiff(host, c).length === 0);
step(host, 100);
check('standing in the portal they came out of, nobody is taken back or told off', lvl.world.dim.id === 'the_nether' && ![a, b].some((g) => g.overlays.includes(REFUSED)) && hostTravels.length === 0 && ha.portal === null && near(ha, host.player.x, host.player.z));

// ---------------------------------------------------------------------------
// back to the Overworld: a guest leaving on the way is kept where it was; one clicking in its inventory as the host
// goes sees it undone

{
  const where = [hb.x, hb.y, hb.z];
  host.player.pitch = 0;
  hostChangeDimension(host, 'overworld', 8.5, 65, 8.5, 'nether_portal');
  // (Alex picks up its stick as the host goes, before it's heard)
  a.session.menus.inventory.clicked(37, 0, 'pickup');
  check('(Alex\'s game has its stick on the cursor)', a.session.menus.inventory.carried?.item.id === 'stick');
  stepIdle(host, 3);
  check('on the way: the click (for the world left) isn\'t taken', ha.inventory.main[1]?.item.id === 'stick' && !sa.menus.inventory.carried);
  b.session.leave();
  stepIdle(host, 3);
  check('a guest leaving on the way is gone, and everyone told', host.server.guestCount() === 2 && !host.server.sessionOf(hb) && a.chat.includes('§eSteve left the game') && host.chat.includes('§eSteve left the game'));
  const d = saved.get(uuidOf(b));
  check('...kept where it was, in the dimension it left', d?.dimension === 'the_nether' && d.x === where[0] && d.y === where[1] && d.z === where[2], d && `${d.dimension} ${d.x},${d.y},${d.z}`);
  host.server.saveAll();
  check('the world saved meanwhile: the guests on their way kept in the dimension they left', saved.get(uuidOf(a))?.dimension === 'the_nether' && saved.get(uuidOf(c))?.dimension === 'the_nether');
  fill(-4, -4, 4, 4);
  host.server.hostArrived();
  step(host, 30);
  check('back in the Overworld: Alex and Cleo beside the host, Steve not', near(ha, 8.5, 8.5) && near(hc, 8.5, 8.5) && !lvl.players().includes(hb) && lvl.players().length === 3);
  check('...their games show it as the host has it', a.world.dim.id === 'overworld' && mirrorDiff(host, a).length === 0 && mirrorDiff(host, c).length === 0);
  check('...the rain there again', a.level.rain === 1 && c.level.rain === 1);
  check('what Alex clicked on the way shows undone: its stick back in its slot, nothing on its cursor', inventoryDiff(a, sa).length === 0 && a.player.inventory.main[1]?.item.id === 'stick' && !a.session.menus.inventory.carried, inventoryDiff(a, sa).join('; '));
}

// ---------------------------------------------------------------------------
// to the End: a guest asleep is woken as it goes; an end gateway takes a guest, which carries on from its exit; a
// guest's own end portal isn't its to take; dead there, a guest respawns by the host, its bed kept

{
  lvl.dayTime = 14000;
  lvl.setBlock(12, 64, 8, m.S('red_bed', { part: 'foot', facing: 'south' }));
  lvl.setBlock(12, 64, 9, m.S('red_bed', { part: 'head', facing: 'south' }));
  hc.startSleeping(12, 64, 9);
  step(host, 3);
  check('(Cleo asleep in its bed, in its game too)', hc.isSleeping() && c.player.isSleeping());
  let bed = 0;
  hostChangeDimension(host, 'the_end', 100.5, 65, 0.5, 'end_portal', () => (bed = lvl.world.getState(12, 64, 9)));
  check('the host off to the End: Cleo woken as it goes, its bed free', !hc.isSleeping() && m.BLOCKS[m.STATE_BLOCK[bed]].get(bed, 'occupied') === false);
  stepIdle(host, 2);
  check('...its guests told, with the end portal\'s stars; Cleo up in its game too', a.dims.at(-1).join() === 'the_end,end_portal' && c.dims.at(-1).join() === 'the_end,end_portal' && !c.player.isSleeping());
  fill(2, -4, 10, 4);
  host.server.hostArrived();
  step(host, 30);
  check('in the End: the guests beside the host, shown the End as the host has it', near(ha, 100.5, 0.5) && near(hc, 100.5, 0.5) && a.world.dim.id === 'the_end' && mirrorDiff(host, a).length === 0 && mirrorDiff(host, c).length === 0);
  lvl.setBlock(104, 64, 0, m.S('end_gateway'));
  const gw = lvl.world.getBlockEntity(104, 64, 0);
  gw.exitPortal = [120, 64, 0];
  gw.exactTeleport = true;
  step(host, 2);
  walkTo(a, 104.5, 0.5);
  check('an end gateway takes a guest as it would anything: out at its exit, on the host and in its game', near(ha, 120.5, 0.5) && near(a.player, 120.5, 0.5), `${ha.x},${ha.z} / ${a.player.x},${a.player.z}`);
  step(host, 20);
  check('...and it carries on from there: its move from inside the gateway didn\'t put it back', near(ha, 120.5, 0.5) && near(a.player, 120.5, 0.5) && ha.health === 20, `${ha.x},${ha.z}`);
  lvl.setBlock(104, 64, 0, 0);
  lvl.setBlock(96, 64, 0, m.S('end_portal'));
  step(host, 25);
  walkTo(a, 96.5, 0.5);
  step(host, 3);
  check('a guest\'s own end portal isn\'t its to take: it stays, told why', lvl.world.dim.id === 'the_end' && near(ha, 96.5, 0.5) && sa.state === 'play' && a.overlays.at(-1) === REFUSED, a.overlays.at(-1));
  check('...and isn\'t told so again while it stands there', a.overlays.filter((t) => t === REFUSED).length === 1 && (step(host, 40), a.overlays.filter((t) => t === REFUSED).length === 1));
  lvl.setBlock(96, 64, 0, 0);
  walkTo(a, 100.5, 3.5);
  // dead in the End
  ha.respawnPos = [-6, 64, -6];
  ha.respawnForced = false;
  ha.hurt(100, 'genericKill');
  step(host, 3);
  a.chat.length = 0;
  a.session.respawn();
  step(host, 4);
  check('dead in the End, a guest respawns by the host', ha.health === 20 && near(ha, host.player.x, host.player.z) && near(a.player, host.player.x, host.player.z));
  check('...its bed kept for when they\'re home, and not told it\'s gone', ha.respawnPos?.join() === '-6,64,-6' && !a.chat.some((t) => t.startsWith('You have no home bed')), a.chat.join(' | '));
}

// ---------------------------------------------------------------------------
// home from the End: a guest dead as the host goes comes along dead, and respawns there; a guest respawning at a bed
// whose chunks aren't in waits for them, and without them respawns by the world spawn, its bed kept

{
  hc.hurt(100, 'genericKill');
  step(host, 3);
  check('(Cleo dead)', hc.health === 0 && c.player.health === 0);
  hostChangeDimension(host, 'overworld', 0.5, 65, 0.5, 'end_portal');
  stepIdle(host, 3);
  fill(-4, -4, 4, 4);
  host.server.hostArrived();
  step(host, 20);
  check('a guest dead as the host goes comes along dead', hc.health === 0 && c.player.health === 0 && near(hc, 0.5, 0.5) && c.world.dim.id === 'overworld' && mirrorDiff(host, c).length === 0);
  c.session.respawn();
  step(host, 4);
  check('...and respawns in the Overworld, by the world spawn', hc.health === 20 && c.player.health === 20 && near(hc, 0.5, 0.5));

  // (Alex's bed far off, its chunks slow to come: the respawn's ticket for them held back till `loadBed`)
  const BX = 200, BZ = 200;
  const asked = [], let_go = [];
  let holdBed = true;
  const setTicket = host.server.hooks.setTicket;
  host.server.hooks.setTicket = (name, t) => {
    if (name.startsWith('respawn:')) {
      (t ? asked : let_go).push(name);
      if (t && holdBed) return;
    }
    setTicket(name, t);
  };
  const putBed = () => {
    lvl.world.setState(BX, 64, BZ, m.S('red_bed', { part: 'foot', facing: 'south' }));
    lvl.world.setState(BX, 64, BZ + 1, m.S('red_bed', { part: 'head', facing: 'south' }));
  };
  const bedChunks = (f) => {
    for (let cz = (BZ >> 4) - 1; cz <= (BZ >> 4) + 1; cz++) for (let cx = (BX >> 4) - 1; cx <= (BX >> 4) + 1; cx++) f(cx, cz);
  };
  const loadBed = () => {
    bedChunks((cx, cz) => lvl.world.getChunk(cx, cz) || host.makeChunk(cx, cz));
    putBed();
  };
  ha.respawnPos = [BX, 64, BZ + 1];
  ha.respawnForced = false;
  ha.hurt(100, 'genericKill');
  step(host, 3);
  const r0 = a.respawned;
  a.session.respawn();
  step(host, 20);
  check('respawning at a far bed: its chunks asked for, it waits for them, dead', asked.length === 1 && asked[0] === `respawn:${ha.id}` && ha.health === 0 && a.respawned === r0 && !lvl.world.getChunk(BX >> 4, BZ >> 4));
  loadBed();
  step(host, 3);
  check('...once they\'re in, it\'s up beside its bed, here and in its game', ha.health === 20 && Math.hypot(ha.x - (BX + 0.5), ha.z - (BZ + 1.5)) < 2.5 && near(a.player, ha.x, ha.z) && a.respawned === r0 + 1, `${ha.x},${ha.z}`);
  check('...its bed still its own, and the chunks let go of', ha.respawnPos?.join() === `${BX},64,${BZ + 1}` && let_go.includes(`respawn:${ha.id}`));
  // (they go again; and this time they don't come)
  walkTo(a, 0.5, 3.5);
  bedChunks((cx, cz) => lvl.world.removeChunk(cx, cz));
  ha.hurt(100, 'genericKill');
  step(host, 3);
  a.chat.length = 0;
  a.session.respawn();
  step(host, m.RESPAWN_BED_WAIT_TICKS - 10);
  check('its bed\'s chunks not coming, it waits nearly five seconds', ha.health === 0 && asked.length === 2);
  step(host, 15);
  check('...then respawns by the world spawn', ha.health === 20 && near(ha, 0.5, 0.5) && near(a.player, 0.5, 0.5));
  check('...its bed kept (it couldn\'t be looked at), and not told it\'s gone', ha.respawnPos?.join() === `${BX},64,${BZ + 1}` && !a.chat.some((t) => t.startsWith('You have no home bed')) && let_go.filter((n) => n === `respawn:${ha.id}`).length === 2);
  host.server.hooks.setTicket = setTicket;
}

// ---------------------------------------------------------------------------
// the portals themselves (Game.portalEntered): a guest's nether portal is refused, the host's own still taken

{
  const before = hostTravels.length, told = a.overlays.length;
  G.portalEntered.call(game, ha, 0, 64, 0, 'nether');
  step(host, 2);
  check('a guest\'s nether portal: it isn\'t taken, the guest told why', hostTravels.length === before && a.overlays.length === told + 1 && a.overlays.at(-1) === REFUSED && lvl.world.dim.id === 'overworld');
  check('...not to be tried again at once', ha.portalCooldown > 0);
  G.portalEntered.call(game, host.player, 0, 64, 0, 'nether');
  check('the host\'s own nether portal still takes it (and so everyone)', hostTravels.length === before + 1);
  G.portalEntered.call({ ...game, mode: 'client' }, ha, 0, 64, 0, 'nether');
  check('(a guest\'s own game takes no portal: the host decides)', hostTravels.length === before + 1);
}

await exitWithStatus(close);
