// Monster spawner logic (vanilla BaseSpawner serverTick + clientTick) for
// SpawnerBlockEntity: an active spawner spins its mob, puffs smoke and flame,
// and every 200-799 ticks tries 4 spawns within 4 blocks while a player is
// within 16 blocks and fewer than 6 of that mob are near.

import type { Level } from './level';
import type { SpawnerBlockEntity } from '../world/blockEntity';
import { createMob } from './spawner';
import type { Mob } from '../entity/mob';
import { Monster } from '../entity/monsters';
import { Silverfish } from '../entity/silverfish';
import { Animal } from '../entity/animals';
import { WaterAnimal } from '../entity/water';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER } from '../world/block';

export const MIN_SPAWN_DELAY = 200;
const MAX_SPAWN_DELAY = 800;
const SPAWN_COUNT = 4;
const MAX_NEARBY_ENTITIES = 6;
const REQUIRED_PLAYER_RANGE = 16;
const SPAWN_RANGE = 4;

/** vanilla Level.hasNearbyAlivePlayer (spectators don't count) */
function isNearPlayer(level: Level, be: SpawnerBlockEntity): boolean {
  const p = level.player;
  if (!p || !p.isAlive || p.gameMode === 'spectator') return false;
  return p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) < REQUIRED_PLAYER_RANGE * REQUIRED_PLAYER_RANGE;
}

/** vanilla BaseSpawner.delay: next attempt in 200-799 ticks; the client countdown restarts at 200 */
function delay(level: Level, be: SpawnerBlockEntity): void {
  be.spawnDelay = MIN_SPAWN_DELAY + level.random.nextInt(MAX_SPAWN_DELAY - MIN_SPAWN_DELAY);
  be.clientDelay = MIN_SPAWN_DELAY;
}

/**
 * vanilla SpawnPlacements.checkSpawnRules with EntitySpawnReason.SPAWNER: monsters skip the darkness
 * test and the floor check (the walk-target check in Mob.checkSpawnRules still keeps them to light <= 11)
 */
// (trial chambers) exported: a trial spawner checks the same rules (vanilla EntitySpawnReason.TRIAL_SPAWNER)
export function spawnRulesOk(level: Level, mob: Mob, x: number, y: number, z: number): boolean {
  // (vanilla Silverfish.checkSilverfishSpawnRules: none right next to a survival player)
  if (mob instanceof Silverfish) return Silverfish.checkSpawnRules(level, x, y, z, true);
  if (mob instanceof Monster) return level.difficulty !== 'peaceful';
  if (mob instanceof WaterAnimal) return (FLAGS[level.world.getState(x, y, z)] & F_WATER) !== 0;
  if (mob instanceof Animal) return BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name === 'grass_block' && level.rawBrightness(x, y, z, 0) > 8;
  return true;
}

export function tickSpawner(be: SpawnerBlockEntity, level: Level): void {
  const near = isNearPlayer(level, be);
  const r = level.random;
  // --- client: spin and puff while a player is near
  if (!near) be.oSpin = be.spin;
  else if (be.entityId) {
    const px = be.x + r.nextDouble(), py = be.y + r.nextDouble(), pz = be.z + r.nextDouble();
    level.particles.spawn?.('smoke', px, py, pz, 0, 0, 0);
    level.particles.spawn?.('flame', px, py, pz, 0, 0, 0);
    if (be.clientDelay > 0) be.clientDelay--;
    be.oSpin = be.spin;
    be.spin = (be.spin + 1000 / (be.clientDelay + 200)) % 360;
  }
  // --- server
  if (!near) return;
  if (be.spawnDelay === -1) delay(level, be);
  if (be.spawnDelay > 0) {
    be.spawnDelay--;
    return;
  }
  let spawned = false;
  for (let i = 0; i < SPAWN_COUNT; i++) {
    const type = be.entityId;
    const mob = type ? createMob(type, level) : null;
    if (!mob) {
      delay(level, be);
      return;
    }
    const x = be.x + (r.nextDouble() - r.nextDouble()) * SPAWN_RANGE + 0.5;
    const y = be.y + r.nextInt(3) - 1;
    const z = be.z + (r.nextDouble() - r.nextDouble()) * SPAWN_RANGE + 0.5;
    mob.moveTo(x, y, z, 0, 0);
    if (mob.collisionBoxes(mob.bb).length) continue;
    if (!spawnRulesOk(level, mob, Math.floor(x), Math.floor(y), Math.floor(z))) continue;
    // vanilla: same-class entities in the spawner's block box grown by the spawn range
    let nearby = 0;
    for (const e of level.entities) {
      if (e.removed || e.constructor !== mob.constructor) continue;
      if (e.bb.maxX > be.x - SPAWN_RANGE && e.bb.minX < be.x + 1 + SPAWN_RANGE && e.bb.maxY > be.y - SPAWN_RANGE && e.bb.minY < be.y + 1 + SPAWN_RANGE && e.bb.maxZ > be.z - SPAWN_RANGE && e.bb.minZ < be.z + 1 + SPAWN_RANGE) nearby++;
    }
    if (nearby >= MAX_NEARBY_ENTITIES) {
      delay(level, be);
      return;
    }
    mob.moveTo(x, y, z, r.nextFloat() * 360, 0);
    mob.bodyYaw = mob.headYaw = mob.yaw;
    if (!mob.checkSpawnRules() || !mob.checkSpawnObstruction()) continue;
    mob.finalizeSpawn('spawner');
    level.addEntity(mob);
    // vanilla level event 2004 (PARTICLES_MOBBLOCK_SPAWN) and Mob.spawnAnim
    for (let k = 0; k < 20; k++) {
      const sx = be.x + 0.5 + (r.nextDouble() - 0.5) * 2, sy = be.y + 0.5 + (r.nextDouble() - 0.5) * 2, sz = be.z + 0.5 + (r.nextDouble() - 0.5) * 2;
      level.particles.spawn?.('smoke', sx, sy, sz, 0, 0, 0);
      level.particles.spawn?.('flame', sx, sy, sz, 0, 0, 0);
    }
    level.particles.poof?.(mob);
    spawned = true;
  }
  if (spawned) delay(level, be);
}
