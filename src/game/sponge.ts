// Sponges (Stage 5: ocean; vanilla SpongeBlock and WetSpongeBlock) and the sea lantern's crystals.
//
// A dry sponge, set down or with something changing next to it, soaks up the water round it: a breadth-first walk
// through the water from the sponge, six steps at most, taking up to 65 blocks (the sponge among them) — water
// blocks, the water in waterlogged blocks, and the kelp and seagrass growing in it (dropping what they drop). If it
// took any, it's a wet sponge. A wet sponge drips, and set down in the Nether (an ultra-warm dimension) it steams
// dry at once; a furnace dries it too (its recipe is inventory/recipes.ts, the bucket it fills world/blockEntity.ts).

import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { blockDrops } from './blockRules';
import { ItemEntity } from '../entity/itemEntity';
import { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_OPAQUE, FACE_OCC, S } from '../world/block';
import type { Rand } from '../core/rng';

/** vanilla SpongeBlock.MAX_DEPTH / MAX_COUNT (+1: BlockPos.breadthFirstTraversal counts the sponge itself) */
const MAX_DEPTH = 6, MAX_COUNT = 65;
const DIRS: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
/** vanilla: the plants that live in water, pulled up with it */
const WATER_PLANTS = new Set(['kelp', 'kelp_plant', 'seagrass', 'tall_seagrass']);

/**
 * vanilla BlockPos.breadthFirstTraversal: visits each position once, nearest first; `action` says whether to take it
 * (and go on from it) or skip it. Returns how many were taken — at most `maxCount`.
 */
function breadthFirstTraversal(x0: number, y0: number, z0: number, maxDepth: number, maxCount: number, action: (x: number, y: number, z: number) => boolean): number {
  const queue: [number, number, number, number][] = [[x0, y0, z0, 0]];
  const seen = new Set<string>();
  let taken = 0;
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z, d] = queue[head];
    const k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!action(x, y, z)) continue;
    if (++taken >= maxCount) return taken;
    if (d < maxDepth) for (const [dx, dy, dz] of DIRS) queue.push([x + dx, y + dy, z + dz, d + 1]);
  }
  return taken;
}

/** vanilla SpongeBlock.removeWaterBreadthFirstSearch: true if it took any water */
function removeWater(level: Level, x0: number, y0: number, z0: number): boolean {
  return (
    breadthFirstTraversal(x0, y0, z0, MAX_DEPTH, MAX_COUNT, (x, y, z) => {
      if (x === x0 && y === y0 && z === z0) return true;
      const st = level.world.getState(x, y, z);
      if (!(FLAGS[st] & F_WATER)) return false;
      const b = BLOCKS[STATE_BLOCK[st]];
      // vanilla BucketPickup: a waterlogged block gives up its water; water itself goes (LiquidBlock: flowing too)
      if (b.propIndex('waterlogged') >= 0 && b.get(st, 'waterlogged') === true) {
        level.setBlock(x, y, z, b.with(st, 'waterlogged', false));
        return true;
      }
      if (b.name === 'water') {
        level.setBlock(x, y, z, 0);
        return true;
      }
      if (!WATER_PLANTS.has(b.name)) return false;
      // vanilla Block.dropResources: what the plant drops without a tool
      for (const s of blockDrops(st, null, level.random)) ItemEntity.drop(level, x, y, z, s);
      level.setBlock(x, y, z, 0);
      return true;
    }) > 1
  );
}

/** vanilla SpongeBlock.tryAbsorbWater */
function tryAbsorbWater(level: Level, x: number, y: number, z: number): void {
  if (!removeWater(level, x, y, z)) return;
  level.setBlock(x, y, z, S('wet_sponge'), 2);
  level.sound.play('block.sponge.absorb', x + 0.5, y + 0.5, z + 0.5, 1, 1);
}

registerBehavior('sponge', {
  onPlace: (level, x, y, z, state, old) => {
    if (STATE_BLOCK[old] !== STATE_BLOCK[state]) tryAbsorbWater(level, x, y, z);
  },
  neighborChanged: (level, x, y, z) => tryAbsorbWater(level, x, y, z),
});

registerBehavior('wet_sponge', {
  // vanilla WetSpongeBlock.onPlace: in an ultra-warm dimension it dries out at once (level event 2009: steam)
  onPlace: (level, x, y, z) => {
    if (!level.world.dim.ultraWarm) return;
    level.setBlock(x, y, z, S('sponge'));
    // (vanilla's CLOUD puffs; the nearest particle here is the poof)
    for (let i = 0; i < 8; i++) level.particles.spawn?.('poof', x + Math.random(), y + 1.2, z + Math.random(), 0, 0, 0);
    level.sound.play('block.wet_sponge.dries', x + 0.5, y + 0.5, z + 0.5, 1, (1 + level.random.nextFloat() * 0.2) * 0.7);
  },
  // vanilla WetSpongeBlock.animateTick: water drips from a side (or the bottom) that isn't covered
  animateTick: (level, x, y, z) => {
    const r = level.random;
    const d = r.nextInt(6);
    if (d === 1) return; // (up: nothing)
    const [dx, dy, dz] = DIRS[d];
    const n = level.world.getState(x + dx, y + dy, z + dz);
    // (the sponge is a full cube: only a face left open drips)
    const face = d === 0 ? 1 : d === 2 ? 3 : d === 3 ? 2 : d === 4 ? 5 : 4;
    if (FLAGS[n] & F_OPAQUE && (FACE_OCC[n] >> face) & 1) return;
    let px = x, py = y, pz = z;
    if (d === 0) {
      py -= 0.05;
      px += r.nextDouble();
      pz += r.nextDouble();
    } else {
      py += r.nextDouble() * 0.8;
      if (dx !== 0) {
        pz += r.nextDouble();
        px += dx > 0 ? 1 : 0.05;
      } else {
        px += r.nextDouble();
        pz += dz > 0 ? 1 : 0.05;
      }
    }
    level.particles.spawn?.('dripping_water', px, py, pz, 0, 0, 0);
  },
});

/** vanilla sea_lantern loot: with silk touch itself, else 2-3 prismarine crystals (fortune adds, 5 at most) */
registerBehavior('sea_lantern', {
  drops: (_state, _tool, r: Rand, silk, fortune) => {
    if (silk) return [ItemStack.of('sea_lantern')];
    const n = 2 + r.nextInt(2) + (fortune > 0 ? r.nextInt(fortune + 1) : 0);
    return [ItemStack.of('prismarine_crystals', Math.max(1, Math.min(5, n)))];
  },
});
