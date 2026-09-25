// Frogspawn (M9; vanilla FrogspawnBlock). A frog carrying spawn lays it on still water by the shore (entity/frog.ts);
// a player can put it on the water too (vanilla PlaceOnWaterBlockItem: game/interaction.ts). Three to ten minutes
// after it's placed it hatches with a squelch into two to five tadpoles (entity/tadpole.ts), dropped into the water
// below it. It lasts only on still water with nothing liquid where it lies, and a falling block, a piston or anyone's
// hand breaks it at once; it never drops anything.

import { registerBehavior } from './blockBehavior';
import type { Level } from './level';
import type { World } from '../world/world';
import { Tadpole } from '../entity/tadpole';
import { isWaterSource } from '../entity/frog';
import { STATE_BLOCK } from '../world/block';
import { fluidType, FLUID_NONE } from '../world/fluids';

/** vanilla FrogspawnBlock.MIN_TADPOLES_SPAWN, MAX_TADPOLES_SPAWN, DEFAULT_MIN_HATCH_TICK_DELAY and DEFAULT_MAX_HATCH_TICK_DELAY */
const MIN_TADPOLES = 2;
const MAX_TADPOLES = 5;
const MIN_HATCH = 3600;
const MAX_HATCH = 12000;
/** vanilla Tadpole.HITBOX_WIDTH / 2: how near the block's edge a tadpole may come out */
const EDGE = 0.2;

/** vanilla FrogspawnBlock.mayPlaceOn (from canSurvive): still water beneath it, nothing liquid where it lies */
export function frogspawnCanSurvive(world: World, x: number, y: number, z: number): boolean {
  return isWaterSource(world.getState(x, y - 1, z)) && fluidType(world.getState(x, y, z)) === FLUID_NONE;
}

/** vanilla getFrogspawnHatchDelay: RandomSource.nextInt(3600, 12000) */
function hatchDelay(level: Level): number {
  return MIN_HATCH + level.random.nextInt(MAX_HATCH - MIN_HATCH);
}

/**
 * vanilla FrogspawnBlock.hatchFrogspawn: the spawn broken (with its breaking sound and bits), the hatching squelch,
 * and two to five tadpoles half a block down into the water, each somewhere inside the block's middle, facing any
 * way, never to despawn
 */
function hatch(level: Level, x: number, y: number, z: number): void {
  level.destroyBlock(x, y, z, false);
  level.sound.play('block.frogspawn.hatch', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  const r = level.random;
  const n = MIN_TADPOLES + r.nextInt(MAX_TADPOLES + 1 - MIN_TADPOLES);
  const offset = () => Math.min(1 - EDGE, Math.max(EDGE, r.nextDouble()));
  for (let j = 1; j <= n; j++) {
    const t = new Tadpole(level);
    const tx = x + offset(), tz = z + offset();
    const yaw = 1 + r.nextInt(360);
    t.moveTo(tx, y - 0.5, tz, yaw, 0);
    t.persistenceRequired = true;
    level.addEntity(t);
  }
}

registerBehavior('frogspawn', {
  canSurvive: (world, x, y, z) => frogspawnCanSurvive(world, x, y, z),
  /** vanilla onPlace: its hatching is set for three to ten minutes on */
  onPlace(level, x, y, z, state) {
    level.scheduleBlockTick(x, y, z, STATE_BLOCK[state], hatchDelay(level));
  },
  /**
   * (not vanilla's, whose scheduled ticks are saved with the chunk: here they aren't, and are dropped with a chunk that
   * unloads, so a random tick finds a frogspawn with no hatching due and sets it again)
   */
  randomTick(level, x, y, z, state) {
    if (!level.hasScheduledTick(x, y, z, STATE_BLOCK[state])) level.scheduleBlockTick(x, y, z, STATE_BLOCK[state], hatchDelay(level));
  },
  /** vanilla tick: it hatches (or, left without its water, just breaks) */
  tick(level, x, y, z) {
    if (!frogspawnCanSurvive(level.world, x, y, z)) level.destroyBlock(x, y, z, false);
    else hatch(level, x, y, z);
  },
  /** vanilla entityInside: a falling block breaks it */
  entityInside(level, x, y, z, _st, e) {
    if (e.type === 'falling_block') level.destroyBlock(x, y, z, false);
  },
  /** (vanilla: no loot table, silk touch or not) */
  drops: () => [],
});
