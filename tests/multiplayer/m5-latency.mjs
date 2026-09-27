// Multiplayer stage 5: a network that's slow, uneven, or loses the thread. A guest's moves that reach the host
// together are each taken, as vanilla takes each move packet: a hop's landing between two moves still lands, and
// hopping about costs no hearts. A guest's loading screen waits only for the chunks the host sends it (at view distance
// 2 not the corners of the 5 by 5, which never come), and one left waiting (chunks that didn't come; the host there,
// the guest never put in) asks the host for the world again, which sends it, both saying in the console what they had.
// And the host and two guests over the relay with 20 to 200 ms of lag each way, as over a slow Wi-Fi: coming in,
// walking, building, a chest, a zombie's blow, keeping alive for over a minute, following the host to the Nether and
// back, and the host closing the world, each waited for as a player would. (It makes its own networks: MP_NET and
// MP_LAG leave it be.)

import { loadNet, ownNetworks, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, stepIdle, hostChangeDimension, check, exitWithStatus } from './lib.mjs';
import { WsNetwork, closeWsNetworks } from './net/wsNetwork.mjs';

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/combat.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts', '/src/world/chunkManager.ts',
  '/src/game/openMenu.ts', '/src/net/menus.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts', '/src/inventory/container.ts', '/src/inventory/menus.ts',
]);
ownNetworks(m);

// (what the host and the guests say in the console: this suite's to read)
const said = [];
const warn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('multiplayer:')) said.push(args);
  else warn(...args);
};
const saying = (re) => said.filter((a) => re.test(a[0]));

const sessionOf = (host, g) => host.server.sessionOf(hostCopy(host, g));
/** the packets of kind `id` that `g` is sent from now on, counted */
function counting(g, id) {
  const n = { count: 0 };
  const handle = g.session.handle.bind(g.session);
  g.session.handle = (p) => {
    if (p[0] === id) n.count++;
    return handle(p);
  };
  return n;
}

// ---------------------------------------------------------------------------
// a guest's moves two at a time (its game's ticks and the host's out of step, or a network holding one back and
// letting it through with the next): each is taken in turn
{
  const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
  host.level.difficulty = 'normal';
  const a = makeGuest(host, 'Alex', { viewDistance: 4 });
  step(host, 40);
  const ha = hostCopy(host, a);
  /** the host's tick, Alex's game ticking `k` times meanwhile (its moves reaching the host together), `each` after each */
  const tickWith = (k, each = () => {}) => {
    host.server.receive();
    host.level.tick();
    host.server.tick();
    host.net.deliver();
    for (let i = 0; i < k; i++) {
      a.session.tick();
      each();
    }
    host.net.deliver();
  };
  // hopping for ten seconds: a hop takes twelve ticks, landing on the last; one tick first, so that each landing comes
  // first of a pair, with the next hop's first move after it
  let hops = 0, wasOnGround = a.player.onGround, most = 0;
  const hop = () => {
    if (wasOnGround && !a.player.onGround && a.player.dy > 0) hops++;
    wasOnGround = a.player.onGround;
  };
  const ex0 = ha.food.exhaustion;
  a.player.input.jump = true;
  tickWith(1, hop);
  for (let i = 0; i < 100; i++) {
    tickWith(2, hop);
    most = Math.max(most, ha.fallDistance);
  }
  a.player.input.jump = false;
  step(host, 20);
  check('moves two at a time: hopping for ten seconds costs no hearts (each landing lands, on the host too)', ha.health === 20 && a.player.health === 20 && most < 1.5 && hops >= 15, `health ${ha.health}, the host's fall ${most.toFixed(2)} at most, ${hops} hops`);
  check('...and each hop its hunger, as the host\'s own do', Math.abs(ha.food.exhaustion - ex0 - hops * 0.05) < 1e-9, `${(ha.food.exhaustion - ex0).toFixed(3)} for ${hops} hops`);

  // a fall of ten blocks, its moves two at a time: the landing hurts, once
  const s = sessionOf(host, a);
  s.teleport(ha.x, 74, ha.z, ha.yaw, 0);
  step(host, 3);
  let landed = false;
  for (let i = 0; i < 40 && !landed; i++) {
    tickWith(2);
    landed = a.player.onGround && ha.onGround;
  }
  step(host, 2);
  check('moves two at a time: a fall of ten blocks hurts for seven, once', landed && ha.health === 13 && a.player.health === 13 && ha.lastDamageSource === 'fall', `${ha.health} ${ha.lastDamageSource}`);
  ha.health = 20;
  step(host, 2);

  // a second's moves and more at once (a network that stalled): all of them walked, the last where it ends up
  const teleports = counting(a, m.CB.PlayerPosition);
  a.player.input.forward = true;
  tickWith(m.MOVES_KEPT_PER_TICK + 10);
  a.player.input.forward = false;
  // (till it's stopped, and the host has its last move)
  step(host, 20);
  check(`moves: ${m.MOVES_KEPT_PER_TICK + 10} at once (a stalled network's): the host has the guest where it ended up, and doesn't put it back`, Math.abs(ha.x - a.player.x) < 1e-9 && Math.abs(ha.z - a.player.z) < 1e-9 && teleports.count === 0, `${ha.z} / ${a.player.z}, ${teleports.count} put back`);
  host.server.close('bye');
}

