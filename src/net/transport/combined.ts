// A world open two ways at once: to the other windows of the host's browser (BroadcastChannel) and to other computers
// through the relay (WebSocket). Each guest is a peer of one of them, and its id here says which (the way's prefix).

import type { PeerId, Transport } from './transport';

export class CombinedTransport implements Transport {
  private msgCb: ((peer: PeerId, data: Uint8Array) => void) | null = null;
  private peerCb: ((peer: PeerId, joined: boolean, reason?: string) => void) | null = null;

  /** `ways`: each transport with the prefix its peers' ids get here */
  constructor(private readonly ways: readonly (readonly [prefix: string, transport: Transport])[]) {
    for (const [prefix, t] of ways) {
      t.onMessage((peer, data) => this.msgCb?.(prefix + peer, data));
      t.onPeer((peer, joined, reason) => this.peerCb?.(prefix + peer, joined, reason));
    }
  }

  private route(peer: PeerId): [Transport, PeerId] | null {
    for (const [prefix, t] of this.ways) if (peer.startsWith(prefix)) return [t, peer.slice(prefix.length)];
    return null;
  }

  send(peer: PeerId, data: Uint8Array): void {
    const r = this.route(peer);
    r?.[0].send(r[1], data);
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void {
    this.msgCb = cb;
  }

  onPeer(cb: (peer: PeerId, joined: boolean, reason?: string) => void): void {
    this.peerCb = cb;
  }

  disconnect(peer: PeerId): void {
    const r = this.route(peer);
    r?.[0].disconnect(r[1]);
  }

  close(): void {
    for (const [, t] of this.ways) t.close();
  }

  address(peer: PeerId): string | null {
    const r = this.route(peer);
    return r ? (r[0].address?.(r[1]) ?? null) : null;
  }
}
