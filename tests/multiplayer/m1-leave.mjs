// Multiplayer M1: leaving, and being left. A guest that quits (vanilla ServerboundDisconnect) or whose window closes is
// let go at once: "left the game", its player out of the host's level, its chunks no longer kept loaded; one that goes
// quiet without a word (a window that died) is let go after 30 seconds (vanilla's keepalive: one every 15 seconds, "Timed
// out" after 30 without hearing anything). When the host closes the world, every guest is told why; when the host goes
// quiet or goes away, the guest sees the connection lost. And a guest's game never touches the save store: its copy of
// the host's world is a passing one.

import { loadNet, flatHost, makeGuest, hostCopy, step, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(['/src/game/game.ts']);

// (anything reaching for the browser's storage is written down: nothing may, on the host or the guests, in here)
const touched = [];
for (const k of ['indexedDB', 'localStorage', 'sessionStorage'])
  Object.defineProperty(globalThis, k, {
    configurable: true,
    get() {
      touched.push(k);
      return undefined;
    },
  });

/** what `g` is sent of packet `id` from now on, counted */
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
// a guest leaves
{
  const host = flatHost(m, 4);
  const a = makeGuest(host, 'Alex'), b = makeGuest(host, 'Steve');
  step(host, 20);
  const ha = hostCopy(host, a);
  check('leave: (both in, each seeing the other)', ha && host.server.guestCount() === 2 && b.session.mirrors.has(ha.id));
  // a guest places a block, then quits (Disconnect, from the pause menu)
  a.player.flying = true;
  a.player.moveTo(3.5, 67, 3.5, 0, 90);
  a.player.inventory.main[0] = new m.ItemStack(m.getItem('gold_block'), 64);
  a.player.inventory.version++;
  step(host, 2);
  a.session.input(false, false, true, false);
  step(host, 3);
  check('leave: (what it built is there)', host.world.getState(3, 64, 3) === m.S('gold_block'));
  a.session.leave();
  step(host, 2);
  check('leave: the host drops it: "left the game", on the host and for the others', host.chat.includes('§eAlex left the game') && b.chat.includes('§eAlex left the game'));
  check('leave: its player is out of the host\'s level', hostCopy(host, a) === null && ha.removed && !host.level.players().includes(ha));
  check('leave: its chunks aren\'t kept loaded for it any more', !host.tickets.has(`player:${ha.id}`));
  check('leave: the others don\'t see it any more (vanilla ClientboundRemoveEntitiesPacket)', !b.session.mirrors.has(ha.id) && !b.level.players().some((p) => p.profileName === 'Alex'));
  check('leave: what it built stays', host.world.getState(3, 64, 3) === m.S('gold_block') && b.world.getState(3, 64, 3) === m.S('gold_block'));
  check('leave: the guest\'s side is closed, by its own choice (no "connection lost")', a.session.state === 'closed' && a.disconnected === null && a.session.endReason === 'Left');
  check('leave: one guest left', host.server.guestCount() === 1);
  host.guests.splice(host.guests.indexOf(a), 1);
  // the name is free again
  const a2 = makeGuest(host, 'Alex');
  step(host, 3);
  check('leave: the same name can join again', a2.session.state === 'play' && host.server.guestCount() === 2);
  assertMirrorEquals(host, a2, 'back again');

  // its window closes (the transport ends, no Disconnect: a tab closed before it could say so)
  const hb = hostCopy(host, b);
  b.transport.close();
  step(host, 2);
  check('closed window: the host drops it at once: "left the game"', host.chat.includes('§eSteve left the game') && hostCopy(host, b) === null && hb.removed && !host.tickets.has(`player:${hb.id}`));
  check('closed window: the one left doesn\'t see it', !a2.session.mirrors.has(hb.id));
  host.guests.splice(host.guests.indexOf(b), 1);
}

// ---------------------------------------------------------------------------
// a guest goes quiet without a word: kept alive while it answers, let go after 30 seconds when it doesn't
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex'), quiet = makeGuest(host, 'Quiet');
  step(host, 5);
  const keepAlives = counting(a, m.CB.KeepAlive);
  const hq = hostCopy(host, quiet);
  quiet.transport.vanish();
  host.guests.splice(host.guests.indexOf(quiet), 1);
  step(host, m.TIMEOUT_TICKS - 10);
  check('keepalive: a guest heard from is kept (vanilla: a keepalive every 15 seconds)', keepAlives.count === Math.floor((m.TIMEOUT_TICKS - 5) / m.KEEPALIVE_TICKS), `${keepAlives.count}`);
  check('timeout: a quiet guest is still in after 29.5 seconds', hostCopy(host, quiet) === hq && !hq.removed);
  step(host, 15);
  check('timeout: and let go at 30: "left the game"', hq.removed && hostCopy(host, quiet) === null && host.chat.includes('§eQuiet left the game'));
  check('timeout: the one answering stays', a.session.state === 'play' && host.server.guestCount() === 1 && !a.session.mirrors.has(hq.id));
}