// ---------------------------------------------------------------------------
// the loading screen waits only for the chunks the host sends
{
  check('view distance 2: of the 5 by 5 a loading screen waits for, the host sends all but the corners', m.loadingChunks(8, 8, 2).length === 21 && !m.inView(2, 2, 2) && !m.inView(-2, 2, 2) && m.inView(2, 1, 2) && m.inView(0, 0, 2));
  check('...from view distance 3 on, all 25', [3, 4, 8, 32].every((r) => m.loadingChunks(8, 8, r).length === 25));
  const host = flatHost(m, 6);
  const g = makeGuest(host, 'Near', { viewDistance: 2 });
  step(host, 5);
  check('view distance 2: the guest comes in (all it waits for has come)', g.session.state === 'play' && !g.session.stillLoading && g.world.chunks.size === 21, `${g.session.state} ${g.session.stillLoading} ${g.world.chunks.size}`);
  // (Game.tick's check, with a guest's chunks as the host sends them at 2: the corners never come)
  const world = new m.World();
  for (const [cx, cz] of m.loadingChunks(8, 8, 2)) {
    const blocks = new Uint16Array(m.COLUMN_VOLUME);
    world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks, true), biomes: new Uint8Array(256), pending: [] });
  }
  for (const c of world.chunks.values()) c.dirty = 0;
  const cm = new m.ChunkManager(world, {}, null);
  check('...its game leaves the loading screen: ready, counting what the host sends (it wasn\'t, counting the corners)', cm.isReady(8, 8, 2, (dx, dz) => m.inView(dx, dz, 2)) && !cm.isReady(8, 8, 2));
  check('...and nothing asked again', !saying(/still on the loading screen|asks for the world again/).length);
  host.server.close('bye');
}

