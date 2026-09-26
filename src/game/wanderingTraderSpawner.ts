// The wandering trader's comings (vanilla WanderingTraderSpawner, one of the Overworld's custom spawners). Once a
// minute a day's wait counts down; when it's out, with trader spawning on, he may come: the first time at 25%, then
// 50% and 75% on the days after that he didn't, and each time only 1 in 10 of those. He comes to the village bell if
// there's one within 48 blocks of the player, else to the player, turning up on the surface up to 48 blocks off it
// where there's room for him, with two trader llamas on leads, forty minutes to stay and a wander back to where he
// was sent. The wait, the chance and the last one sent are kept with the world (vanilla level.dat).

import type { Level } from './level';
import { WanderingTrader } from '../entity/wanderingTrader';
import { TraderLlama } from '../entity/llama';
import { Mob, isValidEmptySpawnBlock } from '../entity/mob';
import { validSpawnBlock } from '../entity/monsters';
import { COLLISION, FLAGS, F_AIR, STATE_BLOCK } from '../world/block';
import { DYNAMIC_COLLISION } from '../entity/entity';
import { MAX_Y, MIN_Y } from '../world/constants';
import { Rand } from '../core/rng';
import { wrapDegrees } from '../core/math';

type Pos = [number, number, number];

/** vanilla WanderingTraderSpawner.DEFAULT_SPAWN_DELAY: a day between chances */
export const TRADER_SPAWN_DELAY = 24000;

/** (vanilla ServerLevelData's WanderingTraderSpawnDelay, WanderingTraderSpawnChance and WanderingTraderId) */
export interface WanderingTraderData {
  delay: number;
  chance: number;
  id?: string;
}

export class WanderingTraderSpawner {
  /** (vanilla RandomSource.create(): its own random, not the world's) */
  random = new Rand();
  private tickDelay = 1200;
  spawnDelay = TRADER_SPAWN_DELAY;
  spawnChance = 25;
  /** vanilla WanderingTraderId: the uuid of the last one sent (kept, as vanilla does, though nothing asks for it) */
  traderId: string | null = null;

  /** vanilla's constructor: a world that's never had the wait set starts with a day of it at 25% */
  load(d: WanderingTraderData | undefined): void {
    this.spawnDelay = d?.delay ?? 0;
    this.spawnChance = d?.chance ?? 0;
    this.traderId = d?.id ?? null;
    if (this.spawnDelay === 0 && this.spawnChance === 0) {
      this.spawnDelay = TRADER_SPAWN_DELAY;
      this.spawnChance = 25;
    }
  }

  save(): WanderingTraderData {
    return { delay: this.spawnDelay, chance: this.spawnChance, ...(this.traderId ? { id: this.traderId } : {}) };
  }

  /** vanilla tick (ticked with mob spawning on, in the Overworld): 1 when one came */
  tick(level: Level): number {
    if (level.world.dim.id !== 'overworld') return 0;
    if (!level.gameRules.doTraderSpawning) return 0;
    if (--this.tickDelay > 0) return 0;
    this.tickDelay = 1200;
    this.spawnDelay -= 1200;
    if (this.spawnDelay > 0) return 0;
    this.spawnDelay = TRADER_SPAWN_DELAY;
    if (!level.gameRules.doMobSpawning) return 0;
    const i = this.spawnChance;
    this.spawnChance = Math.max(25, Math.min(75, this.spawnChance + 25));
    if (this.random.nextInt(100) > i) return 0;
    if (!this.spawn(level)) return 0;
    this.spawnChance = 25;
    return 1;
  }

