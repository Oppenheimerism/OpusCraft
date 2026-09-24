// What villagers have heard about others (vanilla GossipContainer and GossipType). Each villager keeps, for every
// player (or mob) it has something on, a value per kind of gossip: hurting or killing villagers, curing them,
// trading. A kind's weight times its value is what it adds to that one's reputation; the values fade a little
// every day, and the villagers pass them on (a bit weaker each time) when they meet and chat.

import type { Rand } from '../core/rng';

export type GossipType = 'major_negative' | 'minor_negative' | 'minor_positive' | 'major_positive' | 'trading';

interface GossipKind {
  /** what one point of it is worth */
  weight: number;
  max: number;
  decayPerDay: number;
  /** lost each time it's passed on */
  decayPerTransfer: number;
}

/** vanilla GossipType */
export const GOSSIP_TYPES: Record<GossipType, GossipKind> = {
  major_negative: { weight: -5, max: 100, decayPerDay: 10, decayPerTransfer: 10 },
  minor_negative: { weight: -1, max: 200, decayPerDay: 20, decayPerTransfer: 20 },
  minor_positive: { weight: 1, max: 200, decayPerDay: 1, decayPerTransfer: 5 },
  major_positive: { weight: 5, max: 100, decayPerDay: 0, decayPerTransfer: 100 },
  trading: { weight: 1, max: 25, decayPerDay: 2, decayPerTransfer: 20 },
};

/** vanilla GossipContainer.DISCARD_THRESHOLD: gossip weaker than this is forgotten */
const DISCARD_THRESHOLD = 2;

export interface GossipEntry {
  target: string;
  type: GossipType;
  value: number;
}

export class GossipContainer {
  /** target (an entity's uuid) → kind → value */
  private readonly gossips = new Map<string, Map<GossipType, number>>();

  /** vanilla unpack: every piece of gossip */
  entries(): GossipEntry[] {
    const out: GossipEntry[] = [];
    for (const [target, m] of this.gossips) for (const [type, value] of m) out.push({ target, type, value });
    return out;
  }

  /** vanilla selectGossipsForTransfer: `amount` picks, each the more likely the weightier it is */
  private selectForTransfer(random: Rand, amount: number): Set<GossipEntry> {
    const list = this.entries();
    const picked = new Set<GossipEntry>();
    if (!list.length) return picked;
    const ends: number[] = [];
    let total = 0;
    for (const e of list) {
      total += Math.abs(e.value * GOSSIP_TYPES[e.type].weight);
      ends.push(total - 1);
    }
    for (let n = 0; n < amount; n++) {
      const k = random.nextInt(total);
      // (vanilla Arrays.binarySearch: the first end at or past k)
      let lo = 0, hi = ends.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ends[mid] < k) lo = mid + 1;
        else hi = mid;
      }
      picked.add(list[lo]);
    }
    return picked;
  }

  private getOrCreate(target: string): Map<GossipType, number> {
    let m = this.gossips.get(target);
    if (!m) this.gossips.set(target, (m = new Map()));
    return m;
  }

  /** vanilla transferFrom: hear some of what another villager knows (the stronger of the two tellings kept) */
  transferFrom(other: GossipContainer, random: Rand, amount: number): void {
    for (const e of other.selectForTransfer(random, amount)) {
      const v = e.value - GOSSIP_TYPES[e.type].decayPerTransfer;
      if (v < DISCARD_THRESHOLD) continue;
      const m = this.getOrCreate(e.target);
      m.set(e.type, Math.max(m.get(e.type) ?? v, v));
    }
  }

  /** vanilla getReputation: the weighted sum of what's known of `target` (of the kinds `which` allows) */
  reputation(target: string, which: (t: GossipType) => boolean = () => true): number {
    const m = this.gossips.get(target);
    if (!m) return 0;
    let sum = 0;
    for (const [type, value] of m) if (which(type)) sum += value * GOSSIP_TYPES[type].weight;
    return sum;
  }

  /** vanilla getCountForType: how many targets have a weighted value of that kind that passes `test` */
  countForType(type: GossipType, test: (weighted: number) => boolean): number {
    let n = 0;
    for (const m of this.gossips.values()) if (test((m.get(type) ?? 0) * GOSSIP_TYPES[type].weight)) n++;
    return n;
  }

  /** vanilla add: more of a kind of gossip about `target` (never past its max, forgotten below 2) */
  add(target: string, type: GossipType, value: number): void {
    const m = this.getOrCreate(target);
    const kind = GOSSIP_TYPES[type];
    const old = m.get(type);
    // (vanilla mergeValuesForAddition: a sum over the max keeps the max, or what was there if that's more)
    const sum = old === undefined ? value : old + value > kind.max ? Math.max(kind.max, old) : old + value;
    m.set(type, sum);
    // vanilla makeSureValueIsntTooLowOrTooHigh
    if (sum > kind.max) m.set(type, kind.max);
    if (sum < DISCARD_THRESHOLD) m.delete(type);
    if (!m.size) this.gossips.delete(target);
  }

  /** vanilla remove(target, type, value) */
  remove(target: string, type: GossipType, value: number): void {
    this.add(target, type, -value);
  }

  /** vanilla remove(target, type): forget that kind about them entirely */
  removeAll(target: string, type: GossipType): void {
    const m = this.gossips.get(target);
    if (!m) return;
    m.delete(type);
    if (!m.size) this.gossips.delete(target);
  }

  /** vanilla decay: a day's fading */
  decay(): void {
    for (const [target, m] of this.gossips) {
      for (const [type, value] of m) {
        const v = value - GOSSIP_TYPES[type].decayPerDay;
        if (v < DISCARD_THRESHOLD) m.delete(type);
        else m.set(type, v);
      }
      if (!m.size) this.gossips.delete(target);
    }
  }

  /** vanilla store (Gossips) */
  save(): GossipEntry[] {
    return this.entries();
  }

  load(list: GossipEntry[]): void {
    this.gossips.clear();
    for (const e of list) {
      if (!(e.type in GOSSIP_TYPES) || typeof e.target !== 'string' || !(e.value >= DISCARD_THRESHOLD)) continue;
      this.getOrCreate(e.target).set(e.type, Math.min(e.value, GOSSIP_TYPES[e.type].max));
    }
  }
}
