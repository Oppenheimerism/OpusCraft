// Pillager outposts in the running game (Stage 4; the structure itself is world/gen/outposts.ts): the pillagers that
// keep turning up anywhere in an outpost's box (vanilla structure spawn_overrides: monster, bounding_box "full" —
// the whole structure's box, which reaches 12 blocks past its pieces — pillager weight 1, one at a time), /locate
// structure pillager_outpost, and the loot of the chest at the top of the tower.
//
// Where an outpost is comes from the biome noise alone (as /locate village has it), but how high it stands needs the
// terrain the chunk workers generated it on: the first time one is near, the overworld generator is loaded on the
// main thread too (its own chunk of code), and until it's ready the outpost's pillagers don't spawn yet.

import type { Level } from './level';
import { LOOT_TABLES } from './loot';
import { outpostLocator, type PillagerOutposts } from '../world/gen/outposts';

/** vanilla loot_table/chests/pillager_outpost ('' is its empty entry; items the game doesn't have yet roll nothing) */
LOOT_TABLES['chests/pillager_outpost'] = [
  { rolls: [0, 1], entries: [{ item: 'crossbow', weight: 1 }] },
  { rolls: [2, 3], entries: [{ item: 'wheat', weight: 7, count: [3, 5] }, { item: 'carrot', weight: 5, count: [3, 5] }, { item: 'potato', weight: 5, count: [2, 5] }] },
  { rolls: [1, 3], entries: [{ item: 'dark_oak_log', weight: 1, count: [2, 3] }] },
  {
    rolls: [2, 3],
    entries: [
      { item: 'experience_bottle', weight: 7 }, { item: 'string', weight: 4, count: [1, 6] }, { item: 'arrow', weight: 4, count: [2, 7] },
      { item: 'tripwire_hook', weight: 3 }, { item: 'iron_ingot', weight: 3, count: [1, 3] }, { item: 'book', weight: 1, enchant: true },
    ],
  },
  { rolls: [0, 1], entries: [{ item: 'goat_horn', weight: 1 }] },
  { rolls: 1, entries: [{ item: '', weight: 3 }, { item: 'sentry_armor_trim_smithing_template', weight: 1, count: [2, 2] }] },
];

/** vanilla pillager_outpost spawn_overrides.monster: pillagers, one at a time */
const OUTPOST_SPAWNS = [{ type: 'pillager', weight: 1, min: 1, max: 1 }];

interface Runtime {
  seed: string;
  /** where they are (the biome noise only) */
  locator: PillagerOutposts;
  /** laid out on the real terrain, as the workers build them */
  exact: PillagerOutposts | null;
  ready: Promise<void> | null;
}
let rt: Runtime | null = null;

function runtime(level: Level): Runtime {
  if (!rt || rt.seed !== level.seed) rt = { seed: level.seed, locator: outpostLocator(level.seed, level.villages()), exact: null, ready: null };
  return rt;
}

/** the outposts on the real terrain: the overworld generator, loaded the first time it's wanted */
function loadExact(level: Level): Runtime {
  const r = runtime(level);
  r.ready ??= import('../world/gen/generator').then((m) => {
    r.exact = new m.ChunkGenerator(r.seed).outposts;
  });
  return r;
}

/** resolves once the outposts' real heights are known (for tests: spawning just waits for it) */
export function outpostsReady(level: Level): Promise<void> {
  return loadExact(level).ready!;
}

/**
 * vanilla ChunkGenerator.getMobsAt, the structures' spawn_overrides with bounding_box "full": inside an outpost's
 * box, the monsters that spawn are its pillagers (null: no outpost here)
 */
export function outpostSpawnsAt(level: Level, cat: string, x: number, y: number, z: number): typeof OUTPOST_SPAWNS | null {
  if (cat !== 'monster' || level.world.dim.id !== 'overworld') return null;
  if (!runtime(level).locator.hasStartNear(x >> 4, z >> 4)) return null;
  const ex = loadExact(level).exact;
  return ex?.structureAt(x, y, z) ? OUTPOST_SPAWNS : null;
}

/** /locate structure pillager_outpost: the nearest start chunk's corner */
export function locateOutpost(level: Level, x: number, z: number): [number, number] | null {
  return runtime(level).locator.nearest(x, z);
}