// ---------------------------------------------------------------------------
// the host closes the world (Save and Quit, or a portal: stage 1's guests can't follow)
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex'), b = makeGuest(host, 'Steve');
  step(host, 5);
  host.server.close('The host closed the world.');
  step(host, 2);
  check('host quits: every guest is told why (vanilla ClientboundDisconnectPacket)', a.disconnected === 'The host closed the world.' && b.disconnected === 'The host closed the world.', `${a.disconnected} / ${b.disconnected}`);
  check('host quits: their sides are closed', a.session.state === 'closed' && b.session.state === 'closed');
  check('host quits: their players are out of the host\'s level, and nothing kept loaded for them', host.level.players().length === 1 && host.tickets.size === 0, `${host.level.players().length} ${[...host.tickets.keys()]}`);
  check('host quits: the host\'s chat says each left (vanilla onDisconnect, at a shutdown too)', host.chat.filter((t) => /^§e(Alex|Steve) left the game$/.test(t)).length === 2);
  step(host, 5);
  check('host quits: nothing more happens on either side', host.server.closed && host.server.guestCount() === 0);
}
{
  // the host's window closes without a word to say: the guest hears the connection end
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 5);
  host.net.host.close();
  step(host, 2);
  check('host gone: the guest sees "Connection lost"', a.disconnected === 'Connection lost', a.disconnected);
}
{
  // the host goes quiet (its window died, the browser hid it for good): the guest gives up after 30 seconds
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 5);
  host.net.host.vanish();
  for (let i = 0; i < m.TIMEOUT_TICKS - 10; i++) a.session.tick();
  check('host quiet: the guest waits 30 seconds', a.session.state === 'play' && a.disconnected === null);
  for (let i = 0; i < 15; i++) a.session.tick();
  check('host quiet: then "Timed out"', a.disconnected === 'Timed out', a.disconnected);
}

// ---------------------------------------------------------------------------
// a guest's game never saves: its world is a passing copy (Game.joinWorld), which Game's save leaves alone
{
  check('saves: nothing on either side reached for the browser\'s storage in all of that', touched.length === 0, touched.slice(0, 5).join());
  const G = m.Game.prototype;
  const had = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let meta = null;
  const game = {
    inWorld: false, client: null, mode: 'single', titleScreenFactory: null, connectingScreenFactory: null,
    setScreen() {}, leaveHost() {}, startWorkers: async () => {},
    setUpWorld(mt) {
      meta = mt;
    },
    level: {}, player: {}, chunks: { addRemote() {}, removeRemote() {} }, hud: { setOverlayMessage() {} }, chat() {}, connectionLost() {},
  };
  await G.joinWorld.call(game, '0123456789abcdef', { name: 'Alex', uuid: m.randomId(), viewDistance: 3 });
  const LOGIN = {
    playerId: 7, worldName: 'Hosted', dimension: 'overworld', gameMode: 'creative', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
    gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Host',
  };
  game.client.hooks.login(LOGIN);
  check('saves: a guest\'s game plays as a client', game.mode === 'client' && game.client instanceof m.ClientSession);
  check('saves: the world it sets up is a passing one (WorldMeta.transient), under no save\'s id', meta?.transient === true && meta.id === '__guest', JSON.stringify(meta)?.slice(0, 120));
  touched.length = 0;
  await G.writeWorld.call({ ...game, meta, inWorld: true });
  check('saves: the game\'s save of it writes nothing', touched.length === 0, touched.join());
  game.client.leave();
  if (had === undefined) delete globalThis.window;
  else globalThis.window = had;
}

await exitWithStatus(close);
