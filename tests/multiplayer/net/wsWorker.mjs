// The WebSocket network's worker (tests/multiplayer/net/wsNetwork.mjs): the relay (scripts/relay.mjs), one per network
// on a server of its own, and the game's WebSocket transports (src/net/transport/webSocket.ts) as the pages use them,
// talking over real sockets. The test's thread, which runs the games' ticks in lockstep, sends what its endpoints do
// here and waits (Atomics) till everything sent so far has arrived; what arrived is handed back, in order.
//
// Counted, so a wait knows when it's over: each guest's link with the host, its messages each way (sent by the
// transport, received at the far end), and the comings and goings each side is owed (a guest connecting: the host
// hears it join and the guest hears it's in; a side closing or letting the other go: the other hears it).

import { parentPort, workerData } from 'node:worker_threads';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachRelay } from '../../../scripts/relay.mjs';
import { loadModules } from '../../../scripts/load.mjs';

const { shared, limits, port } = workerData;
const flag = new Int32Array(shared);
const { mods, close: closeLoader } = await loadModules(['/src/net/transport/webSocket.ts']);
const { WebSocketHostTransport, WebSocketGuestTransport } = mods[0];

/** networks, by id: { server, relay, port, sockets, host: ep id, links: Map<guest ep id, link> } */
const nets = new Map();
/** endpoints, by id: { id, net, kind, t, address, vanished, closed } */
const eps = new Map();
/** what arrived since the last wait: { net, ep, kind: 'msg' | 'peer', peer, data, joined, reason } */
let events = [];
/** the comings and goings owed: Set of `${kind}:${guest ep id}` (kind: open, join, leave, kicked) */
const owed = new Set();
let waiting = null;

const address = (id) => `10.${(id >> 16) & 255}.${(id >> 8) & 255}.${id & 255}`;

function link(ep) {
  const n = nets.get(eps.get(ep)?.net);
  return n?.links.get(ep) ?? null;
}

function linkByHostPeer(n, peer) {
  for (const l of n.links.values()) if (l.hostPeer === peer) return l;
  return null;
}

function kill(l) {
  if (!l || !l.alive) return;
  l.alive = false;
  for (const k of ['open', 'join', 'leave', 'kicked']) owed.delete(`${k}:${l.guest}`);
}

async function newNet(id) {
  const server = http.createServer((_q, r) => r.end());
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  const relay = attachRelay(server, limits);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  nets.set(id, { id, server, relay, port: server.address().port, sockets, host: null, links: new Map() });
}

function socketFor(n, forwardedFor) {
  const host = `localhost:${n.port}`;
  return (url) => new WebSocket(url, { origin: `http://${host}`, headers: { Host: host, ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) } });
}

function newHost(netId, id) {
  const n = nets.get(netId);
  const t = new WebSocketHostTransport({ url: `ws://127.0.0.1:${n.port}/__mp?role=host`, socket: socketFor(n, null) });
  // (the relay wants a host's world said within its handshake time: a test's host has none to say, so this stands in)
  t.announce({ id: `net-${netId}`, name: 'Test World', host: 'Host', players: 1, max: 8, protocol: 0, build: 'test' });
  const ep = { id, net: netId, kind: 'host', t, vanished: false, closed: false };
  eps.set(id, ep);
  n.host = id;
  t.onMessage((peer, data) => {
    const l = linkByHostPeer(n, peer);
    if (ep.vanished || !l || !l.alive) return;
    l.up.got++;
    arrived({ net: netId, ep: id, kind: 'msg', peer, data: new Uint8Array(data) });
  });
  t.onPeer((peer, joined, reason) => {
    if (joined) {
      const g = [...n.links.values()].find((l) => l.address === t.address(peer));
      if (!g) return;
      g.hostPeer = peer;
      owed.delete(`join:${g.guest}`);
      if (!ep.vanished) arrived({ net: netId, ep: id, kind: 'peer', peer, joined: true, address: g.address });
    } else {
      const l = linkByHostPeer(n, peer);
      if (l) {
        owed.delete(`leave:${l.guest}`);
        kill(l);
      }
      if (!ep.vanished) arrived({ net: netId, ep: id, kind: 'peer', peer, joined: false, reason });
    }
    check();
  });
}

