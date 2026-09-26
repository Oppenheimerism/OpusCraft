// Cats about villages and swamp huts (vanilla CatSpawner, one of the overworld's custom spawners): once a minute,
// with mob spawning on, it picks a spot 8 to 31 blocks off along each axis from the player, at their feet's height,
// and if a cat could stand there (with the chunks ten blocks round loaded): near a village (two sections) where more
// than four beds are claimed within 48 blocks and fewer than five cats are about, a stray cat turns up; in a swamp
// hut with no cat in it, one does (the all-black one).

import type { Level } from './level';
import { Cat, catHooks } from '../entity/cat';
import { isValidEmptySpawnBlock } from '../entity/mob';
import { validSpawnBlock } from '../entity/monsters';
import { AABB } from '../core/aabb';

export class CatSpawner {
  /** ticks to the next try (vanilla nextTick: not saved, so the first try comes as the world loads) */
  nextTick = 0;

  /** vanilla tick (from ServerChunkCache.tickChunks, with mob spawning on): how many cats it spawned */
  tick(level: Level): number {
    // (vanilla registers it for the overworld only)
    if (level.world.dim.id !== 'overworld') return 0;
    if (--this.nextTick > 0) return 0;
    this.nextTick = 1200;
    // (vanilla ServerLevel.getRandomPlayer: a living one)
    const p = level.randomPlayer((q) => q.isAlive);
    if (!p) return 0;
    const r = level.random;
    const i = (8 + r.nextInt(24)) * (r.nextBool() ? -1 : 1);
    const j = (8 + r.nextInt(24)) * (r.nextBool() ? -1 : 1);
    const x = Math.floor(p.x) + i, y = Math.floor(p.y), z = Math.floor(p.z) + j;
    const w = level.world;
    for (let cx = (x - 10) >> 4; cx <= (x + 10) >> 4; cx++) for (let cz = (z - 10) >> 4; cz <= (z + 10) >> 4; cz++) if (!w.getChunk(cx, cz)) return 0;
    // vanilla NaturalSpawner.isSpawnPositionOk(ON_GROUND)
    if (!validSpawnBlock(level, x, y - 1, z) || !isValidEmptySpawnBlock(w.getState(x, y, z)) || !isValidEmptySpawnBlock(w.getState(x, y + 1, z))) return 0;
    if (level.poi.sectionsToVillage(x >> 4, y >> 4, z >> 4) <= 2) return this.spawnInVillage(level, x, y, z);
    if (catHooks.inSwampHut(level, x, y, z)) return this.spawnInHut(level, x, y, z);
    return 0;
  }

  /** the cats in a box `h` blocks each way across and `v` up and down about a block */
  private catsNear(level: Level, x: number, y: number, z: number, h: number, v: number): number {
    return level.getEntities(new AABB(x - h, y - v, z - h, x + 1 + h, y + 1 + v, z + 1 + h), (e) => e instanceof Cat).length;
  }

  private spawnInVillage(level: Level, x: number, y: number, z: number): number {
    const beds = level.poi.findAll(x, y, z, 48, (k) => k === 'home', false).filter(([bx, by, bz]) => level.poi.isOccupied(bx, by, bz)).length;
    if (beds > 4 && this.catsNear(level, x, y, z, 48, 8) < 5) return this.spawnCat(level, x, y, z);
    return 0;
  }

  private spawnInHut(level: Level, x: number, y: number, z: number): number {
    return this.catsNear(level, x, y, z, 16, 8) < 1 ? this.spawnCat(level, x, y, z) : 0;
  }

  private spawnCat(level: Level, x: number, y: number, z: number): number {
    const c = new Cat(level);
    c.moveTo(x + 0.5, y, z + 0.5, 0, 0);
    c.finalizeSpawn('natural');
    level.addEntity(c);
    return 1;
  }
}
