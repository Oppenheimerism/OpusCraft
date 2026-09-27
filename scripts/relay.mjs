// The multiplayer relay: where a world's host page and its guests' pages meet, over WebSockets at /__mp on the page's
// own server (npm run lan; the preview and dev servers on this computer as well). It passes their bytes along and
// never reads them: what's in them is the host's game's business (src/net), which checks all of it as it would from
// any other window, the join code included. The relay looks after itself: who may connect at all (pages of this site,
// asked for by an address or an allowed name), who may host (a page on this very computer, not one that came in
// through a tunnel or a proxy), one host at a time, how many connections and from where, how big and how fast a
// guest's messages are, and connections that say nothing or go quiet.
//
// Three kinds of connection, by ?role=:
//   host   the page with its world open to LAN (one at a time). Its binary frames, both ways, are
//          [op u8][guest id u32 big-endian][payload]: to it JOIN (the payload: where the guest connects from, for the
//          join code's cooldown), DATA and LEAVE; from it DATA and KICK. Text frames are JSON: to it
//          {t:'relay', lan, tunnel} once, where friends can open the game; from it {t:'world', world} whenever its
//          entry on the Multiplayer screens changes (passed on as it is: it never holds the join code).
//   guest  a page joining the world: its binary frames go to the host as they are, and the host's to it.
//   list   a Multiplayer screen: told {t:'worlds', worlds} at once and whenever the host's entry changes. It says nothing.
// A connection the relay lets go is closed with one of the codes in CLOSE, and a word the page turns into one for the
// player (src/net/transport/webSocket.ts).

import { WebSocketServer } from 'ws';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';

export const RELAY_PATH = '/__mp';

/**
 * where a server keeps its relay (`server[RELAY_KEY]`: what attachRelay returns), for whoever stops the server to stop
 * the relay first, each page told why (npm run lan; Vite's servers end every connection at once when they stop)
 */
export const RELAY_KEY = Symbol.for('minecraft.mp-relay');

/** the host's frames */
export const OP = { JOIN: 1, DATA: 2, LEAVE: 3, KICK: 4 };

/** why the relay closed a connection */
export const CLOSE = {
  /** the relay is stopping */
  SHUTDOWN: 1001,
  /** something it doesn't take: a text frame from a guest, a frame of the wrong kind, one too big */
  BAD: 1008,
  /** the host let the guest go (its game told the guest why first) */
  KICKED: 4000,
  /** the host's page went away */
  HOST_LEFT: 4001,
  /** it said nothing in time, or went quiet */
  TIMED_OUT: 4002,
  /** no world is open */
  NO_HOST: 4004,
  /** a guest sending too much, too fast, or not taking what the host sends it fast enough */
  TOO_MUCH: 4008,
  /** another page hosts already */
  HOST_TAKEN: 4009,
  /** too many connections */
  FULL: 4010,
};

/** room in a frame for the relay's header and the page's own (a message itself is held to the game's limits) */
const FRAME_SLACK = 16;

/**
 * headers a proxy or a tunnel adds (cloudflared: Cf-Connecting-Ip, X-Forwarded-For and the rest): a connection with any
 * of them came from somewhere else, whatever address it comes from
 */
const FORWARDED = [
  'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'cf-connecting-ip', 'cf-ray',
  'cf-visitor', 'cf-ipcountry', 'true-client-ip', 'x-client-ip', 'x-cluster-client-ip', 'fastly-client-ip', 'cdn-loop', 'via',
];

const STATUS = { 400: 'Bad Request', 403: 'Forbidden', 503: 'Service Unavailable' };

/** the limits, as src/net/config.ts has them (vite.config.ts passes that file's; these are for a relay started bare) */
const DEFAULTS = {
  maxGuestMessage: 320 * 1024,
  maxHostMessage: 16 * 1024 * 1024,
  maxConnections: 64,
  maxPerAddress: 8,
  maxGuests: 15,
  maxListeners: 32,
  guestMessagesPerSecond: 800,
  guestBurst: 1000,
  guestBytesPerSecond: 2 * 1024 * 1024,
  guestBurstBytes: 2 * 1024 * 1024,
  maxGuestBuffer: 32 * 1024 * 1024,
  maxWorldInfo: 2048,
  handshakeMs: 10_000,
  idleMs: 30_000,
  pingMs: 10_000,
  /** host names pages may be asked for by besides addresses and localhost (Vite's preview.allowedHosts), or true for any */
  allowedHosts: [],
  /** npm run lan -- --tunnel: friends come in through a tunnel, not the LAN */
  tunnel: false,
  /** a line for the terminal */
  log: null,
};

