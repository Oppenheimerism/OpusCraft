// (remaining mobs: the phantom) Insomnia (vanilla PhantomSpawner, one of the Overworld's custom spawners). Every one to
// two minutes, with mob spawning on, monsters allowed (not in peaceful) and the doInsomnia rule on, while the sky is dark
// (at night, or in a thunderstorm), each player who isn't spectating and is out under the open sky at sea level or
// higher may draw phantoms: the likelier the harder the local difficulty (it must beat a roll of up to 3), and only
// after three days awake (72000 ticks since they last lay in a bed or died: Player.timeSinceRest), likelier the longer
// they go on. Then one to four phantoms, one more at most for each step of difficulty (1 on easy, 2 on normal, 3 on
// hard), appear together 20 to 34 blocks over them and up to 10 blocks off to each side, if that spot is open air.

import type { Level } from './level';
import { Phantom } from '../entity/phantom';
import { isValidEmptySpawnBlock } from '../entity/mob';
import { DIFFICULTY_ID } from '../entity/monsters';
import { currentDifficultyAt } from './difficulty';
import { SEA_LEVEL } from '../world/constants';

/** vanilla: three days awake before phantoms may come (PhantomSpawner's 72000 against the time since rest) */
export const INSOMNIA_TICKS = 72000;

export class PhantomSpawner {
  /** ticks to the next try (vanilla nextTick: not saved, so the first try comes as the world loads) */
  nextTick = 0;

  /** vanilla tick (from ServerChunkCache.tickChunks, with mob spawning on): how many phantoms it spawned */
  tick(level: Level, spawnEnemies: boolean): number {
    if (!spawnEnemies || !level.gameRules.doInsomnia) return 0;
    // (vanilla registers it for the overworld only)
    if (level.world.dim.id !== 'overworld') return 0;
    const r = level.random;
    if (--this.nextTick > 0) return 0;
    this.nextTick += (60 + r.nextInt(60)) * 20;
    const sky = level.world.dim.hasSkyLight;
    if (level.skyDarken < 5 && sky) return 0;
    let n = 0;
    for (const p of level.players()) {
      if (p.gameMode === 'spectator') continue;
      const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
      if (sky && (by < SEA_LEVEL || !level.canSeeSky(bx, by, bz))) continue;
      if (!currentDifficultyAt(level, bx, by, bz).isHarderThan(r.nextFloat() * 3)) continue;
      const awake = Math.max(1, Math.min(0x7fffffff, p.timeSinceRest));
      if (r.nextInt(awake) < INSOMNIA_TICKS) continue;
      // (vanilla: above(20 + nextInt(15)), then east(-10 + nextInt(21)), then south(-10 + nextInt(21)))
      const y = by + 20 + r.nextInt(15), x = bx - 10 + r.nextInt(21), z = bz - 10 + r.nextInt(21);
      if (!isValidEmptySpawnBlock(level.world.getState(x, y, z))) continue;
      const count = 1 + r.nextInt(DIFFICULTY_ID[level.difficulty] + 1);
      for (let i = 0; i < count; i++) {
        const ph = new Phantom(level);
        ph.moveTo(x + 0.5, y, z + 0.5, 0, 0);
        ph.finalizeSpawn('natural');
        level.addEntity(ph);
        n++;
      }
    }
    return n;
  }
}
