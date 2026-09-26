// Regional ("local") difficulty (vanilla DifficultyInstance, Level.getCurrentDifficultyAt) and the chunk
// inhabited time it grows with (vanilla ServerChunkCache.tickChunks → LevelChunk.incrementInhabitedTime).

import type { Level } from './level';
import { moonPhase } from '../render/environment';

export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

const DIFFICULTY_ID: Record<Difficulty, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };
/** vanilla DimensionType.MOON_BRIGHTNESS_PER_PHASE */
const MOON_BRIGHTNESS = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];

const f32 = Math.fround;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** vanilla DifficultyInstance: the base difficulty scaled up by the world's age, the chunk's inhabited time and the moon */
export class DifficultyInstance {
  readonly effective: number;

  constructor(readonly base: Difficulty, levelTime: number, chunkInhabitedTime: number, moonPhaseFactor: number) {
    this.effective = DifficultyInstance.calculate(base, levelTime, chunkInhabitedTime, moonPhaseFactor);
  }

  /** vanilla calculateDifficulty (in floats, as vanilla works it out) */
  static calculate(base: Difficulty, levelTime: number, inhabited: number, moon: number): number {
    if (base === 'peaceful') return 0;
    const hard = base === 'hard';
    let f = 0.75;
    const f1 = f32(clamp(f32(f32(levelTime + -72000) / 1440000), 0, 1) * 0.25);
    f = f32(f + f1);
    let f2 = 0;
    f2 = f32(f2 + f32(clamp(f32(inhabited / 3600000), 0, 1) * (hard ? 1 : 0.75)));
    f2 = f32(f2 + clamp(f32(moon * 0.25), 0, f1));
    if (base === 'easy') f2 = f32(f2 * 0.5);
    f = f32(f + f2);
    return f32(DIFFICULTY_ID[base] * f);
  }

  /** vanilla isHard: effective difficulty of at least 3 */
  isHard(): boolean {
    return this.effective >= 3;
  }

  isHarderThan(f: number): boolean {
    return this.effective > f;
  }

  /** vanilla getSpecialMultiplier: 0 below 2, 1 above 4, linear in between (the "// 0.xx" of F3's Local Difficulty) */
  specialMultiplier(): number {
    if (this.effective < 2) return 0;
    return this.effective > 4 ? 1 : (this.effective - 2) / 2;
  }
}

/** vanilla Level.getMoonBrightness: the phase comes from the level's own day time, fixed-time dimensions too */
export function moonBrightness(level: Level): number {
  return MOON_BRIGHTNESS[moonPhase(level.dayTime)];
}

/** vanilla Level.getCurrentDifficultyAt: the moon and the inhabited time only count where the chunk is loaded */
export function currentDifficultyAt(level: Level, x: number, _y: number, z: number): DifficultyInstance {
  const c = level.world.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
  return new DifficultyInstance(level.difficulty, level.dayTime, c ? c.inhabitedTime : 0, c ? moonBrightness(level) : 0);
}

/** inhabited time between saves after which a chunk is marked for saving (the port saves only changed chunks) */
const INHABITED_SAVE_STEP = 72000;

/**
 * vanilla ServerChunkCache.tickChunks: every loaded, entity-ticking chunk within a player's spawning range (8
 * chunks) whose centre is within 128 blocks of that player (not a spectator) is inhabited for one more tick (once,
 * however many players are near), whatever the mob spawning rule says
 */
export function tickInhabitedTime(level: Level): void {
  const r = Math.min(8, level.simulationDistance);
  const players = level.players();
  const done = players.length > 1 ? new Set<object>() : null;
  for (const p of players) {
    if (p.gameMode === 'spectator') continue;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const ox = cx * 16 + 8 - p.x, oz = cz * 16 + 8 - p.z;
        if (ox * ox + oz * oz >= 16384) continue;
        const c = level.world.getChunk(cx, cz);
        if (!c) continue;
        if (done) {
          if (done.has(c)) continue;
          done.add(c);
        }
        c.inhabitedTime++;
        if (c.inhabitedTime % INHABITED_SAVE_STEP === 0) c.modified = true;
      }
  }
}
