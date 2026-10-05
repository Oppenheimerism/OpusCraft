// Sounds and particles across the connection (vanilla ServerLevel.playSeededSound / sendParticles): on the host the
// level's sinks play them here and pass them on to the guests near enough; a guest plays what it's told, if it's one
// of the particle calls it knows, with arguments that make sense.

import type { Value } from './codec';
import type { Level, ParticleSink, SoundSink } from '../game/level';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { FireworkExplosion, FireworkShape } from '../item/fireworks';
import { stateCount } from '../world/block';

/**
 * the particle calls that go across, and how many arguments each takes (numbers, but for a kind's name); those about
 * an entity (poof, emitAround) and a rocket's burst (fireworks) have their own shapes, below; those with callbacks in
 * them (vibration) and colour lists (dustTransition) stay on the host
 */
const PARTICLES: Record<string, { args: number[]; states: number[]; strings: number[] }> = {
  blockBreak: { args: [4], states: [3], strings: [] },
  blockHit: { args: [5], states: [3], strings: [] },
  spawn: { args: [7], states: [], strings: [0] },
  fallingDust: { args: [4], states: [], strings: [] },
  blockParticle: { args: [10], states: [6], strings: [] },
  dustPillar: { args: [8], states: [4], strings: [] },
  entityEffect: { args: [5], states: [], strings: [] },
  dust: { args: [7], states: [], strings: [] },
  spell: { args: [10, 11], states: [], strings: [0] },
  shriek: { args: [4], states: [], strings: [] },
  sculkCharge: { args: [7], states: [], strings: [] },
};

/** the particles round an entity, which go as its id (vanilla ClientboundEntityEventPacket's poof, the crit emitters) */
const EMIT_KINDS = new Set(['crit', 'enchanted_hit', 'totem_of_undying']);
const SHAPES = new Set<FireworkShape>(['small_ball', 'large_ball', 'star', 'creeper', 'burst']);

/** vanilla: sounds carry 16 blocks, more for loud ones (16 × volume) */
export function soundRange(volume: number): number {
  return Math.max(16, 16 * volume);
}
/** vanilla ServerLevel.sendParticles: to players within 32 blocks */
export const PARTICLE_RANGE = 32;

export interface EffectsOut {
  /** a sound at (x, y, z) for whoever is near enough (the host's own player hears it here) */
  sound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void;
  /** a sound for one player's ears */
  soundTo(p: Player, name: string, x: number, y: number, z: number, volume: number, pitch: number): void;
  /** a particle call at (x, y, z) for whoever is near enough */
  particles(method: string, args: Value[], x: number, y: number, z: number): void;
}

/**
 * the level's sinks, made to pass on what they play (the host's own sounds and particles still play here first);
 * returns a function that puts the old ones back
 */
export function broadcastEffects(level: Level, out: EffectsOut): () => void {
  const sound = level.sound, particles = level.particles;
  const own = () => level.player;
  // (the host's own player out of the level while the End Poem plays to it hears nothing of it: Player.wonGame)
  const s: SoundSink = {
    play(name, x, y, z, volume = 1, pitch = 1) {
      if (!own().wonGame) sound.play(name, x, y, z, volume, pitch);
      out.sound(name, x, y, z, volume, pitch);
    },
    playUI: (name, volume, pitch) => sound.playUI(name, volume, pitch),
    playTo(p, name, x, y, z, volume = 1, pitch = 1) {
      if (p !== own()) out.soundTo(p, name, x, y, z, volume, pitch);
      else if (!p.wonGame) sound.play(name, x, y, z, volume, pitch);
    },
    playJukeboxSong: sound.playJukeboxSong?.bind(sound),
    stopJukeboxSong: sound.stopJukeboxSong?.bind(sound),
  };
  const p = new Proxy(particles, {
    get(target, key, receiver) {
      const f = Reflect.get(target, key, receiver) as unknown;
      if (typeof f !== 'function' || typeof key !== 'string') return f;
      const call = (args: unknown[]) => (f as (...a: unknown[]) => void).apply(target, args);
      if (key === 'poof')
        return (e: Entity) => {
          call([e]);
          out.particles(key, [e.id], e.x, e.y, e.z);
        };
      if (key === 'emitAround')
        return (kind: string, e: Entity, life?: number) => {
          call(life === undefined ? [kind, e] : [kind, e, life]);
          out.particles(key, life === undefined ? [kind, e.id] : [kind, e.id, life], e.x, e.y, e.z);
        };
      if (key === 'fireworks')
        return (x: number, y: number, z: number, xd: number, yd: number, zd: number, explosions: readonly FireworkExplosion[]) => {
          call([x, y, z, xd, yd, zd, explosions]);
          const stars = explosions.slice(0, 64).map((e) => [e.shape, e.colors.slice(0, 64), e.fadeColors.slice(0, 64), e.hasTrail, e.hasTwinkle] as Value);
          if ([x, y, z, xd, yd, zd].every(Number.isFinite)) out.particles(key, [x, y, z, xd, yd, zd, stars], x, y, z);
        };
      if (!PARTICLES[key]) return f;
      return (...args: unknown[]) => {
        (f as (...a: unknown[]) => void).apply(target, args);
        if (args.every((a) => typeof a === 'number' || typeof a === 'string' || a === undefined)) {
          const sent = args.filter((a) => a !== undefined) as Value[];
          const at = key === 'spawn' || key === 'spell' ? 1 : 0;
          out.particles(key, sent, sent[at] as number, sent[at + 1] as number, sent[at + 2] as number);
        }
      };
    },
  });
  level.sound = s;
  level.particles = p;
  return () => {
    level.sound = sound;
    level.particles = particles;
  };
}

