// The join code: a world opened to LAN gets a new one each time, shown on the host's screen, and a guest's hello must
// carry it (vanilla's LAN worlds need none: anyone on the network who can see one can join; here the network may be a
// school's, so the host says who may come in by telling them the code). The host's game checks it, and makes a place
// that keeps getting it wrong wait before it tries again, so it can't be guessed.

import { JOIN_CODE_FREE_TRIES, JOIN_CODE_WAIT_TICKS, JOIN_CODE_MAX_WAIT_TICKS, JOIN_CODE_WRONG_WINDOW_TICKS, JOIN_CODE_MAX_WRONG } from './config';

/** Crockford's base 32 (no I, L, O or U: read out and typed without mixing them up) */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 8 of them: 40 bits, a trillion codes */
export const JOIN_CODE_LENGTH = 8;

/** a new code, from the browser's secure random numbers */
export function newJoinCode(): string {
  const b = new Uint8Array(JOIN_CODE_LENGTH);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += ALPHABET[x & 31];
  return s;
}

/** a code as typed or pasted: its case, spaces and dashes don't matter, and I, L and O are read as 1, 1 and 0 */
export function normalizeJoinCode(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').slice(0, 32);
}

/** a code as it's shown: two halves, easier to read out (ABCD-EFGH) */
export function showJoinCode(c: string): string {
  return c.length === JOIN_CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** whether `given` is `code` (compared in full every time: how long it takes says nothing about how much of it was right) */
function sameCode(given: string, code: string): boolean {
  const a = normalizeJoinCode(given);
  let diff = a.length ^ code.length;
  for (let i = 0; i < code.length; i++) diff |= (a.charCodeAt(i) || 0) ^ code.charCodeAt(i);
  return diff === 0;
}

/**
 * the host's check of the codes guests give, by where each connects from: JOIN_CODE_FREE_TRIES wrong ones in a row,
 * and that place waits JOIN_CODE_WAIT_TICKS before it may try again, twice as long after each further wrong one (up to
 * JOIN_CODE_MAX_WAIT_TICKS); a right one clears its count. And however many places they come from, once there have
 * been JOIN_CODE_MAX_WRONG wrong ones in JOIN_CODE_WRONG_WINDOW_TICKS, everyone waits till there are fewer. While a
 * place waits, what it gives isn't looked at, so trying then tells it nothing.
 */
export class JoinCodeGuard {
  private readonly places = new Map<string, { wrong: number; until: number }>();
  private readonly wrongAt: number[] = [];

  constructor(readonly code: string) {}

  /** `given` from `place` at tick `now`: 'ok', 'wrong', or how many ticks it must wait before trying again */
  check(place: string, given: string, now: number): 'ok' | 'wrong' | number {
    while (this.wrongAt.length && now - this.wrongAt[0] >= JOIN_CODE_WRONG_WINDOW_TICKS) this.wrongAt.shift();
    const p = this.places.get(place);
    if (p && now < p.until) return p.until - now;
    if (this.wrongAt.length >= JOIN_CODE_MAX_WRONG) return this.wrongAt[0] + JOIN_CODE_WRONG_WINDOW_TICKS - now;
    if (sameCode(given, this.code)) {
      this.places.delete(place);
      return 'ok';
    }
    this.wrongAt.push(now);
    const q = p ?? { wrong: 0, until: 0 };
    q.wrong++;
    if (q.wrong >= JOIN_CODE_FREE_TRIES) q.until = now + Math.min(JOIN_CODE_MAX_WAIT_TICKS, JOIN_CODE_WAIT_TICKS * 2 ** (q.wrong - JOIN_CODE_FREE_TRIES));
    // (the places remembered are kept to a number: the oldest forgotten first)
    this.places.delete(place);
    this.places.set(place, q);
    if (this.places.size > 1024) this.places.delete(this.places.keys().next().value!);
    return 'wrong';
  }
}
