// How a host and its guests pass bytes: reliable and in order, whatever carries them (two windows' BroadcastChannel;
// other computers' pages through the relay's WebSockets; WebRTC data channels could be another). The game above only
// ever sees peers and byte messages; what's in them is net/codec.ts and net/protocol.ts's business.

/** who's at the other end of a connection: a guest's id on the host; 'host' on a guest */
export type PeerId = string;

export interface Transport {
  /** send `data` to `peer` (dropped if it isn't connected) */
  send(peer: PeerId, data: Uint8Array): void;
  /** every message that arrives, and from whom */
  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void;
  /**
   * a peer connected (true) or went (false; nothing more comes from it), with why it went if the transport knows (a
   * relay's word that the host's page went away, say)
   */
  onPeer(cb: (peer: PeerId, joined: boolean, reason?: string) => void): void;
  /** let `peer` go (the other end hears it went) */
  disconnect(peer: PeerId): void;
  /** end every connection and stop listening */
  close(): void;
  /** where `peer` connects from, if the transport can tell (an address through the relay), for the join code's cooldown */
  address?(peer: PeerId): string | null;
}

/** the host's peer id, as its guests know it */
export const HOST_PEER: PeerId = 'host';

/** a fresh random id (a peer's, a world's on the LAN, a guest's uuid) */
export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
