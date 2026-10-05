// Building the wither (vanilla WitherSkullBlock.checkSpawn and canSpawnMob, and the dispenser's wither skeleton skull):
// four soul sand or soul soil blocks in a T (#wither_summon_base_blocks), the stem on air either side, with three
// wither skeleton skulls across the top (on the floor or on walls), standing any way round — the last skull a player
// sets on it (or a dispenser puts there) brings the wither. Not in peaceful. The blocks crumble away (each with its
// breaking sound and dust), and the wither appears where the stem was, charging up (entity/wither.ts); every player
// within 50 blocks of it gets Withering Heights. Setting the blocks by command doesn't count, as in vanilla.

import type { Level } from './level';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { BlockPattern } from './blockPattern';
import { WitherBoss } from '../entity/wither';

const nameOf = (st: number) => BLOCKS[STATE_BLOCK[st]].name;
/** vanilla #wither_summon_base_blocks */
const isBase = (st: number) => nameOf(st) === 'soul_sand' || nameOf(st) === 'soul_soil';
const isSkull = (st: number) => nameOf(st) === 'wither_skeleton_skull' || nameOf(st) === 'wither_skeleton_wall_skull';
const isAir = (st: number) => (FLAGS[st] & F_AIR) !== 0;

/** vanilla getOrCreateWitherFull: "^^^", "###", "~#~" */
const WITHER_FULL = new BlockPattern([['^^^', '###', '~#~']], { '^': isSkull, '#': isBase, '~': isAir });
/** vanilla getOrCreateWitherBase: the T alone (where the skulls go, anything) */
const WITHER_BASE = new BlockPattern([['   ', '###', '~#~']], { '#': isBase, '~': isAir });

/** vanilla level event 2001: the block's breaking sound and dust (none for air) */
function destroyEffect(level: Level, x: number, y: number, z: number, st: number): void {
  if (isAir(st)) return;
  level.particles.blockBreak(x, y, z, st);
  level.sound.play(`block.${BLOCKS[STATE_BLOCK[st]].sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
}

/**
 * vanilla WitherSkullBlock.checkSpawn: the wither skeleton skull at (x, y, z) finishes a wither (not in peaceful):
 * the pattern's blocks cleared (vanilla CarvedPumpkinBlock.clearPatternBlocks), the wither where the stem was, facing
 * along the pattern's forwards axis, charging up; Withering Heights for every player within 50 of it; then the
 * cleared blocks' neighbours told (updatePatternBlocks)
 */
export function checkWitherSpawn(level: Level, x: number, y: number, z: number): WitherBoss | null {
  if (level.isClientSide || level.difficulty === 'peaceful' || !isSkull(level.getState(x, y, z))) return null;
  const m = WITHER_FULL.find(level.world, x, y, z);
  if (!m) return null;
  const w = new WitherBoss(level);
  for (let i = 0; i < m.width; i++)
    for (let j = 0; j < m.height; j++) {
      const [bx, by, bz] = m.at(i, j, 0);
      const st = level.getState(bx, by, bz);
      level.setBlock(bx, by, bz, 0, 2);
      destroyEffect(level, bx, by, bz, st);
    }
  const [px, py, pz] = m.at(1, 2, 0);
  const yaw = m.forwards[0] !== 0 ? 0 : 90;
  w.moveTo(px + 0.5, py + 0.55, pz + 0.5, yaw, 0);
  w.bodyYaw = w.bodyYawO = yaw;
  w.makeInvulnerable();
  // (vanilla CriteriaTriggers.SUMMONED_ENTITY for the players in its box inflated by 50, spectators aside:
  // getEntitiesOfClass's NO_SPECTATORS)
  const near = w.bb.inflate(50);
  for (const p of level.players()) if (p.gameMode !== 'spectator' && near.intersects(p.bb)) level.onPlayerTrigger?.(p, 'summoned_entity', { summoned: 'wither' });
  level.addEntity(w);
  for (let i = 0; i < m.width; i++)
    for (let j = 0; j < m.height; j++) {
      const [bx, by, bz] = m.at(i, j, 0);
      level.updateNeighborsAt(bx, by, bz, 0);
    }
  return w;
}

/**
 * vanilla WitherSkullBlock.canSpawnMob (for a dispenser's skull): not in peaceful, two blocks up from the bottom of
 * the world at least, and the T there to finish
 */
export function canSpawnWither(level: Level, x: number, y: number, z: number): boolean {
  return !level.isClientSide && y >= level.world.dim.minY + 2 && level.difficulty !== 'peaceful' && WITHER_BASE.find(level.world, x, y, z) !== null;
}

for (const name of ['wither_skeleton_skull', 'wither_skeleton_wall_skull']) {
  registerBehavior(name, {
    /** vanilla WitherSkullBlock.setPlacedBy / WitherWallSkullBlock.setPlacedBy: a player's skull may finish a wither */
    setPlacedBy(level, x, y, z) {
      checkWitherSpawn(level, x, y, z);
    },
  });
}
