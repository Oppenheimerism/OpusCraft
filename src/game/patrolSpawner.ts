// Pillager patrols (vanilla PatrolSpawner, one of the overworld's custom spawners): every ten minutes or so of play
// (12000 ticks and up to a minute more, the first check straight after the world loads) from the fifth day on, by
// day, one time in five, a patrol forms 24 to 47 blocks off along each axis from the player — not near a village
// (two sections), not in the mushroom fields, and only where the chunks ten blocks round are loaded. It's a captain
// with the ominous banner, leading the way to a far-off point, and as many pillagers again as the local difficulty
// rounded up, each a few blocks from the last, all on the surface; a spot that's too bright (block light over 8),
// too cramped or without a floor is skipped, and without its captain there's no patrol at all. (As in vanilla, the
// captain's first target is picked before it's put in place, so it lies within 500 blocks of the world's origin.)

import type { Level } from './level';
import { Pillager } from '../entity/illagers';
import { motionBlockingNoLeaves } from '../entity/raider';
import { isValidEmptySpawnBlock } from '../entity/mob';
import { validSpawnBlock } from '../entity/monsters';
import { currentDifficultyAt } from './difficulty';
import { BIOMES } from '../world/gen/biomes';

/** vanilla #without_patrol_spawns */
const WITHOUT_PATROL_SPAWNS = new Set(['mushroom_fields']);

export class PatrolSpawner {
  /** ticks to the next try (vanilla nextTick: not saved, so the first try comes as the world loads) */
  nextTick = 0;

  /** vanilla tick (from ServerChunkCache.tickChunks, with mob spawning on): how many it tried to spawn */
  tick(level: Level, spawnEnemies: boolean): number {
    if (!spawnEnemies || !level.gameRules.doPatrolSpawning) return 0;
    // (vanilla registers it for the overworld only)
    if (level.world.dim.id !== 'overworld') return 0;
    const r = level.random;
    if (--this.nextTick > 0) return 0;
    this.nextTick += 12000 + r.nextInt(1200);
    if (Math.floor(level.dayTime / 24000) < 5 || !level.isDay()) return 0;
    if (r.nextInt(5) !== 0) return 0;
    const p = level.player;
    if (!p || p.gameMode === 'spectator') return 0;
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    // vanilla ServerLevel.isCloseToVillage(pos, 2)
    if (level.poi.sectionsToVillage(px >> 4, py >> 4, pz >> 4) <= 2) return 0;
    const k = (24 + r.nextInt(24)) * (r.nextBool() ? -1 : 1);
    const l = (24 + r.nextInt(24)) * (r.nextBool() ? -1 : 1);
    let x = px + k, y = py, z = pz + l;
    // vanilla hasChunksAt(x - 10, z - 10, x + 10, z + 10)
    for (let cx = (x - 10) >> 4; cx <= (x + 10) >> 4; cx++) for (let cz = (z - 10) >> 4; cz <= (z + 10) >> 4; cz++) if (!level.world.getChunk(cx, cz)) return 0;
    if (WITHOUT_PATROL_SPAWNS.has(BIOMES[level.world.getBiome3(x, y, z)]?.name ?? '')) return 0;
    let n = 0;
    const size = Math.ceil(currentDifficultyAt(level, x, y, z).effective) + 1;
    for (let i = 0; i < size; i++) {
      n++;
      y = motionBlockingNoLeaves(level, x, z);
      if (i === 0) {
        if (!this.spawnPatrolMember(level, x, y, z, true)) break;
      } else this.spawnPatrolMember(level, x, y, z, false);
      x += r.nextInt(5) - r.nextInt(5);
      z += r.nextInt(5) - r.nextInt(5);
    }
    return n;
  }

  /** vanilla spawnPatrolMember: a pillager here, if the spot will take one (isValidEmptySpawnBlock and checkPatrollingMonsterSpawnRules) */
  private spawnPatrolMember(level: Level, x: number, y: number, z: number, leader: boolean): boolean {
    const w = level.world;
    if (!isValidEmptySpawnBlock(w.getState(x, y, z))) return false;
    // vanilla checkPatrollingMonsterSpawnRules: dark enough by block light, then checkAnyLightMonsterSpawnRules
    if ((w.getLight(x, y, z) & 15) > 8) return false;
    if (level.difficulty === 'peaceful' || !validSpawnBlock(level, x, y - 1, z)) return false;
    const m = new Pillager(level);
    // (as vanilla, the captain picks its target before it's put in place: somewhere within 500 blocks of 0, 0, 0)
    if (leader) {
      m.patrolLeader = true;
      m.findPatrolTarget();
    }
    // (vanilla setPos: the block's corner)
    m.moveTo(x, y, z, 0, 0);
    m.finalizeSpawn('patrol');
    level.addEntity(m);
    return true;
  }
}