// ---------------------------------------------------------------------------
// a guest left on its loading screen asks for the world again
{
  const host = flatHost(m, 6);
  const a = makeGuest(host, 'Alex', { viewDistance: 3 });
  const b = makeGuest(host, 'Steve', { viewDistance: 3 });
  step(host, 40);
  // (their sessions on the host: a guest on its way isn't in the host's level to be found by)
  const sa = sessionOf(host, a), sb = sessionOf(host, b);
  // (what the host sends Alex of chunks, lost on the way while `lose` says so: a message that never came)
  const t = host.net.host, send = t.send.bind(t), peer = sa.peer;
  let lose = false;
  t.send = (p, data) => {
    if (p === peer && lose) {
      const msg = m.decode(data, m.MAX_HOST_MESSAGE), kept = msg.filter((pk) => pk[0] !== m.CB.LevelChunk);
      if (kept.length !== msg.length) {
        if (!kept.length) return;
        data = m.encode(kept);
      }
    }
    send(p, data);
  };
  hostChangeDimension(host, 'the_nether', 0.5, 65, 0.5, 'nether_portal');
  stepIdle(host, 5);
  lose = true;
  host.server.hostArrived();
  step(host, 20);
  lose = false;
  check('(Alex\'s first Nether chunks lost on the way; Steve in)', a.session.stillLoading && a.world.chunks.size === 0 && !b.session.stillLoading && b.world.dim.id === 'the_nether', `${a.world.chunks.size}`);
  // (the host put it in place at its arrival: five seconds from then)
  step(host, m.RESYNC_AFTER_TICKS - 25);
  check('stuck: nothing asked before five seconds', !saying(/still on the loading screen/).length);
  step(host, 6);
  const asked = saying(/still on the loading screen/), heard = saying(/Alex is still on its loading screen/);
  check('stuck: five seconds after the host put it in place, the guest asks for the world again', asked.length === 1, `${asked.length}`);
  const r = asked[0]?.[1] ?? {};
  check('...saying in the console what it has and hasn\'t, and what came lately', r.dimension === 'the_nether' && r.missing?.length === 25 && r.chunksInWorld === 0 && r.placedTicksAgo >= m.RESYNC_AFTER_TICKS && /ChangeDimension@-\d+ .*PlayerPosition@-\d+/.test(r.lately ?? ''), JSON.stringify(r).slice(0, 300));
  check('...(the host hears it at its next tick)', !heard.length);
  step(host, 10);
  const h = saying(/Alex is still on its loading screen/)[0]?.[1] ?? {};
  check('...and says what it had: the chunks sent, as it thought', saying(/Alex is still on its loading screen/).length === 1 && h.guestSays?.missing?.length === 25 && h.guestSays.missing.every((s) => / sent, loaded here$/.test(s)) && h.guest?.travelling === false && h.host?.dimension === 'the_nether', JSON.stringify(h).slice(0, 300));
  check('...and sends them again, and the rest in view that went missing with them: the guest comes in', !a.session.stillLoading && a.world.chunks.size === 37 && a.session.state === 'play', `${a.world.chunks.size}`);
  check('...where the host has it', Math.hypot(hostCopy(host, a).x - a.player.x, hostCopy(host, a).z - a.player.z) < 1e-9);
  step(host, m.RESYNC_EVERY_TICKS + 20);
  check('...and asks nothing more (Steve never did)', saying(/still on the loading screen/).length === 1 && !saying(/Steve/).length);

  // the host there and a guest never put in (a guest left on its way, as a bug might): the host puts it in at its next tick
  said.length = 0;
  sb.leaveDimension('the_nether', 'other');
  step(host, 1);
  check('left on its way: the host puts the guest in at its next tick, saying so', saying(/Steve was still on its way to the_nether though the host is here: put in now/).length === 1 && !sb.travelling);
  step(host, 10);
  check('...and it comes in', !b.session.stillLoading && b.world.chunks.size > 0);

  // the host still on its own loading screen for twenty seconds: its guests ask after fifteen, and are told nothing
  // (the host puts them in when it's there, as ever)
  said.length = 0;
  hostChangeDimension(host, 'overworld', 8.5, 65, 8.5, 'nether_portal');
  stepIdle(host, 20 * 20);
  const early = saying(/still on the loading screen after/);
  check('host still loading: after fifteen seconds its guests ask whether it forgot them, once each so far', early.length === 2 && early.every((x) => x[1].placedTicksAgo === null), `${early.length}`);
  check('...the host says it isn\'t there itself yet, and does nothing else', saying(/is still on its loading screen/).length === 2 && saying(/is still on its loading screen/).every((x) => x[1].host.onItsWay === true && x[1].guest.travelling === true) && sa.travelling && sb.travelling);
  host.server.hostArrived();
  step(host, 10);
  check('...then it is, and they come in', !a.session.stillLoading && !b.session.stillLoading && a.world.dim.id === 'overworld');

  // a guest that asks too often is heard once in four seconds; one that asks in the wrong shape is let go
  said.length = 0;
  const raw = rawGuest(host);
  step(host, 1);
  raw.hello('Asker');
  step(host, 5);
  const put = raw.packets(m.CB.PlayerPosition).length;
  raw.send(Array.from({ length: 10 }, () => [m.SB.Resync, [0, 0], 100, true]));
  step(host, 3);
  check('resync: ten at once are one (a teleport, a word in the console)', raw.packets(m.CB.PlayerPosition).length === put + 1 && saying(/Asker is still/).length === 1 && !raw.gone);
  step(host, m.RESYNC_MIN_TICKS);
  raw.send([[m.SB.Resync, [], 200, true]]);
  step(host, 3);
  check('...four seconds on, another is heard', raw.packets(m.CB.PlayerPosition).length === put + 2 && saying(/Asker is still/).length === 2);
  for (const [label, pk, want] of [
    ['an odd count of numbers for chunks', [m.SB.Resync, [0, 0, 1], 100, true], /bad field 0/],
    ['more than 25 chunks', [m.SB.Resync, new Array(52).fill(0), 100, true], /bad field 0/],
    ['a chunk past the world\'s edge', [m.SB.Resync, [0, 1e8], 100, true], /bad field 0/],
    ['a chunk that isn\'t a number', [m.SB.Resync, ['a', 'b'], 100, true], /bad field 0/],
    ['a wait of less than nothing', [m.SB.Resync, [], -1, true], /bad field 1/],
    ['"placed" that isn\'t yes or no', [m.SB.Resync, [], 1, 1], /bad field 2/],
  ]) {
    const r2 = rawGuest(host);
    step(host, 1);
    r2.hello('Shape');
    step(host, 5);
    r2.send([pk]);
    step(host, 3);
    check(`resync in the wrong shape (${label}): let go, saying why`, want.test(r2.reason() ?? ''), r2.reason());
  }
  host.server.close('bye');
}

