// Two windows of the same browser (same site), over BroadcastChannel: a host listens on its world's channel, a guest
// knocks there, and each guest gets a channel of its own with the host. Nothing leaves the browser.
//
// On the wire, every post is a small object: { t: 'connect', from } on the world's channel; then on the pair's channel
// { t: 'accept' | 'data' | 'bye', side: 'h' | 'g', d?: Uint8Array }. Anything else, or anything malformed, is ignored.

import { HOST_PEER, randomId, type PeerId, type Transport } from './transport';

const PREFIX = 'mc-mp:';
/**
 * a guest that hasn't been let in by then gives up (vanilla's timeout, 30 s). A window next door answers at once, but
 * on a slow machine both windows may be busy for seconds (drawing, setting up the world), and an answer that comes
 * late is still an answer; the Connecting screen's Cancel is there for one that never comes
 */
const CONNECT_TIMEOUT_MS = 30_000;
const PEER_ID = /^[0-9a-f-]{8,64}$/;

type Post = { t?: unknown; side?: unknown; from?: unknown; d?: unknown };

function channel(name: string): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
  } catch {
    return null;
  }
}

/** the host's end: every guest that knocks on `worldChannel` is let in (the game above decides whether it may stay) */
export class BroadcastHostTransport implements Transport {
  private readonly door: BroadcastChannel | null;
  private readonly peers = new Map<PeerId, BroadcastChannel>();
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean) => void) | null = null;

  constructor(readonly serverId: string) {
    this.door = channel(PREFIX + serverId);
    if (this.door) this.door.onmessage = (ev) => this.knock(ev.data as Post);
  }

  get available(): boolean {
    return this.door !== null;
  }

  private knock(m: Post): void {
    if (!m || m.t !== 'connect' || typeof m.from !== 'string' || !PEER_ID.test(m.from) || this.peers.has(m.from)) return;
    const id = m.from;
    const ch = channel(`${PREFIX}${this.serverId}:${id}`);
    if (!ch) return;
    this.peers.set(id, ch);
    ch.onmessage = (ev) => {
      const p = ev.data as Post;
      if (!p || p.side !== 'g') return;
      if (p.t === 'data' && p.d instanceof Uint8Array) this.msgCb?.(id, p.d);
      else if (p.t === 'bye') this.drop(id, false);
    };
    ch.postMessage({ t: 'accept', side: 'h' });
    this.peerCb?.(id, true);
  }

  private drop(peer: PeerId, tell: boolean): void {
    const ch = this.peers.get(peer);
    if (!ch) return;
    this.peers.delete(peer);
    if (tell) ch.postMessage({ t: 'bye', side: 'h' });
    ch.close();
    this.peerCb?.(peer, false);
  }

  send(peer: PeerId, data: Uint8Array): void {
    this.peers.get(peer)?.postMessage({ t: 'data', side: 'h', d: data });
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean) => void): void {
    this.peerCb = cb;
  }

  disconnect(peer: PeerId): void {
    this.drop(peer, true);
  }

  close(): void {
    for (const p of [...this.peers.keys()]) this.drop(p, true);
    this.door?.close();
  }
}

/** a guest's end: knocks on the world's channel, and hears 'host' join once let in (or leave, if nobody answers) */
export class BroadcastGuestTransport implements Transport {
  readonly peerId = randomId();
  private readonly door: BroadcastChannel | null;
  private readonly ch: BroadcastChannel | null;
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean) => void) | null = null;
  private state: 'knocking' | 'open' | 'closed' = 'knocking';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly serverId: string) {
    this.ch = channel(`${PREFIX}${serverId}:${this.peerId}`);
    this.door = channel(PREFIX + serverId);
    if (!this.ch || !this.door) {
      this.state = 'closed';
      queueMicrotask(() => this.peerCb?.(HOST_PEER, false));
      return;
    }
    this.ch.onmessage = (ev) => {
      const p = ev.data as Post;
      if (!p || p.side !== 'h') return;
      if (p.t === 'accept' && this.state === 'knocking') {
        this.state = 'open';
        this.stopTimer();
        this.door?.close();
        this.peerCb?.(HOST_PEER, true);
      } else if (p.t === 'data' && p.d instanceof Uint8Array && this.state === 'open') this.msgCb?.(HOST_PEER, p.d);
      else if (p.t === 'bye') this.end(false);
    };
    this.door.postMessage({ t: 'connect', from: this.peerId });
    this.timer = setTimeout(() => this.state === 'knocking' && this.end(false), CONNECT_TIMEOUT_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private end(tell: boolean): void {
    if (this.state === 'closed') return;
    const was = this.state;
    this.state = 'closed';
    this.stopTimer();
    if (tell && was === 'open') this.ch?.postMessage({ t: 'bye', side: 'g' });
    this.ch?.close();
    this.door?.close();
    this.peerCb?.(HOST_PEER, false);
  }

  send(peer: PeerId, data: Uint8Array): void {
    if (peer === HOST_PEER && this.state === 'open') this.ch?.postMessage({ t: 'data', side: 'g', d: data });
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean) => void): void {
    this.peerCb = cb;
  }

  disconnect(_peer: PeerId): void {
    this.end(true);
  }

  close(): void {
    this.end(true);
  }
}