  /** vanilla spawn: true when he came (or there was nobody to come to) */
  private spawn(level: Level): boolean {
    // (vanilla ServerLevel.getRandomPlayer: a living one)
    const p = level.randomPlayer((q) => q.isAlive);
    if (!p) return true;
    if (this.random.nextInt(10) !== 0) return false;
    const at: Pos = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    // vanilla PoiManager.find(MEETING, 48 blocks, any): a village bell near the player (here the nearest)
    const bell = level.poi.findAll(at[0], at[1], at[2], 48, (k) => k === 'meeting', false)[0];
    const target: Pos = bell ? [bell[0], bell[1], bell[2]] : at;
    const pos = this.findSpawnPositionNear(level, target, 48);
    if (!pos || !hasEnoughSpace(level, pos)) return false;
    // (vanilla #without_wandering_trader_spawns is the void alone, which no Overworld here has)
    const t = new WanderingTrader(level);
    place(level, t, pos);
    t.finalizeSpawn('event');
    level.addEntity(t);
    for (let j = 0; j < 2; j++) this.tryToSpawnLlamaFor(level, t, 4);
    this.traderId = t.uuid;
    t.despawnDelay = 48000;
    t.wanderTarget = target;
    t.restrictTo(target[0], target[1], target[2], 16);
    return true;
  }

  /** vanilla tryToSpawnLlamaFor: a trader llama somewhere near him, on his lead */
  private tryToSpawnLlamaFor(level: Level, t: WanderingTrader, max: number): void {
    const pos = this.findSpawnPositionNear(level, [Math.floor(t.x), Math.floor(t.y), Math.floor(t.z)], max);
    if (!pos) return;
    const l = new TraderLlama(level);
    place(level, l, pos);
    l.finalizeSpawn('event');
    level.addEntity(l);
    l.setLeashedTo(t);
  }

  /**
   * vanilla findSpawnPositionNear: ten tries at a column up to `max` blocks off each way, on its surface (vanilla
   * Heightmap WORLD_SURFACE: over the top block that isn't air, water and leaves included), where one could stand
   */
  private findSpawnPositionNear(level: Level, [x0, , z0]: Pos, max: number): Pos | null {
    const w = level.world;
    for (let i = 0; i < 10; i++) {
      const x = x0 + this.random.nextInt(max * 2) - max;
      const z = z0 + this.random.nextInt(max * 2) - max;
      // (vanilla Level.getHeight: the bottom of the world for a column not loaded)
      const y = w.isLoaded(x, z) ? worldSurface(level, x, z) : MIN_Y;
      // vanilla SpawnPlacementTypes.ON_GROUND.isSpawnPositionOk
      if (validSpawnBlock(level, x, y - 1, z) && isValidEmptySpawnBlock(w.getState(x, y, z)) && isValidEmptySpawnBlock(w.getState(x, y + 1, z))) return [x, y, z];
    }
    return null;
  }
}

/** vanilla Heightmap WORLD_SURFACE: over the highest block that isn't air */
function worldSurface(level: Level, x: number, z: number): number {
  const w = level.world;
  let y = w.heightAt(x, z);
  while (y < MAX_Y && !(FLAGS[w.getState(x, y, z)] & F_AIR)) y++;
  while (y > MIN_Y && FLAGS[w.getState(x, y - 1, z)] & F_AIR) y--;
  return y;
}

/** vanilla hasEnoughSpace: nothing to bump into in the two by three by two blocks from the spot up */
function hasEnoughSpace(level: Level, [x, y, z]: Pos): boolean {
  const w = level.world;
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 2; dy++)
      for (let dz = 0; dz <= 1; dz++) {
        const st = w.getState(x + dx, y + dy, z + dz);
        const boxes = COLLISION[st] ?? DYNAMIC_COLLISION[STATE_BLOCK[st]]?.(w, x + dx, y + dy, z + dz, st);
        if (boxes && boxes.length) return false;
      }
  return true;
}

/** vanilla EntityType.spawn: in the middle of the block, facing any way */
function place(level: Level, m: Mob, [x, y, z]: Pos): void {
  const yaw = wrapDegrees(level.random.nextFloat() * 360);
  m.moveTo(x + 0.5, y, z + 0.5, yaw, 0);
  m.headYaw = m.bodyYaw = yaw;
}