/** the relay's limits from the game's own (src/net/config.ts's exports): what vite.config.ts and the tests hand attachRelay */
export function relayLimits(NET) {
  return {
    maxGuestMessage: NET.MAX_GUEST_MESSAGE,
    maxHostMessage: NET.MAX_HOST_MESSAGE,
    maxConnections: NET.RELAY_MAX_CONNECTIONS,
    maxPerAddress: NET.RELAY_MAX_PER_ADDRESS,
    maxGuests: NET.RELAY_MAX_GUESTS,
    maxListeners: NET.RELAY_MAX_LISTENERS,
    guestMessagesPerSecond: NET.RELAY_GUEST_MESSAGES_PER_SECOND,
    guestBurst: NET.RELAY_GUEST_BURST,
    guestBytesPerSecond: NET.RELAY_GUEST_BYTES_PER_SECOND,
    guestBurstBytes: NET.RELAY_GUEST_BURST_BYTES,
    maxGuestBuffer: NET.RELAY_MAX_GUEST_BUFFER,
    maxWorldInfo: NET.RELAY_MAX_WORLD_INFO,
    handshakeMs: NET.RELAY_HANDSHAKE_MS,
    idleMs: NET.RELAY_IDLE_MS,
    pingMs: NET.RELAY_PING_MS,
  };
}

const plain = (a) => (typeof a === 'string' && a.startsWith('::ffff:') && isIP(a.slice(7)) === 4 ? a.slice(7) : a ?? '');

function isLoopback(a) {
  const v = plain(a);
  return v === '::1' || (isIP(v) === 4 && v.startsWith('127.'));
}

/** the name in a Host header, lowercase and without its port (an IPv6 address in its brackets); null if it isn't one */
function hostName(h) {
  if (typeof h !== 'string') return null;
  const t = h.trim().toLowerCase();
  if (t.startsWith('[')) {
    const end = t.indexOf(']');
    return end > 0 && isIP(t.slice(1, end)) === 6 ? t.slice(0, end + 1) : null;
  }
  const colon = t.indexOf(':');
  const n = colon === -1 ? t : t.slice(0, colon);
  return n ? n : null;
}

/**
 * Vite's rule for the Host a page may be asked for by (against DNS rebinding: a site whose name is made to point at
 * this computer): an address, localhost, or a name allowed
 */
function hostAllowed(h, allowed) {
  const n = hostName(h);
  if (!n) return false;
  if (allowed === true || n.startsWith('[') || isIP(n) === 4 || n === 'localhost' || n.endsWith('.localhost')) return true;
  for (const a of Array.isArray(allowed) ? allowed : []) {
    if (typeof a !== 'string') continue;
    if (a === n || (a[0] === '.' && (a.slice(1) === n || n.endsWith(a)))) return true;
  }
  return false;
}

const isLocalName = (n) => n === 'localhost' || n.endsWith('.localhost') || n === '[::1]' || (isIP(n) === 4 && n.startsWith('127.'));

/** whether the page asking is one of this site's own (its Origin the address it asks: a WebSocket isn't held to it otherwise) */
function sameOrigin(req) {
  const o = req.headers.origin, h = req.headers.host;
  if (typeof o !== 'string' || typeof h !== 'string') return false;
  let u;
  try {
    u = new URL(o);
  } catch {
    return false;
  }
  return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.toLowerCase() === h.trim().toLowerCase();
}

const forwarded = (req) => FORWARDED.some((h) => h in req.headers);

/**
 * where a connection comes from, for the limits and the join code's cooldown: its address; or, come in through a proxy
 * on this computer (a tunnel), the address that says it's passing on (a tunnel's own, which the far end can't make
 * up), or 'proxied' if it says none
 */
function sourceOf(req) {
  const peer = plain(req.socket.remoteAddress);
  if (!isLoopback(peer) || !forwarded(req)) return peer || 'unknown';
  const cf = plain(String(req.headers['cf-connecting-ip'] ?? '').trim());
  if (isIP(cf)) return cf;
  // (the last is the one the nearest proxy added; those before it are the far end's to say)
  const xff = plain(String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ?? '');
  return isIP(xff) ? xff : 'proxied';
}

/** a page may host if it's on this computer, asked for as localhost, and came in straight (not through a tunnel or a proxy) */
const mayHost = (req) => isLoopback(req.socket.remoteAddress) && !forwarded(req) && isLocalName(hostName(req.headers.host) ?? '');

