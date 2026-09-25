// Who hears a game event (vanilla GameEventDispatcher, EuclideanGameEventListenerRegistry and GameEventListener). Sculk
// sensors, shriekers and catalysts listen from their block entities, which go on their chunk's register as they're
// made (placed or loaded) and come off it once they're gone; a warden listens from wherever it is. An event reaches
// the listeners in the sections its own radius spans (16 blocks, a shriek's 32) whose listening range takes in the
// block it happened in. Most take it in there and then; catalysts (vanilla DeliveryMode.BY_DISTANCE) hear it after
// the rest, the nearest first, so that only the nearest of them takes a dying mob's experience.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import { GAME_EVENT_RADIUS, type GameEventName, type GameEventContext } from './gameEvents';

/** vanilla GameEventListener */
export interface GameEventListener {
  /** vanilla getListenerSource().getPosition: where it listens from (null: nowhere just now) */
  listenerPosition(level: Level): [number, number, number] | null;
  /** vanilla getListenerRadius */
  listenerRadius(): number;
  /** vanilla DeliveryMode.BY_DISTANCE: it hears after the rest, the nearest first */
  readonly byDistance?: boolean;
  /** vanilla handleGameEvent: true if it took any notice */
  handleGameEvent(level: Level, event: GameEventName, ctx: GameEventContext, x: number, y: number, z: number): boolean;
}

/** a block entity that listens (vanilla GameEventListener.Provider) */
export interface ListeningBlockEntity {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  removed: boolean;
  readonly listener: GameEventListener;
}

/**
 * vanilla LevelChunk's listener registries: the listening block entities of every world by chunk (an event only
 * reaches those its level's world holds)
 */
const BLOCK_LISTENERS = new Map<number, Set<ListeningBlockEntity>>();
const chunkKey = (cx: number, cz: number): number => (cx + 0x200000) * 0x400000 + (cz + 0x200000);

/** vanilla LevelChunk.addGameEventListener: a listening block entity was made */
export function registerBlockListener(be: ListeningBlockEntity): void {
  const k = chunkKey(be.x >> 4, be.z >> 4);
  let set = BLOCK_LISTENERS.get(k);
  if (!set) BLOCK_LISTENERS.set(k, (set = new Set()));
  set.add(be);
}

/** the listening block entity of `level` at (x, y, z), even one that has just gone (a shrieker broken mid-shriek) */
export function blockListenerAt<T extends ListeningBlockEntity>(level: Level, x: number, y: number, z: number, is: (be: ListeningBlockEntity) => be is T): T | null {
  const set = BLOCK_LISTENERS.get(chunkKey(x >> 4, z >> 4));
  if (!set) return null;
  let gone: T | null = null;
  for (const be of set) {
    if (be.x !== x || be.y !== y || be.z !== z || !is(be)) continue;
    if ((level.world.getBlockEntity(x, y, z) as unknown) === be) return be;
    if (be.removed && (be as { level?: Level | null }).level === level) gone = be;
  }
  return gone;
}

interface EntityListener {
  entity: Entity;
  listener: GameEventListener;
  /** the section its feet were in when it last moved on the register, and the one it listens in (vanilla lastSection) */
  feet: [number, number, number] | null;
  section: [number, number, number] | null;
}

/** vanilla DynamicGameEventListener: the listeners that go about with an entity (a warden's), by level */
const ENTITY_LISTENERS = new WeakMap<Level, Set<EntityListener>>();

/** vanilla Entity.updateDynamicGameEventListener: `entity` listens from now on (till it's removed) */
export function registerEntityListener(level: Level, entity: Entity, listener: GameEventListener): void {
  let set = ENTITY_LISTENERS.get(level);
  if (!set) ENTITY_LISTENERS.set(level, (set = new Set()));
  for (const l of set) if (l.entity === entity && l.listener === listener) return;
  set.add({ entity, listener, feet: null, section: null });
}

/**
 * vanilla GameEventDispatcher.post: `event` happened at (x, y, z); each listener in reach hears it (a listener's
 * reach: its block within its radius of the event's block, vanilla getPostableListenerPosition)
 */
export function postGameEvent(level: Level, event: GameEventName, x: number, y: number, z: number, ctx: GameEventContext): void {
  const r = GAME_EVENT_RADIUS[event] ?? 16;
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const cx0 = (bx - r) >> 4, cx1 = (bx + r) >> 4, cz0 = (bz - r) >> 4, cz1 = (bz + r) >> 4;
  const sy0 = (by - r) >> 4, sy1 = (by + r) >> 4;
  const queued: { d: number; l: GameEventListener }[] = [];
  const visit = (l: GameEventListener): void => {
    const p = l.listenerPosition(level);
    if (!p) return;
    const dx = Math.floor(p[0]) - bx, dy = Math.floor(p[1]) - by, dz = Math.floor(p[2]) - bz;
    const rr = l.listenerRadius();
    if (dx * dx + dy * dy + dz * dz > rr * rr) return;
    if (l.byDistance) queued.push({ d: (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2, l });
    else l.handleGameEvent(level, event, ctx, x, y, z);
  };
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const set = BLOCK_LISTENERS.get(chunkKey(cx, cz));
      if (!set) continue;
      for (const be of set) {
        if (be.removed) {
          set.delete(be);
          continue;
        }
        const sy = be.y >> 4;
        if (sy < sy0 || sy > sy1 || (level.world.getBlockEntity(be.x, be.y, be.z) as unknown) !== be) continue;
        visit(be.listener);
      }
      if (!set.size) BLOCK_LISTENERS.delete(chunkKey(cx, cz));
    }
  const moving = ENTITY_LISTENERS.get(level);
  if (moving)
    for (const el of moving) {
      const e = el.entity;
      if (e.removed || e.level !== level) {
        moving.delete(el);
        continue;
      }
      // vanilla DynamicGameEventListener.move: each time its feet cross into another section, it goes on the register
      // of the section its listener is in just then (a warden's, the one its head is in)
      const fx = Math.floor(e.x) >> 4, fy = Math.floor(e.y) >> 4, fz = Math.floor(e.z) >> 4;
      if (!el.feet || el.feet[0] !== fx || el.feet[1] !== fy || el.feet[2] !== fz) {
        el.feet = [fx, fy, fz];
        const p = el.listener.listenerPosition(level);
        if (p) el.section = [Math.floor(p[0]) >> 4, Math.floor(p[1]) >> 4, Math.floor(p[2]) >> 4];
      }
      const s = el.section;
      if (!s || s[0] < cx0 || s[0] > cx1 || s[2] < cz0 || s[2] > cz1 || s[1] < sy0 || s[1] > sy1) continue;
      visit(el.listener);
    }
  // vanilla handleGameEventMessagesInQueue: the BY_DISTANCE listeners, the nearest first
  if (queued.length) {
    queued.sort((a, b) => a.d - b.d);
    for (const q of queued) q.l.handleGameEvent(level, event, ctx, x, y, z);
  }
}