// ---------------------------------------------------------------------------
// over the relay, 20 to 200 ms each way (a slow Wi-Fi's), each thing waited for as a player would
{
  const Memory = m.MemoryNetwork;
  m.MemoryNetwork = class extends WsNetwork {
    constructor() {
      super(m, { min: 20, max: 200 });
    }
  };
  const host = flatHost(m, 8, { guestGameMode: 'survival', gameMode: 'survival' });
  m.MemoryNetwork = Memory;
  const lvl = host.level;
  lvl.difficulty = 'normal';
  m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
  m.installMenuHooks();
  /** ticks, one at a time, till `cond` holds (at most `most`): how many it took, or -1 */
  const until = (cond, most = 100) => {
    for (let i = 0; i <= most; i++) {
      if (cond()) return i;
      step(host, 1);
    }
    return -1;
  };
  said.length = 0;
  const a = makeGuest(host, 'Alex', { viewDistance: 4 });
  const b = makeGuest(host, 'Steve', { viewDistance: 4 });
  const inAt = until(() => [a, b].every((g) => g.session.state === 'play' && !g.session.stillLoading));
  check('lag: both guests come in', inAt >= 0, `${inAt} ticks`);
  const ha = hostCopy(host, a), hb = hostCopy(host, b);
  step(host, 10);

  // walking: the host's copy follows, never put back
  const teleports = counting(a, m.CB.PlayerPosition);
  a.player.yaw = 0;
  a.player.input.forward = true;
  step(host, 40);
  a.player.input.forward = false;
  const walked = until(() => Math.abs(ha.x - a.player.x) < 1e-9 && Math.abs(ha.z - a.player.z) < 1e-9 && a.player.onGround);
  check('lag: walking two seconds, the host\'s copy follows the guest where it went', walked >= 0 && a.player.z > 5, `${walked} ticks, z ${a.player.z.toFixed(2)} / host ${ha.z.toFixed(2)}`);
  check('...never put back ("moved too quickly")', teleports.count === 0, `${teleports.count}`);
  check('...and the other guest sees it there', until(() => { const mb = b.session.mirrors.get(ha.id); return mb && Math.hypot(mb.x - ha.x, mb.z - ha.z) < 0.01; }) >= 0);

  // building: a block placed where it looks
  const fx = Math.floor(a.player.x), fz = Math.floor(a.player.z) + 2;
  ha.inventory.main[0] = m.ItemStack.of('oak_planks', 16);
  ha.inventory.selected = 0;
  ha.inventory.version++;
  a.player.inventory.selected = 0;
  until(() => a.player.inventory.main[0]?.item.id === 'oak_planks');
  const eye = a.player.y + a.player.eyeHeight;
  a.player.pitch = (-Math.atan2(64 - eye, fz + 0.5 - a.player.z) * 180) / Math.PI;
  a.player.yaw = 0;
  step(host, 2);
  a.session.input(false, false, true, false);
  step(host, 1);
  const built = until(() => lvl.world.getState(fx, 64, fz) === m.S('oak_planks') && b.world.getState(fx, 64, fz) === m.S('oak_planks') && a.world.getState(fx, 64, fz) === m.S('oak_planks'));
  check('lag: a block placed by a guest is there for everyone', built >= 0, `${built}`);
  check('...taken from its hand, here and there', until(() => ha.inventory.main[0]?.count === 15 && a.player.inventory.main[0]?.count === 15) >= 0);

  // a chest, with what's in it as the host has it
  lvl.setBlock(fx + 1, 64, fz, m.S('chest'));
  const chest = lvl.world.getBlockEntity(fx + 1, 64, fz);
  chest.container.set(4, m.ItemStack.of('diamond', 7));
  a.player.yaw = (Math.atan2(-(fx + 1.5 - a.player.x), fz + 0.5 - a.player.z) * 180) / Math.PI;
  a.player.pitch = (-Math.atan2(64.5 - eye, Math.hypot(fx + 1.5 - a.player.x, fz + 0.5 - a.player.z)) * 180) / Math.PI;
  until(() => a.world.getState(fx + 1, 64, fz) === m.S('chest'));
  step(host, 2);
  a.session.input(false, false, true, false);
  step(host, 1);
  const opened = until(() => a.session.menus.open?.menu instanceof m.ChestMenu);
  const menu = a.session.menus.open?.menu;
  check('lag: a chest used by a guest opens, with what the host has in it', opened >= 0 && menu?.slots[4].item?.item.id === 'diamond' && menu.slots[4].item.count === 7, `${opened}`);
  menu?.clicked(4, 0, 'quick_move');
  const took = until(() => ha.inventory.main.some((s) => s?.item.id === 'diamond' && s.count === 7) && !chest.container.get(4));
  check('...its diamonds taken into its inventory, on the host', took >= 0 && a.player.inventory.main.some((s) => s?.item.id === 'diamond' && s.count === 7));
  menu?.removed();
  step(host, 5);

  // a zombie's blow
  const z = m.createMob('zombie', lvl);
  z.moveTo(ha.x - 1.5, 64, ha.z, 0, 0);
  z.serverAiStep = () => {};
  lvl.addEntity(z);
  step(host, 2);
  ha.hurt(5, 'mob', z);
  const hurt = until(() => a.player.health === ha.health && ha.health === 15);
  check('lag: hurt by a zombie, the guest\'s hearts say so', hurt >= 0, `${a.player.health} / ${ha.health}`);
  z.remove();
  ha.health = 20;

  // keeping alive: over a minute with nothing said but the ticks' own
  said.length = 0;
  step(host, 75 * 20);
  check('lag: a minute and a quarter on, nobody timed out', [a, b].every((g) => g.session.state === 'play' && g.disconnected === null) && host.server.guestCount() === 2);

  // following the host to the Nether and back
  hostChangeDimension(host, 'the_nether', 0.5, 65, 0.5, 'nether_portal');
  stepIdle(host, 10);
  host.server.hostArrived();
  const there = until(() => [a, b].every((g) => g.world.dim.id === 'the_nether' && !g.session.stillLoading), 200);
  check('lag: both guests follow the host to the Nether, and come in there', there >= 0, `${there} ticks`);
  check('...beside the host', until(() => [ha, hb].every((h, i) => Math.hypot(h.x - host.player.x, h.z - host.player.z) < 1e-9 && Math.hypot([a, b][i].player.x - h.x, [a, b][i].player.z - h.z) < 1e-9)) >= 0);
  hostChangeDimension(host, 'overworld', 0.5, 65, 0.5, 'nether_portal');
  stepIdle(host, 10);
  host.server.hostArrived();
  check('lag: and back', until(() => [a, b].every((g) => g.world.dim.id === 'overworld' && !g.session.stillLoading), 200) >= 0);
  check('...with nothing asked again on the way (none of the loading screens stuck)', !saying(/still on the loading screen|asks for the world again|still on its way/).length, said.map((x) => x[0]).join(' | '));

  // the host closes the world
  host.server.close('The host closed the world.');
  check('lag: the host closes the world: its guests are told so', until(() => [a, b].every((g) => g.disconnected === 'The host closed the world.')) >= 0, `${a.disconnected} / ${b.disconnected}`);
}

console.warn = warn;
await closeWsNetworks();
await exitWithStatus(close);
