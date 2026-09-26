// Sounds and particles across the connection (vanilla ServerLevel.playSeededSound / sendParticles): on the host the
// level's sinks play them here and pass them on to the guests near enough; a guest plays what it's told, if it's one
// of the particle calls it knows, with arguments that make sense.

import type { Value } from './codec';
import type { Level, ParticleSink, SoundSink } from '../game/level';
import type { Player } from '../entity/player';
import { stateCount } from '../world/block';

/**
 * the particle calls that go across, and how many arguments each takes (numbers, but for a kind's name); those with
 * entities or callbacks in them (poof, emitAround, vibration, fireworks) wait for entities to go across (stage 2)
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
  const s: SoundSink = {
    play(name, x, y, z, volume = 1, pitch = 1) {
      sound.play(name, x, y, z, volume, pitch);
      out.sound(name, x, y, z, volume, pitch);
    },
    playUI: (name, volume, pitch) => sound.playUI(name, volume, pitch),
    playTo(p, name, x, y, z, volume = 1, pitch = 1) {
      if (p === own()) sound.play(name, x, y, z, volume, pitch);
      else out.soundTo(p, name, x, y, z, volume, pitch);
    },
    playJukeboxSong: sound.playJukeboxSong?.bind(sound),
    stopJukeboxSong: sound.stopJukeboxSong?.bind(sound),
  };
  const p = new Proxy(particles, {
    get(target, key, receiver) {
      const f = Reflect.get(target, key, receiver) as unknown;
      if (typeof f !== 'function' || typeof key !== 'string' || !PARTICLES[key]) return f;
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

/** play a particle call from the host on `sink`, if it's one that goes across and its arguments make sense */
export function replayParticles(sink: ParticleSink, method: string, args: Value[]): boolean {
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
