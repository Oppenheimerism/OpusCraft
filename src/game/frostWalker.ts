// Frost Walker (vanilla enchantment.frost_walker and FrostedIceBlock). Walking on the ground in Frost Walker boots
// (not riding), each step to another block freezes the still water around it, one block down, into frosted ice: every
// water source with air over it and nothing standing in it within 2 + the level of it (LivingEntity.tickFeetEnchantments
// calls in here). The ice melts back from the edges: in 3 to 6 seconds it's ticked, and then every 1 to 2 seconds,
// ageing 0 to 3 and melting after — but only if enough light reaches it (so not at night far from a torch), with fewer
// than 4 more of it around it or 1 time in 3. Melting takes its frosted neighbours on a stage, and one left with fewer
// than 2 of them beside it goes too. Broken (without silk touch) it's water again; nothing drops. The boots also keep
// the feet from burning on a magma block or a campfire (in LivingEntity.hurt) — and the magma block's hot floor, which
// hurts anything alive standing on it that isn't stepping carefully (sneaking), is here too.

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, OPACITY, getBlock } from '../world/block';
import { LivingEntity, FEET_HOOKS } from '../entity/living';
import { AABB } from '../core/aabb';
import { registerBehavior } from './blockBehavior';
import type { Level } from './level';

const FROSTED_ICE = getBlock('frosted_ice');
const WATER = getBlock('water');
/** vanilla Entity.blocksBuilding (besides anything alive) */
const BLOCKS_BUILDING = /^(tnt|falling_block|end_crystal|.*minecart|.*_boat|.*_raft)$/;
/** vanilla Mth.nextInt(random, a, b): a to b, both ends included */
const between = (level: Level, a: number, b: number): number => a + level.random.nextInt(b - a + 1);

/** a water source (the block itself water, not something waterlogged) */
function isWaterSource(st: number): boolean {
  return STATE_BLOCK[st] === WATER.id && WATER.get<number>(st, 'level') === 0;
}

/**
 * vanilla ReplaceDisk (enchantment.frost_walker's location_changed): radius 2 + level, one block down, the blocks whose
 * centres are nearer its feet than that; each a water source with air over it and unobstructed turns to frosted ice
 * (age 0), which a block_place game event and (as vanilla FrostWalkerEnchantment did) its first tick 60 to 120 on
 */
FEET_HOOKS.frostWalk = (e: LivingEntity, lvl: number): void => {
  const level = e.level;
  const w = level.world;
  const r = Math.min(16, 2 + lvl);
  const cx = Math.floor(e.x), y = Math.floor(e.y) - 1, cz = Math.floor(e.z);
  const ice = FROSTED_ICE.defaultState;
  for (let x = cx - r; x <= cx + r; x++)
    for (let z = cz - r; z <= cz + r; z++) {
      if ((x + 0.5 - e.x) ** 2 + (z + 0.5 - e.z) ** 2 >= r * r) continue;
      if (!(FLAGS[w.getState(x, y + 1, z)] & F_AIR) || !isWaterSource(w.getState(x, y, z))) continue;
      // vanilla unobstructed: nothing that blocks building stands in it
      const cell = new AABB(x, y, z, x + 1, y + 1, z + 1);
      if (level.getEntities(cell, (o) => !o.removed && (o instanceof LivingEntity || BLOCKS_BUILDING.test(o.type))).length) continue;
      level.setBlock(x, y, z, ice);
      level.gameEvent('block_place', x + 0.5, y + 0.5, z + 0.5, { entity: e, state: ice });
      level.scheduleBlockTick(x, y, z, FROSTED_ICE.id, between(level, 60, 120));
    }
};

/** vanilla FrostedIceBlock.fewerNeigboursThan: fewer than `n` of the six blocks around are frosted ice */
function fewerNeighboursThan(level: Level, x: number, y: number, z: number, n: number): boolean {
  let count = 0;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    if (STATE_BLOCK[level.world.getState(x + dx, y + dy, z + dz)] === FROSTED_ICE.id && ++count >= n) return false;
  }
  return true;
}

/** vanilla IceBlock.melt: water again (and its neighbours told), or nothing at all in an ultrawarm dimension */
function melt(level: Level, x: number, y: number, z: number): void {
  if (level.world.dim.ultraWarm) level.setBlock(x, y, z, BLOCKS[0].defaultState);
  else {
    level.setBlock(x, y, z, WATER.defaultState);
    level.neighborChanged(x, y, z, WATER.id, x, y, z);
  }
}

/** vanilla FrostedIceBlock.slightlyMelt: a stage older (quietly), or melted from age 3; true when it melted */
function slightlyMelt(level: Level, x: number, y: number, z: number, st: number): boolean {
  const age = FROSTED_ICE.get<number>(st, 'age');
  if (age < 3) {
    // (vanilla setBlock flag 2: the clients hear, the neighbours don't)
    level.setBlock(x, y, z, FROSTED_ICE.with(st, 'age', age + 1), 2);
    return false;
  }
  melt(level, x, y, z);
  return true;
}

/**
 * vanilla FrostedIceBlock.tick: 1 time in 3, or with fewer than 4 of it around, if the light there is over 11 less its
 * age and its light block, a stage older; melting, its frosted neighbours each a stage older too (the ones that don't
 * melt ticked again 1 to 2 seconds on). Otherwise it's ticked again 1 to 2 seconds on.
 */
function tick(level: Level, x: number, y: number, z: number, st: number): void {
  const age = FROSTED_ICE.get<number>(st, 'age');
  const r = level.random;
  if ((r.nextInt(3) === 0 || fewerNeighboursThan(level, x, y, z, 4)) && level.rawBrightness(x, y, z) > 11 - age - OPACITY[st] && slightlyMelt(level, x, y, z, st)) {
    for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const ns = level.world.getState(nx, ny, nz);
      if (STATE_BLOCK[ns] === FROSTED_ICE.id && !slightlyMelt(level, nx, ny, nz, ns)) level.scheduleBlockTick(nx, ny, nz, FROSTED_ICE.id, between(level, 20, 40));
    }
  } else level.scheduleBlockTick(x, y, z, FROSTED_ICE.id, between(level, 20, 40));
}

registerBehavior('frosted_ice', {
  tick,
  // vanilla FrostedIceBlock.randomTick: as its own tick
  randomTick: tick,
  // vanilla FrostedIceBlock.neighborChanged: frosted ice beside it gone, and fewer than 2 of it left around, it melts
  neighborChanged(level, x, y, z, _st, source) {
    if (source === FROSTED_ICE.id && fewerNeighboursThan(level, x, y, z, 2)) melt(level, x, y, z);
  },
});

registerBehavior('magma_block', {
  // vanilla MagmaBlock.stepOn: anything alive on it, not stepping carefully (sneaking), is burnt, 1 a time
  stepOn(_level, _x, _y, _z, _st, e) {
    if (e instanceof LivingEntity && !e.isShiftKeyDown()) e.hurt(1, 'hotFloor');
  },
});
