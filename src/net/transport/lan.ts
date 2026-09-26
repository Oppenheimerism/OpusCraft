// Finding open worlds (vanilla LanServerPinger / LanServerDetection): a host with a world open to LAN says so on a
// shared channel every second; the Multiplayer screen lists what it has heard lately. Here the "LAN" is the other
// windows of this browser (BroadcastChannel); what's heard is only ever shown as text.

import { ANNOUNCE_EXPIRE_MS } from '../config';

const LAN_CHANNEL = 'mc-mp';

/** what a host says about its open world */
export interface LanWorld {
  /** its channel (net/transport/broadcastChannel.ts) */
  id: string;
  /** the world's name, and the host's player's */
  name: string;
  host: string;
  players: number;
  max: number;
  protocol: number;
  build: string;
}

const ID = /^[0-9a-f-]{8,64}$/;
/** text heard from another window, fit to show: no formatting codes or control characters, not too long */
export function plainText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f§]/g, '').slice(0, max) : '';
}

function parse(m: Record<string, unknown>): LanWorld | null {
  if (typeof m.id !== 'string' || !ID.test(m.id)) return null;
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : -1);
  const w: LanWorld = { id: m.id, name: plainText(m.name, 64), host: plainText(m.host, 16), players: n(m.players, 1000), max: n(m.max, 1000), protocol: n(m.protocol, 0x7fffffff), build: plainText(m.build, 64) };
  return w.players < 0 || w.max < 0 || w.protocol < 0 ? null : w;
}

function open(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(LAN_CHANNEL) : null;
  } catch {
    return null;
  }
}

/** the host's voice on the LAN: `announce()` now and then (and whenever a list asks), `close()` when the world closes */
export class LanAnnouncer {
  private readonly ch = open();

  constructor(private readonly info: () => LanWorld) {
    if (this.ch)
      this.ch.onmessage = (ev) => {
        if ((ev.data as { t?: unknown })?.t === 'query') this.announce();
      };
  }

  announce(): void {
    this.ch?.postMessage({ t: 'world', ...this.info() });
  }

  close(): void {
    this.ch?.postMessage({ t: 'gone', id: this.info().id });
    this.ch?.close();
  }
}

/** the worlds heard of lately (vanilla LanServerDetection.LanServerList), newest news first */
export class LanWorldList {
  private readonly ch = open();
  private readonly heard = new Map<string, { world: LanWorld; at: number }>();
  /** bumped whenever the list changes */
  version = 0;

  constructor(private readonly now: () => number = () => Date.now()) {
    if (!this.ch) return;
    this.ch.onmessage = (ev) => {
      const m = ev.data as Record<string, unknown> | null;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'world') {
        const w = parse(m);
        if (!w) return;
        const had = this.heard.get(w.id);
        this.heard.set(w.id, { world: w, at: this.now() });
        if (!had || JSON.stringify(had.world) !== JSON.stringify(w)) this.version++;
      } else if (m.t === 'gone' && typeof m.id === 'string' && this.heard.delete(m.id)) this.version++;
    };
    this.ch.postMessage({ t: 'query' });
  }

  /** whether this browser can hear other windows at all */
  get available(): boolean {
    return this.ch !== null;
  }

  worlds(): LanWorld[] {
    const t = this.now();
    for (const [id, h] of this.heard)
      if (t - h.at > ANNOUNCE_EXPIRE_MS) {
        this.heard.delete(id);
        this.version++;
      }
    return [...this.heard.values()].map((h) => h.world);
  }

  close(): void {
    this.ch?.close();
  }
}