function refuse(socket, status) {
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${STATUS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** the addresses friends can open the game at (IPv4, as a friend types one), if the server listens beyond this computer */
function lanUrls(server) {
  const a = server.address();
  if (!a || typeof a === 'string') return [];
  if (a.address !== '0.0.0.0' && a.address !== '::') return isLoopback(a.address) ? [] : [`http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}`];
  const out = [];
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) {
      if (i.internal || (i.family !== 'IPv4' && i.family !== 4) || i.address.startsWith('169.254.')) continue;
      out.push(`http://${i.address}:${a.port}`);
    }
  return out;
}

/**
 * the relay on `server` (an http.Server: Vite's preview or dev server's, or a test's), with `options` over DEFAULTS.
 * Returns what a test needs: `close()`, and `stats()`
 */
export function attachRelay(server, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const base = { noServer: true, clientTracking: false, perMessageDeflate: false, closeTimeout: 5000 };
  const wss = {
    host: new WebSocketServer({ ...base, maxPayload: opts.maxHostMessage + FRAME_SLACK }),
    guest: new WebSocketServer({ ...base, maxPayload: opts.maxGuestMessage + FRAME_SLACK }),
    list: new WebSocketServer({ ...base, maxPayload: 64 }),
  };
  /** every open connection (counted till its socket is closed) */
  const conns = new Set();
  const perSource = new Map();
  /** the guests the host can reach, by their ids */
  const guests = new Map();
  let host = null;
  /** the host's entry for the Multiplayer screens, as JSON */
  let world = null;
  let nextId = 1;
  let closed = false;
  const log = (s) => opts.log?.(s);

  const newId = () => {
    do nextId = nextId >= 0xffffffff ? 1 : nextId + 1;
    while (guests.has(nextId));
    return nextId;
  };

  function onUpgrade(req, socket, head) {
    let path, role;
    try {
      const u = new URL(req.url ?? '', 'http://relay');
      path = u.pathname;
      role = u.searchParams.get('role');
    } catch {
      return;
    }
    // (another path is someone else's: Vite's own socket, say)
    if (path !== RELAY_PATH) return;
    socket.on('error', () => {});
    if (closed) return refuse(socket, 503);
    if (!hostAllowed(req.headers.host, opts.allowedHosts) || !sameOrigin(req)) return refuse(socket, 403);
    if (role !== 'host' && role !== 'guest' && role !== 'list') return refuse(socket, 400);
    const source = sourceOf(req);
    if (conns.size >= opts.maxConnections || (perSource.get(source) ?? 0) >= opts.maxPerAddress) {
      log(`relay: turned away a connection from ${source}: too many connections`);
      return refuse(socket, 503);
    }
    if (role === 'host' && !mayHost(req)) {
      log(`relay: turned away a page from ${source} that asked to host (only a page opened at localhost on this computer can)`);
      return refuse(socket, 403);
    }
    wss[role].handleUpgrade(req, socket, head, (ws) => opened(ws, role, source));
  }

  function opened(ws, role, source) {
    const now = Date.now();
    const c = { ws, role, source, id: 0, heard: now, said: role === 'list', live: true, counted: true, timer: null, msgs: opts.guestBurst, bytes: opts.guestBurstBytes, filled: now };
    conns.add(c);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
    ws.on('error', () => {});
    ws.on('pong', () => (c.heard = Date.now()));
    ws.on('close', () => {
      forget(c, true);
      if (!c.counted) return;
      c.counted = false;
      conns.delete(c);
      const n = (perSource.get(source) ?? 1) - 1;
      if (n > 0) perSource.set(source, n);
      else perSource.delete(source);
    });
    if (role !== 'list') {
      c.timer = setTimeout(() => c.said || shut(c, CLOSE.TIMED_OUT, 'timed-out'), opts.handshakeMs);
      c.timer.unref?.();
    }
    if (role === 'host') {
      if (host) return shut(c, CLOSE.HOST_TAKEN, 'host-taken');
      host = c;
      ws.on('message', (d, binary) => fromHost(c, d, binary));
      ws.send(JSON.stringify({ t: 'relay', lan: opts.tunnel ? [] : lanUrls(server), tunnel: !!opts.tunnel }));
      log('relay: a world is open to LAN');
    } else if (role === 'guest') {
      if (!host) return shut(c, CLOSE.NO_HOST, 'no-host');
      if (guests.size >= opts.maxGuests) return shut(c, CLOSE.FULL, 'full');
      c.id = newId();
      guests.set(c.id, c);
      ws.on('message', (d, binary) => fromGuest(c, d, binary));
      toHost(OP.JOIN, c.id, Buffer.from(source, 'utf8'));
      log(`relay: a guest connected from ${source}`);
    } else {
      let n = 0;
      for (const o of conns) if (o.role === 'list' && o.live) n++;
      if (n > opts.maxListeners) return shut(c, CLOSE.FULL, 'full');
      ws.on('message', () => shut(c, CLOSE.BAD, 'bad'));
      ws.send(worlds());
    }
  }

  /** `c` let go (closed with `code` and `why`, which its page hears), and forgotten at once */
  function shut(c, code, why, tellHost = true) {
    forget(c, tellHost);
    if (c.ws.readyState === c.ws.OPEN) c.ws.close(code, why);
    else c.ws.terminate();
  }

  /** `c` no longer passed anything: a guest's host hears it went (unless it let it go itself); a host's guests go with it */
  function forget(c, tellHost) {
    if (!c.live) return;
    c.live = false;
    clearTimeout(c.timer);
    if (c.role === 'guest' && c.id && guests.get(c.id) === c) {
      guests.delete(c.id);
      if (tellHost) toHost(OP.LEAVE, c.id);
      log(`relay: a guest from ${c.source} left`);
    } else if (c === host) {
      host = null;
      world = null;
      for (const g of [...guests.values()]) shut(g, CLOSE.HOST_LEFT, 'host-left', false);
      tellListeners();
      log('relay: the world is closed to LAN');
    }
  }

  function toHost(op, id, payload) {
    if (!host?.live) return;
    const b = Buffer.allocUnsafe(5 + (payload ? payload.length : 0));
    b[0] = op;
    b.writeUInt32BE(id, 1);
    if (payload) payload.copy(b, 5);
    host.ws.send(b);
  }

  /** vanilla's packet rate limit, here on a guest's messages: so many a second and so many bytes, in bursts */
  function take(c, n) {
    const now = Date.now(), dt = (now - c.filled) / 1000;
    c.filled = now;
    c.msgs = Math.min(opts.guestBurst, c.msgs + dt * opts.guestMessagesPerSecond) - 1;
    c.bytes = Math.min(opts.guestBurstBytes, c.bytes + dt * opts.guestBytesPerSecond) - n;
    return c.msgs >= 0 && c.bytes >= 0;
  }

  function fromGuest(c, data, binary) {
    if (!c.live) return;
    c.heard = Date.now();
    if (!binary) return shut(c, CLOSE.BAD, 'bad');
    if (!take(c, data.length)) return shut(c, CLOSE.TOO_MUCH, 'too-much');
    c.said = true;
    toHost(OP.DATA, c.id, data);
  }

  function fromHost(c, data, binary) {
    if (!c.live) return;
    c.heard = Date.now();
    if (!binary) {
      if (data.length > opts.maxWorldInfo + 64) return shut(c, CLOSE.BAD, 'bad');
      let m;
      try {
        m = JSON.parse(data.toString('utf8'));
      } catch {
        return shut(c, CLOSE.BAD, 'bad');
      }
      if (!m || typeof m !== 'object' || m.t !== 'world' || !m.world || typeof m.world !== 'object' || Array.isArray(m.world)) return shut(c, CLOSE.BAD, 'bad');
      const w = JSON.stringify(m.world);
      if (w.length > opts.maxWorldInfo) return shut(c, CLOSE.BAD, 'bad');
      c.said = true;
      if (w !== world) {
        world = w;
        tellListeners();
      }
      return;
    }
    if (data.length < 5) return shut(c, CLOSE.BAD, 'bad');
    const op = data[0], g = guests.get(data.readUInt32BE(1));
    if (op === OP.DATA) {
      // (a guest gone meanwhile: the host hears it did)
      if (!g) return;
      g.ws.send(data.subarray(5));
      if (g.ws.bufferedAmount > opts.maxGuestBuffer) shut(g, CLOSE.TOO_MUCH, 'too-slow');
    } else if (op === OP.KICK) {
      if (g) shut(g, CLOSE.KICKED, 'bye', false);
    } else shut(c, CLOSE.BAD, 'bad');
  }

  const worlds = () => `{"t":"worlds","worlds":[${world ?? ''}]}`;

  function tellListeners() {
    const m = worlds();
    for (const c of conns) if (c.role === 'list' && c.live) c.ws.send(m);
  }

  /** every so often: a connection not heard from (not even its answer to a ping) for too long is let go; the rest are pinged */
  const timer = setInterval(() => {
    const now = Date.now();
    for (const c of [...conns]) {
      if (!c.live) continue;
      if (now - c.heard > opts.idleMs) {
        forget(c, true);
        c.ws.terminate();
      } else c.ws.ping();
    }
  }, opts.pingMs);
  timer.unref?.();

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    server.off('upgrade', onUpgrade);
    const order = [...conns].sort((a, b) => (a.role === 'guest' ? 0 : a === host ? 1 : 2) - (b.role === 'guest' ? 0 : b === host ? 1 : 2));
    for (const c of order) shut(c, CLOSE.SHUTDOWN, 'shutdown', false);
  }

  server.on('upgrade', onUpgrade);
  server.once('close', close);
  const relay = {
    close,
    stats: () => ({ connections: conns.size, guests: guests.size, hosting: !!host, world }),
  };
  server[RELAY_KEY] = relay;
  return relay;
}
