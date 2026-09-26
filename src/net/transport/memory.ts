// A network in one process, for tests: a host endpoint and any number of guests, with every message held until
// `deliver()` hands it on (so a test decides when things arrive), and copied on the way, as a real wire would.

import { HOST_PEER, type PeerId, type Transport } from './transport';

type Event = { to: MemoryEndpoint; from: PeerId; data: Uint8Array | null; joined?: boolean };

export class MemoryEndpoint implements Transport {
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean) => void) | null = null;
  /** the endpoints this one is connected to, by the peer id it knows them as */
  readonly links = new Map<PeerId, { end: MemoryEndpoint; as: PeerId }>();
  closed = false;
  /** bytes sent from here, all told */
  sentBytes = 0;

  constructor(private readonly net: MemoryNetwork, readonly name: PeerId) {}

  send(peer: PeerId, data: Uint8Array): void {
    const l = this.links.get(peer);
    if (!l || this.closed) return;
    this.sentBytes += data.length;
    this.net.queue.push({ to: l.end, from: l.as, data: data.slice() });
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean) => void): void {
    this.peerCb = cb;
  }

  disconnect(peer: PeerId): void {
    const l = this.links.get(peer);
    if (!l) return;
    this.links.delete(peer);
    l.end.links.delete(l.as);
    this.net.queue.push({ to: l.end, from: l.as, data: null, joined: false });
  }

  close(): void {
    for (const p of [...this.links.keys()]) this.disconnect(p);
    this.closed = true;
  }

  /** (the network) an event arrives */
  receive(e: Event): void {
    if (this.closed) return;
    if (e.data) this.msgCb?.(e.from, e.data);
    else this.peerCb?.(e.from, !!e.joined);
  }

  /** (tests) as if the window went away without a word: nothing more goes either way, nobody is told */
  vanish(): void {
    for (const l of this.links.values()) l.end.links.delete(l.as);
    this.links.clear();
    this.closed = true;
  }
}

export class MemoryNetwork {
  readonly queue: Event[] = [];
  readonly host = new MemoryEndpoint(this, HOST_PEER);
  private next = 1;

  /** a new guest's endpoint, connecting to the host (both hear of it on the next delivery) */
  connect(): MemoryEndpoint {
    const id = `guest-${this.next++}`;
    const g = new MemoryEndpoint(this, id);
    g.links.set(HOST_PEER, { end: this.host, as: id });
    this.host.links.set(id, { end: g, as: HOST_PEER });
    this.queue.push({ to: this.host, from: id, data: null, joined: true });
    this.queue.push({ to: g, from: HOST_PEER, data: null, joined: true });
    return g;
  }

  /** hand on everything sent so far, in order (what that sets off waits for the next delivery) */
  deliver(): number {
    const batch = this.queue.splice(0, this.queue.length);
    for (const e of batch) e.to.receive(e);
    return batch.length;
  }
}
