// The multiplayer tests over WebSockets (MP_NET=ws): a network like src/net/transport/memory.ts's MemoryNetwork, with
// the same host, connect() and deliver(), but whose messages go through the relay (scripts/relay.mjs) over real
// sockets, carried by the game's WebSocket transports (src/net/transport/webSocket.ts), in a worker of this process
// (net/wsWorker.mjs). The tests' ticks stay in lockstep: deliver() waits (Atomics) till everything sent so far has
// arrived, then hands it on in the order it arrived, as MemoryNetwork's does.
//
// MP_LAG=20-200 (with MP_NET=ws): what arrives is held back a while more, 20 to 200 ms at random but in order on each
// connection, in the tests' time: each deliver() is half a tick (25 ms) on, so a message sent at one tick is heard one
// to four ticks later, as over a slow network.
//
// The relay here takes the game's limits on a message's size, but not those that go by the clock (a guest's rate, a
// connection's handshake and idle times): the tests' ticks run far faster than the game's 20 a second. Those are
// tests/multiplayer/m5-relay.mjs's to try.

import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { relayLimits } from '../../../scripts/relay.mjs';

const HOST_PEER = 'host';
let worker = null, port = null, flag = null;
let nextNet = 1, nextEp = 1;
const networks = new Map();

function start(m) {
  if (worker) return;
  const shared = new SharedArrayBuffer(4);
  flag = new Int32Array(shared);
  const ch = new MessageChannel();
  port = ch.port1;
  const limits = {
    ...relayLimits(m),
    guestMessagesPerSecond: 1e9, guestBurst: 1e9, guestBytesPerSecond: 1e12, guestBurstBytes: 1e12,
    handshakeMs: 3_600_000, idleMs: 3_600_000, pingMs: 3_600_000,
  };
  worker = new Worker(new URL('./wsWorker.mjs', import.meta.url), { workerData: { shared, limits, port: ch.port2 }, transferList: [ch.port2] });
  worker.unref();
  // (it's ready once its module loader is up: the first wait says so)
}

function post(msg) {
  port.postMessage(msg);
}

/** everything that arrived on the worker's side, once network `net` has settled (a warning if it doesn't in time) */
function sync(net) {
  Atomics.store(flag, 0, 0);
  post({ op: 'sync', net, timeout: 5000 });
  // (the first wait also waits for the worker to load: up to a minute)
  if (Atomics.wait(flag, 0, 0, 60_000) === 'timed-out') throw new Error('wsNetwork: the worker never answered');
  const r = receiveMessageOnPort(port)?.message;
  if (!r) throw new Error('wsNetwork: no answer from the worker');
  if (r.stuck) console.log(`wsNetwork: gave up waiting for: ${r.stuck}`);
  return r.events;
}

export class WsEndpoint {
  msgCb = null;
  peerCb = null;
  closed = false;
  sentBytes = 0;
  /** (the host's end) where each guest connects from, as the relay said */
  addresses = new Map();

  constructor(net, id, name) {
    this.net = net;
    this.id = id;
    this.name = name;
  }

  send(peer, data) {
    if (this.closed) return;
    this.sentBytes += data.length;
    post({ op: 'send', ep: this.id, peer, data: data.slice() });
  }

  onMessage(cb) {
    this.msgCb = cb;
  }

  onPeer(cb) {
    this.peerCb = cb;
  }

  disconnect(peer) {
    if (!this.closed) post({ op: 'disconnect', ep: this.id, peer });
  }

  close() {
    if (this.closed) return;
    post({ op: 'close', ep: this.id });
    this.closed = true;
  }

  address(peer) {
    return this.addresses.get(peer) ?? null;
  }

  /** (tests) as if the window went away without a word: nothing more goes either way, nobody is told */
  vanish() {
    post({ op: 'vanish', ep: this.id });
    this.closed = true;
  }

  receive(e) {
    if (this.closed) return;
    if (e.kind === 'msg') this.msgCb?.(e.peer, e.data);
    else {
      if (e.joined && e.address) this.addresses.set(e.peer, e.address);
      this.peerCb?.(e.peer, e.joined, e.reason);
    }
  }
}

export class WsNetwork {
  /** events arrived and not yet handed on: { e, at } */
  held = [];
  /** (MP_LAG) the tests' clock, ms, and when each connection's last message is heard */
  clock = 0;
  last = new Map();
  order = 0;

  constructor(m, lag = null) {
    start(m);
    this.lag = lag;
    this.id = nextNet++;
    networks.set(this.id, this);
    this.eps = new Map();
    post({ op: 'net', net: this.id });
    this.host = this.endpoint(HOST_PEER);
    post({ op: 'host', net: this.id, ep: this.host.id });
  }

  endpoint(name) {
    const ep = new WsEndpoint(this, nextEp++, name);
    this.eps.set(ep.id, ep);
    return ep;
  }

  /** a new guest's endpoint, connecting to the host (both hear of it on a delivery) */
  connect() {
    const g = this.endpoint(`guest-${nextEp}`);
    post({ op: 'connect', net: this.id, ep: g.id });
    return g;
  }

  /** everything sent so far that has arrived (and, with MP_LAG, whose time has come), handed on in order */
  deliver() {
    for (const e of sync(this.id)) {
      // (another network's arrivals wait for its own deliver(), at its own clock)
      const n = networks.get(e.net);
      if (!n) continue;
      let at = n.clock;
      if (n.lag) {
        const key = `${e.ep}|${e.peer}`;
        at = Math.max(n.last.get(key) ?? 0, n.clock + n.lag.min + Math.random() * (n.lag.max - n.lag.min));
        n.last.set(key, at);
      }
      n.held.push({ e, at, i: n.order++ });
    }
    if (this.lag) this.clock += 25;
    const due = this.held.filter((h) => h.at <= this.clock).sort((a, b) => a.at - b.at || a.i - b.i);
    this.held = this.held.filter((h) => h.at > this.clock);
    for (const { e } of due) this.eps.get(e.ep)?.receive(e);
    return due.length;
  }
}

/** the worker's relays and sockets closed, the worker gone */
export async function closeWsNetworks() {
  if (!worker) return;
  Atomics.store(flag, 0, 0);
  post({ op: 'shutdown' });
  Atomics.wait(flag, 0, 0, 10_000);
  await worker.terminate();
  worker = null;
}
