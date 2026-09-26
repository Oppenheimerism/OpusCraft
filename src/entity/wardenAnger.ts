// The warden's anger (vanilla AngerManagement and AngerLevel): how angry it is at each suspect, one to 150. A
// vibration from someone, bumping into it or being sniffed out adds 35 (a shot's owner 10, a hit 100); every second
// it cools by one, and a suspect it can no longer target is forgotten. The suspects are kept in order: those it's
// angry at (80 or more) first, then players, then the angriest; the first it may target is the one it goes after.
// Saved by uuid, a suspect is found again once it's back in the level.

import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';

/** vanilla AngerLevel: calm (0), agitated (40), angry (80), with its ambient and listening sounds */
export type AngerLevel = 'calm' | 'agitated' | 'angry';

/** vanilla AngerLevel.getMinimumAnger */
export const MINIMUM_ANGER: Record<AngerLevel, number> = { calm: 0, agitated: 40, angry: 80 };
/** vanilla AngerLevel.getAmbientSound */
export const AMBIENT_SOUND: Record<AngerLevel, string> = { calm: 'entity.warden.ambient', agitated: 'entity.warden.agitated', angry: 'entity.warden.angry' };
/** vanilla AngerLevel.getListeningSound */
export const LISTENING_SOUND: Record<AngerLevel, string> = { calm: 'entity.warden.listening', agitated: 'entity.warden.listening_angry', angry: 'entity.warden.listening_angry' };

/** vanilla AngerLevel.byAnger: the highest level whose minimum it reaches */
export function angerLevelOf(anger: number): AngerLevel {
  return anger >= 80 ? 'angry' : anger >= 40 ? 'agitated' : 'calm';
}

/** vanilla AngerManagement.MAX_ANGER */
export const MAX_ANGER = 150;
/** vanilla AngerManagement.CONVERSION_DELAY: how often (in its seconds) saved suspects are looked for */
const CONVERSION_DELAY = 2;

export class AngerManagement {
  /** vanilla conversionDelay: a random 0 to 2 at first */
  private conversionDelay = Math.floor(Math.random() * 3);
  /** vanilla highestAnger: as the last sort found it */
  highestAnger = 0;
  /** vanilla suspects: in the sorter's order (one whose anger ran out stays listed, as in vanilla) */
  readonly suspects: Entity[] = [];
  readonly angerBySuspect = new Map<Entity, number>();
  /** vanilla angerByUuid: saved suspects not yet found in the level */
  readonly angerByUuid = new Map<string, number>();

  /** `filter`: vanilla's Warden::canTargetEntity, which picks the active suspect */
  constructor(private readonly filter: (e: Entity) => boolean, byUuid: [string, number][] = []) {
    for (const [u, a] of byUuid) this.angerByUuid.set(u, a);
  }

  /**
   * vanilla AngerManagement.tick (once a second): saved suspects found again every other time, then each suspect a
   * point calmer (gone at one, or when it can't be targeted or is dead), and the order made again
   */
  tick(level: Level, predicate: (e: Entity) => boolean): void {
    if (--this.conversionDelay <= 0) {
      this.convertFromUuids(level);
      this.conversionDelay = CONVERSION_DELAY;
    }
    for (const [e, a] of this.angerBySuspect) {
      if (a <= 1 || !predicate(e) || !isAlive(e)) this.angerBySuspect.delete(e);
      else this.angerBySuspect.set(e, a - 1);
    }
    for (const [u, a] of this.angerByUuid) {
      if (a <= 1) this.angerByUuid.delete(u);
      else this.angerByUuid.set(u, a - 1);
    }
    this.sortAndUpdateHighestAnger();
  }

  /**
   * vanilla sortAndUpdateHighestAnger: the suspects sorted (vanilla Sorter: the angry first, then players, then the
   * angriest), the highest anger noted as the sort compares them (just the one's, with one suspect)
   */
  private sortAndUpdateHighestAnger(): void {
    this.highestAnger = 0;
    this.suspects.sort((a, b) => {
      if (a === b) return 0;
      const i = this.angerBySuspect.get(a) ?? 0, j = this.angerBySuspect.get(b) ?? 0;
      this.highestAnger = Math.max(this.highestAnger, i, j);
      const fa = angerLevelOf(i) === 'angry', fb = angerLevelOf(j) === 'angry';
      if (fa !== fb) return fa ? -1 : 1;
      const pa = a.type === 'player', pb = b.type === 'player';
      if (pa !== pb) return pa ? -1 : 1;
      return j - i;
    });
    if (this.suspects.length === 1) this.highestAnger = this.angerBySuspect.get(this.suspects[0]) ?? 0;
  }

