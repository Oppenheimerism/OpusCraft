// The relay going away under a world open to LAN, and coming back (npm run lan stopped, or started again, the Claude
// app's preview stopping it, say): the host's end lets its guests go and keeps trying to reach the relay, a second
// later, then twice as long each time up to 10 s; once it's back, the world is on it again, with nothing for the host to
// do, and a friend joins as before. Another page on this computer taking the relay, a relay that never answered, and the
// host closing the world each end it for good, as before.

import http from 'node:http';
import { WebSocket } from 'ws';
import { attachRelay } from '../../scripts/relay.mjs';
import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/net/transport/webSocket.ts', '/src/net/config.ts']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test, ms = 5000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(20)) if (test()) return true;
  return test();
}

/** a server with the relay on it, on `port` (any, if 0), which `stop()` takes down with every socket on it */
async function relayServer(port = 0) {
  const server = http.createServer((_q, r) => r.end('page'));
  const relay = attachRelay(server, { handshakeMs: 2000, idleMs: 4000, pingMs: 500, log: () => {} });
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const at = server.address().port;
  const stop = () =>
    new Promise((r) => {
      relay.close();
      server.close(() => r());
      for (const s of sockets) s.destroy();
    });
  return { port: at, stop };
}

/** a page's socket on this computer, as the relay wants a host's (vanilla's LAN host is this computer's own) */
const socketFor = (port) => (url) => new WebSocket(url, { origin: `http://localhost:${port}`, headers: { Host: `localhost:${port}` } });
const WORLD = { id: 'restart-test', name: 'Test World', host: 'Host', players: 1, max: 8, protocol: 0, build: 'test' };

function newHost(port) {
  const t = new m.WebSocketHostTransport({ url: `ws://127.0.0.1:${port}/__mp?role=host`, socket: socketFor(port) });
  const h = { t, relayCalls: [], joined: [], left: [] };
  t.onRelay = () => h.relayCalls.push(t.state);
  t.onPeer((peer, joined) => (joined ? h.joined : h.left).push(peer));
  t.onMessage(() => {});
  t.announce(WORLD);
  return h;
}
function newGuest(port) {
  const t = new m.WebSocketGuestTransport({ url: `ws://127.0.0.1:${port}/__mp?role=guest`, socket: socketFor(port) });
  const g = { t, events: [] };
  t.onPeer((peer, joined, reason) => g.events.push([joined, reason ?? '']));
  t.onMessage(() => {});
  return g;
}

let srv = await relayServer();
const port = srv.port;
const h = newHost(port);
await until(() => h.t.state === 'open' && h.relayCalls.length === 1);
const g1 = newGuest(port);
await until(() => h.joined.length === 1);
check('a world on the relay, and a friend joined through it', h.t.state === 'open' && h.joined.length === 1 && h.relayCalls.join() === 'open', `${h.t.state}, ${h.joined.length} joined, relay heard ${h.relayCalls.join()}`);

// the relay stops (npm run lan's window closed, or the app's preview stopped)
await srv.stop();
await until(() => h.left.length === 1 && g1.events.some(([j]) => !j));
check('the relay stops: the friend on it is let go, at both ends', h.left.length === 1 && g1.events.some(([j]) => !j), JSON.stringify(g1.events));
check('...and the host\'s end is trying to reach it again, not closed, the game told once', h.t.state === 'connecting' && h.relayCalls.join() === 'open,connecting', `${h.t.state}, relay heard ${h.relayCalls.join()}`);
await sleep(3500);
check('...still trying while it\'s gone, the game told no more', h.t.state === 'connecting' && h.relayCalls.length === 2, `${h.t.state}, relay heard ${h.relayCalls.join()}`);

// it runs again, on the same port: the world is back on it by itself
srv = await relayServer(port);
const back = await until(() => h.t.state === 'open' && h.relayCalls.length === 3, 12000);
check('the relay runs again: within 10 s the host\'s end is on it again, and the game hears where friends can join', back && h.relayCalls.at(-1) === 'open', `${h.t.state}, relay heard ${h.relayCalls.join()}`);
const g2 = newGuest(port);
await until(() => h.joined.length === 2);
check('...and a friend joins through it as before', h.joined.length === 2 && g2.t.state === 'open', `${h.joined.length} joined, guest ${g2.t.state}`);

// another page on this computer can't take the relay from it; a second page's end, turned away, doesn't try again
const other = newHost(port);
await until(() => other.t.state === 'closed');
await sleep(1500);
check('another page\'s world while this one is on the relay: turned away, and it doesn\'t keep trying', other.t.state === 'closed' && other.t.endCode === m.CLOSE_HOST_TAKEN && h.t.state === 'open', `${other.t.state} ${other.t.endCode}; ours ${h.t.state}`);

// the host closes the world: no more tries, even with the relay gone
h.t.close();
await srv.stop();
await sleep(2500);
check('the host closes the world: its end stays closed, the relay\'s going or not', h.t.state === 'closed', h.t.state);

// a relay that never answered (no npm run lan): closed, as before, not tried again
const dead = newHost(port);
await until(() => dead.t.state === 'closed');
await sleep(1500);
check('a relay that never answered: the host\'s end is closed and doesn\'t keep trying', dead.t.state === 'closed' && !dead.t.wasOpen && dead.relayCalls.join() === 'closed', `${dead.t.state}, relay heard ${dead.relayCalls.join()}`);
g1.t.close();
g2.t.close();

await exitWithStatus(close);
