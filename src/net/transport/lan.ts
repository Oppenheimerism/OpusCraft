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
  /** (stage 5) the join code, told only to the other windows of the host's browser (they're its player's own) */
  code?: string;
}

const ID = /^[0-9a-f-]{8,64}$/;
/** the most worlds listed at once (more heard of are let be until some go quiet) */
const MAX_WORLDS = 32;
/** text heard from another window, fit to show: no formatting codes (vanilla ChatFormatting.stripFormatting) or control characters, not too long */
export function plainText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/§[\s\S]?/g, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

/** what another page says of its world, checked (null if it doesn't say it right) */
export function parseLanWorld(m: Record<string, unknown>): LanWorld | null {
  if (typeof m.id !== 'string' || !ID.test(m.id)) return null;
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : -1);
  const w: LanWorld = { id: m.id, name: plainText(m.name, 64), host: plainText(m.host, 16), players: n(m.players, 1000), max: n(m.max, 1000), protocol: n(m.protocol, 0x7fffffff), build: plainText(m.build, 64) };
  if (typeof m.code === 'string' && /^[0-9A-Z]{1,32}$/.test(m.code)) w.code = m.code;
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
        const w = parseLanWorld(m);
        if (!w) return;
        const had = this.heard.get(w.id);
        if (!had && this.heard.size >= MAX_WORLDS && this.worlds().length >= MAX_WORLDS) return;
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