  /** vanilla convertFromUuids: the saved suspects that are about again become suspects once more */
  private convertFromUuids(level: Level): void {
    for (const [u, a] of this.angerByUuid) {
      const e = entityByUuid(level, u);
      if (!e) continue;
      this.angerBySuspect.set(e, a);
      this.suspects.push(e);
      this.angerByUuid.delete(u);
    }
  }

  /**
   * vanilla increaseAnger: `offset` more anger at `e` (at most 150); a new suspect takes on any anger saved against
   * its uuid. The anger it's at now
   */
  increaseAnger(e: Entity, offset: number): number {
    const fresh = !this.angerBySuspect.has(e);
    let i = Math.min(MAX_ANGER, (this.angerBySuspect.get(e) ?? 0) + offset);
    this.angerBySuspect.set(e, i);
    if (fresh) {
      const j = e.hasUuid ? (this.angerByUuid.get(e.uuid) ?? 0) : 0;
      if (e.hasUuid) this.angerByUuid.delete(e.uuid);
      i += j;
      this.angerBySuspect.set(e, i);
      this.suspects.push(e);
    }
    this.sortAndUpdateHighestAnger();
    return i;
  }

  /** vanilla clearAnger */
  clearAnger(e: Entity): void {
    this.angerBySuspect.delete(e);
    const k = this.suspects.indexOf(e);
    if (k >= 0) this.suspects.splice(k, 1);
    this.sortAndUpdateHighestAnger();
  }

  /** vanilla getTopSuspect: the first suspect it may target */
  private topSuspect(): Entity | null {
    return this.suspects.find(this.filter) ?? null;
  }

  /** vanilla getActiveAnger: its anger at `e`, or with no one in mind the highest */
  getActiveAnger(e: Entity | null): number {
    return e === null ? this.highestAnger : (this.angerBySuspect.get(e) ?? 0);
  }

  /** vanilla getActiveEntity: the top suspect, if it's living */
  getActiveEntity(): LivingEntity | null {
    const e = this.topSuspect();
    return e instanceof LivingEntity ? e : null;
  }

  /** vanilla AngerManagement.codec's suspects: each suspect's uuid and anger, then those still only known by uuid */
  save(): string {
    const list: { uuid: string; anger: number }[] = [];
    for (const e of this.suspects) list.push({ uuid: e.uuid, anger: this.angerBySuspect.get(e) ?? 0 });
    for (const [uuid, anger] of this.angerByUuid) list.push({ uuid, anger });
    return JSON.stringify({ suspects: list });
  }

  /** the suspects of a saved warden (by uuid until they're found) */
  static load(filter: (e: Entity) => boolean, text: unknown): AngerManagement {
    let pairs: [string, number][] = [];
    if (typeof text === 'string') {
      try {
        const d = JSON.parse(text) as { suspects?: { uuid?: unknown; anger?: unknown }[] };
        pairs = (d.suspects ?? []).filter((s) => typeof s.uuid === 'string' && typeof s.anger === 'number').map((s) => [s.uuid as string, s.anger as number]);
      } catch {
        // (anger that can't be read is forgotten)
      }
    }
    return new AngerManagement(filter, pairs);
  }
}

/** vanilla Entity.isAlive */
function isAlive(e: Entity): boolean {
  return !e.removed && (!(e instanceof LivingEntity) || e.isAlive);
}

/** vanilla ServerLevel.getEntity(UUID): the one of that uuid in the level (the player too) */
function entityByUuid(level: Level, uuid: string): Entity | null {
  const p = level.players().find((q) => q.hasUuid && q.uuid === uuid);
  if (p) return p;
  return level.entities.find((e) => !e.removed && e.hasUuid && e.uuid === uuid) ?? null;
}