/**
 * play a particle call from the host on `sink`, if it's one that goes across and its arguments make sense (an entity
 * by the host's id, found among the guest's copies by `entity`)
 */
export function replayParticles(sink: ParticleSink, method: string, args: Value[], entity: (id: number) => Entity | null = () => null): boolean {
  if (method === 'poof' || method === 'emitAround') return replayAround(sink, method, args, entity);
  if (method === 'fireworks') return replayFireworks(sink, args);
  const spec = Object.prototype.hasOwnProperty.call(PARTICLES, method) ? PARTICLES[method] : undefined;
  if (!spec || !spec.args.includes(args.length)) return false;
  const n = stateCount();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (spec.strings.includes(i)) {
      if (typeof a !== 'string' || a.length > 64) return false;
    } else if (typeof a !== 'number' || !Number.isFinite(a)) return false;
    else if (spec.states.includes(i) && !(Number.isInteger(a) && a >= 0 && a < n)) return false;
  }
  if (method === 'blockHit' && !(Number.isInteger(args[4]) && (args[4] as number) >= 0 && (args[4] as number) < 6)) return false;
  const f = (sink as unknown as Record<string, unknown>)[method];
  if (typeof f !== 'function') return false;
  try {
    (f as (...a: Value[]) => void).apply(sink, args);
  } catch {
    // (a kind of particle this game has no sprite for, say: nothing shows)
  }
  return true;
}

/** poof(entity) and emitAround(kind, entity, lifetime?), the entity being the guest's copy of the host's */
function replayAround(sink: ParticleSink, method: 'poof' | 'emitAround', args: Value[], entity: (id: number) => Entity | null): boolean {
  const at = method === 'poof' ? 0 : 1;
  if (args.length !== (method === 'poof' ? 1 : 2) && !(method === 'emitAround' && args.length === 3)) return false;
  if (method === 'emitAround' && !(typeof args[0] === 'string' && EMIT_KINDS.has(args[0]))) return false;
  if (method === 'emitAround' && args.length === 3 && !(typeof args[2] === 'number' && Number.isInteger(args[2]) && args[2] >= 0 && args[2] <= 200)) return false;
  const id = args[at];
  if (typeof id !== 'number' || !Number.isInteger(id)) return false;
  const e = entity(id);
  if (!e) return true;
  try {
    if (method === 'poof') sink.poof?.(e);
    else sink.emitAround?.(args[0] as 'crit', e, args[2] as number | undefined);
  } catch {
    // (nothing shows)
  }
  return true;
}

/** fireworks(x, y, z, xd, yd, zd, stars): each star [shape, colours, fade colours, trail, twinkle] */
function replayFireworks(sink: ParticleSink, args: Value[]): boolean {
  if (args.length !== 7) return false;
  for (let i = 0; i < 6; i++) if (typeof args[i] !== 'number') return false;
  const stars = args[6];
  if (!Array.isArray(stars) || stars.length > 64) return false;
  const colours = (v: Value) => Array.isArray(v) && v.length <= 64 && v.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  const list: FireworkExplosion[] = [];
  for (const st of stars) {
    if (!Array.isArray(st) || st.length !== 5 || typeof st[0] !== 'string' || !SHAPES.has(st[0] as FireworkShape) || !colours(st[1]) || !colours(st[2]) || typeof st[3] !== 'boolean' || typeof st[4] !== 'boolean') return false;
    list.push({ shape: st[0] as FireworkShape, colors: [...(st[1] as number[])], fadeColors: [...(st[2] as number[])], hasTrail: st[3], hasTwinkle: st[4] });
  }
  const n = args as number[];
  try {
    sink.fireworks?.(n[0], n[1], n[2], n[3], n[4], n[5], list);
  } catch {
    // (nothing shows)
  }
  return true;
}
