// Advancements on the wire (vanilla ClientboundUpdateAdvancementsPacket). A player's advancements are its server's to
// keep, a host's guests' too (net/server/guestProgress.ts), and a guest is told its progress as it changes: each
// advancement whose criteria changed, with all the criteria it has now. The advancements themselves are this build's own
// (the host and its guests run the same one), so only the progress goes; a guest works out what's visible itself, as
// it shows its advancements screen.

import type { Value } from './codec';
import { ADVANCEMENTS, type AdvancementDef, type PlayerAdvancements } from '../game/advancements';

/** CB.UpdateAdvancements's entries: [advancement id, the criteria it has] */
export type ProgressEntry = [string, string[]];

/**
 * (the host) vanilla PlayerAdvancements.flushDirty: what changed in `adv` since the guest was told `told` (each
 * advancement's criteria, sorted and joined), `told` brought up to date. An advancement with nothing left (none of this
 * game's commands take criteria away, but a reset would) goes with no criteria
 */
export function progressChanges(adv: PlayerAdvancements, told: Map<string, string>): ProgressEntry[] {
  const out: ProgressEntry[] = [];
  for (const [id, got] of adv.progress) {
    const list = [...got].sort(), key = list.join(',');
    if ((told.get(id) ?? '') === key) continue;
    if (key) told.set(id, key);
    else told.delete(id);
    out.push([id, list]);
  }
  for (const id of [...told.keys()])
    if (!adv.progress.get(id)?.size) {
      told.delete(id);
      out.push([id, []]);
    }
  return out;
}

/**
 * (a guest) the host's entries, checked: each an advancement this game has, with criteria that advancement has; null if
 * any isn't (the host isn't running this game)
 */
export function readProgress(entries: Value[]): [AdvancementDef, string[]][] | null {
  const out: [AdvancementDef, string[]][] = [];
  for (const e of entries) {
    const [id, criteria] = e as [string, string[]];
    // (a Map, so "__proto__" and the like are no advancement; the criteria a plain object's own keys)
    const a = ADVANCEMENTS.get(id);
    if (!a || !criteria.every((c) => Object.prototype.hasOwnProperty.call(a.criteria, c))) return null;
    out.push([a, criteria]);
  }
  return out;
}

/**
 * (a guest) vanilla ClientAdvancements.update: the host's word on its progress, put in its own advancements (all of it
 * afresh on `reset`, the first the host sends); the advancements it finished just now, for their toasts (none on the
 * reset: vanilla shows no toasts for what was done before it joined)
 */
export function applyProgress(adv: PlayerAdvancements, changes: [AdvancementDef, string[]][], reset: boolean): AdvancementDef[] {
  if (reset) adv.progress.clear();
  const done: AdvancementDef[] = [];
  for (const [a, criteria] of changes) {
    const was = adv.isDone(a);
    if (criteria.length) adv.progress.set(a.id, new Set(criteria));
    else adv.progress.delete(a.id);
    if (!reset && !was && adv.isDone(a)) done.push(a);
  }
  adv.version++;
  return done;
}
