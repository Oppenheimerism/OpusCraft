// Pages that aren't windows of one browser (a friend's computer on the same network; one coming in through a tunnel),
// through the relay on the game's own server (scripts/relay.mjs, at /__mp: npm run lan). The host's page keeps one
// WebSocket to it that carries all its guests; each guest's page keeps one of its own. The relay passes bytes along and
// reads none of them; what's in them is checked here and above as anything from another game is.
//
// Every message goes with a byte in front saying how: as it is, or deflated (CompressionStream's deflate-raw), which
// the host does to the big ones (chunks, above all) and a guest never does. Inflating stops a byte past the game's
// limit on a message, and what doesn't unpack at all is handed on empty: the game above turns either away as it does
// any message too big or not its own, saying why. Messages are handed on in the order they were sent, whatever takes
// longer to squash or unsquash, and a connection's end comes after them.
//
// (A way for two browsers to reach each other straight, WebRTC, would be another Transport beside this one.)

import { HOST_PEER, type PeerId, type Transport } from './transport';
import { plainText, type LanWorld, parseLanWorld } from './lan';
import { MAX_HOST_MESSAGE } from '../config';

/** what the transports need of a WebSocket (the browser's; in the tests, the ws package's) */
export interface SocketLike {
  binaryType: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface SocketOptions {
  /** the relay's address (this page's own server's /__mp if not given) */
  url?: string;
  /** makes the WebSocket (the browser's if not given) */
  socket?: SocketFactory;
  /**
   * (testing) every message and every connection's coming and going held back a while as it arrives, `min` to `max` ms
   * at random, still in order (a slow network's lag and jitter)
   */
  latency?: { min: number; max: number };
}

/** the relay's frames to and from the host (scripts/relay.mjs's OP) */
const OP_JOIN = 1, OP_DATA = 2, OP_LEAVE = 3, OP_KICK = 4;
/** the byte in front of each message */
const RAW = 0, DEFLATED = 1;
/** the host deflates a message of this many bytes or more (a tick's moves and sounds are fewer; chunks, many more) */
const DEFLATE_FROM = 1024;
/** the relay's close codes (scripts/relay.mjs's CLOSE) */
const CLOSE_SHUTDOWN = 1001, CLOSE_BAD = 1008, CLOSE_TOO_BIG = 1009, CLOSE_KICKED = 4000, CLOSE_HOST_LEFT = 4001, CLOSE_TIMED_OUT = 4002, CLOSE_NO_HOST = 4004,
  CLOSE_TOO_MUCH = 4008, CLOSE_FULL = 4010;
export const CLOSE_HOST_TAKEN = 4009;

const canSquash = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** the relay's address for `role`, on the server this page came from (wss:// for an https page, as through a tunnel) */
export function relayUrl(role: 'host' | 'guest' | 'list', loc: { protocol: string; host: string } = location): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/__mp?role=${role}`;
}

/** why the relay (or the network) ended a connection, as the player reads it */
export function closeReason(code: number, reason: string, wasOpen: boolean): string {
  switch (code) {
    case CLOSE_KICKED:
      return 'Disconnected';
    case CLOSE_HOST_LEFT:
      return 'The host closed the world.';
    case CLOSE_TIMED_OUT:
      return 'Timed out';
    case CLOSE_NO_HOST:
      return 'No world is open to LAN there right now.';
    case CLOSE_TOO_MUCH:
      return reason === 'too-slow' ? "The connection couldn't keep up with the host." : 'Sent too much, too fast.';
    case CLOSE_HOST_TAKEN:
      return 'Another page on this computer has a world open to LAN already.';
    case CLOSE_FULL:
      return 'Too many people are connected there right now.';
    case CLOSE_SHUTDOWN:
      return wasOpen ? "The host's game server stopped." : "Couldn't reach the host's computer.";
    case CLOSE_BAD:
      return 'The connection was closed: something was sent that the other end refused.';
    case CLOSE_TOO_BIG:
      // (the relay holds a guest to the game's own limit on a message: as the host's game would say it)
      return 'Bad data: a message too big';
    default:
      return wasOpen ? 'Connection lost' : "Couldn't reach the host's computer.";
  }
}

function defaultSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

/** jobs run one after another in the order given; a job may take a while (inflating, a test's lag), and those after it wait */
class InOrder {
  private readonly jobs: (() => void | Promise<void>)[] = [];
  private running = false;
  private idleWaiters: (() => void)[] = [];

  push(job: () => void | Promise<void>): void {
    this.jobs.push(job);
    if (!this.running) void this.drain();
  }

  get idle(): boolean {
    return !this.running && !this.jobs.length;
  }

  /** resolves once every job so far is done */
  whenIdle(): Promise<void> {
    return this.idle ? Promise.resolve() : new Promise((r) => this.idleWaiters.push(r));
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.jobs.length) {
      const job = this.jobs.shift()!;
      try {
        const r = job();
        if (r) await r;
      } catch (e) {
        console.error('multiplayer: passing a message on', e);
      }
    }
    this.running = false;
    for (const w of this.idleWaiters.splice(0)) w();
  }
}

/** holds what arrives back as SocketOptions.latency says, in order */
class Lag {
  private last = 0;
  constructor(private readonly l: { min: number; max: number }) {}

  /** a job that waits this item's lag (from now) out */
  hold(): () => Promise<void> {
    const now = performance.now();
    const at = (this.last = Math.max(this.last, now + this.l.min + Math.random() * Math.max(0, this.l.max - this.l.min)));
    return () => new Promise<void>((r) => setTimeout(r, Math.max(0, at - performance.now())));
  }
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(data).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/**
 * `data` inflated (deflate-raw), but no more than `max` + 1 bytes of it: one that would come to more than any the game
 * sends is cut off there, so the game above sees it's too big without its all being unpacked. Empty if it isn't
 * deflate-raw at all (the game turns an empty message away as it does any that isn't its own)
 */
async function inflate(data: Uint8Array<ArrayBuffer>, max: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!canSquash) return new Uint8Array(0);
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(data).catch(() => {});
  w.close().catch(() => {});
  const r = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      const room = max + 1 - n;
      parts.push(value.length > room ? value.subarray(0, room) : value);
      n += Math.min(value.length, room);
      if (n > max) {
        void r.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    return new Uint8Array(0);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `head` bytes, then the byte saying how, then `body` */
function framed(head: number[], how: number, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(head.length + 1 + body.length);
  out.set(head);
  out[head.length] = how;
  out.set(body, head.length + 1);
  return out;
}

function bytesOf(data: unknown): Uint8Array<ArrayBuffer> | null {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : null;
}

const utf8 = new TextDecoder();

// ---------------------------------------------------------------------------
// the host's end

/** a guest as the host's end knows it */
interface Guest {
  /** where it connects from (the relay's word: an address), for the join code's cooldown */
  address: string;
  /** what arrives from it, and what goes to it, each in order */
  readonly incoming: InOrder;
  readonly outgoing: InOrder;
  readonly lag: Lag | null;
}

/**
 * the host's end: one WebSocket to the relay, which carries every guest (each a peer by the relay's number for it). The
 * relay's word on where friends can open the game comes in `lan` (and `onRelay` is called), as does whether it's gone
 */
export class WebSocketHostTransport implements Transport {
  private ws: SocketLike;
  private readonly guests = new Map<PeerId, Guest>();
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean, reason?: string) => void) | null = null;
  state: 'connecting' | 'open' | 'closed' = 'connecting';
  /** where friends on this network can open the game (the relay's word; none if its server listens on this computer only) */
  lan: string[] = [];
  /** whether friends come in through a tunnel (npm run lan -- --tunnel) */
  tunnel = false;
  /** why the relay let this end go, if it did (and its close code: CLOSE_HOST_TAKEN, say) */
  endReason = '';
  endCode = 0;
  /** whether it ever connected */
  wasOpen = false;
  /** the relay said where friends can open the game, or went */
  onRelay: (() => void) | null = null;
  /** this world as the Multiplayer screens show it, last told */
  private world = '';
  /** (the relay gone after this world was on it) tries so far to reach it again, and the next one's timer */
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: SocketOptions = {}) {
    this.ws = this.connect();
  }

  /** a socket to the relay, this end's from now on (a socket this end has left behind is heard no more) */
  private connect(): SocketLike {
    const ws = (this.opts.socket ?? defaultSocket)(this.opts.url ?? relayUrl('host'));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (this.state !== 'connecting' || ws !== this.ws) return;
      this.state = 'open';
      this.wasOpen = true;
      this.retries = 0;
      if (this.world) ws.send(this.world);
    };
    ws.onmessage = (ev) => ws === this.ws && this.received(ev.data);
    ws.onclose = (ev) => ws === this.ws && this.ended(ev.code, ev.reason);
    ws.onerror = () => {};
    return ws;
  }

  /** what the Multiplayer screens of other computers show of this world (said again only when it changes; never the join code) */
  announce(world: LanWorld): void {
    const s = JSON.stringify({ t: 'world', world });
    if (s === this.world) return;
    this.world = s;
    if (this.state === 'open') this.ws.send(s);
  }

  private received(data: unknown): void {
    if (this.state === 'closed') return;
    if (typeof data === 'string') {
      let m: { t?: unknown; lan?: unknown; tunnel?: unknown };
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (m?.t !== 'relay') return;
      this.lan = Array.isArray(m.lan) ? m.lan.filter((u): u is string => typeof u === 'string' && /^https?:\/\/[\w.:[\]-]{1,80}$/.test(u)).slice(0, 8) : [];
      this.tunnel = m.tunnel === true;
      this.onRelay?.();
      return;
    }
    const b = bytesOf(data);
    if (!b || b.length < 5) return;
    const op = b[0], peer = String(new DataView(b.buffer).getUint32(1));
    if (op === OP_JOIN) {
      if (this.guests.has(peer)) return;
      const g: Guest = { address: plainText(utf8.decode(b.subarray(5)), 64) || 'unknown', incoming: new InOrder(), outgoing: new InOrder(), lag: this.opts.latency ? new Lag(this.opts.latency) : null };
      this.guests.set(peer, g);
      this.arrive(g, () => this.peerCb?.(peer, true));
    } else if (op === OP_DATA) {
      const g = this.guests.get(peer);
      if (!g) return;
      const body = b.subarray(5);
      // (a guest's messages go as they are: one that says otherwise, or says nothing, isn't one of the game's, and
      // goes on empty for the game to turn away)
      const m = body.length >= 1 && body[0] === RAW ? body.subarray(1) : new Uint8Array(0);
      this.arrive(g, () => this.guests.get(peer) === g && this.msgCb?.(peer, m));
    } else if (op === OP_LEAVE) {
      const g = this.guests.get(peer);
      if (!g) return;
      this.guests.delete(peer);
      this.arrive(g, () => this.peerCb?.(peer, false));
    }
  }

  /** `job` once what arrived from `g` before it has been handed on (and its lag, if testing, waited out) */
  private arrive(g: Guest, job: () => void): void {
    if (g.lag) g.incoming.push(g.lag.hold());
    g.incoming.push(job);
  }

  private kick(peer: PeerId, g: Guest): void {
    const id = Number(peer);
    g.outgoing.push(() => this.put(new Uint8Array([OP_KICK, id >>> 24, (id >>> 16) & 255, (id >>> 8) & 255, id & 255])));
  }

  private ended(code: number, reason: string): void {
    const was = this.state;
    if (was === 'closed' && this.endReason) return;
    this.endCode = code;
    this.endReason = closeReason(code, reason, was === 'open');
    for (const [peer, g] of this.guests) this.arrive(g, () => this.peerCb?.(peer, false));
    this.guests.clear();
    // (the relay went away after this world was on it: npm run lan stopped or started again. The guests on it have gone
    // with it; this end tries to reach it again a second later, then twice as long each time, up to 10 s, so that once
    // it's back this world is on it again and friends can join with the same code. Another page on this computer taking
    // the relay, or this end closing, ends it for good. `onRelay` hears of the relay going, then of its coming back)
    if (this.wasOpen && code !== CLOSE_HOST_TAKEN) {
      this.state = 'connecting';
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.state === 'connecting') this.ws = this.connect();
      }, Math.min(10_000, 1000 * 2 ** this.retries++));
      if (was === 'open') this.onRelay?.();
      return;
    }
    this.state = 'closed';
    this.onRelay?.();
  }

  send(peer: PeerId, data: Uint8Array): void {
    const g = this.guests.get(peer);
    if (!g || this.state === 'closed') return;
    const id = Number(peer), head = [OP_DATA, id >>> 24, (id >>> 16) & 255, (id >>> 8) & 255, id & 255];
    if (!canSquash || data.length < DEFLATE_FROM) {
      const f = framed(head, RAW, data);
      return g.outgoing.push(() => this.put(f));
    }
    const raw = data.slice();
    g.outgoing.push(async () => {
      let z: Uint8Array<ArrayBuffer> | null = null;
      try {
        z = await deflate(raw);
      } catch {
        z = null;
      }
      this.put(z && z.length < raw.length ? framed(head, DEFLATED, z) : framed(head, RAW, raw));
    });
  }

  /** (what's still being squashed when this end closes goes too: the socket closes after it) */
  private put(frame: Uint8Array<ArrayBuffer>): void {
    if (this.ws.readyState === 1) this.ws.send(frame);
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean, reason?: string) => void): void {
    this.peerCb = cb;
  }

  /** where `peer` connects from (an address, as the relay saw it) */
  address(peer: PeerId): string | null {
    return this.guests.get(peer)?.address ?? null;
  }

  disconnect(peer: PeerId): void {
    const g = this.guests.get(peer);
    if (!g) return;
    this.guests.delete(peer);
    // (after what was sent to it: its Disconnect says why)
    this.kick(peer, g);
  }

  close(): void {
    if (this.state === 'closed') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const outgoing = [...this.guests.values()].map((g) => g.outgoing.whenIdle());
    this.guests.clear();
    this.state = 'closed';
    this.endReason = 'Closed';
    // (what's still being squashed goes first; the relay tells the guests the host went)
    void Promise.all(outgoing).then(() => this.ws.close(1000, 'closed'));
  }
}

// ---------------------------------------------------------------------------
// a guest's end

/** a guest's end: its own WebSocket to the relay, 'host' its one peer once it's open */
export class WebSocketGuestTransport implements Transport {
  private readonly ws: SocketLike;
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean, reason?: string) => void) | null = null;
  private readonly incoming = new InOrder();
  private readonly lag: Lag | null;
  state: 'connecting' | 'open' | 'closed' = 'connecting';
  /** why it ended, as the player reads it */
  endReason = '';

  constructor(opts: SocketOptions = {}) {
    this.lag = opts.latency ? new Lag(opts.latency) : null;
    const ws = (this.ws = (opts.socket ?? defaultSocket)(opts.url ?? relayUrl('guest')));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (this.state !== 'connecting') return;
      this.state = 'open';
      this.arrive(() => this.peerCb?.(HOST_PEER, true));
    };
    ws.onmessage = (ev) => this.received(ev.data);
    ws.onclose = (ev) => this.end(closeReason(ev.code, ev.reason, this.state === 'open'));
    ws.onerror = () => {};
  }

  private arrive(job: () => void | Promise<void>): void {
    if (this.lag) this.incoming.push(this.lag.hold());
    this.incoming.push(job);
  }

  private received(data: unknown): void {
    if (this.state !== 'open') return;
    const b = bytesOf(data);
    // (what isn't one of the host's messages goes on empty, for the game to turn away)
    if (!b || b.length < 1 || (b[0] !== RAW && b[0] !== DEFLATED)) return this.arrive(() => this.deliver(new Uint8Array(0)));
    if (b[0] === RAW) return this.arrive(() => this.deliver(b.subarray(1)));
    const z = b.subarray(1);
    this.arrive(async () => {
      if (this.state === 'open') this.deliver(await inflate(z, MAX_HOST_MESSAGE));
    });
  }

  private deliver(m: Uint8Array): void {
    if (this.state === 'open') this.msgCb?.(HOST_PEER, m);
  }

  private end(reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.endReason = reason;
    // (after whatever came before it)
    this.arrive(() => this.peerCb?.(HOST_PEER, false, reason));
  }

  send(peer: PeerId, data: Uint8Array): void {
    if (peer === HOST_PEER && this.state === 'open') this.ws.send(framed([], RAW, data));
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean, reason?: string) => void): void {
    this.peerCb = cb;
  }

  disconnect(_peer: PeerId): void {
    this.close();
  }

  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.endReason = 'Left';
    this.ws.close(1000, 'bye');
  }
}

// ---------------------------------------------------------------------------
// the worlds the relay knows of

/** the world open on the relay's computer, if one is (vanilla's LAN list, for pages that aren't in the host's browser) */
export class RelayWorldList {
  private ws: SocketLike | null = null;
  private heard: LanWorld[] = [];
  /** bumped whenever the list changes */
  version = 0;
  /** whether the relay answered */
  connected = false;
  /** whether there is no relay to hear from: it never answered (a site with none, as the game's public one), or it went */
  gone = false;

  constructor(opts: SocketOptions = {}) {
    try {
      const ws = (this.ws = (opts.socket ?? defaultSocket)(opts.url ?? relayUrl('list')));
      ws.onopen = () => {
        this.connected = true;
        this.version++;
      };
      ws.onmessage = (ev) => this.received(ev.data);
      ws.onclose = () => {
        this.connected = false;
        this.gone = true;
        if (this.heard.length) this.heard = [];
        this.version++;
      };
      ws.onerror = () => {};
    } catch {
      // (no WebSocket here, or not to that address: no worlds from the relay)
      this.ws = null;
      this.gone = true;
    }
  }

  private received(data: unknown): void {
    if (typeof data !== 'string' || data.length > 16384) return;
    let m: { t?: unknown; worlds?: unknown };
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m?.t !== 'worlds' || !Array.isArray(m.worlds)) return;
    const ws = m.worlds.slice(0, 4).map((w) => (w && typeof w === 'object' ? parseLanWorld(w as Record<string, unknown>) : null)).filter((w): w is LanWorld => !!w);
    if (JSON.stringify(ws) === JSON.stringify(this.heard)) return;
    this.heard = ws;
    this.version++;
  }

  worlds(): LanWorld[] {
    return this.heard;
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'bye');
    }
  }
}
