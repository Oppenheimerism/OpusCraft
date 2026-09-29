// Bee nests on trees (remaining mobs: the bee; vanilla BeehiveDecorator). A tree grown with bees gets, at the given
// chance, a bee nest on its trunk just under its leaves (or, leafless, one to three blocks up), facing south out of
// the east, south or west side of the trunk where the nest's spot and the block south of it are air, with two or three
// bees in it that went in up to 30 seconds ago. Vanilla's trees with bees: the plains' and sunflower plains' oaks
// (5%), the forest's, the birch forest's and the old growth birch forest's (0.2%), the flower forest's (2%), the
// meadow's (all of them), the cherry grove's (5%), the mangrove swamp's (1%); and a sapling growing into an oak, a
// birch or a cherry tree with a flower within two blocks of it (5%, game/randomTicks.ts).
// (A nest is put only in the chunk being generated: one whose spot is over the chunk's edge is not a place for it.)

import type { Rand } from '../../core/rng';
import { getBlock, FLAGS, F_AIR } from '../block';
import { type GenContext, W_ANY } from './context';

/** vanilla BeehiveDecorator.WORLDGEN_FACING */
const FACING = 'south';
/** vanilla BeehiveDecorator.SPAWN_DIRECTIONS: the horizontal directions but the one opposite the nest's facing */
const SPAWN_DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0]];

/** vanilla Util.shuffle */
function shuffle<T>(list: T[], r: Rand): void {
  for (let i = list.length; i > 1; i--) {
    const j = r.nextInt(i);
    [list[i - 1], list[j]] = [list[j], list[i - 1]];
  }
}

/**
 * vanilla BeehiveDecorator.place: `logs` and `leaves` the tree's, `probability` the decorator's. The nest's block entity
 * holds its bees (vanilla BeehiveBlockEntity.Occupant.create(random.nextInt(599)): a bee, 600 ticks at least inside)
 */
export function beehiveDecorator(ctx: GenContext, logs: Iterable<readonly number[]>, leaves: Iterable<readonly number[]>, r: Rand, probability: number): void {
  const logList = [...logs];
  if (!logList.length) return;
  if (r.nextFloat() >= probability) return;
  let lowLeaf = Infinity;
  for (const p of leaves) lowLeaf = Math.min(lowLeaf, p[1]);
  let lowLog = Infinity, highLog = -Infinity;
  for (const p of logList) {
    lowLog = Math.min(lowLog, p[1]);
    highLog = Math.max(highLog, p[1]);
  }
  const y = lowLeaf !== Infinity ? Math.max(lowLeaf - 1, lowLog + 1) : Math.min(lowLog + 1 + r.nextInt(3), highLog);
  const spots: [number, number, number][] = [];
  for (const p of logList) if (p[1] === y) for (const [dx, dz] of SPAWN_DIRS) spots.push([p[0] + dx, y, p[2] + dz]);
  if (!spots.length) return;
  shuffle(spots, r);
  const isAir = (x: number, yy: number, z: number): boolean => {
    const s = ctx.get(x, yy, z);
    // (a block in a neighbouring chunk: air unless the terrain there is solid)
    if (s < 0) return !(ctx.solidGuess?.(x, yy, z) ?? false);
    return (FLAGS[s] & F_AIR) !== 0;
  };
  const spot = spots.find(([x, yy, z]) => ctx.inChunk(x, z) && isAir(x, yy, z) && isAir(x, yy, z + 1));
  if (!spot) return;
  const [x, , z] = spot;
  ctx.set(x, y, z, getBlock('bee_nest').state({ facing: FACING, honey_level: 0 }), W_ANY);
  const n = 2 + r.nextInt(2);
  const bees: { entityData: { id: string }; ticksInHive: number; minTicksInHive: number }[] = [];
  for (let k = 0; k < n; k++) bees.push({ entityData: { id: 'bee' }, ticksInHive: r.nextInt(599), minTicksInHive: 600 });
  ctx.blockEntities.push({ id: 'bee_nest', x, y, z, items: [], data: { bees: JSON.stringify(bees) } });
}