function newGuest(netId, id) {
  const n = nets.get(netId);
  const addr = address(id);
  const t = new WebSocketGuestTransport({ url: `ws://127.0.0.1:${n.port}/__mp?role=guest`, socket: socketFor(n, addr) });
  const ep = { id, net: netId, kind: 'guest', t, vanished: false, closed: false };
  eps.set(id, ep);
  const l = { guest: id, address: addr, hostPeer: null, alive: true, up: { sent: 0, got: 0 }, down: { sent: 0, got: 0 } };
  n.links.set(id, l);
  if (n.host !== null && !eps.get(n.host).closed) owed.add(`join:${id}`);
  owed.add(`open:${id}`);
  t.onMessage((peer, data) => {
    if (ep.vanished || !l.alive) return;
    l.down.got++;
    arrived({ net: netId, ep: id, kind: 'msg', peer, data: new Uint8Array(data) });
  });
  t.onPeer((peer, joined, reason) => {
    owed.delete(`open:${id}`);
    if (!joined) {
      owed.delete(`kicked:${id}`);
      kill(l);
    }
    if (!ep.vanished) arrived({ net: netId, ep: id, kind: 'peer', peer, joined, reason });
    check();
  });
}

function arrived(e) {
  events.push(e);
  check();
}

/** whether everything sent so far on network `netId` has arrived, and every coming and going owed has been heard */
function settled(netId) {
  const n = nets.get(netId);
  if (!n) return true;
  for (const l of n.links.values()) {
    if (!l.alive) continue;
    if (l.up.sent !== l.up.got || l.down.sent !== l.down.got) return false;
    for (const k of ['open', 'join', 'leave', 'kicked']) if (owed.has(`${k}:${l.guest}`)) return false;
  }
  return true;
}

function check() {
  if (waiting && settled(waiting.net)) reply();
}

function reply(stuck = null) {
  const w = waiting;
  waiting = null;
  clearTimeout(w.timer);
  const out = events;
  events = [];
  port.postMessage({ events: out, stuck }, out.filter((e) => e.data).map((e) => e.data.buffer));
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

function describeStuck(netId) {
  const n = nets.get(netId);
  const out = [];
  for (const l of n?.links.values() ?? []) {
    if (!l.alive) continue;
    if (l.up.sent !== l.up.got) out.push(`guest ${l.guest} → host ${l.up.got}/${l.up.sent}`);
    if (l.down.sent !== l.down.got) out.push(`host → guest ${l.guest} ${l.down.got}/${l.down.sent}`);
    for (const k of ['open', 'join', 'leave', 'kicked']) if (owed.has(`${k}:${l.guest}`)) out.push(`${k} ${l.guest}`);
  }
  return out.join(', ');
}

async function handle(m) {
  switch (m.op) {
    case 'net':
      return newNet(m.net);
    case 'host':
      return newHost(m.net, m.ep);
    case 'connect':
      return newGuest(m.net, m.ep);
    case 'send': {
      const ep = eps.get(m.ep);
      if (!ep || ep.vanished || ep.closed) return;
      const n = nets.get(ep.net);
      if (ep.kind === 'host') {
        const l = linkByHostPeer(n, m.peer);
        // (what the transport sends: to a guest it knows, while it's open)
        if (l && l.alive && ep.t.state !== 'closed' && ep.t.address(m.peer) !== null) l.down.sent++;
      } else {
        const l = n.links.get(ep.id);
        if (l && l.alive && ep.t.state === 'open') l.up.sent++;
      }
      ep.t.send(m.peer, m.data);
      return;
    }
    case 'disconnect':
    case 'close': {
      const ep = eps.get(m.ep);
      if (!ep || ep.vanished || ep.closed) return;
      const n = nets.get(ep.net);
      if (ep.kind === 'host') {
        const ls = m.op === 'close' ? [...n.links.values()] : [linkByHostPeer(n, m.peer)].filter(Boolean);
        for (const l of ls) if (l.alive && l.hostPeer !== null && ep.t.address(l.hostPeer) !== null) owed.add(`kicked:${l.guest}`);
      } else {
        const l = n.links.get(ep.id);
        if (l && l.alive && l.hostPeer !== null && ep.t.state === 'open') owed.add(`leave:${l.guest}`);
      }
      if (m.op === 'close') {
        ep.closed = true;
        ep.t.close();
      } else ep.t.disconnect(m.peer);
      return;
    }
    case 'vanish': {
      const ep = eps.get(m.ep);
      if (!ep) return;
      ep.vanished = true;
      const n = nets.get(ep.net);
      if (ep.kind === 'host') for (const l of n.links.values()) kill(l);
      else kill(n.links.get(ep.id));
      return;
    }
    case 'sync':
      waiting = { net: m.net, timer: setTimeout(() => waiting && reply(describeStuck(m.net) || 'nothing owed'), m.timeout ?? 5000) };
      check();
      return;
    case 'shutdown':
      for (const n of nets.values()) {
        n.relay.close();
        for (const s of n.sockets) s.destroy();
        n.server.close();
      }
      await closeLoader();
      port.postMessage({ done: true });
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
      return;
  }
}

let chain = Promise.resolve();
port.on('message', (m) => {
  chain = chain.then(() => handle(m)).catch((e) => console.error('wsWorker:', e));
});
parentPort.postMessage('ready');
